// ============================================================
// Domnotate — DOM introspection provider (Tier A + Tier B)
// ============================================================
//
// The floor. This provider uses nothing but the DOM, so it works on every site
// with no framework cooperation and no build flags (§3.1a). Phase 0 measured
// its inputs on a real production build at 90–100% coverage, against 0% for
// `_debugSource` and 0% for an element's own `data-testid`.
//
//   Tier A — universal HTML: accessible name and role, source-literal text
//            (with the runtime-data split), landmark path including ancestor
//            `aria-label`, allow-listed attributes, route, inline style and
//            geometry.
//   Tier B — class convention: class strings are written literally in component
//            source, so whatever survives hash filtering is a grep candidate.
//            Recognised conventions additionally yield a component name and its
//            variant props; unrecognised ones degrade to that floor.
//
// Several helpers are ports of `tools/fiber-probe.js`, where they were
// field-tested against the target app. Behavioural changes from the probe are
// noted inline.

import type { SourceSignal, SignalRect } from './types';
import { type IntrospectionProvider, filterProps, isIdentifyingName } from './provider';

/** Matches the probe, so measured coverage numbers carry over. */
export const TEXT_LIMIT = 60;

// ------------------------------------------------------------
// Class hashing — the Tier B floor
// ------------------------------------------------------------

/** Fully runtime-generated: nothing recoverable, drop entirely. */
const HASH_CLASS = /^(css-[a-z0-9]+|e[a-z0-9]{7,}|sc-[a-zA-Z0-9]+)$/;

/**
 * CSS Modules are *partly* hashed — `Button_root__a1b2c` keeps a source-derived
 * prefix. Don't drop these; strip the hash and keep `Button_root`, which greps.
 * Discriminated from BEM (`card__header--active`) by the suffix looking like a
 * hash: short, alphanumeric, contains a digit, no hyphens.
 */
const CSS_MODULE = /^([A-Za-z][\w]*(?:_[\w]+)*)__([A-Za-z0-9]{4,10})$/;

export function cssModuleBase(c: string): string | null {
  const m = c.match(CSS_MODULE);
  return m && /\d/.test(m[2]) ? m[1] : null;
}

export function isHashClass(c: string): boolean {
  return HASH_CLASS.test(c);
}

/** Stable, grep-worthy form of a class, or null if it is pure hash. */
export function stableClassForm(c: string): string | null {
  if (isHashClass(c)) return null;
  return cssModuleBase(c) || c;
}

// ------------------------------------------------------------
// Tier B — the convention table
// ------------------------------------------------------------

export interface ParsedConvention {
  /** Component name as written in source, or null when unrecoverable. */
  component: string | null;
  /** Raw modifier tokens, kept verbatim because they grep. */
  modifiers: string[];
  /** The classes this convention claimed. */
  matched: string[];
  /** Reconstructed props, when the convention encodes them (`color="primary"`). */
  props?: Record<string, string>;
  /** Reconstructed boolean props (`disabled`). */
  flags?: string[];
}

export interface ClassConvention {
  readonly id: string;
  test(stable: string[], raw: string[]): boolean;
  parse(stable: string[], raw: string[]): ParsedConvention;
}

// --- MUI ---------------------------------------------------
//
// Measured at 90% coverage on the target app — the strongest signal that
// survives its production build, and one the original plan missed entirely.
// `MuiButton-root MuiButton-outlined MuiButton-colorPrimary MuiButton-sizeSmall`
// reconstructs deterministically to
// `<Button variant="outlined" color="primary" size="small">`.

const MUI_PROP_KEYS = new Set([
  'color',
  'size',
  'variant',
  'orientation',
  'severity',
  'position',
  'align',
  'edge',
  'direction',
  'placement',
  'anchor',
  'elevation',
  'spacing',
]);

const MUI_VARIANT_WORDS = new Set([
  'outlined',
  'contained',
  'filled',
  'standard',
  'text',
  'elevation',
  'rectangular',
  'circular',
  'rounded',
  'dot',
  'determinate',
  'indeterminate',
  'dashed',
]);

const MUI_COLOR_WORDS = new Set([
  'primary',
  'secondary',
  'error',
  'warning',
  'info',
  'success',
  'inherit',
  'default',
]);

function lowerFirst(s: string): string {
  return s.length === 0 ? s : s[0].toLowerCase() + s.slice(1);
}

