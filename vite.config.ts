/// <reference types="vitest" />
import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  plugins: [],
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
