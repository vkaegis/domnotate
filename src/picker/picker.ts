import type { EventBus } from '@/types/core';
import type { ContentHost } from '@/core/content-host';
import { generateDescriptor } from '@/picker/selector-engine';
import { createHighlighter, type Highlighter } from '@/picker/highlight';

/**
 * Elements carrying this attribute are invisible to the picker.
 *
 * The extension mounts its own UI into the page it is annotating, so without
 * this the picker would happily select its own shadow host (elementFromPoint
 * retargets shadow content to the host) and swallow every sidebar click. The
 * web app's iframe content never carries it, so this is inert there.
 */
export const PICKER_IGNORE_ATTR = 'data-domnotate-ignore';

/**
 * Same shape as `ElementPicker` in `@/types/core`, but `init` takes a
 * `ContentHost` instead of an iframe. The core interface still describes the
 * pre-Phase-1 signature; it has no other implementors or consumers and should
 * be retired when Phase 4 migrates the remaining iframe-bound modules.
 */
export interface HostElementPicker {
  init(host: ContentHost, overlayEl: HTMLElement, bus: EventBus): void;
  activate(): void;
  deactivate(): void;
  isActive(): boolean;
}

export function createElementPicker(): HostElementPicker {
  let host: ContentHost;
  let bus: EventBus;
  let highlighter: Highlighter;
  let active = false;

  // Listener references for cleanup
  let onMouseMove: ((e: MouseEvent) => void) | null = null;
  let onClick: ((e: MouseEvent) => void) | null = null;
  let onMouseLeave: (() => void) | null = null;
  let rafId: number | null = null;

  function getContentDoc(): Document | null {
    return host.getDocument();
  }

  /** Translate content-local coords into the overlay's coordinate space */
  function toOverlayCoords(x: number, y: number) {
    return host.toOverlayCoords(x, y);
  }

  function isIgnored(el: Element): boolean {
    return typeof el.closest === 'function' && el.closest(`[${PICKER_IGNORE_ATTR}]`) !== null;
  }

  /**
   * `null` when the point is not a pickable element: outside the document, on
   * the root/body, or inside Domnotate's own UI.
   */
  function resolveTarget(doc: Document, clientX: number, clientY: number): Element | null {
    const target = doc.elementFromPoint(clientX, clientY);
    if (!target || target === doc.documentElement || target === doc.body) return null;
    if (isIgnored(target)) return null;
    return target;
  }

  function init(contentHost: ContentHost, overlayEl: HTMLElement, eventBus: EventBus): void {
    host = contentHost;
    bus = eventBus;
    highlighter = createHighlighter(overlayEl, contentHost);
  }

  function activate(): void {
    if (active) return;
    active = true;

    const doc = getContentDoc();
    if (!doc) return;

    // Set crosshair cursor on the content document
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

        const contentDoc = getContentDoc();
        if (!contentDoc) return;

        const target = resolveTarget(contentDoc, ev.clientX, ev.clientY);
        if (!target) {
          highlighter.clear();
          bus.emit({ type: 'picker:unhover' });
          return;
        }

        const descriptor = generateDescriptor(target);
        const overlay = toOverlayCoords(ev.clientX, ev.clientY);

        highlighter.highlight(descriptor, overlay.x, overlay.y);
        bus.emit({
          type: 'picker:hover',
          element: descriptor,
          mouseX: overlay.x,
          mouseY: overlay.y,
        });
      });
    };

    // --- Click: select element ---
    onClick = (e: MouseEvent) => {
      const contentDoc = getContentDoc();
      if (!contentDoc) return;

      // A click inside Domnotate's own UI is not a pick and must reach its
      // real handler, so bail out *before* suppressing the event. Every other
      // click is swallowed while picking, exactly as before.
      const raw = contentDoc.elementFromPoint(e.clientX, e.clientY);
      if (raw && isIgnored(raw)) return;

      e.preventDefault();
      e.stopPropagation();

      const target = resolveTarget(contentDoc, e.clientX, e.clientY);
      if (!target) return;

      const descriptor = generateDescriptor(target);
      const overlay = toOverlayCoords(e.clientX, e.clientY);

      bus.emit({
        type: 'picker:select',
        element: descriptor,
        mouseX: overlay.x,
        mouseY: overlay.y,
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

    const doc = getContentDoc();

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
