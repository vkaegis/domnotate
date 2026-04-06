import { describe, test, expect, vi, beforeEach } from 'vitest';
import { createSlideObserver } from '@/slides/slide-observer';
import { createEventBus } from '@/events';
import type { EventBus, SlideObserver } from '@/types/core';

function makeSlideDoc(slideCount: number, activeIndex = 0): Document {
  const doc = document.implementation.createHTMLDocument('slides');
  const deck = doc.createElement('div');
  deck.className = 'deck';

  for (let i = 0; i < slideCount; i++) {
    const slide = doc.createElement('div');
    slide.className = `slide${i === activeIndex ? ' active' : ''}`;
    slide.setAttribute('data-slide', String(i));
    slide.innerHTML = `<p>Slide ${i} content</p>`;
    deck.appendChild(slide);
  }

  doc.body.appendChild(deck);
  return doc;
}

function makeFakeIframe(doc: Document): HTMLIFrameElement {
  const iframe = document.createElement('iframe');
  Object.defineProperty(iframe, 'contentDocument', { value: doc, writable: true });
  Object.defineProperty(iframe, 'contentWindow', { value: {}, writable: true });
  return iframe;
}

describe('SlideObserver', () => {
  let bus: EventBus;
  let observer: SlideObserver;

  beforeEach(() => {
    bus = createEventBus();
    observer = createSlideObserver();
  });

  test('detects slide deck and reports active slide', () => {
    const doc = makeSlideDoc(5, 2);
    const iframe = makeFakeIframe(doc);

    observer.init(iframe, bus);

    expect(observer.getSlideCount()).toBe(5);
    expect(observer.getActiveSlide()).toBe(2);
  });

  test('returns null for non-slide content', () => {
    const doc = document.implementation.createHTMLDocument('plain');
    doc.body.innerHTML = '<div><p>Hello</p></div>';
    const iframe = makeFakeIframe(doc);

    observer.init(iframe, bus);

    expect(observer.getSlideCount()).toBeNull();
    expect(observer.getActiveSlide()).toBeNull();
  });

  test('getSlideForElement returns correct index', () => {
    const doc = makeSlideDoc(3, 0);
    const iframe = makeFakeIframe(doc);

    observer.init(iframe, bus);

    const p = doc.querySelector('.slide[data-slide="1"] p')!;
    expect(observer.getSlideForElement(p)).toBe(1);

    const slide0 = doc.querySelector('.slide[data-slide="0"]')!;
    expect(observer.getSlideForElement(slide0)).toBe(0);
  });

  test('getSlideForElement returns undefined for elements outside slides', () => {
    const doc = makeSlideDoc(3, 0);
    // Add an element outside the deck
    const outside = doc.createElement('div');
    outside.className = 'toolbar';
    doc.body.appendChild(outside);

    const iframe = makeFakeIframe(doc);
    observer.init(iframe, bus);

    expect(observer.getSlideForElement(outside)).toBeUndefined();
  });

  test('goToSlide toggles active class when no goTo function', () => {
    const doc = makeSlideDoc(3, 0);
    const iframe = makeFakeIframe(doc);

    observer.init(iframe, bus);
    expect(observer.getActiveSlide()).toBe(0);

    observer.goToSlide(2);

    const slides = doc.querySelectorAll('.slide');
    expect(slides[0].classList.contains('active')).toBe(false);
    expect(slides[2].classList.contains('active')).toBe(true);
  });

  test('goToSlide calls iframe goTo function when available', () => {
    const doc = makeSlideDoc(3, 0);
    const goToFn = vi.fn();
    const iframe = makeFakeIframe(doc);
    Object.defineProperty(iframe, 'contentWindow', { value: { goTo: goToFn }, writable: true });

    observer.init(iframe, bus);
    observer.goToSlide(1);

    expect(goToFn).toHaveBeenCalledWith(1);
  });

  test('emits slide:changed when active class changes via MutationObserver', async () => {
    const doc = makeSlideDoc(3, 0);
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

  test('destroy cleans up state', () => {
    const doc = makeSlideDoc(3, 0);
    const iframe = makeFakeIframe(doc);

    observer.init(iframe, bus);
    expect(observer.getSlideCount()).toBe(3);

    observer.destroy();

    expect(observer.getSlideCount()).toBeNull();
    expect(observer.getActiveSlide()).toBeNull();
  });

  test('goToSlide ignores out-of-range values', () => {
    const doc = makeSlideDoc(3, 0);
    const iframe = makeFakeIframe(doc);

    observer.init(iframe, bus);

    observer.goToSlide(-1);
    observer.goToSlide(5);

    // Active slide should remain unchanged
    expect(doc.querySelector('.slide.active')?.getAttribute('data-slide')).toBe('0');
  });
});
