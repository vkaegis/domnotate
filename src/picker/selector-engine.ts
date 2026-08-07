import type { ElementDescriptor } from '@/types/core';

// ---------------------------------------------------------------------------
// XPath generation
// ---------------------------------------------------------------------------

export function generateXPath(el: Element): string {
  // Fast path: element has an id
  if (el.id) {
    return `//*[@id="${el.id}"]`;
  }

  const segments: string[] = [];
  let current: Element | null = el;

  while (current && current !== current.ownerDocument.documentElement) {
    const parent: Element | null = current.parentElement;
    if (!parent) {
      segments.unshift(`/${current.tagName.toLowerCase()}`);
      break;
    }

    const tag = current.tagName.toLowerCase();
    const siblings = Array.from(parent.children).filter(
      (c: Element) => c.tagName === current!.tagName,
    );

    if (siblings.length === 1) {
      segments.unshift(`/${tag}`);
    } else {
      const index = siblings.indexOf(current) + 1;
      segments.unshift(`/${tag}[${index}]`);
    }

    current = parent;
  }

  return segments.join('');
}

// ---------------------------------------------------------------------------
// CSS selector generation
// ---------------------------------------------------------------------------

function isUnique(doc: Document, selector: string): boolean {
  try {
    return doc.querySelectorAll(selector).length === 1;
  } catch {
    return false;
  }
}

function escapeCssIdent(value: string): string {
  // CSS.escape is available in modern browsers
  if (typeof CSS !== 'undefined' && CSS.escape) {
    return CSS.escape(value);
  }
  return value.replace(/([^\w-])/g, '\\$1');
}

// ---------------------------------------------------------------------------
// Runtime-hash class filtering
// ---------------------------------------------------------------------------

/**
 * Classes emitted by a CSS-in-JS runtime rather than written in component
 * source. They change between builds, bloat the selector, and carry no signal
 * for anyone trying to trace the element back to the code that renders it.
 *
 * - `css-1a2b3c`  emotion / MUI generated rule class
 * - `sc-bdVaJa`   styled-components component id
 */
const HASH_CLASS = /^(?:css-[a-z0-9]+|sc-[a-zA-Z0-9]+)$/;

/**
 * emotion's "stable" class (e.g. `e1qtd0pd0`) — `e` followed by a base36 hash,
 * which in practice carries several interspersed digits.
 *
 * Two digits are required, not one. A single-digit rule keeps `expandable` and
 * `elevation` but still eats `elevation2`, `emphasis1`, `editable2` — ordinary
 * source-written classes whose only sin is a trailing number. Dropping one of
 * those costs a greppable token, which is the whole reason this filter exists,
 * so the heuristic errs toward keeping.
 */
const EMOTION_STABLE_CLASS = /^e[a-z0-9]{7,}$/;
const MIN_HASH_DIGITS = 2;

/**
 * True when a class name is purely runtime-generated and can be dropped.
 *
 * CSS Modules classes (`Button_root__a1b2c`) are deliberately *not* matched:
 * their prefix is source-derived and greppable, and a CSS selector cannot
 * refer to the prefix alone, so dropping them would lose real signal.
 */
export function isHashClass(className: string): boolean {
  if (HASH_CLASS.test(className)) return true;
  if (!EMOTION_STABLE_CLASS.test(className)) return false;
  return (className.match(/\d/g)?.length ?? 0) >= MIN_HASH_DIGITS;
}

function classSelectorPart(el: Element, filterHashes: boolean): string {
  return Array.from(el.classList)
    .filter((c) => !filterHashes || !isHashClass(c))
    .map((c) => `.${escapeCssIdent(c)}`)
    .join('');
}

/**
 * Position among *all* siblings. Used for the annotated element itself: a
 * component instantiated by several parents produces an identical
 * tag-plus-class selector at each site, and only the sibling index tells them
 * apart. Omitted when the element has no siblings, where it says nothing.
 */
function targetNthChildPart(el: Element): string {
  const parent = el.parentElement;
  if (!parent || parent.children.length < 2) return '';
  return `:nth-child(${Array.from(parent.children).indexOf(el) + 1})`;
}

/** Ancestor rule: only disambiguate when same-tag siblings exist. */
function ancestorNthChildPart(el: Element): string {
  const parent = el.parentElement;
  if (!parent) return '';
  const sameTag = Array.from(parent.children).filter((c: Element) => c.tagName === el.tagName);
  if (sameTag.length < 2) return '';
  return `:nth-child(${Array.from(parent.children).indexOf(el) + 1})`;
}

