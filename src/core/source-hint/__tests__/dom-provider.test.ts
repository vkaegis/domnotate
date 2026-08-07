import { describe, test, expect, beforeEach } from 'vitest';
import {
  createDomProvider,
  classConventionSignal,
  accessibleName,
  resolveRole,
  literalText,
  looksLikeRuntimeData,
  landmarkPath,
  collectAttributes,
  findTestId,
  stableClassForm,
  isHashClass,
  cssModuleBase,
  CLASS_CONVENTIONS,
} from '@/core/source-hint/dom-provider';
import { createProviderRegistry, findSignal } from '@/core/source-hint/provider';

function mount(html: string): HTMLElement {
  document.body.innerHTML = html;
  const el = document.body.querySelector<HTMLElement>('#target') ?? document.body.firstElementChild;
  return el as HTMLElement;
}

function withClasses(classes: string): HTMLElement {
  return mount(`<div id="target" class="${classes}">x</div>`);
}

beforeEach(() => {
  document.body.innerHTML = '';
});

// ------------------------------------------------------------
// Tier B — the convention table, one row at a time
// ------------------------------------------------------------

describe('Tier B — class convention table', () => {
  test('MUI reconstructs the component and its variant props', () => {
    const el = withClasses(
      'MuiButtonBase-root MuiButton-root MuiButton-outlined MuiButton-colorPrimary MuiButton-sizeSmall css-1a2b3c',
    );
    const result = classConventionSignal(el);
    expect(result?.convention).toBe('mui');
    expect(result?.component).toBe('Button');
    expect(result?.reconstructed).toBe('<Button variant="outlined" color="primary" size="small">');
    // The emotion hash never greps, so it is not offered as a grep candidate.
    expect(result?.grepClasses).not.toContain('css-1a2b3c');
  });

  test('MUI prefers the specific component over its *Base wrapper', () => {
    const el = withClasses('MuiButtonBase-root MuiIconButton-root MuiIconButton-sizeMedium');
    expect(classConventionSignal(el)?.component).toBe('IconButton');
  });

  test('MUI unpacks the compound modifier forms it also emits', () => {
    const el = withClasses('MuiButton-root MuiButton-outlinedPrimary MuiButton-outlinedSizeSmall');
    expect(classConventionSignal(el)?.reconstructed).toBe(
      '<Button variant="outlined" color="primary" size="small">',
    );
  });

  test('MUI renders unkeyed modifiers as boolean props', () => {
    const el = withClasses('MuiButton-root MuiButton-fullWidth');
    expect(classConventionSignal(el)?.reconstructed).toBe('<Button fullWidth>');
  });

  test('CSS Modules strips the hash and keeps the greppable prefix', () => {
    const el = withClasses('Button_root__a1b2c');
    const result = classConventionSignal(el);
    expect(result?.convention).toBe('css-modules');
    expect(result?.component).toBe('Button');
    expect(result?.reconstructed).toBe('<Button root>');
    expect(result?.grepClasses).toEqual(['Button_root']);
  });

  test('Ant recovers the component and its modifier', () => {
    const el = withClasses('ant-btn ant-btn-primary');
    const result = classConventionSignal(el);
    expect(result?.convention).toBe('ant');
    expect(result?.reconstructed).toBe('<btn primary>');
  });

  test('Bootstrap recovers the base class and its modifiers', () => {
    const el = withClasses('btn btn-primary btn-lg');
    const result = classConventionSignal(el);
    expect(result?.convention).toBe('bootstrap');
    expect(result?.reconstructed).toBe('<btn primary lg>');
  });

  test('BEM recovers the block and the modifier', () => {
    const el = withClasses('card__header--active');
    const result = classConventionSignal(el);
    expect(result?.convention).toBe('bem');
    expect(result?.reconstructed).toBe('<card active>');
  });

  test('utility classes yield no component but a class string that greps', () => {
    const el = withClasses('flex items-center gap-2 px-4');
    const result = classConventionSignal(el);
    expect(result?.convention).toBe('utility');
    expect(result?.component).toBeNull();
    expect(result?.reconstructed).toBeNull();
    expect(result?.grepClasses).toEqual(['flex', 'items-center', 'gap-2', 'px-4']);
  });

  test('an unrecognised convention degrades to the floor rather than failing', () => {
    const el = withClasses('sidebar-nav');
    const result = classConventionSignal(el);
    expect(result?.convention).toBe('unknown');
    expect(result?.component).toBeNull();
    expect(result?.grepClasses).toEqual(['sidebar-nav']);
  });

  test('a component name that could not identify source is not claimed as one', () => {
    // `Root_x__1a2b3` parses as a CSS Module named `Root` — a generic wrapper
    // name, so it is dropped rather than presented as a grep target.
    const el = withClasses('Root_x__1a2b3');
    const result = classConventionSignal(el);
    expect(result?.component).toBeNull();
    expect(result?.reconstructed).toBeNull();
    expect(result?.grepClasses).toEqual(['Root_x']);
  });

  test('adding a convention is a table entry, not a code change', () => {
    const before = CLASS_CONVENTIONS.length;
    CLASS_CONVENTIONS.splice(0, 0, {
      id: 'test-convention',
      test: (cs) => cs.some((c) => c.startsWith('tst-')),
      parse: (cs) => ({
        component: 'Widget',
        modifiers: cs.map((c) => c.replace('tst-', '')),
        matched: cs,
      }),
    });
    try {
      const el = withClasses('tst-thing');
      const result = classConventionSignal(el);
      expect(result?.convention).toBe('test-convention');
      expect(result?.reconstructed).toBe('<Widget thing>');
    } finally {
      CLASS_CONVENTIONS.splice(0, 1);
      expect(CLASS_CONVENTIONS).toHaveLength(before);
    }
  });
});

