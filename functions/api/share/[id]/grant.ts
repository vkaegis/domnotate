import {
  createTurnstileVerifier,
  type AbuseVerifier,
} from '../../../lib/abuse-verification';
import { GRANT_TTL_MS, signGrant } from '../../../lib/edit-grant';
import { errorResponse, jsonResponse } from '../../../lib/json-response';
import { getShareId } from '../../../lib/share-id';

interface Env {
  SHARING_ENABLED?: string;
  TURNSTILE_SECRET_KEY?: string;
  TURNSTILE_EXPECTED_HOSTNAME?: string;
  SHARE_GRANT_SECRET?: string;
}

interface Data {
  abuseVerifier?: AbuseVerifier;
}

const VERIFICATION_HEADER = 'X-Abuse-Verification-Token';

/**
 * Distinct from the creation action, so a token minted for publishing cannot be
 * replayed here and vice versa. The verifier enforces this.
 */
const TURNSTILE_ACTION = 'update_share';

function logGrant(outcome: 'issued' | 'rejected', reason?: string): void {
  console.info(JSON.stringify({
    event: 'share_edit_grant',
    outcome,
    ...(reason && { reason }),
  }));
}

/**
 * Trades one abuse challenge for a short-lived grant that authorizes writes to a
 * single share. Storage is never touched: a grant for an id that does not exist
 * is useless, since the update and delete handlers still resolve the object.
 */
export const onRequestPost: PagesFunction<Env, Record<string, string | string[]>, Data> = async ({
  request,
  env,
  params,
  data,
}) => {
  if (env.SHARING_ENABLED === 'false') {
    logGrant('rejected', 'sharing_disabled');
    return errorResponse(503, 'sharing_disabled');
  }

  const id = getShareId(params);
  if (!id) {
    logGrant('rejected', 'unknown_share');
    return errorResponse(404, 'not_found');
  }

  if (!env.SHARE_GRANT_SECRET) {
    logGrant('rejected', 'grant_secret_missing');
    return errorResponse(503, 'sharing_misconfigured');
  }

  const token = request.headers.get(VERIFICATION_HEADER) ?? '';
  if (!token) {
    logGrant('rejected', 'missing_token');
    return errorResponse(403, 'verification_failed');
  }

  const verifier = data?.abuseVerifier ?? createTurnstileVerifier({
    secretKey: env.TURNSTILE_SECRET_KEY,
    expectedHostname: env.TURNSTILE_EXPECTED_HOSTNAME,
    expectedAction: TURNSTILE_ACTION,
  });
  const verification = await verifier.verify(token);
  if (!verification.ok) {
    logGrant('rejected', verification.reason);
    return errorResponse(403, 'verification_failed');
  }

  const expiresAt = Date.now() + GRANT_TTL_MS;
  const grant = await signGrant(id, expiresAt, env.SHARE_GRANT_SECRET);

  logGrant('issued');
  return jsonResponse({ grant, expiresAt });
};
