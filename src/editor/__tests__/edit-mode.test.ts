import { describe, test, expect, vi, beforeEach } from 'vitest';
import { createTextEditor } from '@/editor/edit-mode';
import { createEditManager } from '@/editor/edit-manager';
import { createEventBus } from '@/events';
import { makeFakeIframe, makeDescriptor } from '@/__tests__/fixtures';
import type { EventBus, TextEditor, TextEdit } from '@/types/core';

function setup(bodyHtml: string) {
  const doc = document.implementation.createHTMLDocument('edit-test');
  doc.body.innerHTML = bodyHtml;
  const iframe = makeFakeIframe(doc);
  const overlay = document.createElement('div');
  document.body.appendChild(overlay);
  const bus = createEventBus();
  const editor = createTextEditor();
  editor.init(iframe, overlay, bus);
  return { doc, editor, bus };
}

function clickEl(el: Element): void {
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
}

describe('TextEditor', () => {
  let bus: EventBus;
  let editor: TextEditor;
  let doc: Document;

  test('activate emits edit:activate and arms the mode', () => {
    ({ doc, editor, bus } = setup('<p class="intro">Hello world</p>'));
    const activated = vi.fn();
    bus.on('edit:activate', activated);

    editor.activate();

    expect(editor.isActive()).toBe(true);
    expect(activated).toHaveBeenCalledOnce();
  });

  test('clicking a text element makes it contentEditable', () => {
    ({ doc, editor } = setup('<p class="intro">Hello world</p>'));
    editor.activate();

    const p = doc.querySelector('p')!;
    clickEl(p);

    expect(p.getAttribute('contenteditable')).toBe('true');
    expect(editor.isEditing()).toBe(true);
  });

  test('committing a changed field emits edit:commit with rich old/new content', () => {
    ({ doc, editor, bus } = setup('<p class="intro">Hello <em>world</em></p>'));
    const committed = vi.fn();
    bus.on('edit:commit', committed);
    editor.activate();

    const p = doc.querySelector('p')!;
    clickEl(p);
    // Simulate typing into the contentEditable element.
    p.innerHTML = 'Goodbye <em>world</em>';

    editor.deactivate();

    expect(committed).toHaveBeenCalledOnce();
    const payload = committed.mock.calls[0][0];
    expect(payload.type).toBe('edit:commit');
    expect(payload.oldText).toBe('Hello world');
    expect(payload.newText).toBe('Goodbye world');
    expect(payload.oldHtml).toBe('Hello <em>world</em>');
    expect(payload.newHtml).toBe('Goodbye <em>world</em>');
    // contentEditable is removed after commit.
    expect(p.hasAttribute('contenteditable')).toBe(false);
  });

  test('no change → no edit:commit', () => {
    ({ doc, editor, bus } = setup('<p class="intro">Hello world</p>'));
    const committed = vi.fn();
    bus.on('edit:commit', committed);
    editor.activate();

    const p = doc.querySelector('p')!;
    clickEl(p);
    editor.deactivate();

    expect(committed).not.toHaveBeenCalled();
  });

  test('sticky: clicking a second element commits the first and stays active', () => {
    ({ doc, editor, bus } = setup('<p class="a">First text</p><p class="b">Second text</p>'));
    const committed = vi.fn();
    bus.on('edit:commit', committed);
    editor.activate();

    const a = doc.querySelector('p.a')!;
    const b = doc.querySelector('p.b')!;

    clickEl(a);
    a.innerHTML = 'First edited';
    clickEl(b);

    // First edit committed; still armed and now editing the second element.
    expect(committed).toHaveBeenCalledOnce();
    expect(committed.mock.calls[0][0].newText).toBe('First edited');
    expect(editor.isActive()).toBe(true);
    expect(editor.isEditing()).toBe(true);
    expect(b.getAttribute('contenteditable')).toBe('true');
  });

  test('deactivate commits the open field and emits edit:deactivate (Esc keeps edits)', () => {
    ({ doc, editor, bus } = setup('<p class="intro">Hello world</p>'));
    const committed = vi.fn();
    const deactivated = vi.fn();
    bus.on('edit:commit', committed);
    bus.on('edit:deactivate', deactivated);
    editor.activate();

    const p = doc.querySelector('p')!;
    clickEl(p);
    p.innerHTML = 'Edited on exit';
    editor.deactivate();

    expect(committed).toHaveBeenCalledOnce();
    expect(deactivated).toHaveBeenCalledOnce();
    expect(editor.isActive()).toBe(false);
    expect(editor.isEditing()).toBe(false);
  });

  test('commitPending commits the open field without disarming edit mode', () => {
    ({ doc, editor, bus } = setup('<p class="intro">Hello world</p>'));
    const committed = vi.fn();
    const deactivated = vi.fn();
    bus.on('edit:commit', committed);
    bus.on('edit:deactivate', deactivated);
    editor.activate();

    const p = doc.querySelector('p')!;
    clickEl(p);
    p.innerHTML = 'Edited before export';
    editor.commitPending();

    expect(committed).toHaveBeenCalledOnce();
    expect(committed.mock.calls[0][0].newText).toBe('Edited before export');
    expect(deactivated).not.toHaveBeenCalled();
    expect(editor.isActive()).toBe(true);
    expect(editor.isEditing()).toBe(false);
    expect(p.hasAttribute('contenteditable')).toBe(false);
  });

  test('clicking a non-text region does not open a field', () => {
    ({ doc, editor } = setup('<hr class="rule"><p class="intro">Hello world</p>'));
    editor.activate();

    const hr = doc.querySelector('hr')!;
    clickEl(hr);

    expect(editor.isEditing()).toBe(false);
  });

  test('applyEdits re-applies newHtml to matching elements as a preview', () => {
    ({ doc, editor } = setup('<p class="intro">Original</p>'));
    const edit: TextEdit = {
      id: 'e1',
      element: makeDescriptor({ cssSelector: 'p.intro', tagName: 'p' }),
      oldHtml: 'Original',
      newHtml: 'Restored preview',
      oldText: 'Original',
      newText: 'Restored preview',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    editor.applyEdits([edit]);

    expect(doc.querySelector('p.intro')!.innerHTML).toBe('Restored preview');
  });

  test('revertEdit restores oldHtml and removes edited preview marker', () => {
    ({ doc, editor } = setup('<p class="intro">Original</p>'));
    const p = doc.querySelector('p.intro') as HTMLElement;
    p.innerHTML = 'Edited preview';
    p.classList.add('dn-edited');

    const edit: TextEdit = {
      id: 'e1',
      element: makeDescriptor({ cssSelector: 'p.intro', tagName: 'p' }),
      oldHtml: 'Original',
      newHtml: 'Edited preview',
      oldText: 'Original',
      newText: 'Edited preview',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const reverted = editor.revertEdit(edit);

    expect(reverted).toBe(true);
    expect(p.innerHTML).toBe('Original');
    expect(p.classList.contains('dn-edited')).toBe(false);
  });

  test('clearing reverts every live edit preview before the records are dropped', () => {
    // Mirrors main.ts session:cleared: revert each edit's DOM, then clearAll.
    ({ doc, editor, bus } = setup('<p class="a">A original</p><p class="b">B original</p>'));
    const editManager = createEditManager();
    editManager.init(bus);

    const a = doc.querySelector('p.a') as HTMLElement;
    const b = doc.querySelector('p.b') as HTMLElement;

    editManager.commit({
      element: makeDescriptor({ cssSelector: 'p.a', tagName: 'p' }),
      oldHtml: 'A original',
      newHtml: 'A edited',
      oldText: 'A original',
      newText: 'A edited',
    });
    editManager.commit({
      element: makeDescriptor({ cssSelector: 'p.b', tagName: 'p' }),
      oldHtml: 'B original',
      newHtml: 'B edited',
      oldText: 'B original',
      newText: 'B edited',
    });

    // Apply the edits as live previews (marks dn-edited + rewrites innerHTML).
    editor.applyEdits(editManager.getAll());
    expect(a.innerHTML).toBe('A edited');
    expect(b.classList.contains('dn-edited')).toBe(true);

    // Clear: revert live previews, then drop the records.
    for (const edit of editManager.getAll()) editor.revertEdit(edit);
    editManager.clearAll();

    expect(a.innerHTML).toBe('A original');
    expect(b.innerHTML).toBe('B original');
    expect(a.classList.contains('dn-edited')).toBe(false);
    expect(b.classList.contains('dn-edited')).toBe(false);
    expect(editManager.getAll()).toHaveLength(0);
  });
});
