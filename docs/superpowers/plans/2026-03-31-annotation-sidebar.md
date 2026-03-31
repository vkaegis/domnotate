# Annotation Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the floating toolbar and comment popup with a resizable right sidebar that houses all annotations and actions, retheme the app to warm parchment palette with dark mode support, and simplify the data model from threaded comments to single-text annotations.

**Architecture:** The sidebar is a new module (`src/sidebar/`) that renders a notes panel with action bar, scrollable notes list, and empty state. The annotation data model drops `Comment[]` in favor of a single `text` field. The picker becomes single-shot (activate once, auto-deactivate after selection). The theme switches from dark to a warm parchment light theme with `[data-theme="dark"]` support. Layout changes from full-width iframe to a two-column split (iframe + sidebar).

**Tech Stack:** TypeScript, Vite, vanilla DOM (no framework), CSS custom properties, Geist font, Dexie (IndexedDB)

---

## File Map

### New files
| File | Responsibility |
|------|----------------|
| `src/sidebar/sidebar.ts` | Sidebar container, resize handle, show/hide, width management |
| `src/sidebar/notes-panel.ts` | Action bar, notes list, empty state, inline editing, all sidebar content |
| `src/sidebar/sidebar.css` | All sidebar styles |
| `src/theme/theme-toggle.ts` | Dark/light mode detection and toggle (reads `prefers-color-scheme`, stores preference) |

### Modified files
| File | Changes |
|------|---------|
| `src/types/core.ts` | Remove `Comment`, `AnnotationStatus`, `AppMode`; simplify `Annotation` to use `text: string`; update `AnnotationManager` interface; remove `mode:change` event |
| `src/styles/theme.css` | Complete rewrite — warm parchment light theme as default, dark theme via `[data-theme="dark"]`, add sidebar layout variables |
| `src/styles/reset.css` | Add Geist font import |
| `index.html` | Add sidebar container element, restructure layout |
| `src/main.ts` | Remove toolbar/popup imports, add sidebar, wire single-shot picker, update layout logic |
| `src/annotations/annotation-manager.ts` | Simplify `create()` to take `text`, remove `addComment()`, remove `updateStatus()`, add `updateText()` |
| `src/annotations/pin-renderer.ts` | Use terracotta color, remove status filter, use `--dn-accent` for pin color |
| `src/output/formatter.ts` | Simplify markdown output (no threads, no status, single text per annotation) |
| `src/output/json-io.ts` | Update `validateSession()` for new schema (text instead of comments) |
| `src/output/store.ts` | No changes needed (schema-agnostic) |
| `src/picker/picker.ts` | No changes needed (activate/deactivate already work; single-shot is handled by main.ts) |
| `src/loader/drop-zone.ts` | Update to use new theme variables (already uses them, just verifying visual consistency) |

### Deleted files
| File | Reason |
|------|--------|
| `src/annotations/comment-popup.ts` | Replaced by sidebar inline editing |
| `src/annotations/thread.ts` | Thread model removed — single text per annotation |
| `src/toolbar/toolbar.ts` | Replaced by sidebar action bar |
| `src/toolbar/toolbar.css` | Replaced by sidebar styles |

---

## Task 1: Theme — Parchment light + dark mode support

**Files:**
- Modify: `src/styles/theme.css` (full rewrite)
- Modify: `src/styles/reset.css` (add Geist font)
- Create: `src/theme/theme-toggle.ts`

- [ ] **Step 1: Add Geist font import to reset.css**

Replace `src/styles/reset.css`:

```css
@import url('https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700&display=swap');

*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html, body {
  height: 100%;
  overflow: hidden;
}

body {
  font-family: 'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
```

- [ ] **Step 2: Rewrite theme.css with parchment palette and dark mode**

Replace `src/styles/theme.css` entirely:

```css
/* ============================================================
   Domnotate — Theme
   Light (parchment) default, dark via [data-theme="dark"]
   ============================================================ */

:root {
  /* Surface colors — warm parchment */
  --dn-bg-primary: #FAF7F2;
  --dn-bg-secondary: #F3EDE4;
  --dn-bg-elevated: #FFFFFF;
  --dn-bg-overlay: rgba(255, 255, 255, 0.95);

  /* Border */
  --dn-border: #E4D9CA;
  --dn-border-hover: #D4C9BA;

  /* Text */
  --dn-text-primary: #2C2016;
  --dn-text-secondary: #6B5D4F;
  --dn-text-muted: #B0A48F;

  /* Accent — terracotta */
  --dn-accent: #C4725A;
  --dn-accent-hover: #B5634B;
  --dn-accent-subtle: rgba(196, 114, 90, 0.06);
  --dn-accent-muted: #8A7D6B;

  /* Pin */
  --dn-pin-color: #C4725A;

  /* Highlight overlay */
  --dn-highlight-bg: rgba(196, 114, 90, 0.12);
  --dn-highlight-border: rgba(196, 114, 90, 0.6);

  /* Sizing */
  --dn-radius-sm: 6px;
  --dn-radius-md: 10px;
  --dn-radius-lg: 16px;
  --dn-radius-pill: 999px;

  --dn-pin-size: 22px;
  --dn-sidebar-width: 360px;
  --dn-sidebar-min: 200px;
  --dn-sidebar-max: 50vw;

  /* Transitions */
  --dn-transition-fast: 120ms ease;
  --dn-transition-normal: 200ms ease;

  /* Z-index layers */
  --dn-z-iframe: 1;
  --dn-z-overlay: 1000;
  --dn-z-pins: 1001;
  --dn-z-sidebar: 1002;
  --dn-z-resize-handle: 1003;
}

/* --- Dark theme --- */
[data-theme="dark"] {
  --dn-bg-primary: #1A1612;
  --dn-bg-secondary: #231F1A;
  --dn-bg-elevated: #2C2620;
  --dn-bg-overlay: rgba(26, 22, 18, 0.95);

  --dn-border: #3D352B;
  --dn-border-hover: #4D453B;

  --dn-text-primary: #F0EBE4;
  --dn-text-secondary: #A89B8C;
  --dn-text-muted: #6B5D4F;

  --dn-accent: #D4836A;
  --dn-accent-hover: #E4937A;
  --dn-accent-subtle: rgba(212, 131, 106, 0.08);
  --dn-accent-muted: #8A7D6B;

  --dn-pin-color: #D4836A;

  --dn-highlight-bg: rgba(212, 131, 106, 0.15);
  --dn-highlight-border: rgba(212, 131, 106, 0.6);
}

/* --- Auto dark mode for users who haven't explicitly chosen --- */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --dn-bg-primary: #1A1612;
    --dn-bg-secondary: #231F1A;
    --dn-bg-elevated: #2C2620;
    --dn-bg-overlay: rgba(26, 22, 18, 0.95);

    --dn-border: #3D352B;
    --dn-border-hover: #4D453B;

    --dn-text-primary: #F0EBE4;
    --dn-text-secondary: #A89B8C;
    --dn-text-muted: #6B5D4F;

    --dn-accent: #D4836A;
    --dn-accent-hover: #E4937A;
    --dn-accent-subtle: rgba(212, 131, 106, 0.08);
    --dn-accent-muted: #8A7D6B;

    --dn-pin-color: #D4836A;

    --dn-highlight-bg: rgba(212, 131, 106, 0.15);
    --dn-highlight-border: rgba(212, 131, 106, 0.6);
  }
}

/* --- Base layout --- */

body {
  background: var(--dn-bg-primary);
  color: var(--dn-text-primary);
}

#app {
  height: 100vh;
  display: flex;
  position: relative;
}

/* Drop zone takes full screen */
#drop-zone {
  flex: 1;
}

/* Content area + sidebar split */
#content-area {
  flex: 1;
  position: relative;
  overflow: hidden;
}

#content-area.hidden {
  display: none;
}

#content-frame {
  width: 100%;
  height: 100%;
  border: none;
  background: white;
  position: relative;
  z-index: var(--dn-z-iframe);
}

#overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: var(--dn-z-overlay);
  pointer-events: none;
}

#sidebar {
  display: none;
}

.hidden {
  display: none !important;
}
```

- [ ] **Step 3: Create theme-toggle.ts**

Create `src/theme/theme-toggle.ts`:

```typescript
// ============================================================
// Domnotate — Theme Toggle
// ============================================================

const STORAGE_KEY = 'domnotate-theme';

export type Theme = 'light' | 'dark' | 'system';

/** Read stored preference, default to 'system'. */
export function getStoredTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return 'system';
}

/** Apply the theme to the document root. */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'system') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', theme);
  }
  localStorage.setItem(STORAGE_KEY, theme);
}

/** Initialize theme on page load. */
export function initTheme(): void {
  applyTheme(getStoredTheme());
}
```

- [ ] **Step 4: Verify theme loads**

Run: `cd /Users/vkaegis/conductor/workspaces/domnotate/baton-rouge && npx vite build`
Expected: Build succeeds with no errors.

- [ ] **Step 5: Commit**

```bash
git add src/styles/theme.css src/styles/reset.css src/theme/theme-toggle.ts
git commit -m "feat: retheme app with warm parchment palette and dark mode support"
```

---

## Task 2: Simplify data model — single text per annotation

**Files:**
- Modify: `src/types/core.ts`
- Modify: `src/annotations/annotation-manager.ts`
- Modify: `src/output/json-io.ts`
- Modify: `src/output/formatter.ts`
- Delete: `src/annotations/thread.ts`

- [ ] **Step 1: Rewrite core types**

Replace `src/types/core.ts` with:

```typescript
// ============================================================
// Domnotate — Shared Types
// ============================================================

// === Element Identity ===

export interface ElementDescriptor {
  /** Primary CSS selector (most robust available) */
  cssSelector: string;
  /** XPath fallback */
  xpath: string;
  /** Tag name, e.g. "div" */
  tagName: string;
  /** Class list */
  classes: string[];
  /** Element id if present */
  id: string | null;
  /** Text content preview (first 80 chars) */
  textPreview: string;
  /** Bounding rect at time of selection (iframe-relative) */
  rect: { x: number; y: number; width: number; height: number };
  /** DOM depth from body */
  depth: number;
  /** Human-readable path e.g. "body > div.container > p:nth-child(2)" */
  domPath: string;
}

// === Annotations ===

export interface Annotation {
  id: string;
  /** Identified element */
  element: ElementDescriptor;
  /** Pin position relative to iframe content (not viewport) */
  anchorPoint: { x: number; y: number };
  /** The annotation text (single comment) */
  text: string;
  /** Visual color tag */
  color: string;
  createdAt: string;
  updatedAt: string;
}

// === Session ===

export interface AnnotationSession {
  id: string;
  sourceType: 'file' | 'url';
  sourceName: string;
  /** Blob URL or original URL loaded in iframe */
  loadedUrl: string;
  annotations: Annotation[];
  createdAt: string;
  updatedAt: string;
}

// === Event Bus ===

export type DomnotateEvent =
  | { type: 'content:loaded'; url: string; sourceType: 'file' | 'url'; sourceName: string }
  | { type: 'content:unloaded' }
  | { type: 'picker:hover'; element: ElementDescriptor; mouseX: number; mouseY: number }
  | { type: 'picker:unhover' }
  | { type: 'picker:select'; element: ElementDescriptor; mouseX: number; mouseY: number }
  | { type: 'picker:deselect' }
  | { type: 'annotation:create'; annotation: Annotation }
  | { type: 'annotation:update'; annotation: Annotation }
  | { type: 'annotation:delete'; id: string }
  | { type: 'annotation:select'; id: string }
  | { type: 'annotation:deselect' }
  | { type: 'pins:visibility'; visible: boolean }
  | { type: 'session:loaded'; session: AnnotationSession }
  | { type: 'session:cleared' }
  | { type: 'output:copy'; format: 'markdown' | 'json' }
  | { type: 'output:download'; format: 'markdown' | 'json' };

export type DomnotateEventType = DomnotateEvent['type'];

export type DomnotateEventPayload<T extends DomnotateEventType> = Extract<
  DomnotateEvent,
  { type: T }
>;

export interface EventBus {
  emit<T extends DomnotateEventType>(event: DomnotateEventPayload<T>): void;
  on<T extends DomnotateEventType>(
    type: T,
    handler: (event: DomnotateEventPayload<T>) => void,
  ): () => void;
}

// === Module Interfaces ===

export interface ContentLoader {
  init(iframeEl: HTMLIFrameElement, dropZoneEl: HTMLElement, bus: EventBus): void;
  loadFile(file: File): Promise<void>;
  loadUrl(url: string): Promise<void>;
  getIframeDocument(): Document | null;
  unload(): void;
}

export interface ElementPicker {
  init(iframeEl: HTMLIFrameElement, overlayEl: HTMLElement, bus: EventBus): void;
  activate(): void;
  deactivate(): void;
  isActive(): boolean;
}

export interface AnnotationManager {
  init(bus: EventBus): void;
  getAll(): Annotation[];
  getById(id: string): Annotation | undefined;
  create(element: ElementDescriptor, anchorPoint: { x: number; y: number }, text: string): Annotation;
  updateText(annotationId: string, text: string): void;
  delete(id: string): void;
  loadAnnotations(annotations: Annotation[]): void;
  clearAll(): void;
}

export interface PinRenderer {
  init(
    overlayEl: HTMLElement,
    iframeEl: HTMLIFrameElement,
    bus: EventBus,
    manager: AnnotationManager,
  ): void;
  render(): void;
  setVisible(visible: boolean): void;
  destroy(): void;
}

export interface OutputFormatter {
  toMarkdown(session: AnnotationSession): string;
  toJSON(session: AnnotationSession): string;
}

export interface SessionStore {
  save(session: AnnotationSession): Promise<void>;
  load(id: string): Promise<AnnotationSession | null>;
  listSessions(): Promise<Array<{ id: string; sourceName: string; updatedAt: string }>>;
  delete(id: string): Promise<void>;
  exportJSON(session: AnnotationSession): string;
  importJSON(json: string): AnnotationSession;
}
```

- [ ] **Step 2: Rewrite annotation-manager.ts**

Replace `src/annotations/annotation-manager.ts`:

```typescript
// ============================================================
// Domnotate — Annotation Manager
// ============================================================

import type {
  Annotation,
  AnnotationManager,
  ElementDescriptor,
  EventBus,
} from '@/types/core';

export function createAnnotationManager(): AnnotationManager {
  const store = new Map<string, Annotation>();
  let bus: EventBus | null = null;

  function requireBus(): EventBus {
    if (!bus) throw new Error('AnnotationManager not initialised — call init(bus) first');
    return bus;
  }

  function now(): string {
    return new Date().toISOString();
  }

  const manager: AnnotationManager = {
    init(eventBus: EventBus): void {
      bus = eventBus;
    },

    getAll(): Annotation[] {
      return Array.from(store.values()).sort((a, b) =>
        a.createdAt.localeCompare(b.createdAt),
      );
    },

    getById(id: string): Annotation | undefined {
      return store.get(id);
    },

    create(
      element: ElementDescriptor,
      anchorPoint: { x: number; y: number },
      text: string,
    ): Annotation {
      const b = requireBus();
      const timestamp = now();

      const annotation: Annotation = {
        id: crypto.randomUUID(),
        element,
        anchorPoint,
        text,
        color: '#C4725A',
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      store.set(annotation.id, annotation);
      b.emit({ type: 'annotation:create', annotation });

      return annotation;
    },

    updateText(annotationId: string, text: string): void {
      const b = requireBus();
      const annotation = store.get(annotationId);
      if (!annotation) {
        throw new Error(`Annotation not found: ${annotationId}`);
      }

      annotation.text = text;
      annotation.updatedAt = now();

      b.emit({ type: 'annotation:update', annotation });
    },

    delete(id: string): void {
      const b = requireBus();
      if (!store.has(id)) {
        throw new Error(`Annotation not found: ${id}`);
      }

      store.delete(id);
      b.emit({ type: 'annotation:delete', id });
    },

    loadAnnotations(annotations: Annotation[]): void {
      for (const annotation of annotations) {
        store.set(annotation.id, annotation);
      }
    },

    clearAll(): void {
      store.clear();
    },
  };

  return manager;
}
```

- [ ] **Step 3: Delete thread.ts**

```bash
rm src/annotations/thread.ts
```

- [ ] **Step 4: Update json-io.ts validation for new schema**

Replace `src/output/json-io.ts`:

```typescript
// ============================================================
// Domnotate — JSON Serialization / Deserialization
// ============================================================

import type { AnnotationSession } from '@/types/core';

export function serializeSession(session: AnnotationSession): string {
  return JSON.stringify(session, null, 2);
}

export function deserializeSession(json: string): AnnotationSession {
  const data: unknown = JSON.parse(json);
  if (!validateSession(data)) {
    throw new Error('Invalid session JSON: does not conform to AnnotationSession schema');
  }
  return data;
}

export function validateSession(data: unknown): data is AnnotationSession {
  if (data === null || typeof data !== 'object') return false;

  const obj = data as Record<string, unknown>;

  // Top-level required string fields
  if (typeof obj.id !== 'string') return false;
  if (obj.sourceType !== 'file' && obj.sourceType !== 'url') return false;
  if (typeof obj.sourceName !== 'string') return false;
  if (typeof obj.loadedUrl !== 'string') return false;
  if (typeof obj.createdAt !== 'string') return false;
  if (typeof obj.updatedAt !== 'string') return false;

  // Annotations array
  if (!Array.isArray(obj.annotations)) return false;

  for (const ann of obj.annotations) {
    if (ann === null || typeof ann !== 'object') return false;
    const a = ann as Record<string, unknown>;

    if (typeof a.id !== 'string') return false;
    if (typeof a.createdAt !== 'string') return false;
    if (typeof a.updatedAt !== 'string') return false;
    if (typeof a.text !== 'string') return false;
    if (typeof a.color !== 'string') return false;

    // anchorPoint
    if (a.anchorPoint === null || typeof a.anchorPoint !== 'object') return false;
    const ap = a.anchorPoint as Record<string, unknown>;
    if (typeof ap.x !== 'number' || typeof ap.y !== 'number') return false;

    // element descriptor
    if (a.element === null || typeof a.element !== 'object') return false;
    const el = a.element as Record<string, unknown>;
    if (typeof el.cssSelector !== 'string') return false;
    if (typeof el.xpath !== 'string') return false;
    if (typeof el.tagName !== 'string') return false;
    if (!Array.isArray(el.classes)) return false;
    if (typeof el.textPreview !== 'string') return false;
    if (typeof el.depth !== 'number') return false;
    if (typeof el.domPath !== 'string') return false;

    // rect
    if (el.rect === null || typeof el.rect !== 'object') return false;
    const rect = el.rect as Record<string, unknown>;
    if (typeof rect.x !== 'number' || typeof rect.y !== 'number') return false;
    if (typeof rect.width !== 'number' || typeof rect.height !== 'number') return false;
  }

  return true;
}
```

- [ ] **Step 5: Update formatter.ts for single-text annotations**

Replace `src/output/formatter.ts`:

```typescript
// ============================================================
// Domnotate — Output Formatter
// ============================================================

import type { AnnotationSession, Annotation, OutputFormatter } from '@/types/core';

function elementHeading(a: Annotation): string {
  const tag = a.element.tagName;
  const id = a.element.id ? `#${a.element.id}` : '';
  const cls = a.element.classes.length > 0 ? `.${a.element.classes[0]}` : '';
  return `${tag}${id}${cls}`;
}

export function createOutputFormatter(): OutputFormatter {
  return {
    toMarkdown(session: AnnotationSession): string {
      const total = session.annotations.length;
      const date = new Date().toISOString().split('T')[0];

      let md = '';
      md += `# Domnotate Annotations\n`;
      md += `**Source:** ${session.sourceName}\n`;
      md += `**Generated:** ${date}\n`;
      md += `**Annotations:** ${total}\n`;
      md += `\n---\n\n`;

      session.annotations.forEach((a, i) => {
        const heading = elementHeading(a);
        md += `## ${i + 1}. ${heading}\n`;
        md += `**Selector:** \`${a.element.cssSelector}\`\n`;
        md += `**XPath:** \`${a.element.xpath}\`\n`;
        md += `**DOM Path:** ${a.element.domPath}\n`;
        md += `**Dimensions:** ${a.element.rect.width} x ${a.element.rect.height}\n`;
        md += `**Text Preview:** "${a.element.textPreview}"\n`;
        md += `\n`;

        if (a.text) {
          md += `> ${a.text}\n`;
        }

        md += `\n---\n\n`;
      });

      return md;
    },

    toJSON(session: AnnotationSession): string {
      return JSON.stringify(session, null, 2);
    },
  };
}
```

- [ ] **Step 6: Update pin-renderer.ts for new data model**

In `src/annotations/pin-renderer.ts`, make two changes:

a) In `createPinElement()`, change `background: annotation.color` to `background: 'var(--dn-pin-color)'`:

Replace:
```typescript
      background: annotation.color,
```
With:
```typescript
      background: 'var(--dn-pin-color)',
```

b) In both `positionPins()` and `render()`, remove the `.filter((a) => a.status === 'open')` since the `status` field no longer exists:

In `positionPins()`, replace:
```typescript
    const annotations = manager.getAll().filter((a) => a.status === 'open');
```
With:
```typescript
    const annotations = manager.getAll();
```

In `render()`, replace:
```typescript
      const annotations = manager.getAll().filter((a) => a.status === 'open');
```
With:
```typescript
      const annotations = manager.getAll();
```

- [ ] **Step 7: Verify build succeeds**

Run: `cd /Users/vkaegis/conductor/workspaces/domnotate/baton-rouge && npx vite build`
Expected: Build will fail due to remaining references to deleted types in `comment-popup.ts`, `toolbar.ts`, and `main.ts`. That's expected — we'll fix those in Task 3.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: simplify annotation model to single text field, remove threads"
```

---

## Task 3: Remove old UI components (toolbar, comment popup, mode system)

**Files:**
- Delete: `src/annotations/comment-popup.ts`
- Delete: `src/toolbar/toolbar.ts`
- Delete: `src/toolbar/toolbar.css`
- Modify: `src/main.ts` (strip old references, leave minimal shell)

- [ ] **Step 1: Delete old files**

```bash
rm src/annotations/comment-popup.ts
rm src/toolbar/toolbar.ts
rm src/toolbar/toolbar.css
```

- [ ] **Step 2: Strip main.ts to minimal shell**

Replace `src/main.ts` with a minimal version that keeps the loader, manager, pin renderer, output, and autosave working — but without toolbar, comment popup, or mode logic:

```typescript
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
```

- [ ] **Step 3: Verify build succeeds**