describe('class hash filtering', () => {
  test('drops fully runtime-generated classes', () => {
    expect(isHashClass('css-1a2b3c')).toBe(true);
    expect(isHashClass('sc-xyzABC')).toBe(true);
    expect(isHashClass('e1a2b3c4d')).toBe(true);
    expect(isHashClass('sidebar-nav')).toBe(false);
    expect(stableClassForm('css-1a2b3c')).toBeNull();
  });

  test('keeps the source-derived half of a CSS Module class', () => {
    expect(cssModuleBase('Button_root__a1b2c')).toBe('Button_root');
    expect(stableClassForm('Button_root__a1b2c')).toBe('Button_root');
    // BEM must not be mistaken for a CSS Module hash.
    expect(cssModuleBase('card__header--active')).toBeNull();
  });

  test('an element with only hashed classes produces no convention signal', () => {
    expect(classConventionSignal(withClasses('css-1a2b3c'))).toBeNull();
  });
});

// ------------------------------------------------------------
// Tier A
// ------------------------------------------------------------

describe('Tier A — literal text and the runtime-data split', () => {
  test('prefers the element own text nodes', () => {
    const el = mount('<div id="target">Sentiment breakdown<span>ignored child</span></div>');
    expect(literalText(el)).toMatchObject({ text: 'Sentiment breakdown', from: 'own-text-nodes' });
  });

  test('falls back to subtree text for small elements', () => {
    const el = mount('<div id="target"><span>Save changes</span></div>');
    expect(literalText(el)).toMatchObject({ text: 'Save changes', from: 'subtree' });
  });

  test('marks a large subtree as not a source literal', () => {
    const kids = Array.from({ length: 25 }, (_, i) => `<span>row ${i}</span>`).join('');
    const el = mount(`<div id="target">${kids}</div>`);
    expect(literalText(el)).toMatchObject({ from: 'subtree-large', truncated: true });
  });

  test('truncates at the capture limit', () => {
    const el = mount(`<div id="target">${'a'.repeat(120)}</div>`);
    const result = literalText(el);
    expect(result?.truncated).toBe(true);
    expect(result?.text).toHaveLength(60);
  });

  test('returns null when there is no text', () => {
    expect(literalText(mount('<div id="target"></div>'))).toBeNull();
  });

  test('source literals are not flagged as runtime data', () => {
    for (const text of ['Download', 'Sentiment breakdown', 'Save changes', 'Primary navigation']) {
      expect(looksLikeRuntimeData(text), text).toBeNull();
    }
  });

  test('runtime data is flagged with its reason', () => {
    expect(looksLikeRuntimeData('feedback-dashboard.html')).toEqual(['filename-like']);
    expect(looksLikeRuntimeData('someone@example.com')).toContain('email');
    expect(looksLikeRuntimeData('3f2504e0-4f89-11d3-9a0c-0305e82c3301')).toContain('uuid');
    expect(looksLikeRuntimeData('https://example.com/x')).toContain('url');
    expect(looksLikeRuntimeData('Updated 12/03/2026')).toContain('date');
    expect(looksLikeRuntimeData('1,204')).toContain('numeric');
    expect(looksLikeRuntimeData('')).toBeNull();
    expect(looksLikeRuntimeData(null)).toBeNull();
  });

  test('the split reaches the emitted signal', () => {
    const provider = createDomProvider();
    const literal = provider.describe(mount('<div id="target">Sentiment breakdown</div>'));
    expect(
      literal.find((s) => s.kind === 'literal-text' && s.runtimeDataReasons !== undefined),
    ).toBeUndefined();

    const runtime = provider.describe(mount('<div id="target">feedback-dashboard.html</div>'));
    const signal = runtime.find((s) => s.kind === 'literal-text');
    expect(signal).toMatchObject({ runtimeDataReasons: ['filename-like'] });
  });
});

