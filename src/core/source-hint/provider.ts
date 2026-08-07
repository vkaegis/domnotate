// ============================================================
// Domnotate — Introspection provider registry
// ============================================================
//
// Plan §3.6. Three tiers, of which only the first is required for the tool to
// work on an arbitrary PWA:
//
//   Tier A  universal HTML          — `dom-provider.ts`, always runs
//   Tier B  class convention        — `dom-provider.ts`, framework-independent
//   Tier C  framework introspection — per-provider (React fibers, Vue, Svelte)
//
// This module owns the three things that must be true regardless of which
// providers are installed:
//
//   1. the fixed prop allow-list (§3.7) — enforced here, at the merge point, so
//      a careless provider cannot leak raw props even if it tries;
//   2. the ordered, deduplicated signal merge;
//   3. confidence resolution, which is deliberately stingy (§3.3).

import type { SignalConfidence, SourceHint, SourceSignal, SourceSignalKind } from './types';

// ------------------------------------------------------------
// Provider interface
// ------------------------------------------------------------

export interface IntrospectionProvider {
  readonly name: string;
  detect(): boolean;
  describe(el: Element): SourceSignal[];
}

// ------------------------------------------------------------
// Naming honesty
// ------------------------------------------------------------
//
// Ported from `tools/fiber-probe.js`, where the corrected versions were
// field-tested. Phase 0's first run reported a false PASS at 100% because
// `looksMinified()` tested name *length*: `Styled(div)` (89 occurrences),
// `Primitive.div` and `ContextProvider` all scored as real component names.
// Across 240 chain nodes the truth was 60% generic wrappers, 36% minified,
// 3% junk and **0% identifying application names**.

/** Does this look like a minifier-generated identifier? */
export function looksMinified(name: string | null | undefined): boolean {
  if (!name) return true;
  if (name.length <= 2) return true;
  if (/^[a-zA-Z]{1,2}[0-9]*$/.test(name)) return true;
  if (/^[a-z][0-9]+$/.test(name)) return true;
  if (/^_+$/.test(name)) return true;
  return false;
}

/**
 * Names long enough to pass the minification test but still saying nothing
 * about application source. Identifying-ness, not name length, is the property
 * that matters.
 */
const GENERIC_NAME = new RegExp(
  [
    '^Styled\\(', // emotion / MUI styled()
    '^ForwardRef', // React.forwardRef default naming
    '^Memo\\(', // React.memo default naming
    '^Context(Provider|Consumer)$',
    '^[A-Za-z]*Primitive\\.', // Radix / assistant-ui primitives
    '^Primitive\\.',
    '^Fragment$',
    '^Suspense$',
    '^ErrorBoundary$',
    '^Portal$',
    '^Slot$',
    '^Provider$',
    '^Root$',
  ].join('|'),
);

export function isGenericName(name: string | null | undefined): boolean {
  return Boolean(name) && GENERIC_NAME.test(name as string);
}

/**
 * The signal that actually matters: a name that could plausibly be grepped for
 * in application source and land on a component definition.
 */
export function isIdentifyingName(name: string | null | undefined): boolean {
  if (!name) return false;
  if (looksMinified(name)) return false;
  if (isGenericName(name)) return false;
  return true;
}

// ------------------------------------------------------------
// Prop allow-list — fixed floor (§3.7)
// ------------------------------------------------------------
//
// Raw props are **never** dumped, in any mode. This is not the redaction
// toggle's business (that is Phase 3 and governs text content); it is a floor
// that holds underneath it. Enforced in `mergeSignals`, so it applies to every
// provider's output rather than relying on each provider to behave.

const ALLOWED_PROP_KEYS = new Set(['id', 'name', 'variant', 'type', 'role']);

export function isAllowedPropKey(key: string): boolean {
  const k = key.toLowerCase();
  if (ALLOWED_PROP_KEYS.has(k)) return true;
  if (k.startsWith('data-')) return true;
  if (k.startsWith('aria-')) return true;
  return false;
}

/** Drop every key not on the allow-list. The only sanctioned way to emit props. */
export function filterProps(props: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(props)) {
    if (!isAllowedPropKey(key)) continue;
    if (value === null || value === undefined) continue;
    if (typeof value === 'object' || typeof value === 'function') continue;
    out[key] = String(value);
  }
  return out;
}

// ------------------------------------------------------------
// Ordered merge
// ------------------------------------------------------------

/**
 * Best-first ordering. Two entries are demoted below their nominal kind because
 * they are actively misleading at face value: a minified component path, and
 * literal text that is runtime data rather than a source literal.
 */
const SIGNAL_RANK: Record<string, number> = {
  'source-location': 0,
  'component-path': 1,
  'test-id': 2,
  'class-convention': 3,
  'accessible-name': 4,
  'literal-text': 5,
  'landmark-path': 6,
  'dom-attributes': 7,
  'element-style': 8,
  route: 9,
  // demoted variants
  'literal-text:runtime-data': 10,
  'component-path:minified': 11,
};

function rankOf(signal: SourceSignal): number {
  if (signal.kind === 'component-path' && signal.minified) {
    return SIGNAL_RANK['component-path:minified'];
  }
  if (signal.kind === 'literal-text' && signal.runtimeDataReasons?.length) {
    return SIGNAL_RANK['literal-text:runtime-data'];
  }
  const rank = SIGNAL_RANK[signal.kind];
  return rank === undefined ? 99 : rank;
}

