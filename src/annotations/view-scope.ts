import type { Annotation, SlideObserver, ViewScope } from '@/types/core';

export type ScopedAnnotationOptions =
  | { viewScope: ViewScope; slideIndex?: number }
  | undefined;

export function createScopedAnnotationOptions(
  slideObserver: SlideObserver | null | undefined,
  el: Element | null | undefined,
): ScopedAnnotationOptions {
  if (!slideObserver || !el) return undefined;

  const viewScope = slideObserver.getScopeForElement(el);
  if (!viewScope) return undefined;

  return {
    viewScope,
    ...(viewScope.kind === 'slide' && { slideIndex: viewScope.index }),
  };
}

export function scopesMatch(stored: ViewScope, active: ViewScope): boolean {
  if (stored.id && active.id) return stored.id === active.id;
  return stored.kind === active.kind && stored.selector === active.selector;
}

export function isAnnotationVisibleInScope(
  annotation: Annotation,
  activeScope: ViewScope | null,
  hasScopes: boolean,
): boolean {
  return isAnnotationVisibleInScopes(
    annotation,
    activeScope ? [activeScope] : [],
    hasScopes,
  );
}

export function isAnnotationVisibleInScopes(
  annotation: Annotation,
  activeScopes: ViewScope[],
  hasScopes: boolean,
): boolean {
  if (!hasScopes) return true;

  if (annotation.viewScope) {
    return activeScopes.some((activeScope) => scopesMatch(annotation.viewScope!, activeScope));
  }

  if (annotation.slideIndex !== undefined) {
    return activeScopes.some((activeScope) => annotation.slideIndex === activeScope.index);
  }

  return true;
}

export function fallbackScopeLabel(scope: ViewScope): string {
  if (scope.label) return scope.label;

  const displayIndex = scope.index + 1;
  switch (scope.kind) {
    case 'slide':
      return `Slide ${displayIndex}`;
    case 'tabpanel':
      return `Tab ${displayIndex}`;
    case 'wizard-step':
      return `Step ${displayIndex}`;
    case 'carousel':
      return `Item ${displayIndex}`;
    case 'hash-route':
      return `Section ${displayIndex}`;
    case 'active-panel':
    case 'custom':
      return `View ${displayIndex}`;
  }
}

function escapeAttrValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function escapeIdentifier(value: string): string {
  type CssEscapeApi = { escape?: (ident: string) => string };
  const css = (globalThis as typeof globalThis & { CSS?: CssEscapeApi }).CSS;
  if (css?.escape) return css.escape(value);
  return value.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}

function queryElement(doc: Document, selector: string | undefined): Element | null {
  if (!selector) return null;
  try {
    return doc.querySelector(selector);
  } catch {
    return null;
  }
}

type ScopeNavigator = {
  isScopeActive(scope: ViewScope): boolean;
  activateScope(scope: ViewScope): void;
  getActiveSlide(): number | null;
  goToSlide(n: number): void;
};

export function activateScopeForAnnotation(
  navigator: ScopeNavigator | null | undefined,
  annotation: Pick<Annotation, 'viewScope' | 'slideIndex'>,
): boolean {
  if (!navigator) return false;

  if (annotation.viewScope) {
    if (navigator.isScopeActive(annotation.viewScope)) return false;
    navigator.activateScope(annotation.viewScope);
    return true;
  }

  if (annotation.slideIndex !== undefined) {
    const activeSlide = navigator.getActiveSlide();
    if (activeSlide === null || activeSlide === annotation.slideIndex) return false;
    navigator.goToSlide(annotation.slideIndex);
    return true;
  }

  return false;
}

export function resolveViewScopeRoot(doc: Document, scope: ViewScope): Element | null {
  const byStoredSelector = queryElement(doc, scope.selector);
  if (byStoredSelector) return byStoredSelector;

  const byScopeId = queryElement(
    doc,
    `[data-domnotate-scope-id="${escapeAttrValue(scope.id)}"]`,
  );
  if (byScopeId) return byScopeId;

  return queryElement(doc, `#${escapeIdentifier(scope.id)}`);
}
