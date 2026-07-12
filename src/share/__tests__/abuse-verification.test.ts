import { describe, expect, test, vi } from 'vitest';

import { createTurnstileVerifier } from '../../../functions/lib/abuse-verification';

function makeSiteverifyResponse(overrides: Record<string, unknown> = {}): Response {
  return new Response(JSON.stringify({
    success: true,
    hostname: 'domnotate.example.com',
    action: 'create_share',
    challenge_ts: '2026-07-12T00:00:00.000Z',
    ...overrides,
  }));
}

function makeVerifier(response: Response) {
  return createTurnstileVerifier({
    secretKey: 'test-secret',
    expectedHostname: 'domnotate.example.com',
    expectedAction: 'create_share',
    fetch: vi.fn().mockResolvedValue(response),
    now: () => Date.parse('2026-07-12T00:01:00.000Z'),
  });
}

describe('Turnstile abuse verification', () => {
  test.each([
    ['unexpected hostname', { hostname: 'attacker.example.com' }, 'hostname_mismatch'],
    ['unexpected action', { action: 'different_action' }, 'action_mismatch'],
    ['expired challenge', { challenge_ts: '2026-07-11T23:50:00.000Z' }, 'expired_token'],
    ['replayed or rejected token', { success: false }, 'provider_rejected'],
  ])('rejects %s', async (_case, overrides, reason) => {
    const verifier = makeVerifier(makeSiteverifyResponse(overrides));

    await expect(verifier.verify('turnstile-token')).resolves.toEqual({ ok: false, reason });
  });
});