/** Identity for deduplication: same kind and same payload means one signal. */
function signalKey(signal: SourceSignal): string {
  switch (signal.kind) {
    case 'source-location':
      return `source-location:${signal.file}:${signal.line}`;
    case 'component-path':
      return `component-path:${signal.chain.join('>')}`;
    case 'test-id':
      return `test-id:${signal.attribute}=${signal.value}`;
    case 'accessible-name':
      return `accessible-name:${signal.role ?? ''}:${signal.name}`;
    case 'literal-text':
      return `literal-text:${signal.text}`;
    case 'landmark-path':
      return `landmark-path:${signal.path.join('>')}`;
    case 'route':
      return `route:${signal.url}`;
    case 'class-convention':
      return `class-convention:${signal.convention}:${signal.grepClasses.join('.')}`;
    case 'dom-attributes':
      return `dom-attributes:${signal.tagName}`;
    case 'element-style':
      return 'element-style';
  }
}

/** Re-apply the fixed floor to anything a provider emitted. */
function sanitize(signal: SourceSignal): SourceSignal {
  if (signal.kind === 'dom-attributes') {
    return { ...signal, attributes: filterProps(signal.attributes) };
  }
  return signal;
}

/**
 * Stable best-first merge. Earlier providers win ties, so registration order is
 * provider precedence.
 */
export function mergeSignals(signals: SourceSignal[]): SourceSignal[] {
  const seen = new Set<string>();
  const kept: Array<{ signal: SourceSignal; rank: number; order: number }> = [];

  signals.forEach((raw) => {
    const signal = sanitize(raw);
    const key = signalKey(signal);
    if (seen.has(key)) return;
    seen.add(key);
    kept.push({ signal, rank: rankOf(signal), order: kept.length });
  });

  return kept
    .sort((a, b) => (a.rank === b.rank ? a.order - b.order : a.rank - b.rank))
    .map((entry) => entry.signal);
}

// ------------------------------------------------------------
// Confidence
// ------------------------------------------------------------

/**
 * Confidence of a single signal, on its own.
 *
 * Deliberately stingy. `exact` means "this is a file and a line"; nothing else
 * earns it, because a miscalibrated `exact` is a correctness bug that blocks
 * Phase 2 even when the hit rate passes.
 *
 * `strong` means "this string, on its own, is very likely to land on the right
 * definition": an element's *own* test id, or a component name that survived
 * both the minification and the generic-wrapper filters. Notably a recognised
 * class convention is **not** strong — `MuiButton-root` tells you the element
 * is a MUI Button, which identifies what it is, not where it lives, and
 * grepping `Button` in an app repo is useless.
 *
 * Everything else is `weak`, which is the honest reading of Phase 0b: text,
 * classes and landmarks halve an agent's effort but bought zero additional
 * correct answers.
 */
export function confidenceOf(signal: SourceSignal): SignalConfidence {
  switch (signal.kind) {
    case 'source-location':
      return 'exact';
    case 'test-id':
      return signal.own === false ? 'weak' : 'strong';
    case 'component-path':
      return !signal.minified && signal.chain.some(isIdentifyingName) ? 'strong' : 'weak';
    default:
      return 'weak';
  }
}

const CONFIDENCE_ORDER: SignalConfidence[] = ['exact', 'strong', 'weak'];

/** Confidence of the *best* signal present (§3.2). */
export function resolveConfidence(signals: SourceSignal[]): SignalConfidence {
  let best: SignalConfidence = 'weak';
  for (const signal of signals) {
    const c = confidenceOf(signal);
    if (CONFIDENCE_ORDER.indexOf(c) < CONFIDENCE_ORDER.indexOf(best)) best = c;
  }
  return best;
}

// ------------------------------------------------------------
// Registry
// ------------------------------------------------------------

export interface ProviderRegistry {
  register(provider: IntrospectionProvider): void;
  /** Providers in precedence order, regardless of `detect()`. */
  list(): IntrospectionProvider[];
  /** Providers whose `detect()` currently returns true. */
  active(): IntrospectionProvider[];
  describe(el: Element): SourceHint;
}

/**
 * A provider that throws must not take the export down with it — Tier A alone
 * has to produce a usable block on every site (§3.6).
 */
function safeDescribe(provider: IntrospectionProvider, el: Element): SourceSignal[] {
  try {
    if (!provider.detect()) return [];
    const signals = provider.describe(el);
    return Array.isArray(signals) ? signals : [];
  } catch {
    return [];
  }
}

export function createProviderRegistry(initial: IntrospectionProvider[] = []): ProviderRegistry {
  const providers: IntrospectionProvider[] = [...initial];

  return {
    register(provider) {
      providers.push(provider);
    },

    list() {
      return [...providers];
    },

    active() {
      return providers.filter((p) => {
        try {
          return p.detect();
        } catch {
          return false;
        }
      });
    },

    describe(el) {
      const contributed: string[] = [];
      const collected: SourceSignal[] = [];

      for (const provider of providers) {
        const signals = safeDescribe(provider, el);
        if (signals.length > 0) {
          contributed.push(provider.name);
          collected.push(...signals);
        }
      }

      const signals = mergeSignals(collected);

      return {
        signals,
        confidence: resolveConfidence(signals),
        provider: contributed.length > 0 ? contributed.join('+') : 'none',
      };
    },
  };
}

/** Kinds present in a hint, for quick assertions and formatter branching. */
export function signalKinds(hint: SourceHint): SourceSignalKind[] {
  return hint.signals.map((s) => s.kind);
}

/** First signal of a given kind, or undefined. */
export function findSignal<K extends SourceSignalKind>(
  hint: SourceHint,
  kind: K,
): Extract<SourceSignal, { kind: K }> | undefined {
  return hint.signals.find((s) => s.kind === kind) as Extract<SourceSignal, { kind: K }> | undefined;
}