Run: `cd /Users/vkaegis/conductor/workspaces/domnotate/baton-rouge && npx vite build`
Expected: Build succeeds with no errors (all dead references removed).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: remove toolbar, comment popup, and mode system"
```

---

## Task 4: Layout — Split viewport into iframe + sidebar container

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Update index.html with sidebar container**

Replace `index.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Domnotate — Annotate any HTML</title>
  <link rel="stylesheet" href="/src/styles/reset.css" />
  <link rel="stylesheet" href="/src/styles/theme.css" />
</head>
<body>
  <div id="app">
    <div id="drop-zone"></div>
    <div id="content-area" class="hidden">
      <iframe id="content-frame" sandbox="allow-same-origin allow-scripts"></iframe>
      <div id="overlay"></div>
    </div>
    <div id="sidebar"></div>
  </div>
  <script type="module" src="/src/main.ts"></script>
</body>
</html>
```

Note: The `#toolbar` div is removed and replaced with `#sidebar`.

- [ ] **Step 2: Commit**

```bash
git add index.html
git commit -m "refactor: replace toolbar div with sidebar container in HTML"
```

---

## Task 5: Sidebar — Container with resize handle

**Files:**
- Create: `src/sidebar/sidebar.ts`
- Create: `src/sidebar/sidebar.css`

- [ ] **Step 1: Create sidebar.css**

Create `src/sidebar/sidebar.css`:

```css
/* ============================================================
   Domnotate — Sidebar Styles
   ============================================================ */

/* --- Container --- */

.dn-sidebar {
  display: flex;
  flex-direction: column;
  width: var(--dn-sidebar-width);
  min-width: var(--dn-sidebar-min);
  max-width: var(--dn-sidebar-max);
  height: 100vh;
  background: var(--dn-bg-primary);
  border-left: 1px solid var(--dn-border);
  position: relative;
  z-index: var(--dn-z-sidebar);
  flex-shrink: 0;
}

.dn-sidebar--hidden {
  display: none;
}

/* --- Resize handle --- */

.dn-resize-handle {
  position: absolute;
  top: 0;
  left: -3px;
  width: 6px;
  height: 100%;
  cursor: col-resize;
  z-index: var(--dn-z-resize-handle);
  background: transparent;
  transition: background var(--dn-transition-fast);
}

.dn-resize-handle:hover,
.dn-resize-handle--active {
  background: var(--dn-accent);
  opacity: 0.4;
}

/* --- Action bar --- */

.dn-action-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  border-bottom: 1px solid var(--dn-border);
  flex-shrink: 0;
}

.dn-action-bar__left {
  display: flex;
  align-items: center;
}

.dn-action-bar__right {
  display: flex;
  align-items: center;
  gap: 2px;
}

.dn-sort-toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border: none;
  border-radius: var(--dn-radius-sm);
  background: transparent;
  color: var(--dn-accent-muted);
  font-family: inherit;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: background var(--dn-transition-fast);
}

.dn-sort-toggle:hover {
  background: var(--dn-bg-secondary);
}

.dn-sort-toggle svg {
  width: 11px;
  height: 11px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.dn-action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: none;
  border-radius: var(--dn-radius-sm);
  background: transparent;
  color: var(--dn-accent-muted);
  cursor: pointer;
  transition: background var(--dn-transition-fast), color var(--dn-transition-fast);
  flex-shrink: 0;
}

.dn-action-btn:hover {
  background: var(--dn-bg-secondary);
  color: var(--dn-text-primary);
}

.dn-action-btn--active {
  background: var(--dn-accent);
  color: #fff;
}

.dn-action-btn--active:hover {
  background: var(--dn-accent-hover);
  color: #fff;
}

.dn-action-btn--dimmed {
  opacity: 0.35;
  pointer-events: none;
}

.dn-action-btn--copied {
  color: #34c759;
}

.dn-action-btn svg {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.dn-action-spacer {
  width: 6px;
  flex-shrink: 0;
}

/* --- Notes list --- */

.dn-notes-list {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
}

/* --- Note row --- */

.dn-note-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--dn-border);
  cursor: pointer;
  transition: background var(--dn-transition-fast);
  position: relative;
}

.dn-note-row:hover {
  background: var(--dn-bg-secondary);
}

.dn-note-row--selected {
  background: var(--dn-accent-subtle);
  border-left: 3px solid var(--dn-accent);
  padding-left: 13px; /* 16 - 3 to compensate for border */
}

.dn-note-pin {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--dn-pin-color);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  line-height: 22px;
  text-align: center;
  flex-shrink: 0;
  user-select: none;
}

.dn-note-text {
  flex: 1;
  font-size: 13px;
  line-height: 1.4;
  color: var(--dn-text-primary);
  min-height: 20px;
  outline: none;
  word-break: break-word;
}

.dn-note-text:empty::before {
  content: 'Add a note...';
  color: var(--dn-text-muted);
}

.dn-note-text:focus {
  outline: none;
}

.dn-note-delete {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  border-radius: var(--dn-radius-sm);
  background: transparent;
  color: var(--dn-text-primary);
  opacity: 0.3;
  cursor: pointer;
  flex-shrink: 0;
  transition: opacity var(--dn-transition-fast), background var(--dn-transition-fast);
}

.dn-note-delete:hover {
  opacity: 0.8;
  background: var(--dn-bg-secondary);
}

.dn-note-delete svg {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* --- Empty state --- */

.dn-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  padding: 48px 24px;
  gap: 12px;
}

.dn-empty-state svg {
  width: 32px;
  height: 32px;
  fill: none;
  stroke: var(--dn-border);
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.dn-empty-state__text {
  font-size: 13px;
  color: var(--dn-text-muted);
  text-align: center;
}
```

- [ ] **Step 2: Create sidebar.ts — container and resize handle**

Create `src/sidebar/sidebar.ts`:

