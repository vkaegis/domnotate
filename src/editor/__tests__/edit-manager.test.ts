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

    const edit = manager.commit(commitInput());

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

    const first = manager.commit(commitInput({ newText: 'First change', newHtml: 'First change' }));
    const second = manager.commit(commitInput({ newText: 'Second change', newHtml: 'Second change' }));

    expect(manager.getAll()).toHaveLength(1);
    expect(second.id).toBe(first.id);
    // Original "before" state is preserved across re-edits.
    expect(second.oldText).toBe('Hello world');
    expect(second.newText).toBe('Second change');
    expect(createHandler).toHaveBeenCalledOnce();
    expect(updateHandler).toHaveBeenCalledOnce();
  });

  test('edits to distinct selectors are kept separate', () => {
    manager.commit(commitInput({ element: makeDescriptor({ cssSelector: 'p.a' }) }));
    manager.commit(commitInput({ element: makeDescriptor({ cssSelector: 'p.b' }) }));
    expect(manager.getAll()).toHaveLength(2);
  });

  test('commit stores viewScope when provided', () => {
    const edit = manager.commit(
      commitInput({ viewScope: { kind: 'tabpanel', id: 't1', index: 0, selector: '#t1' } }),
    );
    expect(edit.viewScope?.id).toBe('t1');
  });

  test('delete removes the edit and emits edit:delete', () => {
    const handler = vi.fn();
    bus.on('edit:delete', handler);
    const edit = manager.commit(commitInput());

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

    const seed = manager.commit(commitInput());
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
