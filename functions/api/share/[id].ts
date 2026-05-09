import {
  MAX_SHARE_BYTES,
  getUtf8ByteLength,
  serializeSharedSessionBlob,
  validateSharedSessionBlob,
  validatePublishShareRequest,
} from '../../../src/share/shared-session';
import type { Annotation } from '../../../src/types/core';

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

function getValidAnnotations(data: unknown): Annotation[] | string {
  if (data === null || typeof data !== 'object') return 'Request body must be an object';
  const body = data as Record<string, unknown>;
  const validation = validatePublishShareRequest({
    sourceType: 'file',
    sourceName: 'annotations-update',
    html: '<html></html>',
    annotations: body.annotations,
  });
  if (!validation.ok) return validation.error;
  return validation.value.annotations;
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

  return noStoreResponse(await object.text(), {
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response('Invalid JSON body', { status: 400 });
  }

  const annotations = getValidAnnotations(body);
  if (typeof annotations === 'string') {
    return new Response(annotations, { status: 400 });
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
    annotations,
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