function splitCamel(s: string): string[] {
  return s.split(/(?=[A-Z])/).filter(Boolean);
}

function isMuiKeyword(part: string): boolean {
  const head = lowerFirst(part);
  return MUI_PROP_KEYS.has(head) || MUI_VARIANT_WORDS.has(head) || MUI_COLOR_WORDS.has(head);
}

/**
 * Turn MUI modifier classes into the props they were generated from.
 * Handles the compound forms MUI also emits (`outlinedPrimary`,
 * `outlinedSizeSmall`) rather than treating them as opaque flags.
 * First occurrence wins, which matches MUI's class emission order.
 */
function parseMuiModifiers(modifiers: string[]): { props: Record<string, string>; flags: string[] } {
  const props: Record<string, string> = {};
  const flags: string[] = [];

  const setProp = (key: string, value: string) => {
    if (!value) return;
    if (props[key] === undefined) props[key] = value;
  };

  for (const modifier of modifiers) {
    const parts = splitCamel(modifier);
    let i = 0;

    while (i < parts.length) {
      const head = lowerFirst(parts[i]);

      if (MUI_PROP_KEYS.has(head) && i + 1 < parts.length) {
        let j = i + 1;
        const value: string[] = [];
        while (
          j < parts.length &&
          !MUI_PROP_KEYS.has(lowerFirst(parts[j])) &&
          !MUI_VARIANT_WORDS.has(lowerFirst(parts[j]))
        ) {
          value.push(parts[j]);
          j++;
        }
        setProp(head, lowerFirst(value.join('')));
        i = j;
        continue;
      }

      if (MUI_VARIANT_WORDS.has(head)) {
        setProp('variant', head);
        i++;
        continue;
      }

      if (MUI_COLOR_WORDS.has(head)) {
        setProp('color', head);
        i++;
        continue;
      }

      let j = i;
      const flag: string[] = [];
      while (j < parts.length && !isMuiKeyword(parts[j])) {
        flag.push(parts[j]);
        j++;
      }
      if (flag.length === 0) {
        flag.push(parts[i]);
        j = i + 1;
      }
      const name = lowerFirst(flag.join(''));
      if (name && !flags.includes(name)) flags.push(name);
      i = j;
    }
  }

  return { props, flags };
}

/**
 * The convention table. **Adding a convention is a table entry, not a code
 * change** (§3.6) — append an entry with `test` and `parse`; everything else
 * (hash filtering, the grep-class floor, reconstruction, honesty checks) is
 * shared. Order is precedence: the first matching entry wins.
 */
