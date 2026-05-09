# Share MVP — Spec

## Summary

Add a "Share" action that publishes the current annotation session to a single
JSON blob in Cloudflare R2 and returns a public URL. Once published, the
session becomes cloud-backed: all edits — whether the original annotator at
`/` or anyone visiting `/share/:id` — flow through the cloud blob. No
accounts, no auth, no identity. Last-write-wins. 30-day TTL.

The mental model: **publishing a session moves it into the cloud.** The local
copy is replaced with a cloud-backed version that reads/writes through the
share blob. Anyone with the link is a peer — they see the same session and
can edit it. The link itself is the only credential.

## Scope

**In scope (MVP):**

- Click "Share" → publish current `AnnotationSession` (HTML + annotations) to R2, copy `/share/:id` URL to clipboard
- Open `/share/:id` → app loads with that session hydrated from R2
- Edits in a shared session push back to R2 (debounced, see below)
- 30-day TTL via R2 lifecycle rules
- 5 MB hard cap on artifact HTML
- Both file-uploaded and URL-loaded artifacts can be shared

**Out of scope (deferred):**

- User accounts, identity, names, avatars
- Owner vs. guest roles, reply threading
- Revocation UI / "my shares" management
- Conflict resolution beyond last-write-wins
- Read-only viewer mode
- Inlining external assets (CSS, images, fonts referenced by URL inside the artifact)

## User flow

### Sharing
1. User has an annotated session loaded in the app.
2. User clicks **Share** in the toolbar.
3. App POSTs `{ sourceType, sourceName, html, annotations }` to `/api/share`.
4. Server stores blob in R2 keyed by random ID, returns `{ id }`.
5. App stamps the local session with `shareId = id` and flips it to cloud-backed mode (see "Cloud-backed sessions" below).
6. App copies `https://domnotate.example.com/share/<id>` to clipboard, shows toast.

### Viewing / collaborating
1. Recipient opens `/share/:id`.
2. App detects the route, GETs `/api/share/:id`, materializes a cloud-backed session.
3. App renders normally: iframe with HTML, sidebar with annotations, full picker UI active.
4. Any edit (annotation create/update/delete), from anyone, PUTs to `/api/share/:id`.
5. Existing copy/export/download actions work unchanged.

### Cloud-backed sessions
A session with a non-null `shareId` behaves differently from a local-only one:
- **Reads:** primary source is the cloud blob via GET; IndexedDB acts as a warm cache for offline reads only.
- **Writes:** every annotation create/update/delete is PUT to the cloud (with the 10s text debounce). IndexedDB is updated alongside, but cloud is canonical.
- **Conflict resolution:** none — last-write-wins. We do not pull-then-merge before writing in v1.
- **Offline behavior:** writes fail with a toast ("can't reach share — try again"). No retry queue in v1.

### Re-publish triggers
- `annotation:create`, `annotation:delete` → immediate PUT
- `annotation:update` (text edits) → 10s debounce after typing stops
- No other triggers; no periodic sync; no polling

## Data model

A shared session is stored as a single JSON object in R2:

```ts
interface SharedSessionBlob {
  schemaVersion: 1;
  id: string;                    // matches the R2 key
  sourceType: 'file' | 'url';
  sourceName: string;
  html: string;                  // raw HTML bytes captured at share time
  annotations: Annotation[];     // existing Annotation[] type, unchanged
  createdAt: string;             // ISO timestamp
  updatedAt: string;             // ISO timestamp, refreshed on each PUT
}
```

This is essentially `AnnotationSession` minus `loadedUrl` (which is recreated
client-side via `URL.createObjectURL` on hydrate) plus an `html` field carrying
the artifact bytes.

## API surface

Three new Cloudflare Pages Functions under `functions/api/share/`:

### `POST /api/share`
- Body: `{ sourceType, sourceName, html, annotations }`
- Validates: `Content-Length < 5 MB`, body shape, `sourceType` enum
- Generates random ID (`crypto.randomUUID()` → first 12 chars, base62)
- Writes `SharedSessionBlob` JSON to R2 key `share/<id>.json`
- Returns `{ id }`

### `GET /api/share/:id`
- Reads R2 key `share/<id>.json`
- 404 if missing
- Returns blob JSON with `Cache-Control: no-store`

### `PUT /api/share/:id`
- Body: `{ annotations }` — **HTML is immutable after first share.** To change the artifact, create a new share.
- Validates payload size and shape
- Reads existing blob, merges updated `annotations` + `updatedAt`, writes back
- Returns `{ ok: true }`

All endpoints: standard CORS, no auth, no Turnstile.

## Storage

- **R2 bucket** `domnotate-shares`, single key per share (`share/<id>.json`)
- **Lifecycle rule:** delete objects older than 30 days. R2 lifecycle uses object age; overwriting a key creates a new object, which restarts the clock — so actively-edited shares never expire while in use.
- **Wrangler binding:** add `[[r2_buckets]]` entry to `wrangler.jsonc` referencing the bucket as `SHARES`.

## Client changes

### Type changes
- Add `shareId?: string` to `AnnotationSession` in `src/types/core.ts`. Presence of this field is the marker that a session is cloud-backed.

### New module `src/share/share-client.ts`
- `publishShare(session): Promise<string>` — POST and return ID
- `fetchShare(id): Promise<SharedSessionBlob>` — GET + parse
- `republishAnnotations(id, annotations): Promise<void>` — PUT (annotations only; HTML is immutable)

