// ============================================================
// Domnotate — Toolbar
// ============================================================

import type { EventBus, AppMode } from '@/types/core';
import './toolbar.css';

// --- Inline SVG icons (18x18 viewBox) ---

const ICONS = {
  pencil: `<svg viewBox="0 0 24 24"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>`,
  eye: `<svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`,
  eyeOff: `<svg viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`,
  clipboard: `<svg viewBox="0 0 24 24"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>`,
  download: `<svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
  trash: `<svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`,
  check: `<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>`,
  x: `<svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
} as const;

export function createToolbar(
  container: HTMLElement,
  bus: EventBus,
): { show(): void; hide(): void; destroy(): void } {
  // --- State ---
  let mode: AppMode = 'browse';
  let pinsVisible = true;
  let annotationCount = 0;
  const unsubs: (() => void)[] = [];

  // --- Build DOM ---
  const el = document.createElement('div');
  el.className = 'dn-toolbar dn-toolbar--hidden';

  // Helper: create a button
  function makeBtn(
    icon: string,
    title: string,
    onClick: () => void,
  ): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.className = 'dn-toolbar-btn';
    btn.title = title;
    btn.innerHTML = icon;
    btn.addEventListener('click', onClick);
    return btn;
  }

  // Helper: create divider
  function makeDivider(): HTMLElement {
    const d = document.createElement('div');
    d.className = 'dn-toolbar-divider';
    return d;
  }

  // 1. Annotate toggle
  const annotateBtn = makeBtn(ICONS.pencil, 'Toggle annotation mode', () => {
    const next: AppMode = mode === 'browse' ? 'annotate' : 'browse';
    bus.emit({ type: 'mode:change', mode: next });
  });
  // Badge
  const badge = document.createElement('span');
  badge.className = 'dn-toolbar-badge';
  badge.style.display = 'none';
  annotateBtn.appendChild(badge);

  // 2. Show/hide pins
  const visibilityBtn = makeBtn(ICONS.eye, 'Toggle pin visibility', () => {
    pinsVisible = !pinsVisible;
    bus.emit({ type: 'pins:visibility', visible: pinsVisible });
  });

  // 3. Copy (with "copied" feedback)
  let copyTimer: ReturnType<typeof setTimeout> | null = null;
  const copyBtn = makeBtn(ICONS.clipboard, 'Copy as Markdown', () => {
    bus.emit({ type: 'output:copy', format: 'markdown' });
    // Show check icon feedback
    copyBtn.innerHTML = ICONS.check;
    copyBtn.classList.add('dn-toolbar-btn--copied');
    if (copyTimer) clearTimeout(copyTimer);
    copyTimer = setTimeout(() => {
      copyBtn.innerHTML = ICONS.clipboard;
      copyBtn.classList.remove('dn-toolbar-btn--copied');
      copyTimer = null;
    }, 1500);
  });

  // 4. Download
  const downloadBtn = makeBtn(ICONS.download, 'Download JSON', () => {
    bus.emit({ type: 'output:download', format: 'json' });
  });

  // 5. Clear all
  const clearBtn = makeBtn(ICONS.trash, 'Clear all annotations', () => {
    bus.emit({ type: 'session:cleared' });
  });

  // 6. Back / close
  const backBtn = makeBtn(ICONS.x, 'Back', () => {
    bus.emit({ type: 'content:unloaded' });
  });

  // Assemble toolbar
  el.appendChild(annotateBtn);
  el.appendChild(visibilityBtn);
  el.appendChild(makeDivider());
  el.appendChild(copyBtn);
  el.appendChild(downloadBtn);
  el.appendChild(makeDivider());
  el.appendChild(clearBtn);
  el.appendChild(backBtn);

  container.appendChild(el);

  // --- Sync state from bus ---

  // Mode changes
  unsubs.push(
    bus.on('mode:change', (e) => {
      mode = e.mode;
      annotateBtn.classList.toggle('dn-toolbar-btn--active', mode === 'annotate');
    }),
  );

  // Pins visibility (external toggle)
  unsubs.push(
    bus.on('pins:visibility', (e) => {
      pinsVisible = e.visible;
      visibilityBtn.innerHTML = pinsVisible ? ICONS.eye : ICONS.eyeOff;
    }),
  );

  // Annotation count tracking
  function updateBadge(count: number): void {
    annotationCount = count;
    if (annotationCount > 0) {
      badge.textContent = String(annotationCount);
      badge.style.display = '';
    } else {
      badge.style.display = 'none';
    }
  }

  unsubs.push(
    bus.on('annotation:create', () => updateBadge(annotationCount + 1)),
  );
  unsubs.push(
    bus.on('annotation:delete', () => updateBadge(Math.max(0, annotationCount - 1))),
  );
  unsubs.push(
    bus.on('session:loaded', (e) => updateBadge(e.session.annotations.length)),
  );
  unsubs.push(
    bus.on('session:cleared', () => updateBadge(0)),
  );

  // --- Public API ---

  return {
    show() {
      el.classList.remove('dn-toolbar--hidden');
    },
    hide() {
      el.classList.add('dn-toolbar--hidden');
    },
    destroy() {
      for (const unsub of unsubs) unsub();
      el.remove();
    },
  };
}
