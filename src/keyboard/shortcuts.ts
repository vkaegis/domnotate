// ============================================================
// Domnotate — Keyboard Shortcuts
// ============================================================

import type { EventBus, AppMode } from '@/types/core';

export interface ShortcutDef {
  key: string;
  label: string;
  action: () => void;
  requiresContent: boolean;
  allowWhileTyping: boolean;
}

interface ShortcutDeps {
  bus: EventBus;
  commentPopup: { hide(): void; isVisible(): boolean };
  settingsPanel: { open(): void };
  isContentLoaded: () => boolean;
  getMode: () => AppMode;
  getSelectedAnnotationId: () => string | null;
  getPinsVisible: () => boolean;
}

function isTyping(e: KeyboardEvent): boolean {
  const target = e.target as HTMLElement | null;
  if (!target) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return true;
  if (target.isContentEditable) return true;
  return false;
}

export function createKeyboardShortcuts(deps: ShortcutDeps): {
  destroy(): void;
  getShortcuts(): ShortcutDef[];
} {
  const { bus, commentPopup, settingsPanel, isContentLoaded, getMode, getSelectedAnnotationId, getPinsVisible } = deps;

  const shortcuts: ShortcutDef[] = [
    {
      key: 'a',
      label: 'Toggle annotate mode',
      requiresContent: true,
      allowWhileTyping: false,
      action() {
        const next: AppMode = getMode() === 'browse' ? 'annotate' : 'browse';
        bus.emit({ type: 'mode:change', mode: next });
      },
    },
    {
      key: 'h',
      label: 'Toggle pin visibility',
      requiresContent: true,
      allowWhileTyping: false,
      action() {
        bus.emit({ type: 'pins:visibility', visible: !getPinsVisible() });
      },
    },
    {
      key: 'c',
      label: 'Copy as Markdown',
      requiresContent: true,
      allowWhileTyping: false,
      action() {
        bus.emit({ type: 'output:copy', format: 'markdown' });
      },
    },
    {
      key: 'd',
      label: 'Download JSON',
      requiresContent: true,
      allowWhileTyping: false,
      action() {
        bus.emit({ type: 'output:download', format: 'json' });
      },
    },
    {
      key: 'Delete',
      label: 'Delete selected annotation',
      requiresContent: true,
      allowWhileTyping: false,
      action() {
        const id = getSelectedAnnotationId();
        if (id) {
          bus.emit({ type: 'annotation:delete', id });
        }
      },
    },
    {
      key: 'Backspace',
      label: 'Delete selected annotation',
      requiresContent: true,
      allowWhileTyping: false,
      action() {
        const id = getSelectedAnnotationId();
        if (id) {
          bus.emit({ type: 'annotation:delete', id });
        }
      },
    },
    {
      key: '?',
      label: 'Open settings & shortcuts',
      requiresContent: true,
      allowWhileTyping: false,
      action() {
        settingsPanel.open();
      },
    },
    {
      key: 'Escape',
      label: 'Exit mode / close popup',
      requiresContent: false,
      allowWhileTyping: true,
      action() {
        if (commentPopup.isVisible()) {
          commentPopup.hide();
        }
        if (getMode() === 'annotate') {
          bus.emit({ type: 'mode:change', mode: 'browse' });
        }
      },
    },
  ];

  function handler(e: KeyboardEvent): void {
    // Ignore events with modifier keys (except Shift for ?)
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const typing = isTyping(e);

    for (const shortcut of shortcuts) {
      const matchKey = shortcut.key.length === 1 ? shortcut.key.toLowerCase() : shortcut.key;
      if (key !== matchKey) continue;

      if (typing && !shortcut.allowWhileTyping) continue;
      if (shortcut.requiresContent && !isContentLoaded()) continue;

      e.preventDefault();
      shortcut.action();
      return;
    }
  }

  document.addEventListener('keydown', handler);

  return {
    destroy() {
      document.removeEventListener('keydown', handler);
    },
    getShortcuts() {
      return shortcuts;
    },
  };
}
