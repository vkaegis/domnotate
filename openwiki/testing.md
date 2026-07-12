# Testing

## Framework & Philosophy

**Vitest** + **happy-dom** (DOM environment). Tests are colocated in `__tests__/` directories next to the source they cover (e.g. `src/annotations/__tests__/annotation-manager.test.ts`).

The core rule, stated in `CLAUDE.md` and enforced by convention: **do not mock internal modules; test real implementations.** Only mock at true system boundaries:
- IndexedDB (Dexie runs against `fake-indexeddb` automatically in tests, no setup needed)
- DOM APIs happy-dom doesn't implement (layout metrics like `offsetWidth`, `requestAnimationFrame`, `matchMedia`)
- `navigator.clipboard`, `fetch` for HTTP calls in `share-client.ts` tests

Because every module is a `createX()` factory that takes a real `EventBus`, most tests wire up the real bus and real collaborating module, then assert on emitted events — this is what makes the event-driven architecture (see [Architecture Overview](./architecture/overview.md)) practical to test without a mocking framework doing most of the work.

## Commands

```bash
npm run test           # watch mode
npm run test:ci        # single run — this is what CI and pre-commit checks use
npm run test:coverage  # adds a coverage report (coverage/)
```

## Rules (from `CLAUDE.md`)

- **Every new module needs a corresponding test file.** No exceptions for "simple" modules.
- **Every bug fix needs a regression test** — one that fails against the old code and passes against the fix, committed in the same PR.
- **New public modules get a smoke-test entry** in `src/__tests__/smoke.test.ts`. This file exists purely to catch "module fails to export what it claims to export" — every `createX`/utility function the app relies on is imported and type-checked there. If you add a new public factory function, add it to this file's imports and assertions.
- **Run `npm run test:ci` before committing.** CI (`.github/workflows/ci.yml`) runs `npx tsc --noEmit`, `npm run test:ci`, and `npm run build` on every push/PR to `main`.

## Fixtures

`src/__tests__/fixtures.ts` provides counter-based factories so tests never collide on ids:

```ts
import { makeAnnotation, makeDescriptor, makeSession, makeTextEdit } from '@/__tests__/fixtures';

const ann = makeAnnotation({ text: 'Custom text' }); // color defaults to '#C4725A' unless overridden
```

Available factories (check the file for the full list as it grows): `makeDescriptor()`, `makeAnnotation()`, `makeTextEdit()`, `makeSession()`, and view-scope helpers for scoped-annotation tests.

## Test Types in This Repo

- **Smoke** (`src/__tests__/smoke.test.ts`) — every public factory/utility imports cleanly and is a function. Cheap, catches accidental breakage from refactors.
- **Unit** — one module's public API in isolation (e.g. `annotation-manager.test.ts` exercises create/updateText/updateScope/delete and their emitted events).
- **Integration** — multiple real modules wired together, e.g. `src/__tests__/bus-wiring.test.ts` (manager + bus + sidebar-facing state), `src/output/__tests__/store.test.ts` (session round-trip through Dexie/fake-indexeddb), `src/output/__tests__/formatter.test.ts` (real managers → real formatter output).

## happy-dom Gotchas

Available: `querySelector`/`querySelectorAll`, `addEventListener`, `textContent`/`innerHTML`, `classList`, `focus`/`blur`, `Blob`/`createObjectURL`.

Needs mocking or a workaround: `offsetWidth`/`offsetHeight` and other layout-dependent metrics, `requestAnimationFrame`, `matchMedia`, computed styles in most cases. `getBoundingClientRect()` works but returns zeros — tests that depend on real rects should not assert on their values.

## Before Submitting a PR

1. `npm run test:ci` — all tests pass.
2. If you added a public module, confirm it's imported in `smoke.test.ts`.
3. If you fixed a bug, confirm the regression test fails on the pre-fix code (temporarily revert your fix locally to check, if unsure).
4. `npm run build` — TypeScript check + Vite bundle must succeed (this is also what CI runs).
5. If the change is user-visible, add a changelog entry — see [Operations → Changelog](./operations.md#changelog).
