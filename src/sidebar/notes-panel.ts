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
} as const;

// --- Typewriter engine ---

interface TypewriterState {
  el: HTMLElement;
  originalText: string;
  charTimer: ReturnType<typeof setTimeout> | null;
  revertTimer: ReturnType<typeof setTimeout> | null;
  isAnimating: boolean;
}

function createTypewriter(el: HTMLElement): {
  type(message: string, opts?: { revertDelay?: number }): void;
  restoreNow(): void;
  setOriginal(text: string): void;
  destroy(): void;
} {
  const state: TypewriterState = {
    el,
    originalText: el.textContent ?? '',
    charTimer: null,
    revertTimer: null,
    isAnimating: false,
  };

  const CHAR_DELAY = 70; // leisurely
  const CURSOR_LINGER = 400; // cursor stays after last char
  const DEFAULT_REVERT_DELAY = 2000; // ms before reverting to filename

  function clearTimers(): void {
    if (state.charTimer) { clearTimeout(state.charTimer); state.charTimer = null; }
    if (state.revertTimer) { clearTimeout(state.revertTimer); state.revertTimer = null; }
  }

  function restoreFilename(): void {
    clearTimers();
    state.isAnimating = false;
    state.el.classList.add('dn-file-label--fade-out');
    setTimeout(() => {
      state.el.textContent = state.originalText;
      state.el.classList.remove('dn-file-label--typing', 'dn-file-label--fade-out');
      state.el.classList.add('dn-file-label--fade-in');
      setTimeout(() => state.el.classList.remove('dn-file-label--fade-in'), 300);
    }, 300);
  }

  function typeMessage(message: string, revertDelay: number): void {
    clearTimers();
    state.isAnimating = true;
    state.el.textContent = '';
    state.el.classList.add('dn-file-label--typing');

    // Create text node and cursor
    const textNode = document.createTextNode('');
    const cursor = document.createElement('span');
    cursor.className = 'dn-typewriter-cursor';
    state.el.appendChild(textNode);
    state.el.appendChild(cursor);

    let charIndex = 0;

    function typeNext(): void {
      if (charIndex < message.length) {
        textNode.textContent = message.slice(0, charIndex + 1);
        charIndex++;
        state.charTimer = setTimeout(typeNext, CHAR_DELAY);
      } else {
        // Done typing — linger cursor, then schedule revert
        state.charTimer = setTimeout(() => {
          cursor.remove();
          state.revertTimer = setTimeout(restoreFilename, revertDelay);
        }, CURSOR_LINGER);
      }
    }

    typeNext();
  }

  return {
    type(message: string, opts?: { revertDelay?: number }): void {
      typeMessage(message, opts?.revertDelay ?? DEFAULT_REVERT_DELAY);
    },
    restoreNow(): void {
      restoreFilename();
    },
    setOriginal(text: string): void {
      state.originalText = text;
      if (!state.isAnimating) {
        state.el.textContent = text;
      }
    },
    destroy(): void {
      clearTimers();
    },
  };
}

// --- Icon pop helper ---

function setIconWithPop(btn: HTMLButtonElement, iconHtml: string): void {
  btn.innerHTML = iconHtml;
  const svg = btn.querySelector('svg');
  if (svg) {
    svg.classList.add('dn-icon-enter');
    svg.addEventListener('animationend', () => svg.classList.remove('dn-icon-enter'), { once: true });
  }
}

