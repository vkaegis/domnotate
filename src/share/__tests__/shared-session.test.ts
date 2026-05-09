import { describe, expect, test } from 'vitest';

import { makeAnnotation } from '@/__tests__/fixtures';
import {
  MAX_SHARE_BYTES,
  createSharedSessionBlob,
  parseSharedSessionBlob,
  serializeSharedSessionBlob,
  validateSharedSessionBlob,
  validatePublishShareRequest,
} from '@/share/shared-session';

describe('shared-session', () => {
  test('creates a serializable shared session blob', () => {
    const result = createSharedSessionBlob(
      {
        sourceType: 'file',
        sourceName: 'page.html',
        html: '<html><body>Hello</body></html>',
        annotations: [makeAnnotation()],
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

  test('validates complete shared blobs', () => {
    const annotation = makeAnnotation();
    const blob = {
      schemaVersion: 1,
      id: 'share-1',
      sourceType: 'url',
      sourceName: 'https://example.com',
      html: '<html><body>Example</body></html>',
      annotations: [annotation],
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
