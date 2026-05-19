import type { ScopeRecord, ScopeRecordContext } from '@/slides/view-scope-records';

export type DetectorStage = 'explicit' | 'semantic' | 'rendered-state';

export type DetectorId =
  | 'explicit-domnotate'
  | 'deck-slides'
  | 'active-slides'
  | 'aria-tabpanels'
  | 'radio-tabpanels'
  | 'hash-routes'
  | 'carousels'
  | 'wizard-steps'
  | 'generic-active-panels'
  | 'rendered-state-inference';

export type ScopeDetectionContext = ScopeRecordContext & {
  doc: Document;
};

export type ScopeDetector = {
  id: DetectorId;
  stage: DetectorStage;
  priority: number;
  confidence: number;
  detect: (context: ScopeDetectionContext) => ScopeRecord[];
};

export type ScopeDetectionRun = {
  records: ScopeRecord[];
  source: DetectorId | 'semantic-composite' | null;
  detectors: Array<Pick<ScopeDetector, 'id' | 'stage' | 'priority' | 'confidence'>>;
};
