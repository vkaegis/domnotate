# Domnotate

Vanilla TypeScript annotation tool. It ships as a web app on Cloudflare Pages and as a Chrome extension. The two share a core; see Architecture.

## Commands

- `npm run dev` — dev server on port 8000
- `npm run build` — typecheck + production build
- `npm run test` — watch mode tests
- `npm run test:ci` — single-run tests (CI)
- `npm run test:coverage` — tests with coverage report

Extension:

- `npm run build:extension` — build the extension into `dist-extension/`
- `npm run check:extension` — verify the built package is installable
- `npm run zip:extension` — build, check, then write `domnotate-extension.zip`
- `npm run icons:extension` — rasterise the icon SVGs. Needs `rsvg-convert`. The PNGs are committed on purpose, so neither CI nor a contributor has to install it.

## Comments

Comment only what the code cannot say. Default to none.

### Rules

- Do not narrate the change — "was 1.05, now 1", "this used to be a white card". Git blame owns history, and a comment that goes stale on the next commit is a bug.
- Do not record your own process: a wrong turn, a measurement you ran, a bug you fixed while writing the line.
- Do not argue with a future reader. "Do not change this" enforces nothing; a test does.
- Do not restate the code, and do not write JSDoc that only renames the parameters.
- Do write the invisible constraint: what an innocent-looking edit would break, or where a magic number came from. One or two lines.
- Prefer a named constant, a clearer name, or a test over a comment.
- In tests the name carries the *what*; a comment adds only *why it matters*, in one line.
- Existing over-commented code is not a licence to add more.
- `docs/` is prose for a person and is exempt.

## Testing

- **Framework:** Vitest with happy-dom for DOM APIs
- **Test location:** colocated `__tests__/` directories next to source
- **Fixtures:** `src/__tests__/fixtures.ts` — use `makeAnnotation()`, `makeDescriptor()`, `makeSession()` factories

### Rules

- Every new module must have a corresponding test file
- Every bug fix must include a regression test
- Add smoke imports in `src/__tests__/smoke.test.ts` when creating new public modules
- Run `npm run test:ci` before committing — all tests must pass
- Do not mock internal modules; test real implementations. Only mock at system boundaries (e.g., IndexedDB, DOM APIs not available in happy-dom)

## Changelog

The changelog is shown to users via the "What's new" link on the landing page. Entries live in `src/changelog/changelog-data.ts` (`CHANGELOG`, newest first) and are rendered by `src/changelog/changelog.ts`.

### Rules

- When you raise a PR that changes something a user can see or do, add a `CHANGELOG` entry in the same PR. Insert it at the top of the array (newest first).
- One entry per PR. Set `pr` to the PR number so the entry links back to it, and `date` to the merge date (e.g. `"22 May 2026"`).
- Skip entries for bug-fix, chore, and infrastructure PRs. Every entry must be a capability a user gets.
- Write for the user, not the codebase. The `title` names the capability ("Load a page by its URL"), and the `body` describes what you can now do in plain, declarative prose. No internal module names, refactors, or implementation detail.
- No em dashes — a test in `src/changelog/__tests__/changelog.test.ts` enforces this. Use periods or commas.

## Architecture

Three tiers. There are two entry points: `src/main.ts` is the web app, and `src/extension/content-isolated.ts` plus `content-main.ts` are the extension. The tiers below are what those two graphs actually reach, not what they were meant to reach.

Path alias: `@/` maps to `src/`.

### Shared — both entry points reach these

- `src/types/core.ts` — all shared types and interfaces
- `src/events.ts` — typed event bus
- `src/core/content-host.ts` — the annotated-document abstraction. The iframe and the live page both satisfy it.
- `src/core/source-hint/` — the element-to-search-brief pipeline. The web app reaches it through `output/formatter` and `picker/`.
- `src/core/class-hash.ts` — reached through source-hint
- `src/annotations/annotation-manager.ts` — annotation CRUD
- `src/annotations/pin-element.ts` — the pin DOM node both pin layers build
- `src/picker/` — element selection and selector generation
- `src/output/formatter.ts`, `exporter.ts`, `reanchor.ts`
- `src/keyboard/shortcuts.ts` — `src/extension/shortcuts.ts` wraps it
- `src/sidebar/copy-animation.ts`
- `src/styles/theme.css` and `src/sidebar/sidebar.css` — the extension inlines both with `?inline`

### Web app only

`src/loader/` (file and URL intake), `src/share/`, `src/editor/`, `src/changelog/`, `src/slides/`, `src/diagnostics/`, `src/popover/`, `src/toast/`, `src/tooltip/`, `src/theme/`, `src/main.ts`, `functions/`.

Also web-only, and easy to get wrong because the folder is shared:

- `src/sidebar/sidebar.ts` and `src/sidebar/notes-panel.ts`. The extension reuses the *stylesheet* but builds its own sidebar DOM inside `content-isolated.ts`.
- `src/annotations/pin-renderer.ts` and `view-scope.ts`. The extension has `src/extension/pins.ts` instead.
- `src/output/store.ts`, `json-io.ts`, `annotation-preview.ts`. These are the IndexedDB and session-file path, which the extension does not have.

### Extension only

All of `src/extension/`. The two-world split is not derivable from the file names:

- `background.ts` — MV3 service worker. It injects both content scripts on the toolbar click. Nothing runs before that click.
- `content-isolated.ts` — ISOLATED world. It owns the sidebar UI, the picker, and the clipboard.
- `content-main.ts` — MAIN world. This is the only place that can read page framework internals, so it owns the source-hint probe.
- `hint-protocol.ts` — the message bridge between those two worlds. Both sides import it, which is what keeps the message shapes honest.
- `pins.ts`, `shortcuts.ts`, `manifest.json`, `icons/`.

### Rules

- `src/extension/**` must not import a web-only module. `src/extension/__tests__/boundaries.test.ts` enforces this. If you need something from one, move that part into the shared tier first.
- The web app must not import from `src/extension/**`. The same test enforces this. `src/__tests__/smoke.test.ts` is the one exemption.
- New shared code goes in `src/core/`. Do not add it to a web-only folder and then import it from the extension.

## Release

- **Web app** — Cloudflare Pages, on merge to main.
- **Extension zip** — GitHub release, on an `ext-v*` tag. `tools/check-extension-version.mjs` fails the release if the tag and `src/extension/manifest.json` disagree.
- **Chrome Web Store** — manual upload of that zip to the [published listing](https://chromewebstore.google.com/detail/domnotate/hgllflmkglkhaamjkgmmjhgelhokdkma) (item `hgllflmkglkhaamjkgmmjhgelhokdkma`). The listing copy lives in `docs/chrome-web-store-listing.md`. It must change in the same PR as the thing it describes.

The `package.json` version and the manifest version are independent. Only the manifest one is checked.
