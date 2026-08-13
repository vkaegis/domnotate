#!/usr/bin/env node
// ============================================================
// Domnotate — the mark
// ============================================================
//
//   npm run mark
//
// Draws a dressmaker's pin lying in the grain of woven cloth, and emits it
// everywhere it ships. The geometry below is normalised to the panel, so every
// asset is one drawing at a different scale.
//
// Committed, because each is shipped as-is:
//   public/favicon.svg, src/core/mark.ts, tools/store-promo-tile.html
// Gitignored, because only rsvg-convert reads them:
//   .mark/icon-{16,32,48,128}.svg, .mark/store-icon.svg
//
// `npm run icons:extension` runs this, then rasterises the PNGs.
//
// FOUR SIZES, NOT ONE SCALED DRAWING
//
// What the drawing can carry changes with the size, so these do not collapse
// into one:
//
//   16   Its own 16-unit drawing: grain dropped, pin thickened, edges on whole
//        pixels. Scaling the 128 drawing down puts the panel inside a 1.5px
//        halo and the head reads as a notch bitten out of the corner.
//   32   Full geometry, grain omitted. 32px resolves the pin but not nine
//        rules, and the 16 drawing's head is 30% of its panel against 20% here.
//   48   Full geometry on a 48-unit grid, so the grain sits on whole pixel
//        rows. Scaled, the sub-pixel rules land on fractional rows and
//        rasterise to three different weights down one panel.
//   128  The full drawing.
//
// Two constraints hold across all of them. Nothing overhangs the panel, so the
// mark carries its own contrast on any browser chrome and on both Web Store
// cards. And the panel bleeds to its box everywhere except the store icon,
// which has a padding rule of its own.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const T   = '#C4725A';  // terracotta accent  (--dn-accent)
const CH  = '#FAF7F2';  // chalk              (--dn-bg-primary)
const INK = '#2C2016';  // ink                (--dn-text-primary)

const f = (n) => +n.toFixed(2);

// --- The geometry, normalised to the panel ---------------------------------
//
// Every value is a fraction of the panel's side, so a caller supplies only
// where the panel goes and how big it is.
const G = {
  tip:    [0.2981, 0.7981],   // the pin's point
  knee:   [0.4135, 0.6250],   // where the flare ends and the shaft runs parallel
  base:   [0.5673, 0.3942],   // where the shaft meets the head
  head:   [0.6154, 0.3269],
  headR:  0.1010,
  wKnee:  0.0519,
  wBase:  0.0615,
  radius: 0.25,
  grain:  { count: 9, inset: 0.145, width: 0.0183, alpha: 0.14, clearance: 0.022 },
};

// --- The pin's horizontal footprint, for breaking the grain ----------------

/** Where the shaft's centreline sits, and how wide it is, at height `y`. */
function shaftAt(y) {
  const [tx, ty] = G.tip, [kx, ky] = G.knee, [bx, by] = G.base;
  if (y > ty || y < by) return null;

  // The centreline is one straight run from tip to base; the knee lies on it.
  const t = (ty - y) / (ty - by);
  const cx = tx + (bx - tx) * t;

  // Half-width: zero at the tip, wKnee at the knee, wBase at the base.
  const half = y > ky
    ? (G.wKnee / 2) * ((ty - y) / (ty - ky))
    : (G.wKnee / 2) + ((G.wBase - G.wKnee) / 2) * ((ky - y) / (ky - by));

  // A stroke of half-width h crossing a horizontal line covers h / sin(angle)
  // to each side of its centre, not h.
  const len = Math.hypot(bx - tx, by - ty);
  const sin = Math.abs(by - ty) / len;
  return [cx - half / sin, cx + half / sin];
}

/** The intervals of x that the pin covers at height `y`, merged. */
function pinCoverAt(y) {
  const spans = [];
  const shaft = shaftAt(y);
  if (shaft) spans.push(shaft);

  const [hx, hy] = G.head;
  const dy = Math.abs(y - hy);
  if (dy < G.headR) {
    const dx = Math.sqrt(G.headR * G.headR - dy * dy);
    spans.push([hx - dx, hx + dx]);
  }

  spans.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const span of spans) {
    const last = merged[merged.length - 1];
    if (last && span[0] <= last[1]) last[1] = Math.max(last[1], span[1]);
    else merged.push([...span]);
  }
  return merged;
}

/** `[x0, x1]` minus the pin's footprint at `y`, plus clearance. */
function grainRunsAt(y, x0, x1, clearance) {
  let runs = [[x0, x1]];
  for (const [lo, hi] of pinCoverAt(y)) {
    const next = [];
    for (const [a, b] of runs) {
      if (hi + clearance <= a || lo - clearance >= b) { next.push([a, b]); continue; }
      if (a < lo - clearance) next.push([a, lo - clearance]);
      if (b > hi + clearance) next.push([hi + clearance, b]);
    }
    runs = next;
  }
  return runs;
}

