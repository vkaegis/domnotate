# Annotation Sidebar — Spec

## Summary

Replace the floating comment popup, bottom toolbar, and persistent annotate mode with a self-contained right sidebar. The sidebar shows all annotations and houses every action. No top bar — the HTML content gets the full viewport height.

## Layout

- **Drop zone:** Full-screen as today. Sidebar does not exist yet.
- **After content loads:** The viewport splits into two regions:
  - **Left:** iframe + overlay (full height, no top chrome)
  - **Right:** Notes panel (sidebar)
- The sidebar is **resizable** via a drag handle on its left edge. Default width ~360px.
- The floating bottom toolbar is **removed entirely**.
- There is **no top bar** and **no sidebar header**. The action bar is the first element in the sidebar.

## Notes Panel (Sidebar)

### Action Bar
The topmost element of the sidebar — a single row:

**Left:** Sort toggle
- **"Newest first"** dropdown with chevron icon (`11px`, muted `#8A7D6B`)

**Right:** Icon actions (all 26px icon buttons, no labels)
- **Annotate** (pencil) — terracotta filled background (`#C4725A`, white icon). Activates picker for a **single annotation**, then auto-deactivates. Separated from other icons by a small spacer.
- **Pins** (eye) — toggles pin visibility on canvas
- **Copy** (clipboard) — copies annotations as Markdown
- **Export** (download) — exports as JSON
- **Clear** (trash) — clears all annotations

All icons except Annotate use muted stroke color (`#8A7D6B`).

### Notes List (scrollable)
A vertical list of note rows separated by 1px `#E4D9CA` dividers.

Each row shows:
- **Pin number** — 22px terracotta circle with white number, matching the pin on canvas
- **Comment text** — the single annotation comment (`13px Geist`, `#2C2016`)
- **Delete button** — small X icon (14px, 30% opacity), right-aligned

The **selected/active note** has a terracotta left border (3px) and a subtle tinted background (`#C4725A` at 6% opacity).

The comment text is **editable inline** — clicking the text lets you edit it in place.

### Empty State
When no annotations exist:
- Action bar shows only the **pencil icon** at full opacity; all other icons (eye, copy, export, trash) are **dimmed to 35% opacity** since there's nothing to act on
- The sort toggle is **hidden** (nothing to sort)
- The notes list area shows a centered empty state: a large muted pencil icon (`32px`, `#E4D9CA` stroke) with the text **"Click the pencil to annotate an element"** below it (`13px`, `#B0A48F`)

## Annotation Flow (No Modes)

The old Browse/Annotate mode toggle is **removed**. Instead, annotating is a single-shot action:

1. User clicks the **pencil icon** in the action bar
2. The element picker activates — hovering highlights elements, cursor changes
3. User clicks an element
4. A new note row appears at the bottom of the sidebar list, auto-scrolled and focused
5. User types their comment and hits Enter (or clicks away to confirm)
6. The picker **automatically deactivates** — back to normal browsing
7. To add another annotation, click the pencil again

This eliminates the cognitive overhead of remembering to switch modes.

## Interaction Changes

### Creating annotations
- **Before:** Toggle annotate mode → click element → floating popup → type comment → click "Add" → remember to toggle mode off
- **After:** Click pencil → click element → type in sidebar → Enter. Done.

### Viewing annotations
- **Before:** Click a pin → floating popup shows the thread
- **After:** All annotations are always visible in the sidebar. Click a row → iframe scrolls to that element and highlights it with a dashed border.

### Editing annotations
- Click the comment text in a sidebar row to edit it inline.

### Deleting annotations
- Small X icon on each row (visible at reduced opacity). Removes the annotation and its pin.

### Comment popup
- **Removed entirely.** The sidebar handles all annotation interaction.

## Simplifications

- **Modes removed.** No more `AppMode` type, `mode:change` events, or persistent annotate/browse state. The picker is activated once per annotation.
- **Threads removed.** Each annotation has exactly one comment. The `comments` array, `parentId`, `thread.ts`, and `flattenThread` logic are no longer needed. An annotation gets a single `text` field (or continues using `comments[0]` — implementation detail).
- **Status field unused.** `open`/`resolved` status is not surfaced in the UI. Can remain in the data model but the sidebar doesn't show it.
- **CSS selectors not shown.** The selector path is stored in the data model but not displayed in the notes list.
- **Timestamps not shown.** Not surfaced in the UI.
- **Top bar removed.** No branding bar — the sidebar owns all chrome.

## What stays the same

- Pin rendering on the canvas (numbered circles)
- Element picker behavior (hover highlight, click to select) — now single-shot instead of persistent
- Auto-save to IndexedDB
- Export formats (Markdown + JSON)
- The event bus architecture
- Session management

## Design Reference

See the Paper file "Scratchpad" → page "DOMnotate":
- **"C — The Field Journal"** — Drop zone / landing screen
- **"C — No Top Bar Variant"** — Annotation screen with notes (no top bar, sidebar-only chrome, single-shot annotate)
- **"C — Empty State"** — Annotation screen before any notes are added

Visual language: warm parchment palette (`#FAF7F2`, `#F3EDE4`), single terracotta accent (`#C4725A`), Geist typeface.

## Open Questions

- **Keyboard shortcut for annotate?** Could map pencil action to a key (e.g. `A` or `N`) for quick annotation without reaching for the sidebar.
- **Minimum sidebar width?** Probably ~200px to keep text readable, maximum ~50% of viewport.
- ~~**Empty state in the notes list?**~~ Resolved — see Empty State section above.
