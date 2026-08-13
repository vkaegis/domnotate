import { describe, test, expect } from 'vitest';

import { MARK_SHAPES, createMarkElement } from '@/core/mark';

const SVG_NS = 'http://www.w3.org/2000/svg';

describe('createMarkElement', () => {
  test('builds an svg element at the requested size', () => {
    const svg = createMarkElement(60);

    expect(svg.namespaceURI).toBe(SVG_NS);
    expect(svg.tagName.toLowerCase()).toBe('svg');
    expect(svg.getAttribute('width')).toBe('60');
    expect(svg.getAttribute('height')).toBe('60');
    // The viewBox is fixed so a caller only ever chooses the rendered size.
    expect(svg.getAttribute('viewBox')).toBe('0 0 128 128');
  });

  test('is hidden from assistive technology', () => {
    // Every place it is used names the product in adjacent copy.
    const svg = createMarkElement(60);

    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('focusable')).toBe('false');
  });

  test('renders every shape of the mark, in the SVG namespace', () => {
    const svg = createMarkElement(128);

    expect(svg.childNodes).toHaveLength(MARK_SHAPES.length);
    for (const child of Array.from(svg.children)) {
      expect(child.namespaceURI).toBe(SVG_NS);
    }
  });

  test('applies each shape its attributes', () => {
    const svg = createMarkElement(128);
    const [tag, attrs] = MARK_SHAPES[0];
    const first = svg.children[0];

    expect(first.tagName.toLowerCase()).toBe(tag);
    for (const [name, value] of Object.entries(attrs)) {
      expect(first.getAttribute(name)).toBe(String(value));
    }
  });

  test('accepts a foreign document, for the extension shadow root', () => {
    const doc = document.implementation.createHTMLDocument('other');
    const svg = createMarkElement(24, doc);

    expect(svg.ownerDocument).toBe(doc);
  });

  test('returns a fresh element each call', () => {
    expect(createMarkElement(16)).not.toBe(createMarkElement(16));
  });
});

describe('MARK_SHAPES', () => {
  // Invariants a regeneration must not break.
  test('opens with the cloth panel, in the accent colour', () => {
    const [tag, attrs] = MARK_SHAPES[0];

    expect(tag).toBe('rect');
    expect(attrs.fill).toBe('#C4725A');
  });

  test('closes with the pin head, in ink', () => {
    const [tag, attrs] = MARK_SHAPES[MARK_SHAPES.length - 1];

    expect(tag).toBe('circle');
    expect(attrs.fill).toBe('#2C2016');
  });

  test('bleeds the panel to its box', () => {
    // Padding at 16px is a soft halo. Only the store icon has a padding rule.
    const [, panel] = MARK_SHAPES[0];

    expect(Number(panel.x)).toBe(0);
    expect(Number(panel.y)).toBe(0);
    expect(Number(panel.width)).toBe(128);
    expect(Number(panel.height)).toBe(128);
  });

  test('breaks the grain where the pin lies in it', () => {
    // Unbroken rules would render a pin floating over a ruled card.
    const lines = MARK_SHAPES.filter(([tag]) => tag === 'line');
    const rows = new Set(lines.map(([, attrs]) => attrs.y1));

    expect(rows.size).toBe(9);
    expect(lines.length).toBeGreaterThan(rows.size);

    // Every broken row must leave a gap, not just abut.
    for (const row of rows) {
      const runs = lines
        .filter(([, a]) => a.y1 === row)
        .map(([, a]) => [Number(a.x1), Number(a.x2)] as const)
        .sort((a, b) => a[0] - b[0]);
      for (let i = 1; i < runs.length; i++) {
        expect(runs[i][0]).toBeGreaterThan(runs[i - 1][1]);
      }
    }
  });

  test('lays the pin off the panel diagonal', () => {
    // On the square's own 45-degree diagonal it reads as an arrow, not a pin.
    const caps = MARK_SHAPES
      .filter(([tag, attrs]) => tag === 'circle' && attrs.fill === '#FAF7F2')
      .map(([, attrs]) => ({ x: Number(attrs.cx), y: Number(attrs.cy) }));

    expect(caps).toHaveLength(2);

    const [knee, base] = caps;
    const angle = (Math.atan2(Math.abs(base.y - knee.y), Math.abs(base.x - knee.x)) * 180) / Math.PI;

    expect(angle).toBeGreaterThan(50);
    expect(angle).toBeLessThan(70);
  });

  test('keeps the whole mark inside the panel', () => {
    // Nothing may overhang: the mark renders on light and dark chrome alike.
    const [, panel] = MARK_SHAPES[0];
    const left = Number(panel.x);
    const top = Number(panel.y);
    const right = left + Number(panel.width);
    const bottom = top + Number(panel.height);

    for (const [tag, attrs] of MARK_SHAPES.slice(1)) {
      if (tag !== 'circle') continue;
      const cx = Number(attrs.cx);
      const cy = Number(attrs.cy);
      const r = Number(attrs.r);
      expect(cx - r).toBeGreaterThanOrEqual(left);
      expect(cx + r).toBeLessThanOrEqual(right);
      expect(cy - r).toBeGreaterThanOrEqual(top);
      expect(cy + r).toBeLessThanOrEqual(bottom);
    }
  });

  test('uses only the three brand values', () => {
    const values = new Set(
      MARK_SHAPES.flatMap(([, attrs]) => [attrs.fill, attrs.stroke]).filter(Boolean),
    );

    expect(values).toEqual(new Set(['#C4725A', '#FAF7F2', '#2C2016']));
  });
});
