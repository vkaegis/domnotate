// ============================================================
// Domnotate — Notes Panel (sidebar content)
// ============================================================

import type {
  EventBus,
  AnnotationManager,
  Annotation,
  EditManager,
  SlideObserver,
  TextEdit,
  ViewScope,
} from '@/types/core';
import { fallbackScopeLabel, scopesMatch } from '@/annotations/view-scope';
import { attachTooltip } from '@/tooltip/tooltip';

// --- SVG Icons (14px viewBox 24) ---
const ICONS = {
  pencil: `<svg viewBox="0 0 24 24"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>`,
  type: `<svg viewBox="0 0 24 24"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>`,
  eye: `<svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`,
  eyeOff: `<svg viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`,
  clipboard: `<svg viewBox="0 0 24 24"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>`,
  link: `<svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L11.5 4.43"/><path d="M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 0 0 7.07 7.07l1.33-1.33"/></svg>`,
  download: `<svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
  trash: `<svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`,
  x: `<svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  check: `<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>`,
  more: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/><circle cx="5" cy="12" r="1.5"/></svg>`,
} as const;

// Unique-per-instance id source so each panel's disclosure trigger can point at
// its own overflow group via aria-controls.
let overflowMenuSeq = 0;

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
  editor: { activate(): void; deactivate(): void; isActive(): boolean; revertEdit(edit: TextEdit): boolean },
  editManager: EditManager,
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

  // Edit text button (T)
  const editBtn = makeActionBtn(ICONS.type, 'Edit Text', 'T', 'Edit text in place (T)', () => {
    if (editor.isActive()) {
      editor.deactivate();
    } else {
      editor.activate();
    }
  });

  // --- Sync edit button + enforce picker/editor mutual exclusion ---
  const originalEditorActivate = editor.activate.bind(editor);
  const originalEditorDeactivate = editor.deactivate.bind(editor);

  editor.activate = () => {
    const wasActive = editor.isActive();
    // Only one mode at a time.
    picker.deactivate();
    originalEditorActivate();
    if (!wasActive && editor.isActive()) {
      editBtn.classList.add('dn-action-btn--active');
    }
  };

  editor.deactivate = () => {
    const wasActive = editor.isActive();
    originalEditorDeactivate();
    if (wasActive) {
      editBtn.classList.remove('dn-action-btn--active');
    }
  };

  // Activating the picker turns off edit mode (and vice-versa above).
  const pickerActivateWithSync = picker.activate;
  picker.activate = () => {
    editor.deactivate();
    pickerActivateWithSync();
  };

  // Divider after annotate/edit
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

  // --- Overflow menu (Hide Pins + Download) ---
  const overflow = document.createElement('div');
  overflow.className = 'dn-overflow';

  // This is a disclosure that reveals a group of ordinary action buttons, not
  // an ARIA menu widget: Tab moves between the buttons and there is no
  // arrow-key roving focus, so we avoid role="menu"/aria-haspopup (which would
  // promise a menu keyboard model we don't implement) in favor of the
  // disclosure pattern — aria-expanded + aria-controls on the trigger, and a
  // labelled group for the revealed buttons.
  const overflowMenuId = `dn-overflow-menu-${overflowMenuSeq++}`;

  const moreBtn = makeActionBtn(ICONS.more, 'More', null, 'More options', () => {
    toggleOverflow();
  });
  moreBtn.classList.add('dn-overflow__trigger');
  moreBtn.setAttribute('aria-expanded', 'false');
  moreBtn.setAttribute('aria-controls', overflowMenuId);

  const overflowMenu = document.createElement('div');
  overflowMenu.className = 'dn-overflow__menu';
  overflowMenu.id = overflowMenuId;
  overflowMenu.setAttribute('role', 'group');
  overflowMenu.setAttribute('aria-label', 'More actions');
  overflowMenu.hidden = true;
  // Hide Pins, Download, and Clear live in here now that the bar is crowded.
  overflowMenu.appendChild(pinsBtn);
  overflowMenu.appendChild(exportBtn);
  overflowMenu.appendChild(clearBtn);

  overflow.appendChild(moreBtn);
  overflow.appendChild(overflowMenu);

  let overflowOpen = false;
  function openOverflow(): void {
    if (overflowOpen) return;
    overflowOpen = true;
    overflowMenu.hidden = false;
    moreBtn.classList.add('dn-overflow__trigger--open');
    moreBtn.setAttribute('aria-expanded', 'true');
  }
  function closeOverflow(): void {
    if (!overflowOpen) return;
    overflowOpen = false;
    // If focus lives inside the group we're about to hide (keyboard user tabbed
    // in, pressed Escape, or activated an item), return it to the trigger so it
    // doesn't get stranded on a now-[hidden] button. Outside/mouse dismissals
    // leave focus wherever it already was.
    const focusWasInside = overflowMenu.contains(document.activeElement);
    overflowMenu.hidden = true;
    moreBtn.classList.remove('dn-overflow__trigger--open');
    moreBtn.setAttribute('aria-expanded', 'false');
    if (focusWasInside) moreBtn.focus();
  }
  function toggleOverflow(): void {
    if (overflowOpen) closeOverflow();
    else openOverflow();
  }

  // Selecting an item runs its action (bus event), then dismisses the menu.
  overflowMenu.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('.dn-action-btn')) closeOverflow();
  });

  // Dismiss on outside click / Escape.
  const onDocPointerDown = (e: MouseEvent) => {
    if (overflowOpen && !overflow.contains(e.target as Node)) closeOverflow();
  };
  const onDocKeydown = (e: KeyboardEvent) => {
    if (overflowOpen && e.key === 'Escape') {
      // Escape should only dismiss the menu here. Stop it before it reaches the
      // global keyboard-shortcut handler, which would otherwise also exit
      // edit/annotate mode or deselect the current annotation. Capture phase +
      // stopImmediatePropagation makes this win regardless of listener order.
      e.preventDefault();
      e.stopImmediatePropagation();
      closeOverflow();
    }
  };
  document.addEventListener('mousedown', onDocPointerDown);
  document.addEventListener('keydown', onDocKeydown, true);
  unsubs.push(() => document.removeEventListener('mousedown', onDocPointerDown));
  unsubs.push(() => document.removeEventListener('keydown', onDocKeydown, true));

  tabBar.appendChild(annotateBtn);
  tabBar.appendChild(editBtn);
  tabBar.appendChild(divider);
  tabBar.appendChild(copyBtn);
  tabBar.appendChild(shareBtn);
  tabBar.appendChild(overflow);

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
      const slideScopes = scopes.filter((scope) => scope.kind === 'slide');
      const scopesToSearch = slideScopes.length > 0 ? slideScopes : scopes;
      const legacyScope = scopesToSearch.find((scope) => scope.index === annotation.slideIndex);
      if (legacyScope) {
        return {
          key: `legacy:${legacyScope.id || legacyScope.selector}`,
          label: fallbackScopeLabel(legacyScope),
          index: legacyScope.index,
          active: activeScopes.some((activeScope) => scopesMatch(legacyScope, activeScope)),
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
    const edits = editManager.getAll();
    notesListEl.innerHTML = '';

    if (annotations.length === 0 && edits.length === 0) {
      renderEmptyState();
      updateActionBarState(true);
      return;
    }

    updateActionBarState(false);

    if (annotations.length > 0) {
      renderAnnotationRows(annotations);
    }

    renderEditRows(edits);
  }

  function renderAnnotationRows(annotations: Annotation[]): void {
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
    // Annotate is always active; the secondary actions need at least one
    // annotation to do anything, so they're disabled (with an explanatory
    // tooltip) when the list is empty.
    const secondary: [HTMLButtonElement, string][] = [
      [pinsBtn, 'No pins to hide yet. Add an annotation first.'],
      [copyBtn, 'Nothing to copy yet. Add an annotation first.'],
      [exportBtn, 'Nothing to download yet. Add an annotation first.'],
      [clearBtn, 'Nothing to clear yet. Add an annotation first.'],
    ];
    for (const [btn, reason] of secondary) {
      setActionBtnDisabled(btn, isEmpty ? reason : null);
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

  function renderEditRows(edits: TextEdit[]): void {
    if (edits.length === 0) return;

    const header = document.createElement('div');
    header.className = 'dn-slide-group-header';
    header.textContent = 'Text Edits';
    notesListEl.appendChild(header);

    edits.forEach((edit) => {
      notesListEl.appendChild(createEditRow(edit));
    });
  }

  function createEditRow(edit: TextEdit): HTMLElement {
    const row = document.createElement('div');
    row.className = 'dn-note-row dn-edit-row';
    row.dataset.editId = edit.id;

    const pin = document.createElement('div');
    pin.className = 'dn-note-pin';
    pin.textContent = '✎';

    const textEl = document.createElement('div');
    textEl.className = 'dn-note-text';
    // Show the before → after change; the DOM preview shows the full formatting.
    const oldEl = document.createElement('span');
    oldEl.className = 'dn-edit-old';
    oldEl.textContent = edit.oldText;
    const arrow = document.createElement('span');
    arrow.className = 'dn-edit-arrow';
    arrow.textContent = ' → ';
    const newEl = document.createElement('span');
    newEl.className = 'dn-edit-new';
    newEl.textContent = edit.newText;
    textEl.append(oldEl, arrow, newEl);

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'dn-note-delete';
    deleteBtn.title = 'Discard edit';
    deleteBtn.innerHTML = ICONS.trash;
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // Revert the live DOM to the pre-edit text and drop the record. Annotation
      // previews are derived from the live DOM at serialize time, so no explicit
      // preview restore is needed here.
      editor.revertEdit(edit);
      editManager.delete(edit.id);
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
    // Enabled buttons show no tooltip — the visible label is self-explanatory.
    // `aria-label` still carries the fuller description (with shortcut) for
    // assistive tech without producing a visual tooltip. A visual tooltip only
    // appears while the button is disabled (see setActionBtnDisabled).
    btn.setAttribute('aria-label', title);
    btn.dataset.baseLabel = title;
    unsubs.push(attachTooltip(btn));

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

    btn.addEventListener('click', (e) => {
      // Disabled buttons keep pointer events (so their tooltip shows on hover),
      // so the action itself must be guarded here.
      if (btn.getAttribute('aria-disabled') === 'true') {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      onClick();
    });
    return btn;
  }

  // Disable/enable an action button while keeping it hoverable so the tooltip
  // (the "why") stays visible. A disabled action must carry a reason; an enabled
  // one carries no tooltip at all.
  function setActionBtnDisabled(btn: HTMLButtonElement, reason: string | null): void {
    if (reason) {
      btn.classList.add('dn-action-btn--dimmed');
      btn.setAttribute('aria-disabled', 'true');
      btn.dataset.tooltip = reason;
      btn.setAttribute('aria-label', reason);
    } else {
      btn.classList.remove('dn-action-btn--dimmed');
      btn.removeAttribute('aria-disabled');
      delete btn.dataset.tooltip;
      btn.setAttribute('aria-label', btn.dataset.baseLabel ?? '');
    }
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

  unsubs.push(bus.on('edit:create', () => {
    renderNotesList();
  }));

  unsubs.push(bus.on('edit:update', () => {
    renderNotesList();
  }));

  unsubs.push(bus.on('edit:delete', () => {
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
      // Restore original picker + editor methods
      picker.activate = originalActivate;
      picker.deactivate = originalDeactivate;
      editor.activate = originalEditorActivate;
      editor.deactivate = originalEditorDeactivate;
      actionBar.remove();
      notesListEl.remove();
    },
  };
}
