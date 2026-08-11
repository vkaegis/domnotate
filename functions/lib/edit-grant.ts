/**
 * Stateless edit grants for share updates and deletes.
 *
 * Updates fire from background autosave, undebounced, so an interactive
 * challenge per write is not viable. Instead a browser passes one abuse
 * challenge per share and receives a short-lived signed grant to present on
 * every subsequent write. The grant is self-expiring and bound to a single
 * share id, so no counter store is needed, which matters because Pages
 * Functions have neither the rate-limiting binding nor a KV/D1 namespace here.
 *
 * A grant is not an identity or a permission: anyone holding the share link can
 * obtain one. It meters automated writes, it does not restrict who may edit.
 */

export type GrantVerificationResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | 'missing_grant'
        | 'malformed_grant'
        | 'invalid_signature'
        | 'expired_grant'
        | 'misconfigured';
    };

/** How long an issued grant stays usable. */
export const GRANT_TTL_MS = 12 * 60 * 60 * 1000;

/** Generous ceiling: a real grant is an epoch stamp plus a 43-char digest. */
const MAX_GRANT_LENGTH = 256;

const encoder = new TextEncoder();

function base64url(signature: ArrayBuffer): string {
  let binary = '';
  for (const byte of new Uint8Array(signature)) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function computeSignature(
  shareId: string,
  expiresAt: number,
  secret: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(`${shareId}.${expiresAt}`));
  return base64url(signature);
}

/**
 * Constant time for equal-length inputs. Length itself is not secret: every
 * genuine signature is the same length, so a mismatch there carries nothing an
 * attacker could not read off their own grant.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i += 1) {
    difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return difference === 0;
}

/**
 * A grant for one share, valid until `expiresAt` (epoch milliseconds). The
 * expiry travels in the clear and is covered by the signature, so it cannot be
 * extended without the secret.
 */
export async function signGrant(
  shareId: string,
  expiresAt: number,
  secret: string,
): Promise<string> {
  const stamp = Math.trunc(expiresAt);
  return `${stamp}.${await computeSignature(shareId, stamp, secret)}`;
}

export async function verifyGrant(
  grant: string,
  shareId: string,
  secret: string | undefined,
  now: number,
): Promise<GrantVerificationResult> {
  if (!grant) return { ok: false, reason: 'missing_grant' };
  if (!secret) return { ok: false, reason: 'misconfigured' };
  if (grant.length > MAX_GRANT_LENGTH) return { ok: false, reason: 'malformed_grant' };

  const parts = grant.split('.');
  if (parts.length !== 2 || !/^[0-9]{1,15}$/.test(parts[0]) || parts[1].length === 0) {
    return { ok: false, reason: 'malformed_grant' };
  }

  const expiresAt = Number(parts[0]);
  const expected = await computeSignature(shareId, expiresAt, secret);
  // Signature before expiry: an unsigned guess should not learn whether the
  // timestamp it made up would have been in range.
  if (!timingSafeEqual(expected, parts[1])) return { ok: false, reason: 'invalid_signature' };
  if (now >= expiresAt) return { ok: false, reason: 'expired_grant' };

  return { ok: true };
}
