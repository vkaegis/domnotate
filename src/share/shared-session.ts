// ============================================================
// Domnotate — Shared Session Blob Serialization
// ============================================================

import type { Annotation } from '@/types/core';

export const SHARED_SESSION_SCHEMA_VERSION = 1;
export const MAX_SHARE_BYTES = 5 * 1024 * 1024;

export interface PublishShareRequest {
  sourceType: 'file' | 'url';
  sourceName: string;
  html: string;
  annotations: Annotation[];
}

export interface UpdateShareRequest {
  annotations: Annotation[];
}

export interface SharedSessionBlob extends PublishShareRequest {
  schemaVersion: typeof SHARED_SESSION_SCHEMA_VERSION;
  id: string;
  createdAt: string;
  updatedAt: string;
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function hasValidHtmlSize(html: string): boolean {
  return getUtf8ByteLength(html) <= MAX_SHARE_BYTES;
}

function validateAnnotation(value: unknown): value is Annotation {
  if (!isRecord(value)) return false;

  if (typeof value.id !== 'string') return false;
  if (typeof value.text !== 'string') return false;
  if (typeof value.color !== 'string') return false;
  if (typeof value.createdAt !== 'string') return false;
  if (typeof value.updatedAt !== 'string') return false;
  if (value.slideIndex !== undefined && !isFiniteNumber(value.slideIndex)) return false;

  if (!isRecord(value.anchorPoint)) return false;
  if (!isFiniteNumber(value.anchorPoint.x) || !isFiniteNumber(value.anchorPoint.y)) return false;

  if (!isRecord(value.element)) return false;
  const element = value.element;
  if (typeof element.cssSelector !== 'string') return false;
  if (typeof element.xpath !== 'string') return false;
  if (typeof element.tagName !== 'string') return false;
  if (!Array.isArray(element.classes) || !element.classes.every((item) => typeof item === 'string')) {
    return false;
  }
  if (element.id !== null && typeof element.id !== 'string') return false;
  if (typeof element.textPreview !== 'string') return false;
  if (!isFiniteNumber(element.depth)) return false;
  if (typeof element.domPath !== 'string') return false;

  if (!isRecord(element.rect)) return false;
  const rect = element.rect;
  return (
    isFiniteNumber(rect.x) &&
    isFiniteNumber(rect.y) &&
    isFiniteNumber(rect.width) &&
    isFiniteNumber(rect.height)
  );
}

export function validatePublishShareRequest(data: unknown): ValidationResult<PublishShareRequest> {
  if (!isRecord(data)) {
    return { ok: false, error: 'Request body must be an object' };
  }

  if (!hasOnlyKeys(data, ['sourceType', 'sourceName', 'html', 'annotations'])) {
    return { ok: false, error: 'Request body has unexpected fields' };
  }

  if (data.sourceType !== 'file' && data.sourceType !== 'url') {
    return { ok: false, error: 'sourceType must be "file" or "url"' };
  }

  if (typeof data.sourceName !== 'string' || data.sourceName.length === 0) {
    return { ok: false, error: 'sourceName is required' };
  }

  if (typeof data.html !== 'string' || data.html.length === 0) {
    return { ok: false, error: 'html is required' };
  }

  if (!hasValidHtmlSize(data.html)) {
    return { ok: false, error: 'Artifact HTML exceeds 5 MB' };
  }

  if (!Array.isArray(data.annotations) || !data.annotations.every(validateAnnotation)) {
    return { ok: false, error: 'annotations must be valid Annotation objects' };
  }

  return {
    ok: true,
    value: {
      sourceType: data.sourceType,
      sourceName: data.sourceName,
      html: data.html,
      annotations: data.annotations,
    },
  };
}

export function validateUpdateShareRequest(data: unknown): ValidationResult<UpdateShareRequest> {
  if (!isRecord(data)) {
    return { ok: false, error: 'Request body must be an object' };
  }

  if (!hasOnlyKeys(data, ['annotations'])) {
    return { ok: false, error: 'Request body has unexpected fields' };
  }

  if (!Array.isArray(data.annotations) || !data.annotations.every(validateAnnotation)) {
    return { ok: false, error: 'annotations must be valid Annotation objects' };
  }

  return {
    ok: true,
    value: {
      annotations: data.annotations,
    },
  };
}

export function validateSharedSessionBlob(data: unknown): ValidationResult<SharedSessionBlob> {
  if (!isRecord(data)) return { ok: false, error: 'Shared session blob must be an object' };

  if (
    !hasOnlyKeys(data, [
      'schemaVersion',
      'id',
      'sourceType',
      'sourceName',
      'html',
      'annotations',
      'createdAt',
      'updatedAt',
    ])
  ) {
    return { ok: false, error: 'Shared session blob has unexpected fields' };
  }

  const validation = validatePublishShareRequest({
    sourceType: data.sourceType,
    sourceName: data.sourceName,
    html: data.html,
    annotations: data.annotations,
  });
  if (!validation.ok) return validation;

  if (data.schemaVersion !== SHARED_SESSION_SCHEMA_VERSION) {
    return { ok: false, error: 'Unsupported shared session schema version' };
  }

  if (typeof data.id !== 'string' || data.id.length === 0) {
    return { ok: false, error: 'id is required' };
  }

  if (typeof data.createdAt !== 'string' || data.createdAt.length === 0) {
    return { ok: false, error: 'createdAt is required' };
  }

  if (typeof data.updatedAt !== 'string' || data.updatedAt.length === 0) {
    return { ok: false, error: 'updatedAt is required' };
  }

  return {
    ok: true,
    value: {
      schemaVersion: SHARED_SESSION_SCHEMA_VERSION,
      id: data.id,
      sourceType: validation.value.sourceType,
      sourceName: validation.value.sourceName,
      html: validation.value.html,
      annotations: validation.value.annotations,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    },
  };
}

export function parseSharedSessionBlob(data: unknown): SharedSessionBlob {
  const result = validateSharedSessionBlob(data);
  if (!result.ok) {
    throw new Error(`Invalid shared session: ${result.error}`);
  }
  return result.value;
}

export function serializeSharedSessionBlob(blob: SharedSessionBlob): string {
  return JSON.stringify(blob);
}

export function getUtf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}

export function createSharedSessionBlob(
  data: unknown,
  options: { id: string; now?: string },
): ValidationResult<SharedSessionBlob> {
  const validation = validatePublishShareRequest(data);
  if (!validation.ok) return validation;

  const now = options.now ?? new Date().toISOString();
  const blob: SharedSessionBlob = {
    schemaVersion: SHARED_SESSION_SCHEMA_VERSION,
    id: options.id,
    sourceType: validation.value.sourceType,
    sourceName: validation.value.sourceName,
    html: validation.value.html,
    annotations: validation.value.annotations,
    createdAt: now,
    updatedAt: now,
  };

  if (getUtf8ByteLength(serializeSharedSessionBlob(blob)) > MAX_SHARE_BYTES) {
    return { ok: false, error: 'Share payload exceeds 5 MB' };
  }

  return { ok: true, value: blob };
}
