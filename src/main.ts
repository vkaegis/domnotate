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
import { createSidebar } from '@/sidebar/sidebar';
import { createToast } from '@/toast/toast';
import { createKeyboardShortcuts } from '@/keyboard/shortcuts';

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
const formatter = createOutputFormatter();
const store = createSessionStore();
const sidebar = createSidebar(sidebarEl, bus, manager, picker);
const contentAreaEl = document.getElementById('content-area')!;
const toast = createToast(contentAreaEl, bus);

// App state
let currentSession: AnnotationSession | null = null;
let selectedAnnotationId: string | null = null;
let pinsVisible = true;

// Track selection and pin visibility via bus
bus.on('annotation:select', (e) => { selectedAnnotationId = e.id; });
bus.on('annotation:deselect', () => { selectedAnnotationId = null; });
bus.on('annotation:delete', (e) => {
  if (selectedAnnotationId === e.id) selectedAnnotationId = null;
});
bus.on('pins:visibility', (e) => { pinsVisible = e.visible; });

// Keyboard shortcuts
createKeyboardShortcuts({
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
  sidebar.show();
});

// ============================================================
// Content unloaded → back to drop zone
// ============================================================

bus.on('content:unloaded', () => {
  picker.deactivate();
  pinRenderer.destroy();
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

  // Create annotation with empty text — sidebar will focus the input
  manager.create(e.element, anchorPoint, '');

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

  try {
    const el = iframeDoc.querySelector(annotation.element.cssSelector);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });

      // Add a temporary dashed highlight border
      const prev = (el as HTMLElement).style.outline;
      (el as HTMLElement).style.outline = '2px dashed #C4725A';
      setTimeout(() => {
        (el as HTMLElement).style.outline = prev;
      }, 2000);
    }
  } catch {
    // Selector may be invalid — ignore
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
