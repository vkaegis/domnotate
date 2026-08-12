import { describe, test, expect } from 'vitest';
import {
  createProviderRegistry,
  confidenceOf,
  resolveConfidence,
  mergeSignals,
  filterProps,
  isAllowedPropKey,
  isIdentifyingName,
  isGenericName,
  looksMinified,
  findSignal,
  signalKinds,
  type IntrospectionProvider,
} from '@/core/source-hint/provider';
import type { SourceSignal } from '@/core/source-hint/types';

function stubProvider(
  name: string,
  signals: SourceSignal[],
  detect = true,
): IntrospectionProvider {
  return { name, detect: () => detect, describe: () => signals };
}

const el = () => document.createElement('div');

describe('naming honesty', () => {
  test('looksMinified catches minifier output', () => {
    for (const name of ['a', 'Cn', 't', 'o5', 'x1', '__', '']) {
      expect(looksMinified(name), name).toBe(true);
    }
    expect(looksMinified('FeedbackCard')).toBe(false);
  });

  test('isGenericName catches library wrappers that pass the length test', () => {
    // The exact false PASS Phase 0 burned: these all score as "named components"
    // if you only test name length.
    for (const name of [
      'Styled(div)',
      'ForwardRef(Foo)',
      'Memo(Bar)',
      'ContextProvider',
      'Primitive.div',
      'AvatarPrimitive.Root',
      'Fragment',
      'Suspense',
      'ErrorBoundary',
      'Portal',
      'Slot',
      'Provider',
      'Root',
    ]) {
      expect(isGenericName(name), name).toBe(true);
      expect(isIdentifyingName(name), name).toBe(false);
    }
  });

  test('isIdentifyingName accepts real application names only', () => {
    expect(isIdentifyingName('FeedbackCard')).toBe(true);
    expect(isIdentifyingName('RecordsTable')).toBe(true);
    expect(isIdentifyingName('Cn')).toBe(false);
    expect(isIdentifyingName(null)).toBe(false);
    expect(isIdentifyingName(undefined)).toBe(false);
  });
});

describe('prop allow-list — fixed floor (§3.7)', () => {
  test('allows only the specified keys plus data-* and aria-*', () => {
    for (const key of ['id', 'name', 'variant', 'type', 'role', 'data-testid', 'aria-label']) {
      expect(isAllowedPropKey(key), key).toBe(true);
    }
    for (const key of ['customerEmail', 'feedbackBody', 'onClick', 'children', 'value', 'href']) {
      expect(isAllowedPropKey(key), key).toBe(false);
    }
  });

  test('filterProps drops everything off the list', () => {
    const out = filterProps({
      id: 'save',
      customerEmail: 'someone@example.com',
      feedbackBody: 'the app crashed when I clicked save',
      'data-testid': 'save-btn',
      'aria-label': 'Save',
      onClick: () => undefined,
      nested: { secret: 1 },
    });
    expect(out).toEqual({
      id: 'save',
      'data-testid': 'save-btn',
      'aria-label': 'Save',
    });
    expect(JSON.stringify(out)).not.toContain('someone@example.com');
    expect(JSON.stringify(out)).not.toContain('the app crashed');
  });

  test('the floor is re-applied at merge, so a provider cannot bypass it', () => {
    const rogue = stubProvider('rogue', [
      {
        kind: 'dom-attributes',
        tagName: 'div',
        // A provider constructing this by hand still cannot leak it.
        attributes: { customerEmail: 'someone@example.com', id: 'row-1' } as Record<string, string>,
      },
    ]);
    const hint = createProviderRegistry([rogue]).describe(el());
    expect(JSON.stringify(hint)).not.toContain('someone@example.com');
    expect(findSignal(hint, 'dom-attributes')?.attributes).toEqual({ id: 'row-1' });
  });
});

describe('confidence resolution', () => {
  test('only a source-location is exact', () => {
    expect(confidenceOf({ kind: 'source-location', file: 'a.tsx', line: 1 })).toBe('exact');
    expect(
      confidenceOf({
        kind: 'class-convention',
        convention: 'mui',
        component: 'Button',
        modifiers: [],
        reconstructed: '<Button>',
        grepClasses: ['MuiButton-root'],
      }),
    ).toBe('weak');
    expect(confidenceOf({ kind: 'literal-text', text: 'Save', truncated: false })).toBe('weak');
    expect(confidenceOf({ kind: 'landmark-path', path: ['main'] })).toBe('weak');
  });

  test('an own test id is strong, an ancestor test id is not', () => {
    expect(confidenceOf({ kind: 'test-id', value: 'x', attribute: 'data-testid', own: true })).toBe(
      'strong',
    );
    expect(
      confidenceOf({ kind: 'test-id', value: 'x', attribute: 'data-testid', own: false, hops: 2 }),
    ).toBe('weak');
  });

  test('a component path is strong only when it is identifying and not minified', () => {
    expect(
      confidenceOf({ kind: 'component-path', chain: ['App', 'FeedbackCard'], minified: false }),
    ).toBe('strong');
    expect(confidenceOf({ kind: 'component-path', chain: ['Cn', 't'], minified: true })).toBe('weak');
    // The Phase 0 trap: long enough to look real, says nothing.
    expect(
      confidenceOf({ kind: 'component-path', chain: ['Styled(div)', 'Primitive.div'], minified: false }),
    ).toBe('weak');
  });

  test('resolveConfidence reports the best signal present', () => {
    expect(
      resolveConfidence([
        { kind: 'literal-text', text: 'Save', truncated: false },
        { kind: 'source-location', file: 'a.tsx', line: 1 },
      ]),
    ).toBe('exact');
    expect(
      resolveConfidence([
        { kind: 'literal-text', text: 'Save', truncated: false },
        { kind: 'test-id', value: 'x', attribute: 'data-testid', own: true },
      ]),
    ).toBe('strong');
    expect(resolveConfidence([{ kind: 'landmark-path', path: ['main'] }])).toBe('weak');
    expect(resolveConfidence([])).toBe('weak');
  });
});