### Store layer (`src/output/store.ts`)
The existing `SessionStore` interface keeps its shape, but the implementation becomes share-aware:
- `save(session)` — if `session.shareId` is set, PUT to cloud and write IndexedDB cache; otherwise, IndexedDB only.
- `load(id)` — for local sessions, IndexedDB. For cloud-backed sessions (looked up by `shareId`), GET the cloud blob; on network failure, fall back to IndexedDB cache and surface a toast.
- New helper `attachShare(session, shareId): Promise<AnnotationSession>` — used by the Share button after a successful POST to flip a local session into cloud-backed mode.

### Routing in `src/main.ts`
Detect `/share/:id` early in startup:
- Skip the drop-zone UI
- Call `fetchShare(id)`, build an in-memory `AnnotationSession` with `shareId = id`, write it to IndexedDB cache, hydrate the iframe (Blob URL from `html`) and sidebar (`loadAnnotations`)
- Subsequent edits flow through the share-aware `SessionStore.save()`, which PUTs to cloud

### Toolbar
- Add a "Share" button that calls `publishShare(currentSession)` and `attachShare(currentSession, id)`, then writes `${origin}/share/${id}` to the clipboard and toasts "Link copied."
- Once a session has `shareId`, the Share button shows a copy-link icon instead (clicking copies the existing URL again).

### Re-publish wrapping
- Subscribe to `annotation:create`, `annotation:update`, `annotation:delete` events.
- For create/delete: PUT immediately.
- For update (text edits): debounce 10s after the last typing event before PUT.
- All PUTs go through the share-aware `SessionStore.save()` so IndexedDB cache stays in sync.

## Cost safeguards

The free-tier reasoning we covered:

- **No paid Workers plan required.** Stay on the Workers/Pages free plan for the MVP and set the Pages project to fail closed when Functions allowance is exhausted.
- **R2 is usage-based with a free tier.** Use Standard storage, keep shares under the app cap, and rely on lifecycle cleanup to bound storage growth.
- **5 MB body cap** in the share endpoints; reject earlier with a 413.
- **R2 lifecycle rule** auto-deletes anything older than 30 days; bounds storage growth.
- **Cloudflare Rate Limiting rule** on `/api/share*`: recommended target is 30 requests/min/IP, or 5 requests/10s/IP if the account plan only exposes 10-second free-plan counting.
- **Billing alert** at $1 as a tripwire even though we expect $0.

Exact Cloudflare account settings are documented in `docs/share-deployment-safeguards.md`.

## Known limitations (document in README)

1. **Anyone with the link can edit or wipe a share.** Trust model = link is the secret. If the URL leaks, generate a new share.
2. **Concurrent edits clobber.** Last-write-wins. Two people editing simultaneously will lose one set of writes.
3. **Dynamic content may render differently** for the recipient than for the original annotator (slide decks, animations, scripts that fetch data). Pin selectors may resolve to different DOM state.
4. **URL-loaded artifacts may have stale or missing external assets** (CSS, images) on the recipient's view. Show a small notice: "External assets may be missing — this artifact loaded resources from a remote site."
5. **Once shared, a session is cloud-bound.** There is no "unshare" or "fork back to local" in v1. Local edits to a shared session always hit the network.
6. **Offline writes fail.** No retry queue in v1; user gets a toast and must retry when online.

## Deferred decisions

**Share button placement and visual treatment.** Defer to design — likely a small icon button next to the existing copy/export controls in the toolbar.

## Implementation phases

Suggested wave order, each phase shippable on its own:

1. **R2 plumbing + POST.** Wrangler binding for `SHARES` bucket, `POST /api/share` function, `share-client.publishShare`, basic Share toolbar button that copies a URL. Viewer route doesn't exist yet. Verify R2 reads/writes work end-to-end. (~half day)
2. **GET + viewer route.** `GET /api/share/:id` function, route detection in `main.ts`, hydration of session from cloud blob into iframe + sidebar. End-to-end one-way share works (recipient sees but can't edit yet). (~half day)
3. **Share-aware SessionStore + PUT.** Add `shareId` field to `AnnotationSession`, make `SessionStore.save/load` route through cloud for cloud-backed sessions, `PUT /api/share/:id`, debounced re-publish wrapper around annotation events. Now bidirectionally collaborative. (~1 day — most of the new logic lives here)
4. **Lifecycle, caps, rate limit.** R2 lifecycle rule (30-day delete), 5 MB cap enforcement on POST/PUT, Cloudflare rate-limit rule, billing alert. (~half day)
5. **UX polish.** "Shared!" toast on copy, "External assets may be missing" notice for URL-shared sessions, offline-write toast, README docs of limitations. (~half day)

Total estimate: ~3 dev-days for a working MVP.

## Tests to add

Following the project's testing rules (every new module has tests, regressions covered):

- `src/share/__tests__/share-client.test.ts` — publish/fetch/republish, error paths, oversized body rejection
- `src/output/__tests__/store.test.ts` — extend with cloud-backed `save`/`load` paths (mock fetch); cache fallback when network fails
- `functions/api/share/__tests__/` — endpoint tests if there's an existing pattern, otherwise smoke tests
- `src/__tests__/smoke.test.ts` — add `import '@/share/share-client'`
- Regression test: hydrating a `SharedSessionBlob` produces the same `AnnotationSession` shape that JSON round-trips through `json-io.ts`
- Regression test: a session with `shareId` set is treated as cloud-backed by `SessionStore`
