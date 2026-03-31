import { createEventBus } from '@/events';
import type { AnnotationSession } from '@/types/core';
import { createContentLoader } from '@/loader/loader';
import { createElementPicker } from '@/picker/picker';
import { createAnnotationManager } from '@/annotations/annotation-manager';
import { createPinRenderer } from '@/annotations/pin-renderer';
import { createOutputFormatter } from '@/output/formatter';
import { createSessionStore } from '@/output/store';
import { copyToClipboard, downloadFile } from '@/output/exporter';
import { initTheme } from '@/theme/theme-toggle';

// ============================================================
// Domnotate — Main Integration
// ============================================================

initTheme();

const bus = createEventBus();

// DOM refs
const dropZoneEl = document.getElementById('drop-zone')!;
const iframeEl = document.getElementById('content-frame') as HTMLIFrameElement;
const overlayEl = document.getElementById('overlay')!;

// Create modules
const loader = createContentLoader();
const picker = createElementPicker();
const manager = createAnnotationManager();
const pinRenderer = createPinRenderer();
const formatter = createOutputFormatter();
const store = createSessionStore();

// App state
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
// Content loaded → init picker, pins, show sidebar
// ============================================================

bus.on('content:loaded', (e) => {
  currentSession = {
    id: crypto.randomUUID(),
    sourceType: e.sourceType,
    sourceName: e.sourceName,
    loadedUrl: e.url,
    annotations: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  picker.init(iframeEl, overlayEl, bus);
  pinRenderer.init(overlayEl, iframeEl, bus, manager);

  // Sidebar will be shown here (Task 5)
});

// ============================================================
// Content unloaded → back to drop zone
// ============================================================

bus.on('content:unloaded', () => {
  picker.deactivate();
  pinRenderer.destroy();
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

  // Create annotation with empty text — sidebar will focus the input
  manager.create(e.element, anchorPoint, '');

  // Single-shot: deactivate picker after one selection
  picker.deactivate();
});

// ============================================================
// Output: copy and download
// ============================================================

bus.on('output:copy', (e) => {
  if (!currentSession) return;
  currentSession.annotations = manager.getAll();
  const text = e.format === 'markdown'
    ? formatter.toMarkdown(currentSession)
    : formatter.toJSON(currentSession);
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
// Session cleared
// ============================================================

bus.on('session:cleared', () => {
  manager.clearAll();
  pinRenderer.render();
});

console.log('[Domnotate] Ready');
