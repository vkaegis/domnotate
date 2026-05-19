import { describe, expect, test } from 'vitest';
import { runScopeDetection, SCOPE_DETECTORS } from '@/slides/view-scope-detectors';
import {
  makeAccordionAsPageDocument,
  makeDeckSlideDocument,
  makeExplicitScopeDocument,
  makeHashRouteDocument,
  makeMixedDashboardDocument,
  makeMultiGroupRenderedStateDocument,
  makeNonsemanticCssTabsDocument,
  makePlainDocument,
} from '@/__tests__/fixtures';

describe('view-scope detectors', () => {
  test('declares detector priority and confidence explicitly', () => {
    const detectorPlan = [...SCOPE_DETECTORS].sort((a, b) => a.priority - b.priority);

    expect(detectorPlan.map(({ id }) => id)).toEqual([
      'explicit-domnotate',
      'deck-slides',
      'active-slides',
      'aria-tabpanels',
      'radio-tabpanels',
      'hash-routes',
      'carousels',
      'wizard-steps',
      'generic-active-panels',
      'rendered-state-inference',
    ]);
    expect(detectorPlan[0]).toEqual(expect.objectContaining({
      id: 'explicit-domnotate',
      stage: 'explicit',
      confidence: 100,
    }));
    expect(detectorPlan.at(-1)).toEqual(expect.objectContaining({
      id: 'rendered-state-inference',
      stage: 'rendered-state',
      confidence: 45,
    }));
  });

  test('uses explicit Domnotate metadata before semantic slide patterns', () => {
    const doc = makeExplicitScopeDocument(0);
    const deck = makeDeckSlideDocument(2, 1).querySelector('.deck')!;
    doc.body.appendChild(doc.importNode(deck, true));

    const result = runScopeDetection({ doc, win: null });

    expect(result.source).toBe('explicit-domnotate');
    expect(result.records).toHaveLength(3);
    expect(result.records.map(({ scope }) => scope.id)).toEqual(['scope-0', 'scope-1', 'scope-2']);
    expect(result.records.every(({ scope }) => scope.selector.startsWith('[data-domnotate-scope-id='))).toBe(true);
  });

  test('prefers high-confidence deck slides over broad active slide detection', () => {
    const doc = makeDeckSlideDocument(3, 1);

    const result = runScopeDetection({ doc, win: null });

    expect(result.source).toBe('semantic-composite');
    expect(result.records).toHaveLength(3);
    expect(result.records.map(({ scope }) => scope.selector)).toEqual([
      '.deck > .slide[data-slide="0"]',
      '.deck > .slide[data-slide="1"]',
      '.deck > .slide[data-slide="2"]',
    ]);
  });

  test('keeps lower-confidence hash routes gated behind route state evidence', () => {
    const longForm = makePlainDocument(`
      <nav>
        <a href="#intro">Intro</a>
        <a href="#details">Details</a>
      </nav>
      <section id="intro"><p>Intro</p></section>
      <section id="details"><p>Details</p></section>
    `);
    const routeDoc = makeHashRouteDocument('details');

    expect(runScopeDetection({ doc: longForm, win: { location: { hash: '' } } as Window }).records).toEqual([]);
    expect(runScopeDetection({ doc: routeDoc, win: { location: { hash: '#details' } } as Window }).records)
      .toEqual([
        expect.objectContaining({ scope: expect.objectContaining({ kind: 'hash-route', id: 'overview' }) }),
        expect.objectContaining({ scope: expect.objectContaining({ kind: 'hash-route', id: 'details' }) }),
        expect.objectContaining({ scope: expect.objectContaining({ kind: 'hash-route', id: 'settings' }) }),
      ]);
  });

  test('falls back to rendered-state inference for nonsemantic CSS tabs', () => {
    const doc = makeNonsemanticCssTabsDocument(1);

    const result = runScopeDetection({ doc, win: null });

    expect(result.source).toBe('rendered-state-inference');
    expect(result.records).toHaveLength(3);
    expect(result.records.map(({ scope }) => scope.id)).toEqual(['screen-0', 'screen-1', 'screen-2']);
    expect(result.records.every(({ scope }) => scope.kind === 'active-panel')).toBe(true);
  });

  test('does not scope mixed visible dashboard regions', () => {
    const doc = makeMixedDashboardDocument();

    const result = runScopeDetection({ doc, win: null });

    expect(result.source).toBeNull();
    expect(result.records).toEqual([]);
  });

  test('infers details accordion-as-page scopes from the open attribute', () => {
    const doc = makeAccordionAsPageDocument(2);

    const result = runScopeDetection({ doc, win: null });

    expect(result.source).toBe('rendered-state-inference');
    expect(result.records).toHaveLength(3);
    expect(result.records.map(({ scope }) => scope.id)).toEqual(['page-0', 'page-1', 'page-2']);
  });

  test('detects multiple independent rendered-state groups on the same page', () => {
    const doc = makeMultiGroupRenderedStateDocument();

    const result = runScopeDetection({ doc, win: null });

    expect(result.source).toBe('rendered-state-inference');
    expect(result.records).toHaveLength(6);
    expect(result.records.map(({ scope }) => scope.id)).toEqual([
      'g0-panel-0',
      'g0-panel-1',
      'g0-panel-2',
      'g1-panel-0',
      'g1-panel-1',
      'g1-panel-2',
    ]);
  });

  test('does not scope plain long-form documents that lack hidden siblings', () => {
    const doc = makePlainDocument(`
      <main>
        <section><p>First long-form section content here</p></section>
        <section><p>Second long-form section content here</p></section>
        <section><p>Third long-form section content here</p></section>
      </main>
    `);

    const result = runScopeDetection({ doc, win: null });

    expect(result.source).toBeNull();
    expect(result.records).toEqual([]);
  });

  test('does not infer scopes from incidental hidden siblings with ids only', () => {
    const doc = makePlainDocument(`
      <main>
        <section id="article">
          <h1>Release notes</h1>
          <p>Visible long-form content that should remain globally annotatable.</p>
        </section>
        <section id="share-template" hidden>
          <p>Hidden template content that is not an alternate view.</p>
        </section>
      </main>
    `);

    const result = runScopeDetection({ doc, win: null });

    expect(result.source).toBeNull();
    expect(result.records).toEqual([]);
  });
});
