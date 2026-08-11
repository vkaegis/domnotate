import { describe, expect, test } from 'vitest';

import { makePlainDocument } from '@/__tests__/fixtures';
import { reanchorAnnotation } from '@/output/reanchor';
import {
  generateCssSelector,
  generateDescriptor,
  generateXPath,
  isHashClass,
} from '@/picker/selector-engine';

function query(doc: Document, selector: string): Element {
  const el = doc.querySelector(selector);
  if (!el) throw new Error(`fixture selector did not match: ${selector}`);
  return el;
}

/** Every generated selector must be valid and resolve to exactly one element. */
function expectResolvesUniquelyTo(doc: Document, selector: string, el: Element): void {
  const matches = doc.querySelectorAll(selector);
  expect(matches.length, `selector "${selector}" matched ${matches.length} elements`).toBe(1);
  expect(matches[0]).toBe(el);
}

// A page where the same component is rendered inside two different parents,
// one of which is an id-bearing landmark. Mirrors the app the cold-agent eval
// ran against.
const NAV_FORK_HTML = `
  <div id="page">
    <aside id="js-nav-sidebar" aria-label="Primary navigation">
      <div class="MuiStack-root"><span class="MuiTypography-root">Home</span></div>
    </aside>
    <main class="content">
      <div class="MuiStack-root"><span class="MuiTypography-root">Home</span></div>
    </main>
  </div>
`;

// MUI/emotion class soup: stable design-system classes mixed with runtime
// hashes from the emotion runtime.
const MUI_CARD_HTML = `
  <div class="MuiPaper-root MuiCard-root css-1a2b3c">
    <div class="MuiCardContent-root css-9x8y7z">
      <h2 class="MuiTypography-root MuiTypography-h5 css-qq11ww">Feedback</h2>
      <p class="MuiTypography-root MuiTypography-body2 e1qtd0pd0">Latest summary</p>
      <button class="MuiButtonBase-root MuiButton-root MuiButton-containedPrimary css-77aa88 e9x8y7z6">
        Save
      </button>
    </div>
  </div>
`;

describe('isHashClass', () => {
  test('detects runtime-generated class names', () => {
    expect(isHashClass('css-1a2b3c')).toBe(true);
    expect(isHashClass('sc-bdVaJa')).toBe(true);
    expect(isHashClass('e1qtd0pd0')).toBe(true);
  });

  test('keeps source-written class names, including CSS Modules', () => {
    expect(isHashClass('MuiButton-root')).toBe(false);
    expect(isHashClass('card__header--active')).toBe(false);
    // CSS Modules keep a greppable prefix, so they must survive.
    expect(isHashClass('Button_root__a1b2c')).toBe(false);
    // Real words that start with `e` are not emotion hashes.
    expect(isHashClass('expandable')).toBe(false);
    expect(isHashClass('elevation')).toBe(false);
  });

  // Regression: a one-digit rule kept `elevation` but still ate `elevation2`,
  // silently deleting a greppable token from the selector.
  test('keeps source-written class names that merely end in a digit', () => {
    expect(isHashClass('elevation2')).toBe(false);
    expect(isHashClass('emphasis1')).toBe(false);
    expect(isHashClass('editable2')).toBe(false);
  });

  test('still detects emotion hashes, which carry several digits', () => {
    expect(isHashClass('e9x8y7z6')).toBe(true);
    expect(isHashClass('e1qtd0pd0')).toBe(true);
  });
});

