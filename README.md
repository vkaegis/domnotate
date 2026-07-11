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

- There are no accounts or permissions. Anyone with the link can view and edit the annotations.
- Concurrent edits are last-write-wins, so one editor can overwrite another editor's recent annotation changes.
- The captured HTML does not update after publishing, and remote pages may lose assets or behave differently from the original.
- Shares are capped at 5 MB and are intended to expire after 30 days.

## Running it locally

```bash
git clone https://github.com/vkaegis/domnotate.git
cd domnotate
npm install
npm run dev  # opens on http://localhost:8000
```

## Deploying

`npm run build` produces a static `dist/` directory. Local-file annotation works on any static host. Loading URLs and creating shared links require compatible server endpoints; this repo includes implementations under `functions/`.

Anonymous share creation uses Cloudflare Turnstile. Configure:

- `VITE_TURNSTILE_SITE_KEY` as public build configuration for the browser.
- `TURNSTILE_SECRET_KEY` as an encrypted Pages secret; never expose it to the browser or commit it.
- `TURNSTILE_EXPECTED_HOSTNAME` as the exact production hostname accepted during verification.
- `SHARING_ENABLED=false` when share creation and updates need to be stopped immediately. Reading existing links remains available.

See `.env.example` and `.dev.vars.example` for placeholder-only local configuration. Turnstile verification is required only when creating a new share; copying an existing share link does not run another challenge.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## Security

See [SECURITY.md](./SECURITY.md).

## License

MIT — see [LICENSE](./LICENSE).