// --- Emitters -------------------------------------------------------------

/** A straight tapered segment: a filled quad plus round end caps. */
function segment(shapes, [x0, y0], [x1, y1], w0, w1, capStart) {
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy);
  const nx = -dy / len, ny = dx / len;
  const h0 = w0 / 2, h1 = w1 / 2;
  const p = (x, y) => `${f(x)} ${f(y)}`;
  shapes.push({ tag: 'path', attrs: {
    d: `M ${p(x0 + nx * h0, y0 + ny * h0)} L ${p(x1 + nx * h1, y1 + ny * h1)}`
     + ` L ${p(x1 - nx * h1, y1 - ny * h1)} L ${p(x0 - nx * h0, y0 - ny * h0)} Z`,
    fill: CH,
  } });
  if (capStart && h0 > 0.4) {
    shapes.push({ tag: 'circle', attrs: { cx: f(x0), cy: f(y0), r: f(h0), fill: CH } });
  }
  shapes.push({ tag: 'circle', attrs: { cx: f(x1), cy: f(y1), r: f(h1), fill: CH } });
}

/** The full mark as a flat list of shapes, for a panel of `size` at (`x`, `y`). */
export function markShapes({ x, y, size, grain = 'scaled' }) {
  const px = (n) => x + n * size;
  const py = (n) => y + n * size;
  const pt = ([a, b]) => [px(a), py(b)];
  const shapes = [];

  // The cloth.
  shapes.push({ tag: 'rect', attrs: {
    x: f(x), y: f(y), width: f(size), height: f(size), rx: f(G.radius * size), fill: T,
  } });

  // The grain, broken where the pin lies in it. `snapped` puts every rule on
  // exactly one device pixel, at the cost of a bottom margin 1px tighter than
  // the top, since even spacing and symmetric margins cannot both land on
  // half-integers.
  const g = G.grain;
  if (grain !== 'none') {
    const snapped = grain === 'snapped';
    const spacing = snapped ? Math.max(2, Math.round(size / (g.count + 1))) : 0;
    const first = snapped ? Math.round((size - spacing * (g.count - 1)) / 2) + 0.5 : 0;

    for (let i = 1; i <= g.count; i++) {
      const yy = i / (g.count + 1);
      const rowY = snapped ? y + first + spacing * (i - 1) : py(yy);
      const width = snapped ? 1 : f(g.width * size);

      for (const [a, b] of grainRunsAt(yy, g.inset, 1 - g.inset, g.clearance)) {
        if (b - a < 0.02) continue;   // a stub shorter than it is thick reads as dirt
        // Round caps on a 1px rule smear past the row unless x is integral too.
        const x1 = snapped ? Math.round(px(a)) + 0.5 : f(px(a));
        const x2 = snapped ? Math.round(px(b)) - 0.5 : f(px(b));
        if (x2 <= x1) continue;
        shapes.push({ tag: 'line', attrs: {
          x1: f(x1), y1: f(rowY), x2: f(x2), y2: f(rowY),
          stroke: CH, 'stroke-opacity': g.alpha, 'stroke-width': width,
          'stroke-linecap': snapped ? 'butt' : 'round',
        } });
      }
    }
  }

  // The pin.
  segment(shapes, pt(G.tip), pt(G.knee), 0, G.wKnee * size, true);
  segment(shapes, pt(G.knee), pt(G.base), G.wKnee * size, G.wBase * size, false);
  shapes.push({ tag: 'circle', attrs: {
    cx: f(px(G.head[0])), cy: f(py(G.head[1])), r: f(G.headR * size), fill: INK,
  } });

  return shapes;
}

/** The 16px variant: same geometry, rounded to whole pixels and thickened. */
export function smallShapes() {
  const shapes = [];
  shapes.push({ tag: 'rect', attrs: { x: 0, y: 0, width: 16, height: 16, rx: 3.5, fill: T } });
  segment(shapes, [4.5, 12.5], [6.5, 10], 0, 1.5, true);
  segment(shapes, [6.5, 10], [9, 6.5], 1.5, 1.9, false);
  shapes.push({ tag: 'circle', attrs: { cx: 9.5, cy: 5.5, r: 2.4, fill: INK } });
  return shapes;
}

const attrs = (a) => Object.entries(a).map(([k, v]) => `${k}="${v}"`).join(' ');
const body = (shapes, indent = '  ') =>
  shapes.map((s) => `${indent}<${s.tag} ${attrs(s.attrs)}/>`).join('\n');

