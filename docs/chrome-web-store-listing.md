# Chrome Web Store listing — Domnotate

The copy submitted to the store, kept in the repo so it is reviewable and so it changes in the same
commit as the thing it describes. `tools/check-extension-package.mjs` fails the release if the
manifest's permissions drift from what this file claims.

**Status: published.** Version 0.1.0 was submitted, reviewed, and approved.

- **Listing:** https://chromewebstore.google.com/detail/domnotate/hgllflmkglkhaamjkgmmjhgelhokdkma
- **Extension ID:** `hgllflmkglkhaamjkgmmjhgelhokdkma`

An update is a new upload against the same item, so the copy below is the live listing text. Edit it
in the same commit as the change it describes, then paste the changed fields into the console when
the next version ships.

---

## Store fields

**Name**

```
Domnotate
```

**Summary** (132 characters max; this is 93)

```
Click anything on a page, write a note, and copy it as markdown your coding agent can act on.
```

**Category:** Developer Tools
**Language:** English (UK)

**Description**

```
Domnotate turns "this button is in the wrong place" into something a coding agent can act on.

Click the icon, click an element, type what is wrong with it. Copy, then paste into Claude Code,
Cursor, or whatever you use. The note arrives with enough context that the agent finds the right
file itself.

WHY NOT JUST A SCREENSHOT

A screenshot tells an agent what you saw, not what it needs to change. Domnotate exports a search
brief instead: the visible text of the element you clicked, its accessible name and role, its test
id if it has one, the landmarks around it, the route you were on, and its design-system classes
where those are recognisable. All of it grep-able.

Measured on a real authenticated React app, a cold agent handed one exported note and no other
context found the correct file for 8 of 10 annotations on the first attempt.

WORKS ON PRODUCTION APPS, UNMODIFIED

No build step, no dev server, no cooperation from the app. Production builds rename components and
throw away source paths, so Domnotate does not pretend to know the file and line. It describes what
you clicked well enough to find it, and says so plainly when it cannot: an element with no text, no
label, and no test id is reported as such, because a confident wrong path costs an agent more than
an honest "grep this".

Works on anything you can open, including apps behind a login.

NOTHING IS UPLOADED

No account, no telemetry, no servers, no network permission. Domnotate reads the page in front of
you and writes markdown to your clipboard. That is the whole data path.

HOW IT WORKS

1. Click the Domnotate icon, or press Cmd+Shift+Y (Ctrl+Shift+Y on Windows and Linux).
2. The sidebar docks to the right. Picking is already armed, so click any element.
3. Type your note. Enter commits it.
4. Copy, and paste into your agent.

Press Esc to close. Notes you have not copied yet survive closing and reopening.

KNOWN LIMITS

A page's full-width fixed header will run underneath the sidebar; there is no way to fix that from
outside the page. Notes are cleared by a page reload. Chrome does not permit extensions on
chrome:// pages, the Web Store, or the PDF viewer. Chrome only for now.

Open source, MIT: https://github.com/vkaegis/domnotate
```

---

## Privacy practices tab

The console blocks publishing until every field here is filled, so this section is ordered to match
the tab and each block is paste-ready.

### Single purpose description

```
Domnotate has one purpose: to let you annotate elements on a web page and copy those annotations to
your clipboard as text, along with the page context an agent needs to find the same element in source
code.

Every part of it serves that purpose. The element picker selects the thing you are describing. The
sidebar holds the notes you have written for the current page. The copy action puts them on your
clipboard as markdown. There is nothing else in the extension: no accounts, no settings, no data
collection, and no network requests of any kind.
```

### Permission justifications

One user-facing line each. Only actual permissions need one — `commands` declares the keyboard
shortcut and is a manifest key rather than a permission, so the console does not ask about it.

| Permission | Justification as submitted |
|---|---|
| `activeTab` | Domnotate reads the text and attributes of the element you click so it can describe it in the notes you copy. This permission grants that access only for the tab you are already on, and only after you click the extension's icon or press its keyboard shortcut, so the extension has no access to any page until you ask for it. |
| `scripting` | Domnotate's annotation sidebar and element picker have to run inside the page you are annotating. This permission is what allows them to be injected, and only into the tab you activated. |

**Host permissions: none requested** (plan §3.4 chose `activeTab` over `<all_urls>` on day one), and
**no `storage`** (§3.7a). The extension has no standing access to any site.

### Remote code use

Answer **"No, I am not using remote code."** If the field still wants text:

```
Domnotate does not use remote code. All of its logic ships inside the extension package. It loads no
scripts, modules or stylesheets from any remote source, evaluates no strings as code, and requests no
network permission, so it has no way to fetch code at runtime.
```

Verified against the built bundles rather than asserted, because this one is a certification:

```sh
# No dynamic code execution:
grep -oE "\beval\(|new Function|importScripts|\.innerHTML *=|insertAdjacentHTML|document\.write|import\(" dist-extension/*.js
# No network APIs:
grep -oE "\bfetch\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon" dist-extension/*.js
# No script/link/iframe injection:
grep -oE "createElement\([\"'\`](script|link|iframe)" dist-extension/*.js
```

All three return nothing. The only URL-shaped string in the package is
`http://www.w3.org/2000/svg`, the XML namespace constant passed to `createElementNS` when the sidebar
builds its own icons. A reviewer grepping for URLs will see it, so it is worth being able to name.

### Data usage certification

Tick all four. Each is true, and the "not collected" answers in the next section are the detail
behind them:

- The data use complies with the Developer Program Policies.
- Data is not being sold to third parties, outside of approved use cases.
- Data is not being used or transferred for purposes unrelated to the item's single purpose.
- Data is not being used or transferred to determine creditworthiness or for lending purposes.

