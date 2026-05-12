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
import { isAnnotationVisibleInScope } from '@/annotations/view-scope';

export function createPinRenderer(): PinRenderer {
  let overlayEl: HTMLElement;
  let iframeEl: HTMLIFrameElement;
  let bus: EventBus;
  let manager: AnnotationManager;
  let slideObserver: SlideObserver | null = null;

  let pinContainer: HTMLElement | null = null;
  let visible = true;
  let rafId = 0;
  let resizeObserver: ResizeObserver | null = null;
  const unsubs: (() => void)[] = [];

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

  function createPinElement(annotation: Annotation, index: number): HTMLElement {
    const pin = document.createElement('div');
    pin.dataset.annotationId = annotation.id;
    const size = 24;

    Object.assign(pin.style, {
      position: 'absolute',
      width: `${size}px`,
      height: `${size}px`,
      borderRadius: '50%',
      background: 'var(--dn-pin-color)',
      color: 'var(--dn-text-on-accent)',
      fontSize: '11px',
      fontWeight: '700',
      lineHeight: `${size}px`,
      textAlign: 'center',
      cursor: 'pointer',
      pointerEvents: 'auto',
      boxShadow: 'var(--dn-shadow-sm)',
      userSelect: 'none',
      transition: 'transform 80ms ease',
      zIndex: 'var(--dn-z-pins)',
    });

    pin.textContent = String(index + 1);

    pin.addEventListener('mouseenter', () => {
      pin.style.transform = 'scale(1.2)';
    });
    pin.addEventListener('mouseleave', () => {
      pin.style.transform = 'scale(1)';
    });
    pin.addEventListener('click', (e) => {
      e.stopPropagation();
      bus.emit({ type: 'annotation:select', id: annotation.id });
    });

    return pin;
  }

  function positionPins(): void {
    if (!pinContainer || !visible) return;

    const { scrollX, scrollY } = getIframeScroll();
    const pins = pinContainer.children;
    const allAnnotations = manager.getAll();
    const activeScope = slideObserver?.getActiveScope() ?? null;
    const hasScopes = (slideObserver?.getScopes().length ?? 0) > 0;
    const annotations = allAnnotations.filter((ann) =>
      isAnnotationVisibleInScope(ann, activeScope, hasScopes),
    );

    for (let i = 0; i < pins.length && i < annotations.length; i++) {
      const pin = pins[i] as HTMLElement;
      const ann = annotations[i];
      // anchorPoint is relative to iframe content; subtract scroll for overlay position
      pin.style.left = `${ann.anchorPoint.x - scrollX - 12}px`;
      pin.style.top = `${ann.anchorPoint.y - scrollY - 12}px`;
    }
  }

  function schedulePositionUpdate(): void {
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(positionPins);
  }

  function handleIframeScroll(): void {
    schedulePositionUpdate();
  }

  function attachScrollSync(): void {
    try {
      const doc = iframeEl.contentDocument;
      if (doc) {
        doc.addEventListener('scroll', handleIframeScroll, { passive: true });
      }
    } catch {
      // Cross-origin — no scroll sync possible
    }
  }

  function detachScrollSync(): void {
    try {
      const doc = iframeEl.contentDocument;
      if (doc) {
        doc.removeEventListener('scroll', handleIframeScroll);
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
      iframeEl.addEventListener('load', () => {
        attachScrollSync();
        renderer.render();
      });

      // ResizeObserver on iframe for re-positioning
      resizeObserver = new ResizeObserver(() => schedulePositionUpdate());
      resizeObserver.observe(iframeEl);
    },

    render(): void {
      if (!pinContainer) return;

      // Clear existing pins
      pinContainer.innerHTML = '';

      if (!visible) return;

      const allAnnotations = manager.getAll();
      const activeScope = slideObserver?.getActiveScope() ?? null;
      const hasScopes = (slideObserver?.getScopes().length ?? 0) > 0;
      const annotations = allAnnotations.filter((ann) =>
        isAnnotationVisibleInScope(ann, activeScope, hasScopes),
      );

      const { scrollX, scrollY } = getIframeScroll();

      annotations.forEach((ann) => {
        const globalIndex = allAnnotations.indexOf(ann);
        const pin = createPinElement(ann, globalIndex);
        pin.style.left = `${ann.anchorPoint.x - scrollX - 12}px`;
        pin.style.top = `${ann.anchorPoint.y - scrollY - 12}px`;
        pinContainer!.appendChild(pin);
      });
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
      if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
      }
      if (pinContainer) {
        pinContainer.remove();
        pinContainer = null;
      }
    },
  };

  return renderer;
}
