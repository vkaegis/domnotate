// ============================================================
// Domnotate — Edit Manager
// ============================================================
//
// CRUD for in-place text edits (agent instructions). Mirrors the annotation
// manager: an in-memory Map keyed by id, mutations emit typed bus events that
// drive the sidebar re-render and auto-save. Edits are upserted by element
// selector so re-editing the same element updates one record rather than
// piling up duplicates.

import type { EditManager, ElementDescriptor, EventBus, TextEdit, ViewScope } from '@/types/core';

interface CommitInput {
  element: ElementDescriptor;
  oldHtml: string;
  newHtml: string;
  oldText: string;
  newText: string;
  viewScope?: ViewScope;
}

export function createEditManager(): EditManager {
  const store = new Map<string, TextEdit>();
  let bus: EventBus | null = null;

  function requireBus(): EventBus {
    if (!bus) throw new Error('EditManager not initialised — call init(bus) first');
    return bus;
  }

  function now(): string {
    return new Date().toISOString();
  }

  function findBySelector(selector: string): TextEdit | undefined {
    for (const edit of store.values()) {
      if (edit.element.cssSelector === selector) return edit;
    }
    return undefined;
  }

  const manager: EditManager = {
    init(eventBus: EventBus): void {
      bus = eventBus;
    },

    getAll(): TextEdit[] {
      return Array.from(store.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },

    getById(id: string): TextEdit | undefined {
      return store.get(id);
    },

    commit(input: CommitInput): TextEdit | null {
      const b = requireBus();
      const timestamp = now();

      // Upsert: re-editing the same element updates the existing record so the
      // original (oldHtml/oldText) is preserved as the true "before" state.
      const existing = findBySelector(input.element.cssSelector);
      if (existing) {
        // Editing back to the original leaves no real change — drop the record
        // entirely rather than persisting a no-op "Original -> Original" edit.
        if (input.newHtml === existing.oldHtml && input.newText === existing.oldText) {
          store.delete(existing.id);
          b.emit({ type: 'edit:delete', id: existing.id });
          return null;
        }
        existing.element = input.element;
        existing.newHtml = input.newHtml;
        existing.newText = input.newText;
        if (input.viewScope !== undefined) existing.viewScope = input.viewScope;
        existing.updatedAt = timestamp;
        b.emit({ type: 'edit:update', edit: existing });
        return existing;
      }

      const edit: TextEdit = {
        id: crypto.randomUUID(),
        element: input.element,
        oldHtml: input.oldHtml,
        newHtml: input.newHtml,
        oldText: input.oldText,
        newText: input.newText,
        ...(input.viewScope !== undefined && { viewScope: input.viewScope }),
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      store.set(edit.id, edit);
      b.emit({ type: 'edit:create', edit });
      return edit;
    },

    delete(id: string): void {
      const b = requireBus();
      if (!store.has(id)) {
        throw new Error(`Edit not found: ${id}`);
      }
      store.delete(id);
      b.emit({ type: 'edit:delete', id });
    },

    loadEdits(edits: TextEdit[]): void {
      for (const edit of edits) {
        store.set(edit.id, edit);
      }
    },

    clearAll(): void {
      store.clear();
    },
  };

  return manager;
}
