import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { makeAnnotation, makeTextEdit } from '@/__tests__/fixtures';
import { MAX_SHARE_BYTES, type SharedSessionBlob } from '@/share/shared-session';
import { signGrant } from '../../../functions/lib/edit-grant';
import { SHARE_TTL_DAYS } from '../../../functions/lib/share-expiry';
import { onRequestPost } from '../../../functions/api/share';
import {
  onRequestDelete,
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

function makeR2Object(text: string, etag = 'stored-etag') {
  return {
    text: vi.fn().mockResolvedValue(text),
    etag,
    httpEtag: `"${etag}"`,
  };
}

/** An R2 binding with every method the share handlers reach for. */
function makeShares(overrides: Partial<Record<'get' | 'put' | 'delete', unknown>> = {}) {
  return {
    get: overrides.get ?? vi.fn(),
    put: overrides.put ?? vi.fn(),
    delete: overrides.delete ?? vi.fn().mockResolvedValue(undefined),
  } as {
    get: ReturnType<typeof vi.fn>;
    put: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
}

const VALID_TOKEN = 'turnstile-token';
const GRANT_SECRET = 'test-grant-secret';
const SHARE_ID = 'share-123';

function jsonHeaders(withVerification = false): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    ...(withVerification && { 'X-Abuse-Verification-Token': VALID_TOKEN }),
  };
}

/**
 * A real grant, signed with the same code the grant endpoint uses, so the tests
 * exercise the actual HMAC path rather than a stubbed verifier.
 */
function grantHeader(id = SHARE_ID, expiresAt = NOW.getTime() + 60_000): Promise<string> {
  return signGrant(id, expiresAt, GRANT_SECRET);
}

async function editHeaders(id = SHARE_ID): Promise<Record<string, string>> {
  return {
    'Content-Type': 'application/json',
    'X-Share-Edit-Grant': await grantHeader(id),
  };
}

