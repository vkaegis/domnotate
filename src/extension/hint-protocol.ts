// ============================================================
// Domnotate — MAIN/ISOLATED world source-hint handoff (plan §3.5)
// ============================================================
//
// The two worlds share the DOM but not JS references, so an Element cannot be
// passed across. The handoff is therefore by nonce:
//
//   1. ISOLATED tags the picked element with `data-dn-target="<nonce>"`.
//   2. MAIN resolves `[data-dn-target="<nonce>"]`, introspects it, and posts a
//      *serializable* hint back carrying the same nonce.
//   3. ISOLATED matches the nonce, keeps the hint, and removes the attribute.
//
// This module owns the transport only. The payload is the real `SourceHint`
// (§3.2); it crosses the boundary as JSON, so it must stay structured-clone
// safe — no functions, no DOM nodes, no cycles.

import type { SourceHint } from '@/core/source-hint/types';

/** Attribute used to identify the picked element across the world boundary. */
export const HINT_TARGET_ATTR = 'data-dn-target';

/** Discriminator so we ignore every other `message` event on a busy page. */
export const HINT_CHANNEL = 'domnotate:source-hint';

/** Give up if the MAIN world never answers — a missing hint must never block a pick. */
export const HINT_TIMEOUT_MS = 250;

/**
 * What crosses the world boundary. Must stay JSON-serializable: no functions,
 * no DOM nodes, no cycles. `mergeSignals` enforces the prop allow-list and
 * drops non-primitives, so a provider cannot widen this by accident.
 */
export type SourceHintPayload = SourceHint;

export interface HintRequestMessage {
  channel: typeof HINT_CHANNEL;
  kind: 'request';
  nonce: string;
}

export interface HintResponseMessage {
  channel: typeof HINT_CHANNEL;
  kind: 'response';
  nonce: string;
  hint: SourceHintPayload | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isHintRequest(data: unknown): data is HintRequestMessage {
  return (
    isRecord(data) &&
    data.channel === HINT_CHANNEL &&
    data.kind === 'request' &&
    typeof data.nonce === 'string'
  );
}

export function isHintResponse(data: unknown): data is HintResponseMessage {
  return (
    isRecord(data) &&
    data.channel === HINT_CHANNEL &&
    data.kind === 'response' &&
    typeof data.nonce === 'string'
  );
}

let nonceSeq = 0;

export function createNonce(): string {
  nonceSeq += 1;
  const random =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `${random}-${nonceSeq}`;
}

/**
 * Same-window postMessage target. Pages served from an opaque origin report
 * `"null"`, which is not a legal targetOrigin, so fall back to `*` there. The
 * message never leaves this window either way — both worlds already share it.
 */
function targetOriginFor(win: Window): string {
  const origin = win.location?.origin;
  return !origin || origin === 'null' ? '*' : origin;
}

export interface RequestSourceHintOptions {
  win?: Window;
  timeoutMs?: number;
}

/**
 * Ask the MAIN world to describe `el`. Resolves `null` when nothing answers in
 * time — Phase 1 always resolves to the empty hint from `content-main.ts`.
 *
 * The target attribute is written and removed within this call, so the host
 * page never keeps a Domnotate attribute after a pick completes.
 */
export function requestSourceHint(
  el: Element,
  options: RequestSourceHintOptions = {},
): Promise<SourceHintPayload | null> {
  const win = options.win ?? window;
  const timeoutMs = options.timeoutMs ?? HINT_TIMEOUT_MS;
  const nonce = createNonce();

  return new Promise((resolve) => {
    let settled = false;

    const finish = (hint: SourceHintPayload | null): void => {
      if (settled) return;
      settled = true;
      win.clearTimeout(timer);
      win.removeEventListener('message', onMessage);
      el.removeAttribute(HINT_TARGET_ATTR);
      resolve(hint);
    };

    const onMessage = (event: MessageEvent): void => {
      const data: unknown = event.data;
      if (!isHintResponse(data) || data.nonce !== nonce) return;
      finish(data.hint);
    };

    win.addEventListener('message', onMessage);
    const timer = win.setTimeout(() => finish(null), timeoutMs);

    el.setAttribute(HINT_TARGET_ATTR, nonce);

    const request: HintRequestMessage = { channel: HINT_CHANNEL, kind: 'request', nonce };
    win.postMessage(request, targetOriginFor(win));
  });
}
