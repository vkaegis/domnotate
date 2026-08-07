import { defineConfig, type Plugin } from 'vite';
import { resolve } from 'path';
import { copyFileSync, mkdirSync } from 'node:fs';

/**
 * Chrome extension build → dist-extension/
 *
 * Content scripts cannot be ES modules, so every entry has to be a
 * self-contained IIFE. Rollup refuses IIFE for a multi-input (code-splitting)
 * build, so each entry gets its own single-input pass, selected by `--mode`:
 *
 *   vite build -c vite.extension.config.ts --mode isolated
 *   vite build -c vite.extension.config.ts --mode main
 *   vite build -c vite.extension.config.ts --mode background
 *
 * `npm run build:extension` chains all three. The first pass clears the output
 * directory; the others must not.
 */

const OUT_DIR = 'dist-extension';

const ENTRIES = {
  isolated: 'src/extension/content-isolated.ts',
  main: 'src/extension/content-main.ts',
  background: 'src/extension/background.ts',
} as const;

const OUTPUT_NAMES = {
  isolated: 'content-isolated',
  main: 'content-main',
  background: 'background',
} as const;

type ExtensionMode = keyof typeof ENTRIES;

function isExtensionMode(mode: string): mode is ExtensionMode {
  return mode in ENTRIES;
}

/** Copies the MV3 manifest next to the bundles. */
function copyManifest(): Plugin {
  return {
    name: 'domnotate-copy-manifest',
    closeBundle() {
      const outDir = resolve(__dirname, OUT_DIR);
      mkdirSync(outDir, { recursive: true });
      copyFileSync(
        resolve(__dirname, 'src/extension/manifest.json'),
        resolve(outDir, 'manifest.json'),
      );
    },
  };
}

export default defineConfig(({ mode }) => {
  if (!isExtensionMode(mode)) {
    throw new Error(
      `Unknown extension build mode "${mode}". Expected one of: ${Object.keys(ENTRIES).join(', ')}.`,
    );
  }

  return {
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
      },
    },
    // `public/` holds the web app's Pages assets (_redirects, favicon). None of
    // them belong in an extension zip.
    publicDir: false,
    build: {
      target: 'es2022',
      outDir: OUT_DIR,
      // Only the first pass in the chain may clear the directory.
      emptyOutDir: mode === 'isolated',
      cssCodeSplit: false,
      // The UI's CSS is imported with `?inline` and injected into the shadow
      // root by hand, so nothing should ever be emitted as a stylesheet the
      // host page could load.
      rollupOptions: {
        input: resolve(__dirname, ENTRIES[mode]),
        output: {
          format: 'iife',
          entryFileNames: `${OUTPUT_NAMES[mode]}.js`,
          assetFileNames: 'assets/[name][extname]',
        },
      },
    },
    plugins: [copyManifest()],
  };
});
