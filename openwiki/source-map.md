# Source Map

Directory-by-directory reference. For *why* these modules exist and how they connect, see [Architecture Overview](./architecture/overview.md) and [Workflows](./workflows.md).

```
src/
├── types/core.ts            All shared interfaces: Annotation, TextEdit, ViewScope,
│                             ElementDescriptor, AnnotationSession, DomnotateEvent union,
│                             module interfaces (AnnotationManager, EditManager, SlideObserver, ...)
├── types/validation.ts      Type guards (isViewScope, etc.) used by shared-session validation
├── events.ts                createEventBus() — typed pub/sub, the only cross-module channel
├── main.ts                  All wiring: creates every module, subscribes to events, owns
│                             session lifecycle, autosave, and the /share/:id route
│
├── loader/                  File/URL loading into the sandboxed iframe
│   ├── loader.ts            ContentLoader: blob URL creation, sandbox tokens, content:loaded
│   └── drop-zone.ts         Drag/drop + paste capture
│
├── picker/                  Element selection & identity generation
│   ├── picker.ts             Hover/select controller (arm on 'A')
│   ├── selector-engine.ts    generateCssSelector/generateXPath/generateDescriptor
│   └── highlight.ts          Visual outline overlay
│
├── annotations/              Annotation CRUD, rendering, scope helpers
│   ├── annotation-manager.ts create/updateText/updateScope/delete/getAll/getById
│   ├── pin-renderer.ts       Draws pins, filters by active view scope
│   └── view-scope.ts         scopesMatch, isAnnotationVisibleInScope(s), fallbackScopeLabel,
│                              resolveViewScopeRoot, activateScopeForAnnotation
│
├── editor/                   In-place text editing ('T' mode) — never writes to source HTML
│   ├── edit-mode.ts           TextEditor: contentEditable arm/disarm, commit on Esc
│   ├── edit-manager.ts        Upserts by target identity (see edit-identity.ts)
│   ├── edit-identity.ts       editTargetKey(element, viewScope) — dedup key
│   └── session-edit-hydration.ts  Apply/revert edits to the live DOM on session load
│
├── slides/                    View scope detection (tabs, slides, routes, carousels, wizards)
│   ├── slide-observer.ts             Orchestrator: runs detectors, tracks active scope(s)
│   ├── explicit-scope-detector.ts    data-domnotate-scope attributes
│   ├── semantic-scope-detectors.ts   Aria tabs, slide classes, hash routes, carousels, wizards
│   ├── rendered-state-inference.ts   Fallback: watches active class/hidden/visibility
│   ├── activation-strategy.ts        How to activate a scope programmatically
│   ├── active-scope-tracker.ts       Diffs active scope(s) across detection passes
│   ├── view-scope-records.ts         Internal ScopeRecord shape + element depth helpers
│   └── view-scope-detection-types.ts Detector stage/priority/confidence types
│   (See architecture/view-scope-detection.md for the full detector hierarchy.)
│
├── output/                    Export, formatting, persistence, reanchoring
│   ├── formatter.ts            toMarkdown / toCompact / toJSON
│   ├── json-io.ts               serializeSession / deserializeSession / validateSession
│   ├── store.ts                  IndexedDB (Dexie) persistence; shared-session save/load
│   ├── reanchor.ts               CSS selector → XPath → text-preview fallback chain
│   ├── annotation-preview.ts     Refresh annotation text previews from live DOM
│   └── exporter.ts               copyToClipboard / downloadFile
│
├── share/                      Cloud sharing client + wire-format schema
│   ├── share-client.ts          publishShare / fetchShare / republishSession
│   ├── shared-session.ts        SharedSessionBlob schema, validation, size limits (shared
│   │                             with functions/api/*.ts — single source of truth)
│   ├── share-action.ts          publishOrCopyShare() — the entry point main.ts calls
│   └── hydration.ts             sessionFromSharedBlob()
│
├── sidebar/                    Annotation list UI + toolbar
│   ├── sidebar.ts                Toolbar (Annotate/Edit Text/Copy/Download/Share/More)
│   └── notes-panel.ts            Annotation/edit cards, inline text editing, overflow menu
│
├── popover/popover.ts          Floating note viewer/editor anchored to a pin
├── tooltip/tooltip.ts          Toolbar tooltips, including disabled-action explanations
├── toast/toast.ts               Transient notifications ("Copied to clipboard", errors)
├── keyboard/shortcuts.ts        Global shortcuts (A, T, C, D, S, Esc) with iframe forwarding
├── theme/theme-toggle.ts        Dark/light mode toggle
├── changelog/                   User-facing "What's new" feed
│   ├── changelog-data.ts         CHANGELOG array (see operations.md#changelog for the rules)
│   └── changelog.ts              Renderer
├── diagnostics/                 Debug-only scope diagnostics panel (enable with ?dn-debug)
│   ├── diagnostics-panel.ts
│   ├── scope-diagnostics.ts
│   └── scope-override.ts
├── styles/theme.css            Theme CSS custom properties
├── assets.d.ts, cloudflare-pages.d.ts   Type declarations for asset imports / CF Pages env
└── __tests__/                  Cross-module tests + shared fixtures
    ├── smoke.test.ts            Every public factory export sanity-checked here
    ├── fixtures.ts               makeAnnotation/makeDescriptor/makeTextEdit/makeSession
    ├── events.test.ts            Event bus unit tests
    └── bus-wiring.test.ts        Manager + bus integration

functions/api/                 Cloudflare Pages Functions (serverless backend)
├── share.ts                    POST /api/share — create
├── share/[id].ts                GET/PUT /api/share/:id — fetch/update
└── proxy.ts                     GET /api/proxy?url= — CORS-bypass fetch

public/                         Static assets (favicon, _redirects for SPA routing)
index.html                      Vite entrypoint, loads src/main.ts
package.json / tsconfig.json / vite.config.ts / wrangler.jsonc   Build & deploy config
```

## Finding Code By Task

| I want to... | Start here |
|---|---|
| Change how pins/annotations render | `src/annotations/pin-renderer.ts`, `src/sidebar/notes-panel.ts` |
| Add an export format | `src/output/formatter.ts` + a toolbar action in `src/sidebar/sidebar.ts` |
| Detect a new kind of tab/slide/carousel pattern | `src/slides/semantic-scope-detectors.ts` + `src/slides/activation-strategy.ts`; see [View Scope Detection](./architecture/view-scope-detection.md) |
| Improve element-selector robustness | `src/picker/selector-engine.ts`, `src/output/reanchor.ts` |
| Add a new event | `DomnotateEvent` union in `src/types/core.ts`, emit in the owning module, subscribe in `src/main.ts` |
| Persist a new session field | `AnnotationSession` in `src/types/core.ts`, `src/output/json-io.ts` (validation), `src/share/shared-session.ts` (if it should be shareable) |
| Change sharing/storage backend | `src/share/share-client.ts` + `functions/api/share*.ts` — see [Sharing & Integrations](./integrations/sharing.md) |
| Add a test | Colocate `__tests__/<module>.test.ts`; use `src/__tests__/fixtures.ts`; add a smoke-test import if it's a new public module — see [Testing](./testing.md) |
