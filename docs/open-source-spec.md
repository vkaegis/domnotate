# Open Source Spec — Domnotate

Goal: flip the `domnotate` repo from private to public with the minimum viable setup for a personal/hobby project, while avoiding the common footguns (leaked secrets, liability ambiguity, unset expectations).

**Owner:** Vineet
**Target effort:** ~30 minutes of focused work
**Target outcome:** a public GitHub repo that is safe, legally clear, and sets honest expectations for visitors.

---

## Non-goals

- Building a community or attracting contributors (can happen later, not a prerequisite)
- Formal governance, CoC, CLA
- Monetization, sponsorship tiers, roadmap publishing
- Rewriting existing code for "public consumption"

---

## Acceptance criteria (done = all checked)

- [ ] `LICENSE` file exists at repo root with MIT text and correct copyright holder/year
- [ ] `README.md` at repo root explains what Domnotate is, how to run it, project status, and license
- [ ] `CONTRIBUTING.md` at repo root sets expectations for issues/PRs (≤1 page)
- [ ] `SECURITY.md` at repo root tells people how to report vulnerabilities privately
- [ ] Secret scan on full git history passes with zero findings (or findings are triaged)
- [ ] `.gitignore` covers `.env*`, `dist/`, `node_modules/`, `.wrangler/`, `.context/` (verify existing)
- [ ] Repo visibility flipped to Public on GitHub
- [ ] Repo description + topics set on GitHub (improves discoverability)
- [ ] First-load smoke test: clone fresh, `npm install`, `npm run dev`, app works

---

## Phase 1 — Pre-flight checks (5 min)

Before touching anything, confirm the repo is in a shape that's safe to publish.

### 1.1 Secret scan (history + working tree)

Run a scanner against the full history. Any of these works:

```bash
# Option A: gitleaks (recommended, fast)
brew install gitleaks
gitleaks detect --source . --verbose

# Option B: trufflehog
brew install trufflesecurity/trufflehog/trufflehog
trufflehog git file://. --only-verified
```

**Triage rule:** any verified secret hit = stop, rotate the credential, rewrite history with `git filter-repo` *before* going public. An unverified/false-positive hit can be noted and ignored.

### 1.2 Manual sweep

Grep for common footguns:

```bash
rg -i "api[_-]?key|secret|token|password|bearer" --hidden -g '!node_modules'
rg "TODO|FIXME|HACK|XXX" -n
```

The first command is a sanity check for credentials. The second is a vibe check — nothing blocking, just awareness of what's in there.

### 1.3 `.gitignore` audit

Confirm these are ignored:

```
node_modules/
dist/
.wrangler/
.env
.env.*
.context/
*.log
.DS_Store
```

### 1.4 Dependency check

```bash
npm audit
```

High/critical vulns in runtime deps = fix before going public (easy PR target for drive-by). Dev deps can wait.

---

## Phase 2 — Add the four required files (15 min)

### 2.1 `LICENSE` (MIT)

Create `/LICENSE` with the standard MIT text. Year = current year, copyright holder = "Vineet Kumar" (or preferred name/handle).

```
MIT License

Copyright (c) 2026 Vineet Kumar

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### 2.2 `README.md`

Structure:

```markdown
# Domnotate

