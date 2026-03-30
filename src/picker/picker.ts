import type { ElementPicker, EventBus } from '@/types/core';
import { generateDescriptor } from '@/picker/selector-engine';
import { createHighlighter, type Highlighter } from '@/picker/highlight';

export function createElementPicker(): ElementPicker {
  let iframeEl: HTMLIFrameElement;
  let overlayEl: HTMLElement;
  let bus: EventBus;
  let highlighter: Highlighter;
  let active = false;

  // Listener references for cleanup
  let onMouseMove: ((e: MouseEvent) => void) | null = null;
  let onClick: ((e: MouseEvent) => void) | null = null;
  let onMouseLeave: (() => void) | null = null;
  let rafId: number | null = null;

  function getIframeDoc(): Document | null {
    try {
      return iframeEl.contentDocument;
    } catch {
      return null;
    }
  }

  /** Translate iframe-local coords to parent-frame (overlay-relative) coords */
  function toParentCoords(iframeX: number, iframeY: number) {
    const iframeRect = iframeEl.getBoundingClientRect();
    const overlayRect = overlayEl.getBoundingClientRect();
    return {
      x: iframeX + iframeRect.left - overlayRect.left,
      y: iframeY + iframeRect.top - overlayRect.top,
    };
  }

  function init(
    iframe: HTMLIFrameElement,
    overlay: HTMLElement,
    eventBus: EventBus,
  ): void {
    iframeEl = iframe;
    overlayEl = overlay;
    bus = eventBus;
    highlighter = createHighlighter(overlayEl, iframeEl);
  }

  function activate(): void {
    if (active) return;
    active = true;

    const doc = getIframeDoc();
    if (!doc) return;

    // Set crosshair cursor on the iframe document
    doc.documentElement.style.cursor = 'crosshair';

    // --- Mousemove: throttled via rAF ---
    let pendingEvent: MouseEvent | null = null;

    onMouseMove = (e: MouseEvent) => {
      pendingEvent = e;

      if (rafId !== null) return;

      rafId = requestAnimationFrame(() => {
        rafId = null;
        if (!pendingEvent || !active) return;

        const ev = pendingEvent;
        pendingEvent = null;

        const iframeDoc = getIframeDoc();
        if (!iframeDoc) return;

        const target = iframeDoc.elementFromPoint(ev.clientX, ev.clientY);
        if (!target || target === iframeDoc.documentElement || target === iframeDoc.body) {
          highlighter.clear();
          bus.emit({ type: 'picker:unhover' });
          return;
        }

        const descriptor = generateDescriptor(target);
        const parent = toParentCoords(ev.clientX, ev.clientY);

        highlighter.highlight(descriptor, parent.x, parent.y);
        bus.emit({
          type: 'picker:hover',
          element: descriptor,
          mouseX: parent.x,
          mouseY: parent.y,
        });
      });
    };

    // --- Click: select element ---
    onClick = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const iframeDoc = getIframeDoc();
      if (!iframeDoc) return;

      const target = iframeDoc.elementFromPoint(e.clientX, e.clientY);
      if (!target || target === iframeDoc.documentElement || target === iframeDoc.body) {
        return;
      }

      const descriptor = generateDescriptor(target);
      const parent = toParentCoords(e.clientX, e.clientY);

      bus.emit({
        type: 'picker:select',
        element: descriptor,
        mouseX: parent.x,
        mouseY: parent.y,
      });
    };

    // --- Mouse leave: clear highlight ---
    onMouseLeave = () => {
      highlighter.clear();
      bus.emit({ type: 'picker:unhover' });
    };

    doc.addEventListener('mousemove', onMouseMove, true);
    doc.addEventListener('click', onClick, true);
    doc.addEventListener('mouseleave', onMouseLeave);
  }

  function deactivate(): void {
    if (!active) return;
    active = false;

    const doc = getIframeDoc();

    if (doc) {
      doc.documentElement.style.cursor = '';
      if (onMouseMove) doc.removeEventListener('mousemove', onMouseMove, true);
      if (onClick) doc.removeEventListener('click', onClick, true);
      if (onMouseLeave) doc.removeEventListener('mouseleave', onMouseLeave);
    }

    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }

    onMouseMove = null;
    onClick = null;
    onMouseLeave = null;

    highlighter.clear();
  }

  function isActive(): boolean {
    return active;
  }

  return { init, activate, deactivate, isActive };
}
