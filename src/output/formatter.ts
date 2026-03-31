// ============================================================
// Domnotate — Output Formatter
// ============================================================

import type { AnnotationSession, Annotation, OutputFormatter } from '@/types/core';

function elementHeading(a: Annotation): string {
  const tag = a.element.tagName;
  const id = a.element.id ? `#${a.element.id}` : '';
  const cls = a.element.classes.length > 0 ? `.${a.element.classes[0]}` : '';
  return `${tag}${id}${cls}`;
}

export function createOutputFormatter(): OutputFormatter {
  return {
    toMarkdown(session: AnnotationSession): string {
      const total = session.annotations.length;
      const date = new Date().toISOString().split('T')[0];

      let md = '';
      md += `# Domnotate Annotations\n`;
      md += `**Source:** ${session.sourceName}\n`;
      md += `**Generated:** ${date}\n`;
      md += `**Annotations:** ${total}\n`;
      md += `\n---\n\n`;

      session.annotations.forEach((a, i) => {
        const heading = elementHeading(a);
        md += `## ${i + 1}. ${heading}\n`;
        md += `**Selector:** \`${a.element.cssSelector}\`\n`;
        md += `**XPath:** \`${a.element.xpath}\`\n`;
        md += `**DOM Path:** ${a.element.domPath}\n`;
        md += `**Dimensions:** ${a.element.rect.width} x ${a.element.rect.height}\n`;
        md += `**Text Preview:** "${a.element.textPreview}"\n`;
        md += `\n`;

        if (a.text) {
          md += `> ${a.text}\n`;
        }

        md += `\n---\n\n`;
      });

      return md;
    },

    toJSON(session: AnnotationSession): string {
      return JSON.stringify(session, null, 2);
    },
  };
}
