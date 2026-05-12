// ============================================================
// Domnotate — Re-anchor Annotation to DOM (Module 5)
// ============================================================

import { resolveViewScopeRoot } from '@/annotations/view-scope';
import type { ElementDescriptor, ViewScope } from '@/types/core';

type ReanchorOptions = {
  viewScope?: ViewScope | null;
  scopeRoot?: ParentNode | null;
};

function isElement(node: Node | null): node is Element {
  return node?.nodeType === Node.ELEMENT_NODE;
}

function rootContains(root: ParentNode, el: Element): boolean {
  if (root instanceof Document) return true;
  if (isElement(root as Node)) return root === el || root.contains(el);
  return Array.from(root.querySelectorAll('*')).includes(el);
}

function querySelectorInRoot(root: ParentNode, selector: string): Element | null {
  if (isElement(root as Node)) {
    try {
      if ((root as Element).matches(selector)) return root as Element;
    } catch {
      return null;
    }
  }

  try {
    return root.querySelector(selector);
  } catch {
    return null;
  }
}

function evaluateXPathInRoot(
  descriptor: ElementDescriptor,
  doc: Document,
  root: ParentNode,
): Element | null {
  if (!doc.evaluate) return null;

  const xpathResult = doc.defaultView?.XPathResult ?? globalThis.XPathResult;
  if (!xpathResult) return null;

  try {
    const result = doc.evaluate(
      descriptor.xpath,
      doc,
      null,
      xpathResult.ORDERED_NODE_ITERATOR_TYPE,
      null,
    );

    let node = result.iterateNext();
    while (node) {
      if (isElement(node) && rootContains(root, node)) return node;
      node = result.iterateNext();
    }
  } catch {
    // XPath may be invalid; fall through
  }

  return null;
}

function getTextCandidates(root: ParentNode, tagName: string): Element[] {
  const tag = tagName.toLowerCase();

  if (root instanceof Document) {
    return Array.from(root.getElementsByTagName(tag));
  }

  const candidates: Element[] = [];
  if (isElement(root as Node) && (root as Element).tagName.toLowerCase() === tag) {
    candidates.push(root as Element);
  }
  candidates.push(...Array.from(root.querySelectorAll(tag)));
  return candidates;
}

function getSearchRoot(doc: Document, options: ReanchorOptions | undefined): ParentNode | null {
  if (options?.scopeRoot) return options.scopeRoot;
  if (options && options.viewScope !== undefined) {
    return options.viewScope ? resolveViewScopeRoot(doc, options.viewScope) : null;
  }
  return doc;
}

export function reanchorAnnotation(
  descriptor: ElementDescriptor,
  doc: Document,
  options?: ReanchorOptions,
): { element: Element; rect: DOMRect } | null {
  const searchRoot = getSearchRoot(doc, options);
  if (!searchRoot) return null;

  // Strategy 1: CSS selector
  const selectorMatch = querySelectorInRoot(searchRoot, descriptor.cssSelector);
  if (selectorMatch) {
    return { element: selectorMatch, rect: selectorMatch.getBoundingClientRect() };
  }

  // Strategy 2: XPath
  const xpathMatch = evaluateXPathInRoot(descriptor, doc, searchRoot);
  if (xpathMatch) {
    return { element: xpathMatch, rect: xpathMatch.getBoundingClientRect() };
  }

  // Strategy 3: Text content match by tagName + textPreview
  if (descriptor.textPreview) {
    const candidates = getTextCandidates(searchRoot, descriptor.tagName);
    for (const el of candidates) {
      const text = (el.textContent ?? '').trim().slice(0, 80);
      if (text === descriptor.textPreview) {
        return { element: el, rect: el.getBoundingClientRect() };
      }
    }
  }

  // All strategies exhausted
  return null;
}
