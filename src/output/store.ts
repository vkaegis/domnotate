// ============================================================
// Domnotate — IndexedDB Session Store via Dexie (Module 5)
// ============================================================

import Dexie from 'dexie';
import type { AnnotationSession, SessionStore } from '@/types/core';
import { serializeSession, deserializeSession } from '@/output/json-io';

class DomnotateDB extends Dexie {
  sessions!: Dexie.Table<AnnotationSession, string>;

  constructor() {
    super('DomnotateDB');
    this.version(1).stores({
      sessions: 'id, sourceName, updatedAt',
    });
  }
}

export function createSessionStore(): SessionStore {
  const db = new DomnotateDB();

  return {
    async save(session: AnnotationSession): Promise<void> {
      await db.sessions.put(session);
    },

    async load(id: string): Promise<AnnotationSession | null> {
      const session = await db.sessions.get(id);
      return session ?? null;
    },

    async listSessions(): Promise<Array<{ id: string; sourceName: string; updatedAt: string }>> {
      const all = await db.sessions.orderBy('updatedAt').reverse().toArray();
      return all.map(s => ({ id: s.id, sourceName: s.sourceName, updatedAt: s.updatedAt }));
    },

    async delete(id: string): Promise<void> {
      await db.sessions.delete(id);
    },

    exportJSON(session: AnnotationSession): string {
      return serializeSession(session);
    },

    importJSON(json: string): AnnotationSession {
      return deserializeSession(json);
    },
  };
}
