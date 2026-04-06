import { describe, test, expect, beforeEach } from 'vitest';
import { createNotePopover } from '@/popover/popover';
import { createEventBus } from '@/events';
import { createAnnotationManager } from '@/annotations/annotation-manager';
import { makeDescriptor } from '@/__tests__/fixtures';

describe('NotePopover', () => {
  let overlayEl: HTMLElement;
  let iframeEl: HTMLIFrameElement;
  let bus: ReturnType<typeof createEventBus>;
  let manager: ReturnType<typeof createAnnotationManager>;
  let popover: ReturnType<typeof createNotePopover>;

  beforeEach(() => {
    overlayEl = document.createElement('div');
    document.body.appendChild(overlayEl);

    iframeEl = document.createElement('iframe');
    document.body.appendChild(iframeEl);

    bus = createEventBus();
    manager = createAnnotationManager();
    manager.init(bus);

    popover = createNotePopover();
    popover.init(overlayEl, iframeEl, bus, manager);
  });

  test('createNotePopover returns expected interface', () => {
    expect(typeof popover.init).toBe('function');
    expect(typeof popover.show).toBe('function');
    expect(typeof popover.dismiss).toBe('function');
    expect(typeof popover.isOpen).toBe('function');
    expect(typeof popover.destroy).toBe('function');
  });

  test('starts closed', () => {
    expect(popover.isOpen()).toBe(false);
  });

  test('opens when annotation:create fires', () => {
    const ann = manager.create(makeDescriptor(), { x: 100, y: 50 }, '');
    // The bus handler in popover should have opened it
    expect(popover.isOpen()).toBe(true);
    // Should have a popover element in the overlay
    expect(overlayEl.querySelector('.dn-popover')).not.toBeNull();
  });

  test('opens when annotation:select fires', () => {
    const ann = manager.create(makeDescriptor(), { x: 100, y: 50 }, 'test note');
    popover.dismiss();
    expect(popover.isOpen()).toBe(false);

    bus.emit({ type: 'annotation:select', id: ann.id });
    expect(popover.isOpen()).toBe(true);
  });

  test('dismiss closes the popover', () => {
    manager.create(makeDescriptor(), { x: 100, y: 50 }, '');
    expect(popover.isOpen()).toBe(true);

    popover.dismiss();
    expect(popover.isOpen()).toBe(false);
    expect(overlayEl.querySelector('.dn-popover')).toBeNull();
  });

  test('closes on annotation:deselect', () => {
    manager.create(makeDescriptor(), { x: 100, y: 50 }, '');
    expect(popover.isOpen()).toBe(true);

    bus.emit({ type: 'annotation:deselect' });
    expect(popover.isOpen()).toBe(false);
  });

  test('closes on session:cleared', () => {
    manager.create(makeDescriptor(), { x: 100, y: 50 }, '');
    bus.emit({ type: 'session:cleared' });
    expect(popover.isOpen()).toBe(false);
  });

  test('destroy cleans up', () => {
    manager.create(makeDescriptor(), { x: 100, y: 50 }, '');
    popover.destroy();
    expect(popover.isOpen()).toBe(false);
    expect(overlayEl.querySelector('.dn-popover')).toBeNull();
  });

  test('popover textarea contains existing annotation text', () => {
    const ann = manager.create(makeDescriptor(), { x: 100, y: 50 }, 'hello world');
    popover.dismiss();

    bus.emit({ type: 'annotation:select', id: ann.id });
    const textarea = overlayEl.querySelector('.dn-popover__input') as HTMLTextAreaElement;
    expect(textarea).not.toBeNull();
    expect(textarea.value).toBe('hello world');
  });
});