/** An env that accepts writes when a valid grant is presented. */
function editEnv(shares: unknown, overrides: Record<string, unknown> = {}) {
  return { SHARES: shares, SHARE_GRANT_SECRET: GRANT_SECRET, ...overrides };
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

/**
 * Handlers derive share expiry from the wall clock, so the suite pins the clock
 * just after `makeBlob`'s `createdAt`. Only `Date` is faked; `setTimeout` stays
 * real for the Turnstile verifier's request timeout.
 */
const NOW = new Date('2026-05-09T00:00:10.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

/** A `createdAt` that lands `days` (minus `offsetMs`) before the pinned clock. */
function isoBeforeNow(days: number, offsetMs = 0): string {
  return new Date(NOW.getTime() - days * DAY_MS + offsetMs).toISOString();
}

describe('share Pages Functions', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
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
        headers: await editHeaders(),
        body: JSON.stringify({
          annotations: [],
          sourceType: 'file',
        }),
      }),
      env: editEnv({ get: vi.fn(), put: vi.fn() }),
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
        headers: await editHeaders(),
        body: JSON.stringify({ annotations: [annotation], edits: [edit] }),
      }),
      env: editEnv({
        get: vi.fn().mockResolvedValue(makeR2Object(JSON.stringify(makeBlob()))),
        put,
      }),
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
        headers: await editHeaders(),
        body: JSON.stringify({ annotations: [annotation] }),
      }),
      env: editEnv({
        get: vi.fn().mockResolvedValue(
          makeR2Object(JSON.stringify(makeBlob({ edits: [existingEdit] }))),
        ),
        put,
      }),
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
        headers: await editHeaders(),
        body: 'x'.repeat(MAX_SHARE_BYTES + 1),
      }),
      env: editEnv({ get, put }),
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
        headers: await editHeaders(),
        body: JSON.stringify({ annotations: [annotation] }),
      }),
      env: editEnv({ get: vi.fn().mockResolvedValue(makeR2Object(JSON.stringify(blob))), put: vi.fn() }),
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
        headers: { 'X-Share-Edit-Grant': await grantHeader() },
        body: JSON.stringify({ annotations: [] }),
      }),
      env: editEnv({ get, put }),
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

  test('GET returns 404 when no object is stored for the id', async () => {
    const response = await onRequestGet({
      env: { SHARES: makeShares({ get: vi.fn().mockResolvedValue(null) }) },
      params: { id: 'share-123' },
    } as never);

    expect(response.status).toBe(404);
    await expect(response.text()).resolves.toBe('Share not found');
  });

  test('GET treats a missing or repeated id parameter as not found', async () => {
    const shares = makeShares();
    for (const params of [{}, { id: ['share-123', 'share-456'] }]) {
      const response = await onRequestGet({ env: { SHARES: shares }, params } as never);
      expect(response.status).toBe(404);
    }
    expect(shares.get).not.toHaveBeenCalled();
  });

  test('GET returns 500 when the stored share is not JSON', async () => {
    const response = await onRequestGet({
      env: { SHARES: makeShares({ get: vi.fn().mockResolvedValue(makeR2Object('{ not json')) }) },
      params: { id: 'share-123' },
    } as never);

    expect(response.status).toBe(500);
    await expect(response.text()).resolves.toBe('Stored share is invalid');
  });

  test('GET returns 500 when the stored share fails validation', async () => {
    const response = await onRequestGet({
      env: {
        SHARES: makeShares({
          get: vi.fn().mockResolvedValue(makeR2Object(JSON.stringify({ id: 'share-123' }))),
        }),
      },
      params: { id: 'share-123' },
    } as never);

    expect(response.status).toBe(500);
    await expect(response.text()).resolves.toBe('Stored share is invalid');
  });

  test('PUT returns 404 when the share does not exist', async () => {
    const shares = makeShares({ get: vi.fn().mockResolvedValue(null) });
    const response = await onRequestPut({
      request: new Request('https://example.com/api/share/share-123', {
        method: 'PUT',
        headers: await editHeaders(),
        body: JSON.stringify({ annotations: [] }),
      }),
      env: editEnv(shares),
      params: { id: 'share-123' },
    } as never);

    expect(response.status).toBe(404);
    await expect(response.text()).resolves.toBe('Share not found');
    expect(shares.put).not.toHaveBeenCalled();
  });

  test('PUT returns 500 when the stored share is not JSON', async () => {
    const shares = makeShares({ get: vi.fn().mockResolvedValue(makeR2Object('{ not json')) });
    const response = await onRequestPut({
      request: new Request('https://example.com/api/share/share-123', {
        method: 'PUT',
        headers: await editHeaders(),
        body: JSON.stringify({ annotations: [] }),
      }),
      env: editEnv(shares),
      params: { id: 'share-123' },
    } as never);

    expect(response.status).toBe(500);
    await expect(response.text()).resolves.toBe('Stored share is invalid');
    expect(shares.put).not.toHaveBeenCalled();
  });

  test('PUT returns 500 when the stored share fails validation', async () => {
    const shares = makeShares({
      get: vi.fn().mockResolvedValue(makeR2Object(JSON.stringify({ id: 'share-123' }))),
    });
    const response = await onRequestPut({
      request: new Request('https://example.com/api/share/share-123', {
        method: 'PUT',
        headers: await editHeaders(),
        body: JSON.stringify({ annotations: [] }),
      }),
      env: editEnv(shares),
      params: { id: 'share-123' },
    } as never);

    expect(response.status).toBe(500);
    await expect(response.text()).resolves.toBe('Stored share is invalid');
    expect(shares.put).not.toHaveBeenCalled();
  });

  test('disabled sharing rejects updates before reading the body or touching storage', async () => {
    let pulls = 0;
    const stream = new ReadableStream({
      pull(controller) {
        pulls += 1;
        controller.enqueue(new TextEncoder().encode(JSON.stringify({ annotations: [] })));
        controller.close();
      },
    }, { highWaterMark: 0 });
    const shares = makeShares();
    const response = await onRequestPut({
      request: new Request('https://example.com/api/share/share-123', {
        method: 'PUT',
        headers: await editHeaders(),
        body: stream,
      }),
      env: editEnv(shares, { SHARING_ENABLED: 'false' }),
      params: { id: 'share-123' },
    } as never);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ code: 'sharing_disabled' });
    expect(pulls).toBe(0);
    expect(shares.get).not.toHaveBeenCalled();
    expect(shares.put).not.toHaveBeenCalled();
  });

  test('GET returns 410 for a share past its 30-day lifetime', async () => {
    const response = await onRequestGet({
      env: {
        SHARES: makeShares({
          get: vi.fn().mockResolvedValue(
            makeR2Object(JSON.stringify(makeBlob({ createdAt: isoBeforeNow(SHARE_TTL_DAYS) }))),
          ),
        }),
      },
      params: { id: 'share-123' },
    } as never);

    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toEqual({ code: 'share_expired' });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  test('GET still serves a share on its final live millisecond', async () => {
    const blob = makeBlob({ createdAt: isoBeforeNow(SHARE_TTL_DAYS, 1) });
    const response = await onRequestGet({
      env: {
        SHARES: makeShares({ get: vi.fn().mockResolvedValue(makeR2Object(JSON.stringify(blob))) }),
      },
      params: { id: 'share-123' },
    } as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(blob);
  });

  test('PUT returns 410 and leaves an expired share untouched', async () => {
    const shares = makeShares({
      get: vi.fn().mockResolvedValue(
        makeR2Object(JSON.stringify(makeBlob({ createdAt: isoBeforeNow(SHARE_TTL_DAYS) }))),
      ),
    });
    const response = await onRequestPut({
      request: new Request('https://example.com/api/share/share-123', {
        method: 'PUT',
        headers: await editHeaders(),
        body: JSON.stringify({ annotations: [makeAnnotation()] }),
      }),
      env: editEnv(shares),
      params: { id: 'share-123' },
    } as never);

    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toEqual({ code: 'share_expired' });
    expect(shares.put).not.toHaveBeenCalled();
  });

  test('PUT requires the etag it read, so a stale merge cannot overwrite a newer write', async () => {
    const shares = makeShares({
      get: vi.fn().mockResolvedValue(makeR2Object(JSON.stringify(makeBlob()), 'etag-abc')),
      put: vi.fn().mockResolvedValue({ etag: 'etag-def' }),
    });
    const response = await onRequestPut({
      request: new Request('https://example.com/api/share/share-123', {
        method: 'PUT',
        headers: await editHeaders(),
        body: JSON.stringify({ annotations: [makeAnnotation()] }),
      }),
      env: editEnv(shares),
      params: { id: 'share-123' },
    } as never);

    expect(response.status).toBe(200);
    expect(shares.put.mock.calls[0][2]).toMatchObject({ onlyIf: { etagMatches: 'etag-abc' } });
  });

  test('PUT returns 409 when the object changed between the read and the write', async () => {
    const shares = makeShares({
      get: vi.fn().mockResolvedValue(makeR2Object(JSON.stringify(makeBlob()))),
      put: vi.fn().mockResolvedValue(null),
    });
    const response = await onRequestPut({
      request: new Request('https://example.com/api/share/share-123', {
        method: 'PUT',
        headers: await editHeaders(),
        body: JSON.stringify({ annotations: [makeAnnotation()] }),
      }),
      env: editEnv(shares),
      params: { id: 'share-123' },
    } as never);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ code: 'conflict' });
  });

  test('PUT writes unconditionally when the binding reports no etag', async () => {
    const stored = makeR2Object(JSON.stringify(makeBlob()));
    const shares = makeShares({
      get: vi.fn().mockResolvedValue({ text: stored.text }),
      put: vi.fn().mockResolvedValue({}),
    });
    const response = await onRequestPut({
      request: new Request('https://example.com/api/share/share-123', {
        method: 'PUT',
        headers: await editHeaders(),
        body: JSON.stringify({ annotations: [makeAnnotation()] }),
      }),
      env: editEnv(shares),
      params: { id: 'share-123' },
    } as never);

    expect(response.status).toBe(200);
    expect(shares.put.mock.calls[0][2]).not.toHaveProperty('onlyIf');
  });

  test('PUT falls back to the quoted httpEtag when only that is present', async () => {
    const stored = makeR2Object(JSON.stringify(makeBlob()), 'etag-abc');
    const shares = makeShares({
      get: vi.fn().mockResolvedValue({ text: stored.text, httpEtag: '"etag-abc"' }),
      put: vi.fn().mockResolvedValue({}),
    });
    await onRequestPut({
      request: new Request('https://example.com/api/share/share-123', {
        method: 'PUT',
        headers: await editHeaders(),
        body: JSON.stringify({ annotations: [makeAnnotation()] }),
      }),
      env: editEnv(shares),
      params: { id: 'share-123' },
    } as never);

    expect(shares.put.mock.calls[0][2]).toMatchObject({ onlyIf: { etagMatches: 'etag-abc' } });
  });

  test('DELETE removes the stored object and returns an empty 204', async () => {
    const shares = makeShares();
    const response = await onRequestDelete({
      request: new Request('https://example.com/api/share/share-123', {
        method: 'DELETE',
        headers: { 'X-Share-Edit-Grant': await grantHeader() },
      }),
      env: editEnv(shares),
      params: { id: 'share-123' },
    } as never);

    expect(response.status).toBe(204);
    await expect(response.text()).resolves.toBe('');
    expect(shares.delete).toHaveBeenCalledWith('share/share-123.json');
  });

  test('DELETE is idempotent when the share is already gone', async () => {
    const shares = makeShares();
    const context = {
      request: new Request('https://example.com/api/share/share-123', {
        method: 'DELETE',
        headers: { 'X-Share-Edit-Grant': await grantHeader() },
      }),
      env: editEnv(shares),
      params: { id: 'share-123' },
    } as never;

    expect((await onRequestDelete(context)).status).toBe(204);
    expect((await onRequestDelete(context)).status).toBe(204);
    expect(shares.delete).toHaveBeenCalledTimes(2);
  });

  test('DELETE rejects an id outside the allowed character set', async () => {
    const shares = makeShares();
    const response = await onRequestDelete({
      request: new Request('https://example.com/api/share/bad', { method: 'DELETE' }),
      env: editEnv(shares),
      params: { id: '../../secrets' },
    } as never);

    expect(response.status).toBe(404);
    expect(shares.delete).not.toHaveBeenCalled();
  });

  test('DELETE is refused while sharing is disabled', async () => {
    const shares = makeShares();
    const response = await onRequestDelete({
      request: new Request('https://example.com/api/share/share-123', {
        method: 'DELETE',
        headers: { 'X-Share-Edit-Grant': await grantHeader() },
      }),
      env: editEnv(shares, { SHARING_ENABLED: 'false' }),
      params: { id: 'share-123' },
    } as never);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ code: 'sharing_disabled' });
    expect(shares.delete).not.toHaveBeenCalled();
  });

  test('DELETE reports a storage failure without claiming success', async () => {
    const shares = makeShares({ delete: vi.fn().mockRejectedValue(new Error('R2 down')) });
    const response = await onRequestDelete({
      request: new Request('https://example.com/api/share/share-123', {
        method: 'DELETE',
        headers: { 'X-Share-Edit-Grant': await grantHeader() },
      }),
      env: editEnv(shares),
      params: { id: 'share-123' },
    } as never);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ code: 'internal_error' });
  });

  test('PUT without a grant is refused before the body is read', async () => {
    let pulls = 0;
    const stream = new ReadableStream({
      pull(controller) {
        pulls += 1;
        controller.enqueue(new TextEncoder().encode(JSON.stringify({ annotations: [] })));
        controller.close();
      },
    }, { highWaterMark: 0 });
    const shares = makeShares();
    const response = await onRequestPut({
      request: new Request('https://example.com/api/share/share-123', {
        method: 'PUT',
        headers: jsonHeaders(),
        body: stream,
      }),
      env: editEnv(shares),
      params: { id: 'share-123' },
    } as never);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ code: 'grant_required' });
    expect(pulls).toBe(0);
    expect(shares.get).not.toHaveBeenCalled();
    expect(shares.put).not.toHaveBeenCalled();
  });

  test('PUT reports an expired grant separately so the client knows to renew', async () => {
    const shares = makeShares();
    const response = await onRequestPut({
      request: new Request('https://example.com/api/share/share-123', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Share-Edit-Grant': await grantHeader(SHARE_ID, NOW.getTime() - 1),
        },
        body: JSON.stringify({ annotations: [] }),
      }),
      env: editEnv(shares),
      params: { id: 'share-123' },
    } as never);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ code: 'grant_expired' });
    expect(shares.put).not.toHaveBeenCalled();
  });

  test('PUT rejects a grant issued for a different share', async () => {
    const shares = makeShares();
    const response = await onRequestPut({
      request: new Request('https://example.com/api/share/share-123', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Share-Edit-Grant': await grantHeader('share-456'),
        },
        body: JSON.stringify({ annotations: [] }),
      }),
      env: editEnv(shares),
      params: { id: 'share-123' },
    } as never);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ code: 'grant_required' });
    expect(shares.get).not.toHaveBeenCalled();
  });

  test('PUT refuses writes when the deployment has no grant secret', async () => {
    const shares = makeShares();
    const response = await onRequestPut({
      request: new Request('https://example.com/api/share/share-123', {
        method: 'PUT',
        headers: await editHeaders(),
        body: JSON.stringify({ annotations: [] }),
      }),
      env: { SHARES: shares },
      params: { id: 'share-123' },
    } as never);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ code: 'sharing_misconfigured' });
    expect(shares.put).not.toHaveBeenCalled();
  });

  test('DELETE without a grant leaves the object in place', async () => {
    const shares = makeShares();
    const response = await onRequestDelete({
      request: new Request('https://example.com/api/share/share-123', { method: 'DELETE' }),
      env: editEnv(shares),
      params: { id: 'share-123' },
    } as never);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ code: 'grant_required' });
    expect(shares.delete).not.toHaveBeenCalled();
  });

  test('update logs record outcomes without the share id, grant, or annotation text', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const grant = await grantHeader();
    const annotation = makeAnnotation({ text: 'private feedback text' });
    const response = await onRequestPut({
      request: new Request('https://example.com/api/share/share-123', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Share-Edit-Grant': grant },
        body: JSON.stringify({ annotations: [annotation] }),
      }),
      env: editEnv(makeShares({
        get: vi.fn().mockResolvedValue(makeR2Object(JSON.stringify(makeBlob()))),
        put: vi.fn().mockResolvedValue({}),
      })),
      params: { id: 'share-123' },
    } as never);

    expect(response.status).toBe(200);
    const logs = JSON.stringify(info.mock.calls);
    expect(logs).toContain('share_update');
    expect(logs).toContain('accepted');
    expect(logs).not.toContain('private feedback text');
    expect(logs).not.toContain(grant);
    expect(logs).not.toContain(SHARE_ID);
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
