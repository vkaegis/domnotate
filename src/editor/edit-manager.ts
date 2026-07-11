// ============================================================
// Domnotate — Edit Manager
// ============================================================
//
// CRUD for in-place text edits (agent instructions). Mirrors the annotation
// manager: mutations emit typed bus events that drive the sidebar re-render and
// auto-save. Edits are upserted by *target identity* — the (viewScope,
// cssSelector) pair (see edit-identity.ts) — so re-editing the same element
// updates one record rather than piling up duplicates, while the same selector
// in a different scope (tab/slide) is a distinct target.

import type { EditManager, ElementDescriptor, EventBus, TextEdit, ViewScope } from '@/types/core';
import { editTargetKey } from '@/editor/edit-identity';

interface CommitInput {
  element: ElementDescriptor;
  oldHtml: string;
  newHtml: string;
  oldText: string;
  newText: string;
  viewScope?: ViewScope;
}

export function createEditManager(): EditManager {
  // Keyed by target identity (viewScope + cssSelector), not by edit id.
  const store = new Map<string, TextEdit>();
  let bus: EventBus | null = null;

  function requireBus(): EventBus {
    if (!bus) throw new Error('EditManager not initialised — call init(bus) first');
    return bus;
  }

  function now(): string {
    return new Date().toISOString();
  }

  /** Find the target key of a stored edit by its id (for id-based CRUD). */
  function keyOfId(id: string): string | undefined {
    for (const [key, edit] of store) {
      if (edit.id === id) return key;
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
      const key = keyOfId(id);
      return key ? store.get(key) : undefined;
    },

    commit(input: CommitInput): TextEdit | null {
      const b = requireBus();
      const timestamp = now();
      const key = editTargetKey(input.element, input.viewScope);

      // Upsert: re-editing the same target updates the existing record so the
      // original (oldHtml/oldText) is preserved as the true "before" state.
      const existing = store.get(key);
      if (existing) {
        // Editing back to the original leaves no real change — drop the record
        // entirely rather than persisting a no-op "Original -> Original" edit.
        if (input.newHtml === existing.oldHtml && input.newText === existing.oldText) {
          store.delete(key);
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

      store.set(key, edit);
      b.emit({ type: 'edit:create', edit });
      return edit;
    },

    delete(id: string): void {
      const b = requireBus();
      const key = keyOfId(id);
      if (!key) {
        throw new Error(`Edit not found: ${id}`);
      }
      store.delete(key);
      b.emit({ type: 'edit:delete', id });
    },

    loadEdits(edits: TextEdit[]): void {
      for (const edit of edits) {
        store.set(editTargetKey(edit.element, edit.viewScope), edit);
      }
    },

    clearAll(): void {
      store.clear();
    },
  };

  return manager;
}
