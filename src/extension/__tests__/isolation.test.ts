// ============================================================
// Domnotate — host page isolation
// ============================================================
//
// Phase 1's two style rows were written as "load it and look", which is why
// they sat unverified for two days. These are the parts that do not need a
// browser, expressed as invariants:
//
//   bleed out — the page is restored *exactly* on unmount. Note that this is
//               not "the page is unchanged while we run": docking deliberately
//               insets the root, because anything under the sidebar could not
//               be annotated at all. Restoration is the testable property.
//   bleed in  — nothing of ours is reachable from, or inherited out of, the
//               host document.
//
// The hostile-page rendering checks (RTL, `!important` resets, transformed
// roots, z-index competitors) live in `fixtures/hostile.html` and are recorded
// in the plan's findings log by hand.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { mountDomnotate, type DomnotateOverlay } from '@/extension/content-isolated';
import { HINT_TARGET_ATTR } from '@/extension/hint-protocol';
import themeCss from '@/styles/theme.css?inline';
import sidebarCss from '@/sidebar/sidebar.css?inline';

const live: DomnotateOverlay[] = [];

function mount(): DomnotateOverlay {
  const overlay = mountDomnotate();
  live.push(overlay);
  return overlay;
}

function hostElement(): HTMLElement {
  const el = document.querySelector<HTMLElement>('[data-domnotate-root]');
  if (!el) throw new Error('no shadow host on the page');
  return el;
}

/** Everything about the page a host author could notice, in one string. */
function pageSnapshot(): string {
  return document.documentElement.outerHTML;
}

function seedPage(): void {
  document.body.replaceChildren();
  document.body.innerHTML = `
    <main>
      <h1>Records</h1>
      <button id="save" data-testid="save-btn">Save changes</button>
    </main>
  `;
}

function pickAndNote(overlay: DomnotateOverlay, el: Element, note: string): void {
  document.elementFromPoint = (() => el) as Document['elementFromPoint'];
  document.dispatchEvent(
    new MouseEvent('click', { clientX: 5, clientY: 5, bubbles: true, cancelable: true }),
  );
  const input = overlay.root.querySelector<HTMLTextAreaElement>('.dn-ext-note-input');
  if (input) {
    input.value = note;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    );
  }
  document.elementFromPoint = (() => hostElement()) as Document['elementFromPoint'];
}

afterEach(() => {
  while (live.length) live.pop()!.unmount();
  document.body.replaceChildren();
  document.documentElement.removeAttribute('style');
  document.documentElement.removeAttribute('dir');
  delete (window as unknown as Record<string, unknown>).__domnotateOverlay;
  vi.useRealTimers();
});

describe('bleed out — the page is restored exactly', () => {
  it('leaves no trace after mount and unmount', () => {
    seedPage();
    const before = pageSnapshot();

    const overlay = mount();
    expect(pageSnapshot()).not.toBe(before); // sanity: it really did mount
    overlay.unmount();
    live.length = 0;

    expect(pageSnapshot()).toBe(before);
  });

  it('leaves no trace after a full annotate cycle', () => {
    seedPage();
    const before = pageSnapshot();

    const overlay = mount();
    pickAndNote(overlay, document.querySelector('#save')!, 'this button is too small');
    expect(overlay.toMarkdown()).toContain('this button is too small');
    overlay.unmount();
    live.length = 0;

    // Includes the handoff nonce: `data-dn-target` is written to a host element
    // on every pick, and a pending request must not outlive the overlay.
    expect(document.querySelector(`[${HINT_TARGET_ATTR}]`)).toBeNull();
    expect(pageSnapshot()).toBe(before);
  });

  it("restores the host's own margin-right, priority included", () => {
    seedPage();
    document.documentElement.style.setProperty('margin-right', '40px', 'important');
    const before = pageSnapshot();

    const overlay = mount();
    expect(document.documentElement.style.getPropertyValue('margin-right')).not.toBe('40px');
    overlay.unmount();
    live.length = 0;

    expect(document.documentElement.style.getPropertyValue('margin-right')).toBe('40px');
    expect(document.documentElement.style.getPropertyPriority('margin-right')).toBe('important');
    expect(pageSnapshot()).toBe(before);
  });

  it('does not strand a nonce when unmounted before the hint resolves', () => {
    vi.useFakeTimers();
    seedPage();
    const overlay = mount();
    const target = document.querySelector('#save')!;

    pickAndNote(overlay, target, 'note');
    // MAIN world never answers here, so the request is still in flight.
    overlay.unmount();
    live.length = 0;

    expect(target.hasAttribute(HINT_TARGET_ATTR)).toBe(false);
    vi.runAllTimers();
    expect(target.hasAttribute(HINT_TARGET_ATTR)).toBe(false);
  });
});

