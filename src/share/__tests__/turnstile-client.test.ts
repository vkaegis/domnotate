import { afterEach, describe, expect, test, vi } from 'vitest';

import { getTurnstileToken } from '@/share/turnstile-client';

describe('turnstile-client', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    delete window.turnstile;
    document.body.replaceChildren();
    document.head
      .querySelectorAll('script[src^="https://challenges.cloudflare.com/turnstile/"]')
      .forEach((script) => script.remove());
  });

  test('executes an interaction-only create-share challenge and returns its token', async () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'public-site-key');
    const remove = vi.fn();
    const execute = vi.fn();
    const render = vi.fn((_container: HTMLElement, options: { callback: (token: string) => void }) => {
      queueMicrotask(() => options.callback('verified-token'));
      return 'widget-123';
    });
    window.turnstile = { render, execute, remove } as typeof window.turnstile;

    await expect(getTurnstileToken()).resolves.toBe('verified-token');
    expect(render).toHaveBeenCalledWith(expect.any(HTMLElement), expect.objectContaining({
      sitekey: 'public-site-key',
      action: 'create_share',
      execution: 'execute',
      appearance: 'interaction-only',
    }));
    expect(execute).toHaveBeenCalledWith('widget-123');
    expect(remove).toHaveBeenCalledWith('widget-123');
    expect(document.body.children).toHaveLength(0);
  });

  test('fails before loading Turnstile when the public site key is missing', async () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', '');

    await expect(getTurnstileToken()).rejects.toThrow('Sharing verification is not configured');
  });

  test('replaces a failed script when retrying Turnstile loading', async () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'public-site-key');
    const createElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation(((tagName: string) => {
      const element = createElement(tagName);
      if (element instanceof HTMLScriptElement) {
        element.type = 'application/json';
      }
      return element;
    }) as typeof document.createElement);

    const firstAttempt = getTurnstileToken();
    const failedScript = document.head.querySelector('script');
    failedScript?.dispatchEvent(new Event('error'));

    await expect(firstAttempt).rejects.toThrow('Verification failed. Please try sharing again.');

    const retry = getTurnstileToken();
    const retryScript = document.head.querySelector('script');
    expect(retryScript).not.toBeNull();
    expect(retryScript).not.toBe(failedScript);

    const remove = vi.fn();
    const execute = vi.fn();
    const render = vi.fn((_container: HTMLElement, options: { callback: (token: string) => void }) => {
      queueMicrotask(() => options.callback('retry-token'));
      return 'widget-123';
    });
    window.turnstile = { render, execute, remove } as typeof window.turnstile;
    retryScript?.dispatchEvent(new Event('load'));

    await expect(retry).resolves.toBe('retry-token');
  });
});
