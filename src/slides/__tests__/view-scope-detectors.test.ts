import { describe, expect, test } from 'vitest';
import { runScopeDetection, SCOPE_DETECTORS } from '@/slides/view-scope-detectors';
import {
  makeDeckSlideDocument,
  makeExplicitScopeDocument,
  makeHashRouteDocument,
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
      confidence: 0,
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
});
