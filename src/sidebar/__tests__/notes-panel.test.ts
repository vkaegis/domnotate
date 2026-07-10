import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createNotesPanel } from '@/sidebar/notes-panel';
import { createAnnotationManager } from '@/annotations/annotation-manager';
import { createEditManager } from '@/editor/edit-manager';
import { createEventBus } from '@/events';
import { makeDescriptor, makeViewScope } from '@/__tests__/fixtures';
import type { AnnotationManager, EditManager, EventBus, SlideObserver, ViewScope } from '@/types/core';

function makePicker() {
  return {
    activate: vi.fn(),
    deactivate: vi.fn(),
    isActive: vi.fn(() => false),
  };
}

function makeEditor() {
  return {
    activate: vi.fn(),
    deactivate: vi.fn(),
    isActive: vi.fn(() => false),
    revertEdit: vi.fn(() => true),
  };
}

function makeObserver(scopes: ViewScope[], activeScope: ViewScope): SlideObserver {
  return {
    init: () => undefined,
    getActiveScope: () => activeScope,
    getActiveScopes: () => [activeScope],
    getScopes: () => scopes,
    getScopeForElement: () => activeScope,
    isScopeActive: (candidate) => candidate.id === activeScope.id,
    activateScope: vi.fn(),
    getDetectionInfo: () => ({ source: null, detectors: [] }),
    destroy: () => undefined,
    getActiveSlide: () => activeScope.index,
    getSlideCount: () => scopes.length,
    goToSlide: vi.fn(),
    getSlideForElement: () => activeScope.index,
  };
}

describe('NotesPanel scope grouping', () => {
  let bus: EventBus;
  let manager: AnnotationManager;
  let editManager: EditManager;
  let container: HTMLElement;

  beforeEach(() => {
    bus = createEventBus();
    manager = createAnnotationManager();
    manager.init(bus);
    editManager = createEditManager();
    editManager.init(bus);
    container = document.createElement('div');
    document.body.innerHTML = '';
    document.body.appendChild(container);
  });

  test('groups scoped annotations by view label and keeps global numbering', () => {
    const first = makeViewScope({ kind: 'tabpanel', id: 'first', index: 0, label: 'Why now' });
    const second = makeViewScope({ kind: 'tabpanel', id: 'second', index: 1, label: 'Today' });
    const observer = makeObserver([first, second], second);

    manager.create(makeDescriptor(), { x: 0, y: 0 }, 'general');
    manager.create(makeDescriptor(), { x: 0, y: 0 }, 'first', { viewScope: first });
    manager.create(makeDescriptor(), { x: 0, y: 0 }, 'second', { viewScope: second });

    const panel = createNotesPanel(container, bus, manager, makePicker(), makeEditor(), editManager, observer);

    const headers = Array.from(container.querySelectorAll('.dn-slide-group-header'));
    expect(headers.map((header) => header.textContent)).toEqual(['General', 'Why now', 'Today']);
    expect(headers[2].classList.contains('dn-slide-group-header--active')).toBe(true);

    const pins = Array.from(container.querySelectorAll('.dn-note-pin'));
    expect(pins.map((pin) => pin.textContent)).toEqual(['1', '2', '3']);

    panel.destroy();
  });

  test('does not mark legacy slide groups active when a non-slide scope has the same index', () => {
    const slide = makeViewScope({ kind: 'slide', id: 'slide-1', index: 1, label: 'Slide 2' });
    const tab = makeViewScope({ kind: 'tabpanel', id: 'tab-1', index: 1, label: 'Tab 2' });
    const observer = makeObserver([slide, tab], tab);

    manager.create(makeDescriptor(), { x: 0, y: 0 }, 'legacy slide note', 1);

    const panel = createNotesPanel(container, bus, manager, makePicker(), makeEditor(), editManager, observer);
    const header = container.querySelector('.dn-slide-group-header') as HTMLElement;

    expect(header.textContent).toBe('Slide 2');
    expect(header.classList.contains('dn-slide-group-header--active')).toBe(false);

    panel.destroy();
  });

  test('emits annotation:select on row click and does not double-activate the scope', () => {
    const first = makeViewScope({ kind: 'tabpanel', id: 'first', index: 0, label: 'Why now' });
    const second = makeViewScope({ kind: 'tabpanel', id: 'second', index: 1, label: 'Today' });
    const observer = makeObserver([first, second], second);
    const annotation = manager.create(makeDescriptor(), { x: 0, y: 0 }, 'first', {
      viewScope: first,
    });
    const handler = vi.fn();
    bus.on('annotation:select', handler);

    const panel = createNotesPanel(container, bus, manager, makePicker(), makeEditor(), editManager, observer);
    const row = container.querySelector(`[data-annotation-id="${annotation.id}"]`) as HTMLElement;
    row.click();

    expect(handler).toHaveBeenCalledWith({ type: 'annotation:select', id: annotation.id });
    expect(observer.activateScope).not.toHaveBeenCalled();

    panel.destroy();
  });

  test('discarding a text edit reverts the preview before deleting the edit record', () => {
    const editor = makeEditor();
    const edit = editManager.commit({
      element: makeDescriptor({ cssSelector: 'p.intro' }),
      oldHtml: 'Original',
      newHtml: 'Edited',
      oldText: 'Original',
      newText: 'Edited',
    });

    const panel = createNotesPanel(container, bus, manager, makePicker(), editor, editManager);
    const deleteBtn = container.querySelector(`[data-edit-id="${edit.id}"] .dn-note-delete`) as HTMLButtonElement;

    deleteBtn.click();

    expect(editor.revertEdit).toHaveBeenCalledWith(edit);
    expect(editManager.getById(edit.id)).toBeUndefined();

    panel.destroy();
  });
});
