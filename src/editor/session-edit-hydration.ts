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
