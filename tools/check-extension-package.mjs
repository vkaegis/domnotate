#!/usr/bin/env node
// ============================================================
// Domnotate — built extension package check
// ============================================================
//
// Runs against `dist-extension/` after `npm run build:extension` and asserts
// the package is actually installable and complete. This is the automatable
// part of Phase 6's "clean-profile install works" gate row; whether the sidebar
// then *renders* still needs a browser.
//
// It exists because of the shape of failure here: a build that emits the wrong
// filenames succeeds. Vite is doing what it was told, the zip is well-formed,
// Chrome loads it — and then the toolbar click does nothing, because
// `background.js` asks for a file that is not there. Nothing on the path from
// commit to release notices.
//
// Three classes of that, and each gets a check below:
//
//   1. A manifest key pointing at a file the build did not emit (an icon path,
//      the service worker).
//   2. A content script renamed in vite.extension.config.ts. These two are
//      injected *programmatically* by background.js, so the manifest never
//      mentions them and check 1 cannot see them. So the names are read back
//      out of the built bundle and required to exist — the check tracks the
//      code rather than repeating a literal that could drift from it.
//   3. Permissions drifting from what the store listing claims. `activeTab` +
//      `scripting` with no host permissions is a promise made in the listing
//      copy and in plan §3.4/§3.7a, and it is the kind of thing that grows by
//      one line in a hurry.

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(repoRoot, 'dist-extension');

/** The permission set the listing copy and the plan both commit to. */
const EXPECTED_PERMISSIONS = ['activeTab', 'scripting'];

const problems = [];

function fail(message) {
  problems.push(message);
}

function requireFile(relPath, why) {
  if (!existsSync(resolve(outDir, relPath))) {
    fail(`missing ${relPath} — ${why}`);
    return false;
  }
  return true;
}

// ---- The package exists at all ----

if (!existsSync(outDir)) {
  console.error('dist-extension/ does not exist. Run `npm run build:extension` first.');
  process.exit(1);
}

if (!requireFile('manifest.json', 'the build should have copied it')) {
  console.error(problems.join('\n'));
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(resolve(outDir, 'manifest.json'), 'utf8'));

// ---- 1. Everything the manifest points at ----

const serviceWorker = manifest.background?.service_worker;
if (!serviceWorker) {
  fail('manifest has no background.service_worker');
} else {
  requireFile(serviceWorker, 'declared as background.service_worker');
}

const iconSets = [
  ['icons', manifest.icons],
  ['action.default_icon', manifest.action?.default_icon],
];

for (const [label, set] of iconSets) {
  if (!set || Object.keys(set).length === 0) {
    fail(`manifest has no ${label} — Chrome falls back to a generic puzzle piece and the store has nothing to show`);
    continue;
  }
  for (const [size, path] of Object.entries(set)) {
    requireFile(path, `declared as ${label}["${size}"]`);
  }
}

// ---- 2. The content scripts background.js injects by name ----

if (serviceWorker && existsSync(resolve(outDir, serviceWorker))) {
  const bundle = readFileSync(resolve(outDir, serviceWorker), 'utf8');
  // All three delimiters, with the closing one required to match the opening:
  // the minifier rewrites plain strings as template literals, so a
  // quote-only matcher finds nothing here. Found by the guard below on this
  // script's first run, which is the guard paying for itself.
  const injected = new Set(
    [...bundle.matchAll(/(["'`])([\w.-]+\.js)\1/g)].map((m) => m[2]),
  );

  // A check that finds nothing must not pass. If the matcher stops working —
  // a minifier change, a different quoting style — this is what says so
  // rather than silently reporting success.
  if (injected.size < 2) {
    fail(
      `expected to find at least 2 injected script names in ${serviceWorker}, found ${injected.size} ` +
        `(${[...injected].join(', ') || 'none'}). The matcher is probably stale, so this check ` +
        `was not testing anything.`,
    );
  }

  for (const name of injected) {
    requireFile(name, `${serviceWorker} injects it by name, so the manifest never mentions it`);
  }
}

// ---- 3. Permissions match what the listing claims ----

const permissions = manifest.permissions ?? [];
const unexpected = permissions.filter((p) => !EXPECTED_PERMISSIONS.includes(p));
const missing = EXPECTED_PERMISSIONS.filter((p) => !permissions.includes(p));

if (unexpected.length > 0) {
  fail(
    `unexpected permission(s): ${unexpected.join(', ')}. Every permission needs a user-facing ` +
      `justification in docs/chrome-web-store-listing.md, and the listing's no-transmission claim ` +
      `depends on this set. Update both, then add it to EXPECTED_PERMISSIONS here.`,
  );
}

if (missing.length > 0) {
  fail(`missing expected permission(s): ${missing.join(', ')}`);
}

for (const key of ['host_permissions', 'optional_host_permissions']) {
  if (manifest[key]?.length) {
    fail(
      `manifest declares ${key}: ${manifest[key].join(', ')}. Plan §3.4 ships on activeTab ` +
        `precisely to avoid this, and it changes the store review posture.`,
    );
  }
}

// ---- Verdict ----

if (problems.length > 0) {
  console.error(`Extension package check failed (${problems.length} problem(s)):\n`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

console.log(
  `Extension package check passed: manifest v${manifest.version}, ` +
    `permissions [${permissions.join(', ')}], no host permissions.`,
);
