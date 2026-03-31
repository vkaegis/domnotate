import { describe, test, expect } from 'vitest';
import { createOutputFormatter } from '@/output/formatter';
import { makeSession, makeAnnotation, makeDescriptor } from '@/__tests__/fixtures';

const fmt = createOutputFormatter();

describe('OutputFormatter', () => {
  describe('toMarkdown', () => {
    test('empty annotations', () => {
      const session = makeSession();
      const md = fmt.toMarkdown(session);
      expect(md).toContain('# Domnotate Annotations');
      expect(md).toContain('**Annotations:** 0');
      expect(md).toContain(session.sourceName);
    });

    test('single annotation with text', () => {
      const ann = makeAnnotation({ text: 'Fix this layout' });
      const session = makeSession({ annotations: [ann] });
      const md = fmt.toMarkdown(session);
      expect(md).toContain('**Annotations:** 1');
      expect(md).toContain('> Fix this layout');
      expect(md).toContain(ann.element.cssSelector);
      expect(md).toContain(ann.element.xpath);
    });

    test('multiple annotations numbered correctly', () => {
      const session = makeSession({ annotations: [makeAnnotation(), makeAnnotation(), makeAnnotation()] });
      const md = fmt.toMarkdown(session);
      expect(md).toContain('## 1.');
      expect(md).toContain('## 2.');
      expect(md).toContain('## 3.');
    });

    test('annotation with no text omits blockquote', () => {
      const ann = makeAnnotation({ text: '' });
      const session = makeSession({ annotations: [ann] });
      const md = fmt.toMarkdown(session);
      // Blockquote lines start with "> " followed by annotation text
      const blockquoteLines = md.split('\n').filter(l => l.startsWith('> '));
      expect(blockquoteLines).toHaveLength(0);
    });

    test('element heading includes id when present', () => {
      const ann = makeAnnotation({ element: makeDescriptor({ id: 'main', tagName: 'div' }) });
      const session = makeSession({ annotations: [ann] });
      const md = fmt.toMarkdown(session);
      expect(md).toContain('div#main');
    });

    test('element heading includes first class when present', () => {
      const ann = makeAnnotation({ element: makeDescriptor({ id: null, classes: ['hero', 'banner'], tagName: 'section' }) });
      const session = makeSession({ annotations: [ann] });
      const md = fmt.toMarkdown(session);
      expect(md).toContain('section.hero');
    });
  });

  describe('toCompact', () => {
    test('empty annotations', () => {
      const session = makeSession();
      const out = fmt.toCompact(session);
      expect(out).toContain('(0)');
    });

    test('dimensions are rounded', () => {
      const ann = makeAnnotation({
        element: makeDescriptor({ rect: { x: 0, y: 0, width: 100.7, height: 49.3 } }),
      });
      const session = makeSession({ annotations: [ann] });
      const out = fmt.toCompact(session);
      expect(out).toContain('101x49');
    });

    test('includes text preview and annotation text', () => {
      const ann = makeAnnotation({
        element: makeDescriptor({ textPreview: 'Hello world' }),
        text: 'Check this',
      });
      const session = makeSession({ annotations: [ann] });
      const out = fmt.toCompact(session);
      expect(out).toContain('"Hello world"');
      expect(out).toContain('> Check this');
    });

    test('empty textPreview omits preview line', () => {
      const ann = makeAnnotation({
        element: makeDescriptor({ textPreview: '' }),
        text: '',
      });
      const session = makeSession({ annotations: [ann] });
      const out = fmt.toCompact(session);
      // Should not have a quoted preview line
      const lines = out.split('\n');
      const previewLines = lines.filter(l => l.match(/^\s+"/));
      expect(previewLines).toHaveLength(0);
    });
  });

  describe('toJSON', () => {
    test('returns valid JSON matching session', () => {
      const session = makeSession({ annotations: [makeAnnotation()] });
      const json = fmt.toJSON(session);
      const parsed = JSON.parse(json);
      expect(parsed).toEqual(session);
    });

    test('empty session round-trips', () => {
      const session = makeSession();
      const json = fmt.toJSON(session);
      expect(JSON.parse(json)).toEqual(session);
    });
  });
});
