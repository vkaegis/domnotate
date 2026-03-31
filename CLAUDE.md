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

## Architecture

- `src/types/core.ts` — all shared types and interfaces
- `src/events.ts` — typed event bus
- `src/annotations/` — annotation CRUD manager
- `src/output/` — JSON serialization, formatters, reanchoring
- `src/picker/` — element selection and selector generation
- `src/sidebar/` — annotation sidebar UI
- `src/loader/` — content loading (file/URL)
- Path alias: `@/` maps to `src/`
