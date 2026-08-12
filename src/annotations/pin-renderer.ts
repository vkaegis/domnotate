// ============================================================
// Domnotate — Pin Renderer
// ============================================================

import type {
  EventBus,
  AnnotationManager,
  PinRenderer,
  SlideObserver,
  Annotation,
} from '@/types/core';
import { isAnnotationVisibleInScopes } from '@/annotations/view-scope';
import { createPinElement, PIN_SIZE } from '@/annotations/pin-element';

export function createPinRenderer(): PinRenderer {
  let overlayEl: HTMLElement;
  let iframeEl: HTMLIFrameElement;
  let bus: EventBus;
  let manager: AnnotationManager;
  let slideObserver: SlideObserver | null = null;

  let pinContainer: HTMLElement | null = null;
  let pinLayer: HTMLElement | null = null;
  let visible = true;
  let rafId = 0;
  let resizeObserver: ResizeObserver | null = null;
  let scrollDocument: Document | null = null;
  let onIframeLoad: (() => void) | null = null;
  const unsubs: (() => void)[] = [];
  const pinSize = PIN_SIZE;
  const pinOffset = pinSize / 2;

  // --- Helpers ---

  function getIframeScroll(): { scrollX: number; scrollY: number } {
    try {
      const doc = iframeEl.contentDocument;
      if (doc) {
        return {
          scrollX: doc.documentElement.scrollLeft || doc.body?.scrollLeft || 0,
          scrollY: doc.documentElement.scrollTop || doc.body?.scrollTop || 0,
        };
      }
    } catch {
      // Cross-origin — fall back to 0
    }
    return { scrollX: 0, scrollY: 0 };
  }

  function createPin(annotation: Annotation, index: number): HTMLElement {
    return createPinElement({
      annotationId: annotation.id,
      index,
      onSelect: () => bus.emit({ type: 'annotation:select', id: annotation.id }),
    });
  }

  function updatePinLayerSize(): void {
    if (!pinLayer) return;
    let width = overlayEl.clientWidth;
    let height = overlayEl.clientHeight;
    try {
      const doc = iframeEl.contentDocument;
      const docEl = doc?.documentElement;
      const body = doc?.body;
      if (docEl) {
        width = Math.max(
          width,
          docEl.scrollWidth,
          body?.scrollWidth ?? 0,
          docEl.clientWidth,
        );
        height = Math.max(
          height,
          docEl.scrollHeight,
          body?.scrollHeight ?? 0,
          docEl.clientHeight,
        );
      }
    } catch {
      // Cross-origin — keep the overlay-sized layer.
    }

    pinLayer.style.width = `${width}px`;
    pinLayer.style.height = `${height}px`;
  }

  function syncScrollPosition(): void {
    if (!pinLayer || !visible) return;
    const { scrollX, scrollY } = getIframeScroll();
    pinLayer.style.transform = `translate3d(${-scrollX}px, ${-scrollY}px, 0)`;
  }

  function schedulePositionUpdate(): void {
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(syncScrollPosition);
  }

  function handleIframeScroll(): void {
    schedulePositionUpdate();
  }

  function attachScrollSync(): void {
    try {
      const doc = iframeEl.contentDocument;
      if (doc && doc !== scrollDocument) {
        detachScrollSync();
        scrollDocument = doc;
        doc.addEventListener('scroll', handleIframeScroll, { passive: true });
      }
    } catch {
      // Cross-origin — no scroll sync possible
    }
  }

  function detachScrollSync(): void {
    try {
      if (scrollDocument) {
        scrollDocument.removeEventListener('scroll', handleIframeScroll);
        scrollDocument = null;
      }
    } catch {
      // Ignore
    }
  }

  // --- PinRenderer interface ---

  const renderer: PinRenderer = {
    init(
      _overlayEl: HTMLElement,
      _iframeEl: HTMLIFrameElement,
      _bus: EventBus,
      _manager: AnnotationManager,
      _slideObserver?: SlideObserver,
    ): void {
      overlayEl = _overlayEl;
      iframeEl = _iframeEl;
      bus = _bus;
      manager = _manager;
      slideObserver = _slideObserver ?? null;

      // Create pin container
      pinContainer = document.createElement('div');
      pinContainer.style.position = 'absolute';
      pinContainer.style.inset = '0';
      pinContainer.style.pointerEvents = 'none';
      pinContainer.style.overflow = 'hidden';

      pinLayer = document.createElement('div');
      pinLayer.dataset.dnPinLayer = 'true';
      pinLayer.style.position = 'absolute';
      pinLayer.style.top = '0';
      pinLayer.style.left = '0';
      pinLayer.style.transform = 'translate3d(0px, 0px, 0)';
      pinLayer.style.willChange = 'transform';
      pinLayer.style.contain = 'layout style paint';
      pinContainer.appendChild(pinLayer);
      overlayEl.appendChild(pinContainer);

      // Listen for annotation events to re-render
      unsubs.push(bus.on('annotation:create', () => renderer.render()));
      unsubs.push(bus.on('annotation:update', () => renderer.render()));
      unsubs.push(bus.on('annotation:delete', () => renderer.render()));
      unsubs.push(bus.on('session:loaded', () => renderer.render()));
      unsubs.push(bus.on('session:cleared', () => renderer.render()));
      unsubs.push(
        bus.on('pins:visibility', (e) => renderer.setVisible(e.visible)),
      );
      unsubs.push(bus.on('scope:changed', () => renderer.render()));
      unsubs.push(bus.on('slide:changed', () => renderer.render()));

      // Scroll sync
      attachScrollSync();

      // Re-attach scroll sync when iframe reloads
      onIframeLoad = () => {
        attachScrollSync();
        renderer.render();
      };
      iframeEl.addEventListener('load', onIframeLoad);

      // ResizeObserver on iframe for re-positioning
      resizeObserver = new ResizeObserver(() => {
        updatePinLayerSize();
        schedulePositionUpdate();
      });
      resizeObserver.observe(iframeEl);
    },

    render(): void {
      if (!pinLayer) return;

      // Clear existing pins
      pinLayer.replaceChildren();

      if (!visible) return;

      updatePinLayerSize();

      const allAnnotations = manager.getAll();
      const annotationIndices = new Map(allAnnotations.map((ann, index) => [ann.id, index]));
      const activeScopes = slideObserver?.getActiveScopes() ?? [];
      const hasScopes = (slideObserver?.getScopes().length ?? 0) > 0;
      const annotations = allAnnotations.filter((ann) =>
        isAnnotationVisibleInScopes(ann, activeScopes, hasScopes),
      );

      const fragment = document.createDocumentFragment();

      annotations.forEach((ann) => {
        const globalIndex = annotationIndices.get(ann.id) ?? 0;
        const pin = createPin(ann, globalIndex);
        // Pins live in iframe document coordinates. Scroll moves the whole layer.
        pin.style.left = `${ann.anchorPoint.x - pinOffset}px`;
        pin.style.top = `${ann.anchorPoint.y - pinOffset}px`;
        fragment.appendChild(pin);
      });

      pinLayer.appendChild(fragment);
      syncScrollPosition();
    },

    setVisible(v: boolean): void {
      visible = v;
      if (pinContainer) {
        pinContainer.style.display = v ? '' : 'none';
      }
      if (v) {
        renderer.render();
      }
    },

    destroy(): void {
      cancelAnimationFrame(rafId);
      for (const unsub of unsubs) unsub();
      unsubs.length = 0;
      detachScrollSync();
      if (onIframeLoad) {
        iframeEl.removeEventListener('load', onIframeLoad);
        onIframeLoad = null;
      }
      if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
      }
      if (pinContainer) {
        pinContainer.remove();
        pinContainer = null;
      }
      pinLayer = null;
    },
  };

  return renderer;
}
