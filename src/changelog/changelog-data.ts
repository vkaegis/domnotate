// ============================================================
// Domnotate — Changelog Data
// ============================================================

/** Base URL for linking a changelog entry back to its pull request. */
export const REPO_PR_BASE = 'https://github.com/vkaegis/domnotate/pull';

/** Build the GitHub URL for a pull request number. */
export function prUrl(pr: number): string {
  return `${REPO_PR_BASE}/${pr}`;
}

/** One merged change, described as a capability a user gets. */
export interface ChangelogEntry {
  /** Short capability title. */
  title: string;
  /** Merge date, e.g. "22 May 2026". */
  date: string;
  /** Pull request number, when the change shipped as a PR. */
  pr?: number;
  /** One-paragraph description of what you can now do. */
  body: string;
}

/**
 * Human-readable changelog, newest first. One entry per feature merge, linking
 * back to its pull request. Bug-fix, chore, and infrastructure merges are left
 * out — every entry here is something a user can do.
 */
export const CHANGELOG: ChangelogEntry[] = [
  {
    title: 'Annotate any page with the Chrome extension',
    date: '12 Aug 2026',
    pr: 54,
    body: 'Domnotate now runs as a Chrome extension, so you can annotate a live page instead of loading a copy of it. That includes apps behind a login, which the web app cannot open. Install it from the Chrome Web Store, then click the icon or press Cmd+Shift+Y, click an element, type your note, then copy. Each note carries the context an agent needs to find the code: the text you clicked, its role and label, its test id, the landmarks around it, and the route you were on. Nothing is uploaded, and the notes go straight to your clipboard.',
  },
  {
    title: 'A refreshed landing page',
    date: '12 Jul 2026',
    pr: 49,
    body: 'The home page has a cleaner layout with a larger drop zone. You can now drop an HTML file anywhere across the right pane, not just onto the small target, and open the file picker straight from the keyboard. The footer links out to the project on GitHub.',
  },
  {
    title: 'A tidier annotation toolbar',
    date: '11 Jul 2026',
    pr: 45,
    body: 'The toolbar keeps its main actions, Annotate, Edit Text, Copy, and Share, up front and tucks the rest, Hide Pins, Download, and Clear, into a "More" menu. Actions that need an annotation to work stay disabled until you add one, with a short note explaining why.',
  },
  {
    title: 'Edit text in place and hand the changes to an agent',
    date: '11 Jul 2026',
    pr: 44,
    body: 'Press T to edit any text on the page in place, keeping its formatting. Your edits show up live as a preview, and nothing touches the original file. When you export, each change goes along as an instruction an agent can act on.',
  },
  {
    title: 'See what changed with "What\'s new"',
    date: '10 Jul 2026',
    pr: 43,
    body: 'A "What\'s new" link on the landing page opens a changelog of the capabilities added over time, each linking back to the change that shipped it.',
  },
  {
    title: 'Annotations scoped to the active view',
    date: '22 May 2026',
    pr: 39,
    body: 'When you pin a note inside a tab, a slide, a route, an accordion section, or a panel Domnotate infers, that note appears only while its view is active. Switching tabs or slides shows the notes that belong there and hides the rest.',
  },
  {
    title: 'Faster scrolling through long annotation lists',
    date: '11 May 2026',
    pr: 38,
    body: 'The sidebar stays responsive when a session holds many annotations, so scrolling through a long list no longer stutters.',
  },
  {
    title: 'Shareable annotated links',
    date: '11 May 2026',
    pr: 34,
    body: 'You can publish a session as a link. The link carries the captured page along with every annotation, so anyone who opens it sees the exact annotated view.',
  },
  {
    title: 'Load a page by its URL',
    date: '8 Apr 2026',
    pr: 22,
    body: 'You can point Domnotate at a URL instead of dropping a file. It fetches the page through its own proxy, so pages a browser would block for cross-origin reasons still open.',
  },
  {
    title: 'Toolbar labels and shortcut badges',
    date: '8 Apr 2026',
    pr: 16,
    body: 'The toolbar shows a label and a keyboard shortcut badge for each action, with a floating tab bar for switching between export formats.',
  },
  {
    title: 'Keyboard shortcut hints',
    date: '7 Apr 2026',
    pr: 14,
    body: 'The empty state and the annotation list show the keyboard shortcuts inline, so the common actions are visible without looking them up.',
  },
  {
    title: 'Slide-scoped annotations',
    date: '7 Apr 2026',
    pr: 13,
    body: 'Slide decks get slide-aware annotations. Pins filter to the slide you are viewing, the sidebar groups notes by slide, and the arrow keys move between slides inside the embedded deck.',
  },
  {
    title: 'Copy and export feedback',
    date: '6 Apr 2026',
    pr: 12,
    body: 'Copying and exporting confirm with a toast, and a pin animation flies toward the toolbar when you copy, so each action gives you feedback.',
  },
  {
    title: 'Inline note editing',
    date: '6 Apr 2026',
    pr: 11,
    body: 'Click a pin to read and edit its note in a small popover anchored to the pin, without leaving the page.',
  },
  {
    title: 'Annotation sidebar',
    date: '31 Mar 2026',
    pr: 7,
    body: 'Every note shows up in a running list beside the content, in the parchment theme. Click an entry to jump to its element on the page, and use the single toggle to hide or show all pins at once.',
  },
  {
    title: 'Compact export for AI agents',
    date: '31 Mar 2026',
    pr: 6,
    body: 'A third export format trims the output to what an AI agent needs to act on your feedback, without spending tokens on structure. Markdown and JSON stay available for reading and tooling.',
  },
  {
    title: 'Keyboard shortcuts',
    date: '31 Mar 2026',
    pr: 5,
    body: 'Keyboard shortcuts cover the common actions: starting a pin, deleting the selected note, toggling pins, and copying.',
  },
  {
    title: 'First release',
    date: '30 Mar 2026',
    body: 'Drop an HTML file, click any element to pin a note to it, and export your annotations as Markdown or JSON. Everything runs in the browser.',
  },
];
