import { describe, expect, test, vi } from 'vitest';

import { makeAnnotation, makeTextEdit } from '@/__tests__/fixtures';
import { MAX_SHARE_BYTES, type SharedSessionBlob } from '@/share/shared-session';
import { onRequestPost } from '../../../functions/api/share';
import {
  onRequestGet,
  onRequestPut,
} from '../../../functions/api/share/[id]';

function makeBlob(overrides: Partial<SharedSessionBlob> = {}): SharedSessionBlob {
  return {
    schemaVersion: 1,
    id: 'share-123',
    sourceType: 'file',
    sourceName: 'page.html',
    html: '<html><body>Shared</body></html>',
    annotations: [],
    edits: [],
    createdAt: '2026-05-09T00:00:00.000Z',
    updatedAt: '2026-05-09T00:00:00.000Z',
    ...overrides,
  };
}

function makeR2Object(text: string) {
  return {
    text: vi.fn().mockResolvedValue(text),
  };
}

describe('share Pages Functions', () => {
  test('POST rejects unexpected top-level request fields', async () => {
    const response = await onRequestPost({
      request: new Request('https://example.com/api/share', {
        method: 'POST',
        body: JSON.stringify({
          sourceType: 'file',
          sourceName: 'page.html',
          html: '<html></html>',
          annotations: [],
          shareId: 'not-allowed',
        }),
      }),
      env: { SHARES: { put: vi.fn() } },
    } as never);

    await expect(response.text()).resolves.toBe('Request body has unexpected fields');
    expect(response.status).toBe(400);
  });

  test('POST rejects oversized bodies even when content-length is absent', async () => {
    const put = vi.fn();
    const response = await onRequestPost({
      request: new Request('https://example.com/api/share', {
        method: 'POST',
        body: 'x'.repeat(MAX_SHARE_BYTES + 1),
      }),
      env: { SHARES: { put } },
    } as never);

    await expect(response.text()).resolves.toBe('Share payload exceeds 5 MB');
    expect(response.status).toBe(413);
    expect(put).not.toHaveBeenCalled();
  });

  test('GET validates and normalizes the stored blob before returning it', async () => {
    const blob = makeBlob();
    const response = await onRequestGet({
      env: { SHARES: { get: vi.fn().mockResolvedValue(makeR2Object(JSON.stringify(blob))) } },
      params: { id: 'share-123' },
    } as never);

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual(blob);
  });

  test('GET rejects stored shares over the 5 MB cap', async () => {
    const response = await onRequestGet({
      env: { SHARES: { get: vi.fn().mockResolvedValue(makeR2Object('x'.repeat(MAX_SHARE_BYTES + 1))) } },
      params: { id: 'share-123' },
    } as never);

    await expect(response.text()).resolves.toBe('Stored share exceeds 5 MB');
    expect(response.status).toBe(413);
  });

  test('PUT accepts only annotation and edit update fields', async () => {
    const response = await onRequestPut({
      request: new Request('https://example.com/api/share/share-123', {
        method: 'PUT',
        body: JSON.stringify({
          annotations: [],
          sourceType: 'file',
        }),
      }),
      env: { SHARES: { get: vi.fn(), put: vi.fn() } },
      params: { id: 'share-123' },
    } as never);

    await expect(response.text()).resolves.toBe('Request body has unexpected fields');
    expect(response.status).toBe(400);
  });

  test('PUT stores updated annotations and edits', async () => {
    const annotation = makeAnnotation();
    const edit = makeTextEdit();
    const put = vi.fn();
    const response = await onRequestPut({
      request: new Request('https://example.com/api/share/share-123', {
        method: 'PUT',
        body: JSON.stringify({ annotations: [annotation], edits: [edit] }),
      }),
      env: {
        SHARES: {
          get: vi.fn().mockResolvedValue(makeR2Object(JSON.stringify(makeBlob()))),
          put,
        },
      },
      params: { id: 'share-123' },
    } as never);

    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(put).toHaveBeenCalledOnce();
    const serialized = put.mock.calls[0][1];
    expect(JSON.parse(serialized)).toMatchObject({
      annotations: [annotation],
      edits: [edit],
    });
  });

  test('PUT preserves existing edits when a legacy annotation-only update omits edits', async () => {
    const annotation = makeAnnotation();
    const existingEdit = makeTextEdit();
    const put = vi.fn();
    const response = await onRequestPut({
      request: new Request('https://example.com/api/share/share-123', {
        method: 'PUT',
        body: JSON.stringify({ annotations: [annotation] }),
      }),
      env: {
        SHARES: {
          get: vi.fn().mockResolvedValue(
            makeR2Object(JSON.stringify(makeBlob({ edits: [existingEdit] }))),
          ),
          put,
        },
      },
      params: { id: 'share-123' },
    } as never);

    await expect(response.json()).resolves.toEqual({ ok: true });
    const serialized = put.mock.calls[0][1];
    expect(JSON.parse(serialized)).toMatchObject({
      annotations: [annotation],
      edits: [existingEdit],
    });
  });

  test('PUT rejects oversized bodies even when content-length is absent', async () => {
    const get = vi.fn();
    const put = vi.fn();
    const response = await onRequestPut({
      request: new Request('https://example.com/api/share/share-123', {
        method: 'PUT',
        body: 'x'.repeat(MAX_SHARE_BYTES + 1),
      }),
      env: { SHARES: { get, put } },
      params: { id: 'share-123' },
    } as never);

    await expect(response.text()).resolves.toBe('Share payload exceeds 5 MB');
    expect(response.status).toBe(413);
    expect(get).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });

  test('PUT returns 413 when the merged blob exceeds the cap', async () => {
    const annotation = makeAnnotation();
    const blob = makeBlob({ html: 'x'.repeat(MAX_SHARE_BYTES) });
    const response = await onRequestPut({
      request: new Request('https://example.com/api/share/share-123', {
        method: 'PUT',
        body: JSON.stringify({ annotations: [annotation] }),
      }),
      env: { SHARES: { get: vi.fn().mockResolvedValue(makeR2Object(JSON.stringify(blob))), put: vi.fn() } },
      params: { id: 'share-123' },
    } as never);

    await expect(response.text()).resolves.toBe('Share payload exceeds 5 MB');
    expect(response.status).toBe(413);
  });
});
