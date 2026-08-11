import { afterEach, describe, expect, test, vi } from 'vitest';

import { createEditGrantStore } from '@/share/edit-grant-client';
import { UPDATE_SHARE_ACTION } from '@/share/turnstile-client';

const NOW = Date.parse('2026-05-09T00:00:00.000Z');

function memoryStorage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  const entries = new Map<string, string>();
  return {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => void entries.set(key, value),
    removeItem: (key) => void entries.delete(key),
  };
}

function issued(expiresAt: number, grant = 'signed-grant') {
  return { grant, expiresAt };
}

describe('createEditGrantStore', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('challenges once per share, then serves the grant from cache', async () => {
    const getToken = vi.fn().mockResolvedValue('token');
    const requestGrant = vi.fn().mockResolvedValue(issued(NOW + 60_000));
    const grants = createEditGrantStore({
      getToken,
      requestGrant,
      now: () => NOW,
      storage: memoryStorage(),
    });

    await expect(grants.acquire('share-123')).resolves.toBe('signed-grant');
    await expect(grants.acquire('share-123')).resolves.toBe('signed-grant');

    expect(getToken).toHaveBeenCalledTimes(1);
    expect(getToken).toHaveBeenCalledWith(UPDATE_SHARE_ACTION);
    expect(requestGrant).toHaveBeenCalledTimes(1);
    expect(requestGrant).toHaveBeenCalledWith('share-123', 'token');
  });

  test('peek does not challenge', async () => {
    const getToken = vi.fn().mockResolvedValue('token');
    const grants = createEditGrantStore({
      getToken,
      requestGrant: vi.fn().mockResolvedValue(issued(NOW + 60_000)),
      now: () => NOW,
      storage: memoryStorage(),
    });

    expect(grants.peek('share-123')).toBeNull();
    expect(getToken).not.toHaveBeenCalled();

    await grants.acquire('share-123');
    expect(grants.peek('share-123')).toBe('signed-grant');
  });

  test('two writes racing for the same share share one challenge', async () => {
    const getToken = vi.fn().mockResolvedValue('token');
    const requestGrant = vi.fn().mockResolvedValue(issued(NOW + 60_000));
    const grants = createEditGrantStore({
      getToken,
      requestGrant,
      now: () => NOW,
      storage: memoryStorage(),
    });

    const [first, second] = await Promise.all([
      grants.acquire('share-123'),
      grants.acquire('share-123'),
    ]);

    expect(first).toBe(second);
    expect(getToken).toHaveBeenCalledTimes(1);
    expect(requestGrant).toHaveBeenCalledTimes(1);
  });

  test('a failed challenge is not cached, so the next write can try again', async () => {
    const getToken = vi.fn()
      .mockRejectedValueOnce(new Error('Verification failed. Please try sharing again.'))
      .mockResolvedValueOnce('token');
    const grants = createEditGrantStore({
      getToken,
      requestGrant: vi.fn().mockResolvedValue(issued(NOW + 60_000)),
      now: () => NOW,
      storage: memoryStorage(),
    });

    await expect(grants.acquire('share-123')).rejects.toThrow('Verification failed');
    await expect(grants.acquire('share-123')).resolves.toBe('signed-grant');
    expect(getToken).toHaveBeenCalledTimes(2);
  });

  test('each share gets its own grant', async () => {
    const requestGrant = vi.fn()
      .mockResolvedValueOnce(issued(NOW + 60_000, 'grant-a'))
      .mockResolvedValueOnce(issued(NOW + 60_000, 'grant-b'));
    const grants = createEditGrantStore({
      getToken: vi.fn().mockResolvedValue('token'),
      requestGrant,
      now: () => NOW,
      storage: memoryStorage(),
    });

    await expect(grants.acquire('share-a')).resolves.toBe('grant-a');
    await expect(grants.acquire('share-b')).resolves.toBe('grant-b');
    expect(grants.peek('share-a')).toBe('grant-a');
  });

  test('a grant close to expiry is treated as spent rather than sent', async () => {
    let clock = NOW;
    const grants = createEditGrantStore({
      getToken: vi.fn().mockResolvedValue('token'),
      requestGrant: vi.fn().mockResolvedValue(issued(NOW + 60_000)),
      now: () => clock,
      storage: memoryStorage(),
    });

    await grants.acquire('share-123');
    expect(grants.peek('share-123')).toBe('signed-grant');

    clock = NOW + 40_000; // inside the 30s skew of a 60s grant
    expect(grants.peek('share-123')).toBeNull();
  });

  test('a grant survives a reload through storage', async () => {
    const storage = memoryStorage();
    const first = createEditGrantStore({
      getToken: vi.fn().mockResolvedValue('token'),
      requestGrant: vi.fn().mockResolvedValue(issued(NOW + 60_000)),
      now: () => NOW,
      storage,
    });
    await first.acquire('share-123');

    const getToken = vi.fn();
    const reloaded = createEditGrantStore({
      getToken,
      requestGrant: vi.fn(),
      now: () => NOW,
      storage,
    });

    expect(reloaded.peek('share-123')).toBe('signed-grant');
    expect(getToken).not.toHaveBeenCalled();
  });

  test('an invalidated grant is gone from storage too', async () => {
    const storage = memoryStorage();
    const grants = createEditGrantStore({
      getToken: vi.fn().mockResolvedValue('token'),
      requestGrant: vi.fn().mockResolvedValue(issued(NOW + 60_000)),
      now: () => NOW,
      storage,
    });
    await grants.acquire('share-123');

    grants.invalidate('share-123');

    expect(grants.peek('share-123')).toBeNull();
    expect(storage.getItem('domnotate-share-grant:share-123')).toBeNull();
  });

  test('invalidating a superseded grant leaves the current one alone', async () => {
    const requestGrant = vi.fn()
      .mockResolvedValueOnce(issued(NOW + 60_000, 'grant-old'))
      .mockResolvedValueOnce(issued(NOW + 60_000, 'grant-new'));
    const grants = createEditGrantStore({
      getToken: vi.fn().mockResolvedValue('token'),
      requestGrant,
      now: () => NOW,
      storage: memoryStorage(),
    });

    await grants.acquire('share-123');
    grants.invalidate('share-123', 'grant-old');
    await grants.acquire('share-123');
    expect(grants.peek('share-123')).toBe('grant-new');

    // A write that went out with the superseded grant must not clear this one.
    grants.invalidate('share-123', 'grant-old');
    expect(grants.peek('share-123')).toBe('grant-new');

    grants.invalidate('share-123');
    expect(grants.peek('share-123')).toBeNull();
  });

  test('unreadable stored data is ignored rather than thrown', () => {
    const storage = memoryStorage();
    storage.setItem('domnotate-share-grant:share-123', 'not json');
    const grants = createEditGrantStore({ now: () => NOW, storage });

    expect(grants.peek('share-123')).toBeNull();
  });

  test('works with no storage at all', async () => {
    const grants = createEditGrantStore({
      getToken: vi.fn().mockResolvedValue('token'),
      requestGrant: vi.fn().mockResolvedValue(issued(NOW + 60_000)),
      now: () => NOW,
      storage: null,
    });

    await expect(grants.acquire('share-123')).resolves.toBe('signed-grant');
    expect(grants.peek('share-123')).toBe('signed-grant');
  });

  test('requests a grant from the share grant endpoint by default', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ grant: 'server-grant', expiresAt: NOW + 60_000 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const grants = createEditGrantStore({
      getToken: vi.fn().mockResolvedValue('token'),
      now: () => NOW,
      storage: memoryStorage(),
    });

    await expect(grants.acquire('share-123')).resolves.toBe('server-grant');
    expect(fetchMock).toHaveBeenCalledWith('/api/share/share-123/grant', {
      method: 'POST',
      headers: { 'X-Abuse-Verification-Token': 'token' },
    });
  });

  test('a refused grant request surfaces a retryable message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ code: 'verification_failed' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } },
    )));
    const grants = createEditGrantStore({
      getToken: vi.fn().mockResolvedValue('token'),
      now: () => NOW,
      storage: memoryStorage(),
    });

    await expect(grants.acquire('share-123')).rejects.toThrow('Verification failed');
  });

  test('a malformed grant response is rejected', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ grant: 'server-grant' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )));
    const grants = createEditGrantStore({
      getToken: vi.fn().mockResolvedValue('token'),
      now: () => NOW,
      storage: memoryStorage(),
    });

    await expect(grants.acquire('share-123')).rejects.toThrow('Could not verify this browser for editing');
  });
});