describe('ordered signal merge', () => {
  test('orders best-first', () => {
    const merged = mergeSignals([
      { kind: 'route', url: 'https://x.test/a', pathname: '/a' },
      { kind: 'literal-text', text: 'Save', truncated: false },
      { kind: 'source-location', file: 'a.tsx', line: 1 },
      { kind: 'test-id', value: 'x', attribute: 'data-testid', own: true },
    ]);
    expect(merged.map((s) => s.kind)).toEqual([
      'source-location',
      'test-id',
      'literal-text',
      'route',
    ]);
  });

  test('demotes a minified component path below the DOM signals', () => {
    const merged = mergeSignals([
      { kind: 'component-path', chain: ['Cn', 't'], minified: true },
      { kind: 'literal-text', text: 'Save', truncated: false },
    ]);
    expect(merged[0].kind).toBe('literal-text');
  });

  test('demotes runtime-data text below the other DOM signals', () => {
    const merged = mergeSignals([
      {
        kind: 'literal-text',
        text: 'feedback-dashboard.html',
        truncated: false,
        runtimeDataReasons: ['filename-like'],
      },
      { kind: 'landmark-path', path: ['main'] },
      { kind: 'route', url: 'https://x.test/a', pathname: '/a' },
    ]);
    expect(merged.map((s) => s.kind)).toEqual(['landmark-path', 'route', 'literal-text']);
  });

  test('deduplicates identical signals, first occurrence winning', () => {
    const merged = mergeSignals([
      { kind: 'literal-text', text: 'Save', truncated: false, from: 'own-text-nodes' },
      { kind: 'literal-text', text: 'Save', truncated: false, from: 'subtree' },
    ]);
    expect(merged).toHaveLength(1);
    expect(findSignal({ signals: merged, confidence: 'weak', provider: 'x' }, 'literal-text')?.from).toBe(
      'own-text-nodes',
    );
  });
});

describe('provider registry', () => {
  test('merges contributing providers and names them in order', () => {
    const registry = createProviderRegistry([
      stubProvider('react', [{ kind: 'source-location', file: 'a.tsx', line: 3 }]),
      stubProvider('dom', [{ kind: 'literal-text', text: 'Save', truncated: false }]),
    ]);
    const hint = registry.describe(el());
    expect(hint.provider).toBe('react+dom');
    expect(hint.confidence).toBe('exact');
    expect(signalKinds(hint)).toEqual(['source-location', 'literal-text']);
  });

  test('skips providers whose detect() is false', () => {
    const registry = createProviderRegistry([
      stubProvider('react', [{ kind: 'source-location', file: 'a.tsx', line: 3 }], false),
      stubProvider('dom', [{ kind: 'literal-text', text: 'Save', truncated: false }]),
    ]);
    const hint = registry.describe(el());
    expect(hint.provider).toBe('dom');
    expect(hint.confidence).toBe('weak');
    expect(registry.active().map((p) => p.name)).toEqual(['dom']);
  });

  test('a throwing provider does not take the floor down with it', () => {
    const boom: IntrospectionProvider = {
      name: 'boom',
      detect: () => true,
      describe: () => {
        throw new Error('fiber walk exploded');
      },
    };
    const registry = createProviderRegistry([
      boom,
      stubProvider('dom', [{ kind: 'literal-text', text: 'Save', truncated: false }]),
    ]);
    const hint = registry.describe(el());
    expect(hint.provider).toBe('dom');
    expect(hint.signals).toHaveLength(1);
  });

  test('reports provider "none" when nothing contributed', () => {
    const hint = createProviderRegistry().describe(el());
    expect(hint).toEqual({ signals: [], confidence: 'weak', provider: 'none' });
  });

  test('register() appends at lowest precedence', () => {
    const registry = createProviderRegistry([stubProvider('dom', [])]);
    registry.register(stubProvider('react', []));
    expect(registry.list().map((p) => p.name)).toEqual(['dom', 'react']);
  });
});
