# Workflows

This page walks through the main user-facing interaction sequences and the internal event flow behind each one. All wiring lives in `src/main.ts`; each step below names the module and event responsible so you know where to make a change.

## 1. Load Content

**Trigger:** drag/drop a file, paste HTML, or enter a URL onto the drop zone (`src/loader/drop-zone.ts`).

1. `ContentLoader.loadHtmlText()` (`src/loader/loader.ts`) wraps the HTML in a `Blob`, creates a `blob:` URL, and assigns it to the iframe's `src`. Sandbox tokens are `allow-same-origin allow-scripts` normally, but scripts are dropped (`allow-same-origin` only) for shared/remote loads passed through `loadHtml(..., { allowScripts: false })`.
2. On iframe `load`, it emits `content:loaded` with the blob URL, `sourceType`, `sourceName`, and the raw `html` (kept for re-publishing shares later).
3. `main.ts`'s `content:loaded` handler creates a new `AnnotationSession` (or adopts a `pendingSharedSession` if the user followed a `/share/:id` link), then calls `picker.init()`, `editor.init()`, `slideObserver.init()`, `pinRenderer.init()`, `notePopover.init()`, and shows the sidebar.
4. `SlideObserver` immediately runs scope detection against the freshly loaded document — see [View Scope Detection](./architecture/view-scope-detection.md).

**Change points:** new input sources → `src/loader/drop-zone.ts` / `loader.ts`. Session bootstrapping → the `content:loaded` handler in `main.ts`.

## 2. Annotate (Pick → Note → Pin)

**Trigger:** press `A` or click "Annotate", then click an element in the loaded content.

1. The picker (`src/picker/picker.ts`) arms and listens for hover/click inside the iframe. On hover it generates an `ElementDescriptor` via `generateDescriptor()` (`src/picker/selector-engine.ts`): a CSS selector (preferring the most robust unique selector), an XPath fallback, tag/classes/id, an 80-char text preview, the bounding rect, DOM depth, and a human-readable `domPath`.
2. On click, `picker:select` fires with the descriptor and click coordinates. `main.ts` computes the anchor point (iframe-relative, scroll-adjusted) and resolves the active `viewScope` for the clicked element via `createScopedAnnotationOptions(slideObserver, el)`.
3. `manager.create(element, anchorPoint, '', scopeOptions)` (`src/annotations/annotation-manager.ts`) creates the `Annotation` with a fixed pin color and emits `annotation:create`. The picker deactivates (single-shot: one click, one annotation).
4. Side effects driven by `annotation:create`: `PinRenderer` draws the pin, the sidebar renders a new note card (the user types the note text directly into that card), and `persistAnnotationChange('immediate')` autosaves to IndexedDB.

**Change points:** selector robustness → `selector-engine.ts`. Scope resolution → `src/annotations/view-scope.ts`. Card layout/edit UI → `src/sidebar/notes-panel.ts`.

## 3. Edit Text In Place (`T` Mode)

**Trigger:** press `T` or click "Edit Text", then click a text element.

1. `TextEditor.activate()` (`src/editor/edit-mode.ts`) arms edit mode. Clicking an eligible element (anything except `SCRIPT`, `STYLE`, `IMG`, form controls, etc. — see `SKIP_TAGS`) toggles `contentEditable` on it, preserving inline HTML formatting.
2. Committing (Esc, or clicking elsewhere) captures `oldHtml`/`newHtml` and `oldText`/`newText`, resolves the view scope from the *actual edited node* (not a re-query of the selector, which could be ambiguous across scopes), and emits `edit:commit`.
3. `main.ts` calls `editManager.commit(...)`. `EditManager` (`src/editor/edit-manager.ts`) **upserts by target identity** — `editTargetKey(element, viewScope)` (`src/editor/edit-identity.ts`), a `(cssSelector, scopeDiscriminator)` pair — so re-editing the same element in the same scope updates one record instead of piling up duplicates, while the same selector in a different tab/slide is a distinct edit.
4. If the edit round-trips back to a no-op (new text equals old text), `commit()` returns `null` and the editor clears its "edited" marker instead of creating a record.
5. Edit mode is **sticky**: it stays armed until the user toggles it off or presses Escape with nothing open, so multiple elements can be edited in one pass.

**Important constraint:** edits are *never* written back into the loaded HTML. The contentEditable change is a live preview and the authoring gesture; the actual instruction (old → new) is what gets exported for an agent to apply to the real source file.

