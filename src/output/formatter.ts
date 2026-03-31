// ============================================================
// Domnotate — Output Formatter (Module 5)
// ============================================================

import type { AnnotationSession, Annotation, Comment, OutputFormatter } from '@/types/core';

function relativeTime(isoDate: string): string {
  const now = Date.now();
  const then = new Date(isoDate).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 30) return `${diffDay}d ago`;
  return new Date(isoDate).toLocaleDateString();
}

function elementHeading(a: Annotation): string {
  const tag = a.element.tagName;
  const id = a.element.id ? `#${a.element.id}` : '';
  const cls = a.element.classes.length > 0 ? `.${a.element.classes[0]}` : '';
  return `${tag}${id}${cls}`;
}

function renderComments(comments: Comment[], indent: number = 0): string {
  // Build a map of parentId -> children
  const byParent = new Map<string | null, Comment[]>();
  for (const c of comments) {
    const key = c.parentId;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(c);
  }

  function renderLevel(parentId: string | null, depth: number): string {
    const children = byParent.get(parentId) ?? [];
    let out = '';
    for (const c of children) {
      const prefix = '  '.repeat(depth) + '- ';
      out += `${prefix}**${c.authorName}** (${relativeTime(c.createdAt)}): ${c.text}\n`;
      out += renderLevel(c.id, depth + 1);
    }
    return out;
  }

  return renderLevel(null, indent);
}

function flattenComments(comments: Comment[]): Comment[] {
  // Topological sort: parents before children
  const byParent = new Map<string | null, Comment[]>();
  for (const c of comments) {
    const key = c.parentId;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(c);
  }
  const result: Comment[] = [];
  function walk(parentId: string | null) {
    for (const c of byParent.get(parentId) ?? []) {
      result.push(c);
      walk(c.id);
    }
  }
  walk(null);
  return result;
}

export function createOutputFormatter(): OutputFormatter {
  return {
    toMarkdown(session: AnnotationSession): string {
      const openCount = session.annotations.filter(a => a.status === 'open').length;
      const resolvedCount = session.annotations.filter(a => a.status === 'resolved').length;
      const total = session.annotations.length;
      const date = new Date().toISOString().split('T')[0];

      let md = '';
      md += `# Domnotate Annotations\n`;
      md += `**Source:** ${session.sourceName}\n`;
      md += `**Generated:** ${date}\n`;
      md += `**Annotations:** ${total} (${openCount} open, ${resolvedCount} resolved)\n`;
      md += `\n---\n\n`;

      session.annotations.forEach((a, i) => {
        const heading = elementHeading(a);
        const status = a.status.toUpperCase();
        md += `## ${i + 1}. ${heading} [${status}]\n`;
        md += `**Selector:** \`${a.element.cssSelector}\`\n`;
        md += `**XPath:** \`${a.element.xpath}\`\n`;
        md += `**DOM Path:** ${a.element.domPath}\n`;
        md += `**Dimensions:** ${a.element.rect.width} x ${a.element.rect.height}\n`;
        md += `**Text Preview:** "${a.element.textPreview}"\n`;
        md += `\n`;

        if (a.comments.length > 0) {
          md += `### Comments\n`;
          md += renderComments(a.comments);
        }

        md += `\n---\n\n`;
      });

      return md;
    },

    toCompact(session: AnnotationSession): string {
      const openCount = session.annotations.filter(a => a.status === 'open').length;
      const resolvedCount = session.annotations.filter(a => a.status === 'resolved').length;

      // Build header
      const counts: string[] = [];
      if (openCount > 0) counts.push(`${openCount} open`);
      if (resolvedCount > 0) counts.push(`${resolvedCount} resolved`);
      let out = `# Annotations: ${session.sourceName} (${counts.join(', ')})\n\n`;

      // Detect if all authors are the same — if so, skip author names
      const allAuthors = new Set<string>();
      for (const a of session.annotations) {
        for (const c of a.comments) {
          allAuthors.add(c.authorName);
        }
      }
      const skipAuthor = allAuthors.size <= 1;

      session.annotations.forEach((a, i) => {
        const heading = elementHeading(a);
        const selector = a.element.cssSelector;
        const w = Math.round(a.element.rect.width);
        const h = Math.round(a.element.rect.height);
        const status = a.status.toUpperCase();

        out += `${i + 1}. ${heading} \`${selector}\` ${w}x${h} ${status}\n`;

        // Text preview (truncated)
        if (a.element.textPreview) {
          out += `   "${a.element.textPreview}"\n`;
        }

        // Flatten comments — simple indented > prefix
        if (a.comments.length > 0) {
          for (const c of flattenComments(a.comments)) {
            if (skipAuthor) {
              out += `   > ${c.text}\n`;
            } else {
              out += `   > ${c.authorName}: ${c.text}\n`;
            }
          }
        }

        out += '\n';
      });

      return out;
    },

    toJSON(session: AnnotationSession): string {
      return JSON.stringify(session, null, 2);
    },
  };
}
