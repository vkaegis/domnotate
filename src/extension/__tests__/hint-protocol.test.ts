import type { SourceHint } from '@/core/source-hint/types';
import { describe, it, expect, afterEach } from 'vitest';
import {
  HINT_CHANNEL,
  HINT_TARGET_ATTR,
  createNonce,
  isHintRequest,
  isHintResponse,
  requestSourceHint,
} from '@/extension/hint-protocol';
import { installSourceHintResponder, describeStub } from '@/extension/content-main';

const teardown: Array<() => void> = [];

afterEach(() => {
  while (teardown.length) teardown.pop()!();
  document.body.replaceChildren();
});

describe('message guards', () => {
  it('accepts only well-formed requests', () => {
    expect(isHintRequest({ channel: HINT_CHANNEL, kind: 'request', nonce: 'a' })).toBe(true);
    expect(isHintRequest({ channel: HINT_CHANNEL, kind: 'response', nonce: 'a' })).toBe(false);
    expect(isHintRequest({ channel: 'other', kind: 'request', nonce: 'a' })).toBe(false);
    expect(isHintRequest({ channel: HINT_CHANNEL, kind: 'request' })).toBe(false);
    expect(isHintRequest('request')).toBe(false);
    expect(isHintRequest(null)).toBe(false);
  });

  it('accepts only well-formed responses', () => {
    expect(isHintResponse({ channel: HINT_CHANNEL, kind: 'response', nonce: 'a' })).toBe(true);
    expect(isHintResponse({ channel: HINT_CHANNEL, kind: 'request', nonce: 'a' })).toBe(false);
    expect(isHintResponse(undefined)).toBe(false);
  });
});

describe('createNonce', () => {
  it('never repeats', () => {
    const nonces = new Set(Array.from({ length: 50 }, () => createNonce()));
    expect(nonces.size).toBe(50);
  });

  it('produces a nonce the MAIN world will accept into a selector', () => {
    expect(createNonce()).toMatch(/^[A-Za-z0-9-]+$/);
  });
});

describe('nonce handoff, both worlds', () => {
  it('round-trips a hint for the tagged element', async () => {
    const el = document.createElement('div');
    document.body.appendChild(el);

    teardown.push(
      installSourceHintResponder({
        describe: (target): SourceHint => ({
          signals: [{ kind: 'literal-text', text: target.tagName, truncated: false }],
          confidence: 'weak',
          provider: 'test',
        }),
      }),
    );

    const hint = await requestSourceHint(el);

    expect(hint).toEqual({
      signals: [{ kind: 'literal-text', text: 'DIV', truncated: false }],
      confidence: 'weak',
      provider: 'test',
    });
  });

  it('resolves the element the ISOLATED world tagged, not any other', async () => {
    const other = document.createElement('span');
    const picked = document.createElement('button');
    document.body.append(other, picked);

    teardown.push(
      installSourceHintResponder({
        describe: (target) => ({ signals: [], confidence: 'weak', provider: target.tagName }),
      }),
    );

    const hint = await requestSourceHint(picked);
    expect(hint?.provider).toBe('BUTTON');
  });

  it('leaves no Domnotate attribute on the host page afterwards', async () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    teardown.push(installSourceHintResponder());

    await requestSourceHint(el);

    expect(el.hasAttribute(HINT_TARGET_ATTR)).toBe(false);
  });

  it('cleans the attribute up even when nothing answers', async () => {
    const el = document.createElement('div');
    document.body.appendChild(el);

    const hint = await requestSourceHint(el, { timeoutMs: 5 });

    expect(hint).toBeNull();
    expect(el.hasAttribute(HINT_TARGET_ATTR)).toBe(false);
  });

  it('ignores a response carrying somebody else’s nonce', async () => {
    const el = document.createElement('div');
    document.body.appendChild(el);

    const onMessage = (event: MessageEvent): void => {
      if (!isHintRequest(event.data)) return;
      window.postMessage(
        {
          channel: HINT_CHANNEL,
          kind: 'response',
          nonce: 'not-the-one',
          hint: { signals: [], confidence: 'exact', provider: 'impostor' },
        },
        window.location.origin,
      );
    };
    window.addEventListener('message', onMessage);
    teardown.push(() => window.removeEventListener('message', onMessage));

    expect(await requestSourceHint(el, { timeoutMs: 20 })).toBeNull();
  });

  it('reports no hint when the tagged element has gone', async () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    teardown.push(installSourceHintResponder());

    const pending = requestSourceHint(el);
    el.remove();

    expect(await pending).toBeNull();
  });
});

describe('describeStub', () => {
  it('is a structurally valid, empty hint', () => {
    expect(describeStub(document.createElement('div'))).toEqual({
      signals: [],
      confidence: 'weak',
      provider: 'none',
    });
  });
});

describe('targetOrigin — the origins that cannot be named', () => {
  /**
   * A fake window, because the real one's `location` is not writable and the
   * bug is entirely about what `location` reports. Only the postMessage target
   * is under test.
   */
  function fakeWin(location: { origin: string; protocol: string }): Window {
    const listeners = new Set<(e: MessageEvent) => void>();
    return {
      location,
      posted: [] as string[],
      addEventListener: (_t: string, fn: (e: MessageEvent) => void) => listeners.add(fn),
      removeEventListener: (_t: string, fn: (e: MessageEvent) => void) => listeners.delete(fn),
      setTimeout: () => 1,
      clearTimeout: () => {},
      postMessage(_msg: unknown, target: string) {
        (this as unknown as { posted: string[] }).posted.push(target);
      },
    } as unknown as Window;
  }

  function targetUsedFor(location: { origin: string; protocol: string }): string {
    const win = fakeWin(location);
    const el = document.createElement('div');
    document.body.appendChild(el);
    void requestSourceHint(el, { win });
    return (win as unknown as { posted: string[] }).posted[0];
  }

  it('names an ordinary origin', () => {
    expect(targetUsedFor({ origin: 'https://app.test', protocol: 'https:' })).toBe(
      'https://app.test',
    );
  });

  it('falls back for an opaque origin', () => {
    expect(targetUsedFor({ origin: 'null', protocol: 'https:' })).toBe('*');
  });

  // Regression, 11 Aug: Chrome reports `file://` here, which looks like a usable
  // origin and is not — the window's real origin is opaque, so postMessage threw
  // and every source hint on a local HTML file was lost.
  it('falls back for a file URL, which reports a plausible-looking origin', () => {
    expect(targetUsedFor({ origin: 'file://', protocol: 'file:' })).toBe('*');
  });
});
