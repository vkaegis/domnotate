import { createScopeRecord, isViewScopeKind, type ScopeRecord } from '@/slides/view-scope-records';
import type { ScopeDetectionContext } from '@/slides/view-scope-detection-types';

export function detectExplicitScopes(context: ScopeDetectionContext): ScopeRecord[] {
  const { doc } = context;
  const elements = Array.from(
    doc.querySelectorAll('[data-domnotate-scope], [data-domnotate-scope-id]'),
  );
  if (elements.length < 2) return [];

  return elements.map((el, index) => {
    const declaredKind = el.getAttribute('data-domnotate-scope');
    const kind = isViewScopeKind(declaredKind) ? declaredKind : 'custom';
    return createScopeRecord(doc, el, index, kind, 'View', {}, context);
  });
}
