import { describe, test, expect } from 'vitest';
import { formatSourceHint, grepAdvice, headlineComponent } from '@/core/source-hint/format';
import { createDomProvider } from '@/core/source-hint/dom-provider';
import { createProviderRegistry } from '@/core/source-hint/provider';
import type { SourceHint } from '@/core/source-hint/types';

const NOTE = 'the sentiment pill should be right-aligned with the timestamp';

/** Plan §5, the instrumented shape: a real file and line to lead with. */
const exactHint: SourceHint = {
  provider: 'react+dom',
  confidence: 'exact',
  signals: [
    { kind: 'source-location', file: 'src/components/records/FeedbackCard.tsx', line: 42 },
    {
      kind: 'component-path',
      chain: ['App', 'DashboardLayout', 'RecordsTable', 'FeedbackCard'],
      minified: false,
    },
    { kind: 'test-id', value: 'feedback-card-sentiment', attribute: 'data-testid', own: true },
    { kind: 'accessible-name', role: 'article', name: 'Sentiment breakdown', from: 'aria-label' },
    { kind: 'literal-text', text: 'Sentiment breakdown', truncated: false, from: 'own-text-nodes' },
    { kind: 'landmark-path', path: ['main'] },
    {
      kind: 'route',
      url: 'https://app.test/records/12345?tab=sentiment',
      pathname: '/records/12345',
      search: '?tab=sentiment',
    },
  ],
};

/** Plan §5, the production shape: the same element, nothing but DOM left. */
const weakHint: SourceHint = {
  provider: 'react+dom',
  confidence: 'weak',
  signals: [
    { kind: 'component-path', chain: ['Cn', 't', 'Kr'], minified: true },
    {
      kind: 'test-id',
      value: 'feedback-card-sentiment',
      attribute: 'data-testid',
      own: false,
      hops: 2,
    },
    { kind: 'accessible-name', role: 'article', name: 'Sentiment breakdown', from: 'aria-label' },
    { kind: 'literal-text', text: 'Sentiment breakdown', truncated: false, from: 'own-text-nodes' },
    { kind: 'landmark-path', path: ['main', 'dialog'] },
    {
      kind: 'route',
      url: 'https://app.test/records/12345?tab=sentiment',
      pathname: '/records/12345',
      search: '?tab=sentiment',
    },
  ],
};

function lines(hint: SourceHint, index = 3, note = NOTE): string[] {
  return formatSourceHint(hint, { index, note }).split('\n');
}

describe('formatSourceHint — the [exact] path', () => {
  test('leads with the source location and tags it', () => {
    const out = lines(exactHint);
    expect(out[0]).toBe('3. <FeedbackCard> — "Sentiment breakdown"');
    expect(out[1].trimEnd().startsWith('   source: src/components/records/FeedbackCard.tsx:42')).toBe(
      true,
    );
    expect(out[1].endsWith('[exact]')).toBe(true);
    expect(out[2]).toBe('   component: App > DashboardLayout > RecordsTable > FeedbackCard');
    expect(out).toContain('   testid: feedback-card-sentiment');
    expect(out).toContain('   role: article, in <main>');
    expect(out).toContain('   route: /records/12345?tab=sentiment');
    expect(out[out.length - 1]).toBe(`   > ${NOTE}`);
  });

  test('renders a column when present', () => {
    const withColumn: SourceHint = {
      ...exactHint,
      signals: [{ kind: 'source-location', file: 'a.tsx', line: 42, column: 7 }],
    };
    expect(formatSourceHint(withColumn)).toContain('source: a.tsx:42:7');
  });

  test('does not repeat the headline text as a text or name line', () => {
    const out = lines(exactHint);
    expect(out.filter((l) => l.includes('Sentiment breakdown'))).toHaveLength(1);
  });
});

