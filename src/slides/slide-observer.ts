// ============================================================
// Domnotate — Slide Observer
// ============================================================

import type { EventBus, SlideObserver } from '@/types/core';

type ScopeKind = 'slide' | 'tabpanel';

export function createSlideObserver(): SlideObserver {
  let iframeEl: HTMLIFrameElement | null = null;
  let bus: EventBus | null = null;
  let slides: Element[] = [];
  let scopeKind: ScopeKind | null = null;
  let activeIndex: number | null = null;
  let mutationObserver: MutationObserver | null = null;

  function escapeAttrValue(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  function isHiddenScope(el: Element): boolean {
    if (el instanceof HTMLElement) {
      if (el.hidden) return true;
      if (el.style.display === 'none') return true;
      if (el.style.visibility === 'hidden') return true;
    }
    return el.getAttribute('aria-hidden') === 'true';
  }

  function detectSlides(): void {
    const doc = iframeEl?.contentDocument;
    if (!doc) {
      slides = [];
      scopeKind = null;
      activeIndex = null;
      return;
    }

    // Primary heuristic: .deck > .slide[data-slide]
    let found = Array.from(doc.querySelectorAll('.deck > .slide[data-slide]'));
    scopeKind = found.length > 0 ? 'slide' : null;

    // Fallback: multiple siblings with .slide class where exactly one has .active
    if (found.length === 0) {
      const allSlides = Array.from(doc.querySelectorAll('.slide'));
      if (allSlides.length > 1) {
        found = allSlides;
        scopeKind = 'slide';
      }
    }

    // Fallback: ARIA tab panels. Many HTML artifacts use tabbed panels instead
    // of slide decks, but annotations still need the same active-scope behavior.
    if (found.length === 0) {
      const tabPanels = Array.from(doc.querySelectorAll('[role="tabpanel"]'));
      if (tabPanels.length > 1) {
        found = tabPanels;
        scopeKind = 'tabpanel';
      }
    }

    slides = found;

    if (slides.length === 0) {
      scopeKind = null;
      activeIndex = null;
      return;
    }

    // Determine initial active slide
    activeIndex = findActiveIndex();
  }

  function findActiveIndex(): number {
    if (scopeKind === 'tabpanel') {
      for (let i = 0; i < slides.length; i++) {
        const panel = slides[i];
        if (!isHiddenScope(panel)) {
          return i;
        }
      }
    }

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

    // Watch attributes that usually mark active slides or active tab panels.
    for (const slide of slides) {
      mutationObserver.observe(slide, {
        attributes: true,
        attributeFilter: ['class', 'hidden', 'aria-hidden', 'style'],
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

      if (scopeKind === 'tabpanel') {
        const doc = iframeEl?.contentDocument;
        const panel = slides[n];
        const panelId = panel.id;
        const controller = panelId && doc
          ? doc.querySelector(`[aria-controls="${escapeAttrValue(panelId)}"]`)
          : null;

        if (controller instanceof HTMLElement) {
          controller.click();
          return;
        }

        for (let i = 0; i < slides.length; i++) {
          const isActive = i === n;
          const slide = slides[i];
          if (slide instanceof HTMLElement) {
            slide.hidden = !isActive;
          }
          slide.setAttribute('aria-hidden', isActive ? 'false' : 'true');
        }
        onMutation();
        return;
      }

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
      scopeKind = null;
      activeIndex = null;
      iframeEl = null;
      bus = null;
    },
  };

  return observer;
}