describe('Tier A — landmark path with ancestor aria-label', () => {
  test('carries ancestor aria-label, outermost first', () => {
    const el = mount(`
      <main>
        <aside aria-label="Primary navigation">
          <div><span id="target">Records</span></div>
        </aside>
      </main>
    `);
    expect(landmarkPath(el)).toEqual(['main', 'aside("Primary navigation")']);
  });

  test('records an explicit landmark role', () => {
    const el = mount(`
      <main><div role="dialog" aria-label="Edit record"><span id="target">Title</span></div></main>
    `);
    expect(landmarkPath(el)).toEqual(['main', 'div[role=dialog]("Edit record")']);
  });

  test('a labelled section counts, a bare one does not', () => {
    expect(landmarkPath(mount('<section><span id="target">x</span></section>'))).toEqual([]);
    expect(
      landmarkPath(mount('<section aria-label="Filters"><span id="target">x</span></section>')),
    ).toEqual(['section("Filters")']);
  });

  test('the element own label is not part of its ancestry', () => {
    const el = mount('<main><nav aria-label="Primary navigation" id="target">x</nav></main>');
    expect(landmarkPath(el)).toEqual(['main']);
  });

  test('truncates a long ancestor label', () => {
    const el = mount(
      `<nav aria-label="${'n'.repeat(40)}"><span id="target">x</span></nav>`,
    );
    expect(landmarkPath(el)[0]).toBe(`nav("${'n'.repeat(24)}")`);
  });
});

