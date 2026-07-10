// ============================================================
// Domnotate — Text Preview Sync
// ============================================================
//
// When an element's text is edited in place, any annotation anchored to that
// same element keeps a stale `textPreview`. That preview is one of the three
// re-anchoring strategies (see output/reanchor.ts strategy 3), so leaving it
// stale can break re-anchoring when the CSS selector and XPath both miss.
// After an edit commits we refresh matching annotations' previews in place.

import type { Annotation } from '@/types/core';

const PREVIEW_LENGTH = 80;

/**
 * Update `element.textPreview` for every annotation whose element matches
 * `cssSelector`, so it reflects the post-edit text. Mutates in place and
 * returns the number of annotations touched.
 */
export function syncAnnotationTextPreviews(
  annotations: Annotation[],
  cssSelector: string,
  newText: string,
): number {
  const preview = newText.trim().slice(0, PREVIEW_LENGTH);
  let updated = 0;
  for (const annotation of annotations) {
    if (annotation.element.cssSelector === cssSelector) {
      annotation.element.textPreview = preview;
      updated++;
    }
  }
  return updated;
}
