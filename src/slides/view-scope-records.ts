import type { ViewScope, ViewScopeKind } from '@/types/core';

export type ScopeRecord = {
  el: Element;
  scope: ViewScope;
  isActive?: () => boolean;
  activate?: () => void;
};

export type ScopeRecordContext = {
  win?: (Window & { goTo?: (index: number) => void; CSS?: { escape?: (ident: string) => string } }) | null;
};

export const VIEW_SCOPE_KINDS: ViewScopeKind[] = [
  'slide',
  'tabpanel',
  'hash-route',
  'carousel',
  'wizard-step',
  'active-panel',
  'custom',
];

export function escapeAttrValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export function escapeIdentifier(value: string, win?: ScopeRecordContext['win']): string {
  type CssEscapeApi = { escape?: (ident: string) => string };
  const css = win?.CSS ?? (globalThis as typeof globalThis & { CSS?: CssEscapeApi }).CSS;
  if (css?.escape) return css.escape(value);
  return value.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}

export function isViewScopeKind(value: string | null): value is ViewScopeKind {
  return VIEW_SCOPE_KINDS.includes(value as ViewScopeKind);
}

export function isHiddenScope(el: Element): boolean {
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

export function isHiddenBySelfOrAncestor(el: Element): boolean {
  let current: Element | null = el;
  while (current && current.tagName.toLowerCase() !== 'body') {
    if (isHiddenScope(current)) return true;
    current = current.parentElement;
  }
  return false;
}

export function elementDepth(el: Element): number {
  let depth = 0;
  let current: Element | null = el;
  while (current.parentElement) {
    depth++;
    current = current.parentElement;
  }
  return depth;
}

export function hasActiveMarker(el: Element): boolean {
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

export function getElementText(el: Element | null): string | undefined {
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

export function selectorForElement(el: Element, win?: ScopeRecordContext['win']): string {
  if (el.id) return `#${escapeIdentifier(el.id, win)}`;

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

export function findController(doc: Document, el: Element): Element | null {
  if (!el.id) return null;
  return doc.querySelector(`[aria-controls="${escapeAttrValue(el.id)}"]`);
}

export function controllerSelectorFor(
  controller: Element | null,
  win?: ScopeRecordContext['win'],
): string | undefined {
  if (!controller) return undefined;
  if (controller.id) return `#${escapeIdentifier(controller.id, win)}`;
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

export function createScopeRecord(
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
  context: ScopeRecordContext = {},
): ScopeRecord {
  const controller = options.controller ?? findController(doc, el);
  const selector = selectorForElement(el, context.win);
  const hasGoTo = kind === 'slide' && typeof context.win?.goTo === 'function';
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
      controllerSelector: controllerSelectorFor(controller, context.win),
      activation,
    },
    isActive: options.isActive,
    activate: options.activate,
  };
}

export function appendUniqueRecords(records: ScopeRecord[], detected: ScopeRecord[]): void {
  for (const record of detected) {
    if (!records.some(({ el }) => el === record.el)) {
      records.push(record);
    }
  }
}

export function ensureUniqueScopeIds(records: ScopeRecord[]): void {
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