describe('Tier A — accessible name and role', () => {
  test('prefers aria-label', () => {
    const el = mount('<button id="target" aria-label="Close dialog">x</button>');
    expect(accessibleName(el)).toEqual({ name: 'Close dialog', from: 'aria-label' });
  });

  test('resolves aria-labelledby', () => {
    const el = mount('<div><h2 id="h">Sentiment breakdown</h2><div id="target" aria-labelledby="h">x</div></div>');
    expect(accessibleName(el)).toEqual({ name: 'Sentiment breakdown', from: 'aria-labelledby' });
  });

  test('resolves label[for]', () => {
    const el = mount('<form><label for="target">Email address</label><input id="target"></form>');
    expect(accessibleName(el)).toEqual({ name: 'Email address', from: 'label[for]' });
  });

  test('falls back through alt, title, placeholder', () => {
    expect(accessibleName(mount('<img id="target" alt="Company logo">'))?.from).toBe('alt');
    expect(accessibleName(mount('<div id="target" title="Tooltip">x</div>'))?.from).toBe('title');
    expect(accessibleName(mount('<input id="target" placeholder="Search records">'))?.from).toBe(
      'placeholder',
    );
  });

  test('names a control from its own content', () => {
    const el = mount('<button id="target">Save changes</button>');
    expect(accessibleName(el)).toEqual({ name: 'Save changes', from: 'text-content' });
  });

  test('does not name a plain container from its content', () => {
    expect(accessibleName(mount('<div id="target">Some paragraph text</div>'))).toBeNull();
  });

  test('resolves explicit and implicit roles', () => {
    expect(resolveRole(mount('<div id="target" role="article">x</div>'))).toBe('article');
    expect(resolveRole(mount('<button id="target">x</button>'))).toBe('button');
    expect(resolveRole(mount('<a id="target" href="/x">x</a>'))).toBe('link');
    expect(resolveRole(mount('<a id="target">x</a>'))).toBeNull();
    expect(resolveRole(mount('<input id="target" type="checkbox">'))).toBe('checkbox');
    expect(resolveRole(mount('<input id="target">'))).toBe('textbox');
    expect(resolveRole(mount('<h2 id="target">x</h2>'))).toBe('heading');
    expect(resolveRole(mount('<nav id="target">x</nav>'))).toBe('navigation');
    expect(resolveRole(mount('<section id="target">x</section>'))).toBeNull();
    expect(resolveRole(mount('<section id="target" aria-label="Filters">x</section>'))).toBe('region');
    expect(resolveRole(mount('<div id="target">x</div>'))).toBeNull();
  });
});

describe('Tier A — test ids', () => {
  test('finds an own test id across the known attributes', () => {
    expect(findTestId(mount('<div id="target" data-testid="save-btn">x</div>'))).toEqual({
      attribute: 'data-testid',
      value: 'save-btn',
      own: true,
    });
    expect(findTestId(mount('<div id="target" data-cy="save-btn">x</div>'))?.attribute).toBe('data-cy');
  });

  test('an ancestor test id is reported as not own', () => {
    const el = mount('<div data-testid="records-table"><div><span id="target">x</span></div></div>');
    expect(findTestId(el)).toEqual({
      attribute: 'data-testid',
      value: 'records-table',
      own: false,
      hops: 2,
    });
  });

  test('returns null when there is none', () => {
    expect(findTestId(mount('<div id="target">x</div>'))).toBeNull();
  });
});

// ------------------------------------------------------------
// Allow-list floor
// ------------------------------------------------------------

describe('allow-list floor (§3.7)', () => {
  test('a non-allow-listed attribute never reaches the output', () => {
    const el = mount('<div id="target">x</div>');
    el.setAttribute('customerEmail', 'someone@example.com');
    el.setAttribute('feedbackBody', 'the app crashed when I clicked save');
    el.setAttribute('data-record-id', '12345');
    el.setAttribute('aria-expanded', 'true');
    el.setAttribute('href', '/records/12345');

    expect(collectAttributes(el)).toEqual({
      id: 'target',
      'data-record-id': '12345',
      'aria-expanded': 'true',
    });

    const hint = createProviderRegistry([createDomProvider()]).describe(el);
    const serialized = JSON.stringify(hint);
    expect(serialized).not.toContain('someone@example.com');
    expect(serialized).not.toContain('the app crashed');
    expect(serialized).not.toContain('customeremail');
    expect(serialized).not.toContain('/records/12345');
  });

  test('class and style are carried by their own signals, not as attributes', () => {
    const el = mount('<div id="target" class="btn" style="display:none">x</div>');
    expect(collectAttributes(el)).toEqual({ id: 'target' });
  });

  test('the test id attribute is not duplicated into the attribute list', () => {
    const el = mount('<div id="target" data-testid="save-btn">x</div>');
    expect(collectAttributes(el, 'data-testid')).toEqual({ id: 'target' });
  });
});

