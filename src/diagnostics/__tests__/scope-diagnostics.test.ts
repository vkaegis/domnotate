import { describe, expect, test } from 'vitest';
import {
  describePinVisibility,
  generateScopeDiagnostics,
  isElementSuspiciouslyUnscoped,
} from '@/diagnostics/scope-diagnostics';
import { makeAnnotation, makeViewScope } from '@/__tests__/fixtures';
import type {
  ScopeDetectionInfo,
  ScopeDetectorMeta,
  SlideObserver,
  ViewScope,
} from '@/types/core';

function makeObserver(args: {
  scopes?: ViewScope[];
  activeScopes?: ViewScope[];
  detection?: ScopeDetectionInfo;
  scopeForElement?: ViewScope | undefined;
}): SlideObserver {
  const scopes = args.scopes ?? [];
  const activeScopes = args.activeScopes ?? [];
  const detection: ScopeDetectionInfo = args.detection ?? { source: null, detectors: [] };
  return {
    init: () => undefined,
    getActiveScope: () => activeScopes[0] ?? null,
    getActiveScopes: () => activeScopes,
    getScopes: () => scopes,
    getScopeForElement: () => args.scopeForElement,
    isScopeActive: (candidate) => activeScopes.some((s) => s.id === candidate.id),
    activateScope: () => undefined,
    getDetectionInfo: () => detection,
    destroy: () => undefined,
    getActiveSlide: () => activeScopes[0]?.index ?? null,
    getSlideCount: () => (scopes.length === 0 ? null : scopes.length),
    goToSlide: () => undefined,
    getSlideForElement: () => undefined,
  };
}

const detectorPlan: ScopeDetectorMeta[] = [
  { id: 'explicit-domnotate', stage: 'explicit', priority: 10, confidence: 100 },
  { id: 'aria-tabpanels', stage: 'semantic', priority: 30, confidence: 95 },
  { id: 'rendered-state-inference', stage: 'rendered-state', priority: 100, confidence: 45 },
];

describe('generateScopeDiagnostics', () => {
  test('reports source confidence for a single-source detector', () => {
    const scope = makeViewScope({ kind: 'tabpanel', id: 'a', index: 0 });
    const snapshot = generateScopeDiagnostics(
      makeObserver({
        scopes: [scope],
        activeScopes: [scope],
        detection: { source: 'aria-tabpanels', detectors: detectorPlan },
      }),
    );

    expect(snapshot.detection.source).toBe('aria-tabpanels');
    expect(snapshot.detection.sourceConfidence).toBe(95);
    expect(snapshot.scopes).toEqual([{ scope, active: true }]);
    expect(snapshot.flags.hasScopes).toBe(true);
    expect(snapshot.flags.segmentedButNoneActive).toBe(false);
  });

  test('uses the max semantic confidence for semantic-composite', () => {
    const scope = makeViewScope({ kind: 'slide', id: 's0', index: 0 });
    const snapshot = generateScopeDiagnostics(
      makeObserver({
        scopes: [scope],
        activeScopes: [scope],
        detection: { source: 'semantic-composite', detectors: detectorPlan },
      }),
    );

    expect(snapshot.detection.sourceConfidence).toBe(95);
  });

  test('flags segmented documents where no scope is active', () => {
    const scope = makeViewScope({ kind: 'tabpanel', id: 'inactive', index: 0 });
    const snapshot = generateScopeDiagnostics(
      makeObserver({
        scopes: [scope],
        activeScopes: [],
        detection: { source: 'aria-tabpanels', detectors: detectorPlan },
      }),
    );

    expect(snapshot.flags.hasScopes).toBe(true);
    expect(snapshot.flags.segmentedButNoneActive).toBe(true);
  });

  test('reports null confidence for unscoped documents', () => {
    const snapshot = generateScopeDiagnostics(makeObserver({}));

    expect(snapshot.detection.source).toBeNull();
    expect(snapshot.detection.sourceConfidence).toBeNull();
    expect(snapshot.flags.hasScopes).toBe(false);
    expect(snapshot.flags.segmentedButNoneActive).toBe(false);
  });

  test('marks each detected scope as active when it matches an active scope id', () => {
    const a = makeViewScope({ kind: 'tabpanel', id: 'a', index: 0 });
    const b = makeViewScope({ kind: 'tabpanel', id: 'b', index: 1 });
    const snapshot = generateScopeDiagnostics(
      makeObserver({
        scopes: [a, b],
        activeScopes: [b],
        detection: { source: 'aria-tabpanels', detectors: detectorPlan },
      }),
    );

    expect(snapshot.scopes).toEqual([
      { scope: a, active: false },
      { scope: b, active: true },
    ]);
    expect(snapshot.activeScopes).toEqual([b]);
  });
});