```typescript
// ============================================================
// Domnotate — Sidebar Container
// ============================================================

import type { EventBus, AnnotationManager } from '@/types/core';
import { createNotesPanel } from '@/sidebar/notes-panel';
import './sidebar.css';

const DEFAULT_WIDTH = 360;
const MIN_WIDTH = 200;

export function createSidebar(
  container: HTMLElement,
  bus: EventBus,
  manager: AnnotationManager,
  picker: { activate(): void; deactivate(): void; isActive(): boolean },
): { show(): void; hide(): void; destroy(): void } {
  const unsubs: (() => void)[] = [];

  // --- Build DOM ---
  const el = document.createElement('div');
  el.className = 'dn-sidebar dn-sidebar--hidden';

  // Resize handle
  const resizeHandle = document.createElement('div');
  resizeHandle.className = 'dn-resize-handle';
  el.appendChild(resizeHandle);

  // Notes panel (action bar + list + empty state)
  const notesPanel = createNotesPanel(el, bus, manager, picker);

  container.appendChild(el);

  // --- Resize logic ---
  let isResizing = false;
  let startX = 0;
  let startWidth = DEFAULT_WIDTH;

  function onResizeMouseDown(e: MouseEvent): void {
    e.preventDefault();
    isResizing = true;
    startX = e.clientX;
    startWidth = el.offsetWidth;
    resizeHandle.classList.add('dn-resize-handle--active');
    document.addEventListener('mousemove', onResizeMouseMove);
    document.addEventListener('mouseup', onResizeMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  function onResizeMouseMove(e: MouseEvent): void {
    if (!isResizing) return;
    // Dragging left increases width, dragging right decreases
    const delta = startX - e.clientX;
    const maxWidth = window.innerWidth * 0.5;
    const newWidth = Math.max(MIN_WIDTH, Math.min(startWidth + delta, maxWidth));
    el.style.width = `${newWidth}px`;
  }

  function onResizeMouseUp(): void {
    isResizing = false;
    resizeHandle.classList.remove('dn-resize-handle--active');
    document.removeEventListener('mousemove', onResizeMouseMove);
    document.removeEventListener('mouseup', onResizeMouseUp);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }

  resizeHandle.addEventListener('mousedown', onResizeMouseDown);

  // --- Public API ---

  return {
    show(): void {
      el.classList.remove('dn-sidebar--hidden');
      el.style.width = `${DEFAULT_WIDTH}px`;
    },
    hide(): void {
      el.classList.add('dn-sidebar--hidden');
    },
    destroy(): void {
      for (const unsub of unsubs) unsub();
      notesPanel.destroy();
      resizeHandle.removeEventListener('mousedown', onResizeMouseDown);
      document.removeEventListener('mousemove', onResizeMouseMove);
      document.removeEventListener('mouseup', onResizeMouseUp);
      el.remove();
    },
  };
}
```

- [ ] **Step 3: Commit**

```bash
git add src/sidebar/sidebar.ts src/sidebar/sidebar.css
git commit -m "feat: add sidebar container with resize handle"
```

---

## Task 6: Notes panel — Action bar, notes list, empty state, inline editing

**Files:**
- Create: `src/sidebar/notes-panel.ts`

- [ ] **Step 1: Create notes-panel.ts**

Create `src/sidebar/notes-panel.ts`:

