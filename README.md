# Domnotate

A lightweight HTML annotation tool for giving structured feedback on web pages — built to close the loop between humans and coding agents.

## Status

Personal project. Actively used by me, shared in case it's useful to others. I may not respond to issues or PRs quickly. Use at your own risk.

## What it does

Load an HTML page from a file or URL, then:

- Pin notes to specific elements.
- Edit text in place as a preview.
- Copy or export the feedback as Markdown, JSON, or a compact format for coding agents.
- Share the annotated page with a link.

Exports include the element context coding agents need to act on the feedback. Annotations are stored locally in the browser. Creating a shared link uploads the captured HTML, annotations, and text edits to the configured share backend. A capture can contain sensitive or private content from the source document, so review it before publishing and share the link only with people who should be able to access it.

## Sharing limitations

Shared links are intentionally simple:

- There are no accounts or permissions. Anyone with the link can view, edit, and delete the annotations.
- Concurrent edits are last-write-wins, so one editor can overwrite another editor's recent annotation changes. A save that loses a race against another save is retried once and then reported, so it is not dropped silently, but the document as a whole is still last-write-wins.
- The captured HTML does not update after publishing, and remote pages may lose assets or behave differently from the original.
- Shares are capped at 5 MB and expire 30 days after they are created. Reading or updating an expired link returns "gone" rather than its contents.

## Running it locally

```bash
git clone https://github.com/vkaegis/domnotate.git
cd domnotate
npm install
npm run dev  # opens on http://localhost:8000
```

## Deploying

`npm run build` produces a static `dist/` directory. Local-file annotation works on any static host. Loading URLs and creating shared links require compatible server endpoints; this repo includes implementations under `functions/`.

Anonymous share creation and editing use Cloudflare Turnstile. Configure:

- `VITE_TURNSTILE_SITE_KEY` as public build configuration for the browser.
- `TURNSTILE_SECRET_KEY` as an encrypted Pages secret; never expose it to the browser or commit it.
- `TURNSTILE_EXPECTED_HOSTNAME` as the exact production hostname accepted during verification.
- `SHARE_GRANT_SECRET` as an encrypted Pages secret: a long random string used to sign short-lived edit grants. **Set this before deploying**, otherwise shared links become read-only and updates are refused with `sharing_misconfigured`. Rotating it makes outstanding grants unusable, which costs each open browser one extra challenge.
- `SHARING_ENABLED=false` when share creation and updates need to be stopped immediately. Reading existing links remains available.

See `.env.example` and `.dev.vars.example` for placeholder-only local configuration.

Verification runs once when creating a share, and once per share per browser before that browser's first edit. Copying an existing share link does not run a challenge, and ordinary annotation edits do not either: the first edit exchanges one invisible challenge for a signed grant that lasts 12 hours and is stored in `sessionStorage` for that share. Because share updates fire from background autosave, a challenge per update is not workable, which is what the grant replaces.

`npm run dev` serves the browser app and the URL proxy but not the share endpoints, so exercising share creation or editing locally needs `wrangler pages dev` with `VITE_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, and `SHARE_GRANT_SECRET` set. There is deliberately no way to skip verification.

Shares expire 30 days after creation. The server refuses to read or update an expired share on its own, but reclaiming the storage needs a bucket lifecycle rule, so add one when you deploy:

```bash
wrangler r2 bucket lifecycle add domnotate-shares expire-30d share/ --expire-days 30
```

R2 removes matching objects within roughly 24 hours of the threshold. The expiry check in `functions/` does not depend on the rule being present.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## Security

See [SECURITY.md](./SECURITY.md).

## License

MIT — see [LICENSE](./LICENSE).
