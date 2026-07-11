// ============================================================
// Domnotate — Edit Target Identity
// ============================================================
//
// The identity of an edit's target is the pair (viewScope, cssSelector), not
// the selector alone. In scoped content (tabs, slides, carousels) the same
// selector legitimately matches a different element in each scope — reanchoring
// disambiguates by resolving the selector *inside* a scope root. The edit store
// keys on this same identity so that editing `p.target` in tab 1 and `p.target`
// in tab 2 produces two records rather than overwriting one.

import type { ElementDescriptor, ViewScope } from '@/types/core';

// NUL can't appear in a CSS selector or a scope id, so it is a collision-safe
// separator. A space would not be: selectors contain spaces and combinators, so
// sel="a" scope="b c" would collide with sel="a b" scope="c".
const SEPARATOR = '\u0000';

/**
 * Stable discriminator for a view scope. Mirrors the identity rule in
 * `scopesMatch` (view-scope.ts): prefer the scope id, fall back to
 * `kind:selector`. An absent scope (unscoped page) yields the empty string so
 * two unscoped edits to the same selector collapse to one target.
 */
function scopeDiscriminator(scope: ViewScope | undefined): string {
  if (!scope) return '';
  return scope.id || `${scope.kind}:${scope.selector}`;
}

/**
 * Canonical key for an edit's target. Two edits share a target iff they have
 * the same selector AND the same scope identity (both unscoped counts as the
 * same; scoped vs unscoped does not).
 */
export function editTargetKey(element: ElementDescriptor, viewScope?: ViewScope): string {
  return `${element.cssSelector}${SEPARATOR}${scopeDiscriminator(viewScope)}`;
}
