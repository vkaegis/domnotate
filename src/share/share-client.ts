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

function getPublishPayload(session: AnnotationSession): PublishShareRequest {
  if (!session.html) {
    throw new Error('Cannot publish this session because the loaded HTML is unavailable');
  }

  return {
    sourceType: session.sourceType,
    sourceName: session.sourceName,
    html: session.html,
    annotations: session.annotations,
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
    throw new Error(readErrorMessage(error));
  }

  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(message || `Share publish failed with HTTP ${response.status}`);
  }

  const data: unknown = await response.json();
  if (
    data === null ||
    typeof data !== 'object' ||
    typeof (data as { id?: unknown }).id !== 'string' ||
    (data as { id: string }).id.length === 0
  ) {
    throw new Error('Share publish returned an invalid response');
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
    throw new Error(readErrorMessage(error));
  }

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Share not found');
    }
    const message = await response.text().catch(() => response.statusText);
    throw new Error(message || `Share fetch failed with HTTP ${response.status}`);
  }

  return parseSharedSessionBlob(await response.json());
}

export async function republishAnnotations(
  id: string,
  annotations: Annotation[],
): Promise<RepublishShareResult> {
  let response: Response;
  try {
    response = await fetch(`/api/share/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ annotations }),
    });
  } catch (error) {
    throw new Error(readErrorMessage(error));
  }

  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(message || `Share update failed with HTTP ${response.status}`);
  }

  const data: unknown = await response.json();
  if (data === null || typeof data !== 'object' || (data as { ok?: unknown }).ok !== true) {
    throw new Error('Share update returned an invalid response');
  }

  return { ok: true };
}