export const CLASS_CONVENTIONS: ClassConvention[] = [
  {
    id: 'mui',
    test: (cs) => cs.some((c) => /^Mui[A-Z]/.test(c)),
    parse: (cs) => {
      const own = cs.filter((c) => /^Mui[A-Z]/.test(c));
      // Prefer the most specific component: the one with the most classes, and
      // never a `*Base` wrapper when a real component is also present.
      const counts = new Map<string, number>();
      const order: string[] = [];
      for (const c of own) {
        const base = c.split('-')[0];
        if (!counts.has(base)) order.push(base);
        counts.set(base, (counts.get(base) ?? 0) + 1);
      }
      const ranked = order.slice().sort((a, b) => {
        const aBase = a.endsWith('Base') ? 1 : 0;
        const bBase = b.endsWith('Base') ? 1 : 0;
        if (aBase !== bBase) return aBase - bBase;
        const byCount = (counts.get(b) ?? 0) - (counts.get(a) ?? 0);
        if (byCount !== 0) return byCount;
        return order.indexOf(a) - order.indexOf(b);
      });
      const componentClass = ranked[0] ?? null;
      const modifiers = own
        .filter((c) => c.split('-')[0] === componentClass)
        .map((c) => c.split('-').slice(1).join('-'))
        .filter((m) => m && m !== 'root');
      const { props, flags } = parseMuiModifiers(modifiers);
      return {
        component: componentClass ? componentClass.replace(/^Mui/, '') : null,
        modifiers,
        matched: own,
        props,
        flags,
      };
    },
  },
  {
    id: 'css-modules',
    // Already hash-stripped to `Button_root` by stableClassForm.
    test: (_cs, raw) => raw.some((c) => cssModuleBase(c) !== null),
    parse: (_cs, raw) => {
      const bases = raw.map(cssModuleBase).filter((b): b is string => b !== null);
      return {
        component: bases[0] ? bases[0].split('_')[0] : null,
        modifiers: bases.map((b) => b.split('_').slice(1).join('_')).filter(Boolean),
        matched: bases,
      };
    },
  },
  {
    id: 'ant',
    test: (cs) => cs.some((c) => /^ant-[a-z]/.test(c)),
    parse: (cs) => {
      const own = cs.filter((c) => /^ant-[a-z]/.test(c));
      const base = own.reduce<string | null>((a, b) => (a && a.length <= b.length ? a : b), null);
      return {
        component: base ? base.replace(/^ant-/, '') : null,
        modifiers: base
          ? own.filter((c) => c !== base).map((c) => c.replace(`${base}-`, ''))
          : [],
        matched: own,
      };
    },
  },
  {
    id: 'bem',
    // block__element--modifier. cssModuleBase() already claimed the hashed ones.
    test: (cs, raw) =>
      cs.some((c) => /^[a-z][\w-]*__[\w-]+/.test(c)) && !raw.some((c) => cssModuleBase(c) !== null),
    parse: (cs) => {
      const own = cs.filter((c) => /^[a-z][\w-]*__[\w-]+/.test(c));
      return {
        component: own[0] ? own[0].split('__')[0] : null,
        modifiers: own.map((c) => c.split('--')[1] || '').filter(Boolean),
        matched: own,
      };
    },
  },
  {
    id: 'bootstrap',
    test: (cs) =>
      cs.includes('btn') || cs.some((c) => /^(card|navbar|form-control|badge|alert)$/.test(c)),
    parse: (cs) => {
      const base = cs.find((c) => /^(btn|card|navbar|badge|alert|form-control)$/.test(c)) ?? null;
      return {
        component: base,
        modifiers: base
          ? cs.filter((c) => c.startsWith(`${base}-`)).map((c) => c.slice(base.length + 1))
          : [],
        matched: base ? cs.filter((c) => c === base || c.startsWith(`${base}-`)) : [],
      };
    },
  },
  {
    id: 'utility',
    // Tailwind-ish. No component name, but the class string itself greps well.
    test: (cs) =>
      cs.filter((c) => /^(sm:|md:|lg:|xl:|hover:|focus:|dark:)?[a-z-]+(-[\w./[\]%]+)*$/.test(c))
        .length >= 4,
    parse: (cs) => ({ component: null, modifiers: [], matched: cs }),
  },
];

function reconstruct(parsed: ParsedConvention): string | null {
  if (!parsed.component) return null;

  const props = parsed.props ?? {};
  const flags = parsed.flags ?? [];
  const hasProps = Object.keys(props).length > 0 || flags.length > 0;

  if (hasProps) {
    const preferred = ['variant', 'color', 'size'];
    const keys = Object.keys(props).sort((a, b) => {
      const ai = preferred.indexOf(a);
      const bi = preferred.indexOf(b);
      if (ai !== bi) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      return a.localeCompare(b);
    });
    const rendered = [
      ...keys.map((k) => `${k}="${props[k]}"`),
      ...flags,
    ];
    return `<${parsed.component}${rendered.length ? ` ${rendered.join(' ')}` : ''}>`;
  }

  return `<${parsed.component}${parsed.modifiers.length ? ` ${parsed.modifiers.join(' ')}` : ''}>`;
}

export interface ClassConventionResult {
  convention: string;
  component: string | null;
  modifiers: string[];
  reconstructed: string | null;
  /** The universal floor: stable classes are grep candidates either way. */
  grepClasses: string[];
}

export function classConventionSignal(el: Element): ClassConventionResult | null {
  const all = Array.from(el.classList);
  const stable = all.map(stableClassForm).filter((c): c is string => c !== null);
  if (stable.length === 0) return null;

  const hit = CLASS_CONVENTIONS.find((c) => c.test(stable, all));
  const parsed: ParsedConvention = hit
    ? hit.parse(stable, all)
    : { component: null, modifiers: [], matched: [] };

  // Honesty check: a name that would never land on a definition is not a
  // component name, even when the convention produced one.
  const component = isIdentifyingName(parsed.component) ? parsed.component : null;
  const owned: ParsedConvention = { ...parsed, component };

  return {
    convention: hit ? hit.id : 'unknown',
    component,
    modifiers: parsed.modifiers,
    reconstructed: reconstruct(owned),
    grepClasses: stable,
  };
}

