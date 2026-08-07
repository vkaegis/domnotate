// ============================================================
// Domnotate — Output Formatter
// ============================================================

import type { AnnotationSession, Annotation, OutputFormatter, TextEdit } from '@/types/core';
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

export function createOutputFormatter(): OutputFormatter {
  return {
    toMarkdown(session: AnnotationSession): string {
      const total = session.annotations.length;
      const editCount = meaningfulEdits(session).length;
      const date = new Date().toISOString().split('T')[0];

      let md = '';
      md += `# Domnotate Annotations\n`;
      md += `**Source:** ${session.sourceName}\n`;
      md += `**Generated:** ${date}\n`;
      md += `**Annotations:** ${total}\n`;
      md += `**Edits:** ${editCount}\n`;
      md += `\n---\n\n`;

      session.annotations.forEach((a, i) => {
        const heading = elementHeading(a.element);
        md += `## ${i + 1}. ${heading}\n`;

        // A source hint describes the element in terms that survive a
        // production build, so it leads. The selector is a re-anchoring
        // coordinate, not a source address (§3.2), and is demoted below it.
        if (a.sourceHint) {
          md += `\n${formatSourceHint(a.sourceHint)}\n\n`;
        }

        md += `**Selector:** \`${a.element.cssSelector}\`\n`;
        md += `**XPath:** \`${a.element.xpath}\`\n`;
        md += `**DOM Path:** ${a.element.domPath}\n`;
        md += `**Dimensions:** ${a.element.rect.width} x ${a.element.rect.height}\n`;
        const scopeLabel = annotationScopeLabel(a);
        if (scopeLabel) {
          md += `**Scope:** ${scopeLabel}\n`;
        }
        md += `**Text Preview:** "${a.element.textPreview}"\n`;
        md += `\n`;

        if (a.text) {
          md += `> ${a.text}\n`;
        }

        md += `\n---\n\n`;
      });

      md += editsToMarkdown(session);

      return md;
    },

    toCompact(session: AnnotationSession): string {
      let out = `# Annotations: ${session.sourceName} (${session.annotations.length})\n\n`;

      session.annotations.forEach((a, i) => {
        const heading = elementHeading(a.element);
        const selector = a.element.cssSelector;
        const w = Math.round(a.element.rect.width);
        const h = Math.round(a.element.rect.height);
        const scopeLabel = annotationScopeLabel(a);

        // This is the §5 target shape: the hint block carries the ordinal and
        // the note, and the selector trails it as a re-anchoring coordinate.
        if (a.sourceHint) {
          out += `${formatSourceHint(a.sourceHint, { index: i + 1, note: a.text || undefined })}\n`;
          out += `   selector: \`${selector}\`${scopeLabel ? ` [${scopeLabel}]` : ''}\n\n`;
          return;
        }

        out += `${i + 1}. ${heading} \`${selector}\` ${w}x${h}`;
        if (scopeLabel) out += ` [${scopeLabel}]`;
        out += '\n';

        if (a.element.textPreview) {
          out += `   "${a.element.textPreview}"\n`;
        }

        if (a.text) {
          out += `   > ${a.text}\n`;
        }

        out += '\n';
      });

      const editsOut = editsToCompact(session);
      if (editsOut) out += `${editsOut}`;

      return out;
    },

    toJSON(session: AnnotationSession): string {
      return JSON.stringify(session, null, 2);
    },
  };
}
