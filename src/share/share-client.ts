// ============================================================
// Domnotate — Share API Client
// ============================================================

import type { Annotation, AnnotationSession } from '@/types/core';
import type { PublishShareRequest, SharedSessionBlob } from '@/share/shared-session';
import { parseSharedSessionBlob } from '@/share/shared-session';

export interface PublishShareResult {
  id: string;
}

export interface RepublishShareResult {
  ok: true;
}

function readErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Share request failed';
}

async function readResponseText(response: Response): Promise<string> {
  return response.text().catch(() => response.statusText);
}

function mapPublishError(status: number, text: string): string {
  if (status === 413) return 'Share is over the 5 MB limit';
  if (text) return text;
  return 'Unable to publish share';
}

function mapFetchError(status: number, text: string): string {
  if (status === 404) return 'Shared link not found';
  if (status === 413) return 'Shared link is over the 5 MB limit';
  if (text) return text;
  return 'Unable to load shared link';
}

function mapUpdateError(status: number, text: string): string {
  if (status === 404) return 'Shared link not found';
  if (status === 413) return 'Annotations are over the 5 MB limit';
  if (text) return text;
  return 'Could not save changes to shared link';
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

export async function publishShare(session: AnnotationSession): Promise<PublishShareResult> {
  const payload = getPublishPayload(session);

  let response: Response;
  try {
    response = await fetch('/api/share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    throw new Error(readErrorMessage(error) || 'Unable to publish share');
  }

  if (!response.ok) {
    throw new Error(mapPublishError(response.status, await readResponseText(response)));
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
    throw new Error(mapFetchError(response.status, await readResponseText(response)));
  }

  return parseSharedSessionBlob(await response.json());
}

export async function republishAnnotations(
  id: string,
  annotations: Annotation[],
): Promise<RepublishShareResult> {
  return republishPayload(id, { annotations, edits: [] });
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

async function republishPayload(
  id: string,
  payload: { annotations: Annotation[]; edits: NonNullable<AnnotationSession['edits']> },
): Promise<RepublishShareResult> {
  let response: Response;
  try {
    response = await fetch(`/api/share/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    throw new Error(readErrorMessage(error) || 'Could not save changes to shared link');
  }

  if (!response.ok) {
    throw new Error(mapUpdateError(response.status, await readResponseText(response)));
  }

  const data: unknown = await response.json();
  if (data === null || typeof data !== 'object' || (data as { ok?: unknown }).ok !== true) {
    throw new Error('Could not save changes to shared link: invalid server response');
  }

  return { ok: true };
}