// ------------------------------------------------------------
// Tier A — test ids
// ------------------------------------------------------------

export const TESTID_ATTRS = [
  'data-testid',
  'data-test-id',
  'data-test',
  'data-cy',
  'data-qa',
  'data-automation-id',
];

export interface TestIdResult {
  attribute: string;
  value: string;
  own: boolean;
  hops?: number;
}

export function findTestId(el: Element): TestIdResult | null {
  for (const attr of TESTID_ATTRS) {
    const value = el.getAttribute(attr);
    if (value) return { attribute: attr, value, own: true };
  }
  // An ancestor testid still narrows the search usefully — but it is not the
  // element's own identity, so `own: false` keeps it out of `strong`.
  let node = el.parentElement;
  let hops = 0;
  while (node && hops < 6) {
    for (const attr of TESTID_ATTRS) {
      const value = node.getAttribute(attr);
      if (value) return { attribute: attr, value, own: false, hops: hops + 1 };
    }
    node = node.parentElement;
    hops++;
  }
  return null;
}

// ------------------------------------------------------------
// Tier A — role and accessible name
// ------------------------------------------------------------

const INPUT_ROLES: Record<string, string> = {
  checkbox: 'checkbox',
  radio: 'radio',
  range: 'slider',
  search: 'searchbox',
  email: 'textbox',
  tel: 'textbox',
  text: 'textbox',
  url: 'textbox',
  number: 'spinbutton',
  submit: 'button',
  button: 'button',
  reset: 'button',
};

const TAG_ROLES: Record<string, string> = {
  a: 'link',
  article: 'article',
  aside: 'complementary',
  button: 'button',
  dialog: 'dialog',
  footer: 'contentinfo',
  form: 'form',
  header: 'banner',
  h1: 'heading',
  h2: 'heading',
  h3: 'heading',
  h4: 'heading',
  h5: 'heading',
  h6: 'heading',
  img: 'img',
  li: 'listitem',
  main: 'main',
  nav: 'navigation',
  ol: 'list',
  option: 'option',
  select: 'combobox',
  table: 'table',
  td: 'cell',
  textarea: 'textbox',
  th: 'columnheader',
  tr: 'row',
  ul: 'list',
};

/** Explicit `role`, else the implicit role of the tag. Not the full ARIA algorithm. */
export function resolveRole(el: Element): string | null {
  const explicit = el.getAttribute('role');
  if (explicit) return explicit.trim().split(/\s+/)[0];

  const tag = el.tagName.toLowerCase();
  if (tag === 'a') return el.hasAttribute('href') ? 'link' : null;
  if (tag === 'input') {
    const type = (el.getAttribute('type') || 'text').toLowerCase();
    return INPUT_ROLES[type] ?? 'textbox';
  }
  if (tag === 'section') {
    return el.hasAttribute('aria-label') || el.hasAttribute('aria-labelledby') ? 'region' : null;
  }
  return TAG_ROLES[tag] ?? null;
}

/** Roles whose accessible name comes from their own content. */
const NAME_FROM_CONTENT = new Set([
  'button',
  'link',
  'heading',
  'tab',
  'menuitem',
  'option',
  'checkbox',
  'radio',
  'columnheader',
  'rowheader',
  'cell',
]);