One-sentence pitch. (e.g., "A lightweight HTML annotation tool for giving
structured feedback on web pages — built to close the loop between humans and
coding agents.")

## Status

Personal project. Actively used by me, shared in case it's useful to others.
I may not respond to issues or PRs quickly. Use at your own risk.

## What it does

2-4 sentence description. What problem does it solve? Who might care?
Optional: screenshot or GIF.

## Running it locally

```bash
git clone https://github.com/<your-handle>/domnotate.git
cd domnotate
npm install
npm run dev  # opens on http://localhost:8000
```

## Deploying

Domnotate is built for Cloudflare Pages. `npm run build` produces a static
`dist/` directory that you can deploy anywhere. The repo includes a
`wrangler.jsonc` for Cloudflare Pages specifically.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## Security

See [SECURITY.md](./SECURITY.md).

## License

MIT — see [LICENSE](./LICENSE).
```

Keep it short. README bloat is a smell. Aim for <150 lines.

### 2.3 `CONTRIBUTING.md`

```markdown
# Contributing to Domnotate

Thanks for considering a contribution. This is a personal project, so a few
ground rules keep it sustainable:

## Before opening a PR

- **Open an issue first for anything non-trivial.** A quick check on whether
  I'd merge a change saves both of us time.
- **Typo fixes, tiny bug fixes, dependency bumps:** go straight to a PR.
- **New features or architectural changes:** open an issue first to discuss.

## Standards

- All tests must pass: `npm run test:ci`
- New modules need a matching test file (see `CLAUDE.md` for conventions)
- Bug fixes need a regression test
- Keep PRs focused — one concern per PR

## Response times

I work on this as a side project. Expect responses in days, not hours.
If something is time-sensitive for you, the best move is to fork it.

## What I won't merge

- Changes that add heavy new dependencies without a clear reason
- Changes that meaningfully expand scope beyond annotation tooling
- Purely stylistic refactors
```

### 2.4 `SECURITY.md`

```markdown
# Security Policy

## Reporting a vulnerability

Please do **not** file public GitHub issues for security vulnerabilities.

Email: <your-email@domain.com>

Include:
- What the issue is
- How to reproduce it
- What an attacker could do with it

I'll acknowledge within 7 days and discuss a fix + disclosure timeline.

## Scope

Domnotate runs entirely in the browser and stores data in IndexedDB locally.
There is no backend auth, no multi-tenant data, and no server-side secrets.
The most likely vulnerability classes are XSS in rendered HTML content and
issues in the IndexedDB persistence layer.
```

---

## Phase 3 — GitHub repo hygiene (5 min)

On github.com/<handle>/domnotate:

- **About panel** (right side of repo page): set description, website (Pages URL), and topics (e.g., `annotation`, `html`, `typescript`, `cloudflare-pages`, `personal-project`).
- **Settings → General:** disable "Wiki" and "Projects" unless you plan to use them (reduces surface area for spam).
- **Settings → General → Features:** keep "Issues" enabled. Keep "Discussions" off for now (can enable later if people show up).
- **Settings → Branches:** add a branch protection rule on `main` requiring PR + passing checks. Even solo, this prevents accidental force-pushes.
- **Settings → Code security:** enable "Dependabot alerts" and "Dependabot security updates". Free, high-signal.
- **Settings → Moderation:** not needed day one, revisit if abuse happens.

---

## Phase 4 — Flip the switch (1 min)

GitHub → Settings → scroll to "Danger Zone" → "Change repository visibility" → Public.

GitHub will warn you this is irreversible in the sense that anyone who forks while it's public keeps their copy even if you later make it private again. That's fine — it's also the whole point.

---

## Phase 5 — Post-launch smoke test (5 min)

From a clean directory (or a different machine):

```bash
git clone https://github.com/<handle>/domnotate.git /tmp/domnotate-fresh
cd /tmp/domnotate-fresh
npm install
npm run test:ci
npm run dev
# open http://localhost:8000 and create an annotation
```

Catches three classes of mistake:
1. A dependency that's published privately / from a private registry
2. A hardcoded absolute path
3. Setup steps missing from the README

---

## Phase 6 — Optional next steps (future, not part of this spec)

Only do these if/when the project shows signs of traction:

- Issue templates (`.github/ISSUE_TEMPLATE/`)
- PR template (`.github/pull_request_template.md`)
- `CODE_OF_CONDUCT.md` (Contributor Covenant is standard)
- CI badge in README
- Changelog (`CHANGELOG.md` or GitHub Releases)
- A proper landing page / demo video

---

## Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Leaked secret in git history | Low (fresh repo) | High | Phase 1.1 scan + history rewrite if needed |
| Malicious PR merged | Low | Medium | Never auto-merge; always review diffs |
| XSS exploit in annotation rendering | Medium | Low (personal data only) | SECURITY.md channel; fix when reported |
| Drive-by dependency-bump PRs | High | Low | Dependabot handles this; ignore bot-copycat PRs |
| Time sink from support requests | Medium | Low | README sets expectations; close stale issues |
| Name collision / trademark | Very low | Low | "Domnotate" is distinct; no action |

---

## Decision log

Fill in as you go:

- **License chosen:** MIT (reason: permissive, familiar, zero friction for tools)
- **Copyright holder on LICENSE:** _____
- **Security contact email:** _____
- **Repo description:** _____
- **Topics:** _____
