import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createPinRenderer } from '@/annotations/pin-renderer';
import { createAnnotationManager } from '@/annotations/annotation-manager';
import { createEventBus } from '@/events';
import { makeAnnotation } from '@/__tests__/fixtures';
import type { SlideObserver } from '@/types/core';

describe('PinRenderer', () => {
  let overlayEl: HTMLElement;
  let iframeEl: HTMLIFrameElement;
  let bus: ReturnType<typeof createEventBus>;
  let manager: ReturnType<typeof createAnnotationManager>;

  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe(): void {}
        disconnect(): void {}
      },
    );

    overlayEl = document.createElement('div');
    document.body.appendChild(overlayEl);

    iframeEl = document.createElement('iframe');
    document.body.appendChild(iframeEl);
    iframeEl.contentDocument?.body.appendChild(document.createElement('main'));

    bus = createEventBus();
    manager = createAnnotationManager();
    manager.init(bus);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.replaceChildren();
  });

  test('scroll moves one pin layer without re-reading annotations', () => {
    manager.loadAnnotations([
      makeAnnotation({
        id: 'ann-1',
        anchorPoint: { x: 100, y: 200 },
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
      makeAnnotation({
        id: 'ann-2',
        anchorPoint: { x: 150, y: 300 },
        createdAt: '2026-01-01T00:00:01.000Z',
      }),
    ]);

    const slideObserver: SlideObserver = {
      init: vi.fn(),
      getActiveSlide: () => null,
      getSlideCount: () => null,
      goToSlide: vi.fn(),
      getSlideForElement: () => undefined,
      destroy: vi.fn(),
    };

    const renderer = createPinRenderer();
    renderer.init(overlayEl, iframeEl, bus, manager, slideObserver);

    const getAll = vi.spyOn(manager, 'getAll');
    renderer.render();

    const pinLayer = overlayEl.querySelector('[data-dn-pin-layer="true"]') as HTMLElement;
    expect(pinLayer).not.toBeNull();
    expect(pinLayer.children).toHaveLength(2);
    expect((pinLayer.children[0] as HTMLElement).style.left).toBe('88px');
    expect((pinLayer.children[0] as HTMLElement).style.top).toBe('188px');

    getAll.mockClear();
    const doc = iframeEl.contentDocument!;
    doc.documentElement.scrollTop = 120;
    doc.dispatchEvent(new Event('scroll'));

    expect(pinLayer.style.transform).toBe('translate3d(0px, -120px, 0)');
    expect(getAll).not.toHaveBeenCalled();

    renderer.destroy();
  });
});