export function createNotesPanel(
  container: HTMLElement,
  bus: EventBus,
  manager: AnnotationManager,
  picker: { activate(): void; deactivate(): void; isActive(): boolean },
): { destroy(): void } {
  const unsubs: (() => void)[] = [];

  // --- State ---
  let selectedId: string | null = null;
  let pinsVisible = true;
  let copyTimer: ReturnType<typeof setTimeout> | null = null;

  // --- Action bar ---
  const actionBar = document.createElement('div');
  actionBar.className = 'dn-action-bar';

  const actionLeft = document.createElement('div');
  actionLeft.className = 'dn-action-bar__left';

  const fileLabel = document.createElement('span');
  fileLabel.className = 'dn-file-label';
  fileLabel.textContent = '';
  actionLeft.appendChild(fileLabel);

  const actionRight = document.createElement('div');
  actionRight.className = 'dn-action-bar__right';

  // Annotate button (pencil)
  const annotateBtn = makeActionBtn(ICONS.pencil, 'Annotate an element (A)', () => {
    if (picker.isActive()) {
      picker.deactivate();
    } else {
      picker.activate();
    }
  });
  // Pencil always shows terracotta to stand out from other muted icons
  annotateBtn.style.color = 'var(--dn-accent)';

  // --- Sync annotate button with picker state (handles keyboard shortcut toggles) ---
  const originalActivate = picker.activate.bind(picker);
  const originalDeactivate = picker.deactivate.bind(picker);

  picker.activate = () => {
    const wasActive = picker.isActive();
    originalActivate();
    if (!wasActive && picker.isActive()) {
      annotateBtn.classList.add('dn-action-btn--active');
      typewriter.type('Annotating...', { revertDelay: 60000 });
    }
  };

  picker.deactivate = () => {
    const wasActive = picker.isActive();
    originalDeactivate();
    if (wasActive) {
      annotateBtn.classList.remove('dn-action-btn--active');
      typewriter.restoreNow();
    }
  };

  // Spacer after pencil
  const spacer = document.createElement('div');
  spacer.className = 'dn-action-spacer';

  // Pins toggle (eye) — feedback handled by bus listener
  const pinsBtn = makeActionBtn(ICONS.eye, 'Toggle pin visibility (H)', () => {
    pinsVisible = !pinsVisible;
    bus.emit({ type: 'pins:visibility', visible: pinsVisible });
  });

  // Copy button (clipboard)
  const copyBtn = makeActionBtn(ICONS.clipboard, 'Copy as Markdown (C)', () => {
    bus.emit({ type: 'output:copy', format: 'markdown' });
  });

  function animateNotesToButton(): void {
    const rows = notesListEl.querySelectorAll('.dn-note-row');
    if (rows.length === 0) return;

    const btnRect = copyBtn.getBoundingClientRect();
    const btnCx = btnRect.left + btnRect.width / 2;
    const btnCy = btnRect.top + btnRect.height / 2;

    const STAGGER = 40; // ms between each ghost launch
    const FLIGHT = 350; // ms per ghost flight

    rows.forEach((row, i) => {
      const pin = row.querySelector('.dn-note-pin') as HTMLElement | null;
      if (!pin) return;

      const pinRect = pin.getBoundingClientRect();
      const ghost = document.createElement('div');
      ghost.className = 'dn-copy-ghost';
      ghost.textContent = pin.textContent;

      // Start at the pin's screen position
      ghost.style.left = `${pinRect.left}px`;
      ghost.style.top = `${pinRect.top}px`;
      ghost.style.width = `${pinRect.width}px`;
      ghost.style.height = `${pinRect.height}px`;
      document.body.appendChild(ghost);

      const dx = btnCx - (pinRect.left + pinRect.width / 2);
      const dy = btnCy - (pinRect.top + pinRect.height / 2);

      ghost.animate(
        [
          { transform: 'translate(0, 0) scale(1)', opacity: 1 },
          { transform: `translate(${dx}px, ${dy}px) scale(0.3)`, opacity: 0.4 },
        ],
        {
          duration: FLIGHT,
          delay: i * STAGGER,
          easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
          fill: 'forwards',
        },
      ).onfinish = () => ghost.remove();
    });
  }

  function showCopyFeedback(): void {
    animateNotesToButton();

    // Delay the icon swap until ghosts start landing
    const rows = notesListEl.querySelectorAll('.dn-note-row');
    const landDelay = Math.min(rows.length, 8) * 40 + 100;

    setTimeout(() => {
      setIconWithPop(copyBtn, ICONS.check);
      copyBtn.classList.add('dn-action-btn--copied');
      typewriter.type('Copied!');
    }, landDelay);

    if (copyTimer) clearTimeout(copyTimer);
    copyTimer = setTimeout(() => {
      setIconWithPop(copyBtn, ICONS.clipboard);
      copyBtn.classList.remove('dn-action-btn--copied');
      copyTimer = null;
    }, landDelay + 1500);
  }

  let exportTimer: ReturnType<typeof setTimeout> | null = null;
  function showExportFeedback(): void {
    setIconWithPop(exportBtn, ICONS.check);
    exportBtn.classList.add('dn-action-btn--success');
    typewriter.type('Exported!');
    if (exportTimer) clearTimeout(exportTimer);
    exportTimer = setTimeout(() => {
      setIconWithPop(exportBtn, ICONS.download);
      exportBtn.classList.remove('dn-action-btn--success');
      exportTimer = null;
    }, 1500);
  }

  let clearTimer: ReturnType<typeof setTimeout> | null = null;
  function showClearFeedback(): void {
    setIconWithPop(clearBtn, ICONS.check);
    clearBtn.classList.add('dn-action-btn--success');
    typewriter.type('Cleared');
    if (clearTimer) clearTimeout(clearTimer);
    clearTimer = setTimeout(() => {
      setIconWithPop(clearBtn, ICONS.trash);
      clearBtn.classList.remove('dn-action-btn--success');
      clearTimer = null;
    }, 1500);
  }

  // Export button (download)
  const exportBtn = makeActionBtn(ICONS.download, 'Export as JSON (D)', () => {
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

  // --- Typewriter for file label ---
  const typewriter = createTypewriter(fileLabel);

  // --- Notes list / empty state container ---
  const notesListEl = document.createElement('div');
  notesListEl.className = 'dn-notes-list';
  container.appendChild(notesListEl);

  // --- Render functions ---

  function getAnnotations(): Annotation[] {
    return manager.getAll();
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

    // Note text (read-only — editing happens in the inline popover)
    const textEl = document.createElement('div');
    textEl.className = 'dn-note-text';
    textEl.textContent = annotation.text || 'No note';
    if (!annotation.text) {
      textEl.classList.add('dn-note-text--empty');
    }

    // Delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'dn-note-delete';
    deleteBtn.title = 'Delete annotation';
    deleteBtn.innerHTML = ICONS.trash;
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
    // Typewriter feedback with annotation count
    const count = manager.getAll().length;
    typewriter.type(`Added #${count}`);
    // Select the new annotation
    selectedId = e.annotation.id;
    renderNotesList();
    // Scroll to the new row in the sidebar
    requestAnimationFrame(() => {
      const row = notesListEl.querySelector(
        `[data-annotation-id="${e.annotation.id}"]`,
      ) as HTMLElement | null;
      if (row) {
        row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });
  }));

  unsubs.push(bus.on('annotation:update', () => {
    renderNotesList();
  }));

  unsubs.push(bus.on('annotation:delete', () => {
    const remaining = manager.getAll().length;
    typewriter.type(remaining > 0 ? `${remaining} remaining` : 'All clear');
    renderNotesList();
  }));

  unsubs.push(bus.on('session:cleared', () => {
    selectedId = null;
    showClearFeedback();
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

  unsubs.push(bus.on('content:loaded', (e) => {
    typewriter.setOriginal(e.sourceName);
  }));

  unsubs.push(bus.on('content:unloaded', () => {
    typewriter.setOriginal('');
  }));

  unsubs.push(bus.on('output:copy', () => {
    showCopyFeedback();
  }));

  unsubs.push(bus.on('output:download', () => {
    showExportFeedback();
  }));

  unsubs.push(bus.on('pins:visibility', (e) => {
    pinsVisible = e.visible;
    setIconWithPop(pinsBtn, pinsVisible ? ICONS.eye : ICONS.eyeOff);
    typewriter.type(pinsVisible ? 'Pins visible' : 'Pins hidden');
  }));

  // Initial render (empty state)
  renderNotesList();

  // --- Public API ---

  return {
    destroy(): void {
      for (const unsub of unsubs) unsub();
      if (copyTimer) clearTimeout(copyTimer);
      if (exportTimer) clearTimeout(exportTimer);
      if (clearTimer) clearTimeout(clearTimer);
      typewriter.destroy();
      // Restore original picker methods
      picker.activate = originalActivate;
      picker.deactivate = originalDeactivate;
      actionBar.remove();
      notesListEl.remove();
    },
  };
}
