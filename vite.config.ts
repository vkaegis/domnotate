/// <reference types="vitest" />
import { defineConfig, type Plugin } from 'vite';
import { resolve } from 'path';

/** Dev-only proxy that mirrors the Cloudflare Pages Function at /api/proxy. */
function devProxy(): Plugin {
  return {
    name: 'domnotate-dev-proxy',
    configureServer(server) {
      server.middlewares.use('/api/proxy', async (req, res) => {
        const url = new URL(req.url!, 'http://localhost');
        const target = url.searchParams.get('url');
        if (!target) {
          res.statusCode = 400;
          res.end('Missing ?url= parameter');
          return;
        }
        try {
          const upstream = await fetch(target, {
            headers: { 'User-Agent': 'Domnotate/1.0' },
            redirect: 'follow',
          });
          res.setHeader('Content-Type', upstream.headers.get('Content-Type') || 'text/html');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.statusCode = upstream.status;
          res.end(await upstream.text());
        } catch (err: unknown) {
          res.statusCode = 502;
          res.end(err instanceof Error ? err.message : 'Fetch failed');
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [devProxy()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 8000,
    open: true,
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
  },
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.ts'],
  },
});
