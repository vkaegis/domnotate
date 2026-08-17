// ============================================================
// Domnotate — Output Formatter
// ============================================================

import type {
  AnnotationSession,
  Annotation,
  OutputFormatter,
  PageRef,
  SourceHint,
  TextEdit,
} from '@/types/core';
import { fallbackScopeLabel } from '@/annotations/view-scope';
import { formatSourceHint } from '@/core/source-hint/format';

function elementHeading(el: { tagName: string; id: string | null; classes: string[] }): string {
  const tag = el.tagName;
  const id = el.id ? `#${el.id}` : '';
  const cls = el.classes.length > 0 ? `.${el.classes[0]}` : '';
  return `${tag}${id}${cls}`;
}

function annotationScopeLabel(a: Annotation): string | null {
  if (a.viewScope) return fallbackScopeLabel(a.viewScope);
  if (a.slideIndex !== undefined) return `Slide ${a.slideIndex + 1}`;
  return null;
}

/**
 * One page of a pass, holding its notes and the number each one carries.
 *
 * The number is the note's position in the whole session, not in its group, so
 * what the agent reads matches the pin the user saw.
 */
interface PageGroup {
  page: PageRef;
  notes: { annotation: Annotation; index: number }[];
}

/**
 * Split a session by the screen each note was taken on.
 *
 * Returns null unless every note names a page and they name more than one
 * between them. A session over one page keeps its original single-source
 * format, and one note without a page falls back rather than being grouped
 * around — dropping a note from the export would be far worse than a flat list.
 */
function pageGroups(session: AnnotationSession): PageGroup[] | null {
  const groups = new Map<string, PageGroup>();

  for (const [index, annotation] of session.annotations.entries()) {
    const page = annotation.capturedOn;
    if (!page) return null;
    const group = groups.get(page.route);
    if (group) group.notes.push({ annotation, index });
    else groups.set(page.route, { page, notes: [{ annotation, index }] });
  }

  if (groups.size < 2) return null;
  return [...groups.values()];
}

function pageHeading(page: PageRef): string {
  return page.title ? `${page.title} — ${page.url}` : page.url;
}

/** A text change that had no real effect is not worth emitting to the agent. */
function isMeaningfulEdit(e: TextEdit): boolean {
  return e.oldHtml !== e.newHtml || e.oldText !== e.newText;
}

function meaningfulEdits(session: AnnotationSession): TextEdit[] {
  return (session.edits ?? []).filter(isMeaningfulEdit);
}

function editsToMarkdown(session: AnnotationSession): string {
  const edits = meaningfulEdits(session);
  if (edits.length === 0) return '';

  let md = '';
  md += `# Text Edits\n`;
  md += `_Apply these text changes to the source. The DOM previews are not saved to the file._\n`;
  md += `\n---\n\n`;

  edits.forEach((e, i) => {
    md += `## Edit ${i + 1} — ${elementHeading(e.element)}\n`;
    md += `**Selector:** \`${e.element.cssSelector}\`\n`;
    if (e.viewScope) {
      md += `**Scope:** ${fallbackScopeLabel(e.viewScope)}\n`;
    }
    md += `\n**Change text from → to:**\n`;
    md += `- from: "${e.oldText}"\n`;
    md += `- to:   "${e.newText}"\n`;
    if (e.oldHtml !== e.oldText || e.newHtml !== e.newText) {
      md += `\n**HTML from → to:**\n`;
      md += '```html\n';
      md += `<!-- from --> ${e.oldHtml}\n`;
      md += `<!-- to -->   ${e.newHtml}\n`;
      md += '```\n';
    }
    md += `\n---\n\n`;
  });

  return md;
}

function editsToCompact(session: AnnotationSession): string {
  const edits = meaningfulEdits(session);
  if (edits.length === 0) return '';

  let out = `# Edits: ${session.sourceName} (${edits.length})\n\n`;
  edits.forEach((e, i) => {
    out += `${i + 1}. ${elementHeading(e.element)} \`${e.element.cssSelector}\``;
    if (e.viewScope) out += ` [${fallbackScopeLabel(e.viewScope)}]`;
    out += '\n';
    out += `   "${e.oldText}" → "${e.newText}"\n\n`;
  });

  return out;
}

/**
 * The hint's own route line, dropped once the note records its page.
 *
 * The two disagree, and `capturedOn` is the one to trust. It is read
 * synchronously at the pick; the hint's route is read in the page's own world
 * when the hint resolves, which is a round trip later, so an app that navigates
 * in between stamps the note with wherever it went. Emitting both would hand an
 * agent a note filed under one screen and labelled with another.
 */
