import { createEventBus } from '@/events';
import type { AnnotationSession } from '@/types/core';
import { createContentLoader } from '@/loader/loader';
import { createElementPicker } from '@/picker/picker';
import { createTextEditor } from '@/editor/edit-mode';
import { createEditManager } from '@/editor/edit-manager';
import { snapshotAnnotationPreviews } from '@/output/annotation-preview';
import { hydrateSessionEdits, revertSessionEdits } from '@/editor/session-edit-hydration';
import { createAnnotationManager } from '@/annotations/annotation-manager';
import { createPinRenderer } from '@/annotations/pin-renderer';
import { createNotePopover } from '@/popover/popover';
import { createOutputFormatter } from '@/output/formatter';
import { reanchorAnnotation } from '@/output/reanchor';
import { createSessionStore } from '@/output/store';
import { copyToClipboard, downloadFile } from '@/output/exporter';
import { initTheme } from '@/theme/theme-toggle';
import { createSidebar } from '@/sidebar/sidebar';
import { createToast } from '@/toast/toast';
import { createKeyboardShortcuts } from '@/keyboard/shortcuts';
import { createSlideObserver } from '@/slides/slide-observer';
import { activateScopeForAnnotation, createScopedAnnotationOptions } from '@/annotations/view-scope';
import { publishShare } from '@/share/share-client';
import { publishOrCopyShare } from '@/share/share-action';
import {
  isDiagnosticsEnabled,
  mountDiagnosticsPanel,
  type DiagnosticsPanel,
} from '@/diagnostics/diagnostics-panel';

// ============================================================
// Domnotate — Main Integration
// ============================================================

initTheme();

const bus = createEventBus();

// DOM refs
const dropZoneEl = document.getElementById('drop-zone')!;
const iframeEl = document.getElementById('content-frame') as HTMLIFrameElement;
const overlayEl = document.getElementById('overlay')!;
const sidebarEl = document.getElementById('sidebar')!;

// Create modules
const loader = createContentLoader();
const picker = createElementPicker();
const editor = createTextEditor();
const editManager = createEditManager();
const manager = createAnnotationManager();
const pinRenderer = createPinRenderer();
const notePopover = createNotePopover();
const formatter = createOutputFormatter();
const store = createSessionStore();
const slideObserver = createSlideObserver();

function commitPendingTextEdit(): void {
  if (editor.isEditing()) {
    editor.commitPending();
  }
}

// Sync the session's annotations/edits from the live managers, refreshing each
// annotation preview from the DOM first. The single capture path for every
// persisted copy — autosave, download, copy, share — so they can't drift on
// preview freshness (the text-preview reanchor fallback needs post-edit text).
function captureSessionState(): void {
  if (!currentSession) return;
  snapshotAnnotationPreviews(manager.getAll(), iframeEl.contentDocument);
  currentSession.annotations = manager.getAll();
  currentSession.edits = editManager.getAll();
}

// Clear annotations before sidebar listeners re-render (event ordering matters)
bus.on('session:cleared', () => {
  commitPendingTextEdit();
  manager.clearAll();
  revertSessionEdits(editManager, editor);
  pinRenderer.render();
});

const sidebar = createSidebar(sidebarEl, bus, manager, picker, editor, editManager, slideObserver);
const contentAreaEl = document.getElementById('content-area')!;
const toast = createToast(contentAreaEl, bus);

// App state
let currentSession: AnnotationSession | null = null;
let selectedAnnotationId: string | null = null;
let pinsVisible = true;
let pendingSharedSession: AnnotationSession | null = null;

// Track selection and pin visibility via bus
bus.on('annotation:select', (e) => { selectedAnnotationId = e.id; });
bus.on('annotation:deselect', () => { selectedAnnotationId = null; });
bus.on('annotation:delete', (e) => {
  if (selectedAnnotationId === e.id) selectedAnnotationId = null;
});
bus.on('pins:visibility', (e) => { pinsVisible = e.visible; });

// Keyboard shortcuts
const shortcuts = createKeyboardShortcuts({
  bus,
  picker,
  editor,
  isContentLoaded: () => currentSession !== null,
  getSelectedAnnotationId: () => selectedAnnotationId,
  getPinsVisible: () => pinsVisible,
});

// Debounce helper
function debounce(fn: () => void, ms: number): () => void {
  let timer: ReturnType<typeof setTimeout>;
  return () => {
    clearTimeout(timer);
    timer = setTimeout(fn, ms);
  };
}

// ============================================================
// Init modules
// ============================================================

loader.init(iframeEl, dropZoneEl, bus);
manager.init(bus);
editManager.init(bus);

// ============================================================
// Content loaded → init picker, pins, show sidebar
// ============================================================

