// ============================================================
// Domnotate — Source hint formatting
// ============================================================
//
// Renders a `SourceHint` into the markdown block an agent actually reads
// (plan §5, Phase 2). Two shapes matter and both are built here:
//
//   [exact]  a real file and line, led with, everything else corroborating it
//   [weak]   no source identity — say so, and hand over the strings to grep
//
// The degradation is the point. §3.1a: the export is a *search brief*, not a
// coordinate, and an agent misled by a confident wrong path is worse off than
// one handed a good string to grep. So this formatter never renders a minified
// component chain as though it meant something, and never labels runtime data
// as a source literal.

import type { SignalOf, SourceHint, SourceSignal } from './types';
import { findSignal, isIdentifyingName } from './provider';

export interface FormatOptions {
  /** Ordinal prefix, e.g. `3.` — omitted when absent. */
  index?: number;
  /** The annotation text, rendered as a trailing blockquote line. */
  note?: string;
  /** Indent for detail lines. */
  indent?: string;
  /** Column at which the confidence tag is right-aligned. */
  confidenceColumn?: number;
  /** Cap on grep-class tokens rendered. */
  maxClasses?: number;
}

const DEFAULT_INDENT = '   ';
const DEFAULT_COLUMN = 60;
const DEFAULT_MAX_CLASSES = 12;

function tagLine(line: string, tag: string, column: number): string {
  const pad = Math.max(column - line.length, 2);
  return `${line}${' '.repeat(pad)}${tag}`;
}

/** Text that is runtime data is not a source literal and must not be sold as one. */
function isSourceLiteral(signal: SourceSignal | undefined): boolean {
  return signal?.kind === 'literal-text' && !signal.runtimeDataReasons?.length;
}

/**
 * The strings that would actually land somewhere if an agent grepped them,
 * best-first. `null` means the block is at the floor — see `isAtFloor`.
 *
 * Library class names are deliberately not a lead: `MuiSvgIcon-root` appears in
 * MUI's source, not in the app being searched, and the formatter does not even
 * print them. Advising a grep that resolves to nothing is the §3.1a failure
 * mode — a misleading line costs an agent more than an absent one.
 */
type Lead = 'literal-text' | 'component-name' | 'classes' | 'test-id' | 'accessible-name' | null;

function bestLead(hint: SourceHint): Lead {
  if (isSourceLiteral(findSignal(hint, 'literal-text'))) return 'literal-text';
  if (componentIsAppAuthored(hint)) return 'component-name';

  const klass = findSignal(hint, 'class-convention');
  if (klass && klass.grepClasses.length > 0 && !LIBRARY_CONVENTIONS.has(klass.convention)) {
    return 'classes';
  }

  if (findSignal(hint, 'test-id')) return 'test-id';
  if (findSignal(hint, 'accessible-name')?.name) return 'accessible-name';
  return null;
}

const LEAD_ADVICE: Record<Exclude<Lead, null>, string> = {
  'literal-text': 'grep the literal text',
  'component-name': 'grep the component name',
  classes: 'grep the class names',
  'test-id': 'grep the test id',
  'accessible-name': 'grep the accessible name',
};

/** What the agent should actually do, given what survived. */
export function grepAdvice(hint: SourceHint): string {
  const lead = bestLead(hint);
  if (lead) return LEAD_ADVICE[lead];
  return 'no greppable string recovered — use the selector and landmark path';
}

/**
 * Whether the block has no greppable string at all — an icon with no text, no
 * accessible name and no test id, where the selector is genuinely the only
 * lead. Phase 2's block 10 was this case and the tool did not say so, and an
 * agent that cannot tell the floor from a thin block settles on the nearest
 * named ancestor instead of looking inside it.
 */
export function isAtFloor(hint: SourceHint): boolean {
  if (findSignal(hint, 'source-location')) return false;
  return bestLead(hint) === null;
}

const FLOOR_LINE =
  'no distinguishing text, name, or test id — the selector is the only lead; ' +
  "find the element among its parent's children rather than settling on the parent";

/**
 * Conventions whose reconstructed name is the *library's* component, not the
 * application's. `MuiBadge-root` yields `<Badge>`, which is MUI's file, not the
 * `BetaBadge` an agent is looking for. CSS Modules and BEM are the opposite:
 * `Button_root__a1b2c` and `card__header` were written in the app's own source,
 * so the name there is a genuine grep candidate.
 */