---

## Data disclosure

The store's data-use form asks what is *collected*, which for its purposes means transmitted off the
user's machine or stored remotely. For Domnotate the answer is nothing, in every category, and the
manifest is the evidence: no network permission is requested and the extension makes no requests.

| Question | Answer |
|---|---|
| Personally identifiable information | Not collected |
| Health information | Not collected |
| Financial and payment information | Not collected |
| Authentication information | Not collected |
| Personal communications | Not collected |
| Location | Not collected |
| Web history | Not collected |
| User activity | Not collected |
| Website content | **Read locally, not collected.** Text and attributes of the element you click are put on your clipboard. Nothing is transmitted or stored by the extension. |
| Sold to third parties | No |
| Used or transferred for purposes unrelated to the core function | No |
| Used or transferred to determine creditworthiness or for lending | No |

**The one thing to state honestly and not bury:** the visible text of an element you annotate goes
onto your clipboard, and pasting it into a hosted AI tool sends it to that tool. That is the user's
own paste into a destination they chose, not a transmission by this extension — but the listing
should not imply the extension prevents it. There is no redaction control (§3.7a), and the copy above
does not claim one.

---

## Graphic assets

Everything the console's **Graphic assets** section asks for, in `docs/store-assets/`.

| Asset | File | Spec | State |
|---|---|---|---|
| Store icon (required) | `icon-128.png` | 128x128 PNG, artwork 96x96 with 16px transparent padding | Made and verified by `-trim` at `96x96 +16+16`. **Upload it** — the console reports "Icon image is missing" until you do, on the Store listing tab under Graphic assets |
| Small promo tile (required) | `promo-440x280.png` | 440x280, opaque, full bleed, no screenshot inside | Done |
| Screenshots (1 required, 5 preferred) | `screenshots/01..05` | 1280x800, square corners, full bleed | Done, five |
| Marquee promo tile (optional) | — | 1400x560 | Not made. Only needed for featured placement |

### The store icon is a separate asset from the toolbar icons

They have conflicting requirements, so `src/extension/icons/` holds two sources rather than one:

- **`icon.svg` → `icon-16/32/48/128.png`**, referenced by the manifest. Near-full-bleed, because at
  16px in a toolbar padding is legibility you cannot afford.
- **`store-icon.svg` → `docs/store-assets/icon-128.png`**, uploaded to the listing. The store
  requires the artwork to be 96x96 inside a 128x128 canvas with 16px of transparent padding, so a
  full-bleed mark is out of spec.

The store also requires the icon to **work on both light and dark backgrounds**, and the toolbar mark
cannot: its pin ring is cream and overhangs the card, so against a white store card the overhanging
part dissolves and the pin reads as a notch bitten out of the corner. The store version puts the mark
on its own terracotta tile so it carries its own contrast and renders identically either way. Checked
against white, the store's grey, and a dark surface, and at 48px for search results.

Regenerate both with `npm run icons:extension` (needs rsvg-convert; the PNGs are committed so CI does
not).

---

## Screenshots

**Taken 11 Aug — `docs/store-assets/screenshots/`, all five at 1280x800.** Upload in filename order.

| File | Shows |
|---|---|
| `01-sidebar.png` | The core loop: sidebar docked, three notes written, three pins on the page |
| `02-export.png` | The real exported markdown, header plus one complete block |
| `03-picking.png` | Picking mid-hover, element outlined with its tag readout |
| `04-honest.png` | The floor case: a block naming what it could not recover |
| `05-activation.png` | Activation and the empty state, before anything is annotated |

**Not the Enterpret client** — its screens carry real customer feedback, and store screenshots are
public. These were taken on `fixtures/demo-app.html`, a purpose-built demo product ("Northwind —
Deliveries") with entirely invented data, which also means no one else's trademark appears in the
listing.

Two things about how they were produced, both of which matter if they are retaken:

- **Shots 1, 3 and 5 are the real extension** on its real code path: the built bundles injected into
  a real page, elements picked with real mouse events, notes typed with real keystrokes. Only the MV3
  injection mechanism is bypassed, so they prove nothing about installation — that is what the
  clean-profile check below is for.
- **Shots 2 and 4 are a genuine clipboard capture**, rendered by `tools/make-store-panels.mjs`. The
  block is never hand-written, because the entire claim of those two shots is that this is what the
  tool emits. The panels are generic dark monospace surfaces: no product logos, and no impersonation
  of any particular agent's UI.

Retake with `node tools/make-store-panels.mjs <export.txt> <outDir>`, then shoot each panel at
1280x800.

---

## Pre-submission checklist

- [x] Screenshots taken, and none of them show customer data
- [x] Store icon is 128x128 with the artwork at 96x96 and 16px transparent padding
- [x] Store icon reads on light and dark backgrounds, and at search-result size
- [x] Small promo tile is 440x280, opaque, full bleed, and contains no screenshot
- [x] Single purpose description written
- [x] Justifications written for both permissions (`activeTab`, `scripting`)
- [x] Remote code answer verified against the built bundles, not just asserted
- [ ] Store icon actually uploaded, and the six publish blockers cleared
- [ ] `node tools/check-extension-version.mjs ext-vX.Y.Z` passes
- [ ] `npm run zip:extension` passes, and the zip installs on a clean Chrome profile
- [ ] The description's permission list matches the manifest (the package check enforces this)
- [ ] The 8-of-10 claim still matches the plan's findings log before repeating it publicly
- [ ] Nothing in the copy implies a privacy control that does not exist