function escapeForSelector(value: string): string {
  const g = globalThis as { CSS?: { escape?: (s: string) => string } };
  if (typeof g.CSS?.escape === 'function') return g.CSS.escape(value);
  return value.replace(/["\\]/g, '\\$&');
}

export interface AccessibleNameResult {
  name: string;
  from: string;
}

/** Approximate accessible name. Not the full accname algorithm. */
export function accessibleName(el: Element): AccessibleNameResult | null {
  const label = el.getAttribute('aria-label');
  if (label?.trim()) return { name: label.trim(), from: 'aria-label' };

  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const parts = labelledBy
      .split(/\s+/)
      .map((id) => el.ownerDocument.getElementById(id))
      .filter((n): n is HTMLElement => n !== null)
      .map((n) => (n.textContent || '').trim())
      .filter(Boolean);
    if (parts.length) return { name: parts.join(' '), from: 'aria-labelledby' };
  }

  if (el.id) {
    const explicit = el.ownerDocument.querySelector(`label[for="${escapeForSelector(el.id)}"]`);
    const text = explicit?.textContent?.trim();
    if (text) return { name: text, from: 'label[for]' };
  }

  const alt = el.getAttribute('alt');
  if (alt?.trim()) return { name: alt.trim(), from: 'alt' };

  const title = el.getAttribute('title');
  if (title?.trim()) return { name: title.trim(), from: 'title' };

  const placeholder = el.getAttribute('placeholder');
  if (placeholder?.trim()) return { name: placeholder.trim(), from: 'placeholder' };

  // Name-from-content, which the probe did not do: a button's accessible name
  // really is its label, and that label is a source literal.
  const role = resolveRole(el);
  if (role && NAME_FROM_CONTENT.has(role)) {
    const text = (el.textContent || '').trim().replace(/\s+/g, ' ');
    if (text && text.length <= 80) return { name: text, from: 'text-content' };
  }

  return null;
}

// ------------------------------------------------------------
// Tier A — literal text and the runtime-data split
// ------------------------------------------------------------

export interface LiteralTextResult {
  text: string;
  truncated: boolean;
  from: string;
}

/**
 * Text that is plausibly a literal in source. Prefers the element's own text
 * nodes; falls back to descendant text only when the element is small.
 */
export function literalText(el: Element, limit: number = TEXT_LIMIT): LiteralTextResult | null {
  const ownText = Array.from(el.childNodes)
    .filter((n) => n.nodeType === 3 /* Node.TEXT_NODE */)
    .map((n) => (n.textContent || '').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ');

  if (ownText) {
    return {
      text: ownText.slice(0, limit),
      truncated: ownText.length > limit,
      from: 'own-text-nodes',
    };
  }

  const all = (el.textContent || '').trim().replace(/\s+/g, ' ');
  if (!all) return null;
  // A huge subtree's text is not a source literal, it's the whole page.
  if (el.querySelectorAll('*').length > 20) {
    return { text: all.slice(0, limit), truncated: true, from: 'subtree-large' };
  }
  return { text: all.slice(0, limit), truncated: all.length > limit, from: 'subtree' };
}

/**
 * Text that is clearly runtime data will never grep. Distinguishing it from a
 * source literal matters more than whether text exists at all — "Download" is a
 * lead, "feedback-dashboard.html" and "Vineet Kumar" are dead ends. Phase 0
 * measured raw literal text at 60% but only 45% source-literal; this split is
 * the difference. Conservative: only flags shapes that are unambiguously data.
 */
export function looksLikeRuntimeData(text: string | null | undefined): string[] | null {
  if (!text) return null;
  const reasons: string[] = [];
  if (/\.[a-z]{2,5}(\s|$)/i.test(text) && /[\w-]+\.[a-z]{2,5}/i.test(text)) {
    reasons.push('filename-like');
  }
  if (/[\w.+-]+@[\w-]+\.[a-z]{2,}/i.test(text)) reasons.push('email');
  if (/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i.test(text)) reasons.push('uuid');
  if (/https?:\/\//i.test(text)) reasons.push('url');
  if (/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/.test(text)) reasons.push('date');
  if (/^\s*[\d,.$%]+\s*$/.test(text)) reasons.push('numeric');
  return reasons.length ? reasons : null;
}

// ------------------------------------------------------------
// Tier A — landmark path (with ancestor aria-label)
// ------------------------------------------------------------

const LANDMARK_SELECTOR =
  'main, nav, header, footer, aside, form, dialog, ' +
  '[role="main"], [role="navigation"], [role="banner"], [role="dialog"], ' +
  '[role="tabpanel"], [role="region"], [role="search"], [role="form"], ' +
  'section[aria-label], section[aria-labelledby]';

/**
 * Landmark ancestry, outermost-first, carrying each landmark's `aria-label`.
 *
 * Phase 0b: `aria-label="Primary navigation"` was the *only* discriminator for
 * the one annotation that beat the instrumented baseline, and ancestor ARIA
 * appeared in 7 of 20 probe landmark paths. Agentation does not emit it at all.
 */
export function landmarkPath(el: Element): string[] {
  const path: string[] = [];
  let node = el.parentElement;
  while (node && path.length < 6) {
    if (node.matches(LANDMARK_SELECTOR)) {
      const role = node.getAttribute('role');
      const tag = node.tagName.toLowerCase();
      const label = node.getAttribute('aria-label');
      let entry = role ? `${tag}[role=${role}]` : tag;
      if (label) entry += `("${label.slice(0, 24)}")`;
      path.push(entry);
    }
    node = node.parentElement;
  }
  return path.reverse();
}

// ------------------------------------------------------------
// Tier A — attributes, style, geometry, route
// ------------------------------------------------------------

/**
 * Allow-listed attributes only. `filterProps` is the single sanctioned gate
 * (§3.7 fixed floor); the registry applies it again on the way out, so a
 * provider cannot leak `customerEmail` even by constructing the signal by hand.
 */
export function collectAttributes(el: Element, skipAttribute?: string): Record<string, string> {
  const raw: Record<string, string> = {};
  for (const attr of Array.from(el.attributes)) {
    if (attr.name === skipAttribute) continue;
    if (attr.name === 'class' || attr.name === 'style') continue;
    raw[attr.name] = attr.value;
  }
  return filterProps(raw);
}

function readRect(el: Element): SignalRect {
  const rect =
    typeof el.getBoundingClientRect === 'function'
      ? el.getBoundingClientRect()
      : { x: 0, y: 0, width: 0, height: 0 };
  return {
    x: Math.round(rect.x || 0),
    y: Math.round(rect.y || 0),
    width: Math.round(rect.width || 0),
    height: Math.round(rect.height || 0),
  };
}

// ------------------------------------------------------------
// Provider
// ------------------------------------------------------------

/** Just enough of `Location` for the route signal, so a host can supply its own. */
export interface RouteSource {
  location?: {
    href?: string;
    pathname?: string;
    search?: string;
    hash?: string;
  } | null;
}

export interface DomProviderOptions {
  /**
   * Overrides the view used for the route signal. Defaults to the element's own
   * view; pass `null` to suppress the route entirely.
   */
  window?: RouteSource | null;
  /** Text capture limit. */
  textLimit?: number;
}

/**
 * Tier A + Tier B. Always detects, because plain HTML is always present — this
 * provider is the reason the tool degrades to something usable rather than to
 * nothing on an arbitrary site.
 */
export function createDomProvider(options: DomProviderOptions = {}): IntrospectionProvider {
  const limit = options.textLimit ?? TEXT_LIMIT;

  return {
    name: 'dom',

    detect() {
      return true;
    },

    describe(el: Element): SourceSignal[] {
      const signals: SourceSignal[] = [];

      const testId = findTestId(el);
      if (testId) {
        signals.push({
          kind: 'test-id',
          value: testId.value,
          attribute: testId.attribute,
          own: testId.own,
          ...(testId.hops === undefined ? {} : { hops: testId.hops }),
        });
      }

      const klass = classConventionSignal(el);
      if (klass) {
        signals.push({
          kind: 'class-convention',
          convention: klass.convention,
          component: klass.component,
          modifiers: klass.modifiers,
          reconstructed: klass.reconstructed,
          grepClasses: klass.grepClasses,
        });
      }

      const role = resolveRole(el);
      const name = accessibleName(el);
      if (name || role) {
        signals.push({
          kind: 'accessible-name',
          role,
          name: name?.name ?? '',
          ...(name ? { from: name.from } : {}),
        });
      }

      const text = literalText(el, limit);
      if (text) {
        const runtimeDataReasons = looksLikeRuntimeData(text.text);
        signals.push({
          kind: 'literal-text',
          text: text.text,
          truncated: text.truncated,
          from: text.from,
          ...(runtimeDataReasons ? { runtimeDataReasons } : {}),
        });
      }

      const path = landmarkPath(el);
      if (path.length > 0) signals.push({ kind: 'landmark-path', path });

      signals.push({
        kind: 'dom-attributes',
        tagName: el.tagName.toLowerCase(),
        attributes: collectAttributes(el, testId?.own ? testId.attribute : undefined),
      });

      const inlineStyle = el.getAttribute('style');
      signals.push({
        kind: 'element-style',
        inlineStyle: inlineStyle && inlineStyle.trim() ? inlineStyle.trim() : null,
        rect: readRect(el),
      });

      const view: RouteSource | null =
        options.window === undefined ? (el.ownerDocument?.defaultView ?? null) : options.window;
      const location = view?.location;
      if (location?.href) {
        signals.push({
          kind: 'route',
          url: location.href,
          pathname: location.pathname ?? '',
          ...(location.search ? { search: location.search } : {}),
          ...(location.hash ? { hash: location.hash } : {}),
        });
      }

      return signals;
    },
  };
}
