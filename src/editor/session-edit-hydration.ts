// ============================================================
// Domnotate — Session Edit Lifecycle
// ============================================================
//
// The two edit-store lifecycle transitions live here together so they can't
// drift apart from each other or from the annotation lifecycle:
//  - hydrate: on session load, reset the store and project loaded edits.
//  - revert:  on session clear, undo live previews before dropping records.

import type { EditManager, TextEdit, TextEditor } from '@/types/core';

export function hydrateSessionEdits(
  editManager: EditManager,
  editor: Pick<TextEditor, 'applyEdits'>,
  edits: TextEdit[] | undefined,
): void {
  editManager.clearAll();

  if (!edits || edits.length === 0) {
    return;
  }

  editManager.loadEdits(edits);
  editor.applyEdits(editManager.getAll());
}

/**
 * Revert every live edit preview (restores original DOM text + drops the
 * `dn-edited` marker) before emptying the store, so clearing can't leave
 * modified page content behind while export/share reports no edits.
 */
export function revertSessionEdits(
  editManager: EditManager,
  editor: Pick<TextEditor, 'revertEdit'>,
): void {
  for (const edit of editManager.getAll()) {
    editor.revertEdit(edit);
  }
  editManager.clearAll();
}
