import type { AnnotationSession } from '@/types/core';
import type { SharedSessionBlob } from '@/share/shared-session';

export function sessionFromSharedBlob(
  blob: SharedSessionBlob,
  loadedUrl: string,
): AnnotationSession {
  return {
    id: blob.id,
    shareId: blob.id,
    sourceType: blob.sourceType,
    sourceName: blob.sourceName,
    loadedUrl,
    html: blob.html,
    annotations: blob.annotations,
    createdAt: blob.createdAt,
    updatedAt: blob.updatedAt,
  };
}