```typescript
// ============================================================
// Domnotate — Notes Panel (sidebar content)
// ============================================================

import type { EventBus, AnnotationManager, Annotation } from '@/types/core';

// --- SVG Icons (14px viewBox 24) ---
const ICONS = {
  pencil: `<svg viewBox="0 0 24 24"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>`,
  eye: `<svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`,
  eyeOff: `<svg viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`,
  clipboard: `<svg viewBox="0 0 24 24"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>`,
  download: `<svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
  trash: `<svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`,
  x: `<svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  check: `<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>`,
  chevronDown: `<svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>`,
} as const;

export function createNotesPanel(
  container: HTMLElement,
  bus: EventBus,
  manager: AnnotationManager,
  picker: { activate(): void; deactivate(): void; isActive(): boolean },
): { destroy(): void } {
  const unsubs: (() => void)[] = [];

  // --- State ---
  let selectedId: string | null = null;
  let sortNewestFirst = true;
  let pinsVisible = true;
  let copyTimer: ReturnType<typeof setTimeout> | null = null;

  // --- Action bar ---
  const actionBar = document.createElement('div');
  actionBar.className = 'dn-action-bar';

  const actionLeft = document.createElement('div');
  actionLeft.className = 'dn-action-bar__left';

  const sortToggle = document.createElement('button');
  sortToggle.className = 'dn-sort-toggle';
  sortToggle.innerHTML = `Newest first ${ICONS.chevronDown}`;
  sortToggle.addEventListener('click', () => {
    sortNewestFirst = !sortNewestFirst;
    sortToggle.innerHTML = `${sortNewestFirst ? 'Newest first' : 'Oldest first'} ${ICONS.chevronDown}`;
    renderNotesList();
  });
  actionLeft.appendChild(sortToggle);

  const actionRight = document.createElement('div');
  actionRight.className = 'dn-action-bar__right';

  // Annotate button (pencil)
  const annotateBtn = makeActionBtn(ICONS.pencil, 'Annotate an element', () => {
    if (picker.isActive()) {
      picker.deactivate();
      annotateBtn.classList.remove('dn-action-btn--active');
    } else {
      picker.activate();
      annotateBtn.classList.add('dn-action-btn--active');
    }
  });

  // Spacer after pencil
  const spacer = document.createElement('div');
  spacer.className = 'dn-action-spacer';

  // Pins toggle (eye)
  const pinsBtn = makeActionBtn(ICONS.eye, 'Toggle pin visibility', () => {
    pinsVisible = !pinsVisible;
    bus.emit({ type: 'pins:visibility', visible: pinsVisible });
    pinsBtn.innerHTML = pinsVisible ? ICONS.eye : ICONS.eyeOff;
  });

  // Copy button (clipboard)
  const copyBtn = makeActionBtn(ICONS.clipboard, 'Copy as Markdown', () => {
    bus.emit({ type: 'output:copy', format: 'markdown' });
    copyBtn.innerHTML = ICONS.check;
    copyBtn.classList.add('dn-action-btn--copied');
    if (copyTimer) clearTimeout(copyTimer);
    copyTimer = setTimeout(() => {
      copyBtn.innerHTML = ICONS.clipboard;
      copyBtn.classList.remove('dn-action-btn--copied');
      copyTimer = null;
    }, 1500);
  });

  // Export button (download)
  const exportBtn = makeActionBtn(ICONS.download, 'Export as JSON', () => {
    bus.emit({ type: 'output:download', format: 'json' });
  });

  // Clear button (trash)
  const clearBtn = makeActionBtn(ICONS.trash, 'Clear all annotations', () => {
    bus.emit({ type: 'session:cleared' });
  });

  actionRight.appendChild(annotateBtn);
  actionRight.appendChild(spacer);
  actionRight.appendChild(pinsBtn);
  actionRight.appendChild(copyBtn);
  actionRight.appendChild(exportBtn);
  actionRight.appendChild(clearBtn);

  actionBar.appendChild(actionLeft);
  actionBar.appendChild(actionRight);
  container.appendChild(actionBar);

  // --- Notes list / empty state container ---
  const notesListEl = document.createElement('div');
  notesListEl.className = 'dn-notes-list';
  container.appendChild(notesListEl);

  // --- Render functions ---

  function getAnnotations(): Annotation[] {
    const all = manager.getAll();
    if (sortNewestFirst) {
      return [...all].reverse();
    }
    return all;
  }

  function getAnnotationIndex(id: string): number {
    // Index is always based on creation order, not display order
    const all = manager.getAll();
    return all.findIndex((a) => a.id === id);
  }

  function renderNotesList(): void {
    const annotations = getAnnotations();
    notesListEl.innerHTML = '';

    if (annotations.length === 0) {
      renderEmptyState();
      updateActionBarState(true);
      return;
    }

    updateActionBarState(false);

    for (const annotation of annotations) {
      const index = getAnnotationIndex(annotation.id);
      notesListEl.appendChild(createNoteRow(annotation, index));
    }
  }

  function renderEmptyState(): void {
    const empty = document.createElement('div');
    empty.className = 'dn-empty-state';

    const icon = document.createElement('div');
    icon.innerHTML = `<svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>`;
    icon.style.color = 'var(--dn-border)';

    const text = document.createElement('div');
    text.className = 'dn-empty-state__text';
    text.textContent = 'Click the pencil to annotate an element';

    empty.appendChild(icon);
    empty.appendChild(text);
    notesListEl.appendChild(empty);
  }

  function updateActionBarState(isEmpty: boolean): void {
    // Sort toggle: hidden when empty
    sortToggle.style.display = isEmpty ? 'none' : '';

    // Annotate is always active; other buttons dimmed when empty
    const secondaryBtns = [pinsBtn, copyBtn, exportBtn, clearBtn];
    for (const btn of secondaryBtns) {
      if (isEmpty) {
        btn.classList.add('dn-action-btn--dimmed');
      } else {
        btn.classList.remove('dn-action-btn--dimmed');
      }
    }
  }

  function createNoteRow(annotation: Annotation, index: number): HTMLElement {
    const row = document.createElement('div');
    row.className = 'dn-note-row';
    row.dataset.annotationId = annotation.id;

    if (annotation.id === selectedId) {
      row.classList.add('dn-note-row--selected');
    }

    // Pin number
    const pin = document.createElement('div');
    pin.className = 'dn-note-pin';
    pin.textContent = String(index + 1);

    // Editable text
    const textEl = document.createElement('div');
    textEl.className = 'dn-note-text';
    textEl.contentEditable = 'true';
    textEl.textContent = annotation.text;
    textEl.spellcheck = false;

    // Commit text on blur or Enter
    textEl.addEventListener('blur', () => {
      const newText = textEl.textContent?.trim() ?? '';
      if (newText !== annotation.text) {
        manager.updateText(annotation.id, newText);
      }
    });

    textEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        textEl.blur();
      }
    });

    // Prevent row click when editing
    textEl.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    // Delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'dn-note-delete';
    deleteBtn.title = 'Delete annotation';
    deleteBtn.innerHTML = ICONS.x;
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      manager.delete(annotation.id);
      if (selectedId === annotation.id) {
        selectedId = null;
        bus.emit({ type: 'annotation:deselect' });
      }
    });

    // Row click → select annotation
    row.addEventListener('click', () => {
      selectedId = annotation.id;
      bus.emit({ type: 'annotation:select', id: annotation.id });
      renderNotesList();
    });

    row.appendChild(pin);
    row.appendChild(textEl);
    row.appendChild(deleteBtn);
    return row;
  }

  // --- Helper ---

  function makeActionBtn(
    icon: string,
    title: string,
    onClick: () => void,
  ): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.className = 'dn-action-btn';
    btn.title = title;
    btn.innerHTML = icon;
    btn.addEventListener('click', onClick);
    return btn;
  }

  // --- Event listeners ---

  // Re-render on data changes
  unsubs.push(bus.on('annotation:create', (e) => {
    // Auto-deactivate annotate button
    annotateBtn.classList.remove('dn-action-btn--active');
    // Select the new annotation
    selectedId = e.annotation.id;
    renderNotesList();
    // Scroll to bottom and focus the text input
    requestAnimationFrame(() => {
      const lastRow = notesListEl.querySelector(
        `[data-annotation-id="${e.annotation.id}"] .dn-note-text`,
      ) as HTMLElement | null;
      if (lastRow) {
        lastRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        lastRow.focus();
      }
    });
  }));

  unsubs.push(bus.on('annotation:update', () => {
    renderNotesList();
  }));

  unsubs.push(bus.on('annotation:delete', () => {
    renderNotesList();
  }));

  unsubs.push(bus.on('session:cleared', () => {
    selectedId = null;
    renderNotesList();
  }));

  unsubs.push(bus.on('session:loaded', () => {
    selectedId = null;
    renderNotesList();
  }));

  unsubs.push(bus.on('annotation:select', (e) => {
    selectedId = e.id;
    renderNotesList();
  }));

  unsubs.push(bus.on('annotation:deselect', () => {
    selectedId = null;
    renderNotesList();
  }));

  unsubs.push(bus.on('pins:visibility', (e) => {
    pinsVisible = e.visible;
    pinsBtn.innerHTML = pinsVisible ? ICONS.eye : ICONS.eyeOff;
  }));

  // Initial render (empty state)
  renderNotesList();

  // --- Public API ---

  return {
    destroy(): void {
      for (const unsub of unsubs) unsub();
      if (copyTimer) clearTimeout(copyTimer);
      actionBar.remove();
      notesListEl.remove();
    },
  };
}
```

