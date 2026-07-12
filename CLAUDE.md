# Domnotate

Vanilla TypeScript annotation tool deployed on Cloudflare Pages.

## Commands

- `npm run dev` — dev server on port 8000
- `npm run build` — typecheck + production build
- `npm run test` — watch mode tests
- `npm run test:ci` — single-run tests (CI)
- `npm run test:coverage` — tests with coverage report

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

- `src/types/core.ts` — all shared types and interfaces
- `src/events.ts` — typed event bus
- `src/annotations/` — annotation CRUD manager
- `src/output/` — JSON serialization, formatters, reanchoring
- `src/picker/` — element selection and selector generation
- `src/sidebar/` — annotation sidebar UI
- `src/loader/` — content loading (file/URL)
- Path alias: `@/` maps to `src/`

<!-- OPENWIKI:START -->

## OpenWiki

This repository uses OpenWiki for recurring code documentation. Start with `openwiki/quickstart.md`, then follow its links to architecture, workflows, domain concepts, operations, integrations, testing guidance, and source maps.

The scheduled OpenWiki GitHub Actions workflow refreshes the repository wiki. Do not hand-edit generated OpenWiki pages unless explicitly asked; prefer updating source code/docs and letting OpenWiki regenerate.

<!-- OPENWIKI:END -->
