import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createEventBus } from '@/events';
import { createElementPicker, PICKER_IGNORE_ATTR, type HostElementPicker } from '@/picker/picker';
import type { ContentHost } from '@/core/content-host';
import type { DomnotateEvent } from '@/types/core';

/**
 * `elementFromPoint` is not implemented by happy-dom, so the hit test is
 * supplied per-test. That is a DOM API boundary, not an internal module.
 */
function hostOver(
  doc: Document,
  hit: (x: number, y: number) => Element | null,
  offset = { x: 0, y: 0 },
): ContentHost {
  doc.elementFromPoint = ((x: number, y: number) => hit(x, y)) as Document['elementFromPoint'];
  return {
    getDocument: () => doc,
    toOverlayCoords: (x, y) => ({ x: x + offset.x, y: y + offset.y }),
    getScroll: () => ({ scrollX: 0, scrollY: 0 }),
    getContentSize: () => ({ width: 0, height: 0 }),
    onScroll: () => () => {},
    onResize: () => () => {},
    onNavigate: () => () => {},
  };
}

function clickAt(doc: Document, x: number, y: number): MouseEvent {
  const event = new MouseEvent('click', {
    clientX: x,
    clientY: y,
    bubbles: true,
    cancelable: true,
  });
  doc.dispatchEvent(event);
  return event;
}

describe('createElementPicker', () => {
  const doc = document;
  let overlay: HTMLElement;
  let target: HTMLElement;
  let events: DomnotateEvent[];
  let bus: ReturnType<typeof createEventBus>;
  let live: HostElementPicker[];

  /** Every picker attaches document listeners, so they all get torn down. */
  function makePicker(host: ContentHost): HostElementPicker {
    const picker = createElementPicker();
    picker.init(host, overlay, bus);
    live.push(picker);
    return picker;
  }

  beforeEach(() => {
    document.body.replaceChildren();
    live = [];
    overlay = document.createElement('div');
    document.body.appendChild(overlay);

    target = document.createElement('button');
    target.id = 'pick-me';
    target.textContent = 'Save';
    document.body.appendChild(target);

    const captured: DomnotateEvent[] = [];
    events = captured;
    bus = createEventBus();
    for (const type of ['picker:select', 'picker:hover', 'picker:unhover'] as const) {
      bus.on(type, (e) => captured.push(e));
    }
  });

  afterEach(() => {
    for (const picker of live) picker.deactivate();
  });

  it('emits the picked element with coordinates translated by the host', () => {
    const picker = makePicker(hostOver(doc, () => target, { x: 100, y: 40 }));
    picker.activate();

    clickAt(doc, 10, 20);

    expect(events).toHaveLength(1);
    const [event] = events;
    expect(event.type).toBe('picker:select');
    if (event.type !== 'picker:select') throw new Error('unreachable');
    expect(event.element.id).toBe('pick-me');
    expect({ x: event.mouseX, y: event.mouseY }).toEqual({ x: 110, y: 60 });
  });

  it('swallows the click on the content it is picking from', () => {
    makePicker(hostOver(doc, () => target)).activate();

    const event = clickAt(doc, 10, 20);
    expect(event.defaultPrevented).toBe(true);
  });

  it('still swallows clicks that land on the root or body', () => {
    makePicker(hostOver(doc, () => doc.body)).activate();

    const event = clickAt(doc, 10, 20);
    expect(event.defaultPrevented).toBe(true);
    expect(events).toHaveLength(0);
  });

  it('lets clicks on Domnotate’s own UI through untouched', () => {
    const ownUi = document.createElement('div');
    ownUi.setAttribute(PICKER_IGNORE_ATTR, '');
    const button = document.createElement('button');
    ownUi.appendChild(button);
    document.body.appendChild(ownUi);

    makePicker(hostOver(doc, () => button)).activate();

    const event = clickAt(doc, 10, 20);
    // Not swallowed, and not mistaken for a pick.
    expect(event.defaultPrevented).toBe(false);
    expect(events).toHaveLength(0);
  });

  it('sets and restores the crosshair cursor', () => {
    const picker = makePicker(hostOver(doc, () => target));

    picker.activate();
    expect(doc.documentElement.style.cursor).toBe('crosshair');
    expect(picker.isActive()).toBe(true);

    picker.deactivate();
    expect(doc.documentElement.style.cursor).toBe('');
    expect(picker.isActive()).toBe(false);
  });

  it('stops picking after deactivate', () => {
    const picker = makePicker(hostOver(doc, () => target));
    picker.activate();
    picker.deactivate();

    const event = clickAt(doc, 10, 20);
    expect(event.defaultPrevented).toBe(false);
    expect(events).toHaveLength(0);
  });

  it('emits unhover when the pointer leaves the content', () => {
    makePicker(hostOver(doc, () => target)).activate();

    doc.dispatchEvent(new MouseEvent('mouseleave'));

    expect(events.map((e) => e.type)).toEqual(['picker:unhover']);
  });

  it('does nothing when the content document is unavailable', () => {
    const detached: ContentHost = {
      ...hostOver(doc, () => target),
      getDocument: () => null,
    };
    const picker = makePicker(detached);

    expect(() => picker.activate()).not.toThrow();
    expect(events).toHaveLength(0);
  });

  it('highlights the hovered element on the next animation frame', async () => {
    makePicker(hostOver(doc, () => target, { x: 5, y: 5 })).activate();

    doc.dispatchEvent(new MouseEvent('mousemove', { clientX: 1, clientY: 2, bubbles: true }));
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

    const hover = events.find((e) => e.type === 'picker:hover');
    expect(hover).toBeDefined();
    if (hover?.type !== 'picker:hover') throw new Error('unreachable');
    expect(hover.element.tagName).toBe('button');
    expect({ x: hover.mouseX, y: hover.mouseY }).toEqual({ x: 6, y: 7 });
  });

  it('renders the highlight box into the overlay it was given', () => {
    makePicker(hostOver(doc, () => target));

    expect(overlay.querySelector('.dn-highlight-box')).not.toBeNull();
    expect(overlay.querySelector('.dn-highlight-tooltip')).not.toBeNull();
  });
});