describe('formatSourceHint — the [weak] path', () => {
  test('degrades honestly instead of printing a minified chain', () => {
    const out = lines(weakHint);
    expect(out[0]).toMatch(/^3\. "Sentiment breakdown"\s+\[weak\]$/);
    expect(out[1]).toBe('   component chain minified — grep the literal text');
    expect(out).toContain('   testid: feedback-card-sentiment (on an ancestor, 2 up)');
    expect(out).toContain('   role: article, in <main> > <dialog>');
    expect(out).toContain('   route: /records/12345?tab=sentiment');
  });

  test('never emits the minified names themselves', () => {
    const out = formatSourceHint(weakHint);
    expect(out).not.toContain('Cn');
    expect(out).not.toContain('Kr');
    expect(out).not.toContain('[exact]');
    expect(out).not.toContain('[strong]');
  });

  test('says so when there is no component identity at all', () => {
    const domOnly: SourceHint = {
      ...weakHint,
      signals: weakHint.signals.filter((s) => s.kind !== 'component-path'),
    };
    expect(lines(domOnly)[1]).toBe(
      '   no component identity recovered — grep the literal text',
    );
  });

  test('does not tell the agent to grep text that is runtime data', () => {
    const runtime: SourceHint = {
      provider: 'dom',
      confidence: 'weak',
      signals: [
        {
          kind: 'literal-text',
          text: 'feedback-dashboard.html',
          truncated: false,
          runtimeDataReasons: ['filename-like'],
        },
        {
          kind: 'class-convention',
          convention: 'unknown',
          component: null,
          modifiers: [],
          reconstructed: null,
          grepClasses: ['sidebar-nav'],
        },
      ],
    };
    const out = formatSourceHint(runtime);
    expect(out).toContain('no component identity recovered — grep the class names');
    expect(out).toContain(
      'text is runtime data (filename-like) — it will not appear in source',
    );
  });

  test('grepAdvice degrades through the available signals', () => {
    const base = { provider: 'dom', confidence: 'weak' } as const;
    expect(
      grepAdvice({ ...base, signals: [{ kind: 'literal-text', text: 'Save', truncated: false }] }),
    ).toBe('grep the literal text');
    expect(
      grepAdvice({
        ...base,
        signals: [{ kind: 'test-id', value: 'x', attribute: 'data-testid', own: true }],
      }),
    ).toBe('grep the test id');
    expect(
      grepAdvice({
        ...base,
        signals: [{ kind: 'accessible-name', role: 'button', name: 'Save' }],
      }),
    ).toBe('grep the accessible name');
    expect(grepAdvice({ ...base, signals: [{ kind: 'landmark-path', path: ['main'] }] })).toBe(
      'no greppable string recovered — use the selector and landmark path',
    );
  });
});

describe('formatSourceHint — headline', () => {
  test('uses a class-convention component when no fiber name survived', () => {
    const hint: SourceHint = {
      provider: 'dom',
      confidence: 'weak',
      signals: [
        {
          kind: 'class-convention',
          convention: 'mui',
          component: 'Button',
          modifiers: ['outlined'],
          reconstructed: '<Button variant="outlined">',
          grepClasses: ['MuiButton-root', 'MuiButton-outlined'],
        },
        { kind: 'literal-text', text: 'Save changes', truncated: false },
      ],
    };
    const out = lines(hint, 1, '');
    expect(out[0]).toMatch(/^1\. <Button> — "Save changes"\s+\[weak\]$/);
    expect(out).toContain('   element: <Button variant="outlined"> (mui classes)');
    expect(out).toContain('   classes: MuiButton-root MuiButton-outlined');
  });

  test('never uses a generic wrapper name as the headline component', () => {
    expect(
      headlineComponent({
        provider: 'react',
        confidence: 'weak',
        signals: [
          { kind: 'component-path', chain: ['Styled(div)', 'Primitive.div'], minified: false },
        ],
      }),
    ).toBeNull();
  });

  test('falls back to the tag name, then to an explicit admission', () => {
    expect(
      formatSourceHint({
        provider: 'dom',
        confidence: 'weak',
        signals: [{ kind: 'dom-attributes', tagName: 'div', attributes: {} }],
      }).split('\n')[0],
    ).toMatch(/^<div>\s+\[weak\]$/);

    expect(
      formatSourceHint({ provider: 'none', confidence: 'weak', signals: [] }).split('\n')[0],
    ).toMatch(/^\(unidentified element\)\s+\[weak\]$/);
  });

  test('marks truncated text in the headline', () => {
    const out = formatSourceHint({
      provider: 'dom',
      confidence: 'weak',
      signals: [
        { kind: 'accessible-name', role: 'button', name: 'Save' },
        { kind: 'literal-text', text: 'a'.repeat(60), truncated: true },
      ],
    });
    expect(out.split('\n')[0]).toMatch(new RegExp(`^"a{60}"…\\s+\\[weak\\]$`));
  });

  test('keeps a differing accessible name as its own line', () => {
    const out = formatSourceHint({
      provider: 'dom',
      confidence: 'weak',
      signals: [
        { kind: 'accessible-name', role: 'button', name: 'Save', from: 'aria-label' },
        { kind: 'literal-text', text: 'Save changes', truncated: false },
      ],
    });
    // The source literal wins the headline; the differing label still greps.
    expect(out.split('\n')[0]).toMatch(/^"Save changes"\s+\[weak\]$/);
    expect(out).toContain('name: "Save" (aria-label)');
  });
});

