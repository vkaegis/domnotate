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
