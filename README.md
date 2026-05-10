# Domnotate

A lightweight HTML annotation tool for giving structured feedback on web pages — built to close the loop between humans and coding agents.

## Status

Personal project. Actively used by me, shared in case it's useful to others. I may not respond to issues or PRs quickly. Use at your own risk.

## What it does

Load any HTML page (from a file or URL), pin annotations to specific elements, and export the feedback as structured JSON. The output is designed to be fed back to coding agents so they can act on the feedback without a human transcribing it.

Annotations are persisted locally in IndexedDB. Shared links use Cloudflare R2 to store the captured HTML and annotations.

## Sharing limitations

Shared links are intentionally simple for the MVP:

- There are no accounts or permissions. Anyone with the link can view and edit the annotations.
- Concurrent edits are last-write-wins, so one editor can overwrite another editor's recent annotation changes.
- Shared sessions are cloud-bound. Annotation edits on a shared link must sync to the share backend; offline writes stay local only until a later successful save.
- The captured HTML is immutable after publish, but dynamic pages may render differently from the original live page.
- URL-loaded captures may miss external assets such as images, fonts, scripts, or styles if the remote site blocks them or relies on dynamic loading.
- Shares are capped at 5 MB and are intended to expire after 30 days through the Cloudflare R2 lifecycle policy.

## Running it locally

```bash
git clone https://github.com/vkaegis/domnotate.git
cd domnotate
npm install
npm run dev  # opens on http://localhost:8000
```

## Deploying

Domnotate is built for Cloudflare Pages. `npm run build` produces a static `dist/` directory that you can deploy anywhere. The repo includes a `wrangler.jsonc` for Cloudflare Pages specifically.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## Security

See [SECURITY.md](./SECURITY.md).

## License

MIT — see [LICENSE](./LICENSE).
