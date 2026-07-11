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
    })!;

    const panel = createNotesPanel(container, bus, manager, makePicker(), editor, editManager);
    const deleteBtn = container.querySelector(`[data-edit-id="${edit.id}"] .dn-note-delete`) as HTMLButtonElement;

    deleteBtn.click();

    expect(editor.revertEdit).toHaveBeenCalledWith(edit);
    expect(editManager.getById(edit.id)).toBeUndefined();

    panel.destroy();
  });

  test('discarding a text edit reverts the DOM and drops the record without touching annotation previews', () => {
    const editor = makeEditor();
    const selector = 'p.intro';
    // An annotation on the edited element. Its preview is derived from the live
    // DOM at serialize time, so discard must not eagerly mutate it here.
    const annotation = manager.create(
      makeDescriptor({ cssSelector: selector, textPreview: 'Edited' }),
      { x: 0, y: 0 },
      'note on edited element',
    );
    const edit = editManager.commit({
      element: makeDescriptor({ cssSelector: selector }),
      oldHtml: 'Original',
      newHtml: 'Edited',
      oldText: 'Original',
      newText: 'Edited',
    })!;

    const panel = createNotesPanel(container, bus, manager, makePicker(), editor, editManager);
    const deleteBtn = container.querySelector(
      `[data-edit-id="${edit.id}"] .dn-note-delete`,
    ) as HTMLButtonElement;

    deleteBtn.click();

    // The live DOM is reverted and the record dropped; the annotation preview is
    // left as-is (refreshed from the DOM only at export/share time).
    expect(editor.revertEdit).toHaveBeenCalledWith(edit);
    expect(editManager.getById(edit.id)).toBeUndefined();
    expect(manager.getById(annotation.id)!.element.textPreview).toBe('Edited');

    panel.destroy();
  });
});

