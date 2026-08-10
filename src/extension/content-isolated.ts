// ============================================================
// Domnotate — ISOLATED world content script (UI)
// ============================================================
//
// Mounts the annotation UI into a **closed** shadow root on `document.body`,
// so nothing leaks either way: host CSS cannot reach our widgets, and our CSS
// cannot reach the host page. The host element itself is the one surface both
// sides can see, so it is pinned with `all: initial !important` plus explicit
// geometry — that is the only place host CSS could otherwise get a grip.
//
// Reused verbatim from the web app: events, annotation-manager, formatter,
// exporter, selector-engine (via picker), and sidebar.css.

import { createEventBus } from '@/events';
import { createAnnotationManager } from '@/annotations/annotation-manager';
import { createOutputFormatter } from '@/output/formatter';
import { copyToClipboard } from '@/output/exporter';
import { createPageHost } from '@/core/content-host';
import { createElementPicker, PICKER_IGNORE_ATTR } from '@/picker/picker';
import { requestSourceHint } from '@/extension/hint-protocol';
import { installExtensionShortcuts } from '@/extension/shortcuts';
import { runCopyFeedback, popIcon } from '@/sidebar/copy-animation';
import type { AnnotationSession } from '@/types/core';

import themeCss from '@/styles/theme.css?inline';
import sidebarCss from '@/sidebar/sidebar.css?inline';

// ------------------------------------------------------------
// Styles
// ------------------------------------------------------------

/** Must match `--dn-sidebar-width` in theme.css — the page is inset by it. */
const SIDEBAR_WIDTH_PX = 360;

/**
 * Give the sidebar its own space instead of floating it over the page.
 *
 * Inset the root element and the page reflows into what is left, so nothing
 * ends up underneath the sidebar where it cannot be annotated. A resize event
 * follows because app shells and virtualised lists measure on resize and would
 * otherwise keep their old width.
 *
 * Known limit: the host's own `position: fixed` elements are placed against
 * the viewport, not the root box, so a full-width fixed header still runs
 * under the sidebar. Nothing generic fixes that from outside the page.
 *
 * Returns a restore function that puts back exactly what was there, which is
 * usually nothing.
 */
function dockPage(doc: Document, win: Window): () => void {
  const root = doc.documentElement;
  const previousValue = root.style.getPropertyValue('margin-right');
  const previousPriority = root.style.getPropertyPriority('margin-right');

  root.style.setProperty('margin-right', `${SIDEBAR_WIDTH_PX}px`, 'important');
  win.dispatchEvent(new Event('resize'));

  return () => {
    if (previousValue) {
      root.style.setProperty('margin-right', previousValue, previousPriority);
    } else {
      root.style.removeProperty('margin-right');
    }
    win.dispatchEvent(new Event('resize'));
  };
}

/**
 * Locks the host element down against the page. `all: initial` is the load
 * bearing declaration: inherited properties (font, colour, line-height,
 * visibility, letter-spacing) cross the shadow boundary, and this is what
 * stops them.
 */
const HOST_STYLE: ReadonlyArray<[string, string]> = [
  ['all', 'initial'],
  ['position', 'fixed'],
  ['top', '0'],
  ['left', '0'],
  ['width', '100%'],
  ['height', '100%'],
  ['z-index', '2147483647'],
  ['pointer-events', 'none'],
  ['display', 'block'],
  ['visibility', 'visible'],
  ['opacity', '1'],
];

/**
 * Shadow-root-local base styles. Deliberately not `reset.css`: that file pulls
 * two Google Fonts over `@import`, which would make a network request from the
 * host page's origin and fail closed under a strict CSP. The font stack falls
 * back to the system UI font instead.
 */
