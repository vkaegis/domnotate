import type { SourceHint } from '@/core/source-hint/types';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { HINT_CHANNEL, HINT_TARGET_ATTR, isHintResponse } from '@/extension/hint-protocol';
import {
  bootstrapMainWorld,
  installSourceHintResponder,
  teardownMainWorld,
} from '@/extension/content-main';

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

/**
 * Regression, 11 Aug: `hint-protocol` learned that a `file:` URL reports a
 * plausible-but-unusable `file://` origin, and the responder did not — it
 * carried its own inline copy of the rule that only handled `"null"`. The
 * request reached the MAIN world, the hint was computed, and the reply threw on
 * the way back, so every annotation on a local HTML file exported with no
 * source hint and no visible failure.
 *
 * The same shape as the Phase 1 filter that existed twice and drifted, so these
 * assert the responder's target directly rather than trusting the shared helper.
 */
describe('the response reaches origins that cannot be named', () => {
  /** Only the postMessage target is under test; `location` is not writable. */
  function fakeWin(location: { origin: string; protocol: string }): {
    win: Window;
    posted: string[];
    deliver: (nonce: string) => void;
  } {
    let onMessage: ((e: MessageEvent) => void) | null = null;
    const posted: string[] = [];
    const win = {
      location,
      document,
      addEventListener: (_t: string, fn: (e: MessageEvent) => void) => {
        onMessage = fn;
      },
      removeEventListener: () => {
        onMessage = null;
      },
      postMessage: (_msg: unknown, target: string) => posted.push(target),
    } as unknown as Window;

    return {
      win,
      posted,
      deliver: (nonce) =>
        onMessage?.({
          data: { channel: HINT_CHANNEL, kind: 'request', nonce },
        } as MessageEvent),
    };
  }

  function targetUsedFor(location: { origin: string; protocol: string }): string {
    const { win, posted, deliver } = fakeWin(location);
    teardown.push(installSourceHintResponder({ win, describe: () => null }));
    deliver('abc-1');
    return posted[0];
  }

  it('names an ordinary origin', () => {
    expect(targetUsedFor({ origin: 'https://app.test', protocol: 'https:' })).toBe(
      'https://app.test',
    );
  });

  it('falls back for an opaque origin', () => {
    expect(targetUsedFor({ origin: 'null', protocol: 'https:' })).toBe('*');
  });

  it('falls back for a file URL, whose origin looks nameable and is not', () => {
    expect(targetUsedFor({ origin: 'file://', protocol: 'file:' })).toBe('*');
  });
});

describe('bootstrapMainWorld', () => {
  afterEach(() => teardownMainWorld(window));

  it('never stacks responders, however often the script is re-injected', async () => {
    bootstrapMainWorld(window);
    bootstrapMainWorld(window);
    bootstrapMainWorld(window);

    const el = document.createElement('div');
    el.setAttribute(HINT_TARGET_ATTR, 'once');
    document.body.appendChild(el);

    // Three injections, one answer.
    const replies: unknown[] = [];
    const listener = (event: MessageEvent): void => {
      const data = event.data as { kind?: string };
      if (data?.kind === 'response') replies.push(data);
    };
    window.addEventListener('message', listener);
    window.postMessage(
      { channel: 'domnotate:source-hint', kind: 'request', nonce: 'once' },
      window.location.origin,
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    window.removeEventListener('message', listener);

    expect(replies).toHaveLength(1);
  });

  /**
   * Regression: the guard was a boolean, so a copy injected before an
   * extension rebuild stayed resident and kept answering with its old
   * describer. Only a page reload cleared it.
   */
  it('lets a newly injected copy take over from a resident one', async () => {
    const stale = vi.fn(
      (): SourceHint => ({ signals: [], confidence: 'weak', provider: 'stale' }),
    );
    const scope = window as unknown as Record<string, unknown>;
    scope.__domnotateMainUninstall = installSourceHintResponder({ describe: stale });

    expect(bootstrapMainWorld(window)).toBe(false);

    const el = document.createElement('div');
    el.setAttribute(HINT_TARGET_ATTR, 'fresh');
    document.body.appendChild(el);

    const replies: Array<{ hint?: { provider?: string } }> = [];
    const listener = (event: MessageEvent): void => {
      const data = event.data as { kind?: string; hint?: { provider?: string } };
      if (data?.kind === 'response') replies.push(data);
    };
    window.addEventListener('message', listener);
    window.postMessage(
      { channel: 'domnotate:source-hint', kind: 'request', nonce: 'fresh' },
      window.location.origin,
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    window.removeEventListener('message', listener);

    expect(stale).not.toHaveBeenCalled();
    expect(replies).toHaveLength(1);
    expect(replies[0].hint?.provider).not.toBe('stale');
  });
});
