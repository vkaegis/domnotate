// ============================================================
// Domnotate — Slide Observer
// ============================================================

import type { EventBus, SlideObserver } from '@/types/core';

export function createSlideObserver(): SlideObserver {
  let iframeEl: HTMLIFrameElement | null = null;
  let bus: EventBus | null = null;
  let slides: Element[] = [];
  let activeIndex: number | null = null;
  let mutationObserver: MutationObserver | null = null;

  function detectSlides(): void {
    const doc = iframeEl?.contentDocument;
    if (!doc) {
      slides = [];
      activeIndex = null;
      return;
    }

    // Primary heuristic: .deck > .slide[data-slide]
    let found = Array.from(doc.querySelectorAll('.deck > .slide[data-slide]'));

    // Fallback: multiple siblings with .slide class where exactly one has .active
    if (found.length === 0) {
      const allSlides = Array.from(doc.querySelectorAll('.slide'));
      if (allSlides.length > 1) {
        found = allSlides;
      }
    }

    slides = found;

    if (slides.length === 0) {
      activeIndex = null;
      return;
    }

    // Determine initial active slide
    activeIndex = findActiveIndex();
  }

  function findActiveIndex(): number {
    for (let i = 0; i < slides.length; i++) {
      if (slides[i].classList.contains('active')) {
        return i;
      }
    }
    return 0;
  }

  function onMutation(): void {
    const newIndex = findActiveIndex();
    if (newIndex !== activeIndex) {
      activeIndex = newIndex;
      bus?.emit({ type: 'slide:changed', slideIndex: newIndex });
    }
  }

  function attachObserver(): void {
    if (slides.length === 0) return;

    mutationObserver = new MutationObserver(onMutation);

    // Watch class attribute on each slide element
    for (const slide of slides) {
      mutationObserver.observe(slide, {
        attributes: true,
        attributeFilter: ['class'],
      });
    }
  }

  const observer: SlideObserver = {
    init(_iframeEl: HTMLIFrameElement, _bus: EventBus): void {
      iframeEl = _iframeEl;
      bus = _bus;

      detectSlides();
      attachObserver();
    },

    getActiveSlide(): number | null {
      if (slides.length === 0) return null;
      return activeIndex;
    },

    getSlideCount(): number | null {
      if (slides.length === 0) return null;
      return slides.length;
    },

    goToSlide(n: number): void {
      if (slides.length === 0 || n < 0 || n >= slides.length) return;

      const win = iframeEl?.contentWindow as any;

      // Try the iframe's goTo function first
      if (win && typeof win.goTo === 'function') {
        win.goTo(n);
        return;
      }

      // Fallback: toggle .active class directly
      for (let i = 0; i < slides.length; i++) {
        slides[i].classList.toggle('active', i === n);
      }
    },

    getSlideForElement(el: Element): number | undefined {
      if (slides.length === 0) return undefined;

      // Walk up to find nearest .slide ancestor
      let current: Element | null = el;
      while (current) {
        const idx = slides.indexOf(current);
        if (idx !== -1) return idx;

        // Check data-slide attribute as well
        if (current.classList.contains('slide') && current.hasAttribute('data-slide')) {
          const slideIdx = slides.indexOf(current);
          if (slideIdx !== -1) return slideIdx;
        }

        current = current.parentElement;
      }

      return undefined;
    },

    destroy(): void {
      if (mutationObserver) {
        mutationObserver.disconnect();
        mutationObserver = null;
      }
      slides = [];
      activeIndex = null;
      iframeEl = null;
      bus = null;
    },
  };

  return observer;
}
