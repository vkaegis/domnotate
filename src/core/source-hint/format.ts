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

/** What the agent should actually do, given what survived. */
export function grepAdvice(hint: SourceHint): string {
  const text = findSignal(hint, 'literal-text');
  if (isSourceLiteral(text)) return 'grep the literal text';

  const klass = findSignal(hint, 'class-convention');
  if (klass && klass.grepClasses.length > 0) return 'grep the class names';

  const testId = findSignal(hint, 'test-id');
  if (testId) return 'grep the test id';

  const name = findSignal(hint, 'accessible-name');
  if (name?.name) return 'grep the accessible name';

  return 'no greppable string recovered — use the selector and landmark path';
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

  if (componentPath && !componentPath.minified && componentPath.chain.length > 0) {
    lines.push(`${indent}component: ${componentPath.chain.join(' > ')}`);
  } else if (componentPath) {
    // Never print `Cn > t > Kr` as though it were meaningful.
    lines.push(`${indent}component chain minified — ${grepAdvice(hint)}`);
  } else if (!source) {
    lines.push(`${indent}no component identity recovered — ${grepAdvice(hint)}`);
  }

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
    const where = testId.own === false ? ` (on an ancestor, ${testId.hops ?? 1} up)` : '';
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
