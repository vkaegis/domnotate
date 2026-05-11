import {
  MAX_SHARE_BYTES,
  createSharedSessionBlob,
  getUtf8ByteLength,
  serializeSharedSessionBlob,
} from '../../src/share/shared-session';

interface Env {
  SHARES: R2Bucket;
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

async function readJsonBody(request: Request): Promise<
  | { ok: true; value: unknown }
  | { ok: false; response: Response }
> {
  if (isOversizedRequest(request)) {
    return { ok: false, response: new Response('Share payload exceeds 5 MB', { status: 413 }) };
  }

  let text: string;
  try {
    text = await request.text();
  } catch {
    return { ok: false, response: new Response('Invalid request body', { status: 400 }) };
  }

  if (getUtf8ByteLength(text) > MAX_SHARE_BYTES) {
    return { ok: false, response: new Response('Share payload exceeds 5 MB', { status: 413 }) };
  }

  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, response: new Response('Invalid JSON body', { status: 400 }) };
  }
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const id = crypto.randomUUID();
  const result = createSharedSessionBlob(body.value, { id });

  if (!result.ok) {
    const status = result.error.includes('5 MB') ? 413 : 400;
    return new Response(result.error, { status });
  }

  const key = `share/${id}.json`;
  await env.SHARES.put(key, serializeSharedSessionBlob(result.value), {
    httpMetadata: { contentType: 'application/json' },
  });

  return jsonResponse({ id });
};