// ------------------------------------------------------------
// The provider as a whole
// ------------------------------------------------------------

describe('createDomProvider', () => {
  test('always detects — plain HTML is always present', () => {
    expect(createDomProvider().detect()).toBe(true);
  });

  test('produces a usable block from nothing but DOM', () => {
    const el = mount(`
      <main>
        <aside aria-label="Primary navigation">
          <button id="target" class="MuiButton-root MuiButton-outlined css-1a2b3c" data-testid="nav-save">
            Save changes
          </button>
        </aside>
      </main>
    `);
    const hint = createProviderRegistry([createDomProvider()]).describe(el);

    expect(hint.provider).toBe('dom');
    expect(findSignal(hint, 'test-id')?.value).toBe('nav-save');
    expect(findSignal(hint, 'class-convention')?.reconstructed).toBe('<Button variant="outlined">');
    expect(findSignal(hint, 'accessible-name')).toMatchObject({ role: 'button', name: 'Save changes' });
    expect(findSignal(hint, 'literal-text')?.text).toBe('Save changes');
    expect(findSignal(hint, 'landmark-path')?.path).toEqual(['main', 'aside("Primary navigation")']);
    expect(findSignal(hint, 'dom-attributes')?.tagName).toBe('button');
    // An own test id is the only strong signal the DOM floor can produce.
    expect(hint.confidence).toBe('strong');
  });

  test('is honest on an element with nothing distinguishing', () => {
    const el = mount('<div id="target"></div>');
    const hint = createProviderRegistry([createDomProvider()]).describe(el);
    expect(hint.confidence).toBe('weak');
    expect(hint.signals.some((s) => s.kind === 'literal-text')).toBe(false);
    // Never empty: tag, attributes and geometry always survive.
    expect(hint.signals.length).toBeGreaterThan(0);
  });

  test('captures inline style and geometry', () => {
    const el = mount('<div id="target" style="display: none">x</div>');
    const signals = createDomProvider().describe(el);
    const style = signals.find((s) => s.kind === 'element-style');
    expect(style).toMatchObject({ inlineStyle: 'display: none' });
    expect(style && 'rect' in style ? Object.keys(style.rect) : []).toEqual([
      'x',
      'y',
      'width',
      'height',
    ]);
  });

  test('captures the route from the supplied view', () => {
    const el = mount('<div id="target">x</div>');
    const signals = createDomProvider({
      window: {
        location: {
          href: 'https://app.test/records/12345?tab=sentiment#pill',
          pathname: '/records/12345',
          search: '?tab=sentiment',
          hash: '#pill',
        },
      },
    }).describe(el);
    expect(signals.find((s) => s.kind === 'route')).toEqual({
      kind: 'route',
      url: 'https://app.test/records/12345?tab=sentiment#pill',
      pathname: '/records/12345',
      search: '?tab=sentiment',
      hash: '#pill',
    });
  });

  test('omits the route when there is no view', () => {
    const signals = createDomProvider({ window: null }).describe(mount('<div id="target">x</div>'));
    expect(signals.some((s) => s.kind === 'route')).toBe(false);
  });

  test('defaults the route to the element own document view', () => {
    const signals = createDomProvider().describe(mount('<div id="target">x</div>'));
    const route = signals.find((s) => s.kind === 'route');
    expect(route && 'pathname' in route ? route.pathname.startsWith('/') : false).toBe(true);
  });
});
