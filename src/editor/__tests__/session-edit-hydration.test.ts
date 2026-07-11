import { describe, expect, test, vi } from 'vitest';

import { createEditManager } from '@/editor/edit-manager';
import { hydrateSessionEdits, revertSessionEdits } from '@/editor/session-edit-hydration';
import { createEventBus } from '@/events';
import { makeDescriptor, makeTextEdit } from '@/__tests__/fixtures';

describe('hydrateSessionEdits', () => {
  test('clears stale edits when a regular session without edits is loaded', () => {
    const editManager = createEditManager();
    editManager.init(createEventBus());
    editManager.commit({
      element: makeDescriptor({ cssSelector: 'p.old' }),
      oldHtml: 'Old page',
      newHtml: 'Edited old page',
      oldText: 'Old page',
      newText: 'Edited old page',
    });
    const editor = { applyEdits: vi.fn() };

    hydrateSessionEdits(editManager, editor, undefined);

    expect(editManager.getAll()).toEqual([]);
    expect(editor.applyEdits).not.toHaveBeenCalled();
  });

  test('loads and applies edits for a hydrated shared session', () => {
    const editManager = createEditManager();
    editManager.init(createEventBus());
    const edit = makeTextEdit();
    const editor = { applyEdits: vi.fn() };

    hydrateSessionEdits(editManager, editor, [edit]);

    expect(editManager.getAll()).toEqual([edit]);
    expect(editor.applyEdits).toHaveBeenCalledWith([edit]);
  });
});

describe('revertSessionEdits', () => {
  test('reverts every live preview before emptying the store', () => {
    const editManager = createEditManager();
    editManager.init(createEventBus());
    const first = editManager.commit({
      element: makeDescriptor({ cssSelector: 'p.a' }),
      oldHtml: 'A', newHtml: 'A edited', oldText: 'A', newText: 'A edited',
    })!;
    const second = editManager.commit({
      element: makeDescriptor({ cssSelector: 'p.b' }),
      oldHtml: 'B', newHtml: 'B edited', oldText: 'B', newText: 'B edited',
    })!;
    const editor = { revertEdit: vi.fn() };

    revertSessionEdits(editManager, editor);

    expect(editor.revertEdit).toHaveBeenCalledWith(first);
    expect(editor.revertEdit).toHaveBeenCalledWith(second);
    expect(editManager.getAll()).toEqual([]);
  });
});
