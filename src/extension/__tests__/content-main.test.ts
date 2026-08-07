import type { SourceHint } from '@/core/source-hint/types';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { HINT_CHANNEL, HINT_TARGET_ATTR, isHintResponse } from '@/extension/hint-protocol';
import { bootstrapMainWorld, installSourceHintResponder } from '@/extension/content-main';

const teardown: Array<() => void> = [];

afterEach(() => {
  while (teardown.length) teardown.pop()!();
  document.body.replaceChildren();
  delete (window as unknown as Record<string, unknown>).__domnotateMainInstalled;
});

/** Post a raw request and collect whatever comes back for that nonce. */
function ask(nonce: string, timeoutMs = 20): Promise<unknown> {
  return new Promise((resolve) => {
    const onMessage = (event: MessageEvent): void => {
      if (!isHintResponse(event.data) || event.data.nonce !== nonce) return;
      cleanup();
      resolve(event.data.hint);
    };
    const timer = setTimeout(() => {
      cleanup();
      resolve('__timeout__');
    }, timeoutMs);
    const cleanup = (): void => {
      clearTimeout(timer);
      window.removeEventListener('message', onMessage);
    };
    window.addEventListener('message', onMessage);
    window.postMessage(
      { channel: HINT_CHANNEL, kind: 'request', nonce },
      window.location.origin,
    );
  });
}

describe('installSourceHintResponder', () => {
  it('answers with null when no element carries the nonce', async () => {
    teardown.push(installSourceHintResponder());
    expect(await ask('missing-nonce')).toBeNull();
  });

  it('degrades to no hint when the describer throws', async () => {
    const el = document.createElement('div');
    el.setAttribute(HINT_TARGET_ATTR, 'boom');
    document.body.appendChild(el);

    teardown.push(
      installSourceHintResponder({
        describe: () => {
          throw new Error('fiber walk exploded');
        },
      }),
    );

    expect(await ask('boom')).toBeNull();
  });

  it('refuses a nonce that is not selector-inert', async () => {
    const describe = vi.fn((): SourceHint => ({ signals: [], confidence: 'weak', provider: 'test' }));
    teardown.push(installSourceHintResponder({ describe }));

    // A hostile page could post anything; an injected selector must not run.
    expect(await ask('"], script, [x="')).toBe('__timeout__');
    expect(describe).not.toHaveBeenCalled();
  });

  it('ignores messages on other channels', async () => {
    const describe = vi.fn((): SourceHint => ({ signals: [], confidence: 'weak', provider: 'test' }));
    teardown.push(installSourceHintResponder({ describe }));

    window.postMessage({ channel: 'something-else', kind: 'request', nonce: 'x' }, '*');
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(describe).not.toHaveBeenCalled();
  });

  it('uninstalls cleanly', async () => {
    const describe = vi.fn((): SourceHint => ({ signals: [], confidence: 'weak', provider: 'test' }));
    const uninstall = installSourceHintResponder({ describe });
    uninstall();

    const el = document.createElement('div');
    el.setAttribute(HINT_TARGET_ATTR, 'gone');
    document.body.appendChild(el);

    expect(await ask('gone')).toBe('__timeout__');
    expect(describe).not.toHaveBeenCalled();
  });
});

describe('bootstrapMainWorld', () => {
  it('installs once no matter how often the script is re-injected', () => {
    expect(bootstrapMainWorld(window)).toBe(true);
    expect(bootstrapMainWorld(window)).toBe(false);
    expect(bootstrapMainWorld(window)).toBe(false);
  });
});
