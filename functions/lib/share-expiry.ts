/** How long a published share stays readable and writable. */
export const SHARE_TTL_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Whether a share created at `createdAt` has passed its 30-day lifetime.
 *
 * Expiry is derived from the `createdAt` already stored on every blob rather
 * than a separate field, so no schema version bump is needed. The R2 lifecycle
 * rule reclaims the bytes; this check is what makes the deadline observable,
 * and it has to hold on its own when the dashboard rule is missing.
 *
 * An unparseable `createdAt` counts as expired. `validateSharedSessionBlob`
 * only requires a non-empty string, so failing closed keeps a malformed
 * timestamp from producing a share that never ages out.
 */
export function isExpired(createdAt: string, now: Date): boolean {
  const created = Date.parse(createdAt);
  if (!Number.isFinite(created)) return true;
  return now.getTime() - created >= SHARE_TTL_DAYS * DAY_MS;
}
