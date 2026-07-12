import { afterEach, describe, expect, test, vi } from 'vitest';

import { onRequestGet } from '../../../functions/api/proxy';

const MAX_PROXY_BYTES = 5 * 1024 * 1024;

function makeContext(target: string | null, env: Record<string, string> = {}) {
  const url = new URL('https://domnotate.example/api/proxy');
  if (target !== null) {
    url.searchParams.set('url', target);
  }

  return {
    request: new Request(url),
    env,
  } as never;
}

function htmlResponse(
  body: BodyInit = '<!doctype html><title>Safe</title>',
  init: ResponseInit = {},
) {
  return new Response(body, {
    ...init,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      ...init.headers,
    },
  });
}

describe('proxy Pages Function', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  test.each([
    'http://localhost',
    'http://worker.localhost',
    'http://printer.local',
    'http://0.0.0.0',
    'http://10.0.0.1',
    'http://127.0.0.1',
    'http://169.254.1.1',
    'http://172.16.0.1',
    'http://192.168.0.1',
    'http://224.0.0.1',
    'http://192.0.2.1',
    'http://198.51.100.1',
    'http://203.0.113.1',
    'http://[::]',
    'http://[::1]',
    'http://[fc00::1]',
    'http://[fe80::1]',
    'http://[ff02::1]',
    'http://[2001:db8::1]',
    'http://[::ffff:127.0.0.1]',
  ])('rejects non-public destination %s without fetching', async (target) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await onRequestGet(makeContext(target));

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test.each([
    'http://127.1',
    'http://2130706433',
    'http://0x7f000001',
    'http://%6cocalhost',
  ])('rejects encoded or non-canonical blocked host %s', async (target) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await onRequestGet(makeContext(target));

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test.each([
    'https://user:password@example.com/page',
    'https://example.com:8443/page',
  ])('rejects disallowed target %s without fetching', async (target) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await onRequestGet(makeContext(target));

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test.each([
    ['https://example.com/page', 'https://example.com/page'],
    ['http://example.com/page', 'http://example.com/page'],
    ['example.com/page', 'https://example.com/page'],
  ])('fetches public target %s as %s', async (target, expectedUrl) => {
    const fetchMock = vi.fn().mockResolvedValue(htmlResponse());
    vi.stubGlobal('fetch', fetchMock);

    const response = await onRequestGet(makeContext(target));

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      expectedUrl,
      expect.objectContaining({ redirect: 'manual' }),
    );
  });

  test('returns safe headers for an accepted HTML response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(htmlResponse()));

    const response = await onRequestGet(makeContext('https://example.com'));

    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  test('can be disabled before making an upstream request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await onRequestGet(
      makeContext('https://example.com', { PROXY_ENABLED: 'false' }),
    );

    expect(response.status).toBe(503);
    await expect(response.text()).resolves.toBe('Proxy is temporarily unavailable');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('validates every redirect and refuses a redirect to a blocked address', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { Location: 'http://127.0.0.1/admin' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const response = await onRequestGet(makeContext('https://example.com/redirect'));

    expect(response.status).toBe(502);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  test('follows a small number of safe relative redirects manually', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, { status: 302, headers: { Location: '/final' } }),
      )
      .mockResolvedValueOnce(htmlResponse('<html>Final</html>'));
    vi.stubGlobal('fetch', fetchMock);

    const response = await onRequestGet(makeContext('https://example.com/start'));

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe('<html>Final</html>');
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://example.com/final',
      expect.objectContaining({ redirect: 'manual' }),
    );
  });

  test('stops redirect loops at the redirect limit', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, { status: 302, headers: { Location: '/loop' } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const response = await onRequestGet(makeContext('https://example.com/loop'));

    expect(response.status).toBe(502);
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(4);
  });

  test('rejects a declared body over the proxy limit without reading it', async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([60, 62]));
        controller.close();
      },
      cancel,
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(body, {
          headers: {
            'Content-Type': 'text/html',
            'Content-Length': String(MAX_PROXY_BYTES + 1),
          },
        }),
      ),
    );

    const response = await onRequestGet(makeContext('https://example.com/large'));

    expect(response.status).toBe(502);
    expect(cancel).toHaveBeenCalledOnce();
  });

  test('stops reading a streamed body when it crosses the proxy limit', async () => {
    const cancel = vi.fn();
    const chunk = new Uint8Array(1024 * 1024);
    let chunksSent = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        chunksSent += 1;
        controller.enqueue(chunk);
        if (chunksSent === 6) {
          controller.close();
        }
      },
      cancel,
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(htmlResponse(body)));

    const response = await onRequestGet(makeContext('https://example.com/chunked'));

    expect(response.status).toBe(502);
    expect(chunksSent).toBe(6);
    expect(cancel).toHaveBeenCalledOnce();
  });

  test.each(['application/octet-stream', 'image/png', 'text/plain'])(
    'rejects disallowed upstream content type %s without reflecting its body',
    async (contentType) => {
      const secretBody = 'upstream-private-body';
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response(secretBody, { headers: { 'Content-Type': contentType } }),
        ),
      );

      const response = await onRequestGet(makeContext('https://example.com/download'));

      expect(response.status).toBe(502);
      await expect(response.text()).resolves.not.toContain(secretBody);
    },
  );

  test('times out the upstream request without exposing the exception', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      if (!init?.signal) {
        throw new Error('missing abort signal with internal details');
      }
      return new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          reject(new Error('socket timeout with internal details'));
        });
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const responsePromise = onRequestGet(makeContext('https://example.com/slow'));
    await vi.runAllTimersAsync();
    const response = await responsePromise;
    const responseBody = await response.text();

    expect(response.status).toBe(504);
    expect(responseBody).toBe('Upstream request timed out');
    expect(responseBody).not.toContain('internal details');
  });

  test('does not expose an upstream network exception', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED 203.0.113.7:443')),
    );

    const response = await onRequestGet(makeContext('https://example.com'));
    const responseBody = await response.text();

    expect(response.status).toBe(502);
    expect(responseBody).toBe('Unable to fetch target');
    expect(responseBody).not.toContain('ECONNREFUSED');
  });
});
