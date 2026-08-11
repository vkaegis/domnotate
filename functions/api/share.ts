import {
  MAX_SHARE_BYTES,
  createSharedSessionBlob,
  serializeSharedSessionBlob,
} from '../../src/share/shared-session';
import {
  createTurnstileVerifier,
  type AbuseVerifier,
} from '../lib/abuse-verification';
import { errorResponse, jsonResponse } from '../lib/json-response';
import { hasJsonContentType, readLimitedJsonBody } from '../lib/request-body';

interface Env {
  SHARES: R2Bucket;
  SHARING_ENABLED?: string;
  TURNSTILE_SECRET_KEY?: string;
  TURNSTILE_EXPECTED_HOSTNAME?: string;
}

interface Data {
  abuseVerifier?: AbuseVerifier;
}

const VERIFICATION_HEADER = 'X-Abuse-Verification-Token';
const TURNSTILE_ACTION = 'create_share';

function logCreation(outcome: 'accepted' | 'rejected', reason?: string): void {
  console.info(JSON.stringify({
    event: 'share_creation',
    outcome,
    ...(reason && { reason }),
  }));
}

export const onRequestPost: PagesFunction<Env, Record<string, string | string[]>, Data> = async ({
  request,
  env,
  data,
}) => {
  if (env.SHARING_ENABLED === 'false') {
    logCreation('rejected', 'sharing_disabled');
    return errorResponse(503, 'sharing_disabled');
  }

  if (!hasJsonContentType(request)) {
    logCreation('rejected', 'unsupported_media_type');
    return errorResponse(415, 'unsupported_media_type');
  }

  const token = request.headers.get(VERIFICATION_HEADER) ?? '';
  if (!token) {
    logCreation('rejected', 'missing_token');
    return errorResponse(403, 'verification_failed');
  }

  const verifier = data?.abuseVerifier ?? createTurnstileVerifier({
    secretKey: env.TURNSTILE_SECRET_KEY,
    expectedHostname: env.TURNSTILE_EXPECTED_HOSTNAME,
    expectedAction: TURNSTILE_ACTION,
  });
  const verification = await verifier.verify(token);
  if (!verification.ok) {
    logCreation('rejected', verification.reason);
    return errorResponse(403, 'verification_failed');
  }

  const body = await readLimitedJsonBody(request, MAX_SHARE_BYTES);
  if (!body.ok) {
    logCreation('rejected', body.code);
    return errorResponse(body.status, body.code);
  }

  const id = crypto.randomUUID();
  const result = createSharedSessionBlob(body.value, { id });
  if (!result.ok) {
    const oversized = result.error.includes('5 MB');
    const code = oversized ? 'payload_too_large' : 'invalid_payload';
    logCreation('rejected', code);
    return errorResponse(oversized ? 413 : 400, code);
  }

  try {
    await env.SHARES.put(`share/${id}.json`, serializeSharedSessionBlob(result.value), {
      httpMetadata: { contentType: 'application/json' },
    });
  } catch {
    logCreation('rejected', 'storage_error');
    return errorResponse(500, 'internal_error');
  }

  logCreation('accepted');
  return jsonResponse({ id });
};
