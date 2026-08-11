const SHARE_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * The share id from a route parameter, or null when it could address anything
 * other than one share object. Ids are the authorization boundary, so this is
 * the only place a request-supplied id becomes a storage key.
 */
export function getShareId(params: Record<string, string | string[]>): string | null {
  const value = params.id;
  if (typeof value !== 'string') return null;
  if (!SHARE_ID_PATTERN.test(value)) return null;
  return value;
}

export function shareObjectKey(id: string): string {
  return `share/${id}.json`;
}
