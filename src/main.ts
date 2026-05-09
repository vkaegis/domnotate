import { createEventBus } from '@/events';
import type { AnnotationSession } from '@/types/core';
import { createContentLoader } from '@/loader/loader';
import { createElementPicker } from '@/picker/picker';
import { createAnnotationManager } from '@/annotations/annotation-manager';
import { createPinRenderer } from '@/annotations/pin-renderer';
import { createNotePopover } from '@/popover/popover';
import { createOutputFormatter } from '@/output/formatter';
import { createSessionStore } from '@/output/store';
import { copyToClipboard, downloadFile } from '@/output/exporter';
import { initTheme } from '@/theme/theme-toggle';
import { createSidebar } from '@/sidebar/sidebar';
import { createToast } from '@/toast/toast';
import { createKeyboardShortcuts } from '@/keyboard/shortcuts';
import { createSlideObserver } from '@/slides/slide-observer';
import { publishShare } from '@/share/share-client';
import { publishOrCopyShare } from '@/share/share-action';

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
const manager = createAnnotationManager();
const pinRenderer = createPinRenderer();
const notePopover = createNotePopover();
const formatter = createOutputFormatter();
const store = createSessionStore();
const slideObserver = createSlideObserver();
// Clear annotations before sidebar listeners re-render (event ordering matters)
bus.on('session:cleared', () => {
  manager.clearAll();
  pinRenderer.render();
});

const sidebar = createSidebar(sidebarEl, bus, manager, picker, slideObserver);
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
  slideObserver.init(iframeEl, bus);
  pinRenderer.init(overlayEl, iframeEl, bus, manager, slideObserver);
  notePopover.init(overlayEl, iframeEl, bus, manager);
  shortcuts.attachIframe(iframeEl);
  sidebar.show();

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
  notePopover.destroy();
  pinRenderer.destroy();
  slideObserver.destroy();
  shortcuts.detachIframe();
  sidebar.hide();
  loader.unload();
  manager.clearAll();
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

  // Resolve slide index for the selected element
  let slideIndex: number | undefined;
  if (iframeDoc) {
    try {
      const el = iframeDoc.querySelector(e.element.cssSelector);
      if (el) {
        slideIndex = slideObserver.getSlideForElement(el);
      }
    } catch {
      // Selector may be invalid — ignore
    }
  }

  // Create annotation with empty text — sidebar will focus the input
  manager.create(e.element, anchorPoint, '', slideIndex);

  // Single-shot: deactivate picker after one selection
  picker.deactivate();
});

// ============================================================
// Annotation selected → scroll iframe to element, highlight it
// ============================================================

bus.on('annotation:select', (e) => {
  const annotation = manager.getById(e.id);
  if (!annotation) return;

  const iframeDoc = iframeEl.contentDocument;
  if (!iframeDoc) return;

  // Navigate to the annotation's slide if needed
  const needsSlideNav =
    annotation.slideIndex !== undefined &&
    slideObserver.getActiveSlide() !== null &&
    slideObserver.getActiveSlide() !== annotation.slideIndex;

  if (needsSlideNav) {
    slideObserver.goToSlide(annotation.slideIndex!);
  }

  // Wait a tick for slide transition before scrolling to element
  const scrollToElement = () => {
    try {
      const el = iframeDoc.querySelector(annotation.element.cssSelector);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Add a temporary dashed highlight border
        const prev = (el as HTMLElement).style.outline;
        (el as HTMLElement).style.outline = '2px dashed var(--dn-accent)';
        setTimeout(() => {
          (el as HTMLElement).style.outline = prev;
        }, 2000);
      }
    } catch {
      // Selector may be invalid — ignore
    }
  };

  if (needsSlideNav) {
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
  currentSession.annotations = manager.getAll();
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
  currentSession.annotations = manager.getAll();
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

  bus.emit({ type: 'share:publishing' });
  currentSession.annotations = manager.getAll();
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
  currentSession.annotations = manager.getAll();
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

// ============================================================
// Session cleared — auto-save cleared session
// ============================================================

bus.on('session:cleared', () => {
  if (currentSession) {
    currentSession.annotations = [];
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
      throw new Error('Share not found');
    }

    pendingSharedSession = sharedSession;
    await loader.loadHtml(sharedSession.html, sharedSession.sourceType, sharedSession.sourceName, {
      allowScripts: false,
    });
  } catch (error) {
    pendingSharedSession = null;
    const message = error instanceof Error ? error.message : 'Unable to load share';
    bus.emit({ type: 'share:error', message });
    console.error('[Domnotate] shared route load error:', error);
  }
}

void loadSharedRoute();
