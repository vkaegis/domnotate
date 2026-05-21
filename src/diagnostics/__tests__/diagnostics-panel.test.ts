import { describe, expect, test } from 'vitest';
import { isDiagnosticsEnabled } from '@/diagnostics/diagnostics-panel';

describe('isDiagnosticsEnabled', () => {
  test('returns false when ?dn-debug is absent', () => {
    expect(isDiagnosticsEnabled('')).toBe(false);
    expect(isDiagnosticsEnabled('?other=1')).toBe(false);
  });

  test('returns true when ?dn-debug is present', () => {
    expect(isDiagnosticsEnabled('?dn-debug')).toBe(true);
    expect(isDiagnosticsEnabled('?dn-debug=1')).toBe(true);
    expect(isDiagnosticsEnabled('?foo=bar&dn-debug')).toBe(true);
  });
});
