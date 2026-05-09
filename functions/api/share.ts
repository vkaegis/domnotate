import { createSharedSessionBlob, serializeSharedSessionBlob } from '../../src/share/shared-session';

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

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response('Invalid JSON body', { status: 400 });
  }

  const id = crypto.randomUUID();
  const result = createSharedSessionBlob(body, { id });

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
