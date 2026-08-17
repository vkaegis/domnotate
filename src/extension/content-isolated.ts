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
import { createPinLayer } from '@/extension/pins';
import { readStash, routeLabel, routeOf, writeStash } from '@/extension/held-notes';
import { runCopyFeedback, popIcon } from '@/sidebar/copy-animation';
import type { Annotation, AnnotationSession, PageRef } from '@/types/core';

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
 * TypeScript's DOM lib declares these as always present. They are not: the
 * popover API landed in Chrome 114, and happy-dom has none of it.
 */
function popoverApiOf(el: HTMLElement): Pick<HTMLElement, 'showPopover' | 'hidePopover'> | null {
  const candidate = el as Partial<Pick<HTMLElement, 'showPopover' | 'hidePopover'>>;
  if (typeof candidate.showPopover !== 'function' || typeof candidate.hidePopover !== 'function') {
    return null;
  }
  return { showPopover: candidate.showPopover, hidePopover: candidate.hidePopover };
}

/**
 * Join the **top layer**.
 *
 * `dialog.showModal()` and `[popover]` do not participate in the z-index game
 * at all: the browser promotes them to the top layer, which paints above every
 * stacking context in the document, and marks everything outside the topmost
 * one `inert`. `z-index: 2147483647` loses to it, and inert is enforced by the
 * browser rather than by an event listener, so no capture-phase guard reaches
 * it either — the sidebar goes dim under the dialog's `::backdrop` and its note
 * field cannot even be focused.
 *
 * The only way to paint above the top layer is to be in it, which a manual
 * popover does. `manual` rather than `auto` because auto popovers light-dismiss
 * on Escape and on any outside click, and both belong to the annotation loop.
 *
 * **This fixes painting and not inertness.** Measured in Chrome, 11 Aug: a fresh
 * manual popover, shown *after* a modal dialog and confirmed `:popover-open`,
 * still could not take focus. Insertion order into the top layer buys paint
 * order and nothing else — inertness is a flat-tree question, and the only place
 * it does not reach is the dialog's own subtree. See `homeFor` below for what
 * actually restores typing.
 *
 * Returns whether promotion took: pre-Chrome-114 and happy-dom have no popover
 * API, and the overlay has to keep working there on plain z-index.
 */
function enterTopLayer(el: HTMLElement): boolean {
  const api = popoverApiOf(el);
  if (!api) return false;
  const fresh = !el.hasAttribute('popover');
  if (fresh) el.setAttribute('popover', 'manual');
  try {
    api.showPopover.call(el);
    return true;
  } catch {
    // Showing an already-shown popover throws too, and that is harmless. On a
    // *fresh* promotion a throw means it will never show, and a popover
    // attribute on an element that will not show is worse than none: the UA
    // stylesheet hides it outright.
    if (fresh) el.removeAttribute('popover');
    return !fresh;
  }
}

/**
 * Where the host has to live to be interactive.
 *
 * `showModal()` marks every element that is not a shadow-including descendant of
 * the dialog `inert`, and inert is enforced by the browser: no capture-phase
 * guard reaches it, and no z-index or top-layer trick escapes it. `focus()`
 * fails silently, clicks do not land, and the sidebar reads as frozen.
 *
 * So while a modal dialog is open, the overlay moves *inside* it, and moves back
 * out when it closes. This is the one place in the codebase that restructures
 * the host page's DOM, which is worth stating plainly — but it is reversible, it
 * is the only mechanism the platform leaves open, and it only ever runs on pages
 * that use a native modal, which are precisely the pages that are otherwise
 * unusable. MUI's Dialog is a `<div>` with a z-index, so the primary target never
 * takes this path.
 *
 * `:modal` also matches fullscreen elements, which inert the page the same way,
 * so they are handled by the same code for free.
 */
function homeFor(doc: Document, hostEl: HTMLElement): Element {
  const fallback = doc.documentElement ?? doc.body;
  let modals: Element[];
  try {
    modals = Array.from(doc.querySelectorAll(':modal'));
  } catch {
    // `:modal` is Chrome 105+, and happy-dom does not know it at all.
    return fallback;
  }
  const topmost = modals[modals.length - 1];
  if (!topmost || topmost === hostEl || hostEl.contains(topmost)) return fallback;
  return topmost;
}

/**
 * Top layer paint order is insertion order, so a dialog opened after us paints
 * over us. Re-showing puts us back on top. Paint order only — inertness does not
 * work this way, see `enterTopLayer`.
 */
