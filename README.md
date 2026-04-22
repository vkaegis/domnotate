# Domnotate

A lightweight HTML annotation tool for giving structured feedback on web pages — built to close the loop between humans and coding agents.

## Status

Personal project. Actively used by me, shared in case it's useful to others. I may not respond to issues or PRs quickly. Use at your own risk.

## What it does

Load any HTML page (from a file or URL), pin annotations to specific elements, and export the feedback as structured JSON. The output is designed to be fed back to coding agents so they can act on the feedback without a human transcribing it.

Annotations are persisted locally in IndexedDB. No backend, no accounts, no data leaves your browser.

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
