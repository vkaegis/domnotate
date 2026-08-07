import { describe, expect, test, vi } from 'vitest';
import {
  resolveScopeForAnnotation,
  scopeAnnotationToCurrentPanel,
} from '@/diagnostics/scope-override';
import { makeAnnotation, makeDescriptor, makeViewScope } from '@/__tests__/fixtures';
import type { AnnotationManager, SlideObserver, ViewScope } from '@/types/core';

function makeObserver(args: {
  scopes?: ViewScope[];
  activeScopes?: ViewScope[];
  scopeForElement?: (el: Element) => ViewScope | undefined;
}): SlideObserver {
  const scopes = args.scopes ?? [];
  const activeScopes = args.activeScopes ?? [];
  return {
    init: () => undefined,
    getActiveScope: () => activeScopes[0] ?? null,
    getActiveScopes: () => activeScopes,
    getScopes: () => scopes,
    getScopeForElement: args.scopeForElement ?? (() => undefined),
    isScopeActive: (candidate) => activeScopes.some((s) => s.id === candidate.id),
    activateScope: () => undefined,
    getDetectionInfo: () => ({ source: null, detectors: [] }),
    destroy: () => undefined,
    getActiveSlide: () => activeScopes[0]?.index ?? null,
    getSlideCount: () => (scopes.length === 0 ? null : scopes.length),
    goToSlide: () => undefined,
    getSlideForElement: () => undefined,
  };
}

function makeStubManager(): AnnotationManager {
  const store = new Map<string, ReturnType<typeof makeAnnotation>>();
  const manager: AnnotationManager = {
    init: () => undefined,
    getAll: () => Array.from(store.values()),
    getById: (id) => store.get(id),
    updateSourceHint: () => false,
    create: () => {
      throw new Error('not implemented');
    },
    updateText: () => undefined,
    updateScope: vi.fn((id, scope) => {
      const ann = store.get(id);
      if (!ann) return;
      if (scope) {
        ann.viewScope = scope;
        ann.slideIndex = scope.kind === 'slide' ? scope.index : undefined;
      } else {
        delete ann.viewScope;
        delete ann.slideIndex;
      }
    }),
    delete: () => undefined,
    loadAnnotations: (annotations) => {
      for (const ann of annotations) store.set(ann.id, ann);
    },
    clearAll: () => store.clear(),
  };
  return manager;
}

describe('resolveScopeForAnnotation', () => {
  test('uses scope around the annotation element when resolvable', () => {
    const doc = document.implementation.createHTMLDocument('t');
    const panel = doc.createElement('section');
    panel.id = 'panel-a';
    const inner = doc.createElement('p');
    inner.className = 'target';
    panel.appendChild(inner);
    doc.body.appendChild(panel);

    const scope = makeViewScope({ kind: 'tabpanel', id: 'panel-a' });
    const annotation = makeAnnotation({
      element: makeDescriptor({ cssSelector: '.target' }),
    });
    const observer = makeObserver({
      scopes: [scope],
      activeScopes: [],
      scopeForElement: (el) => (panel.contains(el) ? scope : undefined),
    });

    expect(resolveScopeForAnnotation(observer, doc, annotation)).toBe(scope);
  });

  test('falls back to single active scope when no element resolves', () => {
    const doc = document.implementation.createHTMLDocument('t');
    const scope = makeViewScope({ kind: 'tabpanel', id: 'panel-b' });
    const annotation = makeAnnotation({
      element: makeDescriptor({ cssSelector: '.missing' }),
    });
    const observer = makeObserver({ scopes: [scope], activeScopes: [scope] });

    expect(resolveScopeForAnnotation(observer, doc, annotation)).toBe(scope);
  });

  test('returns null when multiple active scopes and no element resolution', () => {
    const doc = document.implementation.createHTMLDocument('t');
    const a = makeViewScope({ kind: 'tabpanel', id: 'a' });
    const b = makeViewScope({ kind: 'tabpanel', id: 'b' });
    const annotation = makeAnnotation({
      element: makeDescriptor({ cssSelector: '.nope' }),
    });
    const observer = makeObserver({ scopes: [a, b], activeScopes: [a, b] });

    expect(resolveScopeForAnnotation(observer, doc, annotation)).toBeNull();
  });

  test('returns null when no doc and no active scopes', () => {
    const observer = makeObserver({});
    expect(resolveScopeForAnnotation(observer, null, makeAnnotation())).toBeNull();
  });
});

describe('scopeAnnotationToCurrentPanel', () => {
  test('applies resolved scope via manager.updateScope', () => {
    const manager = makeStubManager();
    const annotation = makeAnnotation({
      element: makeDescriptor({ cssSelector: '.missing' }),
    });
    manager.loadAnnotations([annotation]);

    const scope = makeViewScope({ kind: 'tabpanel', id: 'only-active' });
    const observer = makeObserver({ scopes: [scope], activeScopes: [scope] });

    const applied = scopeAnnotationToCurrentPanel(manager, observer, null, annotation.id);

    expect(applied).toBe(scope);
    expect(manager.updateScope).toHaveBeenCalledWith(annotation.id, scope);
  });

  test('returns null and does not mutate when no scope can be resolved', () => {
    const manager = makeStubManager();
    const annotation = makeAnnotation();
    manager.loadAnnotations([annotation]);

    const observer = makeObserver({});
    const applied = scopeAnnotationToCurrentPanel(manager, observer, null, annotation.id);

    expect(applied).toBeNull();
    expect(manager.updateScope).not.toHaveBeenCalled();
  });

  test('returns null when annotation is missing', () => {
    const manager = makeStubManager();
    const observer = makeObserver({});
    expect(scopeAnnotationToCurrentPanel(manager, observer, null, 'missing')).toBeNull();
  });
});