- [ ] **Step 2: Verify build succeeds**

Run: `cd /Users/vkaegis/conductor/workspaces/domnotate/baton-rouge && npx vite build`
Expected: Build succeeds (notes-panel.ts is imported by sidebar.ts, which isn't wired into main.ts yet, but the import chain should resolve).

- [ ] **Step 3: Commit**

```bash
git add src/sidebar/notes-panel.ts
git commit -m "feat: add notes panel with action bar, note rows, inline editing, and empty state"
```

---

## Task 7: Wire sidebar into main.ts and add scroll-to-element on select

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Add sidebar import and wiring to main.ts**

Add the sidebar import near the top of `src/main.ts`, after the other imports:

```typescript
import { createSidebar } from '@/sidebar/sidebar';
```

Replace the `// DOM refs` section to include the sidebar container:

```typescript
// DOM refs
const dropZoneEl = document.getElementById('drop-zone')!;
const iframeEl = document.getElementById('content-frame') as HTMLIFrameElement;
const overlayEl = document.getElementById('overlay')!;
const sidebarEl = document.getElementById('sidebar')!;
```

After the `store` creation, add the sidebar creation:

```typescript
const sidebar = createSidebar(sidebarEl, bus, manager, picker);
```

In the `content:loaded` handler, add `sidebar.show()` after the pin renderer init:

```typescript
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
```

In the `content:unloaded` handler, add `sidebar.hide()`:

```typescript
bus.on('content:unloaded', () => {
  picker.deactivate();
  pinRenderer.destroy();
  sidebar.hide();
  loader.unload();
  manager.clearAll();
  currentSession = null;
});
```

- [ ] **Step 2: Add scroll-to-element on annotation:select**

Add a handler after the `picker:select` handler in `main.ts` that scrolls the iframe to the selected annotation's element:

```typescript
// ============================================================
// Annotation selected → scroll iframe to element, highlight it
// ============================================================

bus.on('annotation:select', (e) => {
  const annotation = manager.getById(e.id);
  if (!annotation) return;

  const iframeDoc = iframeEl.contentDocument;
  if (!iframeDoc) return;

  // Try to find the element using the CSS selector
  try {
    const el = iframeDoc.querySelector(annotation.element.cssSelector);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });

      // Add a temporary dashed highlight border
      const prev = (el as HTMLElement).style.outline;
      (el as HTMLElement).style.outline = '2px dashed var(--dn-accent, #C4725A)';
      setTimeout(() => {
        (el as HTMLElement).style.outline = prev;
      }, 2000);
    }
  } catch {
    // Selector may be invalid — ignore
  }
});
```

- [ ] **Step 3: Verify full build**

Run: `cd /Users/vkaegis/conductor/workspaces/domnotate/baton-rouge && npx vite build`
Expected: Build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/main.ts
git commit -m "feat: wire sidebar into main app, add scroll-to-element on annotation select"
```

---

## Task 8: Visual verification and polish

- [ ] **Step 1: Run the dev server**

Run: `cd /Users/vkaegis/conductor/workspaces/domnotate/baton-rouge && npx vite`

- [ ] **Step 2: Test the full flow manually**

Open the app in a browser. Verify:
1. Drop zone appears with warm parchment theme
2. Drop/browse an HTML file — iframe loads on the left, sidebar appears on the right
3. Click pencil icon — cursor changes to crosshair on iframe
4. Click an element — new note row appears in sidebar, text input is focused
5. Type a comment, press Enter — text is committed
6. Click the note row — iframe scrolls to the element, dashed highlight appears
7. Click X on a note row — annotation and pin are removed
8. Resize sidebar by dragging the left edge — respects min (200px) and max (50%)
9. Eye icon toggles pin visibility
10. Clipboard copies markdown
11. Download exports JSON
12. Trash clears all annotations
13. Empty state shows when no annotations exist

- [ ] **Step 3: Fix any layout issues found during testing**

Common issues to check:
- Drop zone card centered properly with new flex layout
- Sidebar doesn't overlap iframe content
- Overlay and pins positioned correctly with the new two-column layout

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: polish sidebar layout and visual issues"
```

---

## Task 9: Final cleanup

- [ ] **Step 1: Remove the old toolbar directory if not already removed**

```bash
rm -rf src/toolbar/
```

- [ ] **Step 2: Verify no dead imports remain**

Run: `cd /Users/vkaegis/conductor/workspaces/domnotate/baton-rouge && npx vite build`
Expected: Clean build with no errors or warnings about missing modules.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: remove dead toolbar directory and clean up"
```
