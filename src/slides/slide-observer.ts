// ============================================================
// Domnotate — View Scope Observer
// ============================================================

import type { EventBus, SlideObserver, ViewScope, ViewScopeKind } from '@/types/core';

type ScopeRecord = {
  el: Element;
  scope: ViewScope;
};

const VIEW_SCOPE_KINDS: ViewScopeKind[] = [
  'slide',
  'tabpanel',
  'hash-route',
  'carousel',
  'wizard-step',
  'active-panel',
  'custom',
];

export function createSlideObserver(): SlideObserver {
  let iframeEl: HTMLIFrameElement | null = null;
  let bus: EventBus | null = null;
  let scopeRecords: ScopeRecord[] = [];
  let activeIndex: number | null = null;
  let mutationObserver: MutationObserver | null = null;

  function escapeAttrValue(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  function escapeIdentifier(value: string): string {
    type CssEscapeApi = { escape?: (ident: string) => string };
    const css =
      (iframeEl?.contentWindow as (Window & { CSS?: CssEscapeApi }) | null)?.CSS ??
      (globalThis as typeof globalThis & { CSS?: CssEscapeApi }).CSS;
    if (css?.escape) return css.escape(value);
    return value.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  }

  function isViewScopeKind(value: string | null): value is ViewScopeKind {
    return VIEW_SCOPE_KINDS.includes(value as ViewScopeKind);
  }

  function isHiddenScope(el: Element): boolean {
    if (el instanceof HTMLElement) {
      if (el.hidden) return true;
      if (el.style.display === 'none') return true;
      if (el.style.visibility === 'hidden') return true;
    }
    return el.getAttribute('aria-hidden') === 'true';
  }

  function getElementText(el: Element | null): string | undefined {
    const text = el?.textContent?.trim();
    return text || undefined;
  }

  function selectorForElement(el: Element): string {
    if (el.id) return `#${escapeIdentifier(el.id)}`;

    const scopeId = el.getAttribute('data-domnotate-scope-id');
    if (scopeId) {
      return `[data-domnotate-scope-id="${escapeAttrValue(scopeId)}"]`;
    }

    if (el.classList.contains('slide') && el.hasAttribute('data-slide')) {
      return `.deck > .slide[data-slide="${escapeAttrValue(el.getAttribute('data-slide') ?? '')}"]`;
    }

    const parts: string[] = [];
    let current: Element | null = el;
    while (current && current.parentElement) {
      const currentElement: Element = current;
      const parentElement = currentElement.parentElement;
      if (!parentElement) break;
      const tagName = currentElement.tagName.toLowerCase();
      const sameTagSiblings = Array.from(parentElement.children as HTMLCollectionOf<Element>).filter(
        (child) => child.tagName === currentElement.tagName,
      );
      const index = sameTagSiblings.indexOf(currentElement) + 1;
      parts.unshift(`${tagName}:nth-of-type(${index})`);
      current = parentElement;

      if (parentElement.tagName.toLowerCase() === 'body') break;
    }

    return parts.length > 0 ? `body > ${parts.join(' > ')}` : el.tagName.toLowerCase();
  }

  function findController(doc: Document, el: Element): Element | null {
    if (!el.id) return null;
    return doc.querySelector(`[aria-controls="${escapeAttrValue(el.id)}"]`);
  }

  function controllerSelectorFor(controller: Element | null): string | undefined {
    if (!controller) return undefined;
    if (controller.id) return `#${escapeIdentifier(controller.id)}`;
    const controls = controller.getAttribute('aria-controls');
    if (controls) return `[aria-controls="${escapeAttrValue(controls)}"]`;
    return undefined;
  }

  function labelForScope(doc: Document, el: Element, index: number, fallbackPrefix: string): string {
    const explicitLabel =
      el.getAttribute('data-domnotate-scope-label') ||
      el.getAttribute('aria-label') ||
      undefined;
    if (explicitLabel) return explicitLabel;

    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      const label = getElementText(doc.getElementById(labelledBy));
      if (label) return label;
    }

    const controllerLabel = getElementText(findController(doc, el));
    if (controllerLabel) return controllerLabel;

    return `${fallbackPrefix} ${index + 1}`;
  }

  function scopeIdFor(el: Element, index: number, prefix: string): string {
    return (
      el.getAttribute('data-domnotate-scope-id') ||
      el.id ||
      el.getAttribute('data-slide') ||
      `${prefix}-${index}`
    );
  }

  function activeSelectorFor(el: Element, kind: ViewScopeKind): string | undefined {
    if (el.classList.contains('active')) return '.active';
    if (el.getAttribute('aria-hidden') === 'false') return '[aria-hidden="false"]';
    if (kind === 'tabpanel' && el instanceof HTMLElement && !el.hidden) return ':not([hidden])';
    return undefined;
  }

  function createScopeRecord(
    doc: Document,
    el: Element,
    index: number,
    kind: ViewScopeKind,
    fallbackPrefix: string,
  ): ScopeRecord {
    const controller = findController(doc, el);
    const selector = selectorForElement(el);
    const hasGoTo = kind === 'slide' && typeof (iframeEl?.contentWindow as any)?.goTo === 'function';
    const activation = controller
      ? 'click-controller'
      : hasGoTo
        ? 'call-goTo'
        : kind === 'tabpanel'
          ? 'set-hidden'
          : 'toggle-active';

    return {
      el,
      scope: {
        kind,
        id: scopeIdFor(el, index, fallbackPrefix.toLowerCase()),
        index,
        label: labelForScope(doc, el, index, fallbackPrefix),
        selector,
        activeSelector: activeSelectorFor(el, kind),
        controllerSelector: controllerSelectorFor(controller),
        activation,
      },
    };
  }

  function detectExplicitScopes(doc: Document): ScopeRecord[] {
    const elements = Array.from(
      doc.querySelectorAll('[data-domnotate-scope], [data-domnotate-scope-id]'),
    );
    if (elements.length < 2) return [];

    return elements.map((el, index) => {
      const declaredKind = el.getAttribute('data-domnotate-scope');
      const kind = isViewScopeKind(declaredKind) ? declaredKind : 'custom';
      return createScopeRecord(doc, el, index, kind, 'View');
    });
  }

  function detectDeckSlides(doc: Document): ScopeRecord[] {
    const slides = Array.from(doc.querySelectorAll('.deck > .slide[data-slide]'));
    if (slides.length < 2) return [];
    return slides.map((el, index) => createScopeRecord(doc, el, index, 'slide', 'Slide'));
  }

  function detectActiveSlides(doc: Document): ScopeRecord[] {
    const slides = Array.from(doc.querySelectorAll('.slide'));
    if (slides.length < 2) return [];
    return slides.map((el, index) => createScopeRecord(doc, el, index, 'slide', 'Slide'));
  }

  function detectTabPanels(doc: Document): ScopeRecord[] {
    const panels = Array.from(doc.querySelectorAll('[role="tabpanel"]'));
    if (panels.length < 2) return [];
    return panels.map((el, index) => createScopeRecord(doc, el, index, 'tabpanel', 'Tab'));
  }

  function detectScopes(): void {
    const doc = iframeEl?.contentDocument;
    if (!doc) {
      scopeRecords = [];
      activeIndex = null;
      return;
    }

    const detectors = [
      detectExplicitScopes,
      detectDeckSlides,
      detectActiveSlides,
      detectTabPanels,
    ];

    scopeRecords = [];
    for (const detector of detectors) {
      const detected = detector(doc);
      if (detected.length > 0) {
        scopeRecords = detected;
        break;
      }
    }

    if (scopeRecords.length === 0) {
      activeIndex = null;
      return;
    }

    activeIndex = findActiveIndex();
  }

  function findActiveIndex(): number {
    if (scopeRecords.length === 0) return 0;

    const explicitActiveIndex = scopeRecords.findIndex(({ el }) => el.classList.contains('active'));
    if (explicitActiveIndex !== -1) return explicitActiveIndex;

    const ariaActiveIndex = scopeRecords.findIndex(({ el }) => el.getAttribute('aria-hidden') === 'false');
    if (ariaActiveIndex !== -1) return ariaActiveIndex;

    const visibleScopes = scopeRecords
      .map((record, index) => ({ record, index }))
      .filter(({ record }) => !isHiddenScope(record.el));
    if (visibleScopes.length === 1) return visibleScopes[0].index;

    return 0;
  }

  function emitScopeChange(previousScope: ViewScope | null, nextIndex: number): void {
    const nextScope = scopeRecords[nextIndex]?.scope;
    if (!nextScope) return;

    bus?.emit({ type: 'scope:changed', scope: nextScope, previousScope });

    bus?.emit({ type: 'slide:changed', slideIndex: nextScope.index });
  }

  function onMutation(): void {
    const newIndex = findActiveIndex();
    if (newIndex !== activeIndex) {
      const previousScope = activeIndex === null ? null : scopeRecords[activeIndex]?.scope ?? null;
      activeIndex = newIndex;
      emitScopeChange(previousScope, newIndex);
    }
  }

  function attachObserver(): void {
    if (scopeRecords.length === 0) return;

    mutationObserver = new MutationObserver(onMutation);

    for (const { el } of scopeRecords) {
      mutationObserver.observe(el, {
        attributes: true,
        attributeFilter: ['class', 'hidden', 'aria-hidden', 'style'],
      });
    }
  }

  function setHiddenActivation(scope: ViewScope): void {
    for (const record of scopeRecords) {
      const isActive = record.scope.id === scope.id;
      if (record.el instanceof HTMLElement) {
        record.el.hidden = !isActive;
      }
      record.el.setAttribute('aria-hidden', isActive ? 'false' : 'true');
    }
  }

  function setActiveActivation(scope: ViewScope): void {
    for (const record of scopeRecords) {
      record.el.classList.toggle('active', record.scope.id === scope.id);
    }
  }

  const observer: SlideObserver = {
    init(_iframeEl: HTMLIFrameElement, _bus: EventBus): void {
      mutationObserver?.disconnect();
      iframeEl = _iframeEl;
      bus = _bus;

      detectScopes();
      attachObserver();
    },

    getActiveScope(): ViewScope | null {
      if (scopeRecords.length === 0 || activeIndex === null) return null;
      return scopeRecords[activeIndex]?.scope ?? null;
    },

    getScopes(): ViewScope[] {
      return scopeRecords.map(({ scope }) => scope);
    },

    getScopeForElement(el: Element): ViewScope | undefined {
      let current: Element | null = el;
      while (current) {
        const record = scopeRecords.find(({ el: scopeEl }) => scopeEl === current);
        if (record) return record.scope;
        current = current.parentElement;
      }

      return undefined;
    },

    activateScope(scope: ViewScope): void {
      const record = scopeRecords.find(({ scope: candidate }) => candidate.id === scope.id);
      if (!record) return;

      const doc = iframeEl?.contentDocument;
      if (!doc) return;

      const previousScope = activeIndex === null ? null : scopeRecords[activeIndex]?.scope ?? null;

      if (record.scope.activation === 'click-controller' && record.scope.controllerSelector) {
        const controller = doc.querySelector(record.scope.controllerSelector);
        if (controller instanceof HTMLElement) {
          controller.click();
          onMutation();
          return;
        }
      }

      if (record.scope.activation === 'call-goTo') {
        const win = iframeEl?.contentWindow as any;
        if (win && typeof win.goTo === 'function') {
          win.goTo(record.scope.index);
          return;
        }
      }

      if (record.scope.activation === 'set-hidden') {
        setHiddenActivation(record.scope);
      } else {
        setActiveActivation(record.scope);
      }

      const nextIndex = scopeRecords.indexOf(record);
      if (nextIndex !== activeIndex) {
        activeIndex = nextIndex;
        emitScopeChange(previousScope, nextIndex);
      }
    },

    getActiveSlide(): number | null {
      return observer.getActiveScope()?.index ?? null;
    },

    getSlideCount(): number | null {
      return scopeRecords.length === 0 ? null : scopeRecords.length;
    },

    goToSlide(n: number): void {
      const scope = scopeRecords[n]?.scope;
      if (!scope) return;
      observer.activateScope(scope);
    },

    getSlideForElement(el: Element): number | undefined {
      return observer.getScopeForElement(el)?.index;
    },

    destroy(): void {
      if (mutationObserver) {
        mutationObserver.disconnect();
        mutationObserver = null;
      }
      scopeRecords = [];
      activeIndex = null;
      iframeEl = null;
      bus = null;
    },
  };

  return observer;
}
