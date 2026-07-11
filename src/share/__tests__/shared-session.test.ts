import { describe, expect, test } from 'vitest';

import { makeAnnotation, makeTextEdit, makeViewScope } from '@/__tests__/fixtures';
import {
  MAX_SHARE_BYTES,
  createSharedSessionBlob,
  parseSharedSessionBlob,
  serializeSharedSessionBlob,
  validateSharedSessionBlob,
  validatePublishShareRequest,
  validateUpdateShareRequest,
} from '@/share/shared-session';

describe('shared-session', () => {
  test('creates a serializable shared session blob', () => {
    const edit = makeTextEdit();
    const result = createSharedSessionBlob(
      {
        sourceType: 'file',
        sourceName: 'page.html',
        html: '<html><body>Hello</body></html>',
        annotations: [makeAnnotation()],
        edits: [edit],
      },
      { id: 'share-1', now: '2026-05-09T00:00:00.000Z' },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      schemaVersion: 1,
      id: 'share-1',
      sourceType: 'file',
      sourceName: 'page.html',
      createdAt: '2026-05-09T00:00:00.000Z',
      updatedAt: '2026-05-09T00:00:00.000Z',
    });
    expect(result.value.edits).toEqual([edit]);
    expect(JSON.parse(serializeSharedSessionBlob(result.value))).toEqual(result.value);
  });

  test('rejects invalid source type', () => {
    const result = validatePublishShareRequest({
      sourceType: 'ftp',
      sourceName: 'page.html',
      html: '<html></html>',
      annotations: [],
    });

    expect(result).toEqual({ ok: false, error: 'sourceType must be "file" or "url"' });
  });

  test('rejects unexpected publish fields', () => {
    const result = validatePublishShareRequest({
      sourceType: 'file',
      sourceName: 'page.html',
      html: '<html></html>',
      annotations: [],
      sourceTypeHint: 'url',
    });

    expect(result).toEqual({ ok: false, error: 'Request body has unexpected fields' });
  });

  test('rejects missing html', () => {
    const result = validatePublishShareRequest({
      sourceType: 'file',
      sourceName: 'page.html',
      annotations: [],
    });

    expect(result.ok).toBe(false);
  });

  test('rejects malformed annotations', () => {
    const result = validatePublishShareRequest({
      sourceType: 'file',
      sourceName: 'page.html',
      html: '<html></html>',
      annotations: [{ id: 'ann-1' }],
    });

    expect(result.ok).toBe(false);
  });

  test('rejects malformed edits', () => {
    const result = validatePublishShareRequest({
      sourceType: 'file',
      sourceName: 'page.html',
      html: '<html></html>',
      annotations: [],
      edits: [{ id: 'edit-1' }],
    });

    expect(result).toEqual({ ok: false, error: 'edits must be valid TextEdit objects' });
  });

  test('rejects oversized blobs', () => {
    const result = createSharedSessionBlob(
      {
        sourceType: 'file',
        sourceName: 'large.html',
        html: 'x'.repeat(MAX_SHARE_BYTES),
        annotations: [],
      },
      { id: 'share-large' },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('Share payload exceeds 5 MB');
  });

  test('rejects artifact HTML over the 5 MB cap before serialization', () => {
    const result = validatePublishShareRequest({
      sourceType: 'file',
      sourceName: 'large.html',
      html: 'x'.repeat(MAX_SHARE_BYTES + 1),
      annotations: [],
    });

    expect(result).toEqual({ ok: false, error: 'Artifact HTML exceeds 5 MB' });
  });

  test('validates annotation and edit update requests', () => {
    const annotation = makeAnnotation();
    const edit = makeTextEdit();
    expect(validateUpdateShareRequest({ annotations: [annotation], edits: [edit] })).toEqual({
      ok: true,
      value: { annotations: [annotation], edits: [edit] },
    });

    expect(validateUpdateShareRequest({ annotations: [], edits: [], sourceType: 'file' })).toEqual({
      ok: false,
      error: 'Request body has unexpected fields',
    });
  });

  test('defaults legacy publish payloads without edits to an empty edit list', () => {
    expect(
      validatePublishShareRequest({
        sourceType: 'file',
        sourceName: 'page.html',
        html: '<html></html>',
        annotations: [],
      }),
    ).toEqual({
      ok: true,
      value: {
        sourceType: 'file',
        sourceName: 'page.html',
        html: '<html></html>',
        annotations: [],
        edits: [],
      },
    });

    expect(validateUpdateShareRequest({ annotations: [] })).toEqual({
      ok: true,
      value: { annotations: [] },
    });
  });

  test('omits edits from legacy update payloads so existing edit records are preserved', () => {
    const annotation = makeAnnotation();

    expect(validateUpdateShareRequest({ annotations: [annotation] })).toEqual({
      ok: true,
      value: { annotations: [annotation] },
    });
  });

  test('accepts annotations without viewScope for old shared JSON', () => {
    const annotation = makeAnnotation({ slideIndex: 1 });
    const { viewScope: _, ...legacyAnnotation } = annotation;

    expect(
      validatePublishShareRequest({
        sourceType: 'file',
        sourceName: 'page.html',
        html: '<html></html>',
        annotations: [legacyAnnotation],
      }),
    ).toEqual({
      ok: true,
      value: {
        sourceType: 'file',
        sourceName: 'page.html',
        html: '<html></html>',
        annotations: [legacyAnnotation],
        edits: [],
      },
    });
  });

  test('validates annotations with viewScope in publish and update requests', () => {
    const annotation = makeAnnotation({
      viewScope: makeViewScope({
        kind: 'slide',
        id: 'slide-2',
        index: 2,
        label: 'Slide 3',
        selector: '.slide:nth-of-type(3)',
        activeSelector: '.slide.active',
        activation: 'toggle-active',
      }),
      slideIndex: 2,
    });

    expect(
      validatePublishShareRequest({
        sourceType: 'file',
        sourceName: 'page.html',
        html: '<html></html>',
        annotations: [annotation],
      }),
    ).toEqual({
      ok: true,
      value: {
        sourceType: 'file',
        sourceName: 'page.html',
        html: '<html></html>',
        annotations: [annotation],
        edits: [],
      },
    });
    expect(validateUpdateShareRequest({ annotations: [annotation] })).toEqual({
      ok: true,
      value: { annotations: [annotation] },
    });
  });

  test('round-trips scoped annotations through shared session serialization', () => {
    const annotation = makeAnnotation({
      viewScope: makeViewScope({
        kind: 'hash-route',
        id: 'details',
        index: 1,
        label: 'Details',
        selector: '#details',
        activation: 'set-hash',
      }),
    });
    const edit = makeTextEdit({
      viewScope: makeViewScope({
        kind: 'hash-route',
        id: 'details',
        index: 1,
        label: 'Details',
        selector: '#details',
        activation: 'set-hash',
      }),
    });
    const result = createSharedSessionBlob(
      {
        sourceType: 'file',
        sourceName: 'page.html',
        html: '<html><body><section id="details"></section></body></html>',
        annotations: [annotation],
        edits: [edit],
      },
      { id: 'share-scoped', now: '2026-05-09T00:00:00.000Z' },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const restored = parseSharedSessionBlob(JSON.parse(serializeSharedSessionBlob(result.value)));
    expect(restored.annotations[0]).toEqual(annotation);
    expect(restored.edits[0]).toEqual(edit);
  });

  test('rejects malformed annotation viewScope in publish and update requests', () => {
    const annotation = makeAnnotation({
      viewScope: {
        kind: 'tabs',
        id: 'bad-scope',
        index: 0,
        selector: '#bad-scope',
      } as any,
    });

    expect(
      validatePublishShareRequest({
        sourceType: 'file',
        sourceName: 'page.html',
        html: '<html></html>',
        annotations: [annotation],
      }),
    ).toEqual({ ok: false, error: 'annotations must be valid Annotation objects' });
    expect(validateUpdateShareRequest({ annotations: [annotation] })).toEqual({
      ok: false,
      error: 'annotations must be valid Annotation objects',
    });
  });

  test('validates complete shared blobs', () => {
    const annotation = makeAnnotation();
    const edit = makeTextEdit();
    const blob = {
      schemaVersion: 1,
      id: 'share-1',
      sourceType: 'url',
      sourceName: 'https://example.com',
      html: '<html><body>Example</body></html>',
      annotations: [annotation],
      edits: [edit],
      createdAt: '2026-05-09T00:00:00.000Z',
      updatedAt: '2026-05-09T00:00:00.000Z',
    };

    expect(validateSharedSessionBlob(blob)).toEqual({ ok: true, value: blob });
    expect(parseSharedSessionBlob(blob)).toEqual(blob);
  });

  test('rejects unsupported shared blob schema versions', () => {
    const result = validateSharedSessionBlob({
      schemaVersion: 2,
      id: 'share-1',
      sourceType: 'file',
      sourceName: 'page.html',
      html: '<html></html>',
      annotations: [],
      createdAt: '2026-05-09T00:00:00.000Z',
      updatedAt: '2026-05-09T00:00:00.000Z',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('Unsupported shared session schema version');
  });
});
