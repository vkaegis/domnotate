// ============================================================
// Domnotate — pins on a live page
// ============================================================
//
// Deliberately not the web app's pin renderer. That one places pins at
// document coordinates and counter-translates the whole layer by scroll, which
// is exact for a static document with one scroll root — and wrong here in four
// ways at once: apps scroll inner panes rather than the document, sticky
// headers do not move with scroll, React replaces nodes underneath you, and
// docking the page reflows everything after the anchor was taken.
//
// So pins here are anchored to the element, not to a point, and re-measured
// from it. Every one of those four cases then costs nothing, and an element
// that has gone away is obvious rather than silently misplaced.
//
// The pin itself is shared (`annotations/pin-element`); only the anchoring
// differs, because only the anchoring is a property of the host.

import { createPinElement, PIN_SIZE } from '@/annotations/pin-element';
import { reanchorAnnotation } from '@/output/reanchor';
import type { ContentHost } from '@/core/content-host';
import type { AnnotationManager, EventBus } from '@/types/core';

const OFFSET = PIN_SIZE / 2;

export interface PinLayerOptions {
  doc: Document;
  /** A layer spanning the viewport, inside our shadow root. */
  layerEl: HTMLElement;
  host: ContentHost;
  manager: AnnotationManager;
  bus: EventBus;
  /** Our own shadow host, which must never be annotated or measured. */
  hostEl: Element;
}

export interface PinLayer {
  /** Rebuild from the manager. Call when annotations are added or removed. */
  sync(): void;
  destroy(): void;
}

interface Tracked {
  pin: HTMLElement;
  element: Element | null;
}

export function createPinLayer(options: PinLayerOptions): PinLayer {
  const { doc, layerEl, host, manager, bus, hostEl } = options;

  const tracked = new Map<string, Tracked>();
  let frame = 0;
  let scheduled = false;
  let destroyed = false;

  /**
   * Resolve an annotation to a live element, re-resolving when the node we had
   * has left the document — which is what a React re-render looks like from
   * out here.
   */
  function resolve(id: string, existing: Element | null): Element | null {
    if (existing?.isConnected) return existing;
    const annotation = manager.getById(id);
    if (!annotation) return null;
    return reanchorAnnotation(annotation.element, doc)?.element ?? null;
  }

  function place(entry: Tracked, id: string): void {
    const element = resolve(id, entry.element);
    entry.element = element;

    if (!element || element === hostEl) {
      entry.pin.style.display = 'none';
      return;
    }

    const rect = element.getBoundingClientRect();
    const collapsed = rect.width === 0 && rect.height === 0;
    const offscreen =
      rect.bottom < 0 ||
      rect.right < 0 ||
      rect.top > (doc.defaultView?.innerHeight ?? 0) ||
      rect.left > (doc.defaultView?.innerWidth ?? 0);

    if (collapsed || offscreen) {
      entry.pin.style.display = 'none';
      return;
    }

    // The layer spans the viewport, so viewport coordinates are layer
    // coordinates. No scroll arithmetic, which is the point of measuring.
    entry.pin.style.display = '';
    entry.pin.style.left = `${rect.left - OFFSET}px`;
    entry.pin.style.top = `${rect.top - OFFSET}px`;
  }

  /**
   * One measure pass per frame, however many events triggered it. The guard is
   * a separate flag rather than the frame id, so it is still correct if the
   * callback runs before the id is assigned.
   */
  function schedule(): void {
    if (destroyed || scheduled) return;
    scheduled = true;
    frame = requestAnimationFrame(() => {
      scheduled = false;
      frame = 0;
      for (const [id, entry] of tracked) place(entry, id);
    });
  }

  function sync(): void {
    if (destroyed) return;
    const annotations = manager.getAll();
    const live = new Set(annotations.map((a) => a.id));

    for (const [id, entry] of tracked) {
      if (live.has(id)) continue;
      entry.pin.remove();
      tracked.delete(id);
    }

    annotations.forEach((annotation, index) => {
      const existing = tracked.get(annotation.id);
      if (existing) {
        // Numbering follows creation order, so a delete renumbers the rest.
        existing.pin.textContent = String(index + 1);
        return;
      }
      const pin = createPinElement({
        annotationId: annotation.id,
        index,
        doc,
        onSelect: () => bus.emit({ type: 'annotation:select', id: annotation.id }),
      });
      pin.style.display = 'none';
      layerEl.appendChild(pin);
      tracked.set(annotation.id, { pin, element: null });
    });

    schedule();
  }

  const unsubs = [host.onScroll(schedule), host.onResize(schedule)];

  // A route change replaces the tree, so every cached node is stale.
  unsubs.push(
    host.onNavigate(() => {
      for (const entry of tracked.values()) entry.element = null;
      schedule();
    }),
  );

  return {
    sync,
    destroy(): void {
      destroyed = true;
      if (frame) cancelAnimationFrame(frame);
      for (const unsub of unsubs) unsub();
      for (const entry of tracked.values()) entry.pin.remove();
      tracked.clear();
    },
  };
}
