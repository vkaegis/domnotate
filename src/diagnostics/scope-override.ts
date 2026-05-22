// ============================================================
// Domnotate — Scope Override
// ============================================================

import { resolveViewScopeRoot } from '@/annotations/view-scope';
import type { Annotation, AnnotationManager, SlideObserver, ViewScope } from '@/types/core';

/**
 * Resolve the scope that should be applied to an annotation based on the
 * observer's currently visible state.
 *
 * Priority:
 *   1. The scope around the annotation's stored element selector (if resolvable).
 *   2. The observer's active scope (if exactly one is active).
 *   3. null — caller should leave the annotation unscoped.
 */
export function resolveScopeForAnnotation(
  observer: SlideObserver,
  doc: Document | null | undefined,
  annotation: Pick<Annotation, 'element' | 'viewScope'>,
): ViewScope | null {
  if (doc) {
    const el = queryElement(doc, annotation.element.cssSelector);
    if (el) {
      const scope = observer.getScopeForElement(el);
      if (scope) return scope;
    }

    if (annotation.viewScope) {
      const root = resolveViewScopeRoot(doc, annotation.viewScope);
      if (root) {
        const scope = observer.getScopeForElement(root);
        if (scope) return scope;
      }
    }
  }

  const activeScopes = observer.getActiveScopes();
  if (activeScopes.length === 1) return activeScopes[0];

  return null;
}

/**
 * Apply the observer's currently resolved scope to an annotation. Returns the
 * applied scope, or null if no scope could be resolved.
 */
export function scopeAnnotationToCurrentPanel(
  manager: AnnotationManager,
  observer: SlideObserver,
  doc: Document | null | undefined,
  annotationId: string,
): ViewScope | null {
  const annotation = manager.getById(annotationId);
  if (!annotation) return null;

  const scope = resolveScopeForAnnotation(observer, doc, annotation);
  if (!scope) return null;

  manager.updateScope(annotationId, scope);
  return scope;
}

function queryElement(doc: Document, selector: string | undefined): Element | null {
  if (!selector) return null;
  try {
    return doc.querySelector(selector);
  } catch {
    return null;
  }
}
