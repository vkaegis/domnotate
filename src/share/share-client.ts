// ============================================================
// Domnotate — Share API Client
// ============================================================

import type { Annotation, AnnotationSession } from '@/types/core';
import type { PublishShareRequest, SharedSessionBlob } from '@/share/shared-session';
import { parseSharedSessionBlob } from '@/share/shared-session';
import { editGrants } from '@/share/edit-grant-client';

const GRANT_HEADER = 'X-Share-Edit-Grant';

/** Server codes that mean "present a grant and try again". */
const GRANT_FAILURE_CODES = new Set(['grant_required', 'grant_expired']);

export const SHARE_EXPIRED_MESSAGE = 'This shared link has expired';
export const SHARE_CONFLICT_MESSAGE =
  'Someone else saved to this shared link first. Your latest change is saved locally only.';
export const SHARE_EDIT_UNAVAILABLE_MESSAGE =
  'This server is not configured for editing shared links.';
const VERIFY_EDIT_MESSAGE = 'Verification failed. Please try editing again.';

export interface PublishShareResult {
  id: string;
}

export interface RepublishShareResult {
  ok: true;
}

/**
 * A share request that reached the server and came back refused. The `code` is
 * the server's error code, which lets callers tell a definitive answer such as
 * an expired share from a transient network failure.
 */
export class ShareRequestError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'ShareRequestError';
    this.code = code;
  }
}

function readErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Share request failed';
}

async function readResponseText(response: Response): Promise<string> {
  return response.text().catch(() => response.statusText);
}

async function readErrorCode(response: Response): Promise<string> {
  if (!response.headers.get('content-type')?.includes('application/json')) return '';
  try {
    const data: unknown = await response.clone().json();
    return data !== null && typeof data === 'object' && typeof (data as { code?: unknown }).code === 'string'
      ? (data as { code: string }).code
      : '';
  } catch {
    return '';
  }
}

function mapPublishError(status: number, code: string, text: string): string {
  if (code === 'verification_failed') return 'Verification failed. Please try sharing again.';
  if (code === 'sharing_disabled') return 'Sharing is temporarily unavailable.';
  if (status === 413) return 'Share is over the 5 MB limit';
  if (code === 'invalid_payload' || code === 'malformed_json') return 'Unable to publish share';
  if (text) return text;
  return 'Unable to publish share';
}

/** Server error codes that mean retrying or waiting will not help. */
const DEFINITIVE_UPDATE_CODES = new Set([
  'share_expired',
  'conflict',
  'sharing_disabled',
  'sharing_misconfigured',
]);

/** Whether a failed share update was refused by the server rather than undelivered. */
export function isDefinitiveShareUpdateError(error: unknown): boolean {
  return error instanceof ShareRequestError && DEFINITIVE_UPDATE_CODES.has(error.code);
}

function mapFetchError(status: number, code: string, text: string): string {
  if (code === 'share_expired' || status === 410) return SHARE_EXPIRED_MESSAGE;
  if (status === 404) return 'Shared link not found';
  if (status === 413) return 'Shared link is over the 5 MB limit';
  if (text) return text;
  return 'Unable to load shared link';
}

function mapUpdateError(status: number, code: string, text: string): string {
  if (code === 'share_expired' || status === 410) return SHARE_EXPIRED_MESSAGE;
  if (code === 'conflict' || status === 409) return SHARE_CONFLICT_MESSAGE;
  if (code === 'sharing_disabled') return 'Sharing is temporarily unavailable.';
  if (code === 'sharing_misconfigured') return SHARE_EDIT_UNAVAILABLE_MESSAGE;
  if (GRANT_FAILURE_CODES.has(code)) return VERIFY_EDIT_MESSAGE;
  if (status === 404) return 'Shared link not found';
  if (status === 413) return 'Annotations are over the 5 MB limit';
  if (text) return text;
  return 'Could not save changes to shared link';
}

function mapDeleteError(status: number, code: string, text: string): string {
  if (code === 'sharing_disabled') return 'Sharing is temporarily unavailable.';
  if (code === 'sharing_misconfigured') return SHARE_EDIT_UNAVAILABLE_MESSAGE;
  if (GRANT_FAILURE_CODES.has(code)) return VERIFY_EDIT_MESSAGE;
  if (status === 404) return 'Shared link not found';
  if (text) return text;
  return 'Could not delete the shared link';
}

function getPublishPayload(session: AnnotationSession): PublishShareRequest {
  if (!session.html) {
    throw new Error('Unable to publish share: page HTML is unavailable');
  }

  return {
    sourceType: session.sourceType,
    sourceName: session.sourceName,
    html: session.html,
    annotations: session.annotations,
    edits: session.edits ?? [],
  };
}

