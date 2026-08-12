# Domnotate

A lightweight HTML annotation tool for giving structured feedback on web pages — built to close the loop between humans and coding agents.

It comes in two forms: a **web app** you drop an HTML file into, and a **[Chrome extension](https://chromewebstore.google.com/detail/domnotate/hgllflmkglkhaamjkgmmjhgelhokdkma)** that annotates a live page in place — including authenticated apps the web app cannot load.

## Status

Personal project. Actively used by me, shared in case it's useful to others. I may not respond to issues or PRs quickly. Use at your own risk.

## What it does

Load an HTML page from a file or URL, then:

- Pin notes to specific elements.
- Edit text in place as a preview.
- Copy or export the feedback as Markdown, JSON, or a compact format for coding agents.
- Share the annotated page with a link.

Exports include the element context coding agents need to act on the feedback. Annotations are stored locally in the browser. Creating a shared link uploads the captured HTML, annotations, and text edits to the configured share backend. A capture can contain sensitive or private content from the source document, so review it before publishing and share the link only with people who should be able to access it.

## Chrome extension

The web app needs a page it can load into an iframe, which rules out anything behind a login. The extension runs on the page you are already looking at, so an authenticated SPA works the same as a static file.

What it adds over the web app:

- Annotate any page you can open, including apps behind a login.
- Notes carry a **source brief** instead of just a selector: the visible text, the accessible name and role, a test id where one exists, the surrounding landmarks, the route, and the component's design-system classes where they are recognisable. Written for an agent to grep, not for a browser to resolve.
- Nothing is uploaded. The notes go to your clipboard and stay there until you paste them.

### Installing it

[**Install from the Chrome Web Store**](https://chromewebstore.google.com/detail/domnotate/hgllflmkglkhaamjkgmmjhgelhokdkma) — one click, and Chrome keeps it up to date.

### Installing it unpacked

To run a build the store does not have yet, install from a release zip instead:

1. Download `domnotate-extension-ext-v*.zip` from the [latest release](https://github.com/vkaegis/domnotate/releases/latest).
2. Unzip it.
3. Open `chrome://extensions`.
4. Turn on **Developer mode** (top right).
5. Click **Load unpacked** and select the unzipped folder.

Building it yourself instead:

```bash
npm install
npm run zip:extension   # builds, verifies the package, writes domnotate-extension.zip
```

Or point **Load unpacked** straight at `dist-extension/` after `npm run build:extension`.

### Using it

1. Click the Domnotate icon, or press `Cmd/Ctrl+Shift+Y`.
2. The sidebar docks to the right and picking is already armed. Click an element to pin a note.
3. Type the note. `Enter` commits it, `Cmd+Enter` adds a newline.
4. `Esc` closes the sidebar without losing notes you have not copied yet.
5. Copy, then paste into your agent.

Chrome does not allow extensions to run on `chrome://` pages, the Chrome Web Store, or the PDF viewer, so the icon does nothing there.

### What it can and cannot tell an agent

Production builds rename components and discard source paths, so the export is a **search brief, not a file path** — it describes what you clicked well enough for an agent to find it. Measured on a real authenticated React app, a cold agent with no other context identified the correct file for 8 of 10 annotations on the first attempt.

Where a signal is missing, the block says so rather than guessing: an element with no text, no accessible name, and no test id is reported as being at that floor, because a confident wrong path costs an agent more than an honest "grep this".

### Privacy

The extension has no network permission and makes no requests. It reads the page in front of you and writes markdown to your clipboard; nothing is sent anywhere, and there is no account, no telemetry, and no remote storage.

Two consequences worth knowing:

- The full visible text of what you annotate goes onto your clipboard, so if the page shows sensitive data, review a paste before handing it to a hosted model. There is deliberately no redaction toggle: nothing leaves your machine on its own, and a toggle would only restrict what this tool copies out of a page you could select by hand.
- Raw component props are never exported. Only an allow-listed set of attributes is, because the rest are mostly build-generated strings that would waste an agent's time.

It requests two permissions:

- **`activeTab`** — read the page you are on, only after you click the icon or press the shortcut, and only that tab.
- **`scripting`** — inject the annotation UI into that tab.

There are deliberately no host permissions, so the extension has no standing access to any site.

### Known limits

- A host page's full-width `position: fixed` header runs underneath the docked sidebar. Fixed elements are placed against the viewport rather than the inset page, and there is no fix available from outside the page.
- Notes are cleared by a page reload. They survive closing and reopening the sidebar, scoped to the screen they were taken on.
- Firefox and Safari are not supported yet.

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