function reassertTopLayer(el: HTMLElement): void {
  const api = popoverApiOf(el);
  if (!api || !el.hasAttribute('popover')) return;
  try {
    api.hidePopover.call(el);
    api.showPopover.call(el);
  } catch {
    /* Mid-teardown, or never shown. Nothing useful to do. */
  }
}

/**
 * Locks the host element down against the page. `all: initial` is the load
 * bearing declaration: inherited properties (font, colour, line-height,
 * visibility, letter-spacing) cross the shadow boundary, and this is what
 * stops them. Set inline and `!important`, so it also outranks any host rule
 * that happens to match this element — a style attribute beats every selector.
 *
 * `direction` and `unicode-bidi` are the spec's explicit carve-out from `all`,
 * so they are the two inherited properties that would otherwise still reach us:
 * on `<html dir="rtl">` the whole sidebar mirrors. They have to be listed by
 * hand or the reset has a hole in exactly the place nobody tests.
 */
const HOST_STYLE: ReadonlyArray<[string, string]> = [
  ['all', 'initial'],
  ['direction', 'ltr'],
  ['unicode-bidi', 'isolate'],
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

/* A pass can cover several screens, so the notes carry the page they came from.
   Borrows the shared slide-group look, which is the same idea one tier up. */
.dn-ext-page-group {
  padding: 10px 16px 6px;
  font-size: 11px;
  font-weight: 600;
  color: var(--dn-text-secondary);
  border-bottom: 1px dashed var(--dn-border);
  user-select: none;
  display: flex;
  justify-content: space-between;
  gap: 8px;
}

.dn-ext-page-group--here { color: var(--dn-accent); }

/* A route is data, so it is shown exactly as the app spells it. The uppercase
   of the slide-group look would rewrite a path like /Records/ABC-123, and a
   reader cannot tell a styled capital from a real one. Only the label gets it. */
.dn-ext-page-group--here .dn-ext-page-group__name {
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.dn-ext-page-group__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dn-ext-page-group__count {
  flex-shrink: 0;
  font-weight: 500;
  color: var(--dn-text-muted);
}

/* The shared empty state takes flex: 1 to centre itself down an empty panel.
   With another page's notes below it that greed pushes them off the fold, so
   this screen's "nothing yet" shrinks to just its own height.

   Both classes on the selector on purpose: this block is concatenated *before*
   sidebar.css, so at equal specificity the shared rule would win. */
.dn-empty-state.dn-empty-state--compact {
  flex: 0 0 auto;
  padding: 20px 24px;
}

/* Notes from a screen you are not looking at. Their elements are not here, so
   they have no pin on the page; reading dimmer is how the row says so. */
.dn-note-row--elsewhere { opacity: 0.55; }
.dn-note-row--elsewhere:hover { opacity: 1; }
.dn-note-row--elsewhere .dn-note-pin { background: var(--dn-text-muted); }
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
  const stash = readStash(win);
  // Read per call, never cached. A pass follows the app across screens, so the
  // screen on show changes under an open sidebar and a stale value would file
  // notes under the wrong page.
  const currentRoute = (): string => routeOf(win);

  /** The screen on show, stamped onto a note as it is taken. */
  function capturedOnNow(): PageRef {
    const title = doc.title?.trim();
    return {
      route: currentRoute(),
      url: win.location.href,
      ...(title ? { title } : {}),
    };
  }
  // Every source-hint request in flight, cancelled on unmount so a pending one
  // cannot leave its nonce on a host element after we are gone.
  const hintRequests = new AbortController();
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
  sidebarEl.appendChild(scopeEl);

  /** Where you are, and how much of the pass was taken somewhere else. */
  function renderScope(elsewhere: number): void {
    const here = win.location.pathname + win.location.search;
    const others = elsewhere === 1 ? '1 note on another page' : `${elsewhere} notes on other pages`;
    scopeEl.textContent = elsewhere > 0 ? `${here} · ${others}` : here;
    scopeEl.title = win.location.href;
  }

  const notesListEl = doc.createElement('div');
  notesListEl.className = 'dn-notes-list';
  sidebarEl.appendChild(notesListEl);

  function renderEmptyState(compact = false): void {
    const empty = doc.createElement('div');
    empty.className = compact ? 'dn-empty-state dn-empty-state--compact' : 'dn-empty-state';
    const text = doc.createElement('div');
    text.className = 'dn-empty-state__text';
    text.textContent = 'Click an element to annotate it. Esc to use the page.';
    empty.appendChild(text);
    notesListEl.appendChild(empty);
  }

  function autoGrow(input: HTMLTextAreaElement): void {
    input.style.height = 'auto';
    input.style.height = `${input.scrollHeight}px`;
  }

  function createNoteRow(
    annotationId: string,
    index: number,
    text: string,
    elsewhere = false,
  ): HTMLElement {
    const row = doc.createElement('div');
    row.className = elsewhere ? 'dn-note-row dn-note-row--elsewhere' : 'dn-note-row';
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

  /** A note with no page belongs wherever it is shown. See `PageRef`. */
  function routeFor(annotation: Annotation, here: string): string {
    return annotation.capturedOn?.route ?? here;
  }

  function pageGroupHeader(
    name: string,
    count: number,
    here: boolean,
    title = name,
  ): HTMLElement {
    const header = doc.createElement('div');
    header.className = here ? 'dn-ext-page-group dn-ext-page-group--here' : 'dn-ext-page-group';

    const nameEl = doc.createElement('div');
    nameEl.className = 'dn-ext-page-group__name';
    nameEl.textContent = name;
    nameEl.title = title;

    const countEl = doc.createElement('div');
    countEl.className = 'dn-ext-page-group__count';
    countEl.textContent = String(count);

    header.append(nameEl, countEl);
    return header;
  }

  function render(): void {
    const annotations = manager.getAll();
    const here = currentRoute();
    notesListEl.replaceChildren();

    // Grouped by screen, this one first. Numbers stay the session-wide ordinal
    // so a row and its pin agree, which means the active group can read 2, 5, 6.
    const byRoute = new Map<string, { index: number; annotation: Annotation }[]>();
    annotations.forEach((annotation, index) => {
      const route = routeFor(annotation, here);
      const group = byRoute.get(route);
      if (group) group.push({ index, annotation });
      else byRoute.set(route, [{ index, annotation }]);
    });

    const mine = byRoute.get(here) ?? [];
    const others = [...byRoute.entries()].filter(([route]) => route !== here);
    const elsewhere = annotations.length - mine.length;

    renderScope(elsewhere);

    // A heading over this screen's notes only earns its space once there is
    // somewhere else to tell it apart from.
    if (others.length > 0 && mine.length > 0) {
      notesListEl.appendChild(pageGroupHeader('This page', mine.length, true));
    }

    for (const { index, annotation } of mine) {
      notesListEl.appendChild(createNoteRow(annotation.id, index, annotation.text));
    }

    if (mine.length === 0) renderEmptyState(others.length > 0);

    for (const [route, group] of others) {
      const url = group[0].annotation.capturedOn?.url ?? route;
      notesListEl.appendChild(pageGroupHeader(routeLabel(route), group.length, false, url));
      for (const { index, annotation } of group) {
        notesListEl.appendChild(createNoteRow(annotation.id, index, annotation.text, true));
      }
    }

    const dimmed = annotations.length === 0;
    copyBtn.classList.toggle('dn-action-btn--dimmed', dimmed);
    clearBtn.classList.toggle('dn-action-btn--dimmed', dimmed);

    if (focusAnnotationId) {
      const input = notesListEl.querySelector<HTMLTextAreaElement>(
        `[data-annotation-id="${focusAnnotationId}"] .dn-ext-note-input`,
      );
      focusAnnotationId = null;
      // The one moment interactivity is definitely required, so take the top
      // layer back before asking for focus rather than trusting that we still
      // hold it. `focus()` on an inert element fails silently — a pin lands and
      // the note simply cannot be typed, which is exactly how this presented.
      followTopLayer();
      input?.focus();
    }
  }

  // Text edits re-render from the manager's state, which would blow away the
  // caret, so only structural changes redraw the list.
  const pinLayer = createPinLayer({
    doc,
    layerEl: overlayEl,
    host,
    manager,
    bus,
    hostEl,
    currentRoute,
  });

  const unsubs = [
    bus.on('annotation:create', (e) => {
      focusAnnotationId = e.annotation.id;
      render();
      pinLayer.sync();
    }),
    bus.on('annotation:delete', () => {
      render();
      pinLayer.sync();
    }),
    // The app moving is a change of screen, so this screen's group changes with
    // it. The pin layer watches navigation itself; this is the sidebar's half.
    host.onNavigate(() => render()),
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
      // Read here, at the pick, not at mount. A pass follows the app across
      // screens, so only this moment knows which screen the note belongs to.
      { capturedOn: capturedOnNow() },
    );

    // The element is re-resolved here because the picker event carries a
    // descriptor, not a node. The hint lands asynchronously and may lose the
    // race against a delete, which `updateSourceHint` treats as normal.
    const target = doc.elementFromPoint(e.mouseX, e.mouseY);
    if (target && target !== hostEl) {
      void requestSourceHint(target, { win, signal: hintRequests.signal }).then((hint) => {
        manager.updateSourceHint(annotation.id, hint);
      });
    }

    // Stay armed, unlike the web app. There the content is an inert document
    // you never need to click; here the page is a live app, but the reason to
    // have the sidebar open at all is to annotate it, and disarming after every
    // pick made the loop pick, type, Enter, `a`, pick. Escape hands the page
    // back when you do need to navigate.
    syncAnnotateBtn();
  });
  unsubs.push(unsubSelect);

  /**
   * Escape closes Domnotate and gives the page back. Annotations are stashed,
   * so reopening restores them.
   *
   * One step first: while a note has focus, Escape commits and blurs instead,
   * matching the web client's popover. Escape is a reflex, and having it tear
   * the sidebar down mid-sentence would be a nasty way to learn that.
   *
   * Captured, so an app's own Escape handler cannot take it first.
   */
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    unmount();
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

  /** Insert a newline at the caret and drive the same path typing would. */
  function insertNewline(input: HTMLTextAreaElement): void {
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    input.value = `${input.value.slice(0, start)}\n${input.value.slice(end)}`;
    const caret = start + 1;
    input.setSelectionRange(caret, caret);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  /**
   * Enter commits the note, Cmd/Ctrl+Enter inserts a newline — inverted from
   * the usual textarea convention, because an annotation is nearly always one
   * line and the loop is: pick, type, next. Committing is a blur: the note is
   * already saved on every keystroke, so what Enter really does is hand the
   * keyboard back to the page, where `a` arms the picker again.
   *
   * Shift+Enter is left alone and still inserts a newline by default.
   *
   * This lives inside the swallow guard rather than on the textarea because
   * the guard stops propagation in the capture phase — before the event ever
   * reaches the field — so a listener there would never run.
   */
  function handleUiKey(event: KeyboardEvent): void {
    // Retargeting hides the real target at window level, so ask the root.
    const active = shadow.activeElement;
    const note = active?.classList.contains('dn-ext-note-input')
      ? (active as HTMLTextAreaElement)
      : null;

    // Escape lets go of the note, then closes. Both branches have to be here:
    // the guard below stops propagation, so the document-level Escape handler
    // never sees a keystroke that started inside our own UI.
    if (event.key === 'Escape') {
      event.preventDefault();
      if (note) note.blur();
      else unmount();
      return;
    }

    if (event.key !== 'Enter' || event.shiftKey || event.altKey || !note) return;

    event.preventDefault();
    if (event.metaKey || event.ctrlKey) {
      insertNewline(note);
      return;
    }
    note.blur();
  }

  const swallowKeys = (event: Event): void => {
    if (!originatesInUi(event)) return;
    if (event.type === 'keydown') handleUiKey(event as KeyboardEvent);
    event.stopPropagation();
    event.stopImmediatePropagation();
  };

  /**
   * `focusin` is swallowed for the same reason keystrokes are, against a
   * different mechanism: a modal focus trap.
   *
   * MUI's `FocusTrap` registers `document.addEventListener('focusin', contain)`
   * while a Dialog or Drawer is open. `contain` reads the active element and,
   * when the trap's root does not contain it, drags focus back to the dialog.
   * Our textarea lives in a *closed* shadow root, which nothing can pierce, so
   * the active element it sees is the host `<div>` sitting on `body` — outside
   * the dialog. Focus was therefore yanked out of the note the instant it
   * arrived, which reads as "I can't type, and the whole screen selects".
   *
   * Window capture runs long before a document bubble listener, so stopping the
   * event here means `contain` never learns focus left the dialog.
   *
   * The 50ms interval in the same effect is not a second enforcer: it only calls
   * `contain()` when the active element is `BODY`, and ours is a `<div>`. And
   * `loopFocus`, its Tab handler, is a document *capture* listener, which the
   * key guard above already beats. So this one listener closes the whole case.
   */
  const swallowFocus = (event: Event): void => {
    if (!originatesInUi(event)) return;
    event.stopPropagation();
    event.stopImmediatePropagation();
  };

  const SWALLOWED_KEY_EVENTS = ['keydown', 'keypress', 'keyup'] as const;
  for (const type of SWALLOWED_KEY_EVENTS) {
    win.addEventListener(type, swallowKeys, true);
  }
  win.addEventListener('focusin', swallowFocus, true);

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

  // Escape closes the sidebar, and closing must not be how you lose an
  // afternoon's notes. Annotations survive a close and come back on reopen,
  // for as long as the page is loaded and you are still on the screen they
  // were taken on.
  if (stash.length > 0) {
    manager.loadAnnotations(stash);
    render();
    pinLayer.sync();
  }

  // Armed on arrival. Opening Domnotate on a page is the decision to annotate
  // it, so making that cost a keystroke was asking users to say it twice.
  picker.activate();
  syncAnnotateBtn();

  // --- Teardown ----------------------------------------------------------

  let unmounted = false;

  /**
   * Put the host wherever it currently needs to be, and take the paint order
   * back. Idempotent and cheap, so it is safe to call from anything.
   *
   * Moving a shown popover through the DOM closes it — a popover is hidden when
   * its element is removed from the document — so promotion is re-applied after
   * every move rather than only on the first.
   */
  function followTopLayer(): void {
    if (unmounted) return;
    const home = homeFor(doc, hostEl);
    if (hostEl.parentElement !== home) {
      home.appendChild(hostEl);
      watchHome(home);
    }
    if (hostEl.hasAttribute('popover')) reassertTopLayer(hostEl);
    else enterTopLayer(hostEl);
  }

  /**
   * While docked inside a page-owned node, that node is not ours to rely on: a
   * React dialog that unmounts takes our whole UI with it, annotations and all.
   * Two narrow childList observers — the dialog, for our own removal, and its
   * parent, for the dialog's — are enough to notice and re-home. Scoped to the
   * dialog rather than the document, so this costs nothing on a busy app.
   */
  function watchHome(home: Element): void {
    homeWatcher.disconnect();
    if (home === doc.documentElement) return;
    homeWatcher.observe(home, { childList: true });
    if (home.parentNode) homeWatcher.observe(home.parentNode, { childList: true });
  }

  /** A host page dialog or popover opening puts it above us. Follow it. */
  function onHostPageToggle(e: Event): void {
    if (e.target === hostEl) return;
    followTopLayer();
  }

  const homeWatcher = new MutationObserver(() => followTopLayer());

  const topLayerWatcher = new MutationObserver((records) => {
    // `open` going *away* matters as much as arriving: that is the signal to
    // move back out of a dialog before the page can tear it down.
    for (const record of records) {
      if ((record.target as Element).tagName === 'DIALOG') {
        followTopLayer();
        return;
      }
    }
  });

  function unmount(): void {
    if (unmounted) return;
    unmounted = true;
    picker.deactivate();
    hintRequests.abort();
    doc.removeEventListener('toggle', onHostPageToggle, true);
    topLayerWatcher.disconnect();
    homeWatcher.disconnect();
    doc.removeEventListener('keydown', onKeyDown, true);
    for (const type of SWALLOWED_KEY_EVENTS) {
      win.removeEventListener(type, swallowKeys, true);
    }
    win.removeEventListener('focusin', swallowFocus, true);
    uninstallShortcuts();
    undockPage();
    cancelCopyFeedback?.();
    for (const unsub of unsubs) unsub();
    pinLayer.destroy();
    writeStash(win, manager.getAll());
    hostEl.remove();
    delete (win as unknown as Record<string, unknown>)[MOUNTED_FLAG];
  }

  render();
  // On `documentElement`, not `body`. A `transform`, `filter`, `perspective` or
  // `will-change` on any ancestor makes it the containing block for `position:
  // fixed` descendants, so a `transform: translateZ(0)` on `body` — a GPU-layer
  // hint sites apply routinely — silently stops the overlay covering the
  // viewport: it lands inside the docked page instead, short of the right edge
  // and the bottom. Mounting a level up puts `body` out of our ancestry, so
  // only a transform on `<html>` itself can still catch us, which is rare
  // enough to accept. The parser never produces element children of `<html>`
  // besides head and body, but the DOM permits them and they render.
  (doc.documentElement ?? doc.body).appendChild(hostEl);
  followTopLayer();

  // Two triggers, because neither covers the other.
  //
  // `toggle` is the popover API's own event and fires reliably for popovers,
  // but for `<dialog>` it is recent (Chrome 129) — so on an older Chrome, or
  // any engine that has popovers without dialog toggle events, a `showModal()`
  // would put the page above us and nothing would tell us.
  //
  // `showModal()` always sets the `open` attribute, so an attribute observer
  // catches it everywhere. `attributeFilter` keeps this far cheaper than a
  // childList observer over a live app: no callback at all for ordinary DOM
  // churn, and `subtree` covers dialogs added after we start watching.
  doc.addEventListener('toggle', onHostPageToggle, true);
  topLayerWatcher.observe(doc.documentElement, {
    subtree: true,
    attributes: true,
    attributeFilter: ['open'],
  });

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
