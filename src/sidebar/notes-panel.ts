// ============================================================
// Domnotate — Notes Panel (sidebar content)
// ============================================================

import type { EventBus, AnnotationManager, Annotation, SlideObserver, ViewScope } from '@/types/core';
import { fallbackScopeLabel, scopesMatch } from '@/annotations/view-scope';

// --- SVG Icons (14px viewBox 24) ---
const ICONS = {
  pencil: `<svg viewBox="0 0 24 24"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>`,
  eye: `<svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`,
  eyeOff: `<svg viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`,
  clipboard: `<svg viewBox="0 0 24 24"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>`,
  link: `<svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L11.5 4.43"/><path d="M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 0 0 7.07 7.07l1.33-1.33"/></svg>`,
  download: `<svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
  trash: `<svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`,
  x: `<svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  check: `<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>`,
} as const;

// --- Icon pop helper ---

function setIconWithPop(btn: HTMLButtonElement, iconHtml: string): void {
  const iconSpan = btn.querySelector('.dn-action-btn__icon');
  if (iconSpan) {
    iconSpan.innerHTML = iconHtml;
  } else {
    btn.innerHTML = iconHtml;
  }
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
  slideObserver?: SlideObserver,
): { destroy(): void } {
  const unsubs: (() => void)[] = [];

  // --- State ---
  let selectedId: string | null = null;
  let pinsVisible = true;
  let copyTimer: ReturnType<typeof setTimeout> | null = null;
  let shareTimer: ReturnType<typeof setTimeout> | null = null;
  let shareBusy = false;

  // --- Action bar ---
  const actionBar = document.createElement('div');
  actionBar.className = 'dn-action-bar';

  const tabBar = document.createElement('div');
  tabBar.className = 'dn-tab-bar';

  // Annotate button (pencil)
  const annotateBtn = makeActionBtn(ICONS.pencil, 'Annotate', 'A', 'Annotate an element (A)', () => {
    if (picker.isActive()) {
      picker.deactivate();
    } else {
      picker.activate();
    }
  });
  // Pencil always shows terracotta to stand out from other muted icons
  annotateBtn.classList.add('dn-action-btn--accent');

  // --- Sync annotate button with picker state (handles keyboard shortcut toggles) ---
  const originalActivate = picker.activate.bind(picker);
  const originalDeactivate = picker.deactivate.bind(picker);

  picker.activate = () => {
    const wasActive = picker.isActive();
    originalActivate();
    if (!wasActive && picker.isActive()) {
      annotateBtn.classList.add('dn-action-btn--active');
    }
  };

  picker.deactivate = () => {
    const wasActive = picker.isActive();
    originalDeactivate();
    if (wasActive) {
      annotateBtn.classList.remove('dn-action-btn--active');
    }
  };

  // Divider after annotate
  const divider = document.createElement('div');
  divider.className = 'dn-tab-bar__divider';

  // Pins toggle (eye) — feedback handled by bus listener
  const pinsBtn = makeActionBtn(ICONS.eye, 'Hide Pins', 'H', 'Toggle pin visibility (H)', () => {
    pinsVisible = !pinsVisible;
    bus.emit({ type: 'pins:visibility', visible: pinsVisible });
  });

  // Copy button (clipboard)
  const copyBtn = makeActionBtn(ICONS.clipboard, 'Copy', 'C', 'Copy as Markdown (C)', () => {
    bus.emit({ type: 'output:copy', format: 'markdown' });
  });

  const shareBtn = makeActionBtn(ICONS.link, 'Share', null, 'Publish and copy share link', () => {
    if (shareBusy) return;
    bus.emit({ type: 'share:publish' });
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
    if (exportTimer) clearTimeout(exportTimer);
    exportTimer = setTimeout(() => {
      setIconWithPop(exportBtn, ICONS.download);
      exportBtn.classList.remove('dn-action-btn--success');
      exportTimer = null;
    }, 1500);
  }

  function setShareLabel(label: string): void {
    const shareLabel = shareBtn.querySelector('.dn-action-btn__label');
    if (shareLabel) shareLabel.textContent = label;
  }

  function showSharePublishing(): void {
    shareBusy = true;
    setShareLabel('Sharing');
    shareBtn.classList.add('dn-action-btn--loading');
  }

  function showShareFeedback(): void {
    shareBusy = false;
    shareBtn.classList.remove('dn-action-btn--loading');
    setShareLabel('Copied');
    setIconWithPop(shareBtn, ICONS.check);
    shareBtn.classList.add('dn-action-btn--success');
    if (shareTimer) clearTimeout(shareTimer);
    shareTimer = setTimeout(() => {
      setIconWithPop(shareBtn, ICONS.link);
      shareBtn.classList.remove('dn-action-btn--success');
      setShareLabel('Share');
      shareTimer = null;
    }, 1500);
  }

  function showShareError(): void {
    shareBusy = false;
    shareBtn.classList.remove('dn-action-btn--loading');
    setShareLabel('Share');
  }

  let clearTimer: ReturnType<typeof setTimeout> | null = null;
  function showClearFeedback(): void {
    setIconWithPop(clearBtn, ICONS.check);
    clearBtn.classList.add('dn-action-btn--success');
    if (clearTimer) clearTimeout(clearTimer);
    clearTimer = setTimeout(() => {
      setIconWithPop(clearBtn, ICONS.trash);
      clearBtn.classList.remove('dn-action-btn--success');
      clearTimer = null;
    }, 1500);
  }

  // Export button (download)
  const exportBtn = makeActionBtn(ICONS.download, 'Download', 'D', 'Download as JSON (D)', () => {
    bus.emit({ type: 'output:download', format: 'json' });
  });

  // Clear button (trash)
  let clearAnimating = false;
  const clearBtn = makeActionBtn(ICONS.trash, 'Clear', null, 'Clear all annotations', () => {
    if (clearAnimating) return;

    const rows = notesListEl.querySelectorAll('.dn-note-row, .dn-slide-group-header');
    if (rows.length === 0) {
      bus.emit({ type: 'session:cleared' });
      return;
    }

    clearAnimating = true;
    const STAGGER = 40;
    const DURATION = 120;
    let finished = 0;

    rows.forEach((row, i) => {
      const anim = (row as HTMLElement).animate(
        [
          { transform: 'translateX(0)', opacity: 1 },
          { transform: 'translateX(40px)', opacity: 0 },
        ],
        {
          duration: DURATION,
          delay: i * STAGGER,
          easing: 'linear',
          fill: 'forwards',
        },
      );
      anim.onfinish = () => {
        finished++;
        if (finished === rows.length) {
          clearAnimating = false;
          bus.emit({ type: 'session:cleared' });
        }
      };
    });
  });

  tabBar.appendChild(annotateBtn);
  tabBar.appendChild(divider);
  tabBar.appendChild(pinsBtn);
  tabBar.appendChild(copyBtn);
  tabBar.appendChild(shareBtn);
  tabBar.appendChild(exportBtn);
  tabBar.appendChild(clearBtn);

  actionBar.appendChild(tabBar);
  container.appendChild(actionBar);

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

  type NoteGroup = {
    key: string;
    label: string;
    index: number;
    active: boolean;
    annotations: Annotation[];
  };

  function getScopeGroupForAnnotation(
    annotation: Annotation,
    scopes: ViewScope[],
    activeScopes: ViewScope[],
  ): Omit<NoteGroup, 'annotations'> {
    if (annotation.viewScope) {
      return {
        key: `scope:${annotation.viewScope.id || annotation.viewScope.selector}`,
        label: fallbackScopeLabel(annotation.viewScope),
        index: annotation.viewScope.index,
        active: activeScopes.some((activeScope) => scopesMatch(annotation.viewScope!, activeScope)),
      };
    }

    if (annotation.slideIndex !== undefined) {
      const legacyScope = scopes.find((scope) => scope.index === annotation.slideIndex);
      if (legacyScope) {
        return {
          key: `legacy:${legacyScope.id || legacyScope.selector}`,
          label: fallbackScopeLabel(legacyScope),
          index: legacyScope.index,
          active: activeScopes.some((activeScope) => legacyScope.index === activeScope.index),
        };
      }

      return {
        key: `legacy-slide:${annotation.slideIndex}`,
        label: `Slide ${annotation.slideIndex + 1}`,
        index: annotation.slideIndex,
        active: false,
      };
    }

    return {
      key: 'general',
      label: 'General',
      index: -1,
      active: false,
    };
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

    const scopes = slideObserver?.getScopes() ?? [];
    const activeScopes = slideObserver?.getActiveScopes() ?? [];
    const isScopedContent = scopes.length > 0;

    if (isScopedContent) {
      const groups = new Map<string, NoteGroup>();
      for (const ann of annotations) {
        const groupInfo = getScopeGroupForAnnotation(ann, scopes, activeScopes);
        if (!groups.has(groupInfo.key)) {
          groups.set(groupInfo.key, { ...groupInfo, annotations: [] });
        }
        groups.get(groupInfo.key)!.annotations.push(ann);
      }

      const sortedGroups = Array.from(groups.values()).sort((a, b) => {
        if (a.key === 'general') return -1;
        if (b.key === 'general') return 1;
        return a.index - b.index;
      });

      for (const group of sortedGroups) {
        const header = document.createElement('div');
        header.className = 'dn-slide-group-header';
        if (group.active) {
          header.classList.add('dn-slide-group-header--active');
        }
        header.textContent = group.label;
        notesListEl.appendChild(header);

        for (const annotation of group.annotations) {
          const index = getAnnotationIndex(annotation.id);
          notesListEl.appendChild(createNoteRow(annotation, index));
        }
      }
    } else {
      for (const annotation of annotations) {
        const index = getAnnotationIndex(annotation.id);
        notesListEl.appendChild(createNoteRow(annotation, index));
      }
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
    text.innerHTML = 'Press <kbd>A</kbd> to annotate an element';

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

    // Row click → main.ts annotation:select handler owns scope activation +
    // animation-frame timing before reanchoring, so this only emits the event.
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
    label: string,
    shortcut: string | null,
    title: string,
    onClick: () => void,
  ): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.className = 'dn-action-btn';
    btn.title = title;

    const iconSpan = document.createElement('span');
    iconSpan.className = 'dn-action-btn__icon';
    iconSpan.innerHTML = icon;
    btn.appendChild(iconSpan);

    const labelSpan = document.createElement('span');
    labelSpan.className = 'dn-action-btn__label';
    labelSpan.textContent = label;
    btn.appendChild(labelSpan);

    if (shortcut) {
      const kbd = document.createElement('kbd');
      kbd.className = 'dn-action-btn__shortcut';
      kbd.textContent = shortcut;
      btn.appendChild(kbd);
    }

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

  unsubs.push(bus.on('output:copy', () => {
    showCopyFeedback();
  }));

  unsubs.push(bus.on('output:download', () => {
    showExportFeedback();
  }));

  unsubs.push(bus.on('share:publishing', () => {
    showSharePublishing();
  }));

  unsubs.push(bus.on('share:copied', () => {
    showShareFeedback();
  }));

  unsubs.push(bus.on('share:error', () => {
    showShareError();
  }));

  unsubs.push(bus.on('slide:changed', () => {
    renderNotesList();
  }));

  unsubs.push(bus.on('scope:changed', () => {
    renderNotesList();
  }));

  unsubs.push(bus.on('pins:visibility', (e) => {
    pinsVisible = e.visible;
    setIconWithPop(pinsBtn, pinsVisible ? ICONS.eye : ICONS.eyeOff);
    const pinLabel = pinsBtn.querySelector('.dn-action-btn__label');
    if (pinLabel) pinLabel.textContent = pinsVisible ? 'Hide Pins' : 'Show Pins';
  }));

  // Initial render (empty state)
  renderNotesList();

  // --- Public API ---

  return {
    destroy(): void {
      for (const unsub of unsubs) unsub();
      if (copyTimer) clearTimeout(copyTimer);
      if (shareTimer) clearTimeout(shareTimer);
      if (exportTimer) clearTimeout(exportTimer);
      if (clearTimer) clearTimeout(clearTimer);
      // Restore original picker methods
      picker.activate = originalActivate;
      picker.deactivate = originalDeactivate;
      actionBar.remove();
      notesListEl.remove();
    },
  };
}
