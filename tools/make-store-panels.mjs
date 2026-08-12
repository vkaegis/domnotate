#!/usr/bin/env node
// ============================================================
// Domnotate — store screenshot panels
// ============================================================
//
// Renders a real exported annotation block into two HTML panels that are then
// screenshotted for the Chrome Web Store listing (shots 2 and 4 of the five
// specified in docs/chrome-web-store-listing.md).
//
// The input is a genuine clipboard capture, never hand-written: the point of
// those two shots is that the export is real output, and a mocked-up block
// would make the listing a claim rather than a demonstration.
//
//   node tools/make-store-panels.mjs <export.txt> [outDir]
//
// Then open each file over the dev server and screenshot at 1280x800. The
// panels are deliberately generic dark monospace surfaces: no product logos and
// no impersonation of any particular agent UI.

import { readFileSync, writeFileSync } from 'node:fs';

const full = readFileSync(process.argv[2] ?? 'export.txt', 'utf8');

// The floor block, found by what it says rather than by its number: which
// annotation is the floor case depends on the order they were captured in.
const parts = full.split(/\n---\n/);
const header = parts[0].trim();
const block = (n) => parts.find((b) => b.trim().startsWith(n + '.')).trim();
const block2 = block(2);
const headerPlusFirst = header + '\n\n---\n\n' + block(1);

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Highlight only what the panel genuinely contains: the note lines and the
// honesty lines. No invented UI chrome, no product logos.
function render(body) {
  return esc(body)
    .replace(/^(\s*&gt; .*)$/gm, '<span class="note">$1</span>')
    .replace(/^(\s*no [^\n]*)$/gm, '<span class="honest">$1</span>')
    .replace(/\[weak\]/g, '<span class="tag">[weak]</span>')
    .replace(/^(#.*)$/gm, '<span class="h">$1</span>')
    .replace(/^(\*\*.*)$/gm, '<span class="meta">$1</span>');
}

const page = (title, caption, body, extraNote) => `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; }
  body {
    margin: 0; width: 1280px; height: 800px;
    background: #14161a;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    padding: 44px 56px; gap: 20px;
  }
  .cap { color: #e8eaed; font-size: 21px; font-weight: 620; letter-spacing: -0.3px; text-align: center; }
  .sub { color: #8b939e; font-size: 14px; text-align: center; max-width: 760px; line-height: 1.5; margin: -10px 0 4px; }
  .panel {
    width: 100%; flex: 1; min-height: 0;
    background: #1c1f24; border: 1px solid #2b2f36; border-radius: 12px;
    display: flex; flex-direction: column; overflow: hidden;
  }
  .bar {
    display: flex; align-items: center; gap: 8px;
    padding: 10px 14px; border-bottom: 1px solid #2b2f36; background: #191c21;
  }
  .dot { width: 10px; height: 10px; border-radius: 99px; }
  .bar-label { margin-left: 8px; color: #6f7883; font-size: 12px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  pre {
    margin: 0; padding: 26px 28px; overflow: hidden;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 14px; line-height: 1.75; color: #c3cad3; white-space: pre-wrap;
  }
  .h { color: #f0f3f6; font-weight: 700; }
  .meta { color: #7f8893; }
  .note { color: #7fd1a0; }
  .honest { color: #e0b055; }
  .tag { color: #8b939e; }
</style></head><body>
  <div class="cap">${title}</div>
  ${caption ? `<div class="sub">${caption}</div>` : ''}
  <div class="panel">
    <div class="bar">
      <span class="dot" style="background:#e0655f"></span>
      <span class="dot" style="background:#e0b055"></span>
      <span class="dot" style="background:#5fbf7f"></span>
      <span class="bar-label">${extraNote}</span>
    </div>
    <pre>${body}</pre>
  </div>
</body></html>`;

writeFileSync(
  (process.argv[3] ?? '.') + '/panel-export.html',
  page(
    'Paste it straight into your coding agent',
    'Every line is grep-able. No screenshots to interpret, and no file paths invented for you.',
    render(headerPlusFirst),
    'pasted into your agent',
  ),
);

writeFileSync(
  (process.argv[3] ?? '.') + '/panel-floor.html',
  page(
    'It tells you when it does not know',
    'An icon with no text, no label and no test id is the weakest thing you can click. Domnotate says so, and says what to do instead, rather than guessing at a file.',
    render(block2),
    'the honest case',
  ),
);

console.log('wrote both panels');
