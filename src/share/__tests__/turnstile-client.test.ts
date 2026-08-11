import { afterEach, describe, expect, test, vi } from 'vitest';

import { UPDATE_SHARE_ACTION, getTurnstileToken } from '@/share/turnstile-client';

type RenderOptions = {
  callback: (token: string) => void;
  'before-interactive-callback': () => void;
  'after-interactive-callback': () => void;
};

/** Captures the render options so a test can drive Turnstile's callbacks. */
function stubTurnstile(): { options: () => RenderOptions; remove: ReturnType<typeof vi.fn> } {
  let captured: RenderOptions | null = null;
  const remove = vi.fn();
  const render = vi.fn((_container: HTMLElement, options: RenderOptions) => {
    captured = options;
    return 'widget-123';
  });
  window.turnstile = { render, execute: vi.fn(), remove } as unknown as typeof window.turnstile;
  return {
    options: () => {
      if (!captured) throw new Error('render was not called');
      return captured;
    },
    remove,
  };
}

/** getTurnstileToken awaits the script loader before it renders anything. */
async function afterRender(): Promise<void> {
  for (let tick = 0; tick < 4; tick += 1) await Promise.resolve();
}

function backdrop(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.dn-challenge-backdrop');
}

function isHidden(): boolean {
  return backdrop()?.classList.contains('dn-challenge-backdrop--hidden') ?? false;
}

describe('turnstile-client', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.useRealTimers();
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

  test('keeps the challenge hidden until Turnstile needs interaction, then reveals it in place', async () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'public-site-key');
    const turnstile = stubTurnstile();

    const pending = getTurnstileToken();
    await afterRender();
    expect(isHidden()).toBe(true);

    turnstile.options()['before-interactive-callback']();
    expect(isHidden()).toBe(false);
    expect(backdrop()?.getAttribute('aria-modal')).toBe('true');

    turnstile.options()['after-interactive-callback']();
    expect(isHidden()).toBe(true);

    turnstile.options().callback('verified-token');
    await expect(pending).resolves.toBe('verified-token');
    expect(document.body.children).toHaveLength(0);
  });

  test('reveals the challenge even if before-interactive-callback never fires', async () => {
    vi.useFakeTimers();
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'public-site-key');
    const turnstile = stubTurnstile();

    const pending = getTurnstileToken();
    await vi.advanceTimersByTimeAsync(0);
    expect(isHidden()).toBe(true);

    await vi.advanceTimersByTimeAsync(3000);
    expect(isHidden()).toBe(false);

    turnstile.options().callback('verified-token');
    await expect(pending).resolves.toBe('verified-token');
  });

  test('Escape cancels a visible challenge without leaving the surface behind', async () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'public-site-key');
    const turnstile = stubTurnstile();

    const pending = getTurnstileToken(UPDATE_SHARE_ACTION);
    await afterRender();
    turnstile.options()['before-interactive-callback']();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    await expect(pending).rejects.toThrow('Verification cancelled');
    expect(turnstile.remove).toHaveBeenCalledWith('widget-123');
    expect(document.body.children).toHaveLength(0);
  });

  test('Escape is ignored while an autosave challenge is still invisible', async () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'public-site-key');
    const turnstile = stubTurnstile();

    const pending = getTurnstileToken(UPDATE_SHARE_ACTION);
    await afterRender();
    let settled = false;
    void pending.then(() => { settled = true; }, () => { settled = true; });

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await Promise.resolve();
    expect(settled).toBe(false);

    turnstile.options().callback('verified-token');
    await expect(pending).resolves.toBe('verified-token');
  });

  test('explains which action is being verified', async () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'public-site-key');
    const turnstile = stubTurnstile();

    const pending = getTurnstileToken(UPDATE_SHARE_ACTION);
    await afterRender();
    expect(document.querySelector('.dn-challenge-caption')?.textContent).toContain('changes save');

    turnstile.options().callback('verified-token');
    await pending;
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