describe('NotesPanel overflow menu', () => {
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

  function btnByLabel(root: ParentNode, label: string): HTMLButtonElement | undefined {
    return Array.from(root.querySelectorAll<HTMLButtonElement>('.dn-action-btn')).find(
      (b) => b.querySelector('.dn-action-btn__label')?.textContent === label,
    );
  }

  test('Hide Pins, Download, and Clear live in a closed overflow menu, not the main bar', () => {
    const panel = createNotesPanel(container, bus, manager, makePicker(), makeEditor(), editManager);

    const tabBar = container.querySelector('.dn-tab-bar') as HTMLElement;
    const menu = container.querySelector('.dn-overflow__menu') as HTMLElement;

    // Main bar keeps the primary actions in order.
    const directLabels = Array.from(tabBar.children)
      .filter((c) => c.classList.contains('dn-action-btn'))
      .map((c) => c.querySelector('.dn-action-btn__label')?.textContent);
    expect(directLabels).toEqual(['Annotate', 'Edit Text', 'Copy', 'Share']);

    // The overflow trigger is the last item in the bar.
    expect(btnByLabel(tabBar, 'More')).toBeTruthy();

    // Secondary actions are inside the menu, which is hidden by default.
    expect(menu.hidden).toBe(true);
    const menuLabels = Array.from(menu.querySelectorAll('.dn-action-btn')).map(
      (b) => b.querySelector('.dn-action-btn__label')?.textContent,
    );
    expect(menuLabels).toEqual(['Hide Pins', 'Download', 'Clear']);

    panel.destroy();
  });

  test('clicking More toggles the menu open and closed', () => {
    const panel = createNotesPanel(container, bus, manager, makePicker(), makeEditor(), editManager);
    const trigger = container.querySelector('.dn-overflow__trigger') as HTMLButtonElement;
    const menu = container.querySelector('.dn-overflow__menu') as HTMLElement;

    trigger.click();
    expect(menu.hidden).toBe(false);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');

    trigger.click();
    expect(menu.hidden).toBe(true);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    panel.destroy();
  });

  test('the overflow is a labelled disclosure, not an ARIA menu', () => {
    const panel = createNotesPanel(container, bus, manager, makePicker(), makeEditor(), editManager);
    const trigger = container.querySelector('.dn-overflow__trigger') as HTMLButtonElement;
    const menu = container.querySelector('.dn-overflow__menu') as HTMLElement;

    // Trigger is a disclosure button wired to the group it controls.
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(trigger.getAttribute('aria-haspopup')).toBeNull();
    expect(trigger.getAttribute('aria-controls')).toBe(menu.id);
    expect(menu.id).toBeTruthy();

    // Revealed container is a labelled group of ordinary buttons, not a menu.
    expect(menu.getAttribute('role')).toBe('group');
    expect(menu.getAttribute('aria-label')).toBeTruthy();
    expect(menu.querySelector('[role="menu"], [role="menuitem"]')).toBeNull();
    for (const btn of menu.querySelectorAll('.dn-action-btn')) {
      expect(btn.tagName).toBe('BUTTON');
      expect(btn.getAttribute('role')).toBeNull();
    }

    panel.destroy();
  });

  test('each panel wires its trigger to its own overflow group id', () => {
    const first = createNotesPanel(container, bus, manager, makePicker(), makeEditor(), editManager);
    const second = createNotesPanel(container, bus, manager, makePicker(), makeEditor(), editManager);

    const triggers = container.querySelectorAll('.dn-overflow__trigger');
    const menus = container.querySelectorAll('.dn-overflow__menu');
    const ids = Array.from(menus).map((m) => m.id);

    // Ids are unique, and each trigger controls a distinct group.
    expect(new Set(ids).size).toBe(2);
    expect(triggers[0].getAttribute('aria-controls')).toBe(menus[0].id);
    expect(triggers[1].getAttribute('aria-controls')).toBe(menus[1].id);

    first.destroy();
    second.destroy();
  });

  test('selecting Download emits the download event and closes the menu', () => {
    // Seed a note so the secondary actions are enabled.
    manager.create(makeDescriptor(), { x: 0, y: 0 }, 'a note');
    const panel = createNotesPanel(container, bus, manager, makePicker(), makeEditor(), editManager);
    const trigger = container.querySelector('.dn-overflow__trigger') as HTMLButtonElement;
    const menu = container.querySelector('.dn-overflow__menu') as HTMLElement;
    const handler = vi.fn();
    bus.on('output:download', handler);

    trigger.click();
    btnByLabel(menu, 'Download')!.click();

    expect(handler).toHaveBeenCalledWith({ type: 'output:download', format: 'json' });
    expect(menu.hidden).toBe(true);

    panel.destroy();
  });

  test('an empty session disables the menu actions with a tooltip, and their clicks are inert', () => {
    const panel = createNotesPanel(container, bus, manager, makePicker(), makeEditor(), editManager);
    const trigger = container.querySelector('.dn-overflow__trigger') as HTMLButtonElement;
    const menu = container.querySelector('.dn-overflow__menu') as HTMLElement;
    const cleared = vi.fn();
    bus.on('session:cleared', cleared);

    trigger.click();

    // Every disabled action must carry an explanatory tooltip.
    for (const label of ['Hide Pins', 'Download', 'Clear']) {
      const btn = btnByLabel(menu, label)!;
      expect(btn.getAttribute('aria-disabled')).toBe('true');
      expect(btn.dataset.tooltip!.length).toBeGreaterThan(0);
      expect(btn.dataset.tooltip).not.toBe(btn.dataset.baseLabel);
      // The tooltip text is also the accessible name.
      expect(btn.getAttribute('aria-label')).toBe(btn.dataset.tooltip);
    }

    // Clicking a disabled action does nothing and leaves the menu open.
    btnByLabel(menu, 'Clear')!.click();
    expect(cleared).not.toHaveBeenCalled();
    expect(menu.hidden).toBe(false);

    panel.destroy();
  });

  test('enabled actions carry no tooltip once a note exists', () => {
    manager.create(makeDescriptor(), { x: 0, y: 0 }, 'a note');
    const panel = createNotesPanel(container, bus, manager, makePicker(), makeEditor(), editManager);
    const tabBar = container.querySelector('.dn-tab-bar') as HTMLElement;
    const menu = container.querySelector('.dn-overflow__menu') as HTMLElement;

    const buttons = [
      btnByLabel(tabBar, 'Copy')!,
      btnByLabel(menu, 'Hide Pins')!,
      btnByLabel(menu, 'Download')!,
      btnByLabel(menu, 'Clear')!,
    ];
    for (const btn of buttons) {
      expect(btn.getAttribute('aria-disabled')).toBeNull();
      expect(btn.classList.contains('dn-action-btn--dimmed')).toBe(false);
      // Self-explanatory labels: no visual tooltip while enabled.
      expect(btn.dataset.tooltip).toBeUndefined();
      // Accessible name is still present for assistive tech.
      expect(btn.getAttribute('aria-label')).toBe(btn.dataset.baseLabel);
    }

    panel.destroy();
  });

  test('always-enabled bar actions never carry a tooltip', () => {
    const panel = createNotesPanel(container, bus, manager, makePicker(), makeEditor(), editManager);
    const tabBar = container.querySelector('.dn-tab-bar') as HTMLElement;

    for (const label of ['Annotate', 'Edit Text', 'Share', 'More']) {
      const btn = btnByLabel(tabBar, label)!;
      expect(btn.dataset.tooltip).toBeUndefined();
      expect(btn.getAttribute('aria-disabled')).toBeNull();
    }

    panel.destroy();
  });

  test('a disabled action in the main bar does not emit its event when clicked', () => {
    const panel = createNotesPanel(container, bus, manager, makePicker(), makeEditor(), editManager);
    const copyBtn = btnByLabel(container.querySelector('.dn-tab-bar') as HTMLElement, 'Copy')!;
    const handler = vi.fn();
    bus.on('output:copy', handler);

    expect(copyBtn.getAttribute('aria-disabled')).toBe('true');
    expect(copyBtn.dataset.tooltip!.length).toBeGreaterThan(0);

    copyBtn.click();
    expect(handler).not.toHaveBeenCalled();

    panel.destroy();
  });

  test('selecting Hide Pins emits pin visibility and closes the menu', () => {
    manager.create(makeDescriptor(), { x: 0, y: 0 }, 'a note');
    const panel = createNotesPanel(container, bus, manager, makePicker(), makeEditor(), editManager);
    const trigger = container.querySelector('.dn-overflow__trigger') as HTMLButtonElement;
    const menu = container.querySelector('.dn-overflow__menu') as HTMLElement;
    const handler = vi.fn();
    bus.on('pins:visibility', handler);

    trigger.click();
    btnByLabel(menu, 'Hide Pins')!.click();

    expect(handler).toHaveBeenCalledWith({ type: 'pins:visibility', visible: false });
    // Label reflects the new state for next time the menu opens.
    expect(btnByLabel(menu, 'Show Pins')).toBeTruthy();
    expect(menu.hidden).toBe(true);

    panel.destroy();
  });

  test('closing the menu from inside returns focus to the trigger', () => {
    // Seed a note so the items are enabled and activatable.
    manager.create(makeDescriptor(), { x: 0, y: 0 }, 'a note');
    const panel = createNotesPanel(container, bus, manager, makePicker(), makeEditor(), editManager);
    const trigger = container.querySelector('.dn-overflow__trigger') as HTMLButtonElement;
    const menu = container.querySelector('.dn-overflow__menu') as HTMLElement;

    // Escape while focus is on a menu item.
    trigger.click();
    const download = btnByLabel(menu, 'Download')!;
    download.focus();
    expect(document.activeElement).toBe(download);
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(menu.hidden).toBe(true);
    expect(document.activeElement).toBe(trigger);

    // Activating an item while focused also restores focus to the trigger.
    trigger.click();
    const hidePins = btnByLabel(menu, 'Hide Pins')!;
    hidePins.focus();
    hidePins.click();
    expect(menu.hidden).toBe(true);
    expect(document.activeElement).toBe(trigger);

    panel.destroy();
  });

  test('an outside-click dismissal does not steal focus to the trigger', () => {
    const panel = createNotesPanel(container, bus, manager, makePicker(), makeEditor(), editManager);
    const trigger = container.querySelector('.dn-overflow__trigger') as HTMLButtonElement;
    const menu = container.querySelector('.dn-overflow__menu') as HTMLElement;

    const outside = document.createElement('button');
    document.body.appendChild(outside);

    trigger.click();
    outside.focus();
    expect(document.activeElement).toBe(outside);

    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(menu.hidden).toBe(true);
    // Focus stays where the user put it; it was never inside the menu.
    expect(document.activeElement).toBe(outside);

    outside.remove();
    panel.destroy();
  });

  test('an outside click dismisses an open menu', () => {
    const panel = createNotesPanel(container, bus, manager, makePicker(), makeEditor(), editManager);
    const trigger = container.querySelector('.dn-overflow__trigger') as HTMLButtonElement;
    const menu = container.querySelector('.dn-overflow__menu') as HTMLElement;

    trigger.click();
    expect(menu.hidden).toBe(false);

    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(menu.hidden).toBe(true);

    panel.destroy();
  });

  test('Escape dismisses an open menu', () => {
    const panel = createNotesPanel(container, bus, manager, makePicker(), makeEditor(), editManager);
    const trigger = container.querySelector('.dn-overflow__trigger') as HTMLButtonElement;
    const menu = container.querySelector('.dn-overflow__menu') as HTMLElement;

    trigger.click();
    expect(menu.hidden).toBe(false);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(menu.hidden).toBe(true);

    panel.destroy();
  });

  test('Escape that dismisses the menu does not reach the global keydown handler', () => {
    const panel = createNotesPanel(container, bus, manager, makePicker(), makeEditor(), editManager);
    const trigger = container.querySelector('.dn-overflow__trigger') as HTMLButtonElement;
    const menu = container.querySelector('.dn-overflow__menu') as HTMLElement;

    // Stand-in for createKeyboardShortcuts' document-level Escape handler,
    // registered after the panel (as it is in main.ts).
    const globalKeydown = vi.fn();
    document.addEventListener('keydown', globalKeydown);

    trigger.click();
    // Dispatch from inside the menu so the event bubbles up through document,
    // exercising the real capture-before-bubble ordering.
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(menu.hidden).toBe(true);
    expect(globalKeydown).not.toHaveBeenCalled();

    document.removeEventListener('keydown', globalKeydown);
    panel.destroy();
  });

  test('Escape while the menu is closed still reaches the global keydown handler', () => {
    const panel = createNotesPanel(container, bus, manager, makePicker(), makeEditor(), editManager);
    const menu = container.querySelector('.dn-overflow__menu') as HTMLElement;

    const globalKeydown = vi.fn();
    document.addEventListener('keydown', globalKeydown);

    expect(menu.hidden).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    // Menu is closed, so Escape must pass through untouched.
    expect(globalKeydown).toHaveBeenCalledTimes(1);

    document.removeEventListener('keydown', globalKeydown);
    panel.destroy();
  });

  test('destroy removes the document listeners so a later outside click is inert', () => {
    const panel = createNotesPanel(container, bus, manager, makePicker(), makeEditor(), editManager);
    const trigger = container.querySelector('.dn-overflow__trigger') as HTMLButtonElement;
    trigger.click();
    panel.destroy();

    // Should not throw now that the menu is gone and listeners are detached.
    expect(() => {
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    }).not.toThrow();
  });
});
