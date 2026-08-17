import { describe, it, expect, afterEach } from 'vitest';

import { readStash, routeLabel, routeOf, writeStash } from '@/extension/held-notes';
import { makeAnnotation } from '@/__tests__/fixtures';

const STASH_FLAG = '__domnotateStash';

function stashOnWindow(): unknown {
  return (window as unknown as Record<string, unknown>)[STASH_FLAG];
}

afterEach(() => {
  delete (window as unknown as Record<string, unknown>)[STASH_FLAG];
  window.history.pushState({}, '', '/');
});

describe('routeOf', () => {
  it('joins origin, pathname and hash', () => {
    window.history.pushState({}, '', '/records/1#detail');
    expect(routeOf(window)).toBe(`${window.location.origin}/records/1#detail`);
  });

  it('leaves the query string out', () => {
    window.history.pushState({}, '', '/records/1?tab=summary');
    expect(routeOf(window)).toBe(`${window.location.origin}/records/1`);
  });

  it('gives a hash route its own name', () => {
    window.history.pushState({}, '', '/#/records/1');
    const first = routeOf(window);
    window.history.pushState({}, '', '/#/records/2');
    expect(routeOf(window)).not.toBe(first);
  });
});

describe('routeLabel', () => {
  it('shortens a route to its path and hash', () => {
    expect(routeLabel('https://app.example.com/records/1')).toBe('/records/1');
    expect(routeLabel('https://app.example.com/#/records/1')).toBe('/#/records/1');
  });

  it('hands back anything it cannot parse', () => {
    // An opaque origin produces a route that is not a URL.
    expect(routeLabel('nullblank')).toBe('nullblank');
  });
});

describe('notes held across a close', () => {
  it('holds the notes it is given, in order', () => {
    const notes = [makeAnnotation({ text: 'one' }), makeAnnotation({ text: 'two' })];
    writeStash(window, notes);
    expect(readStash(window).map((a) => a.text)).toEqual(['one', 'two']);
  });

  it('holds notes from more than one screen together', () => {
    // The store is flat and each note carries its own page, so nothing here
    // can overwrite a screen's notes the way a per-screen slot could.
    const notes = [
      makeAnnotation({ capturedOn: { route: 'https://x/a', url: 'https://x/a' } }),
      makeAnnotation({ capturedOn: { route: 'https://x/b', url: 'https://x/b' } }),
    ];
    writeStash(window, notes);
    expect(readStash(window)).toHaveLength(2);
  });

  it('reads nothing when the store was never written', () => {
    expect(readStash(window)).toEqual([]);
  });

  it('leaves nothing on the window when the last note goes', () => {
    writeStash(window, [makeAnnotation()]);
    writeStash(window, []);
    expect(stashOnWindow()).toBeUndefined();
  });

  it('does not create a store just to hold nothing', () => {
    writeStash(window, []);
    expect(stashOnWindow()).toBeUndefined();
  });

  it('ignores a store the page has replaced with junk', () => {
    (window as unknown as Record<string, unknown>)[STASH_FLAG] = { nope: true };
    expect(readStash(window)).toEqual([]);
  });
});
