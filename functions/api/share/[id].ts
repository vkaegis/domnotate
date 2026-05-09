import {
  MAX_SHARE_BYTES,
  getUtf8ByteLength,
  serializeSharedSessionBlob,
  validateSharedSessionBlob,
  validateUpdateShareRequest,
} from '../../../src/share/shared-session';

interface Env {
  SHARES: R2Bucket;
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

function isOversizedRequest(request: Request): boolean {
  const contentLength = request.headers.get('content-length');
  if (!contentLength) return false;
  const byteLength = Number(contentLength);
  return Number.isFinite(byteLength) && byteLength > MAX_SHARE_BYTES;
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
  const id = getShareId(params);
  if (!id) {
    return noStoreResponse('Share not found', { status: 404 });
  }

  if (isOversizedRequest(request)) {
    return new Response('Share payload exceeds 5 MB', { status: 413 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response('Invalid JSON body', { status: 400 });
  }

  const updateValidation = validateUpdateShareRequest(body);
  if (!updateValidation.ok) {
    return new Response(updateValidation.error, { status: 400 });
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
    updatedAt: new Date().toISOString(),
  };
  const serialized = serializeSharedSessionBlob(nextBlob);
  if (getUtf8ByteLength(serialized) > MAX_SHARE_BYTES) {
    return new Response('Share payload exceeds 5 MB', { status: 413 });
  }

  await env.SHARES.put(key, serialized, {
    httpMetadata: { contentType: 'application/json' },
  });

  return jsonResponse({ ok: true });
};
