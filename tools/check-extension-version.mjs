#!/usr/bin/env node
// ============================================================
// Domnotate — extension release version check
// ============================================================
//
// Asserts that the `ext-v*` tag being released matches the version inside
// `src/extension/manifest.json`.
//
// Why this is worth a script rather than a habit: the manifest version is what
// Chrome and the Web Store actually read, and the tag is what names the release
// artefact. When they drift, nothing fails loudly — the zip installs fine, the
// release page says one thing, the extension says another, and a store upload
// is rejected for reusing a version number that was already published. The
// failure arrives long after the mistake.
//
// The extension version is deliberately *not* checked against package.json.
// Per §3.1 of the plan the two release trains are decoupled: Pages deploys on
// merge to main, the extension ships on a tag, and neither blocks the other.
//
// Usage:
//   node tools/check-extension-version.mjs ext-v0.1.0
//   node tools/check-extension-version.mjs            # reads GITHUB_REF_NAME

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = resolve(repoRoot, 'src/extension/manifest.json');

const tag = process.argv[2] ?? process.env.GITHUB_REF_NAME;

if (!tag) {
  console.error(
    'No tag given. Pass one as an argument or set GITHUB_REF_NAME.\n' +
      '  node tools/check-extension-version.mjs ext-v0.1.0',
  );
  process.exit(2);
}

const TAG_PATTERN = /^ext-v(\d+\.\d+\.\d+)$/;
const match = TAG_PATTERN.exec(tag);

if (!match) {
  console.error(
    `Tag "${tag}" is not an extension release tag.\n` +
      'Expected the form ext-vMAJOR.MINOR.PATCH, e.g. ext-v0.1.0.',
  );
  process.exit(1);
}

const tagVersion = match[1];
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const manifestVersion = manifest.version;

if (manifestVersion !== tagVersion) {
  console.error(
    `Version mismatch.\n` +
      `  tag      ${tag}  ->  ${tagVersion}\n` +
      `  manifest src/extension/manifest.json  ->  ${manifestVersion}\n\n` +
      'Chrome reads the manifest, so that is the version users get. Bump the\n' +
      'manifest to match the tag (or retag), then release again.',
  );
  process.exit(1);
}

console.log(`Version check passed: ${tag} matches manifest ${manifestVersion}.`);
