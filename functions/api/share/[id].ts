import {
  MAX_SHARE_BYTES,
  getUtf8ByteLength,
  serializeSharedSessionBlob,
  validateSharedSessionBlob,
  validateUpdateShareRequest,
} from '../../../src/share/shared-session';
import { verifyGrant } from '../../lib/edit-grant';
import { errorResponse, jsonResponse } from '../../lib/json-response';
import { readLimitedJsonBody } from '../../lib/request-body';
import { getShareId, shareObjectKey } from '../../lib/share-id';
import { isExpired } from '../../lib/share-expiry';

interface Env {
  SHARES: R2Bucket;
  SHARING_ENABLED?: string;
  SHARE_GRANT_SECRET?: string;
}

const GRANT_HEADER = 'X-Share-Edit-Grant';

function noStoreResponse(body: BodyInit | null, init: ResponseInit = {}): Response {
  return new Response(body, {
    ...init,
    headers: {
      'Cache-Control': 'no-store',
      ...init.headers,
    },
  });
}

/**
 * Outcomes only. The share id is a bearer credential and the body is the user's
 * document, so neither belongs in logs.
 */
function logMutation(
  event: 'share_update' | 'share_delete',
  outcome: 'accepted' | 'rejected',
  reason?: string,
): void {
  console.info(JSON.stringify({
    event,
    outcome,
    ...(reason && { reason }),
  }));
}

type GrantCheck = { ok: true } | { ok: false; response: Response; reason: string };

/**
 * Writes carry a signed grant obtained once per share per browser. Anyone with
 * the link can get one, so this meters automated writes rather than restricting
 * who may edit. A deployment without `SHARE_GRANT_SECRET` refuses writes instead
 * of skipping the check, so a missing secret cannot silently disable it.
 */
async function checkEditGrant(request: Request, id: string, env: Env): Promise<GrantCheck> {
  const result = await verifyGrant(
    request.headers.get(GRANT_HEADER) ?? '',
    id,
    env.SHARE_GRANT_SECRET,
    Date.now(),
  );
  if (result.ok) return { ok: true };

  if (result.reason === 'misconfigured') {
    return {
      ok: false,
      reason: 'grant_secret_missing',
      response: errorResponse(503, 'sharing_misconfigured'),
    };
  }

  const code = result.reason === 'expired_grant' ? 'grant_expired' : 'grant_required';
  return { ok: false, reason: result.reason, response: errorResponse(401, code) };
}

function statusForValidationError(error: string): number {
  return error.includes('5 MB') ? 413 : 500;
}

/**
 * The etag to require when writing the merged blob back, so a write computed
 * from this read cannot overwrite a newer one. Returns null when the binding
 * reports no etag, in which case the write proceeds unconditionally rather than
 * failing shut.
 *
 * The unquoted `etag` is the form `onlyIf.etagMatches` wants. Verified against
 * workerd: passing the quoted `httpEtag` instead throws "Conditional ETag should
 * not be wrapped in quotes" rather than failing the precondition, which is why
 * the fallback strips them.
 */
function preconditionEtag(object: R2ObjectBody): string | null {
  if (typeof object.etag === 'string' && object.etag) return object.etag;
  if (typeof object.httpEtag === 'string' && object.httpEtag) {
    return object.httpEtag.replace(/^"|"$/g, '');
  }
  return null;
}

export const onRequestGet: PagesFunction<Env> = async ({ env, params }) => {
  const id = getShareId(params);
  if (!id) {
    return noStoreResponse('Share not found', { status: 404 });
  }

  const object = await env.SHARES.get(shareObjectKey(id));
  if (!object) {
    return noStoreResponse('Share not found', { status: 404 });
  }

  const storedText = await object.text();
  if (getUtf8ByteLength(storedText) > MAX_SHARE_BYTES) {
    return noStoreResponse('Stored share exceeds 5 MB', { status: 413 });
  }

  let storedData: unknown;
  try {
    storedData = JSON.parse(storedText);
  } catch {
    return noStoreResponse('Stored share is invalid', { status: 500 });
  }

  const validation = validateSharedSessionBlob(storedData);
  if (!validation.ok) {
    return noStoreResponse('Stored share is invalid', {
      status: statusForValidationError(validation.error),
    });
  }

  if (isExpired(validation.value.createdAt, new Date())) {
    return errorResponse(410, 'share_expired');
  }

  return noStoreResponse(serializeSharedSessionBlob(validation.value), {
    headers: {
      'Content-Type': 'application/json',
    },
  });
};

