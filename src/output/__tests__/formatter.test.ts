import { describe, test, expect } from 'vitest';
import { createOutputFormatter } from '@/output/formatter';
import {
  makeSession,
  makeAnnotation,
  makeDescriptor,
  makePageRef,
  makeViewScope,
  makeTextEdit,
} from '@/__tests__/fixtures';

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

    test('includes readable view scope label when present', () => {
      const ann = makeAnnotation({
        viewScope: makeViewScope({ kind: 'tabpanel', label: 'Why now', index: 1 }),
      });
      const session = makeSession({ annotations: [ann] });
      const md = fmt.toMarkdown(session);
      expect(md).toContain('**Scope:** Why now');
    });

    test('includes legacy slide scope label without viewScope', () => {
      const ann = makeAnnotation({ slideIndex: 2 });
      const session = makeSession({ annotations: [ann] });
      const md = fmt.toMarkdown(session);
      expect(md).toContain('**Scope:** Slide 3');
    });

    test('omits scope line for unscoped annotations', () => {
      const ann = makeAnnotation();
      const session = makeSession({ annotations: [ann] });
      const md = fmt.toMarkdown(session);
      expect(md).not.toContain('**Scope:**');
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

    test('includes scope context for scoped annotations only', () => {
      const scoped = makeAnnotation({
        viewScope: makeViewScope({ kind: 'wizard-step', label: 'Account setup', index: 0 }),
      });
      const unscoped = makeAnnotation();
      const session = makeSession({ annotations: [scoped, unscoped] });
      const out = fmt.toCompact(session);
      expect(out).toContain('[Account setup]');
      expect(out).not.toContain('[View');
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

    test('preserves viewScope and transition slideIndex fields', () => {
      const viewScope = makeViewScope({
        kind: 'slide',
        id: 'slide-2',
        index: 2,
        label: 'Slide 3',
        selector: '.slide:nth-of-type(3)',
      });
      const session = makeSession({
        annotations: [makeAnnotation({ viewScope, slideIndex: 2 })],
      });

      const parsed = JSON.parse(fmt.toJSON(session));
      expect(parsed.annotations[0].viewScope).toEqual(viewScope);
      expect(parsed.annotations[0].slideIndex).toBe(2);
    });

    test('includes edits array in JSON', () => {
      const edit = makeTextEdit({ oldText: 'a', newText: 'b' });
      const session = makeSession({ edits: [edit] });
      const parsed = JSON.parse(fmt.toJSON(session));
      expect(parsed.edits).toHaveLength(1);
      expect(parsed.edits[0]).toEqual(edit);
    });
  });

  describe('text edits', () => {
    test('omits the edits section when there are none', () => {
      const md = fmt.toMarkdown(makeSession());
      expect(md).not.toContain('# Text Edits');
    });

    test('the top header reports both counts, so it stays relevant for edits-only sessions', () => {
      const md = fmt.toMarkdown(makeSession({ edits: [makeTextEdit({ oldText: 'a', newText: 'b' })] }));
      // Header carries annotation AND edit counts even with zero annotations.
      expect(md).toContain('**Annotations:** 0');
      expect(md).toContain('**Edits:** 1');
    });

    test('markdown renders an edits section with from → to text', () => {
      const edit = makeTextEdit({
        element: makeDescriptor({ tagName: 'p', id: null, classes: ['intro'], cssSelector: 'p.intro' }),
        oldText: 'Welcome to our site',
        newText: 'Welcome to our brand-new site',
        oldHtml: 'Welcome to our site',
        newHtml: 'Welcome to our brand-new site',
      });
      const session = makeSession({ edits: [edit] });
      const md = fmt.toMarkdown(session);

      expect(md).toContain('# Text Edits');
      expect(md).toContain('**Edits:** 1');
      expect(md).toContain('## Edit 1 — p.intro');
      expect(md).toContain('`p.intro`');
      expect(md).toContain('- from: "Welcome to our site"');
      expect(md).toContain('- to:   "Welcome to our brand-new site"');
    });

    test('edit blocks omit XPath (selector + from → to is enough to locate)', () => {
      const edit = makeTextEdit({
        element: makeDescriptor({ cssSelector: '#headline', xpath: '//*[@id="headline"]' }),
      });
      // Edits-only session — any XPath present would come from the edit block.
      const md = fmt.toMarkdown(makeSession({ edits: [edit] }));
      expect(md).not.toContain('XPath');
      expect(md).not.toContain('//*[@id="headline"]');
    });

    test('markdown shows an HTML diff block only when markup changed', () => {
      const textOnly = makeTextEdit({ oldText: 'a', newText: 'b', oldHtml: 'a', newHtml: 'b' });
      const rich = makeTextEdit({
        oldText: 'a', newText: 'b',
        oldHtml: '<strong>a</strong>', newHtml: '<strong>b</strong>',
      });

      const textMd = fmt.toMarkdown(makeSession({ edits: [textOnly] }));
      expect(textMd).not.toContain('**HTML from → to:**');

      const richMd = fmt.toMarkdown(makeSession({ edits: [rich] }));
      expect(richMd).toContain('**HTML from → to:**');
      expect(richMd).toContain('<strong>b</strong>');
    });

    test('no-op edits (unchanged text and html) are not emitted', () => {
      const noop = makeTextEdit({ oldText: 'same', newText: 'same', oldHtml: 'same', newHtml: 'same' });
      const md = fmt.toMarkdown(makeSession({ edits: [noop] }));
      expect(md).not.toContain('# Text Edits');
    });

    test('compact output includes an edits summary', () => {
      const edit = makeTextEdit({ oldText: 'old', newText: 'new' });
      const out = fmt.toCompact(makeSession({ edits: [edit] }));
      expect(out).toContain('# Edits:');
      expect(out).toContain('"old" → "new"');
    });
  });

  /**
   * A pass taken with the extension can cover several screens, so the agent has
   * to be told which note came from where. A single-page session keeps its
   * original shape, which is every session the web app produces.
   */
  describe('a pass over more than one page', () => {
    function twoPageSession() {
      return makeSession({
        annotations: [
          makeAnnotation({ text: 'on one', capturedOn: makePageRef('/records/1') }),
          makeAnnotation({ text: 'on two', capturedOn: makePageRef('/records/2') }),
          makeAnnotation({ text: 'also one', capturedOn: makePageRef('/records/1') }),
        ],
      });
    }

    test('groups the notes by the page they were taken on', () => {
      const md = fmt.toMarkdown(twoPageSession());
      expect(md).toContain('**Pages:** 2');
      expect(md).toContain('# Page: Page /records/1 — https://app.example.com/records/1');
      expect(md).toContain('# Page: Page /records/2 — https://app.example.com/records/2');
      // Two notes on the first page, one on the second.
      expect(md).toContain('**Annotations on this page:** 2');
      expect(md).toContain('**Annotations on this page:** 1');
    });

    test('keeps a note numbered by its place in the session, not in its group', () => {
      const md = fmt.toMarkdown(twoPageSession());
      // The third note is grouped up beside the first, and still reads 3, so
      // the number matches the pin the user saw.
      const firstGroup = md.split('# Page:')[1];
      expect(firstGroup).toContain('## 1.');
      expect(firstGroup).toContain('## 3.');
      expect(firstGroup).not.toContain('## 2.');
    });

    test('names the page by URL alone when it had no title', () => {
      const session = makeSession({
        annotations: [
          makeAnnotation({ capturedOn: makePageRef('/a', { title: undefined }) }),
          makeAnnotation({ capturedOn: makePageRef('/b', { title: undefined }) }),
        ],
      });
      expect(fmt.toMarkdown(session)).toContain('# Page: https://app.example.com/a');
    });

    test('leaves a single-page session formatted as before', () => {
      const session = makeSession({
        annotations: [makeAnnotation({ capturedOn: makePageRef('/records/1') })],
      });
      const md = fmt.toMarkdown(session);
      expect(md).not.toContain('# Page:');
      expect(md).not.toContain('**Pages:**');
      expect(md).toContain('## 1.');
    });

    test('leaves a session with no pages at all formatted as before', () => {
      const md = fmt.toMarkdown(makeSession({ annotations: [makeAnnotation(), makeAnnotation()] }));
      expect(md).not.toContain('# Page:');
      expect(md).toContain('## 1.');
      expect(md).toContain('## 2.');
    });

    test('falls back rather than dropping a note that names no page', () => {
      // Mixing the two is only reachable through an imported session. Grouping
      // around the note without a page would silently lose it, so do not group.
      const session = makeSession({
        annotations: [
          makeAnnotation({ text: 'has a page', capturedOn: makePageRef('/a') }),
          makeAnnotation({ text: 'has none' }),
          makeAnnotation({ text: 'has another', capturedOn: makePageRef('/b') }),
        ],
      });
      const md = fmt.toMarkdown(session);
      expect(md).not.toContain('# Page:');
      expect(md).toContain('has a page');
      expect(md).toContain('has none');
      expect(md).toContain('has another');
    });

    test('drops the hint route when the note records its own page', () => {
      // The hint's route is read in the page's world when the hint resolves, a
      // round trip after the pick, so an app that navigated in between labels
      // the note with the wrong screen. `capturedOn` is read at the pick.
      const drifted = makeAnnotation({
        capturedOn: makePageRef('/records/1'),
        sourceHint: {
          provider: 'dom',
          confidence: 'weak',
          signals: [
            { kind: 'literal-text', text: 'Save record', truncated: false },
            { kind: 'route', url: 'https://app.example.com/settings', pathname: '/settings' },
          ],
        },
      });
      const session = makeSession({
        annotations: [drifted, makeAnnotation({ capturedOn: makePageRef('/records/2') })],
      });

      const md = fmt.toMarkdown(session);
      expect(md).toContain('# Page: Page /records/1 — https://app.example.com/records/1');
      expect(md).not.toContain('route: /settings');
    });

    test('keeps the hint route when the note records no page', () => {
      // The web app on a file has no page of its own, and the route line is the
      // only locator it has.
      const ann = makeAnnotation({
        sourceHint: {
          provider: 'dom',
          confidence: 'weak',
          signals: [{ kind: 'route', url: 'https://x/records/9', pathname: '/records/9' }],
        },
      });
      expect(fmt.toMarkdown(makeSession({ annotations: [ann] }))).toContain('route: /records/9');
    });

    test('compact output groups by page too', () => {
      const out = fmt.toCompact(twoPageSession());
      expect(out).toContain('## Page: Page /records/1 — https://app.example.com/records/1');
      expect(out).toContain('## Page: Page /records/2 — https://app.example.com/records/2');
    });
  });
});