function buildCssSelector(el: Element, doc: Document, filterHashes: boolean): string {
  // 1. id
  if (el.id) {
    const sel = `#${escapeCssIdent(el.id)}`;
    if (isUnique(doc, sel)) return sel;
  }

  // 2. data-testid
  const testId = el.getAttribute('data-testid');
  if (testId) {
    const sel = `[data-testid="${testId}"]`;
    if (isUnique(doc, sel)) return sel;
  }

  // 3. tag + classes + sibling position
  const tag = el.tagName.toLowerCase();
  const classPart = classSelectorPart(el, filterHashes);
  if (classPart) {
    const sel = `${tag}${classPart}${targetNthChildPart(el)}`;
    if (isUnique(doc, sel)) return sel;
  }

  // 4. Walk up, adding one ancestor at a time until the chain is unique
  const parts: string[] = [];
  let current: Element | null = el;

  while (current && current !== doc.body && current !== doc.documentElement) {
    const isTarget = current === el;
    let segment = current.tagName.toLowerCase();

    if (current.id) {
      // Keep the tag: `aside#js-nav-sidebar` says what the element is where a
      // bare `#js-nav-sidebar` does not.
      segment += `#${escapeCssIdent(current.id)}`;
      if (isTarget) segment += targetNthChildPart(current);
    } else {
      segment += classSelectorPart(current, filterHashes);
      segment += isTarget ? targetNthChildPart(current) : ancestorNthChildPart(current);
    }

    parts.unshift(segment);

    // Check if current partial selector is already unique
    const candidate = parts.join(' > ');
    if (isUnique(doc, candidate)) return candidate;

    // Not unique yet — keep walking, even past an id, rather than returning an
    // ambiguous selector.
    current = current.parentElement;
  }

  return parts.join(' > ');
}

export function generateCssSelector(el: Element): string {
  const doc = el.ownerDocument;

  // Prefer the hash-free selector, but never at the cost of uniqueness: if
  // dropping a runtime class makes the selector ambiguous, keep the classes.
  const filtered = buildCssSelector(el, doc, true);
  if (isUnique(doc, filtered)) return filtered;

  return buildCssSelector(el, doc, false);
}

// ---------------------------------------------------------------------------
// DOM depth
// ---------------------------------------------------------------------------

function getDepth(el: Element): number {
  let depth = 0;
  let node: Element | null = el;
  while (node && node !== el.ownerDocument.body) {
    node = node.parentElement;
    depth++;
  }
  return depth;
}

// ---------------------------------------------------------------------------
// Human-readable DOM path
// ---------------------------------------------------------------------------

function getDomPath(el: Element): string {
  const parts: string[] = [];
  let current: Element | null = el;

  while (current && current !== current.ownerDocument.documentElement) {
    let segment = current.tagName.toLowerCase();

    if (current.id) {
      segment += `#${current.id}`;
    } else if (current.classList.length > 0) {
      segment += Array.from(current.classList)
        .map((c) => `.${c}`)
        .join('');
    }

    // Add nth-child when siblings share the same tag
    const parent: Element | null = current.parentElement;
    if (parent) {
      const sameTag = Array.from(parent.children).filter(
        (c: Element) => c.tagName === current!.tagName,
      );
      if (sameTag.length > 1) {
        const idx = Array.from(parent.children).indexOf(current) + 1;
        segment += `:nth-child(${idx})`;
      }
    }

    parts.unshift(segment);
    current = parent;
  }

  return parts.join(' > ');
}

// ---------------------------------------------------------------------------
// Main descriptor builder
// ---------------------------------------------------------------------------

export function generateDescriptor(el: Element): ElementDescriptor {
  const rect = el.getBoundingClientRect();
  const textContent = (el.textContent ?? '').trim();

  return {
    cssSelector: generateCssSelector(el),
    xpath: generateXPath(el),
    tagName: el.tagName.toLowerCase(),
    classes: Array.from(el.classList),
    id: el.id || null,
    textPreview: textContent.length > 80 ? textContent.slice(0, 80) : textContent,
    rect: {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    },
    depth: getDepth(el),
    domPath: getDomPath(el),
  };
}