describe('bleed out — nothing of ours is global', () => {
  it('adds no stylesheet to the document', () => {
    seedPage();
    const headBefore = document.head.innerHTML;
    const overlay = mount();

    expect(document.head.innerHTML).toBe(headBefore);
    expect(document.querySelectorAll('style, link[rel="stylesheet"]')).toHaveLength(0);
    // Ours lives in the shadow root, where it cannot select a host element.
    expect(overlay.root.querySelectorAll('style').length).toBeGreaterThan(0);
  });

  it('heads every theme block with :host as well as :root', () => {
    // `theme.css` is one file serving two homes: the web app loads it into the
    // document, where `:root` applies, and we inject it into a shadow root,
    // where `:root` matches no element and only `:host` does. A block headed by
    // `:root` alone leaves the extension without that custom property.
    const withoutComments = themeCss.replace(/\/\*[\s\S]*?\*\//g, '');
    const rootOnly = (withoutComments.match(/[^{}]+(?=\{)/g) ?? [])
      .map((prelude) => prelude.trim())
      .filter((prelude) => prelude.includes(':root') && !prelude.includes(':host'));

    expect(rootOnly).toEqual([]);

    // And nothing writes `--dn-*` onto the host page's root at runtime, where
    // the page's own `var()` lookups would inherit it.
    seedPage();
    mount();
    expect(document.documentElement.getAttribute('style') ?? '').not.toContain('--dn-');
  });

  it('does not touch the host page classes or attributes', () => {
    seedPage();
    document.body.className = 'app dark';
    const overlay = mount();

    expect(document.body.className).toBe('app dark');
    expect(document.querySelector('#save')!.getAttribute('class')).toBeNull();
    overlay.unmount();
    live.length = 0;
    expect(document.body.className).toBe('app dark');
  });
});

describe('the top layer — a modal dialog outranks every z-index', () => {
  /**
   * happy-dom has no popover API at all, so the feature has to be stubbed to be
   * observed. This is a system boundary, not an internal module: the real
   * behaviour under test — that a promoted element escapes a modal dialog's
   * inertness — is the browser's, and only the browser can confirm it. What is
   * asserted here is that we ask, that we ask again when outranked, and that we
   * degrade rather than vanish where the API is missing.
   */
  function stubPopoverApi(): { shows: number; hides: number } {
    const counts = { shows: 0, hides: 0 };
    const proto = window.HTMLElement.prototype as unknown as Record<string, unknown>;
    proto.showPopover = function showPopover(this: HTMLElement) {
      if (!this.hasAttribute('popover')) throw new Error('not a popover');
      counts.shows += 1;
      this.dispatchEvent(new Event('toggle'));
    };
    proto.hidePopover = function hidePopover() {
      counts.hides += 1;
    };
    return counts;
  }

  function removePopoverApi(): void {
    const proto = window.HTMLElement.prototype as unknown as Record<string, unknown>;
    delete proto.showPopover;
    delete proto.hidePopover;
  }

  afterEach(removePopoverApi);

  it('joins the top layer as a manual popover', () => {
    const counts = stubPopoverApi();
    seedPage();
    mount();

    // `manual`, not `auto`: an auto popover light-dismisses on Escape and on
    // any outside click, and both of those belong to the annotation loop.
    expect(hostElement().getAttribute('popover')).toBe('manual');
    expect(counts.shows).toBe(1);
  });

  it('climbs back when a host page dialog opens above it', () => {
    // Top layer order is insertion order, so a dialog opened after us lands on
    // top and takes the inertness with it.
    const counts = stubPopoverApi();
    seedPage();
    mount();

    const dialog = document.createElement('dialog');
    document.body.appendChild(dialog);
    dialog.dispatchEvent(new Event('toggle'));

    expect(counts.shows).toBe(2);
    expect(counts.hides).toBe(1);
  });

  it('climbs back on showModal() without a toggle event', async () => {
    // `<dialog>` only started firing toggle events in Chrome 129, and the
    // popover API predates that — so on an older Chrome a modal would outrank
    // us silently. `showModal()` always sets `open`, which an attribute
    // observer catches everywhere.
    const counts = stubPopoverApi();
    seedPage();
    mount();
    const before = counts.shows;

    const dialog = document.createElement('dialog');
    document.body.appendChild(dialog);
    dialog.setAttribute('open', '');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(counts.shows).toBe(before + 1);
  });

  it('climbs back before focusing a new note', () => {
    // The symptom this fix chases: the pin lands, and the note cannot be typed
    // because `focus()` on an inert element fails silently.
    const counts = stubPopoverApi();
    seedPage();
    const overlay = mount();
    const before = counts.shows;

    pickAndNote(overlay, document.querySelector('#save')!, 'a note');

    expect(counts.shows).toBeGreaterThan(before);
    expect(overlay.toMarkdown()).toContain('a note');
  });

  it('does not answer its own toggle event', () => {
    const counts = stubPopoverApi();
    seedPage();
    mount();
    const before = counts.shows;

    hostElement().dispatchEvent(new Event('toggle'));

    expect(counts.shows).toBe(before);
  });

  it('stops climbing once unmounted', () => {
    const counts = stubPopoverApi();
    seedPage();
    const overlay = mount();
    overlay.unmount();
    live.length = 0;
    const before = counts.shows;

    const dialog = document.createElement('dialog');
    document.body.appendChild(dialog);
    dialog.dispatchEvent(new Event('toggle'));

    expect(counts.shows).toBe(before);
  });

  it('renders normally where the popover API does not exist', () => {
    // Pre-Chrome-114, and every test in this file above this one. A `popover`
    // attribute left on an element that will not show is worse than none: the
    // UA stylesheet hides it outright.
    seedPage();
    mount();

    expect(hostElement().hasAttribute('popover')).toBe(false);
    expect(hostElement().isConnected).toBe(true);
  });

  it('drops the attribute when showing throws', () => {
    const proto = window.HTMLElement.prototype as unknown as Record<string, unknown>;
    proto.showPopover = () => {
      throw new Error('nope');
    };
    proto.hidePopover = () => {};
    seedPage();
    mount();

    expect(hostElement().hasAttribute('popover')).toBe(false);
  });
});

describe('inertness — a modal dialog blocks everything outside its subtree', () => {
  /**
   * happy-dom does not know the `:modal` pseudo-class, so it is stubbed. This is
   * a DOM API absent from the test environment, not an internal module: the
   * behaviour under test is where we put the host given a modal exists, and the
   * browser is the only thing that can confirm inertness itself.
   */
  function withModal(dialog: Element | null): void {
    const real = document.querySelectorAll.bind(document);
    vi.spyOn(document, 'querySelectorAll').mockImplementation(((selector: string) =>
      selector === ':modal'
        ? ((dialog ? [dialog] : []) as unknown as NodeListOf<Element>)
        : real(selector)) as typeof document.querySelectorAll);
  }

  function openDialog(): HTMLElement {
    const dialog = document.createElement('dialog');
    document.body.appendChild(dialog);
    dialog.setAttribute('open', '');
    return dialog;
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('moves inside the dialog, the one place inertness does not reach', async () => {
    // Measured in Chrome 11 Aug: a manual popover shown *after* the dialog is
    // `:popover-open` and still cannot take focus. Top layer order buys paint
    // order only, so the host has to be a descendant of the dialog.
    seedPage();
    mount();
    const dialog = openDialog();
    withModal(dialog);

    dialog.setAttribute('open', 'still-open');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(hostElement().parentElement).toBe(dialog);
  });

  it('moves back out when the dialog closes', async () => {
    seedPage();
    mount();
    const dialog = openDialog();
    withModal(dialog);
    dialog.setAttribute('open', 'still-open');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(hostElement().parentElement).toBe(dialog);

    withModal(null);
    dialog.removeAttribute('open');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(hostElement().parentElement).toBe(document.documentElement);
  });

  it('survives the page tearing the dialog down underneath it', async () => {
    // A React dialog that unmounts would otherwise take the whole sidebar with
    // it — annotations included — because our host is inside a node the page
    // owns and can delete at will.
    seedPage();
    const overlay = mount();
    const dialog = openDialog();
    withModal(dialog);
    dialog.setAttribute('open', 'still-open');
    await new Promise((resolve) => setTimeout(resolve, 0));

    withModal(null);
    dialog.remove();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(hostElement().parentElement).toBe(document.documentElement);
    expect(overlay.root.querySelector('.dn-sidebar')).not.toBeNull();
  });

  it('restores the dialog exactly when unmounted from inside it', async () => {
    seedPage();
    const overlay = mount();
    const dialog = openDialog();
    withModal(dialog);
    dialog.setAttribute('open', 'still-open');
    await new Promise((resolve) => setTimeout(resolve, 0));

    overlay.unmount();
    live.length = 0;

    expect(dialog.children).toHaveLength(0);
    expect(document.querySelector('[data-domnotate-root]')).toBeNull();
  });

  it('stays put when no modal is open', () => {
    seedPage();
    mount();
    withModal(null);
    openDialog();

    expect(hostElement().parentElement).toBe(document.documentElement);
  });
});

describe('bleed in — the host page cannot reach our UI', () => {
  it('resets every inherited property on the shadow host', () => {
    seedPage();
    mount();
    const style = hostElement().getAttribute('style') ?? '';

    expect(style).toContain('all: initial');
    // `all` does not reset these two — the spec carve-out. Without them an
    // RTL host page mirrors the sidebar.
    expect(style).toContain('direction: ltr');
    expect(style).toContain('unicode-bidi: isolate');
  });

  it('sets the reset !important, so no host rule can outrank it', () => {
    seedPage();
    mount();
    const el = hostElement();

    for (const prop of ['all', 'direction', 'unicode-bidi', 'position', 'z-index']) {
      expect(el.style.getPropertyPriority(prop)).toBe('important');
    }
  });

  it('sizes nothing in rem', () => {
    // `rem` inside a shadow root resolves against the *document* root, not
    // `:host`, so a host page with `html { font-size: 62.5% }` would shrink the
    // whole UI. px and em are safe; rem is the one unit that leaks.
    for (const css of [themeCss, sidebarCss]) {
      // Both imports come back empty unless `test.css` is on, and an empty
      // string satisfies the match below without guarding anything.
      expect(css).not.toBe('');
      expect(css.match(/[\d.]+rem\b/g)).toBeNull();
    }
  });

  it('mounts outside body, so a transformed body cannot contain it', () => {
    // Regression, `fixtures/hostile.html` 11 Aug: `body { transform:
    // translateZ(0) }` made body the containing block for our `position: fixed`
    // host, and the sidebar rendered inside the docked page — short of the
    // right edge by its own width, and not full height.
    seedPage();
    mount();

    expect(hostElement().parentElement).toBe(document.documentElement);
    expect(document.body.contains(hostElement())).toBe(false);
  });

  it('renders the same regardless of the host page direction', () => {
    seedPage();
    document.documentElement.setAttribute('dir', 'rtl');
    mount();

    expect(hostElement().style.getPropertyValue('direction')).toBe('ltr');
  });
});
