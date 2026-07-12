# Architecture & Module Overview

## High-Level Design

Domnotate is a single-page application (Vite + TypeScript, no frontend framework) with a **modular, event-driven architecture**. Modules are plain factory functions (`createX()`) that never import each other directly — they communicate through a typed event bus (`src/events.ts`) wired together in `src/main.ts`. This keeps every domain (loading, picking, annotating, editing, scope detection, output, sharing) independently testable: a module's tests construct a real `EventBus` and a real instance of the module under test, and assert on emitted events instead of mocking collaborators.

### Architecture Principles

1. **Modular:** each domain owns a directory with a clear boundary (`src/annotations/`, `src/editor/`, `src/output/`, `src/slides/`, `src/share/`, ...).
2. **Event-driven:** state changes emit typed events (`DomnotateEvent` union in `src/types/core.ts`); `main.ts` is the only place that wires cross-module reactions.
3. **Type-safe:** all shared types flow through `src/types/core.ts`. TypeScript 7.0 (native Go-based compiler, adopted in #46) with strict mode.
4. **Testable by convention:** real implementations are tested together; only true system boundaries (IndexedDB, `navigator.clipboard`, DOM APIs missing from happy-dom) are mocked. See [Testing](../testing.md).
5. **Browser-native, serverless backend:** vanilla DOM + IndexedDB (via Dexie) for all client persistence; Cloudflare Pages Functions only exist for the URL proxy and the share API — see [Sharing & Integrations](../integrations/sharing.md).

## Module Map

### Core Types & Events
- **`src/types/core.ts`** — Shared interfaces: `Annotation`, `TextEdit`, `AnnotationSession`, `ElementDescriptor`, `ViewScope`, event types
- **`src/events.ts`** — Typed event bus; singleton `EventBus` with `emit()` and `on()` methods

### Content & Loading
- **`src/loader/`**
  - `loader.ts` — Main `ContentLoader` module; reads file/URL into iframe, manages blob URLs
  - `drop-zone.ts` — File drop + paste event handling
  - Tests: `__tests__/loader.test.ts`

- **`src/picker/`** — Element selection and context generation
  - `picker.ts` — Main picker module; arm/disarm on keyboard, handle hover/select events
  - `selector-engine.ts` — CSS selector generation (most robust fallback to XPath), tag/class/id inference, DOM depth + path
  - `highlight.ts` — Visual outline overlay for hovered/selected elements

### Annotation Management
- **`src/annotations/`**
  - `annotation-manager.ts` — CRUD for annotations (`create`, `updateText`, `updateScope`, `delete`, `getAll`, `getById`, `loadAnnotations`, `clearAll`). Emits `annotation:*` events. New annotations get a fixed pin color (`#C4725A`) — there is no per-annotation color picker yet.
  - `pin-renderer.ts` — Renders pins and text overlays on the iframe content; filters visible pins by active view scope (see `view-scope.ts`); optimized for scroll performance (#38)
  - `view-scope.ts` — `isAnnotationVisibleInScope(s)`, `scopesMatch`, `fallbackScopeLabel`, `resolveViewScopeRoot`, `activateScopeForAnnotation` — the glue between `ViewScope` data and annotation/pin visibility
  - Tests: `__tests__/annotation-manager.test.ts`, `pin-renderer.test.ts`, `view-scope.test.ts`

### Text Editing
- **`src/editor/`** — In-place text editing (press `T` to toggle)
  - `edit-mode.ts` — `TextEditor` module; arm/disarm contentEditable, rich text control, caret placement, commit on Esc
  - `edit-manager.ts` — CRUD for edits; upserts by selector so re-edits don't duplicate; emits `edit:*` events
  - `edit-identity.ts` — Canonical selector for an edit target (deduplication key)
  - `session-edit-hydration.ts` — Apply/revert edits to the live DOM when session loads
  - Tests: `__tests__/edit-mode.test.ts`, `edit-manager.test.ts`, `session-edit-hydration.test.ts`

### Output & Export
- **`src/output/`**
  - `formatter.ts` — Format session as Markdown (human-readable with element details), JSON (full session), or compact (agent-friendly)
  - `json-io.ts` — Serialize/deserialize session to/from JSON; validation on load
  - `store.ts` — Session persistence to IndexedDB; autosave on annotation/edit changes
  - `reanchor.ts` — Reanchor annotation when content changes (strategy: CSS selector, then XPath fallback, then text preview search)
  - `annotation-preview.ts` — Snapshot annotation text preview from current DOM (for agent diff if element text changed post-annotation)
  - `exporter.ts` — Copy to clipboard, download file utilities
  - Tests: `__tests__/formatter.test.ts`, `json-io.test.ts`, `store.test.ts`, `reanchor.test.ts`, `annotation-preview.test.ts`

### View Scope Detection
- **`src/slides/`** — Auto-detect slides, tabs, routes, carousels, wizards, and panels so annotations/edits can be scoped to the view they were made in. This is the most involved subsystem in the app — see [View Scope Detection](./view-scope-detection.md) for the full detector hierarchy and activation strategies.

### Sharing
- **`src/share/`**
  - `share-client.ts` — HTTP client for `/api/share`, `/api/share/:id`; publish, fetch, update annotations
  - `shared-session.ts` — Serialization format for cloud storage (HTML + annotations + edits); 5 MB limit
  - `share-action.ts` — User-facing "Share" action; calls publish or copy based on mode
  - `hydration.ts` — Load a shared session from cloud, deserialize, hydrate local state
  - Tests: `__tests__/share-client.test.ts`, `share-action.test.ts`, `hydration.test.ts`, `shared-session.test.ts`

### UI Components
- **`src/sidebar/`**
  - `sidebar.ts` — Main sidebar; lists annotations, shows toolbar (Annotate, Edit Text, Copy, Download, Share, More)
  - `notes-panel.ts` — Renders individual annotation cards with edit/delete actions
  - CSS: `sidebar.css` (responsive, dark-mode aware)
  - Tests: `__tests__/notes-panel.test.ts`

- **`src/popover/`** — Floating note editor/viewer
  - `popover.ts` — Show/hide note on pin click; edit/delete in-place
  - Tests: `__tests__/popover.test.ts`

- **`src/tooltip/`** — Small info tooltips for toolbar actions
  - `tooltip.ts` — Show tooltip on hover; auto-hide disabled actions
  - CSS: `tooltip.css`
  - Tests: `__tests__/tooltip.test.ts`

- **`src/toast/`** — Transient notifications (e.g., "Copied to clipboard")
  - `toast.ts` — Create, auto-dismiss, stacking
  - CSS (in `sidebar.css`)
  - Tests: `__tests__/toast.test.ts`

### Diagnostics & Debugging
- **`src/diagnostics/`**
  - `diagnostics-panel.ts` — Optional debug panel; shows scope detection results + overrides
  - `scope-diagnostics.ts` — Generate diagnostic info; report pin visibility issues
  - `scope-override.ts` — Allow manual override of auto-detected scope

### Keyboard & Theme
- **`src/keyboard/shortcuts.ts`** — Global keyboard shortcuts (A=annotate, T=edit text, C=copy, D=download, S=share, Esc=deselect/exit)
- **`src/theme/theme-toggle.ts`** — Dark/light mode toggle stored in localStorage

### Main Integration
- **`src/main.ts`** — Wiring and orchestration; creates all modules, subscribes to key events, runs the state synchronization loop

## Data Flow (Load → Annotate/Edit → Export/Share)

```
content:loaded (from ContentLoader)
    ├─> ElementPicker (hover/select) ──> picker:select ──┐
    └─> SlideObserver (detect view scopes)                │
             └── scope for element ──────────────────────>│
                                                            v
                                            AnnotationManager.create()
                                                    │ annotation:create
                     ┌──────────────────────────────┼───────────────┐
                     v                              v               v
              PinRenderer (draw pin)        Sidebar (show note)  SessionStore (autosave)

TextEditor (T mode, click element) ──edit:commit──> EditManager.commit() ──edit:create/update──┐
                                                                                                  v
                                                                       Sidebar (diff card) + SessionStore (autosave)

output:copy / output:download ──captureSessionState()──> OutputFormatter ──> clipboard / file download
share:publish ──captureSessionState()──> publishOrCopyShare() ──POST /api/share──> R2 ──> share link
```

`main.ts` owns every arrow above — modules never subscribe to each other's events directly, only to the bus.

## Event Bus Patterns

The event bus is the nerve center. Key event families:

- **Content:** `content:loaded`, `content:unloaded`
- **Picker:** `picker:hover`, `picker:unhover`, `picker:select`, `picker:deselect`
- **Editing:** `edit:activate`, `edit:deactivate`, `edit:commit`, `edit:create`, `edit:update`, `edit:delete`
- **Annotations:** `annotation:create`, `annotation:update`, `annotation:delete`, `annotation:select`, `annotation:deselect`
- **Session:** `session:loaded`, `session:cleared`
- **UI:** `pins:visibility`
- **Output:** `output:copy`, `output:download`
- **Sharing:** `share:publish`

Events are fully typed in `src/types/core.ts`. Each event has a unique `type` and optional payload properties.

## Naming & Organization Conventions

- **Factory functions:** `create*` (e.g., `createAnnotationManager`, `createEventBus`)
- **Event handlers:** `on<Event>` (e.g., `onAnnotationCreate`)
- **Type interfaces:** `<Domain><Noun>` (e.g., `AnnotationManager`, `ElementDescriptor`)
- **Test files:** Colocated `__tests__/<module>.test.ts`
- **CSS:** Colocated `<module>.css` next to `.ts`; theme variables in `src/styles/theme.css`

## Browser APIs & Dependencies

- **DOM:** vanilla DOM manipulation, `HTMLIFrameElement` for sandboxing (loaded content is isolated in an iframe; `allow-scripts` is dropped for shared/remote loads — see [Sharing & Integrations](../integrations/sharing.md))
- **Storage:** IndexedDB via Dexie (`src/output/store.ts`) for all session persistence; only `dexie` is a runtime dependency
- **CSS:** custom properties for theming (`src/styles/theme.css`), colocated `.css` per module
- **TypeScript:** ES2022 target, strict mode, TS 7.0 native compiler
- **Build/test:** Vite (dev/build), Vitest + happy-dom (tests) — see [Testing](../testing.md)
- **Deployment:** Cloudflare Pages (static hosting) + Pages Functions (serverless) — see [Operations](../operations.md)

## Where To Look For More Detail

- **Step-by-step interaction flows** (load, annotate, edit, export, share, autosave): [Workflows](../workflows.md)
- **View scope detection internals** (the most complex subsystem — detector hierarchy, activation strategies, scope matching): [View Scope Detection](./view-scope-detection.md)
- **Cloudflare Pages Functions, R2 storage, share schema/validation, CORS proxy**: [Sharing & Integrations](../integrations/sharing.md)
- **Build, deploy, changelog process, CI**: [Operations](../operations.md)
- **File-by-file directory reference**: [Source Map](../source-map.md)
