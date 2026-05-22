import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createPinRenderer } from '@/annotations/pin-renderer';
import { createAnnotationManager } from '@/annotations/annotation-manager';
import { createEventBus } from '@/events';
import {
  makeAnnotation,
  makeDescriptor,
  makeFakeIframe,
  makePlainDocument,
  makeViewScope,
} from '@/__tests__/fixtures';
import type { AnnotationManager, EventBus, SlideObserver, ViewScope } from '@/types/core';

class TestResizeObserver {
  observe(): void {}
  disconnect(): void {}
}

function makeObserver(
  scopes: ViewScope[],
  activeScope: ViewScope,
  activeScopes = [activeScope],
): SlideObserver {
  return {
    init: () => undefined,
    getActiveScope: () => activeScope,
    getActiveScopes: () => activeScopes,
    getScopes: () => scopes,
    getScopeForElement: () => activeScope,
    isScopeActive: (candidate) => activeScopes.some((scope) => scope.id === candidate.id),
    activateScope: vi.fn(),
    getDetectionInfo: () => ({ source: null, detectors: [] }),
    destroy: () => undefined,
    getActiveSlide: () => activeScope.index,
    getSlideCount: () => scopes.length,
    goToSlide: vi.fn(),
    getSlideForElement: () => activeScope.index,
  };
}

function makeEmptyObserver(): SlideObserver {
  return {
    init: vi.fn(),
    getActiveScope: () => null,
    getActiveScopes: () => [],
    getScopes: () => [],
    getScopeForElement: () => undefined,
    isScopeActive: () => false,
    activateScope: vi.fn(),
    getDetectionInfo: () => ({ source: null, detectors: [] }),
    destroy: vi.fn(),
    getActiveSlide: () => null,
    getSlideCount: () => null,
    goToSlide: vi.fn(),
    getSlideForElement: () => undefined,
  };
}

describe('PinRenderer scope filtering', () => {
  let bus: EventBus;
  let manager: AnnotationManager;
  let overlay: HTMLElement;

  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', TestResizeObserver);
    bus = createEventBus();
    manager = createAnnotationManager();
    manager.init(bus);
    overlay = document.createElement('div');
    document.body.appendChild(overlay);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  test('renders active scoped pins, matching legacy pins, and general pins only', () => {
    const inactiveScope = makeViewScope({ id: 'tab-1', index: 0, label: 'First' });
    const activeScope = makeViewScope({ id: 'tab-2', index: 1, label: 'Second' });
    const observer = makeObserver([inactiveScope, activeScope], activeScope);
    const iframe = makeFakeIframe(makePlainDocument());

    const inactive = manager.create(makeDescriptor(), { x: 10, y: 10 }, 'inactive', {
      viewScope: inactiveScope,
    });
    const active = manager.create(makeDescriptor(), { x: 20, y: 20 }, 'active', {
      viewScope: activeScope,
    });
    const legacy = manager.create(makeDescriptor(), { x: 30, y: 30 }, 'legacy', 1);
    const general = manager.create(makeDescriptor(), { x: 40, y: 40 }, 'general');

    const renderer = createPinRenderer();
    renderer.init(overlay, iframe, bus, manager, observer);
    renderer.render();

    expect(overlay.querySelector(`[data-annotation-id="${inactive.id}"]`)).toBeNull();
    expect(overlay.querySelector(`[data-annotation-id="${active.id}"]`)).not.toBeNull();
    expect(overlay.querySelector(`[data-annotation-id="${legacy.id}"]`)).not.toBeNull();
    expect(overlay.querySelector(`[data-annotation-id="${general.id}"]`)).not.toBeNull();

    renderer.destroy();
  });

  test('renders pins from multiple independently active tabsets', () => {
    const firstSetActive = makeViewScope({ id: 'set-0-tab-1', index: 1, label: 'Set 0 Tab 1' });
    const secondSetActive = makeViewScope({ id: 'set-1-tab-2', index: 5, label: 'Set 1 Tab 2' });
    const inactive = makeViewScope({ id: 'set-1-tab-0', index: 3, label: 'Set 1 Tab 0' });
    const observer = makeObserver(
      [firstSetActive, inactive, secondSetActive],
      firstSetActive,
      [firstSetActive, secondSetActive],
    );
    const iframe = makeFakeIframe(makePlainDocument());

    const first = manager.create(makeDescriptor(), { x: 10, y: 10 }, 'first active', {
      viewScope: firstSetActive,
    });
    const second = manager.create(makeDescriptor(), { x: 20, y: 20 }, 'second active', {
      viewScope: secondSetActive,
    });
    const hidden = manager.create(makeDescriptor(), { x: 30, y: 30 }, 'inactive', {
      viewScope: inactive,
    });

    const renderer = createPinRenderer();
    renderer.init(overlay, iframe, bus, manager, observer);
    renderer.render();

    expect(overlay.querySelector(`[data-annotation-id="${first.id}"]`)).not.toBeNull();
    expect(overlay.querySelector(`[data-annotation-id="${second.id}"]`)).not.toBeNull();
    expect(overlay.querySelector(`[data-annotation-id="${hidden.id}"]`)).toBeNull();

    renderer.destroy();
  });
});

describe('PinRenderer scroll layer', () => {
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
    vi.stubGlobal('ResizeObserver', TestResizeObserver);

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

    const slideObserver = makeEmptyObserver();

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
