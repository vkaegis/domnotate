import { detectExplicitScopes } from '@/slides/explicit-scope-detector';
import { detectRenderedStateScopes } from '@/slides/rendered-state-inference';
import {
  detectActiveSlides,
  detectCarouselScopes,
  detectDeckSlides,
  detectGenericActivePanels,
  detectHashRoutes,
  detectRadioTabPanels,
  detectTabPanels,
  detectWizardSteps,
} from '@/slides/semantic-scope-detectors';
import type {
  ScopeDetectionContext,
  ScopeDetectionRun,
  ScopeDetector,
} from '@/slides/view-scope-detection-types';
import {
  appendUniqueRecords,
  ensureUniqueScopeIds,
  type ScopeRecord,
} from '@/slides/view-scope-records';

export type {
  DetectorId,
  DetectorStage,
  ScopeDetectionContext,
  ScopeDetectionRun,
  ScopeDetector,
} from '@/slides/view-scope-detection-types';

export const SCOPE_DETECTORS: ScopeDetector[] = [
  {
    id: 'explicit-domnotate',
    stage: 'explicit',
    priority: 10,
    confidence: 100,
    detect: detectExplicitScopes,
  },
  {
    id: 'deck-slides',
    stage: 'semantic',
    priority: 20,
    confidence: 95,
    detect: detectDeckSlides,
  },
  {
    id: 'active-slides',
    stage: 'semantic',
    priority: 21,
    confidence: 80,
    detect: detectActiveSlides,
  },
  {
    id: 'aria-tabpanels',
    stage: 'semantic',
    priority: 30,
    confidence: 95,
    detect: detectTabPanels,
  },
  {
    id: 'radio-tabpanels',
    stage: 'semantic',
    priority: 31,
    confidence: 90,
    detect: detectRadioTabPanels,
  },
  {
    id: 'hash-routes',
    stage: 'semantic',
    priority: 40,
    confidence: 75,
    detect: detectHashRoutes,
  },
  {
    id: 'carousels',
    stage: 'semantic',
    priority: 50,
    confidence: 85,
    detect: detectCarouselScopes,
  },
  {
    id: 'wizard-steps',
    stage: 'semantic',
    priority: 60,
    confidence: 85,
    detect: detectWizardSteps,
  },
  {
    id: 'generic-active-panels',
    stage: 'semantic',
    priority: 70,
    confidence: 65,
    detect: detectGenericActivePanels,
  },
  {
    id: 'rendered-state-inference',
    stage: 'rendered-state',
    priority: 100,
    confidence: 45,
    detect: detectRenderedStateScopes,
  },
];

function sortedDetectors(): ScopeDetector[] {
  return [...SCOPE_DETECTORS].sort((a, b) => a.priority - b.priority);
}

export function detectScopeRecords(context: ScopeDetectionContext): ScopeRecord[] {
  return runScopeDetection(context).records;
}

export function runScopeDetection(context: ScopeDetectionContext): ScopeDetectionRun {
  const detectors = sortedDetectors();
  const detectorPlan = detectors.map(({ id, stage, priority, confidence }) => ({
    id,
    stage,
    priority,
    confidence,
  }));

  for (const detector of detectors.filter(({ stage }) => stage === 'explicit')) {
    const records = detector.detect(context);
    if (records.length > 0) {
      ensureUniqueScopeIds(records);
      return { records, source: detector.id, detectors: detectorPlan };
    }
  }

  const semanticRecords = detectSemanticRecords(context, detectors);
  if (semanticRecords.length > 0) {
    ensureUniqueScopeIds(semanticRecords);
    return { records: semanticRecords, source: 'semantic-composite', detectors: detectorPlan };
  }

  const renderedRecords = detectRenderedRecords(context, detectors);
  ensureUniqueScopeIds(renderedRecords);

  return {
    records: renderedRecords,
    source: renderedRecords.length > 0 ? 'rendered-state-inference' : null,
    detectors: detectorPlan,
  };
}

function detectSemanticRecords(
  context: ScopeDetectionContext,
  detectors: ScopeDetector[],
): ScopeRecord[] {
  const records: ScopeRecord[] = [];
  const deckSlides = detectDeckSlides(context);
  appendUniqueRecords(records, deckSlides.length > 0 ? deckSlides : detectActiveSlides(context));

  for (const detector of detectors.filter(
    ({ stage, id }) => stage === 'semantic' && id !== 'deck-slides' && id !== 'active-slides',
  )) {
    appendUniqueRecords(records, detector.detect(context));
  }

  return records;
}

function detectRenderedRecords(
  context: ScopeDetectionContext,
  detectors: ScopeDetector[],
): ScopeRecord[] {
  const records: ScopeRecord[] = [];
  for (const detector of detectors.filter(({ stage }) => stage === 'rendered-state')) {
    appendUniqueRecords(records, detector.detect(context));
  }
  return records;
}
