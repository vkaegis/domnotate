import type { AnnotationSession } from '@/types/core';
import type { PublishShareResult } from '@/share/share-client';

interface PublishOrCopyShareOptions {
  origin: string;
  getVerificationToken: () => Promise<string>;
  publishShare: (session: AnnotationSession, verificationToken: string) => Promise<PublishShareResult>;
  copyToClipboard: (text: string) => Promise<boolean>;
  cacheSession?: (session: AnnotationSession) => Promise<void>;
}

export interface PublishOrCopyShareResult {
  id: string;
  url: string;
  published: boolean;
}

export function getShareUrl(origin: string, id: string): string {
  return `${origin}/share/${id}`;
}

export async function publishOrCopyShare(
  session: AnnotationSession,
  options: PublishOrCopyShareOptions,
): Promise<PublishOrCopyShareResult> {
  if (session.shareId) {
    const url = getShareUrl(options.origin, session.shareId);
    const copied = await options.copyToClipboard(url);
    if (!copied) {
      throw new Error('Share link could not be copied');
    }
    return { id: session.shareId, url, published: false };
  }

  const verificationToken = await options.getVerificationToken();
  const { id } = await options.publishShare(session, verificationToken);
  session.shareId = id;
  const url = getShareUrl(options.origin, id);
  await options.cacheSession?.(session);

  const copied = await options.copyToClipboard(url);

  if (!copied) {
    throw new Error('Share created, but the link could not be copied');
  }

  return { id, url, published: true };
}
