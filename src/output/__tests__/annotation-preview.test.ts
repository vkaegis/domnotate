import { describe, test, expect } from 'vitest';

import { snapshotAnnotationPreviews } from '@/output/annotation-preview';
import { makeAnnotation, makeDescriptor } from '@/__tests__/fixtures';
import type { ViewScope } from '@/types/core';

function docWith(html: string): Document {
  const doc = document.implementation.createHTMLDocument('preview');
  doc.body.innerHTML = html;
  return doc;
}

describe('snapshotAnnotationPreviews', () => {
  test('refreshes an annotation preview from the live DOM text', () => {
    const doc = docWith('<p class="t">Edited live text</p>');
    const annotation = makeAnnotation({
      element: makeDescriptor({ cssSelector: 'p.t', textPreview: 'Stale text' }),
    });

    const updated = snapshotAnnotationPreviews([annotation], doc);

    expect(updated).toBe(1);
    expect(annotation.element.textPreview).toBe('Edited live text');
  });

  test('scoped annotations with the same selector read their own scope text', () => {
    // Regression for bug #2: syncing/deriving a preview in one scope must not
    // rewrite the preview of a same-selector annotation in another scope.
    const doc = docWith(
      '<div id="s1"><p class="t">Scope one text</p></div>' +
        '<div id="s2"><p class="t">Scope two text</p></div>',
    );
    const scope = (id: string): ViewScope => ({
      kind: 'custom',
      id,
      index: 0,
      selector: `#${id}`,
    });
    const a = makeAnnotation({
      element: makeDescriptor({ cssSelector: 'p.t', textPreview: 'stale-1' }),
      viewScope: scope('s1'),
    });
    const b = makeAnnotation({
      element: makeDescriptor({ cssSelector: 'p.t', textPreview: 'stale-2' }),
      viewScope: scope('s2'),
    });

    snapshotAnnotationPreviews([a, b], doc);

    expect(a.element.textPreview).toBe('Scope one text');
    expect(b.element.textPreview).toBe('Scope two text');
  });

  test('leaves the preview untouched when the element cannot be reanchored', () => {
    const doc = docWith('<p class="present">here</p>');
    const annotation = makeAnnotation({
      element: makeDescriptor({
        cssSelector: 'p.gone',
        xpath: '/html/body/p[99]',
        textPreview: 'keep me',
      }),
    });

    const updated = snapshotAnnotationPreviews([annotation], doc);

    expect(updated).toBe(0);
    expect(annotation.element.textPreview).toBe('keep me');
  });

  test('no-op when the document is null', () => {
    const annotation = makeAnnotation();
    expect(snapshotAnnotationPreviews([annotation], null)).toBe(0);
  });
});
