import { describe, test, expect } from 'vitest';
import { syncAnnotationTextPreviews } from '@/editor/text-preview-sync';
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
});
