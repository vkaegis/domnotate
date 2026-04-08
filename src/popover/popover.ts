// ============================================================
// Domnotate — Inline Note Popover
// ============================================================

import type { EventBus, AnnotationManager } from '@/types/core';
import './popover.css';

export interface NotePopover {
  init(
    overlayEl: HTMLElement,
    iframeEl: HTMLIFrameElement,
    bus: EventBus,
    manager: AnnotationManager,
  ): void;
  show(annotationId: string): void;
  dismiss(): void;
  isOpen(): boolean;
  destroy(): void;
}

export function createNotePopover(): NotePopover {
  let overlayEl: HTMLElement;
  let iframeEl: HTMLIFrameElement;
  let bus: EventBus;
  let manager: AnnotationManager;

  let popoverEl: HTMLElement | null = null;
  let textareaEl: HTMLTextAreaElement | null = null;
  let activeAnnotationId: string | null = null;
  const unsubs: (() => void)[] = [];

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
      // Cross-origin
    }
    return { scrollX: 0, scrollY: 0 };
  }

  function autoResize(): void {
    if (!textareaEl) return;
    textareaEl.style.height = 'auto';
    textareaEl.style.height = `${textareaEl.scrollHeight}px`;
  }

  function commitAndDismiss(): void {
    if (!activeAnnotationId || !textareaEl) return;

    const newText = textareaEl.value.trim();
    const annotation = manager.getById(activeAnnotationId);
    if (annotation && newText !== annotation.text) {
      manager.updateText(activeAnnotationId, newText);
    }

    dismiss();
  }

  function dismiss(): void {
    if (popoverEl) {
      popoverEl.remove();
      popoverEl = null;
      textareaEl = null;
    }
    activeAnnotationId = null;
  }

  function show(annotationId: string): void {
    // If already showing this annotation, do nothing
    if (activeAnnotationId === annotationId && popoverEl) return;

    // Dismiss any existing popover first
    if (popoverEl) commitAndDismiss();

    const annotation = manager.getById(annotationId);
    if (!annotation) return;

    activeAnnotationId = annotationId;

    const { scrollX, scrollY } = getIframeScroll();

    // Position: to the right of the pin, top-aligned with pin center
    const pinSize = 24;
    const pinOffset = pinSize / 2; // pin is centered on anchorPoint
    const gap = 14;
    const left = annotation.anchorPoint.x - scrollX + pinOffset + gap;
    const top = annotation.anchorPoint.y - scrollY - pinOffset;

    // Build popover DOM
    popoverEl = document.createElement('div');
    popoverEl.className = 'dn-popover';
    popoverEl.style.left = `${left}px`;
    popoverEl.style.top = `${top}px`;

    const bubble = document.createElement('div');
    bubble.className = 'dn-popover__bubble';

    textareaEl = document.createElement('textarea');
    textareaEl.className = 'dn-popover__input';
    textareaEl.placeholder = 'Add a note...';
    textareaEl.value = annotation.text;
    textareaEl.rows = 1;

    // Auto-resize on input
    textareaEl.addEventListener('input', autoResize);

    // Commit on Enter (without shift), dismiss on Escape
    textareaEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        commitAndDismiss();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        commitAndDismiss();
      }
    });

    // Commit on blur (clicking elsewhere)
    textareaEl.addEventListener('blur', () => {
      // Small delay to allow click events on the popover to fire first
      setTimeout(() => {
        if (popoverEl) commitAndDismiss();
      }, 100);
    });

    // Prevent clicks inside popover from propagating to overlay
    popoverEl.addEventListener('mousedown', (e) => {
      e.stopPropagation();
    });

    bubble.appendChild(textareaEl);
    popoverEl.appendChild(bubble);
    overlayEl.appendChild(popoverEl);

    // Focus and auto-resize after mount
    requestAnimationFrame(() => {
      if (textareaEl) {
        textareaEl.focus();
        autoResize();
        // Place cursor at end
        textareaEl.selectionStart = textareaEl.value.length;
        textareaEl.selectionEnd = textareaEl.value.length;
      }
    });
  }

  const popover: NotePopover = {
    init(
      _overlayEl: HTMLElement,
      _iframeEl: HTMLIFrameElement,
      _bus: EventBus,
      _manager: AnnotationManager,
    ): void {
      overlayEl = _overlayEl;
      iframeEl = _iframeEl;
      bus = _bus;
      manager = _manager;

      // Show popover when a new annotation is created
      unsubs.push(
        bus.on('annotation:create', (e) => {
          show(e.annotation.id);
        }),
      );

      // Show popover when a pin is clicked (annotation:select)
      unsubs.push(
        bus.on('annotation:select', (e) => {
          show(e.id);
        }),
      );

      // Dismiss on deselect or session clear
      unsubs.push(bus.on('annotation:deselect', () => dismiss()));
      unsubs.push(bus.on('session:cleared', () => dismiss()));
      unsubs.push(bus.on('content:unloaded', () => dismiss()));

      // Reposition on iframe scroll
      try {
        const doc = iframeEl.contentDocument;
        if (doc) {
          doc.addEventListener('scroll', () => {
            if (activeAnnotationId) {
              // Re-show to reposition
              const id = activeAnnotationId;
              dismiss();
              show(id);
            }
          }, { passive: true });
        }
      } catch {
        // Cross-origin
      }
    },

    show,
    dismiss,

    isOpen(): boolean {
      return popoverEl !== null;
    },

    destroy(): void {
      for (const unsub of unsubs) unsub();
      unsubs.length = 0;
      dismiss();
    },
  };

  return popover;
}
