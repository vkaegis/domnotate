import { afterEach, describe, expect, test, vi } from 'vitest';

import { makeAnnotation, makeSession } from '@/__tests__/fixtures';
import { fetchShare, publishShare } from '@/share/share-client';

describe('share-client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
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
    });

    await expect(publishShare(session)).resolves.toEqual({ id: 'share-123' });
    expect(fetchMock).toHaveBeenCalledWith('/api/share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceType: session.sourceType,
        sourceName: session.sourceName,
        html: session.html,
        annotations: session.annotations,
      }),
    });
  });

  test('fails before fetch when html is unavailable', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(publishShare(makeSession())).rejects.toThrow('loaded HTML is unavailable');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('throws API error text', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Invalid share', { status: 400 })));

    await expect(
      publishShare(makeSession({ html: '<html></html>' })),
    ).rejects.toThrow('Invalid share');
  });

  test('throws on invalid API response shape', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }))));

    await expect(
      publishShare(makeSession({ html: '<html></html>' })),
    ).rejects.toThrow('invalid response');
  });

  test('fetches a shared session blob', async () => {
    const annotation = makeAnnotation();
    const blob = {
      schemaVersion: 1,
      id: 'share-123',
      sourceType: 'file',
      sourceName: 'page.html',
      html: '<html><body>Shared</body></html>',
      annotations: [annotation],
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

    await expect(fetchShare('missing')).rejects.toThrow('Share not found');
  });

  test('throws on invalid shared session response shape', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'bad' }))));

    await expect(fetchShare('bad')).rejects.toThrow('Invalid shared session');
  });
});
