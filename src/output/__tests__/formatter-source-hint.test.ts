// Integration: DOM provider -> registry -> formatter, on a production-shaped
// fixture. Phase 0 measured what survives a prod build (§8): no `_debugSource`,
// no own testid, minified component names, but MUI classes on 90% of elements
// and a landmark path on 100%. This asserts the export is still useful there.

import { describe, test, expect } from 'vitest';

import { createDomProvider } from '@/core/source-hint/dom-provider';
import { createProviderRegistry } from '@/core/source-hint/provider';
import { createOutputFormatter } from '@/output/formatter';
import { generateDescriptor } from '@/picker/selector-engine';
import { makeAnnotation, makeSession } from '@/__tests__/fixtures';

/** A production build: emotion hashes, no testid, no readable component name. */
const PROD_HTML = `
  <main>
    <aside id="js-nav-sidebar" aria-label="Primary navigation">
      <div class="MuiStack-root css-1a2b3c">
        <button class="MuiButtonBase-root MuiButton-root MuiButton-outlined MuiButton-colorPrimary MuiButton-sizeSmall css-77aa88"
                data-record-id="12345" style="margin-top: 2px">Save changes</button>
      </div>
    </aside>
  </main>
`;

function buildHint(el: Element) {
  const registry = createProviderRegistry([
    createDomProvider({ window: el.ownerDocument.defaultView }),
  ]);
  return registry.describe(el);
}

describe('formatter renders a source hint', () => {
  function setup() {
    document.body.innerHTML = PROD_HTML;
    const el = document.querySelector('button')!;
    const annotation = makeAnnotation({
      element: generateDescriptor(el),
      text: 'this button should be full width on mobile',
      sourceHint: buildHint(el),
    });
    return { el, annotation };
  }

  test('a production-shaped element still yields a usable brief', () => {
    const { annotation } = setup();
    const out = createOutputFormatter().toCompact(makeSession({ annotations: [annotation] }));

    // Tier B: MUI classes reconstruct the component and its variant props.
    expect(out).toContain('Button');
    expect(out).toContain('outlined');
    // The ancestor ARIA label — the eval's single most valuable discriminator.
    expect(out).toContain('Primary navigation');
    // The note the user actually wrote.
    expect(out).toContain('full width on mobile');
  });

  test('honest confidence: the DOM floor never claims an exact source location', () => {
    const { annotation } = setup();
    expect(annotation.sourceHint?.confidence).not.toBe('exact');

    const out = createOutputFormatter().toCompact(makeSession({ annotations: [annotation] }));
    expect(out).toContain('[weak]');
    // It must say it has no source address rather than implying one.
    expect(out).toMatch(/no component identity recovered|component chain minified/);
  });

  test('the selector is demoted below the hint, not dropped', () => {
    const { annotation } = setup();
    const out = createOutputFormatter().toCompact(makeSession({ annotations: [annotation] }));

    expect(out).toContain('selector:');
    // Re-anchoring still needs it, so it survives — just not in the lead.
    expect(out.indexOf('selector:')).toBeGreaterThan(out.indexOf('[weak]'));
  });

  test('output is unchanged for an annotation with no hint', () => {
    document.body.innerHTML = PROD_HTML;
    const el = document.querySelector('button')!;
    const plain = makeAnnotation({ element: generateDescriptor(el), text: 'note' });
    const out = createOutputFormatter().toCompact(makeSession({ annotations: [plain] }));

    expect(out).not.toContain('[weak]');
    expect(out).toContain('`');
  });

  test('emotion hashes are gone from the selector but the MUI classes remain', () => {
    const { annotation } = setup();
    expect(annotation.element.cssSelector).not.toContain('css-77aa88');
    expect(annotation.element.cssSelector).toContain('MuiButton-root');
  });
});