export const onRequestPut: PagesFunction<Env> = async ({ request, env, params }) => {
  if (env.SHARING_ENABLED === 'false') {
    logMutation('share_update', 'rejected', 'sharing_disabled');
    return errorResponse(503, 'sharing_disabled');
  }

  const id = getShareId(params);
  if (!id) {
    logMutation('share_update', 'rejected', 'unknown_share');
    return noStoreResponse('Share not found', { status: 404 });
  }

  // Before the body read, so an ungranted request never streams up to 5 MB.
  const grant = await checkEditGrant(request, id, env);
  if (!grant.ok) {
    logMutation('share_update', 'rejected', grant.reason);
    return grant.response;
  }

  const body = await readLimitedJsonBody(request, MAX_SHARE_BYTES);
  if (!body.ok) {
    logMutation('share_update', 'rejected', body.code);
    return errorResponse(body.status, body.code);
  }

  const updateValidation = validateUpdateShareRequest(body.value);
  if (!updateValidation.ok) {
    logMutation('share_update', 'rejected', 'invalid_payload');
    return errorResponse(400, 'invalid_payload');
  }

  const key = shareObjectKey(id);
  const object = await env.SHARES.get(key);
  if (!object) {
    logMutation('share_update', 'rejected', 'unknown_share');
    return noStoreResponse('Share not found', { status: 404 });
  }

  let existing: unknown;
  try {
    existing = JSON.parse(await object.text());
  } catch {
    logMutation('share_update', 'rejected', 'stored_share_invalid');
    return noStoreResponse('Stored share is invalid', { status: 500 });
  }

  const validation = validateSharedSessionBlob(existing);
  if (!validation.ok) {
    logMutation('share_update', 'rejected', 'stored_share_invalid');
    return noStoreResponse('Stored share is invalid', { status: 500 });
  }

  if (isExpired(validation.value.createdAt, new Date())) {
    logMutation('share_update', 'rejected', 'share_expired');
    return errorResponse(410, 'share_expired');
  }

  const nextBlob = {
    ...validation.value,
    annotations: updateValidation.value.annotations,
    edits: updateValidation.value.edits ?? validation.value.edits,
    updatedAt: new Date().toISOString(),
  };
  const serialized = serializeSharedSessionBlob(nextBlob);
  if (getUtf8ByteLength(serialized) > MAX_SHARE_BYTES) {
    logMutation('share_update', 'rejected', 'payload_too_large');
    return errorResponse(413, 'payload_too_large');
  }

  // The merge above was computed from `object`. Requiring its etag means a
  // concurrent write that landed in between rejects this one instead of being
  // silently overwritten by a blob assembled from a stale read.
  const etag = preconditionEtag(object);
  const written = await env.SHARES.put(key, serialized, {
    httpMetadata: { contentType: 'application/json' },
    ...(etag !== null && { onlyIf: { etagMatches: etag } }),
  });
  if (written === null) {
    logMutation('share_update', 'rejected', 'conflict');
    return errorResponse(409, 'conflict');
  }

  logMutation('share_update', 'accepted');
  return jsonResponse({ ok: true });
};

export const onRequestDelete: PagesFunction<Env> = async ({ request, env, params }) => {
  if (env.SHARING_ENABLED === 'false') {
    logMutation('share_delete', 'rejected', 'sharing_disabled');
    return errorResponse(503, 'sharing_disabled');
  }

  const id = getShareId(params);
  if (!id) {
    logMutation('share_delete', 'rejected', 'unknown_share');
    return noStoreResponse('Share not found', { status: 404 });
  }

  const grant = await checkEditGrant(request, id, env);
  if (!grant.ok) {
    logMutation('share_delete', 'rejected', grant.reason);
    return grant.response;
  }

  try {
    await env.SHARES.delete(shareObjectKey(id));
  } catch {
    logMutation('share_delete', 'rejected', 'storage_error');
    return errorResponse(500, 'internal_error');
  }

  logMutation('share_delete', 'accepted');

  // Deleting an absent key is a no-op in R2, so this is idempotent: a repeated
  // delete reports success rather than a misleading 404.
  return noStoreResponse(null, { status: 204 });
};
