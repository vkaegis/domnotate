// ============================================================
// Domnotate — Source Hint types
// ============================================================
//
// A `SourceHint` is the *second* descriptor (plan §3.2). `ElementDescriptor`
// re-anchors a pin inside this session; a `SourceHint` tells an agent which
// code to change. On a static HTML file those coincide. On a production React
// app they share nothing, so this structure exists alongside — never instead of
// — `ElementDescriptor`.
//
// Governing constraint (§3.1a): the tool must work on production apps exactly
// as they ship. Phase 0 measured `_debugSource` at 0% and identifying component
// names at 20% (mostly false positives) on a real production build, so
// file-and-line localisation is not available and the hint is a **search
// brief**, not a coordinate. Everything below is chosen because it survives a
// production build: it is simply what is on screen.

/**
 * How much an emitted signal can be trusted.
 *
 * This is a correctness property, not polish (§3.3). An agent handed a
 * confident-but-wrong path is worse off than one handed three strings to grep,
 * so `exact` is reserved for a real file-and-line and nothing else may claim it.
 */
export type SignalConfidence = 'exact' | 'strong' | 'weak';

/** Element geometry at capture time. A cheap discriminator between look-alike siblings. */
export interface SignalRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * One piece of evidence about where an element came from.
 *
 * The first seven variants are the shapes specified in plan §3.2. The last
 * three are additive: Phase 0/0b measured them as the highest-value signals
 * that actually survive production, and they had no home in the original union.
 */
export type SourceSignal =
  /** File and line. Only ever available on instrumented or dev builds. */
  | { kind: 'source-location'; file: string; line: number; column?: number }
  /**
   * Ancestor component names, nearest-last. `minified: true` means the names
   * are minifier output or generic library wrappers (`Styled(div)`,
   * `Primitive.div`) and must not be presented as meaningful.
   */
  | { kind: 'component-path'; chain: string[]; minified: boolean }
  /** A test hook. `own: false` means it was found on an ancestor, so it only narrows. */
  | { kind: 'test-id'; value: string; attribute: string; own?: boolean; hops?: number }
  /** Approximate accessible name plus resolved role. */
  | { kind: 'accessible-name'; role: string | null; name: string; from?: string }
  /**
   * Visible text. `runtimeDataReasons` is the runtime-data split: text that is
   * clearly data (`Vineet Kumar`, `feedback-dashboard.html`) will never appear
   * in source, and saying so is the difference between a lead and a dead end.
   */
  | {
      kind: 'literal-text';
      text: string;
      truncated: boolean;
      from?: string;
      runtimeDataReasons?: string[];
    }
  /**
   * Landmark ancestry, outermost-first, including ancestor `aria-label`
   * (`aside("Primary navigation")`). Evidence-backed in §8 Phase 0b as the
   * single highest-value production-available signal.
   */
  | { kind: 'landmark-path'; path: string[] }
  /** Route at capture time. */
  | { kind: 'route'; url: string; pathname: string; search?: string; hash?: string }
  /**
   * Tier B. Class strings are written literally in component source, so
   * whatever survives hash filtering is a grep candidate — `grepClasses` is
   * populated whether or not the convention was recognised.
   */
  | {
      kind: 'class-convention';
      convention: string;
      component: string | null;
      modifiers: string[];
      /** e.g. `<Button variant="outlined" color="primary">`, or null when unrecoverable. */
      reconstructed: string | null;
      grepClasses: string[];
    }
  /** Semantic tag plus allow-listed attributes only (§3.7 fixed floor). */
  | { kind: 'dom-attributes'; tagName: string; attributes: Record<string, string> }
  /** Inline style and geometry. */
  | { kind: 'element-style'; inlineStyle: string | null; rect: SignalRect };

export type SourceSignalKind = SourceSignal['kind'];

export interface SourceHint {
  /** Ordered best-first. */
  signals: SourceSignal[];
  /** Confidence of the *best* signal present. */
  confidence: SignalConfidence;
  /** Which introspection provider produced this, e.g. 'react' | 'dom' | 'none'. */
  provider: string;
}

/** Narrow a signal union member by kind. */
export type SignalOf<K extends SourceSignalKind> = Extract<SourceSignal, { kind: K }>;
