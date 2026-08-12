// ============================================================
// Domnotate — extension keyboard shortcuts
// ============================================================
//
// The web app owns the whole document, so `keyboard/shortcuts.ts` can bind on
// `document` in the bubble phase and be sure it is the only listener. On a
// live page it is not: the host app has its own single-key bindings, and on
// dashboard.enterpret.com they fire first.
//
// So this binds on `window` in the capture phase, which runs ahead of a
// document-level handler in either phase, and takes a key away from the page
// only when it is one we claim. Everything else passes through untouched, so
// the app stays fully usable while Domnotate is active.

import { isTyping } from '@/keyboard/shortcuts';

export interface ExtensionShortcut {
  /** Matched case-insensitively against `event.key`. */
  key: string;
  label: string;
  action: () => void;
}

export interface ExtensionShortcutOptions {
  win?: Window;
  /** Our shadow host. Events from inside our own UI are never shortcuts. */
  hostEl: Element;
  shortcuts: ExtensionShortcut[];
}

function originatesIn(event: Event, hostEl: Element): boolean {
  const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
  return path.includes(hostEl) || event.target === hostEl;
}

/** True when the keystroke is a bare key press, not part of a chord. */
function isBareKey(event: KeyboardEvent): boolean {
  return !event.ctrlKey && !event.metaKey && !event.altKey;
}

/**
 * Claim our keys on the host page. Returns an uninstall function.
 */
export function installExtensionShortcuts(options: ExtensionShortcutOptions): () => void {
  const win = options.win ?? window;
  const { hostEl, shortcuts } = options;

  const byKey = new Map<string, ExtensionShortcut>();
  for (const shortcut of shortcuts) byKey.set(shortcut.key.toLowerCase(), shortcut);

  const onKeyDown = (event: KeyboardEvent): void => {
    // Typing a note. The sidebar's own guard already stops these reaching the
    // page; they are not commands either.
    if (originatesIn(event, hostEl)) return;
    if (!isBareKey(event)) return;

    // Focus is in one of the host app's own fields. Their text wins over our
    // shortcut, or annotating a page with a search box becomes impossible.
    if (isTyping(event)) return;

    const shortcut = byKey.get(event.key.toLowerCase());
    if (!shortcut) return;

    // Ours now. The host app must not also act on it.
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    shortcut.action();
  };

  win.addEventListener('keydown', onKeyDown, true);
  return () => win.removeEventListener('keydown', onKeyDown, true);
}