describe('generateCssSelector — tag is kept at an id boundary', () => {
  test('emits tag#id rather than a bare #id for an id-bearing ancestor', () => {
    const doc = makePlainDocument(NAV_FORK_HTML);
    const target = query(doc, '#js-nav-sidebar .MuiStack-root');

    const selector = generateCssSelector(target);

    expect(selector).toContain('aside#js-nav-sidebar');
    expect(selector).not.toMatch(/(^|[\s>])#js-nav-sidebar/);
    expectResolvesUniquelyTo(doc, selector, target);
  });

  test('keeps walking past an id that does not make the chain unique', () => {
    // Duplicate ids are invalid but common in real pages; the old code broke
    // out of the walk here and returned an ambiguous selector.
    const doc = makePlainDocument(`
      <div class="left"><section id="panel"><p class="row">a</p></section></div>
      <div class="right"><section id="panel"><p class="row">b</p></section></div>
    `);
    const target = doc.querySelectorAll('.right p.row')[0];

    const selector = generateCssSelector(target);

    expect(selector).toContain('section#panel');
    expect(selector).toContain('div.right');
    expectResolvesUniquelyTo(doc, selector, target);
  });

  test('tags the annotated element too, when its own id is the whole selector', () => {
    // Regression: captured on `fixtures/hostile-csp.html`, where a `<button
    // id="save">` exported as a bare `#save`. The tag was dropped for the
    // target element while ancestors kept theirs, which read as minimality but
    // costs the agent the one thing the selector is there to say.
    const doc = makePlainDocument('<main><button id="save">Save changes</button></main>');
    const target = query(doc, '#save');

    expect(generateCssSelector(target)).toBe('button#save');
    expectResolvesUniquelyTo(doc, 'button#save', target);
  });

  test('a tagged id can disambiguate where a bare one cannot', () => {
    // Duplicate ids are invalid and common. Tagging is what makes this
    // resolvable at all, so it is not purely a readability change.
    const doc = makePlainDocument('<main><div id="dup">a</div><button id="dup">b</button></main>');
    const target = query(doc, 'button#dup');

    expect(generateCssSelector(target)).toBe('button#dup');
    expectResolvesUniquelyTo(doc, 'button#dup', target);
  });

  test('tags a testid-derived selector for the annotated element', () => {
    const doc = makePlainDocument('<main><button data-testid="save-btn">Save</button></main>');
    const target = query(doc, '[data-testid="save-btn"]');

    expect(generateCssSelector(target)).toBe('button[data-testid="save-btn"]');
    expectResolvesUniquelyTo(doc, 'button[data-testid="save-btn"]', target);
  });
});

describe('generateCssSelector — sibling position on the annotated element', () => {
  test('adds nth-child even when tag and classes are already unique', () => {
    const doc = makePlainDocument(`
      <div class="card">
        <h2 class="title">Title</h2>
        <p class="body">Body</p>
      </div>
    `);
    const target = query(doc, 'p.body');

    const selector = generateCssSelector(target);

    expect(selector).toBe('p.body:nth-child(2)');
    expectResolvesUniquelyTo(doc, selector, target);
  });

  test('pins which parent instantiated a repeated component', () => {
    const doc = makePlainDocument(`
      <section class="list">
        <article class="FeedbackCard-root"><span class="label">One</span></article>
        <article class="FeedbackCard-root"><span class="label">Two</span></article>
        <article class="FeedbackCard-root"><span class="label">Three</span></article>
      </section>
    `);
    const target = doc.querySelectorAll('article.FeedbackCard-root')[2];

    const selector = generateCssSelector(target);

    expect(selector).toContain(':nth-child(3)');
    expectResolvesUniquelyTo(doc, selector, target);
  });

  test('omits nth-child when the element has no siblings', () => {
    const doc = makePlainDocument('<div class="card"><span class="only">x</span></div>');
    const target = query(doc, 'span.only');

    expect(generateCssSelector(target)).toBe('span.only');
  });

  test('adds no nth-child to a unique data-testid selector, which is already exact', () => {
    const doc = makePlainDocument(`
      <div class="row"><b data-testid="a">a</b><b data-testid="b">b</b></div>
    `);
    const target = query(doc, '[data-testid="b"]');

    // Tagged, per the id-boundary rule; the point here is the absent position.
    expect(generateCssSelector(target)).toBe('b[data-testid="b"]');
    expect(generateCssSelector(target)).not.toContain(':nth-child');
  });
});

describe('generateCssSelector — runtime hash filtering', () => {
  test('drops emotion and styled-components hashes from the annotated element', () => {
    const doc = makePlainDocument(MUI_CARD_HTML);
    const target = query(doc, 'button');

    const selector = generateCssSelector(target);

    expect(selector).toBe(
      'button.MuiButtonBase-root.MuiButton-root.MuiButton-containedPrimary:nth-child(3)',
    );
    expectResolvesUniquelyTo(doc, selector, target);
  });

  test('drops hashes from ancestor segments too', () => {
    const doc = makePlainDocument(`
      <div class="MuiPaper-root css-1a2b3c">
        <span class="MuiTypography-root">Alpha</span>
      </div>
      <div class="MuiPaper-root css-4d5e6f">
        <span class="MuiTypography-root">Beta</span>
      </div>
    `);
    const target = doc.querySelectorAll('span.MuiTypography-root')[1];

    const selector = generateCssSelector(target);

    expect(selector).not.toContain('css-');
    expectResolvesUniquelyTo(doc, selector, target);
  });

  test('keeps styled-components ids out of the selector', () => {
    const doc = makePlainDocument(`
      <nav class="Nav-wrapper sc-bdVaJa"><a class="Nav-link sc-gsTCUz">Docs</a></nav>
    `);
    const target = query(doc, 'a');

    const selector = generateCssSelector(target);

    expect(selector).toBe('a.Nav-link');
    expectResolvesUniquelyTo(doc, selector, target);
  });

  test('keeps a hashed class when dropping it would lose uniqueness', () => {
    // A detached subtree cannot be resolved by any selector against the
    // document, so the hash-free build never becomes unique. The engine must
    // then fall back to the full class list rather than shipping a stripped
    // selector.
    const doc = makePlainDocument('<main></main>');
    const host = doc.createElement('div');
    host.className = 'wrap';
    host.innerHTML = '<span class="chip css-aaa111">A</span>';
    const target = host.firstElementChild!;

    const selector = generateCssSelector(target);

    expect(selector).toContain('css-aaa111');
  });

  test('never emits a hash-stripped selector that fails to resolve', () => {
    const doc = makePlainDocument(MUI_CARD_HTML + NAV_FORK_HTML);

    for (const el of Array.from(doc.body.querySelectorAll('*'))) {
      expectResolvesUniquelyTo(doc, generateCssSelector(el), el);
    }
  });
});

describe('re-anchoring still works with the generated descriptors', () => {
  test('every element in a hash-heavy document re-anchors to itself', () => {
    const doc = makePlainDocument(MUI_CARD_HTML + NAV_FORK_HTML);

    for (const el of Array.from(doc.body.querySelectorAll('*'))) {
      const descriptor = generateDescriptor(el);
      const result = reanchorAnnotation(descriptor, doc);
      expect(result?.element, `failed to re-anchor ${descriptor.cssSelector}`).toBe(el);
    }
  });

  test('re-anchors inside a view scope using the generated selector', () => {
    const doc = makePlainDocument(NAV_FORK_HTML);
    const target = query(doc, '#js-nav-sidebar .MuiStack-root');
    const descriptor = generateDescriptor(target);

    const result = reanchorAnnotation(descriptor, doc, {
      scopeRoot: query(doc, '#js-nav-sidebar'),
    });

    expect(result?.element).toBe(target);
  });

  test('keeps the descriptor class list unfiltered so hashes are not lost', () => {
    const doc = makePlainDocument(MUI_CARD_HTML);
    const descriptor = generateDescriptor(query(doc, 'button'));

    expect(descriptor.classes).toContain('css-77aa88');
    expect(descriptor.cssSelector).not.toContain('css-77aa88');
  });
});

describe('generateXPath', () => {
  test('is unaffected by the selector changes', () => {
    const doc = makePlainDocument(NAV_FORK_HTML);
    const target = query(doc, 'main.content .MuiStack-root');

    expect(generateXPath(target)).toBe('/body/div/main/div');
  });
});
