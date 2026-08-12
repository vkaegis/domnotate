import { describe, test, expect } from 'vitest';
import {
  formatRoute,
  formatSourceHint,
  grepAdvice,
  headlineComponent,
  isAtFloor,
} from '@/core/source-hint/format';
import { createDomProvider } from '@/core/source-hint/dom-provider';
import { createProviderRegistry } from '@/core/source-hint/provider';
import type { SignalOf, SourceHint } from '@/core/source-hint/types';

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
    expect(out).toContain(
      '   testid: feedback-card-sentiment (on an ancestor, 2 up — may be supplied by a parent)',
    );
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
    // The reconstruction supersedes the raw list: MuiButton-root lives in MUI,
    // not in the app being searched.
    expect(out.some((l) => l.startsWith('   classes:'))).toBe(false);
  });

  test('keeps the raw class list when no component could be reconstructed', () => {
    const hint: SourceHint = {
      provider: 'dom',
      confidence: 'weak',
      signals: [
        {
          kind: 'class-convention',
          convention: 'utility',
          component: null,
          modifiers: [],
          reconstructed: null,
          grepClasses: ['flex', 'items-center', 'gap-2'],
        },
      ],
    };
    // Hand-written classes are the only grep candidate there is.
    expect(lines(hint, 1, '')).toContain('   classes: flex items-center gap-2');
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
    // Regression, first Phase 2 capture: this used to read "no component
    // identity recovered" on all 10 blocks, directly under a headline naming a
    // component. The block contradicted itself. `<Button>` here is MUI's, so
    // the honest statement is that it is the library's and the app's is unknown.
    expect(out).toContain("<Button> is the library's component, not the app's");
    expect(out).toContain('app component not identified — grep the literal text');
    expect(out).not.toContain('no component identity recovered');
    expect(out).not.toContain('css-1a2b3c');
    expect(out).toContain('> this button is too small');
  });
});

describe('formatSourceHint — library vs app-authored component names', () => {
  function hintFor(convention: string, component: string): SourceHint {
    return {
      provider: 'dom',
      confidence: 'weak',
      signals: [
        {
          kind: 'class-convention',
          convention,
          component,
          modifiers: ['root'],
          reconstructed: `<${component} root>`,
          grepClasses: [`${component}-root`],
        },
        { kind: 'literal-text', text: 'Save changes', truncated: false, from: 'own-text-nodes' },
      ],
    };
  }

  test.each(['mui', 'ant', 'bootstrap'])('marks a %s name as the library, not the app', (c) => {
    const out = formatSourceHint(hintFor(c, 'Button'));
    expect(out).toContain("<Button> is the library's component, not the app's");
    expect(out).toContain('app component not identified');
  });

  test.each(['css-modules', 'bem'])('leaves a %s name standing as a real lead', (c) => {
    // `Button_root__a1b2c` and `card__header` are written in the app's own
    // source, so the reconstructed name is the best grep candidate in the block
    // and must not be disclaimed.
    const out = formatSourceHint(hintFor(c, 'Button'));
    expect(out).not.toContain("is the library's component");
    expect(out).not.toContain('no component identity recovered');
    expect(out).toContain('<Button>');
  });

  test('still says nothing was recovered when nothing was', () => {
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
          grepClasses: ['flex', 'items-center'],
        },
      ],
    });
    expect(out).toContain('no component identity recovered');
  });
});

// ------------------------------------------------------------
// The two fixes the Phase 2 eval earned (plan §8 → Phase 2)
// ------------------------------------------------------------

describe('formatSourceHint — a testid whose scope is not local', () => {
  function withTestId(own: boolean, hops?: number): SourceHint {
    return {
      provider: 'dom',
      confidence: 'weak',
      signals: [
        {
          kind: 'test-id',
          value: 'other-users-dashboards-list',
          attribute: 'data-testid',
          own,
          hops,
        },
        { kind: 'literal-text', text: 'See All', truncated: false, from: 'own-text-nodes' },
      ],
    };
  }

  // Regression, Phase 2 block 9: the agent followed an ancestor's testid to the
  // file that supplies it as a prop and stopped one file short of the element.
  test("warns that an ancestor's testid may be a prop from further up", () => {
    const out = formatSourceHint(withTestId(false, 1));
    expect(out).toContain(
      'testid: other-users-dashboards-list (on an ancestor, 1 up — may be supplied by a parent)',
    );
  });

  test("does not caveat the element's own testid", () => {
    const out = formatSourceHint(withTestId(true));
    expect(out).toContain('testid: other-users-dashboards-list');
    expect(out).not.toContain('may be supplied by a parent');
    expect(out).not.toContain('on an ancestor');
  });

  test('assumes local when the provider recorded no scope', () => {
    const out = formatSourceHint({
      provider: 'dom',
      confidence: 'weak',
      signals: [{ kind: 'test-id', value: 'x', attribute: 'data-testid' }],
    });
    expect(out).not.toContain('may be supplied by a parent');
  });
});

