// ============================================================
// Domnotate — IndexedDB Session Store via Dexie (Module 5)
// ============================================================

import Dexie from 'dexie';
import type { AnnotationSession, SessionStore } from '@/types/core';
import { serializeSession, deserializeSession } from '@/output/json-io';
import {
  deleteShare as defaultDeleteShare,
  fetchShare as defaultFetchShare,
  republishSession as defaultRepublishSession,
} from '@/share/share-client';
import { sessionFromSharedBlob } from '@/share/hydration';
import type { SharedSessionBlob } from '@/share/shared-session';

interface SessionStoreOptions {
  dbName?: string;
  fetchShare?: (id: string) => Promise<SharedSessionBlob>;
  republishAnnotations?: (id: string, session: AnnotationSession) => Promise<{ ok: true }>;
  deleteShare?: (id: string) => Promise<void>;
}

class DomnotateDB extends Dexie {
  sessions!: Dexie.Table<AnnotationSession, string>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      sessions: 'id, sourceName, updatedAt',
    });
    this.version(2).stores({
      sessions: 'id, sourceName, updatedAt, shareId',
    });
  }
}

export function createSessionStore(options: SessionStoreOptions = {}): SessionStore {
  const db = new DomnotateDB(options.dbName ?? 'DomnotateDB');
  const fetchShare = options.fetchShare ?? defaultFetchShare;
  const republishAnnotations = options.republishAnnotations ?? defaultRepublishSession;
  const deleteShare = options.deleteShare ?? defaultDeleteShare;

  async function findCachedSession(idOrShareId: string): Promise<AnnotationSession | null> {
    const direct = await db.sessions.get(idOrShareId);
    if (direct) return direct;

    const byShareId = await db.sessions.where('shareId').equals(idOrShareId).first();
    return byShareId ?? null;
  }

  async function cacheSession(session: AnnotationSession): Promise<void> {
    await db.sessions.put(session);
  }

  return {
    async save(session: AnnotationSession, saveOptions: { cacheOnly?: boolean } = {}): Promise<void> {
      if (!session.shareId || saveOptions.cacheOnly) {
        await cacheSession(session);
        return;
      }

      try {
        await republishAnnotations(session.shareId, session);
        await cacheSession(session);
      } catch (error) {
        await cacheSession(session);
        throw error;
      }
    },

    async load(id: string, loadOptions: { preferCloud?: boolean } = {}): Promise<AnnotationSession | null> {
      if (!loadOptions.preferCloud) {
        return findCachedSession(id);
      }

      const cached = await findCachedSession(id);
      try {
        const blob = await fetchShare(id);
        const session = sessionFromSharedBlob(blob, cached?.loadedUrl ?? '');
        await cacheSession(session);
        return session;
      } catch (error) {
        if (error instanceof Error && error.message === 'Shared link not found') {
          return null;
        }
        if (cached) return cached;
        throw error;
      }
    },

    async listSessions(): Promise<Array<{ id: string; sourceName: string; updatedAt: string }>> {
      const all = await db.sessions.orderBy('updatedAt').reverse().toArray();
      return all.map(s => ({ id: s.id, sourceName: s.sourceName, updatedAt: s.updatedAt }));
    },

    async delete(id: string): Promise<void> {
      const record = await findCachedSession(id);
      if (!record?.shareId) {
        await db.sessions.delete(id);
        return;
      }

      // Same posture as save(): the local row goes either way, so a failed
      // server delete never leaves the session stranded locally, and the caller
      // still hears that the shared copy is still out there.
      try {
        await deleteShare(record.shareId);
        await db.sessions.delete(record.id);
      } catch (error) {
        await db.sessions.delete(record.id);
        throw error;
      }
    },

    exportJSON(session: AnnotationSession): string {
      return serializeSession(session);
    },

    importJSON(json: string): AnnotationSession {
      return deserializeSession(json);
    },
  };
}
