// ============================================================
// Domnotate — View Scope Observer
// ============================================================

import type { EventBus, SlideObserver, ViewScope, ViewScopeKind } from '@/types/core';

type ScopeRecord = {
  el: Element;
  scope: ViewScope;
  isActive?: () => boolean;
  activate?: () => void;
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
  let activeSignature = '';
  let mutationObserver: MutationObserver | null = null;
  let controllerCleanups: Array<() => void> = [];
  let hashChangeWindow: (Window & {
    addEventListener(type: 'hashchange', listener: () => void): void;
    removeEventListener(type: 'hashchange', listener: () => void): void;
  }) | null = null;

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
    const htmlLike = el as Element & {
      hidden?: boolean;
      style?: { display?: string; visibility?: string };
    };
    if (htmlLike.hidden === true) return true;
    if (htmlLike.style?.display === 'none') return true;
    if (htmlLike.style?.visibility === 'hidden') return true;
    const view = el.ownerDocument.defaultView;
    if (view) {
      const style = view.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return true;
    }
    return el.getAttribute('aria-hidden') === 'true';
  }

  function isHiddenBySelfOrAncestor(el: Element): boolean {
    let current: Element | null = el;
    while (current && current.tagName.toLowerCase() !== 'body') {
      if (isHiddenScope(current)) return true;
      current = current.parentElement;
    }
    return false;
  }

  function elementDepth(el: Element): number {
    let depth = 0;
    let current: Element | null = el;
    while (current.parentElement) {
      depth++;
      current = current.parentElement;
    }
    return depth;
  }

  function hasActiveMarker(el: Element): boolean {
    return (
      el.classList.contains('active') ||
      el.classList.contains('is-active') ||
      el.classList.contains('swiper-slide-active') ||
      el.getAttribute('aria-current') === 'true' ||
      el.getAttribute('aria-current') === 'page' ||
      el.getAttribute('aria-selected') === 'true' ||
      el.getAttribute('aria-hidden') === 'false'
    );
  }

  function getLocationHash(): string {
    const hash = (iframeEl?.contentWindow as { location?: { hash?: string } } | null)?.location?.hash;
    return hash?.startsWith('#') ? hash.slice(1) : '';
  }

  function getElementText(el: Element | null): string | undefined {
    const text = el?.textContent?.trim();
    return text || undefined;
  }

  function isUniqueSelectorForElement(el: Element, selector: string): boolean {
    try {
      const doc = el.ownerDocument;
      const matches = Array.from(doc.querySelectorAll(selector));
      return matches.length === 1 && matches[0] === el;
    } catch {
      return false;
    }
  }

  function selectorForElement(el: Element): string {
    if (el.id) return `#${escapeIdentifier(el.id)}`;

    const scopeId = el.getAttribute('data-domnotate-scope-id');
    if (scopeId) {
      return `[data-domnotate-scope-id="${escapeAttrValue(scopeId)}"]`;
    }

    if (el.classList.contains('slide') && el.hasAttribute('data-slide')) {
      const candidate = `.deck > .slide[data-slide="${escapeAttrValue(el.getAttribute('data-slide') ?? '')}"]`;
      if (isUniqueSelectorForElement(el, candidate)) return candidate;
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
    const htmlFor = controller.getAttribute('for');
    if (htmlFor) return `label[for="${escapeAttrValue(htmlFor)}"]`;
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
    if (el.classList.contains('is-active')) return '.is-active';
    if (el.classList.contains('swiper-slide-active')) return '.swiper-slide-active';
    if (el.getAttribute('aria-hidden') === 'false') return '[aria-hidden="false"]';
    if (kind === 'tabpanel' && !isHiddenScope(el)) return ':not([hidden])';
    if (kind === 'hash-route') return ':target';
    return undefined;
  }

  function createScopeRecord(
    doc: Document,
    el: Element,
    index: number,
    kind: ViewScopeKind,
    fallbackPrefix: string,
    options: {
      id?: string;
      label?: string;
      controller?: Element | null;
      isActive?: () => boolean;
      activate?: () => void;
    } = {},
  ): ScopeRecord {
    const controller = options.controller ?? findController(doc, el);
    const selector = selectorForElement(el);
    const hasGoTo = kind === 'slide' && typeof (iframeEl?.contentWindow as any)?.goTo === 'function';
    const activation = controller
      ? 'click-controller'
      : hasGoTo
        ? 'call-goTo'
        : kind === 'hash-route'
          ? 'set-hash'
          : kind === 'tabpanel'
          ? 'set-hidden'
          : 'toggle-active';

    return {
      el,
      scope: {
        kind,
        id: options.id ?? scopeIdFor(el, index, fallbackPrefix.toLowerCase()),
        index,
        label: options.label ?? labelForScope(doc, el, index, fallbackPrefix),
        selector,
        activeSelector: activeSelectorFor(el, kind),
        controllerSelector: controllerSelectorFor(controller),
        activation,
      },
      isActive: options.isActive,
      activate: options.activate,
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

  function detectRadioTabPanels(doc: Document): ScopeRecord[] {
    const records: ScopeRecord[] = [];
    const tabsets = Array.from(doc.querySelectorAll('.tabset'));

    for (const tabset of tabsets) {
      const inputs = Array.from(
        tabset.querySelectorAll('input[type="radio"]'),
      ) as HTMLInputElement[];
      const panels = Array.from(tabset.querySelectorAll('.tabpanels > .panel'));
      const hasTabstrip = tabset.querySelector('[role="tablist"], .tabstrip') !== null;

      if (!hasTabstrip || inputs.length < 2 || panels.length < 2) continue;

      const count = Math.min(inputs.length, panels.length);
      for (let i = 0; i < count; i++) {
        const input = inputs[i];
        const panel = panels[i];
        if (!input.id) continue;

        const controller = tabset.querySelector(`label[for="${escapeAttrValue(input.id)}"]`);
        const inputSelector = `#${escapeIdentifier(input.id)}`;
        const record = createScopeRecord(doc, panel, records.length, 'tabpanel', 'Tab', {
          id: input.id,
          label: getElementText(controller) ?? `Tab ${records.length + 1}`,
          controller,
          isActive: () => input.checked || !isHiddenBySelfOrAncestor(panel),
          activate: () => {
            const clickableController = controller as (Element & { click?: () => void }) | null;
            if (typeof clickableController?.click === 'function') {
              clickableController.click();
            } else {
              input.checked = true;
              input.dispatchEvent(new Event('change', { bubbles: true }));
            }
          },
        });
        record.scope = {
          ...record.scope,
          activeSelector: `${inputSelector}:checked`,
        };
        records.push(record);
      }
    }

    return records.length >= 2 ? records : [];
  }

  function detectHashRoutes(doc: Document): ScopeRecord[] {
    const links = Array.from(doc.querySelectorAll('a[href^="#"]')).filter((link) => {
      const hash = link.getAttribute('href')?.slice(1);
      return hash !== undefined && hash.length > 0;
    });
    if (links.length < 2) return [];

    const linkedIds = new Set(links.map((link) => link.getAttribute('href')?.slice(1)).filter(Boolean));
    const candidates = Array.from(
      doc.querySelectorAll('section[id], article[id], [role="region"][id], [data-route][id], [data-view][id], [data-page][id]'),
    ).filter((el) => el.id && linkedIds.has(el.id));
    if (candidates.length < 2) return [];

    const currentHash = getLocationHash();
    const hasActiveRouteEvidence =
      (currentHash !== '' && candidates.some((el) => el.id === currentHash)) ||
      links.some((link) => {
        const href = link.getAttribute('href');
        return (
          link.classList.contains('active') ||
          link.classList.contains('is-active') ||
          link.getAttribute('aria-current') === 'page' ||
          (currentHash !== '' && href === `#${currentHash}`)
        );
      });
    if (!hasActiveRouteEvidence) return [];

    return candidates.map((el, index) => createScopeRecord(doc, el, index, 'hash-route', 'Section'));
  }

  function firstSameParentGroup(elements: Element[]): Element[] {
    const groups = new Map<Element, Element[]>();
    for (const el of elements) {
      const parent = el.parentElement;
      if (!parent) continue;
      const group = groups.get(parent) ?? [];
      group.push(el);
      groups.set(parent, group);
    }
    return Array.from(groups.values()).find((group) => group.length >= 2) ?? [];
  }

  function hasSingleActiveOrVisible(elements: Element[]): boolean {
    const activeCount = elements.filter(hasActiveMarker).length;
    if (activeCount === 1) return true;

    const visibleCount = elements.filter((el) => !isHiddenBySelfOrAncestor(el)).length;
    return visibleCount === 1;
  }

  function detectCarouselScopes(doc: Document): ScopeRecord[] {
    const container = doc.querySelector('[aria-roledescription="carousel"], [data-carousel], .carousel, .swiper');
    if (container) {
      const items = Array.from(
        container.querySelectorAll(
          '.carousel-item, .swiper-slide, [aria-roledescription="slide"], [data-carousel-item]',
        ),
      );
      if (items.length >= 2) {
        return items.map((el, index) => createScopeRecord(doc, el, index, 'carousel', 'Item'));
      }
    }

    const standaloneItems = firstSameParentGroup(Array.from(doc.querySelectorAll('.carousel-item, .swiper-slide')));
    if (standaloneItems.length < 2) return [];

    const parentClass = standaloneItems[0].parentElement?.className.toString() ?? '';
    const hasCarouselParent = /\b(carousel|swiper)\b/.test(parentClass);
    if (!hasCarouselParent && !hasSingleActiveOrVisible(standaloneItems)) return [];

    return standaloneItems.map((el, index) => createScopeRecord(doc, el, index, 'carousel', 'Item'));
  }

  function detectWizardSteps(doc: Document): ScopeRecord[] {
    const dataStepGroup = firstSameParentGroup(Array.from(doc.querySelectorAll('[data-step]')));
    if (dataStepGroup.length >= 2) {
      return dataStepGroup.map((el, index) => createScopeRecord(doc, el, index, 'wizard-step', 'Step'));
    }

    const stepGroup = firstSameParentGroup(Array.from(doc.querySelectorAll('.step')));
    if (stepGroup.length < 2) return [];

    const parent = stepGroup[0].parentElement;
    const parentEvidence = parent?.matches('[data-wizard], [data-steps], .wizard, .steps') ?? false;
    const controllerCount = stepGroup.filter((el) => findController(doc, el) !== null).length;
    if (!parentEvidence && controllerCount < 2 && !hasSingleActiveOrVisible(stepGroup)) return [];

    return stepGroup.map((el, index) => createScopeRecord(doc, el, index, 'wizard-step', 'Step'));
  }

  function detectGenericActivePanels(doc: Document): ScopeRecord[] {
    const parents = Array.from(
      doc.querySelectorAll('[data-view-container], [data-panel-container], [data-active-panel-container]'),
    );

    for (const parent of parents) {
      const panels = Array.from(parent.children).filter((child) => {
        return (
          child.hasAttribute('data-panel') ||
          child.hasAttribute('data-view') ||
          child.getAttribute('role') === 'region' ||
          findController(doc, child) !== null
        );
      });
      if (panels.length < 2) continue;

      const controllerCount = panels.filter((panel) => findController(doc, panel) !== null).length;
      const hasDataEvidence = panels.some((panel) => panel.hasAttribute('data-panel') || panel.hasAttribute('data-view'));
      if (!hasDataEvidence && controllerCount < 2) continue;
      if (!hasSingleActiveOrVisible(panels)) continue;

      return panels.map((el, index) => createScopeRecord(doc, el, index, 'active-panel', 'View'));
    }

    return [];
  }

  function appendUniqueRecords(records: ScopeRecord[], detected: ScopeRecord[]): void {
    for (const record of detected) {
      if (!records.some(({ el }) => el === record.el)) {
        records.push(record);
      }
    }
  }

  function ensureUniqueScopeIds(records: ScopeRecord[]): void {
    const counts = new Map<string, number>();
    for (const { scope } of records) {
      counts.set(scope.id, (counts.get(scope.id) ?? 0) + 1);
    }

    records.forEach((record, recordIndex) => {
      if ((counts.get(record.scope.id) ?? 0) > 1) {
        record.scope = {
          ...record.scope,
          id: `${record.scope.id}-${recordIndex}`,
        };
      }
    });
  }

  function detectScopes(): void {
    const doc = iframeEl?.contentDocument;
    if (!doc) {
      scopeRecords = [];
      activeIndex = null;
      activeSignature = '';
      return;
    }

    const explicitScopes = detectExplicitScopes(doc);
    if (explicitScopes.length > 0) {
      ensureUniqueScopeIds(explicitScopes);
      scopeRecords = explicitScopes;
      activeIndex = findActiveIndex();
      activeSignature = getActiveSignature();
      return;
    }

    const detectedRecords: ScopeRecord[] = [];
    const deckSlides = detectDeckSlides(doc);
    appendUniqueRecords(detectedRecords, deckSlides.length > 0 ? deckSlides : detectActiveSlides(doc));
    appendUniqueRecords(detectedRecords, detectTabPanels(doc));
    appendUniqueRecords(detectedRecords, detectRadioTabPanels(doc));
    appendUniqueRecords(detectedRecords, detectHashRoutes(doc));
    appendUniqueRecords(detectedRecords, detectCarouselScopes(doc));
    appendUniqueRecords(detectedRecords, detectWizardSteps(doc));
    appendUniqueRecords(detectedRecords, detectGenericActivePanels(doc));
    ensureUniqueScopeIds(detectedRecords);

    scopeRecords = detectedRecords;

    if (scopeRecords.length === 0) {
      activeIndex = null;
      activeSignature = '';
      return;
    }

    activeIndex = findActiveIndex();
    activeSignature = getActiveSignature();
  }

  function isRecordActive(record: ScopeRecord): boolean {
    if (record.isActive) return record.isActive();
    return hasActiveMarker(record.el) || !isHiddenBySelfOrAncestor(record.el);
  }

  function activeRecordIndexes(): number[] {
    if (scopeRecords.length === 0) return [];

    const currentHash = getLocationHash();
    if (currentHash) {
      const hashIndex = scopeRecords.findIndex(({ scope }) => scope.kind === 'hash-route' && scope.id === currentHash);
      if (hashIndex !== -1) return [hashIndex];
    }

    const explicitActiveIndexes = scopeRecords
      .map((record, index) => ({ record, index }))
      .filter(({ record }) =>
        record.isActive ? record.isActive() : hasActiveMarker(record.el) && !isHiddenBySelfOrAncestor(record.el),
      )
      .map(({ index }) => index);
    if (explicitActiveIndexes.length > 0) return explicitActiveIndexes;

    const visibleIndexes = scopeRecords
      .map((record, index) => ({ record, index }))
      .filter(({ record }) => !isHiddenBySelfOrAncestor(record.el))
      .map(({ index }) => index);

    return visibleIndexes.length === 1 ? visibleIndexes : [];
  }

  function getActiveSignature(): string {
    return activeRecordIndexes().join(',');
  }

  function parseActiveSignature(signature: string): number[] {
    if (!signature) return [];
    return signature.split(',').map(Number).filter(Number.isFinite);
  }

  function getChangedActiveIndex(oldSignature: string, newSignature: string, fallbackIndex: number): number {
    const oldIndexes = new Set(parseActiveSignature(oldSignature));
    const newIndexes = parseActiveSignature(newSignature);
    return newIndexes.find((index) => !oldIndexes.has(index)) ?? fallbackIndex;
  }

  function getPreviousScopeForSignatureChange(oldSignature: string, newSignature: string): ViewScope | null {
    const newIndexes = new Set(parseActiveSignature(newSignature));
    const removedIndex = parseActiveSignature(oldSignature).find((index) => !newIndexes.has(index));
    return removedIndex === undefined ? null : scopeRecords[removedIndex]?.scope ?? null;
  }

  function findActiveIndex(): number {
    if (scopeRecords.length === 0) return 0;

    const currentHash = getLocationHash();
    if (currentHash) {
      const hashIndex = scopeRecords.findIndex(({ scope }) => scope.kind === 'hash-route' && scope.id === currentHash);
      if (hashIndex !== -1) return hashIndex;
    }

    const ranked = scopeRecords
      .map((record, index) => {
        const depth = elementDepth(record.el);
        const visible = !isHiddenBySelfOrAncestor(record.el);
        let score = visible ? 10 : 0;
        if (visible && record.el.classList.contains('active')) score += 100;
        if (visible && record.el.classList.contains('is-active')) score += 100;
        if (visible && record.el.classList.contains('swiper-slide-active')) score += 100;
        if (visible && record.el.getAttribute('aria-hidden') === 'false') score += 80;
        if (visible && record.el.getAttribute('aria-selected') === 'true') score += 70;
        return { index, depth, score, visible };
      })
      .filter((candidate) => candidate.score > 0)
      .sort((a, b) => b.score - a.score || b.depth - a.depth || a.index - b.index);

    if (ranked.length > 0) return ranked[0].index;

    const visibleScopes = scopeRecords
      .map((record, index) => ({ record, index, depth: elementDepth(record.el) }))
      .filter(({ record }) => isRecordActive(record));
    if (visibleScopes.length === 1) return visibleScopes[0].index;
    if (visibleScopes.length > 1) {
      return visibleScopes.sort((a, b) => b.depth - a.depth || a.index - b.index)[0].index;
    }

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
    const newSignature = getActiveSignature();
    if (newIndex !== activeIndex || newSignature !== activeSignature) {
      const changedIndex = getChangedActiveIndex(activeSignature, newSignature, newIndex);
      const previousScope =
        getPreviousScopeForSignatureChange(activeSignature, newSignature) ??
        (activeIndex === null ? null : scopeRecords[activeIndex]?.scope ?? null);
      activeIndex = newIndex;
      activeSignature = newSignature;
      emitScopeChange(previousScope, changedIndex);
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

  function detachControllerObservers(): void {
    for (const cleanup of controllerCleanups) cleanup();
    controllerCleanups = [];
  }

  function attachControllerObservers(): void {
    const doc = iframeEl?.contentDocument;
    if (!doc) return;

    for (const record of scopeRecords) {
      if (!record.scope.controllerSelector) continue;
      const controller = doc.querySelector(record.scope.controllerSelector);
      if (!controller) continue;

      const handler = () => {
        requestAnimationFrame(onMutation);
      };
      controller.addEventListener('click', handler);
      controller.addEventListener('change', handler);
      controllerCleanups.push(() => {
        controller.removeEventListener('click', handler);
        controller.removeEventListener('change', handler);
      });
    }
  }

  function detachHashObserver(): void {
    hashChangeWindow?.removeEventListener('hashchange', onMutation);
    hashChangeWindow = null;
  }

  function attachHashObserver(): void {
    if (!scopeRecords.some(({ scope }) => scope.kind === 'hash-route')) return;

    const win = iframeEl?.contentWindow as
      | (Window & {
          addEventListener?: (type: 'hashchange', listener: () => void) => void;
          removeEventListener?: (type: 'hashchange', listener: () => void) => void;
        })
      | null;
    if (!win || typeof win.addEventListener !== 'function' || typeof win.removeEventListener !== 'function') {
      return;
    }

    win.addEventListener('hashchange', onMutation);
    hashChangeWindow = win as Window & {
      addEventListener(type: 'hashchange', listener: () => void): void;
      removeEventListener(type: 'hashchange', listener: () => void): void;
    };
  }

  function setHiddenActivation(scope: ViewScope): void {
    for (const record of scopeRecords) {
      const isActive = record.scope.id === scope.id;
      const htmlLike = record.el as Element & { hidden?: boolean };
      if ('hidden' in htmlLike) {
        htmlLike.hidden = !isActive;
      } else if (isActive) {
        record.el.removeAttribute('hidden');
      } else {
        record.el.setAttribute('hidden', '');
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
      detachControllerObservers();
      detachHashObserver();
      iframeEl = _iframeEl;
      bus = _bus;

      detectScopes();
      attachObserver();
      attachControllerObservers();
      attachHashObserver();
    },

    getActiveScope(): ViewScope | null {
      if (scopeRecords.length === 0 || activeIndex === null) return null;
      return scopeRecords[activeIndex]?.scope ?? null;
    },

    getActiveScopes(): ViewScope[] {
      return activeRecordIndexes()
        .map((index) => scopeRecords[index]?.scope)
        .filter((scope): scope is ViewScope => scope !== undefined);
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

    isScopeActive(scope: ViewScope): boolean {
      const index = scopeRecords.findIndex(({ scope: candidate }) => candidate.id === scope.id);
      return index !== -1 && activeRecordIndexes().includes(index);
    },

    activateScope(scope: ViewScope): void {
      const record = scopeRecords.find(({ scope: candidate }) => candidate.id === scope.id);
      if (!record) return;

      const doc = iframeEl?.contentDocument;
      if (!doc) return;

      const previousScope = activeIndex === null ? null : scopeRecords[activeIndex]?.scope ?? null;

      if (record.activate) {
        record.activate();
        onMutation();
        return;
      }

      if (record.scope.activation === 'click-controller' && record.scope.controllerSelector) {
        const controller = doc.querySelector(record.scope.controllerSelector);
        const clickableController = controller as (Element & { click?: () => void }) | null;
        if (typeof clickableController?.click === 'function') {
          clickableController.click();
          onMutation();
          return;
        }
      }

      if (record.scope.activation === 'call-goTo') {
        const win = iframeEl?.contentWindow as any;
        if (win && typeof win.goTo === 'function') {
          win.goTo(record.scope.index);
          onMutation();
          return;
        }
      }

      if (record.scope.activation === 'set-hash') {
        const win = iframeEl?.contentWindow as { location?: { hash?: string } } | null;
        if (win?.location) {
          win.location.hash = `#${record.scope.id}`;
        }
      }

      if (record.scope.activation === 'set-hidden') {
        setHiddenActivation(record.scope);
      } else if (record.scope.activation !== 'set-hash') {
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
      detachHashObserver();
      detachControllerObservers();
      scopeRecords = [];
      activeIndex = null;
      activeSignature = '';
      iframeEl = null;
      bus = null;
    },
  };

  return observer;
}
