import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { createPinLayer, type PinLayer } from '@/extension/pins';
import { createPageHost } from '@/core/content-host';
import { createEventBus } from '@/events';
import { createAnnotationManager } from '@/annotations/annotation-manager';
import { generateDescriptor } from '@/picker/selector-engine';
import type { AnnotationManager, EventBus } from '@/types/core';

/** happy-dom does no layout, so every element needs a rect of its own. */
function withRect(el: Element, rect: Partial<DOMRect>): Element {
  el.getBoundingClientRect = (() => ({
    x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 50, height: 20,
    toJSON: () => ({}),
    ...rect,
  })) as Element['getBoundingClientRect'];
  return el;
}

let layer: PinLayer | null = null;
let bus: EventBus;
let manager: AnnotationManager;
let layerEl: HTMLElement;
let hostEl: HTMLElement;

beforeEach(() => {
  // Run measurement synchronously so assertions do not race a frame.
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0);
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
  Object.defineProperty(window, 'innerWidth', { value: 1000, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });

  bus = createEventBus();
  manager = createAnnotationManager();
  manager.init(bus);
  layerEl = document.createElement('div');
  hostEl = document.createElement('div');
  document.body.append(layerEl, hostEl);
});

afterEach(() => {
  layer?.destroy();
  layer = null;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

function build(): PinLayer {
  layer = createPinLayer({
    doc: document,
    layerEl,
    host: createPageHost(window),
    manager,
    bus,
    hostEl,
  });
  return layer;
}

function annotate(el: Element): string {
  return manager.create(generateDescriptor(el), { x: 0, y: 0 }, '').id;
}

function pins(): HTMLElement[] {
  return [...layerEl.querySelectorAll<HTMLElement>('[data-annotation-id]')];
}

describe('pins on a live page', () => {
  it('places a numbered pin at the element it belongs to', () => {
    const target = withRect(document.createElement('button'), { left: 120, top: 240 });
    target.id = 'save';
    document.body.appendChild(target);
    annotate(target);

    build().sync();

    expect(pins()).toHaveLength(1);
    // Straddles the element's top-left corner, offset by half the pin.
    expect(pins()[0].style.left).toBe('108px');
    expect(pins()[0].style.top).toBe('228px');
    expect(pins()[0].textContent).toBe('1');
  });

  it('follows the element when an inner pane scrolls', () => {
    const pane = document.createElement('div');
    const target = withRect(document.createElement('button'), { left: 100, top: 300 });
    target.id = 'save';
    pane.appendChild(target);
    document.body.appendChild(pane);
    annotate(target);
    build().sync();
    expect(pins()[0].style.top).toBe('288px');

    // The element moved because its pane scrolled, not the page. Document
    // coordinates would not have changed; measuring catches it.
    withRect(target, { left: 100, top: 100 });
    pane.dispatchEvent(new Event('scroll'));

    expect(pins()[0].style.top).toBe('88px');
  });

  it('hides rather than misplaces a pin whose element has gone', () => {
    const target = withRect(document.createElement('button'), { left: 10, top: 10 });
    target.id = 'save';
    document.body.appendChild(target);
    annotate(target);
    build().sync();
    expect(pins()[0].style.display).toBe('');

    target.remove();
    window.dispatchEvent(new Event('resize'));

    expect(pins()[0].style.display).toBe('none');
  });

  it('re-finds an element that React replaced', () => {
    const target = withRect(document.createElement('button'), { left: 10, top: 10 });
    target.id = 'save';
    document.body.appendChild(target);
    annotate(target);
    build().sync();

    // Same selector, brand new node — a re-render from out here.
    target.remove();
    const replacement = withRect(document.createElement('button'), { left: 60, top: 90 });
    replacement.id = 'save';
    document.body.appendChild(replacement);
    window.dispatchEvent(new Event('resize'));

    expect(pins()[0].style.display).toBe('');
    expect(pins()[0].style.top).toBe('78px');
  });

  it('hides a pin scrolled out of the viewport', () => {
    const target = withRect(document.createElement('button'), { left: 10, top: 10 });
    target.id = 'save';
    document.body.appendChild(target);
    annotate(target);
    build().sync();

    withRect(target, { left: 10, top: 2000, bottom: 2020 });
    window.dispatchEvent(new Event('resize'));

    expect(pins()[0].style.display).toBe('none');
  });

  it('selects the annotation when its pin is clicked', () => {
    const target = withRect(document.createElement('button'), { left: 10, top: 10 });
    target.id = 'save';
    document.body.appendChild(target);
    const id = annotate(target);
    build().sync();

    const selected = vi.fn();
    bus.on('annotation:select', selected);
    pins()[0].click();

    expect(selected).toHaveBeenCalledWith(expect.objectContaining({ id }));
  });

  it('drops a deleted pin and renumbers the rest', () => {
    const first = withRect(document.createElement('button'), { left: 10, top: 10 });
    first.id = 'a';
    const second = withRect(document.createElement('button'), { left: 20, top: 20 });
    second.id = 'b';
    document.body.append(first, second);
    const firstId = annotate(first);
    annotate(second);
    const live = build();
    live.sync();
    expect(pins()).toHaveLength(2);

    manager.delete(firstId);
    live.sync();

    expect(pins()).toHaveLength(1);
    expect(pins()[0].textContent).toBe('1');
  });

  /**
   * A pass follows an app across screens, so the manager holds notes whose
   * elements are not in this document. Those must not get a pin.
   */
  describe('notes from another screen', () => {
    function buildOn(route: () => string | null): PinLayer {
      layer = createPinLayer({
        doc: document,
        layerEl,
        host: createPageHost(window),
        manager,
        bus,
        hostEl,
        currentRoute: route,
      });
      return layer;
    }

    function annotateOn(el: Element, route: string): string {
      return manager.create(generateDescriptor(el), { x: 0, y: 0 }, '', {
        capturedOn: { route, url: route },
      }).id;
    }

    it('pins only the notes taken on this screen', () => {
      const target = withRect(document.createElement('button'), { left: 10, top: 10 });
      target.id = 'save';
      document.body.appendChild(target);
      annotateOn(target, 'https://x/here');
      annotateOn(target, 'https://x/there');

      buildOn(() => 'https://x/here').sync();

      expect(pins()).toHaveLength(1);
    });

    it('does not pin a note whose selector happens to match here', () => {
      // The real hazard. Both screens have a `.primary` button, so resolving by
      // selector would find one and pin the other screen's note to it.
      const target = withRect(document.createElement('button'), { left: 10, top: 10 });
      target.className = 'primary';
      document.body.appendChild(target);
      annotateOn(target, 'https://x/elsewhere');

      buildOn(() => 'https://x/here').sync();

      expect(pins()).toHaveLength(0);
    });

    it('keeps a number with its note when the screen changes', () => {
      const target = withRect(document.createElement('button'), { left: 10, top: 10 });
      target.id = 'save';
      document.body.appendChild(target);
      annotateOn(target, 'https://x/one');
      annotateOn(target, 'https://x/two');

      // The second note is the second of the session, so it reads 2 even when
      // it is the only pin on show. The sidebar row numbers it the same way.
      buildOn(() => 'https://x/two').sync();

      expect(pins()).toHaveLength(1);
      expect(pins()[0].textContent).toBe('2');
    });

    it('pins a note that names no screen at all', () => {
      // Single-document sessions, and any note taken before pages were recorded.
      const target = withRect(document.createElement('button'), { left: 10, top: 10 });
      target.id = 'save';
      document.body.appendChild(target);
      annotate(target);

      buildOn(() => 'https://x/anywhere').sync();

      expect(pins()).toHaveLength(1);
    });

    it('re-pins for the new screen when the app navigates', () => {
      const target = withRect(document.createElement('button'), { left: 10, top: 10 });
      target.id = 'save';
      document.body.appendChild(target);
      annotateOn(target, 'https://x/one');

      let where = 'https://x/two';
      buildOn(() => where).sync();
      expect(pins()).toHaveLength(0);

      where = 'https://x/one';
      window.dispatchEvent(new PopStateEvent('popstate'));

      expect(pins()).toHaveLength(1);
    });
  });

  it('leaves the page clean on destroy', () => {
    const target = withRect(document.createElement('button'), { left: 10, top: 10 });
    target.id = 'save';
    document.body.appendChild(target);
    annotate(target);
    const live = build();
    live.sync();

    live.destroy();
    layer = null;

    expect(pins()).toHaveLength(0);
    // And no listener left behind to fire against a torn-down layer.
    expect(() => window.dispatchEvent(new Event('resize'))).not.toThrow();
  });
});
