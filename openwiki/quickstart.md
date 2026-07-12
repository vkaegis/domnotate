# Domnotate — Quickstart

Domnotate is a lightweight, client-first HTML annotation tool for giving structured feedback on web pages. It bridges humans and coding agents by capturing element-specific notes, in-place text edits, and export formats that agents can act on directly.

## What It Does, End to End

1. **Load** — drop a file or paste a URL. Content renders in a sandboxed `<iframe>`.
2. **Annotate** — click an element to pin a note with full DOM context (CSS selector, XPath, text preview).
3. **Edit in place** — press `T` to toggle rich-text edit mode; edits are captured as before/after instructions, never written back into the loaded HTML.
4. **Scope** — if the page has tabs, slides, routes, carousels, or wizard steps, annotations/edits automatically remember which view they were made in, so they don't collapse onto the wrong panel later.
5. **Export** — copy/download as Markdown (human-readable), JSON (round-trippable), or a compact format tuned for LLM agent context.
6. **Share** — publish the captured HTML, annotations, and edits to Cloudflare R2 and get a link anyone can view/edit (last-write-wins).

Annotations and local sessions live client-side in IndexedDB (via Dexie). Loading a URL sends the requested URL to the server-side loading proxy, and sharing uploads the captured HTML, annotations, and edits to the configured share backend. See [Sharing limitations](../README.md#sharing-limitations) for the intentional trade-offs (no auth, 5 MB cap, intended 30-day expiry, last-write-wins).

## Key Features

- **Element pinning:** click to select, pin a note with context
- **View scope detection:** automatically detects slides, tabs, routes, carousels, wizards, and custom panels; annotations and edits are scoped to the active view — see [View Scope Detection](./architecture/view-scope-detection.md)
- **In-place text editing:** press `T` or click "Edit Text" to edit element text as a rich preview; edits export as structured instructions
- **Multiple export formats:** Markdown with element details, JSON for persistence, compact format for agent instructions
- **Share with links:** publish annotated pages to Cloudflare R2; anyone with the link can view and edit
- **Keyboard shortcuts:** quick annotation, edit, and export operations
- **Dark mode:** theme toggle in the sidebar

## Running Locally

```bash
git clone https://github.com/vkaegis/domnotate.git
cd domnotate
npm install
npm run dev  # opens http://localhost:8000
```

## Build and Deploy

```bash
npm run build          # TypeScript check + Vite bundle → dist/
npm run deploy         # After configuring your own Pages project and R2 binding; see Operations
npm run test:ci        # Run all tests
npm run test:coverage  # Coverage report
```

## Repository Shape

Vanilla TypeScript SPA built with Vite, deployed as Cloudflare Pages with a couple of Pages Functions for URL proxying and share storage. No frontend framework — modules are plain factory functions (`createX()`) wired together in `src/main.ts` through a typed event bus.

```
src/            Application code (see the source map below)
functions/api/  Cloudflare Pages Functions (proxy, share create/get/update)
public/         Static assets, _redirects for SPA routing
index.html      Vite entrypoint
```

| Module | Purpose |
|--------|---------|
| **Core Types** | `src/types/core.ts` — all shared interfaces (Annotation, TextEdit, ViewScope, ElementDescriptor) |
| **Event Bus** | `src/events.ts` — typed, singleton event emitter for module communication |
| **Annotations** | `src/annotations/` — CRUD manager + view-scope matching logic |
| **Edits** | `src/editor/` — in-place text editing, edit manager, preview sync |
| **Element Selection** | `src/picker/` — CSS selector generation, XPath, element inspection |
| **Output & Export** | `src/output/` — formatters (Markdown/JSON/compact), session persistence, reanchoring |
| **View Scope Detection** | `src/slides/` — detectors for tabs, slides, routes, carousels; activation strategies |
| **Sharing** | `src/share/` — client-side publish/fetch, serialization for cloud storage |
| **UI Components** | `src/sidebar/`, `src/popover/`, `src/tooltip/`, `src/toast/` — DOM UI |
| **Content Loader** | `src/loader/` — file/URL loading, drop zone |
| **Diagnostics** | `src/diagnostics/` — debug-only scope detection panel (`?dn-debug`) |

See [Architecture Overview](./architecture/overview.md) for how these fit together, and [Source Map](./source-map.md) for a file-by-file reference.

## Where to Go Next

| Page | Covers |
|---|---|
| [Architecture Overview](./architecture/overview.md) | Module map, event bus, data model, session persistence, `main.ts` orchestration |
| [View Scope Detection](./architecture/view-scope-detection.md) | How Domnotate detects tabs/slides/routes/carousels and scopes annotations to them — the most complex subsystem in the app |
| [Workflows](./workflows.md) | Step-by-step flows: load, annotate, edit, export, share, autosave |
| [Sharing & Integrations](./integrations/sharing.md) | Cloudflare Pages Functions, R2 storage, CORS proxy, shared-session schema/validation |
| [Operations](./operations.md) | Dev/build/deploy commands, CI, the changelog process, the OpenWiki update workflow |
| [Testing](./testing.md) | Vitest + happy-dom setup, fixtures, project testing rules |
| [Source Map](./source-map.md) | Directory-by-directory reference for every `src/` module |

## Data Model

### Annotation
```ts
interface Annotation {
  id: string;
  element: ElementDescriptor;        // CSS selector, XPath, tag, classes, text preview, rect
  anchorPoint: { x, y };             // Pin position in iframe coordinates
  text: string;                       // The note
  color: string;                      // Pin color tag (currently a fixed default, '#C4725A')
  viewScope?: ViewScope;              // Scope (slide, tab, route, etc.) if applicable
  createdAt, updatedAt: ISO timestamp
}
```

### TextEdit
```ts
interface TextEdit {
  id: string;
  element: ElementDescriptor;        // Identified element
  oldHtml, newHtml: string;          // innerHTML before/after
  oldText, newText: string;          // textContent before/after
  viewScope?: ViewScope;              // Scope if in a tabpanel, slide, etc.
  createdAt, updatedAt: ISO timestamp
}
```

### AnnotationSession
```ts
interface AnnotationSession {
  id: string;
  shareId?: string;                   // Cloud share UUID if published
  sourceType: 'file' | 'url';
  sourceName: string;
  loadedUrl: string;                  // Blob URL or original
  html?: string;                      // Original HTML (for re-publish)
  annotations: Annotation[];
  edits?: TextEdit[];                 // In-place edits (ephemeral)
  createdAt, updatedAt: ISO timestamp
}
```

### ViewScope
```ts
interface ViewScope {
  kind: 'slide' | 'tabpanel' | 'hash-route' | 'carousel' | 'wizard-step' | 'active-panel' | 'custom';
  id: string;
  index: number;
  label?: string;
  selector: string;                   // CSS selector for the scope element
  activeSelector?: string;            // Selector for active indicator
  controllerSelector?: string;        // Button or radio that activates this scope
  activation?: 'click-controller' | 'radio-input' | 'set-hash' | 'call-goTo' | 'toggle-active' | 'set-hidden' | 'noop';
}
```

## Conventions To Know Before Changing Code

- **Every module needs a colocated test** in `__tests__/`, plus a smoke import in `src/__tests__/smoke.test.ts` for new public modules. Do not mock internal modules — only mock true system boundaries (IndexedDB, `navigator.clipboard`, DOM APIs missing from happy-dom). See [Testing](./testing.md).
- **User-visible PRs need a changelog entry** in `src/changelog/changelog-data.ts` — see [Operations → Changelog](./operations.md#changelog).
- **`@/` maps to `src/`** (see `tsconfig.json` / `vite.config.ts`); use it instead of relative imports.
- **Sharing has intentional trade-offs**: no accounts/permissions, last-write-wins concurrency, captured HTML doesn't auto-refresh, a 5 MB cap, and an intended 30-day expiry that depends on the operator's R2 lifecycle rule. See [Sharing & Integrations](./integrations/sharing.md).
- Domnotate is client-first, with Pages Functions for URL loading and sharing. There is no backend auth or identity layer. See [SECURITY.md](../SECURITY.md) for vulnerability reporting and [CONTRIBUTING.md](../CONTRIBUTING.md) for PR expectations.

## Status & License

Personal project, actively used by the author (@vkaegis), shared in case it's useful to others — use at your own risk, expect responses in days not hours. MIT licensed — see [LICENSE](../LICENSE).
