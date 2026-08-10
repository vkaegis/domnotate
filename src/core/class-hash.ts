// ============================================================
// Domnotate — runtime-hashed class detection
// ============================================================
//
// Shared by the selector generator and the source-hint DOM provider. It lived
// in both for a while and drifted, which is how `css-<hash>-<Label>` ended up
// stripped from one and kept by the other. One copy now.

/**
 * emotion and styled-components rule classes.
 *
 * The trailing group is emotion's `label`, which MUI enables: a real class on
 * a MUI button reads `css-mmlk58-MuiButtonBase-root-MuiButton-root`, not the
 * bare `css-mmlk58` the first version of this assumed. The hash still changes
 * every build, so the whole token is noise.
 */
const HASHED_RULE_CLASS = /^(?:css-[a-z0-9]+|sc-[a-zA-Z0-9]+)(?:-[A-Za-z0-9_-]+)?$/;

/**
 * emotion's "stable" class (e.g. `e1qtd0pd0`) — `e` plus a base36 hash, which
 * in practice carries several interspersed digits.
 */
const EMOTION_STABLE_CLASS = /^e[a-z0-9]{7,}$/;

/**
 * Two digits are required, not one. A single-digit rule keeps `expandable` and
 * `elevation` but still eats `elevation2`, `emphasis1`, `editable2` — ordinary
 * source-written classes whose only sin is a trailing number. Dropping one of
 * those costs a greppable token, which is the whole reason this filter exists,
 * so the heuristic errs toward keeping.
 */
const MIN_HASH_DIGITS = 2;

/**
 * True when a class name is purely runtime-generated and can be dropped.
 *
 * CSS Modules classes (`Button_root__a1b2c`) are deliberately *not* matched:
 * their prefix is source-derived and greppable, and a CSS selector cannot
 * refer to the prefix alone, so dropping them would lose real signal.
 */
export function isHashClass(className: string): boolean {
  if (HASHED_RULE_CLASS.test(className)) return true;
  if (!EMOTION_STABLE_CLASS.test(className)) return false;
  return (className.match(/\d/g)?.length ?? 0) >= MIN_HASH_DIGITS;
}
