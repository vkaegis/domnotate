// ============================================================
// Domnotate — JSON Serialization / Deserialization
// ============================================================

import type { AnnotationSession } from '@/types/core';
import { isViewScope } from '@/types/validation';

export function serializeSession(session: AnnotationSession): string {
  return JSON.stringify(session, null, 2);
}

export function deserializeSession(json: string): AnnotationSession {
  const data: unknown = JSON.parse(json);
  if (!validateSession(data)) {
    throw new Error('Invalid session JSON: does not conform to AnnotationSession schema');
  }
  return data;
}

export function validateSession(data: unknown): data is AnnotationSession {
  if (data === null || typeof data !== 'object') return false;

  const obj = data as Record<string, unknown>;

  if (typeof obj.id !== 'string') return false;
  if (obj.sourceType !== 'file' && obj.sourceType !== 'url') return false;
  if (typeof obj.sourceName !== 'string') return false;
  if (typeof obj.loadedUrl !== 'string') return false;
  if (obj.shareId !== undefined && typeof obj.shareId !== 'string') return false;
  if (obj.html !== undefined && typeof obj.html !== 'string') return false;
  if (typeof obj.createdAt !== 'string') return false;
  if (typeof obj.updatedAt !== 'string') return false;

  if (!Array.isArray(obj.annotations)) return false;

  for (const ann of obj.annotations) {
    if (ann === null || typeof ann !== 'object') return false;
    const a = ann as Record<string, unknown>;

    if (typeof a.id !== 'string') return false;
    if (typeof a.createdAt !== 'string') return false;
    if (typeof a.updatedAt !== 'string') return false;
    if (typeof a.text !== 'string') return false;
    if (typeof a.color !== 'string') return false;
    if (a.viewScope !== undefined && !isViewScope(a.viewScope)) return false;
    if (a.slideIndex !== undefined && typeof a.slideIndex !== 'number') return false;

    // anchorPoint
    if (a.anchorPoint === null || typeof a.anchorPoint !== 'object') return false;
    const ap = a.anchorPoint as Record<string, unknown>;
    if (typeof ap.x !== 'number' || typeof ap.y !== 'number') return false;

    // element descriptor
    if (a.element === null || typeof a.element !== 'object') return false;
    const el = a.element as Record<string, unknown>;
    if (typeof el.cssSelector !== 'string') return false;
    if (typeof el.xpath !== 'string') return false;
    if (typeof el.tagName !== 'string') return false;
    if (!Array.isArray(el.classes)) return false;
    if (typeof el.textPreview !== 'string') return false;
    if (typeof el.depth !== 'number') return false;
    if (typeof el.domPath !== 'string') return false;

    // rect
    if (el.rect === null || typeof el.rect !== 'object') return false;
    const rect = el.rect as Record<string, unknown>;
    if (typeof rect.x !== 'number' || typeof rect.y !== 'number') return false;
    if (typeof rect.width !== 'number' || typeof rect.height !== 'number') return false;
  }

  return true;
}
