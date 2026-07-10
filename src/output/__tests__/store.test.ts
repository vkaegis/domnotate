import 'fake-indexeddb/auto';

import { afterEach, describe, expect, test, vi } from 'vitest';
import Dexie from 'dexie';

import { makeAnnotation, makeSession, makeTextEdit } from '@/__tests__/fixtures';
import { createSessionStore } from '@/output/store';
import type { SharedSessionBlob } from '@/share/shared-session';

let dbNames: string[] = [];

function getDbName(): string {
  const name = `DomnotateTestDB-${crypto.randomUUID()}`;
  dbNames.push(name);
  return name;
}

function makeSharedBlob(overrides: Partial<SharedSessionBlob> = {}): SharedSessionBlob {
  return {
    schemaVersion: 1,
    id: 'share-123',
    sourceType: 'file',
    sourceName: 'shared.html',
    html: '<html><body>Cloud</body></html>',
    annotations: [makeAnnotation({ text: 'Cloud annotation' })],
    edits: [makeTextEdit({ newText: 'Cloud edit' })],
    createdAt: '2026-05-09T00:00:00.000Z',
    updatedAt: '2026-05-09T00:00:00.000Z',
    ...overrides,
  };
}

afterEach(async () => {
  await Promise.all(dbNames.map((name) => Dexie.delete(name)));
  dbNames = [];
});

describe('createSessionStore', () => {
  test('local save writes IndexedDB only', async () => {
    const republishAnnotations = vi.fn();
    const store = createSessionStore({
      dbName: getDbName(),
      republishAnnotations,
    });
    const session = makeSession({ annotations: [makeAnnotation()] });

    await store.save(session);

    await expect(store.load(session.id)).resolves.toEqual(session);
    expect(republishAnnotations).not.toHaveBeenCalled();
  });

  test('shared save PUTs annotations and edits, then updates the IndexedDB cache', async () => {
    const republishAnnotations = vi.fn().mockResolvedValue({ ok: true });
    const store = createSessionStore({
      dbName: getDbName(),
      republishAnnotations,
    });
    const session = makeSession({
      shareId: 'share-123',
      html: '<html></html>',
      annotations: [makeAnnotation()],
      edits: [makeTextEdit()],
    });

    await store.save(session);

    expect(republishAnnotations).toHaveBeenCalledWith('share-123', session);
    await expect(store.load(session.id)).resolves.toEqual(session);
    await expect(store.load('share-123')).resolves.toEqual(session);
  });

  test('shared save can update only the IndexedDB cache after initial publish', async () => {
    const republishAnnotations = vi.fn();
    const store = createSessionStore({
      dbName: getDbName(),
      republishAnnotations,
    });
    const session = makeSession({
      shareId: 'share-123',
      html: '<html></html>',
      annotations: [makeAnnotation()],
    });

    await store.save(session, { cacheOnly: true });

    expect(republishAnnotations).not.toHaveBeenCalled();
    await expect(store.load('share-123')).resolves.toEqual(session);
  });

  test('shared save keeps the local cache when the cloud PUT fails', async () => {
    const republishAnnotations = vi.fn().mockRejectedValue(new Error('Network offline'));
    const store = createSessionStore({
      dbName: getDbName(),
      republishAnnotations,
    });
    const session = makeSession({
      shareId: 'share-123',
      html: '<html></html>',
      annotations: [makeAnnotation()],
    });

    await expect(store.save(session)).rejects.toThrow('Network offline');
    await expect(store.load('share-123')).resolves.toEqual(session);
  });

  test('shared load prefers cloud by share id and refreshes the cache', async () => {
    const cloudBlob = makeSharedBlob();
    const fetchShare = vi.fn().mockResolvedValue(cloudBlob);
    const store = createSessionStore({
      dbName: getDbName(),
      fetchShare,
      republishAnnotations: vi.fn().mockResolvedValue({ ok: true }),
    });
    const stale = makeSession({
      id: 'local-session',
      shareId: 'share-123',
      html: '<html><body>Stale</body></html>',
      annotations: [makeAnnotation({ text: 'Stale annotation' })],
      loadedUrl: 'blob:http://localhost/stale',
    });
    await store.save(stale);

    const loaded = await store.load('share-123', { preferCloud: true });

    expect(fetchShare).toHaveBeenCalledWith('share-123');
    expect(loaded).toMatchObject({
      id: 'share-123',
      shareId: 'share-123',
      html: cloudBlob.html,
      annotations: cloudBlob.annotations,
      edits: cloudBlob.edits,
      loadedUrl: stale.loadedUrl,
    });
    await expect(store.load('share-123')).resolves.toEqual(loaded);
  });

  test('shared load falls back to IndexedDB when the cloud read fails', async () => {
    const fetchShare = vi.fn().mockRejectedValue(new Error('Network offline'));
    const store = createSessionStore({
      dbName: getDbName(),
      fetchShare,
      republishAnnotations: vi.fn().mockResolvedValue({ ok: true }),
    });
    const cached = makeSession({
      id: 'local-session',
      shareId: 'share-123',
      html: '<html><body>Cached</body></html>',
      annotations: [makeAnnotation()],
    });
    await store.save(cached);

    await expect(store.load('share-123', { preferCloud: true })).resolves.toEqual(cached);
  });
});
