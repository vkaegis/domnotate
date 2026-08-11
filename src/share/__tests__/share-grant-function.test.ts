import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { GRANT_TTL_MS, verifyGrant } from '../../../functions/lib/edit-grant';
import { onRequestPost } from '../../../functions/api/share/[id]/grant';

const GRANT_SECRET = 'test-grant-secret';
const VALID_TOKEN = 'turnstile-token';
const NOW = new Date('2026-05-09T00:00:10.000Z');

function grantRequest(withToken = true): Request {
  return new Request('https://example.com/api/share/share-123/grant', {
    method: 'POST',
    headers: withToken ? { 'X-Abuse-Verification-Token': VALID_TOKEN } : {},
  });
}

function successfulVerifier() {
  return { verify: vi.fn().mockResolvedValue({ ok: true }) };
}

describe('share edit grant endpoint', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  test('issues a grant the update handler will accept', async () => {
    const response = await onRequestPost({
      request: grantRequest(),
      env: { SHARE_GRANT_SECRET: GRANT_SECRET },
      params: { id: 'share-123' },
      data: { abuseVerifier: successfulVerifier() },
    } as never);

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const { grant, expiresAt } = await response.json() as { grant: string; expiresAt: number };
    expect(expiresAt).toBe(NOW.getTime() + GRANT_TTL_MS);
    await expect(verifyGrant(grant, 'share-123', GRANT_SECRET, NOW.getTime()))
      .resolves.toEqual({ ok: true });
  });

  test('the issued grant does not authorize a different share', async () => {
    const response = await onRequestPost({
      request: grantRequest(),
      env: { SHARE_GRANT_SECRET: GRANT_SECRET },
      params: { id: 'share-123' },
      data: { abuseVerifier: successfulVerifier() },
    } as never);

    const { grant } = await response.json() as { grant: string };
    await expect(verifyGrant(grant, 'share-456', GRANT_SECRET, NOW.getTime()))
      .resolves.toEqual({ ok: false, reason: 'invalid_signature' });
  });

  test('a missing verification token is refused before any verifier runs', async () => {
    const verifier = successfulVerifier();
    const response = await onRequestPost({
      request: grantRequest(false),
      env: { SHARE_GRANT_SECRET: GRANT_SECRET },
      params: { id: 'share-123' },
      data: { abuseVerifier: verifier },
    } as never);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ code: 'verification_failed' });
    expect(verifier.verify).not.toHaveBeenCalled();
  });

  test('a rejected token yields no grant', async () => {
    const response = await onRequestPost({
      request: grantRequest(),
      env: { SHARE_GRANT_SECRET: GRANT_SECRET },
      params: { id: 'share-123' },
      data: { abuseVerifier: { verify: vi.fn().mockResolvedValue({ ok: false, reason: 'provider_rejected' }) } },
    } as never);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ code: 'verification_failed' });
  });

  test('a create_share token cannot be replayed for an edit grant', async () => {
    const siteverify = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      hostname: 'domnotate.example.com',
      action: 'create_share',
      challenge_ts: NOW.toISOString(),
    })));
    vi.stubGlobal('fetch', siteverify);

    const response = await onRequestPost({
      request: new Request('https://domnotate.example.com/api/share/share-123/grant', {
        method: 'POST',
        headers: { 'X-Abuse-Verification-Token': VALID_TOKEN },
      }),
      env: {
        SHARE_GRANT_SECRET: GRANT_SECRET,
        TURNSTILE_SECRET_KEY: 'secret',
        TURNSTILE_EXPECTED_HOSTNAME: 'domnotate.example.com',
      },
      params: { id: 'share-123' },
      data: {},
    } as never);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ code: 'verification_failed' });
    expect(siteverify).toHaveBeenCalledOnce();
  });

  test('an update_share token is accepted', async () => {
    const siteverify = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      hostname: 'domnotate.example.com',
      action: 'update_share',
      challenge_ts: NOW.toISOString(),
    })));
    vi.stubGlobal('fetch', siteverify);

    const response = await onRequestPost({
      request: new Request('https://domnotate.example.com/api/share/share-123/grant', {
        method: 'POST',
        headers: { 'X-Abuse-Verification-Token': VALID_TOKEN },
      }),
      env: {
        SHARE_GRANT_SECRET: GRANT_SECRET,
        TURNSTILE_SECRET_KEY: 'secret',
        TURNSTILE_EXPECTED_HOSTNAME: 'domnotate.example.com',
      },
      params: { id: 'share-123' },
      data: {},
    } as never);

    expect(response.status).toBe(200);
  });

  test('grants are refused while sharing is disabled', async () => {
    const verifier = successfulVerifier();
    const response = await onRequestPost({
      request: grantRequest(),
      env: { SHARE_GRANT_SECRET: GRANT_SECRET, SHARING_ENABLED: 'false' },
      params: { id: 'share-123' },
      data: { abuseVerifier: verifier },
    } as never);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ code: 'sharing_disabled' });
    expect(verifier.verify).not.toHaveBeenCalled();
  });

  test('a deployment without a grant secret reports misconfiguration', async () => {
    const verifier = successfulVerifier();
    const response = await onRequestPost({
      request: grantRequest(),
      env: {},
      params: { id: 'share-123' },
      data: { abuseVerifier: verifier },
    } as never);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ code: 'sharing_misconfigured' });
    expect(verifier.verify).not.toHaveBeenCalled();
  });

  test('an id outside the allowed character set gets no grant', async () => {
    const response = await onRequestPost({
      request: grantRequest(),
      env: { SHARE_GRANT_SECRET: GRANT_SECRET },
      params: { id: '../../secrets' },
      data: { abuseVerifier: successfulVerifier() },
    } as never);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ code: 'not_found' });
  });

  test('grant logs record the outcome without the token or the share id', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    await onRequestPost({
      request: grantRequest(),
      env: { SHARE_GRANT_SECRET: GRANT_SECRET },
      params: { id: 'share-123' },
      data: { abuseVerifier: successfulVerifier() },
    } as never);

    const logs = JSON.stringify(info.mock.calls);
    expect(logs).toContain('share_edit_grant');
    expect(logs).toContain('issued');
    expect(logs).not.toContain(VALID_TOKEN);
    expect(logs).not.toContain('share-123');
    expect(logs).not.toContain(GRANT_SECRET);
  });
});
