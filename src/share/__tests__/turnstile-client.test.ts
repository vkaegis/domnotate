import { afterEach, describe, expect, test, vi } from 'vitest';

import { getTurnstileToken } from '@/share/turnstile-client';

describe('turnstile-client', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    delete window.turnstile;
    document.body.replaceChildren();
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
});