function hintFor(a: Annotation): SourceHint | undefined {
  if (!a.sourceHint || !a.capturedOn) return a.sourceHint;
  return { ...a.sourceHint, signals: a.sourceHint.signals.filter((s) => s.kind !== 'route') };
}

/** One annotation in the full markdown form. `n` is its number in the session. */
function annotationToMarkdown(a: Annotation, n: number): string {
  // When a hint is present it *is* the description, and the raw DOM fields
  // below only restate the same tree in three more formats. The full descriptor
  // still round-trips through the JSON export, which is what re-anchoring
  // reads; this is the agent-facing view.
  const hint = hintFor(a);
  if (hint) {
    let md = `${formatSourceHint(hint, { index: n, note: a.text || undefined })}\n`;
    md += `   selector: \`${a.element.cssSelector}\`\n`;
    const scope = annotationScopeLabel(a);
    if (scope) md += `   scope: ${scope}\n`;
    return `${md}\n---\n\n`;
  }

  let md = `## ${n}. ${elementHeading(a.element)}\n`;
  md += `**Selector:** \`${a.element.cssSelector}\`\n`;
  md += `**XPath:** \`${a.element.xpath}\`\n`;
  md += `**DOM Path:** ${a.element.domPath}\n`;
  md += `**Dimensions:** ${a.element.rect.width} x ${a.element.rect.height}\n`;
  const scopeLabel = annotationScopeLabel(a);
  if (scopeLabel) md += `**Scope:** ${scopeLabel}\n`;
  md += `**Text Preview:** "${a.element.textPreview}"\n`;
  md += `\n`;
  if (a.text) md += `> ${a.text}\n`;
  return `${md}\n---\n\n`;
}

/** One annotation in the compact form. `n` is its number in the session. */
function annotationToCompact(a: Annotation, n: number): string {
  const selector = a.element.cssSelector;
  const scopeLabel = annotationScopeLabel(a);

  // This is the §5 target shape: the hint block carries the ordinal and the
  // note, and the selector trails it as a re-anchoring coordinate.
  const hint = hintFor(a);
  if (hint) {
    let out = `${formatSourceHint(hint, { index: n, note: a.text || undefined })}\n`;
    out += `   selector: \`${selector}\`${scopeLabel ? ` [${scopeLabel}]` : ''}\n\n`;
    return out;
  }

  const w = Math.round(a.element.rect.width);
  const h = Math.round(a.element.rect.height);
  let out = `${n}. ${elementHeading(a.element)} \`${selector}\` ${w}x${h}`;
  if (scopeLabel) out += ` [${scopeLabel}]`;
  out += '\n';
  if (a.element.textPreview) out += `   "${a.element.textPreview}"\n`;
  if (a.text) out += `   > ${a.text}\n`;
  return `${out}\n`;
}

export function createOutputFormatter(): OutputFormatter {
  return {
    toMarkdown(session: AnnotationSession): string {
      const total = session.annotations.length;
      const editCount = meaningfulEdits(session).length;
      const date = new Date().toISOString().split('T')[0];
      const groups = pageGroups(session);

      let md = '';
      md += `# Domnotate Annotations\n`;
      md += `**Source:** ${session.sourceName}\n`;
      md += `**Generated:** ${date}\n`;
      md += `**Annotations:** ${total}\n`;
      md += `**Edits:** ${editCount}\n`;
      if (groups) md += `**Pages:** ${groups.length}\n`;
      md += `\n---\n\n`;

      if (groups) {
        for (const group of groups) {
          md += `# Page: ${pageHeading(group.page)}\n`;
          md += `**Annotations on this page:** ${group.notes.length}\n`;
          md += `\n---\n\n`;
          for (const { annotation, index } of group.notes) {
            md += annotationToMarkdown(annotation, index + 1);
          }
        }
      } else {
        session.annotations.forEach((a, i) => {
          md += annotationToMarkdown(a, i + 1);
        });
      }

      md += editsToMarkdown(session);

      return md;
    },

    toCompact(session: AnnotationSession): string {
      const groups = pageGroups(session);
      let out = `# Annotations: ${session.sourceName} (${session.annotations.length})\n\n`;

      if (groups) {
        for (const group of groups) {
          out += `## Page: ${pageHeading(group.page)}\n\n`;
          for (const { annotation, index } of group.notes) {
            out += annotationToCompact(annotation, index + 1);
          }
        }
      } else {
        session.annotations.forEach((a, i) => {
          out += annotationToCompact(a, i + 1);
        });
      }

      const editsOut = editsToCompact(session);
      if (editsOut) out += `${editsOut}`;

      return out;
    },

    toJSON(session: AnnotationSession): string {
      return JSON.stringify(session, null, 2);
    },
  };
}
