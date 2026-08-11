// ============================================================
// Domnotate — Share Edit Grants (browser side)
// ============================================================

import { UPDATE_SHARE_ACTION, getTurnstileToken } from '@/share/turnstile-client';

interface IssuedGrant {
  grant: string;
  expiresAt: number;
}

/** Only the three methods used here, so tests can pass a plain stub. */
type GrantStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface EditGrantStoreOptions {
  /** Exchanges an abuse-verification token for a grant. */
  requestGrant?: (shareId: string, token: string) => Promise<IssuedGrant>;
  getToken?: (action: string) => Promise<string>;
  now?: () => number;
  storage?: GrantStorage | null;
}

export interface EditGrantStore {
  /** The usable cached grant for a share, or null when one must be obtained. */
  peek(shareId: string): string | null;
  /** The cached grant, obtaining one (which may challenge the user) if needed. */
  acquire(shareId: string): Promise<string>;
  /**
   * Drops a grant the server refused. Pass the grant that was actually sent to
   * drop it only if it is still the cached one, so a slow write's rejection
   * cannot discard a grant that has since been renewed.
   */
  invalidate(shareId: string, sent?: string): void;
}

const STORAGE_PREFIX = 'domnotate-share-grant:';

/**
 * Treat a grant as spent slightly early, so a write does not go out with a
 * grant that expires in flight.
 */
const EXPIRY_SKEW_MS = 30 * 1000;

/**
 * Grants live in `sessionStorage`, not memory alone: a shared page autosaves
 * immediately after it loads, so an in-memory-only cache would challenge again
 * on every reload. `sessionStorage` is per-tab and cleared when the tab closes,
 * and a grant conveys no more than the share link already in the address bar,
 * which is why this is not held in `localStorage` alongside the theme.
 */
function defaultStorage(): GrantStorage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

async function defaultRequestGrant(shareId: string, token: string): Promise<IssuedGrant> {
  const response = await fetch(`/api/share/${encodeURIComponent(shareId)}/grant`, {
    method: 'POST',
    headers: { 'X-Abuse-Verification-Token': token },
  });

  if (!response.ok) {
    throw new Error('Verification failed. Please try editing again.');
  }

  const data: unknown = await response.json();
  if (
    data === null ||
    typeof data !== 'object' ||
    typeof (data as { grant?: unknown }).grant !== 'string' ||
    typeof (data as { expiresAt?: unknown }).expiresAt !== 'number'
  ) {
    throw new Error('Could not verify this browser for editing');
  }

  return data as IssuedGrant;
}

export function createEditGrantStore(options: EditGrantStoreOptions = {}): EditGrantStore {
  const requestGrant = options.requestGrant ?? defaultRequestGrant;
  const getToken = options.getToken ?? getTurnstileToken;
  const now = options.now ?? Date.now;
  const storage = options.storage === undefined ? defaultStorage() : options.storage;

  const memory = new Map<string, IssuedGrant>();
  // Autosave writes are undebounced, so two of them can miss the cache at once.
  // Sharing the in-flight request keeps that to a single challenge.
  const inFlight = new Map<string, Promise<string>>();

  function read(shareId: string): IssuedGrant | null {
    const cached = memory.get(shareId);
    if (cached) return cached;

    const raw = storage?.getItem(`${STORAGE_PREFIX}${shareId}`);
    if (!raw) return null;

    try {
      const parsed: unknown = JSON.parse(raw);
      if (
        parsed === null ||
        typeof parsed !== 'object' ||
        typeof (parsed as { grant?: unknown }).grant !== 'string' ||
        typeof (parsed as { expiresAt?: unknown }).expiresAt !== 'number'
      ) {
        return null;
      }
      const grant = parsed as IssuedGrant;
      memory.set(shareId, grant);
      return grant;
    } catch {
      return null;
    }
  }

  function write(shareId: string, grant: IssuedGrant): void {
    memory.set(shareId, grant);
    try {
      storage?.setItem(`${STORAGE_PREFIX}${shareId}`, JSON.stringify(grant));
    } catch {
      // A full or unavailable store just means the next reload re-challenges.
    }
  }

  function invalidate(shareId: string, sent?: string): void {
    if (sent !== undefined && read(shareId)?.grant !== sent) return;

    memory.delete(shareId);
    try {
      storage?.removeItem(`${STORAGE_PREFIX}${shareId}`);
    } catch {
      // Nothing to do: the in-memory copy is gone either way.
    }
  }

  function peek(shareId: string): string | null {
    const cached = read(shareId);
    if (!cached) return null;
    if (cached.expiresAt - EXPIRY_SKEW_MS <= now()) {
      invalidate(shareId);
      return null;
    }
    return cached.grant;
  }

  return {
    peek,
    invalidate,

    async acquire(shareId: string): Promise<string> {
      const cached = peek(shareId);
      if (cached) return cached;

      const pending = inFlight.get(shareId);
      if (pending) return pending;

      const request = (async () => {
        const token = await getToken(UPDATE_SHARE_ACTION);
        const issued = await requestGrant(shareId, token);
        write(shareId, issued);
        return issued.grant;
      })().finally(() => {
        inFlight.delete(shareId);
      });

      inFlight.set(shareId, request);
      return request;
    },
  };
}

/** The store the share client uses. */
export const editGrants: EditGrantStore = createEditGrantStore();