bus.on('content:loaded', (e) => {
  const sharedSession = pendingSharedSession;
  pendingSharedSession = null;

  currentSession = sharedSession
    ? {
        ...sharedSession,
        loadedUrl: e.url,
        html: sharedSession.html ?? e.html,
      }
    : {
        id: crypto.randomUUID(),
        sourceType: e.sourceType,
        sourceName: e.sourceName,
        loadedUrl: e.url,
        html: e.html,
        annotations: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

  picker.init(iframeEl, overlayEl, bus);
  editor.init(iframeEl, overlayEl, bus, (el) =>
    createScopedAnnotationOptions(slideObserver, el)?.viewScope,
  );
  slideObserver.init(iframeEl, bus);
  pinRenderer.init(overlayEl, iframeEl, bus, manager, slideObserver);
  notePopover.init(overlayEl, iframeEl, bus, manager);
  shortcuts.attachIframe(iframeEl);
  sidebar.show();
  hydrateSessionEdits(editManager, editor, currentSession.edits);

  if (sharedSession) {
    manager.clearAll();
    manager.loadAnnotations(currentSession.annotations);
    bus.emit({ type: 'session:loaded', session: currentSession });
  }
});

// ============================================================
// Content unloaded → back to drop zone
// ============================================================

bus.on('content:unloaded', () => {
  picker.deactivate();
  editor.deactivate();
  notePopover.destroy();
  pinRenderer.destroy();
  slideObserver.destroy();
  shortcuts.detachIframe();
  sidebar.hide();
  loader.unload();
  manager.clearAll();
  editManager.clearAll();
  currentSession = null;
});

// ============================================================
// Single-shot annotation: picker:select → create annotation
// ============================================================

bus.on('picker:select', (e) => {
  const iframeRect = iframeEl.getBoundingClientRect();
  const iframeDoc = iframeEl.contentDocument;
  const scrollX = iframeDoc?.documentElement.scrollLeft ?? 0;
  const scrollY = iframeDoc?.documentElement.scrollTop ?? 0;

  const anchorPoint = {
    x: e.mouseX - iframeRect.left + scrollX,
    y: e.mouseY - iframeRect.top + scrollY,
  };

  // Resolve the logical view scope for the selected element.
  let scopeOptions: ReturnType<typeof createScopedAnnotationOptions>;
  if (iframeDoc) {
    try {
      const overlayRect = overlayEl.getBoundingClientRect();
      const iframeClientX = e.mouseX + overlayRect.left - iframeRect.left;
      const iframeClientY = e.mouseY + overlayRect.top - iframeRect.top;
      const el =
        iframeDoc.elementFromPoint(iframeClientX, iframeClientY) ??
        iframeDoc.querySelector(e.element.cssSelector);
      if (el) {
        scopeOptions = createScopedAnnotationOptions(slideObserver, el);
      }
    } catch {
      // Selector may be invalid — ignore
    }
  }

  // Create annotation with empty text — sidebar will focus the input
  manager.create(e.element, anchorPoint, '', scopeOptions);

  // Single-shot: deactivate picker after one selection
  picker.deactivate();
});

// ============================================================
// Text edit committed → resolve scope, record edit instruction
// ============================================================

bus.on('edit:commit', (e) => {
  // The scope is resolved from the actual edited node in edit-mode and arrives
  // on the event — no need to re-query the (possibly ambiguous) selector here.
  const committedEdit = editManager.commit({
    element: e.element,
    oldHtml: e.oldHtml,
    newHtml: e.newHtml,
    oldText: e.oldText,
    newText: e.newText,
    ...(e.viewScope && { viewScope: e.viewScope }),
  });
  if (!committedEdit) {
    editor.clearEditedMarker(e.element, e.viewScope);
  }
});

// ============================================================
// Annotation selected → scroll iframe to element, highlight it
// ============================================================

bus.on('annotation:select', (e) => {
  const annotation = manager.getById(e.id);
  if (!annotation) return;

  const iframeDoc = iframeEl.contentDocument;
  if (!iframeDoc) return;

  const navigated = activateScopeForAnnotation(slideObserver, annotation);

  // Wait a tick for slide transition before scrolling to element
  const scrollToElement = () => {
    const activeScopeAfterNavigation = slideObserver.getActiveScope();
    const selectionScope =
      annotation.viewScope ??
      (
        annotation.slideIndex !== undefined &&
        activeScopeAfterNavigation?.index === annotation.slideIndex
          ? activeScopeAfterNavigation
          : undefined
      );

    const match = reanchorAnnotation(
      annotation.element,
      iframeDoc,
      selectionScope ? { viewScope: selectionScope } : undefined,
    );
    const el = match?.element;
    if (!el) return;

    el.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Add a temporary dashed highlight border
    const htmlEl = el as HTMLElement;
    if (htmlEl.style) {
      const prev = htmlEl.style.outline;
      htmlEl.style.outline = '2px dashed var(--dn-accent)';
      setTimeout(() => {
        htmlEl.style.outline = prev;
      }, 2000);
    }
  };

  if (navigated) {
    requestAnimationFrame(scrollToElement);
  } else {
    scrollToElement();
  }
});

// ============================================================
// Output: copy and download
// ============================================================

bus.on('output:copy', (e) => {
  if (!currentSession) return;
  commitPendingTextEdit();
  captureSessionState();
  let text: string;
  if (e.format === 'compact') {
    text = formatter.toCompact(currentSession);
  } else if (e.format === 'markdown') {
    text = formatter.toMarkdown(currentSession);
  } else {
    text = formatter.toJSON(currentSession);
  }
  copyToClipboard(text);
});

bus.on('output:download', (e) => {
  if (!currentSession) return;
  commitPendingTextEdit();
  captureSessionState();
  if (e.format === 'json') {
    const json = formatter.toJSON(currentSession);
    const name = currentSession.sourceName.replace(/\.[^.]+$/, '') || 'annotations';
    downloadFile(json, `${name}-annotations.json`, 'application/json');
  } else {
    const md = formatter.toMarkdown(currentSession);
    const name = currentSession.sourceName.replace(/\.[^.]+$/, '') || 'annotations';
    downloadFile(md, `${name}-annotations.md`, 'text/markdown');
  }
});

// ============================================================
// Share: publish session HTML + annotations, then copy link
// ============================================================

bus.on('share:publish', async () => {
  if (!currentSession) return;

  commitPendingTextEdit();
  captureSessionState();
  bus.emit({ type: 'share:publishing' });
  currentSession.updatedAt = new Date().toISOString();

  try {
    const { id, url } = await publishOrCopyShare(currentSession, {
      origin: window.location.origin,
      publishShare,
      copyToClipboard,
      cacheSession: (session) => store.save(session, { cacheOnly: true }),
    });
    bus.emit({ type: 'share:copied', id, url });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to publish share';
    bus.emit({ type: 'share:error', message });
  }
});

// ============================================================
// Auto-save to IndexedDB
// ============================================================

async function persistCurrentSession(): Promise<void> {
  if (!currentSession) return;
  captureSessionState();
  currentSession.updatedAt = new Date().toISOString();

  try {
    await store.save(currentSession);
  } catch (error) {
    const message = currentSession.shareId
      ? 'Offline: changes saved locally but could not sync to the shared link'
      : error instanceof Error ? error.message : 'Unable to save annotations';
    bus.emit({ type: 'share:error', message });
    console.error('[Domnotate] session save error:', error);
  }
}

const localAutoSave = debounce(() => {
  void persistCurrentSession();
}, 1000);

const sharedTextAutoSave = debounce(() => {
  void persistCurrentSession();
}, 10000);

function persistAnnotationChange(mode: 'immediate' | 'text'): void {
  if (!currentSession?.shareId) {
    localAutoSave();
    return;
  }

  if (mode === 'immediate') {
    void persistCurrentSession();
  } else {
    sharedTextAutoSave();
  }
}

bus.on('annotation:create', () => persistAnnotationChange('immediate'));
bus.on('annotation:update', () => persistAnnotationChange('text'));
bus.on('annotation:delete', () => persistAnnotationChange('immediate'));
bus.on('edit:create', () => persistAnnotationChange('immediate'));
bus.on('edit:update', () => persistAnnotationChange('text'));
bus.on('edit:delete', () => persistAnnotationChange('immediate'));

// ============================================================
// Session cleared — auto-save cleared session
// ============================================================

bus.on('session:cleared', () => {
  if (currentSession) {
    currentSession.annotations = [];
    currentSession.edits = [];
    currentSession.updatedAt = new Date().toISOString();
    void persistCurrentSession();
  }
});

console.log('[Domnotate] Ready');

function getSharedRouteId(): string | null {
  const match = window.location.pathname.match(/^\/share\/([^/]+)\/?$/);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

async function loadSharedRoute(): Promise<void> {
  const shareId = getSharedRouteId();
  if (!shareId) return;

  try {
    const sharedSession = await store.load(shareId, { preferCloud: true });
    if (!sharedSession?.html) {
      throw new Error('Shared link not found');
    }

    pendingSharedSession = sharedSession;
    await loader.loadHtml(sharedSession.html, sharedSession.sourceType, sharedSession.sourceName, {
      allowScripts: false,
    });

    if (sharedSession.sourceType === 'url') {
      bus.emit({
        type: 'share:notice',
        message: 'Some external assets may be missing from this shared URL capture',
      });
    }
  } catch (error) {
    pendingSharedSession = null;
    const message = error instanceof Error ? error.message : 'Unable to load shared link';
    bus.emit({ type: 'share:error', message });
    console.error('[Domnotate] shared route load error:', error);
  }
}

void loadSharedRoute();

// ============================================================
// Debug-only scope diagnostics panel
// ============================================================

let diagnosticsPanel: DiagnosticsPanel | null = null;
if (isDiagnosticsEnabled()) {
  diagnosticsPanel = mountDiagnosticsPanel(document.body, {
    bus,
    manager,
    observer: slideObserver,
    getIframeDocument: () => iframeEl.contentDocument,
  });
  console.log('[Domnotate] scope diagnostics enabled');
}

window.addEventListener('beforeunload', () => {
  diagnosticsPanel?.destroy();
});
