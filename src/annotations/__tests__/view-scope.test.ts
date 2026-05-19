import { describe, expect, test, vi } from 'vitest';
import {
  activateScopeForAnnotation,
  createScopedAnnotationOptions,
  fallbackScopeLabel,
  isAnnotationVisibleInScope,
} from '@/annotations/view-scope';
import { makeAnnotation, makeViewScope } from '@/__tests__/fixtures';
import type { SlideObserver, ViewScope } from '@/types/core';

function makeObserver(scope: ViewScope): SlideObserver {
  return {
    init: () => undefined,
    getActiveScope: () => scope,
    getActiveScopes: () => [scope],
    getScopes: () => [scope],
    getScopeForElement: () => scope,
    isScopeActive: (candidate) => candidate.id === scope.id,
    activateScope: () => undefined,
    destroy: () => undefined,
    getActiveSlide: () => scope.index,
    getSlideCount: () => 1,
    goToSlide: () => undefined,
    getSlideForElement: () => scope.index,
  };
}

describe('view scope annotation helpers', () => {
  test('stores tab viewScope without legacy slideIndex', () => {
    const scope = makeViewScope({ kind: 'tabpanel', id: 'details', index: 2 });
    const options = createScopedAnnotationOptions(makeObserver(scope), document.createElement('p'));

    expect(options).toEqual({ viewScope: scope });
  });

  test('stores slide viewScope with legacy slideIndex', () => {
    const scope = makeViewScope({ kind: 'slide', id: 'slide-2', index: 2 });
    const options = createScopedAnnotationOptions(makeObserver(scope), document.createElement('p'));

    expect(options).toEqual({ viewScope: scope, slideIndex: 2 });
  });

  test('filters scoped annotations by active scope and preserves general annotations', () => {
    const active = makeViewScope({ kind: 'tabpanel', id: 'active', index: 1 });
    const inactive = makeViewScope({ kind: 'tabpanel', id: 'inactive', index: 0 });

    expect(isAnnotationVisibleInScope(makeAnnotation({ viewScope: active }), active, true)).toBe(true);
    expect(isAnnotationVisibleInScope(makeAnnotation({ viewScope: inactive }), active, true)).toBe(false);
    expect(isAnnotationVisibleInScope(makeAnnotation({ slideIndex: 1 }), active, true)).toBe(true);
    expect(isAnnotationVisibleInScope(makeAnnotation(), active, true)).toBe(true);
    expect(isAnnotationVisibleInScope(makeAnnotation({ viewScope: inactive }), null, false)).toBe(true);
  });

  test('filters slide-scoped annotations with the same active-scope rule', () => {
    const activeSlide = makeViewScope({ kind: 'slide', id: 'slide-2', index: 1 });
    const inactiveSlide = makeViewScope({ kind: 'slide', id: 'slide-1', index: 0 });

    expect(isAnnotationVisibleInScope(makeAnnotation({ viewScope: activeSlide }), activeSlide, true)).toBe(true);
    expect(isAnnotationVisibleInScope(makeAnnotation({ viewScope: inactiveSlide }), activeSlide, true)).toBe(false);
  });

  test('activateScopeForAnnotation activates inactive viewScope and reports navigation', () => {
    const inactive = makeViewScope({ kind: 'tabpanel', id: 'inactive', index: 0 });
    const active = makeViewScope({ kind: 'tabpanel', id: 'active', index: 1 });
    const observer = makeObserver(active);
    const activate = vi.spyOn(observer, 'activateScope');

    const navigated = activateScopeForAnnotation(observer, { viewScope: inactive });

    expect(navigated).toBe(true);
    expect(activate).toHaveBeenCalledWith(inactive);
  });

  test('activateScopeForAnnotation skips activation when the scope is already active', () => {
    const active = makeViewScope({ kind: 'tabpanel', id: 'active', index: 1 });
    const observer = makeObserver(active);
    const activate = vi.spyOn(observer, 'activateScope');

    const navigated = activateScopeForAnnotation(observer, { viewScope: active });

    expect(navigated).toBe(false);
    expect(activate).not.toHaveBeenCalled();
  });

  test('activateScopeForAnnotation falls back to slideIndex navigation for legacy annotations', () => {
    const active = makeViewScope({ kind: 'slide', id: 'slide-0', index: 0 });
    const observer = makeObserver(active);
    const goTo = vi.spyOn(observer, 'goToSlide');

    const navigated = activateScopeForAnnotation(observer, { slideIndex: 2 });

    expect(navigated).toBe(true);
    expect(goTo).toHaveBeenCalledWith(2);
  });

  test('activateScopeForAnnotation does nothing for unscoped content', () => {
    const active = makeViewScope({ kind: 'slide', id: 'slide-0', index: 0 });
    const observer: SlideObserver = {
      ...makeObserver(active),
      getActiveSlide: () => null,
    };
    const activate = vi.spyOn(observer, 'activateScope');
    const goTo = vi.spyOn(observer, 'goToSlide');

    const navigated = activateScopeForAnnotation(observer, { slideIndex: 2 });

    expect(navigated).toBe(false);
    expect(activate).not.toHaveBeenCalled();
    expect(goTo).not.toHaveBeenCalled();
  });

  test('uses kind-specific fallback labels', () => {
    expect(fallbackScopeLabel(makeViewScope({ kind: 'slide', label: undefined, index: 2 }))).toBe('Slide 3');
    expect(fallbackScopeLabel(makeViewScope({ kind: 'tabpanel', label: undefined, index: 1 }))).toBe('Tab 2');
    expect(fallbackScopeLabel(makeViewScope({ kind: 'wizard-step', label: undefined, index: 0 }))).toBe('Step 1');
  });
});
