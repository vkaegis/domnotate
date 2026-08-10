import { describe, test, expect } from 'vitest';

import { isHashClass } from '@/core/class-hash';

describe('isHashClass', () => {
  test('drops emotion and styled-components rule classes', () => {
    expect(isHashClass('css-1a2b3c')).toBe(true);
    expect(isHashClass('css-0')).toBe(true);
    expect(isHashClass('sc-bdVaJa')).toBe(true);
    expect(isHashClass('e1qtd0pd0')).toBe(true);
  });

  // Regression: MUI enables emotion's `label`, so real classes carry a suffix.
  // The first version anchored on the hash ending the string, so every MUI
  // element kept a 45-character class in its selector.
  test('drops emotion classes carrying a MUI label suffix', () => {
    expect(isHashClass('css-mmlk58-MuiButtonBase-root-MuiButton-root')).toBe(true);
    expect(isHashClass('css-gdbslw-MuiListItem-root')).toBe(true);
    expect(isHashClass('css-1lofwoo-MuiStack-root')).toBe(true);
  });

  test('keeps source-written class names, including CSS Modules', () => {
    expect(isHashClass('MuiButton-root')).toBe(false);
    expect(isHashClass('card__header--active')).toBe(false);
    expect(isHashClass('Button_root__a1b2c')).toBe(false);
    expect(isHashClass('sidebar-nav')).toBe(false);
  });

  test('keeps real words that merely start with e or end in a digit', () => {
    for (const name of ['expandable', 'elevation', 'elevation2', 'emphasis1', 'editable2']) {
      expect(isHashClass(name)).toBe(false);
    }
  });
});
