// ============================================================
// Domnotate — Sidebar Container
// ============================================================

import type { EventBus, AnnotationManager, EditManager, SlideObserver } from '@/types/core';
import { createNotesPanel } from '@/sidebar/notes-panel';
import './sidebar.css';

const DEFAULT_WIDTH = 360;
const MIN_WIDTH = 200;

export function createSidebar(
  container: HTMLElement,
  bus: EventBus,
  manager: AnnotationManager,
  picker: { activate(): void; deactivate(): void; isActive(): boolean },
  editor: { activate(): void; deactivate(): void; isActive(): boolean },
  editManager: EditManager,
  slideObserver?: SlideObserver,
): { show(): void; hide(): void; destroy(): void } {
  const unsubs: (() => void)[] = [];

  // --- Build DOM ---
  const el = document.createElement('div');
  el.className = 'dn-sidebar dn-sidebar--hidden';

  // Resize handle
  const resizeHandle = document.createElement('div');
  resizeHandle.className = 'dn-resize-handle';
  el.appendChild(resizeHandle);

  // Notes panel (action bar + list + empty state)
  const notesPanel = createNotesPanel(el, bus, manager, picker, editor, editManager, slideObserver);

  container.appendChild(el);

  // --- Resize logic ---
  let isResizing = false;
  let startX = 0;
  let startWidth = DEFAULT_WIDTH;

  function onResizeMouseDown(e: MouseEvent): void {
    e.preventDefault();
    isResizing = true;
    startX = e.clientX;
    startWidth = el.offsetWidth;
    resizeHandle.classList.add('dn-resize-handle--active');
    document.addEventListener('mousemove', onResizeMouseMove);
    document.addEventListener('mouseup', onResizeMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  function onResizeMouseMove(e: MouseEvent): void {
    if (!isResizing) return;
    // Dragging left increases width, dragging right decreases
    const delta = startX - e.clientX;
    const maxWidth = window.innerWidth * 0.5;
    const newWidth = Math.max(MIN_WIDTH, Math.min(startWidth + delta, maxWidth));
    el.style.width = `${newWidth}px`;
  }

  function onResizeMouseUp(): void {
    isResizing = false;
    resizeHandle.classList.remove('dn-resize-handle--active');
    document.removeEventListener('mousemove', onResizeMouseMove);
    document.removeEventListener('mouseup', onResizeMouseUp);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }

  resizeHandle.addEventListener('mousedown', onResizeMouseDown);

  // --- Public API ---

  return {
    show(): void {
      el.classList.remove('dn-sidebar--hidden');
      el.style.width = `${DEFAULT_WIDTH}px`;
    },
    hide(): void {
      el.classList.add('dn-sidebar--hidden');
    },
    destroy(): void {
      for (const unsub of unsubs) unsub();
      notesPanel.destroy();
      resizeHandle.removeEventListener('mousedown', onResizeMouseDown);
      document.removeEventListener('mousemove', onResizeMouseMove);
      document.removeEventListener('mouseup', onResizeMouseUp);
      el.remove();
    },
  };
}
