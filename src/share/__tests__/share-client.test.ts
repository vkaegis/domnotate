import { afterEach, describe, expect, test, vi } from 'vitest';

import { makeAnnotation, makeSession, makeTextEdit } from '@/__tests__/fixtures';
import {
  deleteShare,
  fetchShare,
  isDefinitiveShareUpdateError,
  publishShare,
  republishAnnotations,
  republishSession,
} from '@/share/share-client';

/**
 * The share client holds grants in a module-level store, so these use a fresh
 * share id per test rather than reaching into it.
 */
function grantScenario(shareId: string, responses: Array<() => Response>) {
  vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'public-site-key');
  window.turnstile = {
    render: vi.fn((_container: HTMLElement, options: { callback: (token: string) => void }) => {
      queueMicrotask(() => options.callback('verified-token'));
      return 'widget-123';
    }),
    execute: vi.fn(),
    remove: vi.fn(),
  } as typeof window.turnstile;

  let write = 0;
  const fetchMock = vi.fn((url: string, _init: RequestInit) => {
    if (url === `/api/share/${shareId}/grant`) {
      return Promise.resolve(new Response(
        JSON.stringify({ grant: 'issued-grant', expiresAt: Date.now() + 3_600_000 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ));
    }
    const next = responses[Math.min(write, responses.length - 1)];
    write += 1;
    return Promise.resolve(next());
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function grantRequired(): Response {
  return new Response(
    JSON.stringify({ code: 'grant_required' }),
    { status: 401, headers: { 'Content-Type': 'application/json' } },
  );
}

function updateAccepted(): Response {
  return new Response(
    JSON.stringify({ ok: true }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

describe('share-client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    delete window.turnstile;
    window.sessionStorage.clear();
  });

  test('publishes a session to the share API', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'share-123' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const session = makeSession({
      html: '<html><body>Shared</body></html>',
      annotations: [makeAnnotation()],
      edits: [makeTextEdit()],
    });

    await expect(publishShare(session, 'turnstile-token')).resolves.toEqual({ id: 'share-123' });
    expect(fetchMock).toHaveBeenCalledWith('/api/share', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Abuse-Verification-Token': 'turnstile-token',
      },
      body: JSON.stringify({
        sourceType: session.sourceType,
        sourceName: session.sourceName,
        html: session.html,
        annotations: session.annotations,
        edits: session.edits,
      }),
    });
  });

  test('fails before fetch when html is unavailable', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(publishShare(makeSession(), 'turnstile-token')).rejects.toThrow('page HTML is unavailable');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('throws API error text', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Invalid share', { status: 400 })));

    await expect(
      publishShare(makeSession({ html: '<html></html>' }), 'turnstile-token'),
    ).rejects.toThrow('Invalid share');
  });

  test('throws on invalid API response shape', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }))));

    await expect(
      publishShare(makeSession({ html: '<html></html>' }), 'turnstile-token'),
    ).rejects.toThrow('invalid server response');
  });

  test('throws a concise oversized publish error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Share payload exceeds 5 MB', { status: 413 })));

    await expect(
      publishShare(makeSession({ html: '<html></html>' }), 'turnstile-token'),
    ).rejects.toThrow('Share is over the 5 MB limit');
  });

  test('gives a useful retry message when verification fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ code: 'verification_failed' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } },
    )));

    await expect(
      publishShare(makeSession({ html: '<html></html>' }), 'expired-token'),
    ).rejects.toThrow('Verification failed. Please try sharing again.');
  });

  test('gives a distinct message when sharing is disabled', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ code: 'sharing_disabled' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    )));

    await expect(
      publishShare(makeSession({ html: '<html></html>' }), 'turnstile-token'),
    ).rejects.toThrow('Sharing is temporarily unavailable.');
  });

  test('fetches a shared session blob', async () => {
    const annotation = makeAnnotation();
    const edit = makeTextEdit();
    const blob = {
      schemaVersion: 1,
      id: 'share-123',
      sourceType: 'file',
      sourceName: 'page.html',
      html: '<html><body>Shared</body></html>',
      annotations: [annotation],
      edits: [edit],
      createdAt: '2026-05-09T00:00:00.000Z',
      updatedAt: '2026-05-09T00:00:00.000Z',
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(blob), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchShare('share-123')).resolves.toEqual(blob);
    expect(fetchMock).toHaveBeenCalledWith('/api/share/share-123', {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
  });

  test('throws not found for missing shared sessions', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Share not found', { status: 404 })));

    await expect(fetchShare('missing')).rejects.toThrow('Shared link not found');
  });

  test('throws a concise oversized shared-link error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Stored share exceeds 5 MB', { status: 413 })));

    await expect(fetchShare('large')).rejects.toThrow('Shared link is over the 5 MB limit');
  });

  test('throws on invalid shared session response shape', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'bad' }))));

    await expect(fetchShare('bad')).rejects.toThrow('Invalid shared session');
  });

  test('republishes annotations and edits to an existing share', async () => {
    const session = makeSession({
      annotations: [makeAnnotation()],
      edits: [makeTextEdit()],
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(republishSession('share-123', session)).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith('/api/share/share-123', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ annotations: session.annotations, edits: session.edits }),
    });
  });

  test('legacy annotation republish omits edits so the server preserves existing edits', async () => {
    const annotation = makeAnnotation();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(republishAnnotations('share-123', [annotation])).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith('/api/share/share-123', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ annotations: [annotation] }),
    });
  });

  test('throws on invalid update response shape', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: false }))));

    await expect(republishSession('share-123', makeSession())).rejects.toThrow('invalid server response');
  });

  test('reports an expired share distinctly from a missing one when loading', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ code: 'share_expired' }),
      { status: 410, headers: { 'Content-Type': 'application/json' } },
    )));

    await expect(fetchShare('share-123')).rejects.toThrow('This shared link has expired');
  });

  test('reports an expired share when saving changes to it', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ code: 'share_expired' }),
      { status: 410, headers: { 'Content-Type': 'application/json' } },
    )));

    await expect(republishSession('share-123', makeSession())).rejects.toThrow('This shared link has expired');
  });

  test('reports disabled sharing when saving changes, matching publish', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ code: 'sharing_disabled' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    )));

    await expect(republishSession('share-123', makeSession())).rejects.toThrow('Sharing is temporarily unavailable.');
  });

  test('retries a conflicted update exactly once and reports success', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ code: 'conflict' }),
        { status: 409, headers: { 'Content-Type': 'application/json' } },
      ))
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ ok: true }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ));
    vi.stubGlobal('fetch', fetchMock);

    await expect(republishSession('share-123', makeSession())).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1].body).toBe(fetchMock.mock.calls[1][1].body);
  });

  test('stops after one conflict retry instead of looping', async () => {
    const conflict = () => new Response(
      JSON.stringify({ code: 'conflict' }),
      { status: 409, headers: { 'Content-Type': 'application/json' } },
    );
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(conflict()));
    vi.stubGlobal('fetch', fetchMock);

    await expect(republishSession('share-123', makeSession()))
      .rejects.toThrow('Someone else saved to this shared link first');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('a refused update is distinguishable from an undelivered one', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ code: 'share_expired' }),
      { status: 410, headers: { 'Content-Type': 'application/json' } },
    )));

    const refused = await republishSession('share-123', makeSession()).catch((error: unknown) => error);
    expect(isDefinitiveShareUpdateError(refused)).toBe(true);

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const undelivered = await republishSession('share-123', makeSession()).catch((error: unknown) => error);
    expect(isDefinitiveShareUpdateError(undelivered)).toBe(false);
  });

  test('deletes a shared link', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(deleteShare('share-123')).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith('/api/share/share-123', { method: 'DELETE', headers: {} });
  });

  test('reports a refused delete', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ code: 'sharing_disabled' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    )));

    await expect(deleteShare('share-123')).rejects.toThrow('Sharing is temporarily unavailable.');
  });

  test('reports an undeliverable delete', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    await expect(deleteShare('share-123')).rejects.toThrow('Failed to fetch');
  });

  test('takes the challenge only when the server asks, then reuses the grant', async () => {
    const fetchMock = grantScenario('grant-flow-1', [grantRequired, updateAccepted]);

    await expect(republishSession('grant-flow-1', makeSession())).resolves.toEqual({ ok: true });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0][1].headers).not.toHaveProperty('X-Share-Edit-Grant');
    expect(fetchMock.mock.calls[1][0]).toBe('/api/share/grant-flow-1/grant');
    expect(fetchMock.mock.calls[2][1].headers).toMatchObject({
      'X-Share-Edit-Grant': 'issued-grant',
    });

    await expect(republishSession('grant-flow-1', makeSession())).resolves.toEqual({ ok: true });

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[3][0]).toBe('/api/share/grant-flow-1');
    expect(fetchMock.mock.calls[3][1].headers).toMatchObject({
      'X-Share-Edit-Grant': 'issued-grant',
    });
  });

  test('challenges at most once per write when the grant keeps being refused', async () => {
    const fetchMock = grantScenario('grant-flow-2', [grantRequired]);

    await expect(republishSession('grant-flow-2', makeSession()))
      .rejects.toThrow('Verification failed. Please try editing again.');

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.filter((call) => call[0].endsWith('/grant'))).toHaveLength(1);
  });

  test('a delete carries the same grant as a save', async () => {
    const fetchMock = grantScenario('grant-flow-3', [
      grantRequired,
      () => new Response(null, { status: 204 }),
    ]);

    await expect(deleteShare('grant-flow-3')).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2][1]).toMatchObject({
      method: 'DELETE',
      headers: { 'X-Share-Edit-Grant': 'issued-grant' },
    });
  });

  test('a server not configured for editing is reported, not retried as a challenge', async () => {
    const fetchMock = grantScenario('grant-flow-4', [
      () => new Response(
        JSON.stringify({ code: 'sharing_misconfigured' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } },
      ),
    ]);

    await expect(republishSession('grant-flow-4', makeSession()))
      .rejects.toThrow('This server is not configured for editing shared links.');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('throws a concise oversized annotation update error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Share payload exceeds 5 MB', { status: 413 })));

    await expect(republishSession('share-123', makeSession())).rejects.toThrow('Annotations are over the 5 MB limit');
  });
});
