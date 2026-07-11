/// <reference types="vitest" />
import { defineConfig, type Plugin } from 'vite';
import { resolve } from 'path';
import { Buffer } from 'node:buffer';

import { onRequestGet } from './functions/api/proxy';

/**
 * Dev-only proxy that mirrors the Cloudflare Pages Function at /api/proxy by
 * delegating to the same handler, so local development enforces the identical
 * URL policy, redirect, size, and content-type rules as production.
 */
function devProxy(): Plugin {
  return {
    name: 'domnotate-dev-proxy',
    configureServer(server) {
      server.middlewares.use('/api/proxy', async (req, res) => {
        const search = req.url && req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
        const request = new Request(`http://localhost/api/proxy${search}`);

        const response = await onRequestGet({
          request,
          env: { PROXY_ENABLED: process.env.PROXY_ENABLED },
        } as never);

        res.statusCode = response.status;
        response.headers.forEach((value, key) => res.setHeader(key, value));
        res.end(Buffer.from(await response.arrayBuffer()));
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
