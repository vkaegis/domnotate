# Sharing & Integrations

Domnotate has exactly two external integration points: **Cloudflare Pages Functions** (serverless backend for sharing and a dev/prod CORS proxy) and the browser's own storage/clipboard APIs. There is no other backend, no auth provider, and no third-party analytics.

## Why Sharing Exists

Annotations are normally private, client-side data in IndexedDB. Sharing exists so a reviewer can hand a coding agent (or another human) a single link that carries both the captured page and the feedback, without either party needing an account. This repo intentionally trades away collaboration robustness for that simplicity — see [Sharing Limitations](#sharing-limitations-by-design).

Sharing uploads a captured copy of the page HTML together with its annotations and edits. Anyone with the link can retrieve and edit that content. Do not publish confidential HTML, embedded credentials, private customer data, or other sensitive information.

## Wire Format: `SharedSessionBlob`

Defined and validated in `src/share/shared-session.ts` (shared by the client and the Pages Functions — imported directly into `functions/api/share.ts` and `functions/api/share/[id].ts`):

```ts
interface SharedSessionBlob {
  schemaVersion: 1;
  id: string;
  sourceType: 'file' | 'url';
  sourceName: string;
  html: string;
  annotations: Annotation[];
  edits: TextEdit[];
  createdAt: string;
  updatedAt: string;
}
```

`MAX_SHARE_BYTES = 5 * 1024 * 1024` (5 MB). Every entry point re-validates independently — the client never trusts its own serialization, and the server never trusts the client's `Content-Length` header alone:
- `validatePublishShareRequest` — shape-checks a new share (only the allowed keys, correct types, size limit)
- `validateUpdateShareRequest` — shape-checks a `PUT` (annotations + optional edits)
- `validateSharedSessionBlob` — shape-checks what comes back out of R2 before trusting it (defends against corrupted/tampered storage)
- `isViewScope` (`src/types/validation.ts`) — used transitively to validate each annotation/edit's optional `viewScope`

## Cloudflare Pages Functions

Deployed alongside the static site (see [Operations](../operations.md) for build/deploy). Binding: `SHARES` R2 bucket, declared in `wrangler.jsonc`.

| Route | File | Method | Purpose |
|---|---|---|---|
| `/api/share` | `functions/api/share.ts` | POST | Create a new share: validates the body, generates a UUID, writes `share/<id>.json` to R2 |
| `/api/share/:id` | `functions/api/share/[id].ts` | GET | Fetch a share; re-validates the stored blob before returning it; `Cache-Control: no-store` |
| `/api/share/:id` | `functions/api/share/[id].ts` | PUT | Update `annotations`/`edits` on an existing share (used for republishing after edits, and by anyone who opens the link) |
| `/api/proxy?url=` | `functions/api/proxy.ts` | GET | Production backend endpoint that fetches an arbitrary `http(s)` URL server-side and returns it with `Access-Control-Allow-Origin: *`, so "load by URL" isn't blocked by CORS. `vite.config.ts` provides a development-only local equivalent for `npm run dev`. |

Share IDs are validated with `/^[A-Za-z0-9_-]{1,128}$/` (`getShareId()`) before ever touching R2, rejecting path-traversal-style ids.

## Client Side (`src/share/`)

- **`share-client.ts`** — `publishShare()`, `fetchShare()`, `republishSession()`; maps HTTP status codes to user-facing error strings (`mapPublishError`, `mapFetchError`, `mapUpdateError`).
- **`share-action.ts`** — `publishOrCopyShare()`: the single entry point `main.ts` calls. Publishes only if the session has no `shareId` yet; otherwise just re-copies the existing link. Throws if the clipboard write fails, since a share with no way to retrieve the link is a broken workflow.
- **`hydration.ts`** — `sessionFromSharedBlob()`: turns a fetched `SharedSessionBlob` back into a local `AnnotationSession` shape, used both when following a `/share/:id` link and when `SessionStore.load({ preferCloud: true })` refreshes a cached shared session.
- **`shared-session.ts`** — the schema/validation module described above; also exports `getUtf8ByteLength()` and `serializeSharedSessionBlob()` used identically on the client and in the Functions.

`SessionStore` (`src/output/store.ts`) decides *when* to go to the network: local-only sessions always write straight to IndexedDB; sessions with a `shareId` call `republishAnnotations()` (PUT) first and only fall back to a local-only cache if that throws, re-throwing the error so `main.ts` can surface "changes saved locally but could not sync."

## Sharing Limitations (By Design)

These are explicit product decisions, not bugs — don't try to "fix" them without checking with the maintainer first (see `CONTRIBUTING.md`):

- **No accounts or permissions.** Anyone with the link can view and edit.
- **Last-write-wins.** Concurrent editors can overwrite each other's recent changes; there is no operational-transform or locking layer.
- **Captured HTML is frozen at publish time.** It does not refresh from the live remote URL, and asset/behavior fidelity for remote pages is best-effort (see the `share:notice` warning emitted for `sourceType: 'url'` shares).
- **5 MB cap, ~30-day intended expiry** (R2 TTL is not currently enforced by application code beyond the size check — verify bucket lifecycle rules if you need to confirm actual expiry behavior).

## Change Points

- **New cloud backend** (e.g. swap R2 for S3): the abstraction boundary is `share-client.ts`'s fetch calls plus the two Functions files — the client-side schema/validation module (`shared-session.ts`) is backend-agnostic and can stay as-is.
- **Add auth/permissions:** would touch `functions/api/share*.ts` (need a way to check who can PUT) and `share-client.ts` (need to send credentials) — currently entirely unauthenticated by design.
- **Change size limits or expiry:** `MAX_SHARE_BYTES` in `shared-session.ts` (single source of truth, imported by both client and server) and the R2 bucket's lifecycle configuration for expiry.
- Tests: `src/share/__tests__/*.test.ts` (client + hydration + schema validation). The Pages Functions themselves are not unit-tested in this repo; verify Function changes with `npm run dev` + manual share flow, or `wrangler pages dev`.
