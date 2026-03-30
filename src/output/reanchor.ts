// ============================================================
// Domnotate — Re-anchor Annotation to DOM (Module 5)
// ============================================================

import type { ElementDescriptor } from '@/types/core';

export function reanchorAnnotation(
  descriptor: ElementDescriptor,
  doc: Document,
): { element: Element; rect: DOMRect } | null {
  // Strategy 1: CSS selector
  try {
    const el = doc.querySelector(descriptor.cssSelector);
    if (el) {
      return { element: el, rect: el.getBoundingClientRect() };
    }
  } catch {
    // Selector may be invalid; fall through
  }

  // Strategy 2: XPath
  try {
    const result = doc.evaluate(
      descriptor.xpath,
      doc,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null,
    );
    const node = result.singleNodeValue;
    if (node && node instanceof Element) {
      return { element: node, rect: node.getBoundingClientRect() };
    }
  } catch {
    // XPath may be invalid; fall through
  }

  // Strategy 3: Text content match by tagName + textPreview
  if (descriptor.textPreview) {
    const candidates = doc.getElementsByTagName(descriptor.tagName);
    for (let i = 0; i < candidates.length; i++) {
      const el = candidates[i];
      const text = (el.textContent ?? '').trim().slice(0, 80);
      if (text === descriptor.textPreview) {
        return { element: el, rect: el.getBoundingClientRect() };
      }
    }
  }

  // All strategies exhausted
  return null;
}
