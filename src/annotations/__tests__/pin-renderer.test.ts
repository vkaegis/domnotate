import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createPinRenderer } from '@/annotations/pin-renderer';
import { createAnnotationManager } from '@/annotations/annotation-manager';
import { createEventBus } from '@/events';
import { makeDescriptor, makeFakeIframe, makePlainDocument, makeViewScope } from '@/__tests__/fixtures';
import type { AnnotationManager, EventBus, SlideObserver, ViewScope } from '@/types/core';

class TestResizeObserver {
  observe(): void {}
  disconnect(): void {}
}

function makeObserver(scopes: ViewScope[], activeScope: ViewScope): SlideObserver {
  return {
    init: () => undefined,
    getActiveScope: () => activeScope,
    getScopes: () => scopes,
    getScopeForElement: () => activeScope,
    activateScope: vi.fn(),
    destroy: () => undefined,
    getActiveSlide: () => activeScope.index,
    getSlideCount: () => scopes.length,
    goToSlide: vi.fn(),
    getSlideForElement: () => activeScope.index,
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
});

