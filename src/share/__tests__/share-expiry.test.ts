import { describe, expect, test } from 'vitest';

import { SHARE_TTL_DAYS, isExpired } from '../../../functions/lib/share-expiry';

const DAY_MS = 24 * 60 * 60 * 1000;
const CREATED_AT = '2026-05-09T00:00:00.000Z';

function daysAfterCreation(days: number, offsetMs = 0): Date {
  return new Date(Date.parse(CREATED_AT) + days * DAY_MS + offsetMs);
}

describe('isExpired', () => {
  test('a share created just now is live', () => {
    expect(isExpired(CREATED_AT, new Date(CREATED_AT))).toBe(false);
  });

  test('a share one millisecond short of the TTL is still live', () => {
    expect(isExpired(CREATED_AT, daysAfterCreation(SHARE_TTL_DAYS, -1))).toBe(false);
  });

  test('a share at exactly the TTL boundary is expired', () => {
    expect(isExpired(CREATED_AT, daysAfterCreation(SHARE_TTL_DAYS))).toBe(true);
  });

  test('a share past the TTL is expired', () => {
    expect(isExpired(CREATED_AT, daysAfterCreation(SHARE_TTL_DAYS + 1))).toBe(true);
  });

  test('the TTL is 30 days', () => {
    expect(SHARE_TTL_DAYS).toBe(30);
  });

  test('an unparseable createdAt counts as expired so it cannot outlive the TTL', () => {
    expect(isExpired('not a date', new Date(CREATED_AT))).toBe(true);
    expect(isExpired('', new Date(CREATED_AT))).toBe(true);
  });

  test('a createdAt in the future is not treated as expired', () => {
    expect(isExpired(CREATED_AT, daysAfterCreation(-1))).toBe(false);
  });
});
