import type { ElementDescriptor } from '@/types/core';
import { isHashClass } from '@/core/class-hash';

export { isHashClass };

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
  const tag = el.tagName.toLowerCase();

  // 1. id
  //
  // Tagged, for the same reason the walk below tags an id-bearing ancestor: the
  // selector is read by an agent as much as resolved by a browser, and
  // `button#save` says what the element is where a bare `#save` does not. The
  // element's own `role:` line is not a substitute — a `div[role=button]`
  // reports the same role and is a different thing to go looking for.
  //
  // No `:nth-child` here, unlike the walk: sibling position discriminates
  // between identical instances, and a unique id means there are none.
  if (el.id) {
    const sel = `${tag}#${escapeCssIdent(el.id)}`;
    if (isUnique(doc, sel)) return sel;
  }

  // 2. data-testid — tagged for the same reason
  const testId = el.getAttribute('data-testid');
  if (testId) {
    const sel = `${tag}[data-testid="${testId}"]`;
    if (isUnique(doc, sel)) return sel;
  }

  // 3. tag + classes + sibling position
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
