// ============================================================
// Domnotate — notes held across a close
// ============================================================
//
// Annotations kept on the isolated world's global, so closing the sidebar is
// not how you lose an afternoon's work. Content scripts re-injected into the
// same page share that object, and the page cannot see it.
//
// A page load clears them: the window goes and the store goes with it. That is
// the known limit of this tier, not an oversight.
//
// The store is a flat list, not one slot per screen. Each note carries its own
// `capturedOn`, so the screen a note belongs to is a property of the note
// rather than of the store, and one pass can cover a whole app.

import type { Annotation } from '@/types/core';

const STASH_FLAG = '__domnotateStash';

/**
 * Which screen a note was taken on.
 *
 * The hash is in: a hash router keeps its entire route there, so leaving it out
 * would give every screen of such an app the same name. `search` is out: params
 * churn without a screen change (an analytics tag, an auth redirect), and a name
 * that drifts on its own would split one screen's notes in two. The cost is that
 * an app routing its tabs through `?tab=` files them all under one page, which
 * groups the notes together rather than losing them.
 */
export function routeOf(win: Window): string {
  const { origin, pathname, hash } = win.location;
  return `${origin}${pathname}${hash}`;
}

/** A short label for a route, for a heading in the sidebar. */
export function routeLabel(route: string): string {
  try {
    const url = new URL(route);
    return `${url.pathname}${url.hash}` || '/';
  } catch {
    // An opaque origin gives a route that is not a parseable URL.
    return route;
  }
}

/** Notes the store is holding, in the order they were taken. */
export function readStash(win: Window): Annotation[] {
  const held = (win as unknown as Record<string, unknown>)[STASH_FLAG];
  return Array.isArray(held) ? (held as Annotation[]) : [];
}

/**
 * Hold this session's notes for the next open.
 *
 * With nothing to hold the store is removed rather than left empty, so an open
 * and close that wrote nothing leaves no trace on the page.
 */
export function writeStash(win: Window, annotations: Annotation[]): void {
  const scope = win as unknown as Record<string, unknown>;
  if (annotations.length > 0) {
    scope[STASH_FLAG] = annotations;
    return;
  }
  delete scope[STASH_FLAG];
}
