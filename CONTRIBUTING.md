# Contributing to Domnotate

Thanks for considering a contribution. This is a personal project, so a few ground rules keep it sustainable:

## Before opening a PR

- **Open an issue first for anything non-trivial.** A quick check on whether I'd merge a change saves both of us time.
- **Typo fixes, tiny bug fixes, dependency bumps:** go straight to a PR.
- **New features or architectural changes:** open an issue first to discuss.

## Standards

- All tests must pass: `npm run test:ci`
- New modules need a matching test file (see `CLAUDE.md` for conventions)
- Bug fixes need a regression test
- Keep PRs focused — one concern per PR

## Credentials and deployment configuration

- Never commit Cloudflare Global API Keys, account or zone IDs, deployment tokens, or other credentials.
- Use narrowly scoped API tokens for deployment and store them in the deployment platform's secret store or an ignored local environment file.
- Keep real values out of example environment files. Examples must contain placeholders only.
- Put local Pages Functions secrets in `.dev.vars`; the file and its variants are ignored. A tracked `.dev.vars.example`, if added, must contain variable names and placeholders only.
- Turnstile's `VITE_TURNSTILE_SITE_KEY` is public browser configuration. Its `TURNSTILE_SECRET_KEY` is a credential and must exist only in `.dev.vars` or the deployment platform's encrypted secret store.

## Response times

I work on this as a side project. Expect responses in days, not hours. If something is time-sensitive for you, the best move is to fork it.

## What I won't merge

- Changes that add heavy new dependencies without a clear reason
- Changes that meaningfully expand scope beyond annotation tooling
- Purely stylistic refactors
