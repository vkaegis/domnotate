# Operations

## Local Development

```bash
git clone https://github.com/vkaegis/domnotate.git
cd domnotate
npm install
npm run dev   # http://localhost:8000, HMR via Vite
```

`vite.config.ts` also runs a dev-only middleware at `/api/proxy` that mirrors the production Cloudflare Pages Function (`functions/api/proxy.ts`), so "load by URL" works identically in dev without deploying.

## Build

```bash
npm run build   # tsc (typecheck, no emit) && vite build → dist/
npm run preview # serve the dist/ bundle locally for a final check
```

`dist/` is a fully static site — local-file annotation works on any static host. Loading arbitrary URLs and creating shared links require the Cloudflare Pages Functions in `functions/api/` (see [Sharing & Integrations](./integrations/sharing.md)).

## Deploy

```bash
npm run deploy   # wrangler pages deploy dist, after configuring your own project
```

**Deploy is a manual, developer-run command** — there is currently no CI workflow that deploys on merge. The checked-in `wrangler.jsonc` describes the maintainer's deployment, including the Pages project, build output directory, and `SHARES` R2 binding. Do not reuse its resource names for a separate deployment.

For a separate deployment:

1. Create your own Pages project and R2 bucket.
2. Configure the Pages project as `YOUR_PROJECT_NAME` and the bucket as `YOUR_BUCKET_NAME`. Keep personal resource names in dashboard configuration or an ignored local Wrangler configuration when you do not intend to publish them.
3. Bind the bucket to the Pages Functions with the variable name `SHARES`. Cloudflare supports configuring this [R2 binding through Wrangler or the Pages dashboard](https://developers.cloudflare.com/pages/functions/bindings/); sharing fails at runtime if the binding is absent.
4. Authenticate Wrangler interactively or with a [narrowly scoped Cloudflare API token](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/). Do not use the Global API Key. Store deployment tokens in your CI secret store or an untracked local environment file, never in repository configuration.
5. Configure the [bucket lifecycle rule](https://developers.cloudflare.com/r2/buckets/object-lifecycles/) if shares should expire. The intended 30-day retention is not created or enforced by application code.
6. Configure rate limiting and billing notifications in the Cloudflare account according to your expected traffic. These are operator controls, not repository-enforced safeguards; [billing notifications do not cap spending](https://developers.cloudflare.com/billing/manage/budget-alerts/).

Use placeholders in any committed examples:

```jsonc
{
  "name": "YOUR_PROJECT_NAME",
  "pages_build_output_dir": "./dist",
  "r2_buckets": [
    {
      "binding": "SHARES",
      "bucket_name": "YOUR_BUCKET_NAME"
    }
  ]
}
```

Use `npm run deploy`, which runs `wrangler pages deploy dist`. Do not use `wrangler deploy`; that command targets Workers rather than Pages.

## Continuous Integration

`.github/workflows/ci.yml` runs on every push/PR to `main`: `npm ci` → `npx tsc --noEmit` → `npm run test:ci` → `npm run build`. All four must pass before merge; there is no separate lint step today.

## OpenWiki Update Workflow

`.github/workflows/openwiki-update.yml` runs on a daily schedule (and via `workflow_dispatch`). It installs `openwiki` globally and runs `openwiki code --update --print` against this repo, then opens a PR (`openwiki/update` branch) with any changes to `openwiki/`, `AGENTS.md`, and `CLAUDE.md`. **Do not hand-edit generated OpenWiki pages** — update source code/docs instead and let the next scheduled run regenerate this wiki, per the note in `CLAUDE.md`.

## Changelog

User-visible features are announced via a "What's new" link on the landing page, driven by `src/changelog/changelog-data.ts` (`CHANGELOG` array, newest first) and rendered by `src/changelog/changelog.ts`.

**Rules** (from `CLAUDE.md`, also enforced by a lint-style test — no em dashes allowed, per `src/changelog/__tests__/changelog.test.ts`):
- Add exactly one entry per PR that changes something a user can see or do, inserted at the top of the array.
- `pr`: the PR number (links back to GitHub via `prUrl()`); `date`: the merge date, e.g. `"22 May 2026"`.
- Skip entries for bug-fix, chore, and infrastructure PRs — only capability changes get an entry.
- Write for the user: `title` names the capability ("Load a page by its URL"), `body` is plain declarative prose describing what you can now do — no internal module names, no refactor detail, no em dashes (use periods or commas).

## Environment & Secrets

Domnotate has no required client-side secrets. Local sessions use IndexedDB, while URL loading and sharing use Cloudflare Pages Functions. The R2 binding (`env.SHARES`) is runtime configuration, not a credential. Store any future Pages Function secrets as encrypted Cloudflare secrets, and use untracked local files such as `.dev.vars` only for development. `.dev.vars`, `.env*`, and `.wrangler/` must remain out of Git.

GitHub Actions secrets used by the OpenWiki workflow are `OPENROUTER_API_KEY` and `LANGSMITH_API_KEY`. Reference them through GitHub Actions secrets as the workflow does; do not print, copy, or commit their values.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `npm run build` fails on types | Stale deps or a type-breaking change | `npm install`, then re-check recent commits touching `src/types/core.ts` |
| Share publish returns 413 | Payload (HTML + annotations) over 5 MB | Trim captured HTML/annotation text, or split into multiple shares |
| Share publish/fetch returns 500/404 | R2 bucket unreachable or share expired/never existed | Check Cloudflare Pages Function logs; verify that the project has a `SHARES` binding connected to the intended R2 bucket |
| "Load by URL" fails in dev | Target blocks CORS and the dev proxy middleware isn't matching | Confirm the URL is `http`/`https` and check the Vite terminal output for proxy errors |
| Tests pass locally but fail in CI | Node version drift, or an environment-dependent test | Match the Node version in `ci.yml`; check for reliance on real timers/layout that happy-dom fakes differently |

## Related Docs

- [Testing](./testing.md) — test commands, fixtures, mocking rules
- [Sharing & Integrations](./integrations/sharing.md) — R2, Pages Functions, share schema
- [Architecture Overview](./architecture/overview.md) — module map and event bus
- Root-level docs: [README.md](../README.md), [CONTRIBUTING.md](../CONTRIBUTING.md), [SECURITY.md](../SECURITY.md)
