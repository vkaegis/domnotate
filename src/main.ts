import { createEventBus } from '@/events';
import type { AppMode, AnnotationSession } from '@/types/core';
import { createContentLoader } from '@/loader/loader';
import { createElementPicker } from '@/picker/picker';
import { createAnnotationManager } from '@/annotations/annotation-manager';
import { createPinRenderer } from '@/annotations/pin-renderer';
import { createCommentPopup } from '@/annotations/comment-popup';
import { createToolbar } from '@/toolbar/toolbar';
import { createOutputFormatter } from '@/output/formatter';
import { createSessionStore } from '@/output/store';
import { copyToClipboard, downloadFile } from '@/output/exporter';

// ============================================================
// Domnotate — Main Integration
// ============================================================

const bus = createEventBus();

// DOM refs
const dropZoneEl = document.getElementById('drop-zone')!;
const iframeEl = document.getElementById('content-frame') as HTMLIFrameElement;
const overlayEl = document.getElementById('overlay')!;
const toolbarEl = document.getElementById('toolbar')!;

// Create all modules
const loader = createContentLoader();
const picker = createElementPicker();
const manager = createAnnotationManager();
const pinRenderer = createPinRenderer();
const commentPopup = createCommentPopup(overlayEl, bus);
const toolbar = createToolbar(toolbarEl, bus);
const formatter = createOutputFormatter();
const store = createSessionStore();

// App state
let currentMode: AppMode = 'browse';
let currentSession: AnnotationSession | null = null;

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
// Content loaded → init picker, pins, show toolbar
// ============================================================

bus.on('content:loaded', (e) => {
  // Create or resume session
  currentSession = {
    id: crypto.randomUUID(),
    sourceType: e.sourceType,
    sourceName: e.sourceName,
    loadedUrl: e.url,
    annotations: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Init picker and pin renderer (need iframe to be loaded)
  picker.init(iframeEl, overlayEl, bus);
  pinRenderer.init(overlayEl, iframeEl, bus, manager);

  // Show toolbar
  toolbar.show();
});

// ============================================================
// Content unloaded → back to drop zone
// ============================================================

bus.on('content:unloaded', () => {
  picker.deactivate();
  pinRenderer.destroy();
  commentPopup.hide();
  toolbar.hide();
  loader.unload();
  manager.clearAll();
  currentSession = null;
  currentMode = 'browse';
});

// ============================================================
// Mode changes → activate/deactivate picker
// ============================================================

bus.on('mode:change', (e) => {
  currentMode = e.mode;
  if (currentMode === 'annotate') {
    picker.activate();
  } else {
    picker.deactivate();
    commentPopup.hide();
  }
});

// ============================================================
// Element selected → show comment popup to create annotation
// ============================================================

bus.on('picker:select', (e) => {
  // Calculate anchor point in iframe content coordinates
  const iframeRect = iframeEl.getBoundingClientRect();
  const iframeDoc = iframeEl.contentDocument;
  const scrollX = iframeDoc?.documentElement.scrollLeft ?? 0;
  const scrollY = iframeDoc?.documentElement.scrollTop ?? 0;

  const anchorPoint = {
    x: e.mouseX - iframeRect.left + scrollX,
    y: e.mouseY - iframeRect.top + scrollY,
  };

  // Show comment popup for new annotation
  commentPopup.show(null, e.mouseX, e.mouseY, (text: string) => {
    manager.create(e.element, anchorPoint, text);
    commentPopup.hide();
  }, () => {
    // On close — nothing extra needed
  });
});

// ============================================================
// Pin clicked → show comment popup for existing annotation
// ============================================================

bus.on('annotation:select', (e) => {
  const annotation = manager.getById(e.id);
  if (!annotation) return;

  // Position popup near the pin
  const iframeDoc = iframeEl.contentDocument;
  const scrollX = iframeDoc?.documentElement.scrollLeft ?? 0;
  const scrollY = iframeDoc?.documentElement.scrollTop ?? 0;

  const popupX = annotation.anchorPoint.x - scrollX + 20;
  const popupY = annotation.anchorPoint.y - scrollY;

  commentPopup.show(annotation, popupX, popupY, (text: string) => {
    manager.addComment(annotation.id, text);
    // Re-show with updated annotation
    const updated = manager.getById(annotation.id);
    if (updated) {
      commentPopup.show(updated, popupX, popupY, (t) => {
        manager.addComment(updated.id, t);
      }, () => {});
    }
  }, () => {
    // On close
  });
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
// Auto-save to IndexedDB
// ============================================================

const autoSave = debounce(() => {
  if (!currentSession) return;
  currentSession.annotations = manager.getAll();
  currentSession.updatedAt = new Date().toISOString();
  store.save(currentSession);
}, 1000);

bus.on('annotation:create', autoSave);
bus.on('annotation:update', autoSave);
bus.on('annotation:delete', autoSave);

// ============================================================
// Session cleared (from toolbar clear button)
// ============================================================

bus.on('session:cleared', () => {
  manager.clearAll();
  commentPopup.hide();
  pinRenderer.render();
});

console.log('[Domnotate] Ready');
