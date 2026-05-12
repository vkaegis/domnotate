import { afterEach, describe, expect, test, vi } from 'vitest';

import { makeAriaTabDocument, makeDescriptor, makeViewScope } from '@/__tests__/fixtures';
import { reanchorAnnotation } from '@/output/reanchor';

const originalXPathResult = globalThis.XPathResult;
const xpathGlobal = globalThis as unknown as { XPathResult?: typeof XPathResult };

function setDuplicatePanelContent(doc: Document): void {
  doc.getElementById('part-0')!.innerHTML = '<p class="shared" data-key="shared">Shared target</p>';
  doc.getElementById('part-1')!.innerHTML = '<p class="shared" data-key="shared">Shared target</p>';
}

afterEach(() => {
  vi.restoreAllMocks();
  if (originalXPathResult) {
    xpathGlobal.XPathResult = originalXPathResult;
  } else {
    delete xpathGlobal.XPathResult;
  }
});

describe('reanchorAnnotation', () => {
  test('queries CSS selectors inside the stored view scope before the document', () => {
    const doc = makeAriaTabDocument(0, 'hidden');
    setDuplicatePanelContent(doc);
    const scope = makeViewScope({ id: 'part-1', index: 1, selector: '#part-1' });
    const descriptor = makeDescriptor({
      cssSelector: 'p.shared',
      xpath: '//*',
      tagName: 'p',
      textPreview: 'Shared target',
    });

    const result = reanchorAnnotation(descriptor, doc, { viewScope: scope });

    expect(result?.element.parentElement?.id).toBe('part-1');
  });

  test('falls back to text matching only inside the stored view scope', () => {
    const doc = makeAriaTabDocument(0, 'hidden');
    setDuplicatePanelContent(doc);
    const scope = makeViewScope({ id: 'part-1', index: 1, selector: '#part-1' });
    const descriptor = makeDescriptor({
      cssSelector: '!!!',
      xpath: 'not valid xpath',
      tagName: 'p',
      textPreview: 'Shared target',
    });

    const result = reanchorAnnotation(descriptor, doc, { viewScope: scope });

    expect(result?.element.parentElement?.id).toBe('part-1');
  });

  test('does not fall back to the whole document when a stored scope cannot resolve', () => {
    const doc = makeAriaTabDocument(0, 'hidden');
    setDuplicatePanelContent(doc);
    const scope = makeViewScope({ id: 'missing', index: 1, selector: '#missing' });
    const descriptor = makeDescriptor({
      cssSelector: 'p.shared',
      xpath: '//*',
      tagName: 'p',
      textPreview: 'Shared target',
    });

    expect(reanchorAnnotation(descriptor, doc, { viewScope: scope })).toBeNull();
  });

  test('keeps whole-document matching for unscoped annotations', () => {
    const doc = makeAriaTabDocument(0, 'hidden');
    setDuplicatePanelContent(doc);
    const descriptor = makeDescriptor({
      cssSelector: 'p.shared',
      xpath: '//*',
      tagName: 'p',
      textPreview: 'Shared target',
    });

    const result = reanchorAnnotation(descriptor, doc);

    expect(result?.element.parentElement?.id).toBe('part-0');
  });

  test('uses the first XPath match contained by the stored view scope', () => {
    const doc = makeAriaTabDocument(0, 'hidden');
    setDuplicatePanelContent(doc);
    const nodes = Array.from(doc.querySelectorAll('[data-key="shared"]'));
    const evaluate = vi.fn(() => {
      let index = 0;
      return {
        iterateNext: () => nodes[index++] ?? null,
      };
    });
    Object.defineProperty(doc, 'evaluate', { value: evaluate, configurable: true });
    xpathGlobal.XPathResult = {
      ORDERED_NODE_ITERATOR_TYPE: 5,
    } as typeof XPathResult;

    const scope = makeViewScope({ id: 'part-1', index: 1, selector: '#part-1' });
    const descriptor = makeDescriptor({
      cssSelector: '!!!',
      xpath: '//*[@data-key="shared"]',
      tagName: 'p',
      textPreview: 'Different text',
    });

    const result = reanchorAnnotation(descriptor, doc, { viewScope: scope });

    expect(result?.element.parentElement?.id).toBe('part-1');
    expect(evaluate).toHaveBeenCalledWith(
      descriptor.xpath,
      doc,
      null,
      5,
      null,
    );
  });
});
