import { describe, test, expect, vi, beforeEach } from 'vitest';
import { createEditManager } from '@/editor/edit-manager';
import { createEventBus } from '@/events';
import { makeDescriptor } from '@/__tests__/fixtures';
import type { EditManager, EventBus } from '@/types/core';

function commitInput(overrides: Partial<Parameters<EditManager['commit']>[0]> = {}) {
  return {
    element: makeDescriptor({ cssSelector: 'p.intro' }),
    oldHtml: 'Hello <em>world</em>',
    newHtml: 'Goodbye <em>world</em>',
    oldText: 'Hello world',
    newText: 'Goodbye world',
    ...overrides,
  };
}

describe('EditManager', () => {
  let bus: EventBus;
  let manager: EditManager;

  beforeEach(() => {
    bus = createEventBus();
    manager = createEditManager();
    manager.init(bus);
  });

  test('requires init(bus) before operations', () => {
    const uninitialised = createEditManager();
    expect(() => uninitialised.commit(commitInput())).toThrow('not initialised');
  });

  test('commit creates an edit and emits edit:create', () => {
    const handler = vi.fn();
    bus.on('edit:create', handler);

    const edit = manager.commit(commitInput())!;

    expect(edit.id).toBeDefined();
    expect(edit.oldText).toBe('Hello world');
    expect(edit.newText).toBe('Goodbye world');
    expect(edit.oldHtml).toBe('Hello <em>world</em>');
    expect(edit.createdAt).toBe(edit.updatedAt);
    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith({ type: 'edit:create', edit });
  });

  test('re-editing the same element upserts (no duplicate) and preserves original oldText', () => {
    const createHandler = vi.fn();
    const updateHandler = vi.fn();
    bus.on('edit:create', createHandler);
    bus.on('edit:update', updateHandler);

    const first = manager.commit(commitInput({ newText: 'First change', newHtml: 'First change' }))!;
    const second = manager.commit(commitInput({ newText: 'Second change', newHtml: 'Second change' }))!;

    expect(manager.getAll()).toHaveLength(1);
    expect(second.id).toBe(first.id);
    // Original "before" state is preserved across re-edits.
    expect(second.oldText).toBe('Hello world');
    expect(second.newText).toBe('Second change');
    expect(createHandler).toHaveBeenCalledOnce();
    expect(updateHandler).toHaveBeenCalledOnce();
  });

  test('re-editing an element back to its original removes the record (no no-op edit)', () => {
    const deleteHandler = vi.fn();
    const updateHandler = vi.fn();
    bus.on('edit:delete', deleteHandler);
    bus.on('edit:update', updateHandler);

    const first = manager.commit(commitInput({ newText: 'Changed', newHtml: 'Changed' }));
    expect(first).not.toBeNull();

    // Editing back to the original oldHtml/oldText should drop the record.
    const result = manager.commit(
      commitInput({ newText: 'Hello world', newHtml: 'Hello <em>world</em>' }),
    );

    expect(result).toBeNull();
    expect(manager.getAll()).toHaveLength(0);
    expect(manager.getById(first!.id)).toBeUndefined();
    expect(deleteHandler).toHaveBeenCalledWith({ type: 'edit:delete', id: first!.id });
    // Reverting to original must not emit a spurious update.
    expect(updateHandler).not.toHaveBeenCalled();
  });

  test('edits to distinct selectors are kept separate', () => {
    manager.commit(commitInput({ element: makeDescriptor({ cssSelector: 'p.a' }) }));
    manager.commit(commitInput({ element: makeDescriptor({ cssSelector: 'p.b' }) }));
    expect(manager.getAll()).toHaveLength(2);
  });

  test('commit stores viewScope when provided', () => {
    const edit = manager.commit(
      commitInput({ viewScope: { kind: 'tabpanel', id: 't1', index: 0, selector: '#t1' } }),
    )!;
    expect(edit.viewScope?.id).toBe('t1');
  });

  test('same selector in different scopes are kept as distinct edits', () => {
    // Regression: scoped content (tabs/slides) can carry the same selector in
    // each scope; both edits must survive rather than overwrite one another.
    const tab1 = manager.commit(
      commitInput({
        newText: 'Tab 1 change',
        newHtml: 'Tab 1 change',
        viewScope: { kind: 'tabpanel', id: 'tab-1', index: 0, selector: '#tab-1' },
      }),
    )!;
    const tab2 = manager.commit(
      commitInput({
        newText: 'Tab 2 change',
        newHtml: 'Tab 2 change',
        viewScope: { kind: 'tabpanel', id: 'tab-2', index: 1, selector: '#tab-2' },
      }),
    )!;

    expect(tab1.id).not.toBe(tab2.id);
    const all = manager.getAll();
    expect(all).toHaveLength(2);
    expect(all.map((e) => e.newText).sort()).toEqual(['Tab 1 change', 'Tab 2 change']);
    expect(all.map((e) => e.viewScope?.id).sort()).toEqual(['tab-1', 'tab-2']);
  });

  test('re-editing the same scoped target upserts in place', () => {
    const scope = { kind: 'slide' as const, id: 's1', index: 0, selector: '#s1' };
    const first = manager.commit(
      commitInput({ newText: 'First', newHtml: 'First', viewScope: scope }),
    )!;
    const second = manager.commit(
      commitInput({ newText: 'Second', newHtml: 'Second', viewScope: scope }),
    )!;
    expect(second.id).toBe(first.id);
    expect(manager.getAll()).toHaveLength(1);
    expect(second.oldText).toBe('Hello world');
  });

  test('delete removes the edit and emits edit:delete', () => {
    const handler = vi.fn();
    bus.on('edit:delete', handler);
    const edit = manager.commit(commitInput())!;

    manager.delete(edit.id);

    expect(manager.getById(edit.id)).toBeUndefined();
    expect(manager.getAll()).toHaveLength(0);
    expect(handler).toHaveBeenCalledWith({ type: 'edit:delete', id: edit.id });
  });

  test('delete throws for unknown id', () => {
    expect(() => manager.delete('nope')).toThrow('Edit not found');
  });

  test('loadEdits hydrates without emitting events; clearAll empties', () => {
    const createHandler = vi.fn();
    bus.on('edit:create', createHandler);

    const seed = manager.commit(commitInput())!;
    const snapshot = manager.getAll();
    manager.clearAll();
    expect(manager.getAll()).toHaveLength(0);

    manager.loadEdits(snapshot);
    expect(manager.getAll()).toHaveLength(1);
    expect(manager.getById(seed.id)).toBeDefined();
    // loadEdits must not re-emit create events.
    expect(createHandler).toHaveBeenCalledOnce();
  });
});
