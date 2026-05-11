import { describe, test, expect, vi, beforeEach } from 'vitest';
import { createSlideObserver } from '@/slides/slide-observer';
import { createEventBus } from '@/events';
import type { EventBus, SlideObserver } from '@/types/core';
import {
  makeActiveSlideDocument,
  makeAriaTabDocument,
  makeDeckSlideDocument,
  makeExplicitScopeDocument,
  makeFakeIframe,
  makePlainDocument,
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

  test('detects active-class slide groups without data-slide attributes', () => {
    const doc = makeActiveSlideDocument(4, 3);
    const iframe = makeFakeIframe(doc);

    observer.init(iframe, bus);

    expect(observer.getSlideCount()).toBe(4);
    expect(observer.getActiveSlide()).toBe(3);
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
