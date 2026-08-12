// ============================================================
// Domnotate — MV3 background service worker
// ============================================================
//
// The only privileged code in the extension. It does exactly one thing: on the
// toolbar icon click (a user gesture, which is what `activeTab` is granted by),
// inject both content scripts into the active tab.
//
// Both worlds go in together, once per activation (plan §3.4) — no per-pick
// round trip, and no broad host permissions.

/**
 * Minimal structural types for the slice of the Chrome extension API used
 * here. Avoids a `@types/chrome` dependency for three call sites and keeps the
 * injector testable with a plain object.
 */
export interface ChromeTab {
  id?: number;
}

export interface ChromeScriptingApi {
  executeScript(injection: {
    target: { tabId: number };
    files: string[];
    world?: 'MAIN' | 'ISOLATED';
  }): Promise<unknown>;
}

export interface ChromeActionApi {
  onClicked: { addListener(cb: (tab: ChromeTab) => void): void };
}

export interface ChromeCommandsApi {
  onCommand: { addListener(cb: (command: string, tab?: ChromeTab) => void): void };
}

export interface ChromeTabsApi {
  query(info: { active: true; currentWindow: true }): Promise<ChromeTab[]>;
}

export interface ChromeApi {
  scripting: ChromeScriptingApi;
  action: ChromeActionApi;
  commands?: ChromeCommandsApi;
  tabs?: ChromeTabsApi;
}

/** Declared in the manifest; rebindable at chrome://extensions/shortcuts. */
export const TOGGLE_COMMAND = 'toggle-domnotate';

export const MAIN_WORLD_FILE = 'content-main.js';
export const ISOLATED_WORLD_FILE = 'content-isolated.js';

/**
 * Inject both worlds into `tab`.
 *
 * MAIN goes first so its responder is listening before the UI can request a
 * hint. Resolves `false` when there is nothing to inject into (no tab id, or
 * a page the extension is not allowed to touch such as chrome://).
 */
export async function injectDomnotate(chromeApi: ChromeApi, tab: ChromeTab): Promise<boolean> {
  const tabId = tab.id;
  if (typeof tabId !== 'number') return false;

  try {
    await chromeApi.scripting.executeScript({
      target: { tabId },
      files: [MAIN_WORLD_FILE],
      world: 'MAIN',
    });
    await chromeApi.scripting.executeScript({
      target: { tabId },
      files: [ISOLATED_WORLD_FILE],
      world: 'ISOLATED',
    });
    return true;
  } catch (error) {
    // Restricted pages (chrome://, the Web Store, a PDF viewer) reject
    // injection. Nothing to recover — surface it and stay quiet in the UI.
    console.warn('[Domnotate] could not inject into this page:', error);
    return false;
  }
}

export function registerActionHandler(chromeApi: ChromeApi): void {
  chromeApi.action.onClicked.addListener((tab) => {
    void injectDomnotate(chromeApi, tab);
  });
}

/**
 * The keyboard route to the same injection.
 *
 * A `commands` shortcut counts as a user gesture, so it grants `activeTab`
 * exactly as the icon click does — no host permissions needed for this.
 *
 * Chrome passes the active tab to the listener, but only on some versions, so
 * fall back to querying for it. A custom command is used rather than the
 * built-in `_execute_action` because that one's behaviour depends on whether
 * the action has a popup, and ours deliberately does not have one.
 */
export function registerCommandHandler(chromeApi: ChromeApi): void {
  if (!chromeApi.commands) return;

  chromeApi.commands.onCommand.addListener((command, tab) => {
    if (command !== TOGGLE_COMMAND) return;

    void (async () => {
      const target = tab ?? (await chromeApi.tabs?.query({ active: true, currentWindow: true }))?.[0];
      if (target) await injectDomnotate(chromeApi, target);
    })();
  });
}

declare const chrome: ChromeApi | undefined;

if (typeof chrome !== 'undefined' && chrome?.action) {
  registerActionHandler(chrome);
  registerCommandHandler(chrome);
}