const BASE_CSS = `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

.dn-ext-root {
  position: absolute;
  inset: 0;
  pointer-events: none;
  font-family: 'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
    'Helvetica Neue', Arial, sans-serif;
  font-size: 14px;
  line-height: 1.4;
  color: var(--dn-text-primary);
  -webkit-font-smoothing: antialiased;
}

.dn-ext-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.dn-ext-panel {
  position: absolute;
  top: 0;
  right: 0;
  height: 100%;
  display: flex;
  pointer-events: auto;
}

.dn-ext-panel .dn-sidebar {
  height: 100%;
  box-shadow: var(--dn-shadow-md);
}

/* The note body is an input here, not the web app's read-only preview. */
.dn-ext-note-input {
  font: inherit;
  color: inherit;
  background: transparent;
  border: none;
  outline: none;
  resize: none;
  width: 100%;
  min-height: 40px;
  overflow: hidden;
}

.dn-ext-note-input::placeholder { color: var(--dn-text-muted); }

.dn-ext-scope {
  padding: 8px 14px 0;
  font-size: 11px;
  color: var(--dn-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex-shrink: 0;
}
`;

// ------------------------------------------------------------
// Icons — built as DOM, never via innerHTML, so a host page running
// Trusted Types cannot break the UI.
// ------------------------------------------------------------

const SVG_NS = 'http://www.w3.org/2000/svg';

type IconShape = [tag: string, attrs: Record<string, string>];

