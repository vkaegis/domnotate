export type AbuseVerificationResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | 'missing_token'
        | 'invalid_token'
        | 'provider_rejected'
        | 'hostname_mismatch'
        | 'action_mismatch'
        | 'expired_token'
        | 'provider_unavailable'
        | 'misconfigured';
    };

export interface AbuseVerifier {
  verify(token: string): Promise<AbuseVerificationResult>;
}

interface TurnstileVerifierOptions {
  secretKey?: string;
  expectedHostname?: string;
  expectedAction: string;
  fetch?: typeof fetch;
  now?: () => number;
}

interface TurnstileResponse {
  success?: unknown;
  hostname?: unknown;
  action?: unknown;
  challenge_ts?: unknown;
}

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const MAX_TOKEN_LENGTH = 2048;
const MAX_TOKEN_AGE_MS = 5 * 60 * 1000;
const VERIFY_TIMEOUT_MS = 10_000;

export function createTurnstileVerifier(options: TurnstileVerifierOptions): AbuseVerifier {
  const fetchSiteverify = options.fetch ?? fetch;
  const now = options.now ?? Date.now;

  return {
    async verify(token: string): Promise<AbuseVerificationResult> {
      if (!token) return { ok: false, reason: 'missing_token' };
      if (token.length > MAX_TOKEN_LENGTH) return { ok: false, reason: 'invalid_token' };
      if (!options.secretKey || !options.expectedHostname) {
        return { ok: false, reason: 'misconfigured' };
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);
      let response: Response;
      try {
        response = await fetchSiteverify(SITEVERIFY_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            secret: options.secretKey,
            response: token,
            idempotency_key: crypto.randomUUID(),
          }),
          signal: controller.signal,
        });
      } catch {
        return { ok: false, reason: 'provider_unavailable' };
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) return { ok: false, reason: 'provider_unavailable' };

      let result: TurnstileResponse;
      try {
        result = await response.json() as TurnstileResponse;
      } catch {
        return { ok: false, reason: 'provider_unavailable' };
      }

      if (result.success !== true) return { ok: false, reason: 'provider_rejected' };
      if (result.hostname !== options.expectedHostname) {
        return { ok: false, reason: 'hostname_mismatch' };
      }
      if (result.action !== options.expectedAction) {
        return { ok: false, reason: 'action_mismatch' };
      }
      if (typeof result.challenge_ts !== 'string') {
        return { ok: false, reason: 'expired_token' };
      }

      const challengeTime = Date.parse(result.challenge_ts);
      const age = now() - challengeTime;
      if (!Number.isFinite(challengeTime) || age < -60_000 || age > MAX_TOKEN_AGE_MS) {
        return { ok: false, reason: 'expired_token' };
      }

      return { ok: true };
    },
  };
}