const LIBRARY_CONVENTIONS = new Set(['mui', 'ant', 'bootstrap']);

/**
 * Whether a reconstructed component name could land on an application
 * definition. Drives the honesty line below: naming `<Badge>` in the headline
 * and then claiming nothing was recovered is a contradiction, but so is letting
 * an agent think `<Badge>` is the file to open.
 */
export function componentIsAppAuthored(hint: SourceHint): boolean {
  const klass = findSignal(hint, 'class-convention');
  if (!klass?.component) return false;
  return !LIBRARY_CONVENTIONS.has(klass.convention);
}

/** The component name, only when it is one that could land on a definition. */
export function headlineComponent(hint: SourceHint): string | null {
  const path = findSignal(hint, 'component-path');
  if (path && !path.minified) {
    const identifying = path.chain.filter(isIdentifyingName);
    if (identifying.length > 0) return identifying[identifying.length - 1];
  }

  const klass = findSignal(hint, 'class-convention');
  if (klass?.component) return klass.component;

  return null;
}

function headlineText(hint: SourceHint): { text: string; truncated: boolean } | null {
  const text: SignalOf<'literal-text'> | undefined = findSignal(hint, 'literal-text');
  const name = findSignal(hint, 'accessible-name');

  const literal = text && !text.runtimeDataReasons?.length;
  if (text && literal) return { text: text.text, truncated: text.truncated };
  if (name?.name) return { text: name.name, truncated: false };
  if (text?.text) return { text: text.text, truncated: text.truncated };
  return null;
}

function renderLandmarks(path: string[]): string {
  return path.map((entry) => `<${entry}>`).join(' > ');
}

/**
 * Render the block. Line order is deliberate: strongest evidence first, so an
 * agent that reads only the first two lines still reads the best thing known.
 */