export async function publishShare(
  session: AnnotationSession,
  verificationToken: string,
): Promise<PublishShareResult> {
  const payload = getPublishPayload(session);

  let response: Response;
  try {
    response = await fetch('/api/share', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Abuse-Verification-Token': verificationToken,
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    throw new Error(readErrorMessage(error) || 'Unable to publish share');
  }

  if (!response.ok) {
    const code = await readErrorCode(response);
    throw new ShareRequestError(
      mapPublishError(response.status, code, await readResponseText(response)),
      code,
    );
  }

  const data: unknown = await response.json();
  if (
    data === null ||
    typeof data !== 'object' ||
    typeof (data as { id?: unknown }).id !== 'string' ||
    (data as { id: string }).id.length === 0
  ) {
    throw new Error('Unable to publish share: invalid server response');
  }

  return { id: (data as { id: string }).id };
}

export async function fetchShare(id: string): Promise<SharedSessionBlob> {
  let response: Response;
  try {
    response = await fetch(`/api/share/${encodeURIComponent(id)}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
  } catch (error) {
    throw new Error(readErrorMessage(error) || 'Unable to load shared link');
  }

  if (!response.ok) {
    const code = await readErrorCode(response);
    throw new ShareRequestError(
      mapFetchError(response.status, code, await readResponseText(response)),
      code,
    );
  }

  return parseSharedSessionBlob(await response.json());
}

/**
 * Removes a shared link's stored copy. Anyone holding the link can do this, the
 * same as editing it. Succeeds when the share is already gone.
 */
export async function deleteShare(id: string): Promise<void> {
  const response = await sendGranted(
    id,
    { method: 'DELETE' },
    'Could not delete the shared link',
  );

  if (!response.ok) {
    const code = await readErrorCode(response);
    throw new ShareRequestError(
      mapDeleteError(response.status, code, await readResponseText(response)),
      code,
    );
  }
}

export async function republishAnnotations(
  id: string,
  annotations: Annotation[],
): Promise<RepublishShareResult> {
  return republishPayload(id, { annotations });
}

export async function republishSession(
  id: string,
  session: AnnotationSession,
): Promise<RepublishShareResult> {
  return republishPayload(id, {
    annotations: session.annotations,
    edits: session.edits ?? [],
  });
}

interface GrantedRequest {
  method: 'PUT' | 'DELETE';
  body?: string;
}

async function sendWrite(
  id: string,
  request: GrantedRequest,
  grant: string | null,
  fallbackMessage: string,
): Promise<Response> {
  try {
    return await fetch(`/api/share/${encodeURIComponent(id)}`, {
      method: request.method,
      headers: {
        ...(request.body !== undefined && { 'Content-Type': 'application/json' }),
        ...(grant && { [GRANT_HEADER]: grant }),
      },
      ...(request.body !== undefined && { body: request.body }),
    });
  } catch (error) {
    throw new Error(readErrorMessage(error) || fallbackMessage);
  }
}

/**
 * Sends a write with whatever grant this browser already holds. A grant is only
 * obtained when the server actually asks for one, so the challenge happens on
 * the first write to a share rather than on every page that might write.
 */
async function sendGranted(
  id: string,
  request: GrantedRequest,
  fallbackMessage: string,
): Promise<Response> {
  const sent = editGrants.peek(id);
  const response = await sendWrite(id, request, sent, fallbackMessage);
  if (response.status !== 401) return response;

  const code = await readErrorCode(response);
  if (!GRANT_FAILURE_CODES.has(code)) return response;

  // Exactly one challenge-and-retry. A server that keeps refusing the grant it
  // just issued surfaces as an error rather than an endless challenge loop.
  // Only the grant this request actually sent is discarded: autosave writes are
  // concurrent, and a late rejection must not throw away a newer grant.
  if (sent !== null) editGrants.invalidate(id, sent);
  return sendWrite(id, request, await editGrants.acquire(id), fallbackMessage);
}

async function republishPayload(
  id: string,
  payload: { annotations: Annotation[]; edits?: NonNullable<AnnotationSession['edits']> },
): Promise<RepublishShareResult> {
  const body = JSON.stringify(payload);
  const request: GrantedRequest = { method: 'PUT', body };
  const fallback = 'Could not save changes to shared link';
  let response = await sendGranted(id, request, fallback);

  // 409 means another write landed between the server's read and its write. The
  // payload is the whole local annotation set, so replaying it as-is against a
  // fresh server-side read is the resolution. Exactly one retry, never a loop.
  if (response.status === 409) {
    response = await sendGranted(id, request, fallback);
  }

  if (!response.ok) {
    const code = await readErrorCode(response);
    throw new ShareRequestError(
      mapUpdateError(response.status, code, await readResponseText(response)),
      code,
    );
  }

  const data: unknown = await response.json();
  if (data === null || typeof data !== 'object' || (data as { ok?: unknown }).ok !== true) {
    throw new Error('Could not save changes to shared link: invalid server response');
  }

  return { ok: true };
}