describe('formatSourceHint — saying when the block is at the floor', () => {
  /** Phase 2 block 10: a bare MUI icon. No text, no name, no testid. */
  const icon: SourceHint = {
    provider: 'dom',
    confidence: 'weak',
    signals: [
      {
        kind: 'class-convention',
        convention: 'mui',
        component: 'SvgIcon',
        modifiers: ['root', 'fontSizeSmall'],
        reconstructed: '<SvgIcon fontSizeSmall>',
        grepClasses: ['MuiSvgIcon-root', 'MuiSvgIcon-fontSizeSmall'],
      },
      { kind: 'dom-attributes', tagName: 'svg', attributes: { 'aria-hidden': 'true' } },
      { kind: 'landmark-path', path: ['main'] },
    ],
  };

  test('says so, and says what to do instead', () => {
    expect(isAtFloor(icon)).toBe(true);
    const out = formatSourceHint(icon);
    expect(out).toContain('no distinguishing text, name, or test id');
    expect(out).toContain("find the element among its parent's children");
  });

  // The library's class names are not in the app being searched, and the
  // formatter does not even print them — advising a grep for them sends an
  // agent after a string that resolves to nothing (§10, lesson 2).
  test('does not offer library class names as a lead', () => {
    expect(grepAdvice(icon)).toBe('no greppable string recovered — use the selector and landmark path');
    expect(formatSourceHint(icon)).not.toContain('grep the class names');
    expect(formatSourceHint(icon)).not.toContain('MuiSvgIcon');
  });

  test('does not duplicate the advice it already gave', () => {
    const out = formatSourceHint(icon);
    expect(out).not.toContain('no greppable string recovered');
    expect(out.match(/selector is the only lead/g)).toHaveLength(1);
  });

  test('an app-authored class convention is a lead, so not the floor', () => {
    expect(
      isAtFloor({
        provider: 'dom',
        confidence: 'weak',
        signals: [
          {
            kind: 'class-convention',
            convention: 'unknown',
            component: null,
            modifiers: [],
            reconstructed: null,
            grepClasses: ['sidebar-nav'],
          },
        ],
      }),
    ).toBe(false);
  });

  test.each([
    ['literal text', { kind: 'literal-text', text: 'Save', truncated: false }],
    ['an accessible name', { kind: 'accessible-name', role: 'button', name: 'Save' }],
    ['a test id', { kind: 'test-id', value: 'save-btn', attribute: 'data-testid', own: true }],
  ] as const)('%s keeps a block off the floor', (_label, signal) => {
    const out = formatSourceHint({ ...icon, signals: [...icon.signals, signal] });
    expect(isAtFloor({ ...icon, signals: [...icon.signals, signal] })).toBe(false);
    expect(out).not.toContain('the selector is the only lead');
  });

  test('runtime data is not a lead off the floor', () => {
    // `:r1fb:` and friends grep for nothing, so a block carrying only runtime
    // text is still at the floor and must say so.
    const hint: SourceHint = {
      ...icon,
      signals: [
        ...icon.signals,
        {
          kind: 'literal-text',
          text: 'feedback-dashboard.html',
          truncated: false,
          runtimeDataReasons: ['filename-like'],
        },
      ],
    };
    expect(isAtFloor(hint)).toBe(true);
    expect(formatSourceHint(hint)).toContain('the selector is the only lead');
  });

  test('a real source location is never the floor', () => {
    expect(
      isAtFloor({
        provider: 'react+dom',
        confidence: 'exact',
        signals: [{ kind: 'source-location', file: 'src/App.tsx', line: 1 }],
      }),
    ).toBe(false);
  });
});

describe('formatRoute — a page that came off disk', () => {
  function route(url: string, pathname: string): SignalOf<'route'> {
    return { kind: 'route', url, pathname };
  }

  test('names an ordinary route in full', () => {
    expect(formatRoute(route('https://app.test/records/12345', '/records/12345'))).toBe(
      'route: /records/12345',
    );
  });

  /**
   * Regression, verification session A: `location.pathname` on a `file:` URL is
   * the whole absolute path, so the export carried a username and a machine's
   * directory layout onto the clipboard.
   */
  test('cuts a file URL back to its basename, and says it is a file', () => {
    const out = formatRoute(
      route(
        'file:///Users/someone/conductor/workspaces/domnotate/vienna/fixtures/hostile.html',
        '/Users/someone/conductor/workspaces/domnotate/vienna/fixtures/hostile.html',
      ),
    );

    expect(out).toBe('file: hostile.html');
    expect(out).not.toContain('someone');
    expect(out).not.toContain('/Users/');
  });
});
