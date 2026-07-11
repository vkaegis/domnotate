import { describe, test, expect } from 'vitest';

import { editTargetKey } from '@/editor/edit-identity';
import { makeDescriptor } from '@/__tests__/fixtures';
import type { ViewScope } from '@/types/core';

const scope = (overrides: Partial<ViewScope> = {}): ViewScope => ({
  kind: 'tabpanel',
  id: 'tab-1',
  index: 0,
  selector: '#tab-1',
  ...overrides,
});

describe('editTargetKey', () => {
  test('two unscoped edits to the same selector share a key', () => {
    const el = makeDescriptor({ cssSelector: 'p.target' });
    expect(editTargetKey(el)).toBe(editTargetKey(makeDescriptor({ cssSelector: 'p.target' })));
  });

  test('same selector in different scopes yields different keys', () => {
    const el = makeDescriptor({ cssSelector: 'p.target' });
    const a = editTargetKey(el, scope({ id: 'tab-1' }));
    const b = editTargetKey(el, scope({ id: 'tab-2' }));
    expect(a).not.toBe(b);
  });

  test('same selector, same scope id yields the same key', () => {
    const el = makeDescriptor({ cssSelector: 'p.target' });
    expect(editTargetKey(el, scope({ id: 'tab-1' }))).toBe(
      editTargetKey(makeDescriptor({ cssSelector: 'p.target' }), scope({ id: 'tab-1' })),
    );
  });

  test('scoped vs unscoped are different targets', () => {
    const el = makeDescriptor({ cssSelector: 'p.target' });
    expect(editTargetKey(el)).not.toBe(editTargetKey(el, scope()));
  });

  test('falls back to kind:selector when scope has no id', () => {
    const el = makeDescriptor({ cssSelector: 'p.target' });
    const a = editTargetKey(el, scope({ id: '', kind: 'slide', selector: '.s1' }));
    const b = editTargetKey(el, scope({ id: '', kind: 'slide', selector: '.s2' }));
    expect(a).not.toBe(b);
  });

  test('a space in the selector cannot collide with a scope boundary', () => {
    // sel="a" scope-selector="b c"  vs  sel="a b" scope-selector="c"
    const k1 = editTargetKey(makeDescriptor({ cssSelector: 'a' }), scope({ id: '', kind: 'custom', selector: 'b c' }));
    const k2 = editTargetKey(makeDescriptor({ cssSelector: 'a b' }), scope({ id: '', kind: 'custom', selector: 'c' }));
    expect(k1).not.toBe(k2);
  });
});
