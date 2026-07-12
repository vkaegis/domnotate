# View Scope Detection

## Why This Exists

Domnotate needs to annotate pages that are not simple static documents: slide decks, tabbed settings pages, hash-routed SPAs, carousels, wizards. On these pages, the same CSS selector can legitimately match different, unrelated content depending on which panel is currently visible. Without scope tracking, an annotation pinned to `.card-title` on tab 1 would silently reappear (or, worse, look "correct" but be wrong) on tab 2.

`ViewScope` (see `src/types/core.ts`) is the answer: every annotation and text edit can carry an optional `viewScope` that records *which logical view was active* when it was created. This subsystem (`src/slides/`, plus the matching helpers in `src/annotations/view-scope.ts`) is responsible for detecting those logical views, tracking which one is currently active, and providing enough information to re-activate a view when the user later selects a scoped annotation.

This started as slide-only support (#13), was generalized to tab panels (#36), and then to the full detector hierarchy below (#39) — see git history on `src/slides/` for the progression.

## The Detector Hierarchy

`createSlideObserver()` (`src/slides/slide-observer.ts`) is the orchestrator. On `content:loaded` (and whenever the DOM mutates), it calls `runScopeDetection()` (`src/slides/view-scope-detectors.ts`), which runs detectors in priority order and stops at the first stage that finds scopes:

1. **Explicit** (`explicit-scope-detector.ts`) — looks for `data-domnotate-scope` attributes that a page author added on purpose. Always wins if present.
2. **Semantic** (`semantic-scope-detectors.ts`) — recognizes common accessible/structural patterns: ARIA `tablist`/`tabpanel`, slide-deck class names, hash-based routes (`#section`), carousel markup, wizard steps.
3. **Rendered-state inference** (`rendered-state-inference.ts`) — a last-resort fallback that watches for `.active` classes, `[hidden]`, or `visibility`/`display` changes to infer which panel is "on" when there's no semantic signal.

Each stage is `ScopeDetectorMeta`-tagged with an id, `stage`, `priority`, and `confidence` (`src/types/core.ts`); `getDetectionInfo()` exposes the winning source and the full detector plan for debugging — this is what the [diagnostics panel](#diagnostics) renders.

Detected scopes are normalized into `ScopeRecord[]` (`view-scope-records.ts`), each wrapping a `ViewScope` plus the live DOM element (`el`) it corresponds to.

## Tracking the Active Scope

`active-scope-tracker.ts` computes, from the current `ScopeRecord[]` and the iframe's location hash, which record(s) are active right now (`activeRecordIndexes`, `findActiveIndex`, `getActiveSignature`). The observer diffs this against the previous pass and emits `scope:changed` / `slide:changed` bus events when the active scope changes (e.g., the user clicks a tab inside the loaded content).

`getScopeForElement(el)` (part of the `ViewScopeObserver` interface) is how the rest of the app asks "what scope, if any, is the nearest ancestor scope of this element?" — this is called every time an annotation or edit is created (`createScopedAnnotationOptions` in `src/annotations/view-scope.ts`) so the new record inherits the right `viewScope`.

## Activating a Scope (Navigating Back To It)

Detecting a scope is only half the problem — when a user clicks an existing scoped annotation in the sidebar, Domnotate needs to *navigate the loaded content back to that scope* before scrolling to the element. `ViewScope.activation` records how: `'click-controller'`, `'radio-input'`, `'set-hash'`, `'call-goTo'`, `'toggle-active'`, `'set-hidden'`, or `'noop'`. `activateScopeRecord()` (`activation-strategy.ts`) knows how to perform each one (e.g., click the `controllerSelector` button, set `location.hash`, call a page's `window.goTo(index)` if present).

`activateScopeForAnnotation()` (`src/annotations/view-scope.ts`) is the entry point `main.ts` calls on `annotation:select` — it prefers `annotation.viewScope` and falls back to the legacy `slideIndex`-only path for older sessions.

## Scope Identity & Matching

Two scopes are "the same" if they have the same `id`, or (if either lacks an id) the same `(kind, selector)` pair — see `scopesMatch()` in `view-scope.ts`. This identity rule is reused in two other places that must agree with it:
- **Pin/annotation visibility** — `isAnnotationVisibleInScopes()` decides whether a pin renders given the currently active scopes.
- **Edit deduplication** — `editTargetKey()` (`src/editor/edit-identity.ts`) keys edits by `(cssSelector, scopeDiscriminator)` so editing the same selector in two different tabs produces two edit records, not one overwritten record.

## Diagnostics

`src/diagnostics/` is a debug-only panel enabled by adding `?dn-debug` to the URL (`isDiagnosticsEnabled()` in `diagnostics-panel.ts`). It surfaces:
- `scope-diagnostics.ts` — a snapshot of detected scopes, the active scope, and *why* each pin is or isn't visible (`describePinVisibility`)
- `scope-override.ts` — lets a developer manually force an annotation onto the currently active panel (`scopeAnnotationToCurrentPanel`) when detection gets it wrong

Reach for this panel first when scoped annotations "disappear" on a page — it's the fastest way to see which detector fired and what the active scope actually is.

## Change Points

- **New scope pattern to detect** (e.g., a new UI library's carousel markup): add a detector function in `semantic-scope-detectors.ts`, register it in the detector plan (`view-scope-detectors.ts`), and add an activation strategy in `activation-strategy.ts` if it needs a new `activation` kind.
- **A page's scopes aren't detected**: check `getDetectionInfo()` output via the diagnostics panel first; confirm whether the page has ARIA roles, active classes, or a hash scheme the semantic detectors already look for.
- **Annotations "leak" across tabs/slides**: check `isAnnotationVisibleInScopes()` and `scopesMatch()` — this is almost always an identity mismatch, not a detection failure.
- Tests: `src/slides/__tests__/*.test.ts` (detector unit tests use happy-dom-constructed markup), `src/annotations/__tests__/view-scope.test.ts` (matching/visibility logic).
