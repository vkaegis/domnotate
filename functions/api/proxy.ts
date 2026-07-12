// Cloudflare Pages Function — proxy external URLs to bypass CORS.
//
// The proxy applies a small, explicit fetch policy: only public http(s)
// targets, manually validated redirects, a bounded body, a request timeout,
// and HTML-only responses. Errors never reflect upstream exception messages
// or response bodies back to the caller.

import { normalizeTarget, resolveRedirect, isPublicHttpUrl } from '../lib/url-policy';
import { readLimitedBody, MAX_PROXY_BYTES } from '../lib/limited-response';

interface Env {
  PROXY_ENABLED?: string;
}

const MAX_REDIRECTS = 3;
const UPSTREAM_TIMEOUT_MS = 10_000;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const ALLOWED_CONTENT_TYPES = new Set(['text/html', 'application/xhtml+xml']);

function safeError(status: number, message: string): Response {
  return new Response(message, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

class UpstreamTimeout extends Error {}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    return await fetch(url, {
      headers: { 'User-Agent': 'Domnotate/1.0' },
      redirect: 'manual',
      signal: controller.signal,
    });
  } catch (err) {
    // A caller-visible timeout is distinguished from any other network
    // failure by the abort signal, without leaking the underlying message.
    if (controller.signal.aborted) throw new UpstreamTimeout();
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (env.PROXY_ENABLED === 'false') {
    return safeError(503, 'Proxy is temporarily unavailable');
  }

  const target = new URL(request.url).searchParams.get('url');
  if (!target) {
    return safeError(400, 'Missing ?url= parameter');
  }

  const validated = normalizeTarget(target);
  if (!validated) {
    return safeError(400, 'Invalid or disallowed URL');
  }

  let current = validated;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    let upstream: Response;
    try {
      upstream = await fetchWithTimeout(current.href);
    } catch (err) {
      if (err instanceof UpstreamTimeout) {
        return safeError(504, 'Upstream request timed out');
      }
      return safeError(502, 'Unable to fetch target');
    }

    if (REDIRECT_STATUSES.has(upstream.status)) {
      await upstream.body?.cancel();
      const location = upstream.headers.get('Location');
      if (!location) {
        return safeError(502, 'Unable to fetch target');
      }
      const next = resolveRedirect(location, current.href);
      if (!next) {
        return safeError(502, 'Unable to fetch target');
      }
      current = next;
      continue;
    }

    return await finalizeResponse(upstream);
  }

  return safeError(502, 'Unable to fetch target');
};

async function finalizeResponse(upstream: Response): Promise<Response> {
  const contentType = upstream.headers.get('Content-Type') ?? '';
  const mime = contentType.split(';')[0].trim().toLowerCase();
  if (!ALLOWED_CONTENT_TYPES.has(mime)) {
    await upstream.body?.cancel();
    return safeError(502, 'Unable to fetch target');
  }

  const declared = Number(upstream.headers.get('Content-Length'));
  if (Number.isFinite(declared) && declared > MAX_PROXY_BYTES) {
    await upstream.body?.cancel();
    return safeError(502, 'Unable to fetch target');
  }

  const body = await readLimitedBody(upstream);
  if (body === null) {
    return safeError(502, 'Unable to fetch target');
  }

  return new Response(body, {
    status: upstream.status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