**Change points:** editable-element rules → `SKIP_TAGS` in `edit-mode.ts`. Dedup identity → `edit-identity.ts`. Export rendering of edits → `src/output/formatter.ts` (`editsToMarkdown`, and the compact/JSON paths).

## 4. Export & Copy/Download

**Trigger:** click Copy (Markdown/Compact/JSON) or Download (Markdown/JSON) in the sidebar toolbar.

1. `main.ts`'s `output:copy` / `output:download` handlers call `captureSessionState()` first, which refreshes every annotation's DOM text preview (`snapshotAnnotationPreviews`) and pulls the latest annotations/edits from the live managers into `currentSession` — the single choke point so autosave, copy, download, and share never see stale previews.
2. `OutputFormatter` (`src/output/formatter.ts`) renders:
   - **Markdown** — human-readable, grouped by element, includes scope labels and a dedicated "Text Edits" section (`editsToMarkdown`) that only lists edits with a real before/after difference (`isMeaningfulEdit`).
   - **JSON** — the full `AnnotationSession`, re-importable.
   - **Compact** — minimal payload tuned for agent context windows.
3. `copyToClipboard()` / `downloadFile()` (`src/output/exporter.ts`) complete the action; the sidebar shows a toast on success.

**Change points:** format layout → `formatter.ts`. New export target (e.g. YAML) → add a formatter method + a toolbar action in `src/sidebar/`.

## 5. Share a Session

**Trigger:** click "Share".

1. `publishOrCopyShare()` (`src/share/share-action.ts`): if the session already has a `shareId`, it just copies the existing `/share/:id` link. Otherwise it calls `publishShare()` (`src/share/share-client.ts`), which POSTs `{ sourceType, sourceName, html, annotations, edits }` to `/api/share`.
2. The Pages Function (`functions/api/share.ts`) validates size (5 MB cap, checked at both the `Content-Length` header and actual UTF-8 byte length), generates a UUID, and stores the blob in the `SHARES` R2 bucket as `share/<id>.json`.
3. The client stamps `session.shareId`, caches the session locally (`cacheOnly: true` — no republish), and copies the `origin/share/:id` URL to the clipboard.
4. **Loading a shared link:** `main.ts` detects the `/share/:id` route on boot (`getSharedRouteId()`), fetches the blob (`store.load(id, { preferCloud: true })` → `GET /api/share/:id`), and loads the HTML with scripts disabled before hydrating annotations/edits onto it.
5. **Editing a shared session:** once a session has a `shareId`, every save round-trips through `PUT /api/share/:id` (`functions/api/share/[id].ts`) instead of only caching locally — see `SessionStore.save()` in `src/output/store.ts`. This is last-write-wins; there is no conflict resolution.

See [Sharing & Integrations](./integrations/sharing.md) for the wire format, validation rules, and the CORS proxy.

## 6. Autosave

Autosave has different debounce windows depending on whether the session is shared, because shared sessions round-trip to the network on every save:

- **Local-only sessions** debounce 1s (`localAutoSave`).
- **Shared sessions, text-only changes** (`annotation:update`, `edit:update`) debounce 10s (`sharedTextAutoSave`) to avoid hammering the API while the user is still typing.
- **Shared sessions, structural changes** (`annotation:create/delete`, `edit:create/delete`) save immediately.

All paths funnel through `persistCurrentSession()` in `main.ts`, which calls `captureSessionState()` then `store.save()`. A save failure on a shared session surfaces as `share:error` with "Offline: changes saved locally but could not sync to the shared link" — the local IndexedDB copy is always written even if the network call fails.

## 7. Reanchoring (Content Changed Since Annotation)

If the loaded HTML changes after an annotation/edit was created (re-import, or a shared page whose remote content drifted), `reanchorAnnotation()` (`src/output/reanchor.ts`) tries, in order, within the resolved scope root:
1. CSS selector match
2. XPath match
3. Text-content match by tag name + the stored 80-char `textPreview`

If all three fail, the annotation's descriptor is left as-is and it simply won't render a pin — there's no user-facing warning today beyond what the diagnostics panel shows.

## Integration Points

Every stateful module follows the same shape: a `createX()` factory, an `init(bus, ...)` method, and CRUD methods that emit typed events instead of being called back directly. This is why tests construct a real `EventBus` + real module instances rather than mocking collaborators — see [Testing](./testing.md).
