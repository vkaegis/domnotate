import { afterEach, describe, expect, test, vi } from 'vitest';

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

const VALID_TOKEN = 'turnstile-token';

function jsonHeaders(withVerification = false): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    ...(withVerification && { 'X-Abuse-Verification-Token': VALID_TOKEN }),
  };
}

function makePublishPayload(overrides: Record<string, unknown> = {}) {
  return {
    sourceType: 'file',
    sourceName: 'page.html',
    html: '<html><body>Shared</body></html>',
    annotations: [],
    edits: [],
    ...overrides,
  };
}

function successfulVerifier() {
  return { verify: vi.fn().mockResolvedValue({ ok: true }) };
}

describe('share Pages Functions', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  test('POST rejects unexpected top-level request fields', async () => {
    const response = await onRequestPost({
      request: new Request('https://example.com/api/share', {
        method: 'POST',
        headers: jsonHeaders(true),
        body: JSON.stringify({
          sourceType: 'file',
          sourceName: 'page.html',
          html: '<html></html>',
          annotations: [],
          shareId: 'not-allowed',
        }),
      }),
      env: { SHARES: { put: vi.fn() } },
      data: { abuseVerifier: successfulVerifier() },
    } as never);

    await expect(response.json()).resolves.toEqual({ code: 'invalid_payload' });
    expect(response.status).toBe(400);
  });

  test('POST rejects oversized bodies even when content-length is absent', async () => {
    const put = vi.fn();
    const response = await onRequestPost({
      request: new Request('https://example.com/api/share', {
        method: 'POST',
        headers: jsonHeaders(true),
        body: 'x'.repeat(MAX_SHARE_BYTES + 1),
      }),
      env: { SHARES: { put } },
      data: { abuseVerifier: successfulVerifier() },
    } as never);

    await expect(response.json()).resolves.toEqual({ code: 'payload_too_large' });
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
        headers: jsonHeaders(),
        body: JSON.stringify({
          annotations: [],
          sourceType: 'file',
        }),
      }),
      env: { SHARES: { get: vi.fn(), put: vi.fn() } },
      params: { id: 'share-123' },
    } as never);

    await expect(response.json()).resolves.toEqual({ code: 'invalid_payload' });
    expect(response.status).toBe(400);
  });

  test('PUT stores updated annotations and edits', async () => {
    const annotation = makeAnnotation();
    const edit = makeTextEdit();
    const put = vi.fn();
    const response = await onRequestPut({
      request: new Request('https://example.com/api/share/share-123', {
        method: 'PUT',
        headers: jsonHeaders(),
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
        headers: jsonHeaders(),
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
        headers: jsonHeaders(),
        body: 'x'.repeat(MAX_SHARE_BYTES + 1),
      }),
      env: { SHARES: { get, put } },
      params: { id: 'share-123' },
    } as never);

    await expect(response.json()).resolves.toEqual({ code: 'payload_too_large' });
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
        headers: jsonHeaders(),
        body: JSON.stringify({ annotations: [annotation] }),
      }),
      env: { SHARES: { get: vi.fn().mockResolvedValue(makeR2Object(JSON.stringify(blob))), put: vi.fn() } },
      params: { id: 'share-123' },
    } as never);

    await expect(response.json()).resolves.toEqual({ code: 'payload_too_large' });
    expect(response.status).toBe(413);
  });

  test('POST requires application/json before verification or storage access', async () => {
    const verify = vi.fn();
    const put = vi.fn();
    const response = await onRequestPost({
      request: new Request('https://example.com/api/share', {
        method: 'POST',
        headers: { 'X-Abuse-Verification-Token': VALID_TOKEN },
        body: JSON.stringify(makePublishPayload()),
      }),
      env: { SHARES: { put } },
      data: { abuseVerifier: { verify } },
    } as never);

    expect(response.status).toBe(415);
    await expect(response.json()).resolves.toEqual({ code: 'unsupported_media_type' });
    expect(verify).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });

  test('PUT requires application/json before reading from or writing to storage', async () => {
    const get = vi.fn();
    const put = vi.fn();
    const response = await onRequestPut({
      request: new Request('https://example.com/api/share/share-123', {
        method: 'PUT',
        body: JSON.stringify({ annotations: [] }),
      }),
      env: { SHARES: { get, put } },
      params: { id: 'share-123' },
    } as never);

    expect(response.status).toBe(415);
    await expect(response.json()).resolves.toEqual({ code: 'unsupported_media_type' });
    expect(get).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });

  test('disabled sharing rejects creation before reading, verification, or storage', async () => {
    let pulls = 0;
    const stream = new ReadableStream({
      pull(controller) {
        pulls += 1;
        controller.enqueue(new TextEncoder().encode('x'));
        if (pulls === 3) controller.close();
      },
    }, { highWaterMark: 0 });
    const verify = vi.fn();
    const put = vi.fn();
    const response = await onRequestPost({
      request: new Request('https://example.com/api/share', {
        method: 'POST',
        headers: jsonHeaders(true),
        body: stream,
      }),
      env: { SHARING_ENABLED: 'false', SHARES: { put } },
      data: { abuseVerifier: { verify } },
    } as never);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ code: 'sharing_disabled' });
    expect(pulls).toBe(0);
    expect(verify).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });

  test('POST requires successful abuse verification before reading or storing a share', async () => {
    const verify = vi.fn().mockResolvedValue({ ok: false, reason: 'provider_rejected' });
    const put = vi.fn();
    let pulls = 0;
    const stream = new ReadableStream({
      pull(controller) {
        pulls += 1;
        controller.enqueue(new TextEncoder().encode(JSON.stringify(makePublishPayload())));
        controller.close();
      },
    }, { highWaterMark: 0 });
    const response = await onRequestPost({
      request: new Request('https://example.com/api/share', {
        method: 'POST',
        headers: jsonHeaders(true),
        body: stream,
      }),
      env: { SHARES: { put } },
      data: { abuseVerifier: { verify } },
    } as never);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ code: 'verification_failed' });
    expect(verify).toHaveBeenCalledWith(VALID_TOKEN);
    expect(pulls).toBe(0);
    expect(put).not.toHaveBeenCalled();
  });

  test('POST rejects a missing verification token before calling a verifier', async () => {
    const verify = vi.fn().mockResolvedValue({ ok: true });
    const put = vi.fn();
    const response = await onRequestPost({
      request: new Request('https://example.com/api/share', {
        method: 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify(makePublishPayload()),
      }),
      env: { SHARES: { put } },
      data: { abuseVerifier: { verify } },
    } as never);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ code: 'verification_failed' });
    expect(verify).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });

  test('POST verifies Turnstile hostname and action before storing a share', async () => {
    const siteverify = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      hostname: 'domnotate.example.com',
      action: 'create_share',
      challenge_ts: new Date().toISOString(),
      'error-codes': [],
    })));
    vi.stubGlobal('fetch', siteverify);
    const put = vi.fn();
    const response = await onRequestPost({
      request: new Request('https://domnotate.example.com/api/share', {
        method: 'POST',
        headers: jsonHeaders(true),
        body: JSON.stringify(makePublishPayload()),
      }),
      env: {
        SHARES: { put },
        TURNSTILE_SECRET_KEY: 'secret',
        TURNSTILE_EXPECTED_HOSTNAME: 'domnotate.example.com',
      },
      data: {},
    } as never);

    expect(response.status).toBe(200);
    expect(siteverify).toHaveBeenCalledOnce();
    expect(put).toHaveBeenCalledOnce();
  });

  test('chunked bodies stop at the byte limit and cancel without pulling later chunks', async () => {
    const firstChunk = new Uint8Array(MAX_SHARE_BYTES + 1);
    let pulls = 0;
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        if (pulls === 1) {
          controller.enqueue(firstChunk);
        } else {
          controller.enqueue(new Uint8Array([1]));
          controller.close();
        }
      },
      cancel() {
        cancelled = true;
      },
    }, { highWaterMark: 0 });
    const put = vi.fn();
    const response = await onRequestPost({
      request: new Request('https://example.com/api/share', {
        method: 'POST',
        headers: jsonHeaders(true),
        body: stream,
      }),
      env: { SHARES: { put } },
      data: { abuseVerifier: successfulVerifier() },
    } as never);

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({ code: 'payload_too_large' });
    expect(pulls).toBe(1);
    expect(cancelled).toBe(true);
    expect(put).not.toHaveBeenCalled();
  });

  test('creation logs contain outcomes but not submitted content, tokens, or full share ids', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const put = vi.fn();
    const sensitiveHtml = '<html>private document text</html>';
    const response = await onRequestPost({
      request: new Request('https://example.com/api/share', {
        method: 'POST',
        headers: jsonHeaders(true),
        body: JSON.stringify(makePublishPayload({ html: sensitiveHtml })),
      }),
      env: { SHARES: { put } },
      data: { abuseVerifier: successfulVerifier() },
    } as never);

    expect(response.status).toBe(200);
    const { id } = await response.json() as { id: string };
    const logs = JSON.stringify(info.mock.calls);
    expect(logs).toContain('share_creation');
    expect(logs).toContain('accepted');
    expect(logs).not.toContain(sensitiveHtml);
    expect(logs).not.toContain(VALID_TOKEN);
    expect(logs).not.toContain(id);
  });
});
