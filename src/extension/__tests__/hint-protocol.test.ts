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
