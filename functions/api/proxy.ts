// Cloudflare Pages Function — proxy external URLs to bypass CORS

interface Env {}

export const onRequestGet: PagesFunction<Env> = async ({ request }) => {
  const { searchParams } = new URL(request.url);
  const target = searchParams.get('url');

  if (!target) {
    return new Response('Missing ?url= parameter', { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return new Response('Invalid URL', { status: 400 });
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return new Response('Only http/https URLs are allowed', { status: 400 });
  }

  try {
    const upstream = await fetch(target, {
      headers: { 'User-Agent': 'Domnotate/1.0' },
      redirect: 'follow',
    });

    const html = await upstream.text();

    return new Response(html, {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('Content-Type') || 'text/html',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Fetch failed';
    return new Response(message, { status: 502 });
  }
};
