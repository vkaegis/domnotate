// ============================================================
// Domnotate — Keyboard Shortcuts
// ============================================================

import type { EventBus } from '@/types/core';

export interface ShortcutDef {
  key: string;
  label: string;
  action: () => void;
  requiresContent: boolean;
  allowWhileTyping: boolean;
}

interface ShortcutDeps {
  bus: EventBus;
  picker: { activate(): void; deactivate(): void; isActive(): boolean };
  isContentLoaded: () => boolean;
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

/** Navigation keys that should be forwarded to the iframe for slide decks etc. */
const NAV_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', ' ']);

export function createKeyboardShortcuts(deps: ShortcutDeps): {
  destroy(): void;
  getShortcuts(): ShortcutDef[];
  attachIframe(iframe: HTMLIFrameElement): void;
  detachIframe(): void;
} {
  const { bus, picker, isContentLoaded, getSelectedAnnotationId, getPinsVisible } = deps;

  let iframeEl: HTMLIFrameElement | null = null;
  let iframeHandler: ((e: KeyboardEvent) => void) | null = null;

  const shortcuts: ShortcutDef[] = [
    {
      key: 'a',
      label: 'Toggle annotate mode',
      requiresContent: true,
      allowWhileTyping: false,
      action() {
        if (picker.isActive()) {
          picker.deactivate();
        } else {
          picker.activate();
        }
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
      key: 'Escape',
      label: 'Deselect / deactivate picker',
      requiresContent: false,
      allowWhileTyping: true,
      action() {
        if (picker.isActive()) {
          picker.deactivate();
        }
        if (getSelectedAnnotationId()) {
          bus.emit({ type: 'annotation:deselect' });
        }
      },
    },
  ];

  function handler(e: KeyboardEvent): void {
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

    // Forward navigation keys to the iframe so slide decks keep working
    // even when the parent document has focus
    if (isContentLoaded() && !typing && NAV_KEYS.has(e.key) && iframeEl?.contentDocument) {
      const iframeDoc = iframeEl.contentDocument;
      iframeDoc.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: e.key,
          code: e.code,
          bubbles: true,
          cancelable: true,
        }),
      );
      e.preventDefault();
    }
  }

  document.addEventListener('keydown', handler);

  function attachIframe(iframe: HTMLIFrameElement): void {
    detachIframe();
    iframeEl = iframe;

    const doc = iframe.contentDocument;
    if (!doc) return;

    // Listen for shortcuts on the iframe document so they work when iframe has focus
    iframeHandler = (e: KeyboardEvent) => {
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
    };

    doc.addEventListener('keydown', iframeHandler);
  }

  function detachIframe(): void {
    if (iframeEl && iframeHandler) {
      const doc = iframeEl.contentDocument;
      if (doc) {
        doc.removeEventListener('keydown', iframeHandler);
      }
    }
    iframeHandler = null;
    iframeEl = null;
  }

  return {
    destroy() {
      document.removeEventListener('keydown', handler);
      detachIframe();
    },
    getShortcuts() {
      return shortcuts;
    },
    attachIframe,
    detachIframe,
  };
}
