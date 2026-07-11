// ============================================================
// Domnotate — Annotation Preview Snapshot
// ============================================================
//
// `element.textPreview` is the third re-anchoring strategy (see reanchor.ts):
// if selector and XPath both miss on a future load, an element is matched by
// tagName + preview text. In-place text edits change an element's text, so the
// preview must reflect the *post-edit* text to stay useful.
//
// Rather than eagerly patching previews on every edit/revert (which coupled the
// edit subsystem to the annotation subsystem and drifted across view scopes),
// we derive the preview from the live DOM at serialize time. The DOM already
// reflects committed edit previews, and each annotation is reanchored within
// its own view scope, so scoped content with a repeated selector can't
// cross-contaminate.

import { reanchorAnnotation } from '@/output/reanchor';
import type { Annotation } from '@/types/core';

const PREVIEW_LENGTH = 80;

/**
 * Refresh `element.textPreview` for each annotation from its current live DOM
 * text, resolving within the annotation's own view scope. Annotations whose
 * element can't be reanchored keep their existing preview. Mutates in place;
 * returns the number updated.
 */
export function snapshotAnnotationPreviews(
  annotations: Annotation[],
  doc: Document | null | undefined,
): number {
  if (!doc) return 0;

  let updated = 0;
  for (const annotation of annotations) {
    const match = reanchorAnnotation(
      annotation.element,
      doc,
      annotation.viewScope ? { viewScope: annotation.viewScope } : undefined,
    );
    if (!match?.element) continue;

    annotation.element.textPreview = (match.element.textContent ?? '')
      .trim()
      .slice(0, PREVIEW_LENGTH);
    updated++;
  }
  return updated;
}
