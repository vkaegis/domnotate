import { describe, test, expect, vi, beforeEach } from 'vitest';
import { createSlideObserver } from '@/slides/slide-observer';
import { createEventBus } from '@/events';
import type { EventBus, SlideObserver } from '@/types/core';
import {
  makeAccordionAsPageDocument,
  makeActiveSlideDocument,
  makeAriaTabDocument,
  makeCarouselDocument,
  makeDeckSlideDocument,
  makeExplicitScopeDocument,
  makeFakeIframe,
  makeGenericActivePanelDocument,
  makeHashRouteDocument,
  makeMixedDashboardDocument,
  makeMultiAriaTabDocument,
  makeMultiGroupRenderedStateDocument,
  makeNestedTabSlidesDocument,
  makeNonsemanticCssTabsDocument,
  makePlainDocument,
  makeRadioTabsetDocument,
  makeWizardStepDocument,
} from '@/__tests__/fixtures';

describe('SlideObserver', () => {
  let bus: EventBus;
  let observer: SlideObserver;

  beforeEach(() => {
    bus = createEventBus();
    observer = createSlideObserver();
  });

  test('detects slide deck and reports active slide', () => {
    const doc = makeDeckSlideDocument(5, 2);
    const iframe = makeFakeIframe(doc);

    observer.init(iframe, bus);

    expect(observer.getSlideCount()).toBe(5);
    expect(observer.getActiveSlide()).toBe(2);
  });

  test('returns stable ViewScope records for slide decks', () => {
    const doc = makeDeckSlideDocument(3, 1);
    const iframe = makeFakeIframe(doc);

    observer.init(iframe, bus);

    expect(observer.getScopes()).toEqual([
      expect.objectContaining({
        kind: 'slide',
        id: '0',
        index: 0,
        label: 'Slide 1',
        selector: '.deck > .slide[data-slide="0"]',
      }),
      expect.objectContaining({
        kind: 'slide',
        id: '1',
        index: 1,
        label: 'Slide 2',
        selector: '.deck > .slide[data-slide="1"]',
      }),
      expect.objectContaining({
        kind: 'slide',
        id: '2',
        index: 2,
        label: 'Slide 3',
        selector: '.deck > .slide[data-slide="2"]',
      }),
    ]);
    expect(observer.getActiveScope()).toEqual(expect.objectContaining({ kind: 'slide', id: '1' }));
  });

  test('returns null for non-slide content', () => {
    const doc = makePlainDocument('<div><p>Hello</p></div>');
    const iframe = makeFakeIframe(doc);

    observer.init(iframe, bus);

    expect(observer.getSlideCount()).toBeNull();
    expect(observer.getActiveSlide()).toBeNull();
    expect(observer.getActiveScope()).toBeNull();
    expect(observer.getScopes()).toEqual([]);
  });

  test('getSlideForElement returns correct index', () => {
    const doc = makeDeckSlideDocument(3, 0);
    const iframe = makeFakeIframe(doc);

    observer.init(iframe, bus);

    const p = doc.querySelector('.slide[data-slide="1"] p')!;
    expect(observer.getSlideForElement(p)).toBe(1);

    const slide0 = doc.querySelector('.slide[data-slide="0"]')!;
    expect(observer.getSlideForElement(slide0)).toBe(0);
  });

  test('detects ARIA tab panels and reports the visible panel as active', () => {
    const doc = makeAriaTabDocument(1, 'hidden');
    const iframe = makeFakeIframe(doc);

    observer.init(iframe, bus);

    expect(observer.getSlideCount()).toBe(3);
    expect(observer.getActiveSlide()).toBe(1);
    expect(observer.getActiveScope()).toEqual(expect.objectContaining({
      kind: 'tabpanel',
      id: 'part-1',
      index: 1,
      label: 'Part 1',
      selector: '#part-1',
      controllerSelector: '[aria-controls="part-1"]',
      activation: 'click-controller',
    }));
  });

  test('detects ARIA tab panels hidden by aria-hidden', () => {
    const doc = makeAriaTabDocument(2, 'aria-hidden');
    const iframe = makeFakeIframe(doc);

    observer.init(iframe, bus);

    expect(observer.getSlideCount()).toBe(3);
    expect(observer.getActiveSlide()).toBe(2);
  });

  test('keeps active scopes for multiple independent hidden tab groups', () => {
    const doc = makeMultiAriaTabDocument([0, 1]);
    const iframe = makeFakeIframe(doc);

    observer.init(iframe, bus);

    expect(observer.getActiveScopes()).toEqual([
      expect.objectContaining({ id: 'aria-0-part-0' }),
      expect.objectContaining({ id: 'aria-1-part-1' }),
    ]);
  });

  test('fallback hidden activation only changes the target tab group', () => {
    const doc = makeMultiAriaTabDocument([0, 1]);
    const iframe = makeFakeIframe(doc);

    observer.init(iframe, bus);

    const targetScope = observer.getScopes().find((scope) => scope.id === 'aria-1-part-2')!;
    observer.activateScope(targetScope);

    expect((doc.getElementById('aria-0-part-0') as HTMLElement).hidden).toBe(false);
    expect((doc.getElementById('aria-0-part-1') as HTMLElement).hidden).toBe(true);
    expect((doc.getElementById('aria-1-part-1') as HTMLElement).hidden).toBe(true);
    expect((doc.getElementById('aria-1-part-2') as HTMLElement).hidden).toBe(false);
    expect(observer.getActiveScopes()).toEqual([
      expect.objectContaining({ id: 'aria-0-part-0' }),
      expect.objectContaining({ id: 'aria-1-part-2' }),
    ]);
  });

  test('detects CSS radio tabsets and keeps independent active scopes', () => {
    const doc = makeRadioTabsetDocument([1, 2]);
    const iframe = makeFakeIframe(doc);

    observer.init(iframe, bus);

    expect(observer.getScopes()).toHaveLength(6);
    expect(observer.getActiveScopes()).toEqual([
      expect.objectContaining({ kind: 'tabpanel', id: 'set-0-tab-1', label: 'Set 0 Tab 1' }),
      expect.objectContaining({ kind: 'tabpanel', id: 'set-1-tab-2', label: 'Set 1 Tab 2' }),
    ]);
    expect(observer.getScopeForElement(doc.querySelector('.p-1-2 .target')!)).toEqual(
      expect.objectContaining({ id: 'set-1-tab-2' }),
    );
  });

  test('activates CSS radio tabsets through their label controllers', () => {
    const doc = makeRadioTabsetDocument([0, 0]);
    const iframe = makeFakeIframe(doc);
    const scopeChanged = vi.fn();

    observer.init(iframe, bus);
    bus.on('scope:changed', scopeChanged);
    observer.activateScope(observer.getScopes()[5]);

    expect((doc.querySelector('#set-1-tab-2') as HTMLInputElement).checked).toBe(true);
    expect((doc.querySelector('.p-1-0') as HTMLElement).style.display).toBe('none');
    expect((doc.querySelector('.p-1-2') as HTMLElement).style.display).toBe('block');
    expect(observer.getActiveScopes()).toEqual([
      expect.objectContaining({ id: 'set-0-tab-0' }),
      expect.objectContaining({ id: 'set-1-tab-2' }),
    ]);
    expect(scopeChanged).toHaveBeenCalledWith({
      type: 'scope:changed',
      scope: expect.objectContaining({ id: 'set-1-tab-2' }),
      previousScope: expect.objectContaining({ id: 'set-1-tab-0' }),
    });
  });

  test('detects active-class slide groups without data-slide attributes', () => {
    const doc = makeActiveSlideDocument(4, 3);
    const iframe = makeFakeIframe(doc);

    observer.init(iframe, bus);

    expect(observer.getSlideCount()).toBe(4);
    expect(observer.getActiveSlide()).toBe(3);
  });

  test('keeps active scopes consistent when visible slides have no active marker', () => {
    const doc = makeActiveSlideDocument(3, -1);
    const iframe = makeFakeIframe(doc);

    observer.init(iframe, bus);

    expect(observer.getActiveScope()).toEqual(expect.objectContaining({
      kind: 'slide',
      index: 0,
    }));
    expect(observer.getActiveScopes()).toEqual([
      expect.objectContaining({
        kind: 'slide',
        index: 0,
      }),
    ]);
  });

  test('getSlideForElement returns correct index inside a tab panel', () => {
    const doc = makeAriaTabDocument(0, 'hidden');
    const iframe = makeFakeIframe(doc);

    observer.init(iframe, bus);

    const p = doc.querySelector('#part-2 p')!;
    expect(observer.getSlideForElement(p)).toBe(2);
    expect(observer.getScopeForElement(p)).toEqual(expect.objectContaining({
      kind: 'tabpanel',
      id: 'part-2',
      index: 2,
    }));
  });

  test('detects explicit Domnotate scope metadata first', () => {
    const doc = makeExplicitScopeDocument(2);
    const iframe = makeFakeIframe(doc);

    observer.init(iframe, bus);

    expect(observer.getSlideCount()).toBe(3);
    expect(observer.getActiveScope()).toEqual(expect.objectContaining({
      kind: 'custom',
      id: 'scope-2',
      index: 2,
      label: 'Scope 2',
      selector: '[data-domnotate-scope-id="scope-2"]',
    }));
    expect(observer.getScopes()[1]).toEqual(expect.objectContaining({
      kind: 'wizard-step',
      id: 'scope-1',
      label: 'Scope 1',
    }));
  });

  test('detects hash routes only when route state is explicit', () => {
    const doc = makeHashRouteDocument('details');
    const iframe = makeFakeIframe(doc, { location: { hash: '#details' } });

    observer.init(iframe, bus);

    expect(observer.getActiveScope()).toEqual(expect.objectContaining({
      kind: 'hash-route',
      id: 'details',
      label: 'Section 2',
      selector: '#details',
      activation: 'set-hash',
    }));

    observer.activateScope(observer.getScopes()[2]);

    expect((iframe.contentWindow as unknown as { location: { hash: string } }).location.hash).toBe('#settings');
    expect(observer.getActiveScope()).toEqual(expect.objectContaining({ kind: 'hash-route', id: 'settings' }));
  });

  test('uses active hash-route links when the URL hash is empty', () => {
    const doc = makeHashRouteDocument('details');
    const iframe = makeFakeIframe(doc, { location: { hash: '' } });

    observer.init(iframe, bus);

    expect(observer.getActiveScope()).toEqual(expect.objectContaining({
      kind: 'hash-route',
      id: 'details',
    }));
    expect(observer.getActiveScopes()).toEqual([
      expect.objectContaining({ kind: 'hash-route', id: 'details' }),
    ]);
  });

  test('updates hash-route scope when in-frame navigation changes the hash', () => {
    const doc = makeHashRouteDocument('details');
    const hashWindow = new EventTarget() as Window & { location: { hash: string } };
    Object.defineProperty(hashWindow, 'location', {
      value: { hash: '#details' },
      writable: true,
    });
    const iframe = makeFakeIframe(doc, hashWindow as unknown as Record<string, unknown>);
    const handler = vi.fn();

    observer.init(iframe, bus);
    bus.on('scope:changed', handler);

    hashWindow.location.hash = '#settings';
    hashWindow.dispatchEvent(new Event('hashchange'));

    expect(observer.getActiveScope()).toEqual(expect.objectContaining({ kind: 'hash-route', id: 'settings' }));
    expect(handler).toHaveBeenCalledWith({
      type: 'scope:changed',
      scope: expect.objectContaining({ kind: 'hash-route', id: 'settings' }),
      previousScope: expect.objectContaining({ kind: 'hash-route', id: 'details' }),
    });
  });

  test('does not treat ordinary long-form hash navigation as scoped content', () => {
    const doc = makePlainDocument(`
      <nav>
        <a href="#intro">Intro</a>
        <a href="#details">Details</a>
      </nav>
      <section id="intro"><p>Intro</p></section>
      <section id="details"><p>Details</p></section>
    `);
    const iframe = makeFakeIframe(doc, { location: { hash: '' } });

    observer.init(iframe, bus);

    expect(observer.getScopes()).toEqual([]);
    expect(observer.getActiveScope()).toBeNull();
  });

  test('detects carousel scopes and activates through controllers', () => {
    const doc = makeCarouselDocument(1);
    const iframe = makeFakeIframe(doc);

    observer.init(iframe, bus);

    expect(observer.getActiveScope()).toEqual(expect.objectContaining({
      kind: 'carousel',
      id: 'item-1',
      index: 1,
      label: 'Item 2',
      controllerSelector: '[aria-controls="item-1"]',
      activation: 'click-controller',
    }));

    observer.activateScope(observer.getScopes()[2]);

    expect(doc.querySelector('#item-1')?.classList.contains('active')).toBe(false);
    expect(doc.querySelector('#item-2')?.classList.contains('active')).toBe(true);
    expect(observer.getActiveScope()).toEqual(expect.objectContaining({ kind: 'carousel', id: 'item-2' }));
  });

  test('detects wizard step scopes with data-step markers', () => {
    const doc = makeWizardStepDocument(0);
    const iframe = makeFakeIframe(doc);

    observer.init(iframe, bus);
    observer.activateScope(observer.getScopes()[2]);

    expect(observer.getActiveScope()).toEqual(expect.objectContaining({
      kind: 'wizard-step',
      id: 'step-2',
      index: 2,
      label: 'Step 3',
    }));
    expect(doc.querySelector('#step-0')?.getAttribute('aria-hidden')).toBe('true');
    expect(doc.querySelector('#step-2')?.getAttribute('aria-hidden')).toBe('false');
  });

  test('detects generic active panels only with strong container evidence', () => {
    const doc = makeGenericActivePanelDocument(2);
    const iframe = makeFakeIframe(doc);

    observer.init(iframe, bus);

    expect(observer.getActiveScope()).toEqual(expect.objectContaining({
      kind: 'active-panel',
      id: 'panel-2',
      index: 2,
      label: 'View 3',
    }));
  });

  test('uses the nearest active scope for nested tabs containing slides', () => {
    const doc = makeNestedTabSlidesDocument(1, 1);
    const iframe = makeFakeIframe(doc);

    observer.init(iframe, bus);

    const nestedParagraph = doc.querySelector('#nested-tab-1 .slide[data-slide="1"] p')!;

    expect(observer.getActiveScope()).toEqual(expect.objectContaining({
      kind: 'slide',
      index: 3,
      label: 'Slide 4',
    }));
    expect(observer.getScopeForElement(nestedParagraph)).toEqual(expect.objectContaining({
      kind: 'slide',
      index: 3,
    }));
  });

  test('uses a unique selector for nested slides with repeated data-slide values', () => {
    const doc = makeNestedTabSlidesDocument(1, 1);
    const iframe = makeFakeIframe(doc);

    observer.init(iframe, bus);

    const nestedSlide = doc.querySelector('#nested-tab-1 .slide[data-slide="1"]')!;
    const scope = observer.getScopeForElement(nestedSlide)!;

    expect(scope.selector).not.toBe('.deck > .slide[data-slide="1"]');
    expect(doc.querySelector(scope.selector)).toBe(nestedSlide);
  });

  test('activates parent scopes before nested child scopes', () => {
    const doc = makeNestedTabSlidesDocument(0, 0);
    const iframe = makeFakeIframe(doc);

    observer.init(iframe, bus);

    const nestedParagraph = doc.querySelector('#nested-tab-1 .slide[data-slide="1"] p')!;
    const nestedScope = observer.getScopeForElement(nestedParagraph)!;

    observer.activateScope(nestedScope);

    expect((doc.querySelector('#nested-tab-0') as HTMLElement).hidden).toBe(true);
    expect((doc.querySelector('#nested-tab-1') as HTMLElement).hidden).toBe(false);
    expect(doc.querySelector('#nested-tab-1 .slide[data-slide="1"]')?.classList.contains('active')).toBe(true);
    expect(observer.getActiveScope()).toEqual(
      expect.objectContaining({ kind: 'slide', index: 3 }),
    );
  });

  test('activateScope toggles explicit active scopes', () => {
    const doc = makeExplicitScopeDocument(0);
    const iframe = makeFakeIframe(doc);

    observer.init(iframe, bus);
    const targetScope = observer.getScopes()[2];

    observer.activateScope(targetScope);

    expect(doc.querySelector('[data-domnotate-scope-id="scope-0"]')?.classList.contains('active')).toBe(false);
    expect(doc.querySelector('[data-domnotate-scope-id="scope-2"]')?.classList.contains('active')).toBe(true);
    expect(observer.getActiveScope()).toEqual(expect.objectContaining({ id: 'scope-2' }));
  });

  test('activateScope emits slide:changed for explicit non-slide scopes', () => {
    const doc = makeExplicitScopeDocument(0);
    const iframe = makeFakeIframe(doc);

    observer.init(iframe, bus);
    const handler = vi.fn();
    bus.on('slide:changed', handler);

    observer.activateScope(observer.getScopes()[1]);

    expect(handler).toHaveBeenCalledWith({ type: 'slide:changed', slideIndex: 1 });
  });

  test('getSlideForElement returns undefined for elements outside slides', () => {
    const doc = makeDeckSlideDocument(3, 0);
    // Add an element outside the deck
    const outside = doc.createElement('div');
    outside.className = 'toolbar';
    doc.body.appendChild(outside);

    const iframe = makeFakeIframe(doc);
    observer.init(iframe, bus);

    expect(observer.getSlideForElement(outside)).toBeUndefined();
  });

  test('goToSlide toggles active class when no goTo function', () => {
    const doc = makeDeckSlideDocument(3, 0);
    const iframe = makeFakeIframe(doc);

    observer.init(iframe, bus);
    expect(observer.getActiveSlide()).toBe(0);

    observer.goToSlide(2);

    const slides = doc.querySelectorAll('.slide');
    expect(slides[0].classList.contains('active')).toBe(false);
    expect(slides[2].classList.contains('active')).toBe(true);
    expect(observer.getActiveScope()).toEqual(expect.objectContaining({ kind: 'slide', index: 2 }));
  });

  test('goToSlide calls iframe goTo function when available', () => {
    const doc = makeDeckSlideDocument(3, 0);
    const goToFn = vi.fn();
    const iframe = makeFakeIframe(doc, { goTo: goToFn });

    observer.init(iframe, bus);
    observer.goToSlide(1);

    expect(goToFn).toHaveBeenCalledWith(1);
  });

  test('goToSlide clicks the controlling tab for tab panels', () => {
    const doc = makeAriaTabDocument(0, 'hidden');
    const iframe = makeFakeIframe(doc);

    observer.init(iframe, bus);
    observer.goToSlide(2);

    expect((doc.querySelector('#part-0') as HTMLElement).hidden).toBe(true);
    expect((doc.querySelector('#part-2') as HTMLElement).hidden).toBe(false);
    expect(observer.getActiveScope()).toEqual(expect.objectContaining({ kind: 'tabpanel', index: 2 }));
  });

  test('goToSlide clicks the controlling tab for aria-hidden tab panels', () => {
    const doc = makeAriaTabDocument(0, 'aria-hidden');
    const iframe = makeFakeIframe(doc);

    observer.init(iframe, bus);
    observer.goToSlide(2);

    expect(doc.querySelector('#part-0')?.getAttribute('aria-hidden')).toBe('true');
    expect(doc.querySelector('#part-2')?.getAttribute('aria-hidden')).toBe('false');
  });

  test('emits slide:changed when active class changes via MutationObserver', async () => {
    const doc = makeDeckSlideDocument(3, 0);
    const iframe = makeFakeIframe(doc);

    observer.init(iframe, bus);

    const handler = vi.fn();
    bus.on('slide:changed', handler);

    // Simulate slide change
    const slides = doc.querySelectorAll('.slide');
    slides[0].classList.remove('active');
    slides[1].classList.add('active');

    // MutationObserver fires asynchronously
    await new Promise((r) => setTimeout(r, 10));

    expect(handler).toHaveBeenCalledWith({ type: 'slide:changed', slideIndex: 1 });
  });

  test('emits scope:changed when active class changes via MutationObserver', async () => {
    const doc = makeDeckSlideDocument(3, 0);
    const iframe = makeFakeIframe(doc);

    observer.init(iframe, bus);

    const handler = vi.fn();
    bus.on('scope:changed', handler);

    const slides = doc.querySelectorAll('.slide');
    slides[0].classList.remove('active');
    slides[1].classList.add('active');

    await new Promise((r) => setTimeout(r, 10));

    expect(handler).toHaveBeenCalledWith({
      type: 'scope:changed',
      scope: expect.objectContaining({ kind: 'slide', index: 1 }),
      previousScope: expect.objectContaining({ kind: 'slide', index: 0 }),
    });
  });

  test('emits slide:changed when active tab panel hidden state changes', async () => {
    const doc = makeAriaTabDocument(0, 'hidden');
    const iframe = makeFakeIframe(doc);

    observer.init(iframe, bus);

    const handler = vi.fn();
    bus.on('slide:changed', handler);

    (doc.querySelector('#part-0') as HTMLElement).hidden = true;
    (doc.querySelector('#part-1') as HTMLElement).hidden = false;

    // MutationObserver fires asynchronously
    await new Promise((r) => setTimeout(r, 10));

    expect(handler).toHaveBeenCalledWith({ type: 'slide:changed', slideIndex: 1 });
  });

  test('emits slide:changed when active tab panel aria-hidden state changes', async () => {
    const doc = makeAriaTabDocument(0, 'aria-hidden');
    const iframe = makeFakeIframe(doc);

    observer.init(iframe, bus);

    const handler = vi.fn();
    bus.on('slide:changed', handler);

    doc.querySelector('#part-0')?.setAttribute('aria-hidden', 'true');
    doc.querySelector('#part-1')?.setAttribute('aria-hidden', 'false');

    // MutationObserver fires asynchronously
    await new Promise((r) => setTimeout(r, 10));

    expect(handler).toHaveBeenCalledWith({ type: 'slide:changed', slideIndex: 1 });
  });

  test('destroy cleans up state', () => {
    const doc = makeDeckSlideDocument(3, 0);
    const iframe = makeFakeIframe(doc);

    observer.init(iframe, bus);
    expect(observer.getSlideCount()).toBe(3);

    observer.destroy();

    expect(observer.getSlideCount()).toBeNull();
    expect(observer.getActiveSlide()).toBeNull();
  });

  test('infers nonsemantic CSS tab scopes from rendered visibility state', () => {
    const doc = makeNonsemanticCssTabsDocument(1);
    const iframe = makeFakeIframe(doc);

    observer.init(iframe, bus);

    expect(observer.getScopes()).toHaveLength(3);
    expect(observer.getActiveScope()).toEqual(
      expect.objectContaining({ kind: 'active-panel', id: 'screen-1' }),
    );

    observer.activateScope(observer.getScopes()[2]);

    expect((doc.querySelector('#screen-1') as HTMLElement).style.display).toBe('none');
    expect((doc.querySelector('#screen-2') as HTMLElement).style.display).toBe('');
    expect(observer.getActiveScope()).toEqual(
      expect.objectContaining({ kind: 'active-panel', id: 'screen-2' }),
    );
  });

  test('does not scope mixed dashboard regions where all sections are visible', () => {
    const doc = makeMixedDashboardDocument();
    const iframe = makeFakeIframe(doc);

    observer.init(iframe, bus);

    expect(observer.getScopes()).toEqual([]);
    expect(observer.getActiveScope()).toBeNull();
  });

  test('infers details accordion-as-page scopes and activates by toggling open', () => {
    const doc = makeAccordionAsPageDocument(0);
    const iframe = makeFakeIframe(doc);

    observer.init(iframe, bus);

    expect(observer.getActiveScope()).toEqual(
      expect.objectContaining({ kind: 'active-panel', id: 'page-0' }),
    );

    observer.activateScope(observer.getScopes()[2]);

    expect(doc.querySelector('#page-0')?.hasAttribute('open')).toBe(false);
    expect(doc.querySelector('#page-2')?.hasAttribute('open')).toBe(true);
    expect(observer.getActiveScope()).toEqual(
      expect.objectContaining({ kind: 'active-panel', id: 'page-2' }),
    );
  });

  test('tracks multiple independent rendered-state groups as separate active scopes', () => {
    const doc = makeMultiGroupRenderedStateDocument();
    const iframe = makeFakeIframe(doc);

    observer.init(iframe, bus);

    expect(observer.getScopes()).toHaveLength(6);
    expect(observer.getActiveScopes()).toEqual([
      expect.objectContaining({ id: 'g0-panel-0' }),
      expect.objectContaining({ id: 'g1-panel-1' }),
    ]);

    const g1Target = doc.querySelector('#g1-panel-2 p')!;
    expect(observer.getScopeForElement(g1Target)).toEqual(
      expect.objectContaining({ id: 'g1-panel-2' }),
    );
  });

  test('rendered-state activation in one group does not mutate other independent groups', () => {
    const doc = makeMultiGroupRenderedStateDocument();
    const iframe = makeFakeIframe(doc);

    observer.init(iframe, bus);

    const beforeGroup0 = ['g0-panel-0', 'g0-panel-1', 'g0-panel-2'].map(
      (id) => (doc.getElementById(id) as HTMLElement).style.display,
    );

    const g1TargetScope = observer.getScopes().find((scope) => scope.id === 'g1-panel-2')!;
    observer.activateScope(g1TargetScope);

    const afterGroup0 = ['g0-panel-0', 'g0-panel-1', 'g0-panel-2'].map(
      (id) => (doc.getElementById(id) as HTMLElement).style.display,
    );
    expect(afterGroup0).toEqual(beforeGroup0);

    expect((doc.getElementById('g1-panel-1') as HTMLElement).style.display).toBe('none');
    expect((doc.getElementById('g1-panel-2') as HTMLElement).style.display).toBe('');
    expect(observer.getActiveScopes()).toEqual([
      expect.objectContaining({ id: 'g0-panel-0' }),
      expect.objectContaining({ id: 'g1-panel-2' }),
    ]);
  });

  test('goToSlide ignores out-of-range values', () => {
    const doc = makeDeckSlideDocument(3, 0);
    const iframe = makeFakeIframe(doc);

    observer.init(iframe, bus);

    observer.goToSlide(-1);
    observer.goToSlide(5);

    // Active slide should remain unchanged
    expect(doc.querySelector('.slide.active')?.getAttribute('data-slide')).toBe('0');
  });
});