describe('describePinVisibility', () => {
  test('returns unscoped-document for documents with no scopes', () => {
    const annotation = makeAnnotation();
    const report = describePinVisibility(annotation, makeObserver({}));

    expect(report.visible).toBe(true);
    expect(report.reason).toEqual({ kind: 'unscoped-document' });
  });

  test('returns unscoped-annotation for annotations without scope on a scoped document', () => {
    const scope = makeViewScope({ kind: 'tabpanel', id: 'a', index: 0 });
    const annotation = makeAnnotation();
    const report = describePinVisibility(
      annotation,
      makeObserver({ scopes: [scope], activeScopes: [scope] }),
    );

    expect(report.visible).toBe(true);
    expect(report.reason).toEqual({ kind: 'unscoped-annotation' });
  });

  test('reports scope-active when stored scope matches an active scope', () => {
    const scope = makeViewScope({ kind: 'tabpanel', id: 'a', index: 0 });
    const annotation = makeAnnotation({ viewScope: scope });
    const report = describePinVisibility(
      annotation,
      makeObserver({ scopes: [scope], activeScopes: [scope] }),
    );

    expect(report.visible).toBe(true);
    expect(report.reason).toEqual({ kind: 'scope-active', matchedScope: scope });
  });

  test('reports scope-inactive when stored scope does not match any active scope', () => {
    const active = makeViewScope({ kind: 'tabpanel', id: 'active', index: 1 });
    const inactive = makeViewScope({ kind: 'tabpanel', id: 'inactive', index: 0 });
    const annotation = makeAnnotation({ viewScope: inactive });
    const report = describePinVisibility(
      annotation,
      makeObserver({ scopes: [active, inactive], activeScopes: [active] }),
    );

    expect(report.visible).toBe(false);
    expect(report.reason).toEqual({ kind: 'scope-inactive', storedScope: inactive });
  });

  test('reports legacy-slide-matches when annotation slideIndex equals an active scope index', () => {
    const slide = makeViewScope({ kind: 'slide', id: 's1', index: 1 });
    const annotation = makeAnnotation({ slideIndex: 1 });
    const report = describePinVisibility(
      annotation,
      makeObserver({ scopes: [slide], activeScopes: [slide] }),
    );

    expect(report.visible).toBe(true);
    expect(report.reason).toEqual({ kind: 'legacy-slide-matches', slideIndex: 1 });
  });

  test('reports legacy-slide-mismatch when annotation slideIndex differs from any active scope index', () => {
    const slide = makeViewScope({ kind: 'slide', id: 's0', index: 0 });
    const annotation = makeAnnotation({ slideIndex: 2 });
    const report = describePinVisibility(
      annotation,
      makeObserver({ scopes: [slide], activeScopes: [slide] }),
    );

    expect(report.visible).toBe(false);
    expect(report.reason).toEqual({ kind: 'legacy-slide-mismatch', slideIndex: 2 });
  });
});

describe('isElementSuspiciouslyUnscoped', () => {
  test('returns false when the document has no scopes', () => {
    const el = document.createElement('div');
    expect(isElementSuspiciouslyUnscoped(makeObserver({}), el)).toBe(false);
  });

  test('returns false when the element is inside a detected scope', () => {
    const scope = makeViewScope();
    const el = document.createElement('div');
    expect(
      isElementSuspiciouslyUnscoped(
        makeObserver({ scopes: [scope], scopeForElement: scope }),
        el,
      ),
    ).toBe(false);
  });

  test('returns true when the document has scopes but the element is outside them', () => {
    const scope = makeViewScope();
    const el = document.createElement('div');
    expect(
      isElementSuspiciouslyUnscoped(
        makeObserver({ scopes: [scope], scopeForElement: undefined }),
        el,
      ),
    ).toBe(true);
  });

  test('returns false for missing element', () => {
    const scope = makeViewScope();
    expect(
      isElementSuspiciouslyUnscoped(makeObserver({ scopes: [scope] }), null),
    ).toBe(false);
  });
});
