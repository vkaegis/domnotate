# Domnotate

A lightweight HTML annotation tool for giving structured feedback on web pages — built to close the loop between humans and coding agents.

## Status

Personal project. Actively used by me, shared in case it's useful to others. I may not respond to issues or PRs quickly. Use at your own risk.

## What it does

Load any HTML page (from a file or URL), pin annotations to specific elements, and export the feedback as structured JSON. The output is designed to be fed back to coding agents so they can act on the feedback without a human transcribing it.

Annotations are persisted locally in IndexedDB. Shared links use Cloudflare R2 to store the captured HTML and annotations.

## Authoring annotation-friendly artifacts

Domnotate can annotate plain one-page documents without any special markup. For multi-view artifacts such as slides, tabs, carousels, wizards, and route-like panels, artifact generators should mark each logical view with stable Domnotate scope attributes. This lets annotations attach to the view the reviewer was actually looking at, so pins, note navigation, import, export, and shared sessions stay deterministic even when hidden views contain duplicate text or selectors.

Recommended markup:

```html
<section
  data-domnotate-scope
  data-domnotate-scope-id="overview"
  data-domnotate-scope-label="Overview"
>
  ...
</section>
```

Use a stable `data-domnotate-scope-id` that will not change between generated versions of the artifact. Use `data-domnotate-scope-label` for the readable name shown in exports and note groups. If the artifact has a known view type, `data-domnotate-scope` may also be set to one of the supported scope kinds:

```html
<section
  data-domnotate-scope="wizard-step"
  data-domnotate-scope-id="setup"
  data-domnotate-scope-label="Setup"
>
  ...
</section>
```

Supported scope kinds are `slide`, `tabpanel`, `hash-route`, `carousel`, `wizard-step`, `active-panel`, and `custom`. Explicit Domnotate attributes have the highest priority. Without those attributes, Domnotate also detects common semantic patterns such as `.deck > .slide[data-slide]`, ARIA tab panels, hash-routed sections with route-like navigation, carousel items, wizard steps, and strongly marked active panels.

Activation works best when each view has a clear state change:

- Tabs should connect a controller to the panel with `aria-controls`.
- Hash-routed sections should have stable ids and matching hash links.
- Carousels, wizards, and active panels should keep inactive views hidden or clearly inactive with common markers such as `hidden`, `aria-hidden="true"`, `.active`, `.is-active`, or framework-specific active classes.
- If there is a visible controller for a view, keep it clickable and associated with the target view where possible.

For compatibility with older annotation exports, slide annotations may still include `slideIndex`. New scoped annotations include `viewScope`, and slide annotations may include both fields during the transition. Consumers should prefer `viewScope` when present and treat `slideIndex` as a legacy fallback.

Known limits:

- Canvas-only artifacts need their own semantic HTML overlay if annotations should attach to logical views.
- Cross-origin iframe content cannot be introspected unless browser security rules allow it.
- Arbitrary app routers need semantic hints such as Domnotate attributes, hash routes, or clear active panels.
- Complex animated transitions with no stable hidden or active state may not be inferred reliably.

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
