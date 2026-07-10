// ============================================================
// Domnotate — JSON Serialization / Deserialization
// ============================================================

import type { AnnotationSession, ElementDescriptor } from '@/types/core';
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isElementDescriptor(value: unknown): value is ElementDescriptor {
  if (!isRecord(value)) return false;
  if (typeof value.cssSelector !== 'string') return false;
  if (typeof value.xpath !== 'string') return false;
  if (typeof value.tagName !== 'string') return false;
  if (!Array.isArray(value.classes) || !value.classes.every((item) => typeof item === 'string')) {
    return false;
  }
  if (value.id !== null && typeof value.id !== 'string') return false;
  if (typeof value.textPreview !== 'string') return false;
  if (!isFiniteNumber(value.depth)) return false;
  if (typeof value.domPath !== 'string') return false;

  if (!isRecord(value.rect)) return false;
  return (
    isFiniteNumber(value.rect.x) &&
    isFiniteNumber(value.rect.y) &&
    isFiniteNumber(value.rect.width) &&
    isFiniteNumber(value.rect.height)
  );
}

export function validateSession(data: unknown): data is AnnotationSession {
  if (!isRecord(data)) return false;

  const obj = data;

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
    if (!isRecord(a.anchorPoint)) return false;
    if (!isFiniteNumber(a.anchorPoint.x) || !isFiniteNumber(a.anchorPoint.y)) return false;

    // element descriptor
    if (!isElementDescriptor(a.element)) return false;
  }

  if (obj.edits !== undefined) {
    if (!Array.isArray(obj.edits)) return false;

    for (const edit of obj.edits) {
      if (!isRecord(edit)) return false;
      if (typeof edit.id !== 'string') return false;
      if (typeof edit.oldHtml !== 'string') return false;
      if (typeof edit.newHtml !== 'string') return false;
      if (typeof edit.oldText !== 'string') return false;
      if (typeof edit.newText !== 'string') return false;
      if (typeof edit.createdAt !== 'string') return false;
      if (typeof edit.updatedAt !== 'string') return false;
      if (edit.viewScope !== undefined && !isViewScope(edit.viewScope)) return false;
      if (!isElementDescriptor(edit.element)) return false;
    }
  }

  return true;
}
