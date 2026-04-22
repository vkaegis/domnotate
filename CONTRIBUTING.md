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

## Response times

I work on this as a side project. Expect responses in days, not hours. If something is time-sensitive for you, the best move is to fork it.

## What I won't merge

- Changes that add heavy new dependencies without a clear reason
- Changes that meaningfully expand scope beyond annotation tooling
- Purely stylistic refactors