const svg = (shapes, box, header) =>
  `${header}\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${box} ${box}"`
  + ` width="${box}" height="${box}">\n${body(shapes)}\n</svg>\n`;

// --- The assets -----------------------------------------------------------

const SHARED = '  Generated by `npm run mark` (tools/make-mark.mjs). Edit the geometry there.';

const FULL  = { x: 0, y: 0, size: 128 };
const STORE = { x: 16, y: 16, size: 96 };

const TMP = '.mark';
mkdirSync(TMP, { recursive: true });

const ASSETS = [
  {
    path: 'public/favicon.svg',
    shapes: markShapes(FULL), box: 128,
    note: '  Domnotate favicon. The full drawing: a browser scales this itself.',
  },
  {
    path: `${TMP}/icon-16.svg`,
    shapes: smallShapes(), box: 16,
    note: '  Toolbar icon, 16px. Rasterised to src/extension/icons/icon-16.png.',
  },
  {
    path: `${TMP}/icon-32.svg`,
    shapes: markShapes({ ...FULL, grain: 'none' }), box: 128,
    note: '  Toolbar icon, 32px. Rasterised to src/extension/icons/icon-32.png.',
  },
  {
    path: `${TMP}/icon-48.svg`,
    shapes: markShapes({ x: 0, y: 0, size: 48, grain: 'snapped' }), box: 48,
    note: '  Toolbar icon, 48px. Rasterised to src/extension/icons/icon-48.png.',
  },
  {
    path: `${TMP}/icon-128.svg`,
    shapes: markShapes(FULL), box: 128,
    note: '  Toolbar icon, 128px. Rasterised to src/extension/icons/icon-128.png.',
  },
  {
    path: `${TMP}/store-icon.svg`,
    shapes: markShapes(STORE), box: 128,
    note: `  Chrome Web Store listing icon. Rasterised to
  docs/store-assets/store-icon-128.png, named apart from the toolbar's
  icon-128.png: same pixel size, different drawing.

  The store requires 96x96 of artwork inside a 128x128 canvas with 16px of
  transparent padding, which is why this is the one asset that does not bleed.`,
  },
];

for (const { path, note, shapes, box } of ASSETS) {
  writeFileSync(path, svg(shapes, box, `<!--\n${note}\n\n${SHARED}\n-->`));
  console.log('wrote', path);
}

// --- The same drawing as DOM, for the app ---------------------------------

const tsShapes = markShapes(FULL)
  .map((s) => `  ['${s.tag}', ${JSON.stringify(s.attrs)}],`)
  .join('\n');

writeFileSync('src/core/mark.ts', `// ============================================================
// Domnotate — the mark
// ============================================================
//
// GENERATED by \`npm run mark\` (tools/make-mark.mjs). Do not edit.
//
// The full variant. The app never renders the mark small enough to need the
// 16px one.

const SVG_NS = 'http://www.w3.org/2000/svg';

/** One shape of the mark: an element name and its attributes. */
type MarkShape = readonly [string, Readonly<Record<string, string | number>>];

/** The mark, bleeding to a 128-unit square. */
export const MARK_SHAPES: readonly MarkShape[] = [
${tsShapes}
];

/**
 * Build the mark as an \`<svg>\` element \`size\` px square. The panel bleeds to the
 * box, so \`size\` is what the mark actually paints.
 *
 * Built element by element, not from a markup string: the extension certifies to
 * the Chrome Web Store that it assigns no innerHTML, and it shares this module.
 */
export function createMarkElement(size: number, doc: Document = document): SVGSVGElement {
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 128 128');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');

  for (const [tag, attrs] of MARK_SHAPES) {
    const node = doc.createElementNS(SVG_NS, tag);
    for (const [name, value] of Object.entries(attrs)) {
      node.setAttribute(name, String(value));
    }
    svg.appendChild(node);
  }

  return svg;
}
`);
console.log('wrote src/core/mark.ts');

// --- The mark inside the store promo tile ---------------------------------

const TILE = 'tools/store-promo-tile.html';
const MARKERS = /( *<!-- mark:start -->)[\s\S]*?( *<!-- mark:end -->)/;
const tile = readFileSync(TILE, 'utf8');

// Tested for the markers, not for a change in output: an unchanged geometry is a
// legitimate no-op.
if (!MARKERS.test(tile)) {
  throw new Error(`${TILE}: no <!-- mark:start --> / <!-- mark:end --> pair to write into`);
}
writeFileSync(TILE, tile.replace(
  MARKERS,
  (_, start, end) => `${start}\n${body(markShapes(FULL), '      ')}\n${end}`,
));
console.log('wrote', TILE);