describe('formatSourceHint — detail lines', () => {
  test('renders allow-listed attributes, inline style and geometry', () => {
    const out = formatSourceHint({
      provider: 'dom',
      confidence: 'weak',
      signals: [
        { kind: 'dom-attributes', tagName: 'div', attributes: { 'data-record-id': '12345' } },
        {
          kind: 'element-style',
          inlineStyle: 'display: none',
          rect: { x: 40, y: 220, width: 120, height: 32 },
        },
      ],
    });
    expect(out).toContain('attrs: data-record-id="12345"');
    expect(out).toContain('style: display: none');
    expect(out).toContain('box: 120x32 at (40, 220)');
  });

  test('caps the class list', () => {
    const grepClasses = Array.from({ length: 15 }, (_, i) => `c${i}`);
    const out = formatSourceHint({
      provider: 'dom',
      confidence: 'weak',
      signals: [
        {
          kind: 'class-convention',
          convention: 'utility',
          component: null,
          modifiers: [],
          reconstructed: null,
          grepClasses,
        },
      ],
    });
    expect(out).toContain('(+3 more)');
  });

  test('omits the note line when there is no note', () => {
    const out = formatSourceHint(exactHint).split('\n');
    expect(out.some((l) => l.trimStart().startsWith('> '))).toBe(false);
    expect(formatSourceHint(exactHint, { note: NOTE }).split('\n').pop()).toBe(`   > ${NOTE}`);
  });
});

describe('formatSourceHint — end to end from the DOM', () => {
  test('a production-shaped element yields a usable weak block', () => {
    document.body.innerHTML = `
      <main>
        <aside aria-label="Primary navigation">
          <div class="MuiStack-root css-1a2b3c">
            <button id="target" class="MuiButton-root MuiButton-outlined MuiButton-colorPrimary MuiButton-sizeSmall css-9z8y7x">
              Save changes
            </button>
          </div>
        </aside>
      </main>
    `;
    const el = document.querySelector('#target') as HTMLElement;
    const hint = createProviderRegistry([createDomProvider({ window: null })]).describe(el);
    const out = formatSourceHint(hint, { index: 1, note: 'this button is too small' });

    expect(hint.confidence).toBe('weak');
    expect(out).toContain('<Button> — "Save changes"');
    expect(out).toContain('[weak]');
    expect(out).toContain(
      'element: <Button variant="outlined" color="primary" size="small"> (mui classes)',
    );
    expect(out).toContain('in <main> > <aside("Primary navigation")>');
    expect(out).toContain('no component identity recovered — grep the literal text');
    expect(out).not.toContain('css-1a2b3c');
    expect(out).toContain('> this button is too small');
  });
});
