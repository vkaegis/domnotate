// ============================================================
// Domnotate — Scope Diagnostics
// ============================================================

import { scopesMatch } from '@/annotations/view-scope';
import type {
  Annotation,
  ScopeDetectionInfo,
  ScopeDetectorMeta,
  SlideObserver,
  ViewScope,
} from '@/types/core';

export interface DiagnosticsScopeEntry {
  scope: ViewScope;
  active: boolean;
}

export interface ScopeDiagnosticsSnapshot {
  detection: {
    source: ScopeDetectionInfo['source'];
    sourceConfidence: number | null;
    detectors: readonly ScopeDetectorMeta[];
  };
  scopes: DiagnosticsScopeEntry[];
  activeScopes: ViewScope[];
  flags: {
    hasScopes: boolean;
    /** Scopes exist but none is currently active — pin filtering will hide every scoped annotation. */
    segmentedButNoneActive: boolean;
  };
}

export type PinVisibilityReason =
  | { kind: 'unscoped-document' }
  | { kind: 'unscoped-annotation' }
  | { kind: 'scope-active'; matchedScope: ViewScope }
  | { kind: 'scope-inactive'; storedScope: ViewScope }
  | { kind: 'legacy-slide-matches'; slideIndex: number }
  | { kind: 'legacy-slide-mismatch'; slideIndex: number };

export interface PinVisibilityReport {
  annotationId: string;
  visible: boolean;
  reason: PinVisibilityReason;
  storedScope?: ViewScope;
  storedSlideIndex?: number;
  activeScopes: ViewScope[];
}

function confidenceForSource(
  source: ScopeDetectionInfo['source'],
  detectors: readonly ScopeDetectorMeta[],
): number | null {
  if (!source) return null;
  if (source === 'semantic-composite') {
    const semanticConfidences = detectors
      .filter((d) => d.stage === 'semantic')
      .map((d) => d.confidence);
    return semanticConfidences.length > 0 ? Math.max(...semanticConfidences) : null;
  }
  const detector = detectors.find((d) => d.id === source);
  return detector?.confidence ?? null;
}

export function generateScopeDiagnostics(observer: SlideObserver): ScopeDiagnosticsSnapshot {
  const scopes = observer.getScopes();
  const activeScopes = observer.getActiveScopes();
  const detectionInfo = observer.getDetectionInfo();

  const activeIds = new Set(activeScopes.map((s) => s.id));
  const scopeEntries: DiagnosticsScopeEntry[] = scopes.map((scope) => ({
    scope,
    active: activeIds.has(scope.id),
  }));

  return {
    detection: {
      source: detectionInfo.source,
      sourceConfidence: confidenceForSource(detectionInfo.source, detectionInfo.detectors),
      detectors: detectionInfo.detectors,
    },
    scopes: scopeEntries,
    activeScopes,
    flags: {
      hasScopes: scopes.length > 0,
      segmentedButNoneActive: scopes.length > 0 && activeScopes.length === 0,
    },
  };
}

export function describePinVisibility(
  annotation: Pick<Annotation, 'id' | 'viewScope' | 'slideIndex'>,
  observer: SlideObserver,
): PinVisibilityReport {
  const scopes = observer.getScopes();
  const activeScopes = observer.getActiveScopes();
  const base = {
    annotationId: annotation.id,
    storedScope: annotation.viewScope,
    storedSlideIndex: annotation.slideIndex,
    activeScopes,
  };

  if (scopes.length === 0) {
    return { ...base, visible: true, reason: { kind: 'unscoped-document' } };
  }

  if (annotation.viewScope) {
    const match = activeScopes.find((active) => scopesMatch(annotation.viewScope!, active));
    if (match) {
      return {
        ...base,
        visible: true,
        reason: { kind: 'scope-active', matchedScope: match },
      };
    }
    return {
      ...base,
      visible: false,
      reason: { kind: 'scope-inactive', storedScope: annotation.viewScope },
    };
  }

  if (annotation.slideIndex !== undefined) {
    const activeSlideScopes = activeScopes.filter((active) => active.kind === 'slide');
    const scopesToMatch = activeSlideScopes.length > 0 ? activeSlideScopes : activeScopes;
    const matches = scopesToMatch.some((active) => active.index === annotation.slideIndex);
    return {
      ...base,
      visible: matches,
      reason: matches
        ? { kind: 'legacy-slide-matches', slideIndex: annotation.slideIndex }
        : { kind: 'legacy-slide-mismatch', slideIndex: annotation.slideIndex },
    };
  }

  return { ...base, visible: true, reason: { kind: 'unscoped-annotation' } };
}

/**
 * True when the document has detected scopes but the supplied element is not
 * inside any of them — a new annotation would be stored unscoped and become
 * visible on every panel/tab/slide.
 */
export function isElementSuspiciouslyUnscoped(
  observer: SlideObserver,
  el: Element | null | undefined,
): boolean {
  if (!el) return false;
  if (observer.getScopes().length === 0) return false;
  return observer.getScopeForElement(el) === undefined;
}
