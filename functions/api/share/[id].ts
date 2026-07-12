import {
  MAX_SHARE_BYTES,
  getUtf8ByteLength,
  serializeSharedSessionBlob,
  validateSharedSessionBlob,
  validateUpdateShareRequest,
} from '../../../src/share/shared-session';
import { readLimitedJsonBody } from '../../lib/request-body';

interface Env {
  SHARES: R2Bucket;
  SHARING_ENABLED?: string;
}

function noStoreResponse(body: BodyInit | null, init: ResponseInit = {}): Response {
  return new Response(body, {
    ...init,
    headers: {
      'Cache-Control': 'no-store',
      ...init.headers,
    },
  });
}

function getShareId(params: Record<string, string | string[]>): string | null {
  const value = params.id;
  if (Array.isArray(value)) return null;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(value)) return null;
  return value;
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
}

function errorResponse(status: number, code: string): Response {
  return jsonResponse({ code }, { status });
}

function statusForValidationError(error: string): number {
  return error.includes('5 MB') ? 413 : 500;
}

export const onRequestGet: PagesFunction<Env> = async ({ env, params }) => {
  const id = getShareId(params);
  if (!id) {
    return noStoreResponse('Share not found', { status: 404 });
  }

  const object = await env.SHARES.get(`share/${id}.json`);
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

  return noStoreResponse(serializeSharedSessionBlob(validation.value), {
    headers: {
      'Content-Type': 'application/json',
    },
  });
};

export const onRequestPut: PagesFunction<Env> = async ({ request, env, params }) => {
  if (env.SHARING_ENABLED === 'false') {
    return errorResponse(503, 'sharing_disabled');
  }

  const id = getShareId(params);
  if (!id) {
    return noStoreResponse('Share not found', { status: 404 });
  }

  const body = await readLimitedJsonBody(request, MAX_SHARE_BYTES);
  if (!body.ok) return errorResponse(body.status, body.code);

  const updateValidation = validateUpdateShareRequest(body.value);
  if (!updateValidation.ok) {
    return errorResponse(400, 'invalid_payload');
  }

  const key = `share/${id}.json`;
  const object = await env.SHARES.get(key);
  if (!object) {
    return noStoreResponse('Share not found', { status: 404 });
  }

  let existing: unknown;
  try {
    existing = JSON.parse(await object.text());
  } catch {
    return new Response('Stored share is invalid', { status: 500 });
  }

  const validation = validateSharedSessionBlob(existing);
  if (!validation.ok) {
    return new Response('Stored share is invalid', { status: 500 });
  }

  const nextBlob = {
    ...validation.value,
    annotations: updateValidation.value.annotations,
    edits: updateValidation.value.edits ?? validation.value.edits,
    updatedAt: new Date().toISOString(),
  };
  const serialized = serializeSharedSessionBlob(nextBlob);
  if (getUtf8ByteLength(serialized) > MAX_SHARE_BYTES) {
    return errorResponse(413, 'payload_too_large');
  }

  await env.SHARES.put(key, serialized, {
    httpMetadata: { contentType: 'application/json' },
  });

  return jsonResponse({ ok: true });
};
