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

export function generateCssSelector(el: Element): string {
  const doc = el.ownerDocument;

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

  // 3. tag + classes
  const tag = el.tagName.toLowerCase();
  if (el.classList.length > 0) {
    const classPart = Array.from(el.classList)
      .map((c) => `.${escapeCssIdent(c)}`)
      .join('');
    const sel = `${tag}${classPart}`;
    if (isUnique(doc, sel)) return sel;
  }

  // 4. Walk up using nth-child
  const parts: string[] = [];
  let current: Element | null = el;

  while (current && current !== doc.body && current !== doc.documentElement) {
    let segment = current.tagName.toLowerCase();

    if (current.id) {
      segment = `#${escapeCssIdent(current.id)}`;
      parts.unshift(segment);
      break;
    }

    if (current.classList.length > 0) {
      segment += Array.from(current.classList)
        .map((c) => `.${escapeCssIdent(c)}`)
        .join('');
    }

    const parent: Element | null = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(
        (c: Element) => c.tagName === current!.tagName,
      );
      if (siblings.length > 1) {
        const idx = Array.from(parent.children).indexOf(current) + 1;
        segment += `:nth-child(${idx})`;
      }
    }

    parts.unshift(segment);

    // Check if current partial selector is already unique
    const candidate = parts.join(' > ');
    if (isUnique(doc, candidate)) return candidate;

    current = parent;
  }

  return parts.join(' > ');
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