const ICONS: Record<string, IconShape[]> = {
  pencil: [['path', { d: 'M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z' }]],
  clipboard: [
    ['path', { d: 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2' }],
    ['rect', { x: '8', y: '2', width: '8', height: '4', rx: '1', ry: '1' }],
  ],
  trash: [
    ['polyline', { points: '3 6 5 6 21 6' }],
    ['path', { d: 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2' }],
  ],
  x: [
    ['line', { x1: '18', y1: '6', x2: '6', y2: '18' }],
    ['line', { x1: '6', y1: '6', x2: '18', y2: '18' }],
  ],
  check: [['polyline', { points: '20 6 9 17 4 12' }]],
};

function makeIcon(name: keyof typeof ICONS): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  for (const [tag, attrs] of ICONS[name]) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    svg.appendChild(node);
  }
  return svg;
}

// ------------------------------------------------------------
// Mount
// ------------------------------------------------------------

export interface DomnotateOverlay {
  /** Tear everything down and leave the page as it was found. */
  unmount(): void;
  /** Markdown for the current annotations — the same string the Copy button writes. */
  toMarkdown(): string;
  /** Test seam: the shadow root is closed, so this is the only way in. */
  readonly root: ShadowRoot;
}

export interface MountOptions {
  /** Defaults to `document` — overridable for tests. */
  doc?: Document;
  /** Defaults to `window` — overridable for tests. */
  win?: Window;
}

export function mountDomnotate(options: MountOptions = {}): DomnotateOverlay {
  const doc = options.doc ?? document;
  const win = options.win ?? window;

  // --- Shadow host -------------------------------------------------------
  const hostEl = doc.createElement('div');
  hostEl.setAttribute('data-domnotate-root', '');
  // Makes the whole UI invisible to our own picker (see picker.ts).
  hostEl.setAttribute(PICKER_IGNORE_ATTR, '');
  for (const [prop, value] of HOST_STYLE) {
    hostEl.style.setProperty(prop, value, 'important');
  }

  const shadow = hostEl.attachShadow({ mode: 'closed' });

  const styleEl = doc.createElement('style');
  styleEl.textContent = [BASE_CSS, themeCss, sidebarCss].join('\n');
  shadow.appendChild(styleEl);

  const rootEl = doc.createElement('div');
  rootEl.className = 'dn-ext-root';
  shadow.appendChild(rootEl);

  const overlayEl = doc.createElement('div');
  overlayEl.className = 'dn-ext-overlay';
  rootEl.appendChild(overlayEl);

  const panelEl = doc.createElement('div');
  panelEl.className = 'dn-ext-panel';
  rootEl.appendChild(panelEl);

  const sidebarEl = doc.createElement('div');
  sidebarEl.className = 'dn-sidebar';
  panelEl.appendChild(sidebarEl);

  // --- Core modules, reused verbatim ------------------------------------
  const bus = createEventBus();
  const manager = createAnnotationManager();
  const formatter = createOutputFormatter();
  const picker = createElementPicker();
  const host = createPageHost(win);

  manager.init(bus);
  picker.init(host, overlayEl, bus);

  const sessionId = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  function currentSession(): AnnotationSession {
    const title = doc.title?.trim();
    return {
      id: sessionId,
      sourceType: 'url',
      // The route is the single most useful locator on an SPA (§3.1a), so it
      // rides in the name rather than being dropped.
      sourceName: title ? `${title} (${win.location.href})` : win.location.href,
      loadedUrl: win.location.href,
      annotations: manager.getAll(),
      createdAt,
      updatedAt: new Date().toISOString(),
    };
  }

  function toMarkdown(): string {
    return formatter.toMarkdown(currentSession());
  }

  // --- Action bar --------------------------------------------------------
  const actionBar = doc.createElement('div');
  actionBar.className = 'dn-action-bar';
  const tabBar = doc.createElement('div');
  tabBar.className = 'dn-tab-bar';
  actionBar.appendChild(tabBar);
  sidebarEl.appendChild(actionBar);

  function makeActionBtn(
    icon: keyof typeof ICONS,
    label: string,
    shortcut: string | null,
    title: string,
    onClick: () => void,
  ): HTMLButtonElement {
    const btn = doc.createElement('button');
    btn.className = 'dn-action-btn';
    btn.type = 'button';
    btn.setAttribute('aria-label', title);

    const iconSpan = doc.createElement('span');
    iconSpan.className = 'dn-action-btn__icon';
    iconSpan.appendChild(makeIcon(icon));
    btn.appendChild(iconSpan);

    const labelSpan = doc.createElement('span');
    labelSpan.className = 'dn-action-btn__label';
    labelSpan.textContent = label;
    btn.appendChild(labelSpan);

    if (shortcut) {
      const kbd = doc.createElement('kbd');
      kbd.className = 'dn-action-btn__shortcut';
      kbd.textContent = shortcut;
      btn.appendChild(kbd);
    }

    btn.addEventListener('click', onClick);
    tabBar.appendChild(btn);
    return btn;
  }

  /** Mirrors the web client's `setIconWithPop`, built as DOM rather than HTML. */
  function setIcon(btn: HTMLButtonElement, icon: keyof typeof ICONS): void {
    const iconSpan = btn.querySelector('.dn-action-btn__icon');
    if (!iconSpan) return;
    iconSpan.replaceChildren(makeIcon(icon));
    popIcon(btn.querySelector('svg'));
  }

  const annotateBtn = makeActionBtn('pencil', 'Annotate', 'A', 'Annotate an element (A)', () => {
    if (picker.isActive()) picker.deactivate();
    else picker.activate();
    syncAnnotateBtn();
  });
  annotateBtn.classList.add('dn-action-btn--accent');

  let cancelCopyFeedback: (() => void) | null = null;
  const copyBtn = makeActionBtn('clipboard', 'Copy', 'C', 'Copy annotations as Markdown (C)', () => {
    void copyMarkdown();
  });

  const clearBtn = makeActionBtn('trash', 'Clear', null, 'Delete all annotations', () => {
    for (const annotation of manager.getAll()) manager.delete(annotation.id);
  });

  makeActionBtn('x', 'Close', null, 'Close Domnotate', () => unmount());

  function syncAnnotateBtn(): void {
    annotateBtn.classList.toggle('dn-action-btn--active', picker.isActive());
  }

  // --- Scope line + notes list ------------------------------------------
  const scopeEl = doc.createElement('div');
  scopeEl.className = 'dn-ext-scope';
  scopeEl.textContent = win.location.pathname + win.location.search;
  scopeEl.title = win.location.href;
  sidebarEl.appendChild(scopeEl);

  const notesListEl = doc.createElement('div');
  notesListEl.className = 'dn-notes-list';
  sidebarEl.appendChild(notesListEl);

  function renderEmptyState(): void {
    const empty = doc.createElement('div');
    empty.className = 'dn-empty-state';
    const text = doc.createElement('div');
    text.className = 'dn-empty-state__text';
    text.textContent = 'Choose Annotate, then click an element on the page';
    empty.appendChild(text);
    notesListEl.appendChild(empty);
  }

  function autoGrow(input: HTMLTextAreaElement): void {
    input.style.height = 'auto';
    input.style.height = `${input.scrollHeight}px`;
  }

  function createNoteRow(annotationId: string, index: number, text: string): HTMLElement {
    const row = doc.createElement('div');
    row.className = 'dn-note-row';
    row.dataset.annotationId = annotationId;

    const pin = doc.createElement('div');
    pin.className = 'dn-note-pin';
    pin.textContent = String(index + 1);

    const input = doc.createElement('textarea');
    input.className = 'dn-note-text dn-ext-note-input';
    input.rows = 1;
    input.placeholder = 'What should change here?';
    input.value = text;
    input.addEventListener('input', () => {
      manager.updateText(annotationId, input.value);
      autoGrow(input);
    });

    const deleteBtn = doc.createElement('button');
    deleteBtn.className = 'dn-note-delete';
    deleteBtn.type = 'button';
    deleteBtn.setAttribute('aria-label', 'Delete annotation');
    deleteBtn.appendChild(makeIcon('trash'));
    deleteBtn.addEventListener('click', () => {
      manager.delete(annotationId);
    });

    row.append(pin, input, deleteBtn);
    return row;
  }

  /** id of the row whose input should take focus after the next render. */
  let focusAnnotationId: string | null = null;

  function render(): void {
    const annotations = manager.getAll();
    notesListEl.replaceChildren();

    if (annotations.length === 0) {
      renderEmptyState();
    } else {
      annotations.forEach((annotation, i) => {
        notesListEl.appendChild(createNoteRow(annotation.id, i, annotation.text));
      });
    }

    const dimmed = annotations.length === 0;
    copyBtn.classList.toggle('dn-action-btn--dimmed', dimmed);
    clearBtn.classList.toggle('dn-action-btn--dimmed', dimmed);

    if (focusAnnotationId) {
      const input = notesListEl.querySelector<HTMLTextAreaElement>(
        `[data-annotation-id="${focusAnnotationId}"] .dn-ext-note-input`,
      );
      focusAnnotationId = null;
      input?.focus();
    }
  }

  // Text edits re-render from the manager's state, which would blow away the
  // caret, so only structural changes redraw the list.
  const unsubs = [
    bus.on('annotation:create', (e) => {
      focusAnnotationId = e.annotation.id;
      render();
    }),
    bus.on('annotation:delete', () => render()),
  ];

  // --- Copy --------------------------------------------------------------

  async function copyMarkdown(): Promise<boolean> {
    if (manager.getAll().length === 0) return false;
    const markdown = toMarkdown();

    let ok = await copyToClipboard(markdown);
    if (!ok) ok = fallbackCopy(markdown);

    if (ok) {
      cancelCopyFeedback?.();
      cancelCopyFeedback = runCopyFeedback({
        rows: notesListEl.querySelectorAll('.dn-note-row'),
        button: copyBtn,
        // Never the host page's body: our stylesheet lives in the shadow root.
        ghostLayer: rootEl,
        setIcon: (name) => setIcon(copyBtn, name),
      });
    }
    return ok;
  }

  /**
   * `navigator.clipboard` is gated on document focus and on the host page's
   * permissions policy, neither of which we control. The legacy path runs from
   * inside the shadow root so the scratch node never enters the host page.
   */
  function fallbackCopy(text: string): boolean {
    const scratch = doc.createElement('textarea');
    scratch.value = text;
    scratch.setAttribute('aria-hidden', 'true');
    scratch.style.setProperty('position', 'absolute');
    scratch.style.setProperty('opacity', '0');
    rootEl.appendChild(scratch);
    scratch.select();
    let ok = false;
    try {
      ok = doc.execCommand('copy');
    } catch {
      ok = false;
    }
    scratch.remove();
    return ok;
  }

  // --- Picking -----------------------------------------------------------

  const unsubSelect = bus.on('picker:select', (e) => {
    // `toOverlayCoords` is identity for a page host, so the event's overlay
    // coords are viewport coords and the anchor is just + scroll.
    const { scrollX, scrollY } = host.getScroll();
    const annotation = manager.create(
      e.element,
      { x: e.mouseX + scrollX, y: e.mouseY + scrollY },
      '',
    );

    // The element is re-resolved here because the picker event carries a
    // descriptor, not a node. The hint lands asynchronously and may lose the
    // race against a delete, which `updateSourceHint` treats as normal.
    const target = doc.elementFromPoint(e.mouseX, e.mouseY);
    if (target && target !== hostEl) {
      void requestSourceHint(target, { win }).then((hint) => {
        manager.updateSourceHint(annotation.id, hint);
      });
    }

    // Single-shot, matching the web app.
    picker.deactivate();
    syncAnnotateBtn();
  });
  unsubs.push(unsubSelect);

  // Escape exits picking. Captured so an app's own Escape handler does not eat
  // it first, but only swallowed while we are actually picking.
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || !picker.isActive()) return;
    event.preventDefault();
    event.stopPropagation();
    picker.deactivate();
    syncAnnotateBtn();
  };
  doc.addEventListener('keydown', onKeyDown, true);

  /**
   * Keystrokes typed into our UI must not reach the host page.
   *
   * A closed shadow root hides the textarea, not the event: key events bubble
   * out of it and are *retargeted*, so a host listener sees `event.target` as
   * the host `<div>` rather than a text field. An app's global shortcut handler
   * therefore concludes the user is not typing and fires. On
   * dashboard.enterpret.com every "t" in a note opened a modal.
   *
   * Listening on `window` in the capture phase runs before any document-level
   * handler in either phase, and `stopImmediatePropagation` also covers an app
   * that listens on `window` itself.
   */
  function originatesInUi(event: Event): boolean {
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
    // A closed root retargets to the host, so this is the only node we see.
    return path.includes(hostEl) || event.target === hostEl;
  }

  const swallowKeys = (event: Event): void => {
    if (!originatesInUi(event)) return;
    event.stopPropagation();
    event.stopImmediatePropagation();
  };

  const SWALLOWED_KEY_EVENTS = ['keydown', 'keypress', 'keyup'] as const;
  for (const type of SWALLOWED_KEY_EVENTS) {
    win.addEventListener(type, swallowKeys, true);
  }

  // Registered after the swallow guard so a keystroke from inside our own UI
  // is stopped before it can be read as a command.
  const uninstallShortcuts = installExtensionShortcuts({
    win,
    hostEl,
    shortcuts: [
      {
        key: 'a',
        label: 'Toggle annotate mode',
        action: () => {
          if (picker.isActive()) picker.deactivate();
          else picker.activate();
          syncAnnotateBtn();
        },
      },
      { key: 'c', label: 'Copy annotations as Markdown', action: () => void copyMarkdown() },
    ],
  });

  // Take the space rather than covering the page.
  const undockPage = dockPage(doc, win);

  // --- Teardown ----------------------------------------------------------

  let unmounted = false;

  function unmount(): void {
    if (unmounted) return;
    unmounted = true;
    picker.deactivate();
    doc.removeEventListener('keydown', onKeyDown, true);
    for (const type of SWALLOWED_KEY_EVENTS) {
      win.removeEventListener(type, swallowKeys, true);
    }
    uninstallShortcuts();
    undockPage();
    cancelCopyFeedback?.();
    for (const unsub of unsubs) unsub();
    hostEl.remove();
    delete (win as unknown as Record<string, unknown>)[MOUNTED_FLAG];
  }

  render();
  doc.body.appendChild(hostEl);

  return {
    unmount,
    toMarkdown,
    root: shadow,
  };
}

// ------------------------------------------------------------
// Entry point
// ------------------------------------------------------------

const MOUNTED_FLAG = '__domnotateOverlay';

/**
 * Clicking the toolbar icon re-runs this whole file, so activation toggles:
 * a second click tears the previous overlay down instead of stacking a new one.
 */
export function bootstrapIsolatedWorld(win: Window = window): DomnotateOverlay | null {
  const scope = win as unknown as Record<string, unknown>;
  const existing = scope[MOUNTED_FLAG] as DomnotateOverlay | undefined;
  if (existing) {
    existing.unmount();
    return null;
  }
  const overlay = mountDomnotate({ win, doc: win.document });
  scope[MOUNTED_FLAG] = overlay;
  return overlay;
}

if (import.meta.env.MODE !== 'test') {
  bootstrapIsolatedWorld();
}