export function formatSourceHint(hint: SourceHint, options: FormatOptions = {}): string {
  const indent = options.indent ?? DEFAULT_INDENT;
  const column = options.confidenceColumn ?? DEFAULT_COLUMN;
  const maxClasses = options.maxClasses ?? DEFAULT_MAX_CLASSES;
  const tag = `[${hint.confidence}]`;

  const source = findSignal(hint, 'source-location');
  const componentPath = findSignal(hint, 'component-path');
  const klass = findSignal(hint, 'class-convention');
  const testId = findSignal(hint, 'test-id');
  const named = findSignal(hint, 'accessible-name');
  const text = findSignal(hint, 'literal-text');
  const landmarks = findSignal(hint, 'landmark-path');
  const attrs = findSignal(hint, 'dom-attributes');
  const style = findSignal(hint, 'element-style');
  const route = findSignal(hint, 'route');

  // --- headline -------------------------------------------------
  const prefix = options.index === undefined ? '' : `${options.index}. `;
  const component = headlineComponent(hint);
  const head = headlineText(hint);
  const headText = head?.text ?? null;
  const headParts: string[] = [];
  if (component) headParts.push(`<${component}>`);
  if (head) headParts.push(`"${head.text}"${head.truncated ? '…' : ''}`);
  if (headParts.length === 0 && attrs) headParts.push(`<${attrs.tagName}>`);
  if (headParts.length === 0) headParts.push('(unidentified element)');

  const lines: string[] = [];
  const headline = `${prefix}${headParts.join(' — ')}`;
  // The confidence tag rides the line carrying the best signal.
  lines.push(source ? headline : tagLine(headline, tag, column));

  // --- source identity ------------------------------------------
  if (source) {
    const loc = `${source.file}:${source.line}${source.column === undefined ? '' : `:${source.column}`}`;
    lines.push(tagLine(`${indent}source: ${loc}`, tag, column));
  }

  // The floor line below carries the "nothing to grep" message, so the honesty
  // lines here drop their advice tail rather than duplicating it.
  const atFloor = isAtFloor(hint);
  const advice = atFloor ? '' : ` — ${grepAdvice(hint)}`;

  if (componentPath && !componentPath.minified && componentPath.chain.length > 0) {
    lines.push(`${indent}component: ${componentPath.chain.join(' > ')}`);
  } else if (componentPath) {
    // Never print `Cn > t > Kr` as though it were meaningful.
    lines.push(`${indent}component chain minified${advice}`);
  } else if (!source) {
    // The headline may already name a component reconstructed from classes, in
    // which case a bare "no component identity recovered" contradicts the line
    // directly above it — and per §3.1a a misleading line costs an agent more
    // than an absent one. Which correction to make depends on the convention:
    // `<Badge>` from `MuiBadge-root` is MUI's own component and a dead end to
    // grep, while `<Button>` from `Button_root__a1b2c` is the app's and is the
    // best lead in the block.
    if (component && !componentIsAppAuthored(hint)) {
      lines.push(`${indent}<${component}> is the library's component, not the app's`);
      if (!atFloor) lines.push(`${indent}app component not identified${advice}`);
    } else if (!component) {
      lines.push(`${indent}no component identity recovered${advice}`);
    }
  }

  if (atFloor) lines.push(`${indent}${FLOOR_LINE}`);

  // --- Tier B ----------------------------------------------------
  if (klass?.reconstructed) {
    lines.push(`${indent}element: ${klass.reconstructed} (${klass.convention} classes)`);
  }
  // Only when nothing was reconstructed from them. A recognised convention's
  // classes are library artefacts — `MuiButton-root` appears in MUI, not in
  // the app you are searching, whereas the reconstructed `variant="text"`
  // does. An unrecognised convention is the reverse: the class string was
  // written by hand and is the only grep candidate there is, so it stays.
  if (klass && !klass.reconstructed && klass.grepClasses.length > 0) {
    const shown = klass.grepClasses.slice(0, maxClasses);
    const more = klass.grepClasses.length - shown.length;
    lines.push(`${indent}classes: ${shown.join(' ')}${more > 0 ? ` (+${more} more)` : ''}`);
  }

  // --- Tier A ----------------------------------------------------
  if (testId) {
    // An ancestor's testid is not the element's identity, and on a React app it
    // is frequently not even the ancestor's own: Phase 2's block 9 followed
    // `other-users-dashboards-list` to the file that *passes* it as a prop and
    // stopped there, 14 tool calls in, one file short. The scope caveat is a
    // property of this signal rather than of the annotation (§9.4), so it rides
    // the line instead of the confidence tag.
    const where =
      testId.own === false
        ? ` (on an ancestor, ${testId.hops ?? 1} up — may be supplied by a parent)`
        : '';
    lines.push(`${indent}testid: ${testId.value}${where}`);
  }

  if (named?.role || landmarks) {
    const parts: string[] = [];
    if (named?.role) parts.push(named.role);
    if (landmarks && landmarks.path.length > 0) parts.push(`in ${renderLandmarks(landmarks.path)}`);
    if (parts.length > 0) lines.push(`${indent}role: ${parts.join(', ')}`);
  }

  if (named?.name && named.name !== headText) {
    lines.push(`${indent}name: "${named.name}"${named.from ? ` (${named.from})` : ''}`);
  }

  if (text && text.text !== headText) {
    lines.push(`${indent}text: "${text.text}"${text.truncated ? '…' : ''}`);
  }
  if (text?.runtimeDataReasons?.length) {
    lines.push(
      `${indent}text is runtime data (${text.runtimeDataReasons.join(', ')}) — it will not appear in source`,
    );
  }

  if (attrs) {
    const entries = Object.entries(attrs.attributes);
    if (entries.length > 0) {
      lines.push(`${indent}attrs: ${entries.map(([k, v]) => `${k}="${v}"`).join(' ')}`);
    }
  }

  if (style?.inlineStyle) lines.push(`${indent}style: ${style.inlineStyle}`);
  if (style && (style.rect.width > 0 || style.rect.height > 0)) {
    lines.push(
      `${indent}box: ${style.rect.width}x${style.rect.height} at (${style.rect.x}, ${style.rect.y})`,
    );
  }

  if (route) {
    lines.push(`${indent}route: ${route.pathname}${route.search ?? ''}${route.hash ?? ''}`);
  }

  if (options.note) {
    lines.push(`${indent}> ${options.note}`);
  }

  return lines.join('\n');
}
