import { describe, test, expect, vi } from 'vitest';
import {
  commitTextEditWithSyncedPreviews,
  syncAnnotationTextPreviews,
} from '@/editor/text-preview-sync';
import { createEditManager } from '@/editor/edit-manager';
import { createEventBus } from '@/events';
import { makeAnnotation, makeDescriptor } from '@/__tests__/fixtures';

describe('syncAnnotationTextPreviews', () => {
  test('refreshes textPreview for annotations on the edited element (reanchor regression)', () => {
    const target = makeAnnotation({ element: makeDescriptor({ cssSelector: 'p.intro', textPreview: 'Old text' }) });
    const other = makeAnnotation({ element: makeDescriptor({ cssSelector: 'p.other', textPreview: 'Untouched' }) });

    const updated = syncAnnotationTextPreviews([target, other], 'p.intro', 'Brand new text');

    expect(updated).toBe(1);
    // The stale preview that reanchor strategy 3 relies on is refreshed...
    expect(target.element.textPreview).toBe('Brand new text');
    // ...and unrelated annotations are left alone.
    expect(other.element.textPreview).toBe('Untouched');
  });

  test('truncates the preview to 80 characters', () => {
    const long = 'x'.repeat(200);
    const ann = makeAnnotation({ element: makeDescriptor({ cssSelector: 'p.long' }) });

    syncAnnotationTextPreviews([ann], 'p.long', long);

    expect(ann.element.textPreview).toBe('x'.repeat(80));
  });

  test('returns 0 when no annotation matches', () => {
    const ann = makeAnnotation({ element: makeDescriptor({ cssSelector: 'p.a' }) });
    expect(syncAnnotationTextPreviews([ann], 'p.z', 'nope')).toBe(0);
  });

  test('updates previews before edit events trigger autosave listeners', () => {
    const bus = createEventBus();
    const editManager = createEditManager();
    editManager.init(bus);

    const descriptor = makeDescriptor({
      cssSelector: 'p.intro',
      textPreview: 'Old text',
    });
    const annotations = [
      makeAnnotation({
        element: makeDescriptor({
          cssSelector: 'p.intro',
          textPreview: 'Old text',
        }),
      }),
    ];
    const autosave = vi.fn(() => annotations[0].element.textPreview);
    bus.on('edit:create', autosave);

    commitTextEditWithSyncedPreviews(editManager, annotations, {
      element: descriptor,
      oldHtml: 'Old text',
      newHtml: 'New text',
      oldText: 'Old text',
      newText: 'New text',
    });

    expect(autosave).toHaveReturnedWith('New text');
  });
});
