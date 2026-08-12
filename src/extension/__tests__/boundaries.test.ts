import { describe, it, expect } from 'vitest';

/**
 * The extension and the web app share a core (see CLAUDE.md § Architecture).
 * The boundary holds today but nothing enforced it, and breaking it is quiet:
 * one stray import pulls IndexedDB or Turnstile into the content script, and the
 * only symptom is a fatter zip. This file is the enforcement.
 *
 * Deliberately a deny-list, not an allow-list. An allow-list would fail every
 * time someone promoted a legitimate module into the shared tier, which trains
 * people to edit the test instead of reading it.
 */

/** Modules that belong to the web app. `src/extension/**` may not reach them. */
const WEB_ONLY = [
  // Whole folders.
  'share',
  'editor',
  'loader',
  'changelog',
  'slides',
  'diagnostics',
  'popover',
  'toast',
  'tooltip',
  'theme',
  // Single modules inside folders the two tiers share.
  'output/store',
  'output/json-io',
  'output/annotation-preview',
  'sidebar/sidebar',
  'sidebar/notes-panel',
  'annotations/pin-renderer',
  'annotations/view-scope',
];

/**
 * The one web-side file allowed to import the extension. It imports every
 * public module on purpose; CLAUDE.md tells it to.
 */
const REVERSE_EXEMPT = '__tests__/smoke.test.ts';

// Every TypeScript file under src/, as text. The tree is read at build time, so
// new files are covered without being enumerated here. `?raw` means nothing is
// executed.
const SOURCES: Record<string, string> = import.meta.glob('../../**/*.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
});

/** This file's own folder, relative to `src/`. Glob keys resolve against it. */
const HERE = ['extension', '__tests__'];

/** Glob keys are relative to this file, and Vite shortens them. Canonicalise. */
function srcRelative(key: string): string {
  const parts = [...HERE];
  for (const segment of key.split('/')) {
    if (segment === '.' || segment === '') continue;
    if (segment === '..') parts.pop();
    else parts.push(segment);
  }
  return parts.join('/');
}

const files = Object.entries(SOURCES).map(([key, text]) => ({
  path: srcRelative(key),
  text,
}));

const extensionFiles = files.filter(
  (f) => f.path.startsWith('extension/') && !f.path.includes('__tests__/'),
);
const webFiles = files.filter((f) => !f.path.startsWith('extension/') && f.path !== REVERSE_EXEMPT);

/** Every `@/…` specifier in a file, with the `@/` prefix removed. */
function aliasImports(text: string): string[] {
  return [...text.matchAll(/['"]@\/([^'"]+)['"]/g)].map((m) => m[1]);
}

function deniedBy(specifier: string): string | undefined {
  // Stylesheets are the exception. The extension inlines sidebar.css, which
  // sits in a folder whose TypeScript is otherwise web-only.
  if (/\.css($|\?)/.test(specifier)) return undefined;
  return WEB_ONLY.find((m) => specifier === m || specifier.startsWith(`${m}/`));
}

describe('the deny-list matcher', () => {
  // The boundary tests below pass because the code is clean. These assertions
  // prove they would not pass if it were not.
  it('catches a module inside a web-only folder', () => {
    expect(deniedBy('share/share-client')).toBe('share');
    expect(deniedBy('loader/drop-zone')).toBe('loader');
    expect(deniedBy('output/store')).toBe('output/store');
  });

  it('lets the shared tier through', () => {
    expect(deniedBy('core/content-host')).toBeUndefined();
    expect(deniedBy('sidebar/copy-animation')).toBeUndefined();
    expect(deniedBy('output/formatter')).toBeUndefined();
  });

  it('lets inlined stylesheets through', () => {
    expect(deniedBy('sidebar/sidebar.css?inline')).toBeUndefined();
    expect(deniedBy('styles/theme.css?inline')).toBeUndefined();
    // …but not the TypeScript beside them.
    expect(deniedBy('sidebar/sidebar')).toBe('sidebar/sidebar');
  });
});

describe('extension tier boundary', () => {
  it('finds the extension sources to check', () => {
    // A move or a rename of the folder must not silently pass.
    expect(extensionFiles.length).toBeGreaterThan(4);
  });

  it.each(extensionFiles)('$path imports no web-only module', ({ text }) => {
    const offenders = aliasImports(text)
      .map((specifier) => ({ specifier, denied: deniedBy(specifier) }))
      .filter((entry) => entry.denied)
      .map((entry) => `@/${entry.specifier} (web-only: ${entry.denied})`);

    // If you need one of these, move the part you need into the shared tier
    // first. Do not add an exception here.
    expect(offenders).toEqual([]);
  });
});

describe('reverse boundary', () => {
  it('finds the web sources to check', () => {
    expect(webFiles.length).toBeGreaterThan(20);
  });

  it.each(webFiles)('$path does not import the extension', ({ text }) => {
    const offenders = aliasImports(text)
      .filter((s) => s.startsWith('extension/'))
      .map((s) => `@/${s}`);

    expect(offenders).toEqual([]);
  });
});
