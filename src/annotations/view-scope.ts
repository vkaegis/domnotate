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
  if (!hasScopes) return true;

  if (annotation.viewScope) {
    return activeScope !== null && scopesMatch(annotation.viewScope, activeScope);
  }

  if (annotation.slideIndex !== undefined) {
    return activeScope !== null && annotation.slideIndex === activeScope.index;
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

