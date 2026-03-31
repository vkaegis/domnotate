// ============================================================
// Domnotate — Notes Panel (sidebar content)
// ============================================================

import type { EventBus, AnnotationManager, Annotation } from '@/types/core';

// --- SVG Icons (14px viewBox 24) ---
const ICONS = {
  pencil: `<svg viewBox="0 0 24 24"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>`,
  eye: `<svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`,
  eyeOff: `<svg viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`,
  clipboard: `<svg viewBox="0 0 24 24"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>`,
  download: `<svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
  trash: `<svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`,
  x: `<svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  check: `<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>`,
  chevronDown: `<svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>`,
} as const;

export function createNotesPanel(
  container: HTMLElement,
  bus: EventBus,
  manager: AnnotationManager,
  picker: { activate(): void; deactivate(): void; isActive(): boolean },
): { destroy(): void } {
  const unsubs: (() => void)[] = [];

  // --- State ---
  let selectedId: string | null = null;
  let sortNewestFirst = true;
  let pinsVisible = true;
  let copyTimer: ReturnType<typeof setTimeout> | null = null;

  // --- Action bar ---
  const actionBar = document.createElement('div');
  actionBar.className = 'dn-action-bar';

  const actionLeft = document.createElement('div');
  actionLeft.className = 'dn-action-bar__left';

  const sortToggle = document.createElement('button');
  sortToggle.className = 'dn-sort-toggle';
  sortToggle.innerHTML = `Newest first ${ICONS.chevronDown}`;
  sortToggle.addEventListener('click', () => {
    sortNewestFirst = !sortNewestFirst;
    sortToggle.innerHTML = `${sortNewestFirst ? 'Newest first' : 'Oldest first'} ${ICONS.chevronDown}`;
    renderNotesList();
  });
  actionLeft.appendChild(sortToggle);

  const actionRight = document.createElement('div');
  actionRight.className = 'dn-action-bar__right';

  // Annotate button (pencil)
  const annotateBtn = makeActionBtn(ICONS.pencil, 'Annotate an element', () => {
    if (picker.isActive()) {
      picker.deactivate();
      annotateBtn.classList.remove('dn-action-btn--active');
    } else {
      picker.activate();
      annotateBtn.classList.add('dn-action-btn--active');
    }
  });

  // Spacer after pencil
  const spacer = document.createElement('div');
  spacer.className = 'dn-action-spacer';

  // Pins toggle (eye)
  const pinsBtn = makeActionBtn(ICONS.eye, 'Toggle pin visibility', () => {
    pinsVisible = !pinsVisible;
    bus.emit({ type: 'pins:visibility', visible: pinsVisible });
    pinsBtn.innerHTML = pinsVisible ? ICONS.eye : ICONS.eyeOff;
  });

  // Copy button (clipboard)
  const copyBtn = makeActionBtn(ICONS.clipboard, 'Copy as Markdown', () => {
    bus.emit({ type: 'output:copy', format: 'markdown' });
    copyBtn.innerHTML = ICONS.check;
    copyBtn.classList.add('dn-action-btn--copied');
    if (copyTimer) clearTimeout(copyTimer);
    copyTimer = setTimeout(() => {
      copyBtn.innerHTML = ICONS.clipboard;
      copyBtn.classList.remove('dn-action-btn--copied');
      copyTimer = null;
    }, 1500);
  });

  // Export button (download)
  const exportBtn = makeActionBtn(ICONS.download, 'Export as JSON', () => {
    bus.emit({ type: 'output:download', format: 'json' });
  });

  // Clear button (trash)
  const clearBtn = makeActionBtn(ICONS.trash, 'Clear all annotations', () => {
    bus.emit({ type: 'session:cleared' });
  });

  actionRight.appendChild(annotateBtn);
  actionRight.appendChild(spacer);
  actionRight.appendChild(pinsBtn);
  actionRight.appendChild(copyBtn);
  actionRight.appendChild(exportBtn);
  actionRight.appendChild(clearBtn);

  actionBar.appendChild(actionLeft);
  actionBar.appendChild(actionRight);
  container.appendChild(actionBar);

  // --- Notes list / empty state container ---
  const notesListEl = document.createElement('div');
  notesListEl.className = 'dn-notes-list';
  container.appendChild(notesListEl);

  // --- Render functions ---

  function getAnnotations(): Annotation[] {
    const all = manager.getAll();
    if (sortNewestFirst) {
      return [...all].reverse();
    }
    return all;
  }

  function getAnnotationIndex(id: string): number {
    // Index is always based on creation order, not display order
    const all = manager.getAll();
    return all.findIndex((a) => a.id === id);
  }

  function renderNotesList(): void {
    const annotations = getAnnotations();
    notesListEl.innerHTML = '';

    if (annotations.length === 0) {
      renderEmptyState();
      updateActionBarState(true);
      return;
    }

    updateActionBarState(false);

    for (const annotation of annotations) {
      const index = getAnnotationIndex(annotation.id);
      notesListEl.appendChild(createNoteRow(annotation, index));
    }
  }

  function renderEmptyState(): void {
    const empty = document.createElement('div');
    empty.className = 'dn-empty-state';

    const icon = document.createElement('div');
    icon.innerHTML = `<svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>`;
    icon.style.color = 'var(--dn-border)';

    const text = document.createElement('div');
    text.className = 'dn-empty-state__text';
    text.textContent = 'Click the pencil to annotate an element';

    empty.appendChild(icon);
    empty.appendChild(text);
    notesListEl.appendChild(empty);
  }

  function updateActionBarState(isEmpty: boolean): void {
    // Sort toggle: hidden when empty
    sortToggle.style.display = isEmpty ? 'none' : '';

    // Annotate is always active; other buttons dimmed when empty
    const secondaryBtns = [pinsBtn, copyBtn, exportBtn, clearBtn];
    for (const btn of secondaryBtns) {
      if (isEmpty) {
        btn.classList.add('dn-action-btn--dimmed');
      } else {
        btn.classList.remove('dn-action-btn--dimmed');
      }
    }
  }

  function createNoteRow(annotation: Annotation, index: number): HTMLElement {
    const row = document.createElement('div');
    row.className = 'dn-note-row';
    row.dataset.annotationId = annotation.id;

    if (annotation.id === selectedId) {
      row.classList.add('dn-note-row--selected');
    }

    // Pin number
    const pin = document.createElement('div');
    pin.className = 'dn-note-pin';
    pin.textContent = String(index + 1);

    // Editable text
    const textEl = document.createElement('div');
    textEl.className = 'dn-note-text';
    textEl.contentEditable = 'true';
    textEl.textContent = annotation.text;
    textEl.spellcheck = false;

    // Commit text on blur or Enter
    textEl.addEventListener('blur', () => {
      const newText = textEl.textContent?.trim() ?? '';
      if (newText !== annotation.text) {
        manager.updateText(annotation.id, newText);
      }
    });

    textEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        textEl.blur();
      }
    });

    // Prevent row click when editing
    textEl.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    // Delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'dn-note-delete';
    deleteBtn.title = 'Delete annotation';
    deleteBtn.innerHTML = ICONS.x;
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      manager.delete(annotation.id);
      if (selectedId === annotation.id) {
        selectedId = null;
        bus.emit({ type: 'annotation:deselect' });
      }
    });

    // Row click → select annotation
    row.addEventListener('click', () => {
      selectedId = annotation.id;
      bus.emit({ type: 'annotation:select', id: annotation.id });
      renderNotesList();
    });

    row.appendChild(pin);
    row.appendChild(textEl);
    row.appendChild(deleteBtn);
    return row;
  }

  // --- Helper ---

  function makeActionBtn(
    icon: string,
    title: string,
    onClick: () => void,
  ): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.className = 'dn-action-btn';
    btn.title = title;
    btn.innerHTML = icon;
    btn.addEventListener('click', onClick);
    return btn;
  }

  // --- Event listeners ---

  // Re-render on data changes
  unsubs.push(bus.on('annotation:create', (e) => {
    // Auto-deactivate annotate button
    annotateBtn.classList.remove('dn-action-btn--active');
    // Select the new annotation
    selectedId = e.annotation.id;
    renderNotesList();
    // Scroll to bottom and focus the text input
    requestAnimationFrame(() => {
      const lastRow = notesListEl.querySelector(
        `[data-annotation-id="${e.annotation.id}"] .dn-note-text`,
      ) as HTMLElement | null;
      if (lastRow) {
        lastRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        lastRow.focus();
      }
    });
  }));

  unsubs.push(bus.on('annotation:update', () => {
    renderNotesList();
  }));

  unsubs.push(bus.on('annotation:delete', () => {
    renderNotesList();
  }));

  unsubs.push(bus.on('session:cleared', () => {
    selectedId = null;
    renderNotesList();
  }));

  unsubs.push(bus.on('session:loaded', () => {
    selectedId = null;
    renderNotesList();
  }));

  unsubs.push(bus.on('annotation:select', (e) => {
    selectedId = e.id;
    renderNotesList();
  }));

  unsubs.push(bus.on('annotation:deselect', () => {
    selectedId = null;
    renderNotesList();
  }));

  unsubs.push(bus.on('pins:visibility', (e) => {
    pinsVisible = e.visible;
    pinsBtn.innerHTML = pinsVisible ? ICONS.eye : ICONS.eyeOff;
  }));

  // Initial render (empty state)
  renderNotesList();

  // --- Public API ---

  return {
    destroy(): void {
      for (const unsub of unsubs) unsub();
      if (copyTimer) clearTimeout(copyTimer);
      actionBar.remove();
      notesListEl.remove();
    },
  };
}
