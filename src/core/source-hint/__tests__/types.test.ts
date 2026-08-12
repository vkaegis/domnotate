import { describe, test, expect } from 'vitest';
import type { SourceHint, SourceSignal, SignalConfidence } from '@/core/source-hint/types';
import type { Annotation } from '@/types/core';
import { makeAnnotation } from '@/__tests__/fixtures';

describe('source-hint types', () => {
  test('the seven signal shapes specified in plan §3.2 are constructible', () => {
    const signals: SourceSignal[] = [
      { kind: 'source-location', file: 'src/App.tsx', line: 42, column: 7 },
      { kind: 'component-path', chain: ['App', 'FeedbackCard'], minified: false },
      { kind: 'test-id', value: 'feedback-card', attribute: 'data-testid' },
      { kind: 'accessible-name', role: 'article', name: 'Sentiment breakdown' },
      { kind: 'literal-text', text: 'Sentiment breakdown', truncated: false },
      { kind: 'landmark-path', path: ['main', 'dialog'] },
      { kind: 'route', url: 'https://x.test/records/1', pathname: '/records/1' },
    ];
    expect(signals.map((s) => s.kind)).toHaveLength(7);
  });

  test('the additive Tier A/B shapes are constructible', () => {
    const signals: SourceSignal[] = [
      {
        kind: 'class-convention',
        convention: 'mui',
        component: 'Button',
        modifiers: ['outlined'],
        reconstructed: '<Button variant="outlined">',
        grepClasses: ['MuiButton-root'],
      },
      { kind: 'dom-attributes', tagName: 'button', attributes: { id: 'save' } },
      { kind: 'element-style', inlineStyle: 'display:none', rect: { x: 0, y: 0, width: 1, height: 1 } },
    ];
    expect(signals).toHaveLength(3);
  });

  test('confidence is exactly the three specified levels', () => {
    const all: SignalConfidence[] = ['exact', 'strong', 'weak'];
    expect(all).toEqual(['exact', 'strong', 'weak']);
  });

  test('Annotation.sourceHint is optional, so existing fixtures stay valid', () => {
    const without: Annotation = makeAnnotation();
    expect(without.sourceHint).toBeUndefined();

    const hint: SourceHint = { signals: [], confidence: 'weak', provider: 'none' };
    const with_: Annotation = { ...makeAnnotation(), sourceHint: hint };
    expect(with_.sourceHint?.provider).toBe('none');
  });
});
