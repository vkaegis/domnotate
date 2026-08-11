import { describe, expect, test } from 'vitest';

import { GRANT_TTL_MS, signGrant, verifyGrant } from '../../../functions/lib/edit-grant';

const SECRET = 'test-grant-secret';
const OTHER_SECRET = 'different-secret';
const NOW = Date.parse('2026-05-09T00:00:00.000Z');
const EXPIRES_AT = NOW + GRANT_TTL_MS;

describe('edit grants', () => {
  test('a freshly signed grant verifies for its own share', async () => {
    const grant = await signGrant('share-123', EXPIRES_AT, SECRET);

    await expect(verifyGrant(grant, 'share-123', SECRET, NOW)).resolves.toEqual({ ok: true });
  });

  test('signing is deterministic for the same inputs', async () => {
    const first = await signGrant('share-123', EXPIRES_AT, SECRET);
    const second = await signGrant('share-123', EXPIRES_AT, SECRET);

    expect(first).toBe(second);
  });

  test('a grant carries its expiry in the clear ahead of the signature', async () => {
    const grant = await signGrant('share-123', EXPIRES_AT, SECRET);

    expect(grant.startsWith(`${EXPIRES_AT}.`)).toBe(true);
    expect(grant.split('.')).toHaveLength(2);
  });

  test('a grant for one share does not authorize another', async () => {
    const grant = await signGrant('share-123', EXPIRES_AT, SECRET);

    await expect(verifyGrant(grant, 'share-456', SECRET, NOW)).resolves.toEqual({
      ok: false,
      reason: 'invalid_signature',
    });
  });

  test('a tampered signature is rejected', async () => {
    const grant = await signGrant('share-123', EXPIRES_AT, SECRET);
    const [stamp, signature] = grant.split('.');
    const flipped = signature[0] === 'A' ? `B${signature.slice(1)}` : `A${signature.slice(1)}`;

    await expect(verifyGrant(`${stamp}.${flipped}`, 'share-123', SECRET, NOW)).resolves.toEqual({
      ok: false,
      reason: 'invalid_signature',
    });
  });

  test('extending the expiry invalidates the signature', async () => {
    const grant = await signGrant('share-123', EXPIRES_AT, SECRET);
    const signature = grant.split('.')[1];

    await expect(
      verifyGrant(`${EXPIRES_AT + GRANT_TTL_MS}.${signature}`, 'share-123', SECRET, NOW),
    ).resolves.toEqual({ ok: false, reason: 'invalid_signature' });
  });

  test('a grant signed with another secret is rejected', async () => {
    const grant = await signGrant('share-123', EXPIRES_AT, OTHER_SECRET);

    await expect(verifyGrant(grant, 'share-123', SECRET, NOW)).resolves.toEqual({
      ok: false,
      reason: 'invalid_signature',
    });
  });

  test('an expired grant is rejected at its expiry instant', async () => {
    const grant = await signGrant('share-123', EXPIRES_AT, SECRET);

    await expect(verifyGrant(grant, 'share-123', SECRET, EXPIRES_AT)).resolves.toEqual({
      ok: false,
      reason: 'expired_grant',
    });
    await expect(verifyGrant(grant, 'share-123', SECRET, EXPIRES_AT - 1)).resolves.toEqual({
      ok: true,
    });
  });

  test('a missing grant is distinguished from a malformed one', async () => {
    await expect(verifyGrant('', 'share-123', SECRET, NOW)).resolves.toEqual({
      ok: false,
      reason: 'missing_grant',
    });

    for (const malformed of ['nonsense', 'abc.def', '123', `${EXPIRES_AT}.`, `${EXPIRES_AT}.a.b`]) {
      await expect(verifyGrant(malformed, 'share-123', SECRET, NOW)).resolves.toEqual({
        ok: false,
        reason: 'malformed_grant',
      });
    }
  });

  test('a signature of the wrong length is rejected', async () => {
    await expect(verifyGrant(`${EXPIRES_AT}.short`, 'share-123', SECRET, NOW)).resolves.toEqual({
      ok: false,
      reason: 'invalid_signature',
    });
  });

  test('an oversized grant is rejected without hashing it', async () => {
    await expect(verifyGrant(`${EXPIRES_AT}.${'a'.repeat(300)}`, 'share-123', SECRET, NOW))
      .resolves.toEqual({ ok: false, reason: 'malformed_grant' });
  });

  test('a server with no configured secret reports misconfiguration, not a bad grant', async () => {
    const grant = await signGrant('share-123', EXPIRES_AT, SECRET);

    await expect(verifyGrant(grant, 'share-123', undefined, NOW)).resolves.toEqual({
      ok: false,
      reason: 'misconfigured',
    });
  });

  test('the grant lifetime is 12 hours', () => {
    expect(GRANT_TTL_MS).toBe(12 * 60 * 60 * 1000);
  });
});
