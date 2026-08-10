import { describe, it, expect, afterEach, vi } from 'vitest';
import { PICKER_IGNORE_ATTR } from '@/picker/picker';
import {
  bootstrapIsolatedWorld,
  mountDomnotate,
  type DomnotateOverlay,
} from '@/extension/content-isolated';

const live: DomnotateOverlay[] = [];

function mount(): DomnotateOverlay {
  const overlay = mountDomnotate();
  live.push(overlay);
  return overlay;
}

/** The shadow root is closed, so tests reach the UI through the returned handle. */
function query<T extends Element>(overlay: DomnotateOverlay, selector: string): T | null {
  return overlay.root.querySelector<T>(selector);
}

function button(overlay: DomnotateOverlay, label: string): HTMLButtonElement {
  const buttons = [...overlay.root.querySelectorAll<HTMLButtonElement>('.dn-action-btn')];
  const found = buttons.find((b) => b.querySelector('.dn-action-btn__label')?.textContent === label);
  if (!found) throw new Error(`no action button labelled "${label}"`);
  return found;
}

/**
 * What the pointer is currently over. The picker resolves its target through
 * `elementFromPoint`, so this stands in for cursor position.
 *
 * It matters that this goes back to the shadow host after a pick: with the
 * picker now staying armed, a later click on the sidebar's own buttons still
 * reaches the document, and a stub that kept naming a page element would
 * invent annotations no real browser would. Over our UI a closed shadow root
 * retargets to the host, which the picker skips.
 */
let pointerTarget: Element | null = null;

function pick(overlay: DomnotateOverlay, el: Element): void {
  document.elementFromPoint = (() => pointerTarget) as Document['elementFromPoint'];
  pointerTarget = el;
  // Armed on mount now, so only press Annotate if something disarmed it.
  if (!isArmed(overlay)) button(overlay, 'Annotate').click();
  document.dispatchEvent(
    new MouseEvent('click', { clientX: 5, clientY: 5, bubbles: true, cancelable: true }),
  );
  pointerTarget = document.querySelector('[data-domnotate-root]');
}

function isArmed(overlay: DomnotateOverlay): boolean {
  return button(overlay, 'Annotate').classList.contains('dn-action-btn--active');
}

afterEach(() => {
  pointerTarget = null;
  while (live.length) live.pop()!.unmount();
  document.body.replaceChildren();
  delete (window as unknown as Record<string, unknown>).__domnotateOverlay;
  // Notes deliberately outlive a close, so each test has to start clean.
  delete (window as unknown as Record<string, unknown>).__domnotateStash;
  vi.restoreAllMocks();
});

describe('mounting', () => {
  it('does not mount itself on import', () => {
    expect(document.querySelector('[data-domnotate-root]')).toBeNull();
  });

  it('attaches a closed shadow root to the body', () => {
    const overlay = mount();
    const hostEl = document.querySelector('[data-domnotate-root]');

    expect(hostEl).not.toBeNull();
    expect(hostEl?.parentElement).toBe(document.body);
    // Closed means the page cannot reach in through the element.
    expect(hostEl?.shadowRoot).toBeNull();
    expect(overlay.root.host).toBe(hostEl);
  });

  it('hides its own UI from the picker', () => {
    mount();
    expect(document.querySelector(`[${PICKER_IGNORE_ATTR}]`)).not.toBeNull();
  });

  it('pins the host element against host page CSS', () => {
    mount();
    const hostEl = document.querySelector('[data-domnotate-root]') as HTMLElement;
    const style = hostEl.getAttribute('style') ?? '';

    // `all: initial` is what stops inherited page styles crossing the boundary.
    expect(style).toContain('all: initial');
    for (const declaration of ['position: fixed', 'z-index: 2147483647', 'pointer-events: none']) {
      expect(style).toContain(declaration);
    }
    expect(hostEl.style.getPropertyPriority('all')).toBe('important');
    expect(hostEl.style.getPropertyPriority('z-index')).toBe('important');
  });

  it('carries its stylesheet inside the shadow root, not the page', () => {
    const overlay = mount();
    expect(overlay.root.querySelector('style')).not.toBeNull();
    expect(document.head.querySelector('style[data-domnotate]')).toBeNull();
  });

  it('renders the sidebar and an overlay layer for the picker', () => {
    const overlay = mount();
    expect(query(overlay, '.dn-sidebar')).not.toBeNull();
    expect(query(overlay, '.dn-ext-overlay')).not.toBeNull();
    expect(query(overlay, '.dn-highlight-box')).not.toBeNull();
  });

  it('starts on an empty state', () => {
    const overlay = mount();
    expect(query(overlay, '.dn-empty-state')).not.toBeNull();
    expect(query(overlay, '.dn-note-row')).toBeNull();
  });

  it('leaves nothing behind on unmount', () => {
    const overlay = mount();
    overlay.unmount();
    expect(document.querySelector('[data-domnotate-root]')).toBeNull();
    expect(document.documentElement.style.cursor).toBe('');
  });
});

describe('picking and note taking', () => {
  it('adds a note row for the picked element and focuses it', () => {
    const overlay = mount();
    const target = document.createElement('button');
    target.id = 'save-btn';
    target.textContent = 'Save';
    document.body.appendChild(target);

    pick(overlay, target);

    const rows = overlay.root.querySelectorAll('.dn-note-row');
    expect(rows).toHaveLength(1);
    expect(query(overlay, '.dn-note-pin')?.textContent).toBe('1');
    expect(query(overlay, '.dn-empty-state')).toBeNull();
  });

  it('arms itself on mount, so the first click already annotates', () => {
    const overlay = mount();
    expect(isArmed(overlay)).toBe(true);
    expect(document.documentElement.style.cursor).toBe('crosshair');
  });

  it('stays armed after a pick, so the next element needs no keystroke', () => {
    const overlay = mount();
    const a = document.createElement('div');
    const b = document.createElement('span');
    document.body.append(a, b);

    pick(overlay, a);
    expect(isArmed(overlay)).toBe(true);

    // Straight into the next one — no `a` in between.
    pointerTarget = b;
    document.dispatchEvent(
      new MouseEvent('click', { clientX: 5, clientY: 5, bubbles: true, cancelable: true }),
    );

    expect(overlay.root.querySelectorAll('.dn-note-row')).toHaveLength(2);
  });

  it('Escape closes and hands the whole page back', () => {
    mount();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(document.querySelector('[data-domnotate-root]')).toBeNull();
    expect(document.documentElement.style.cursor).toBe('');
    expect(document.documentElement.style.getPropertyValue('margin-right')).toBe('');
  });

  it('writes the typed note into the exported markdown', () => {
    const overlay = mount();
    const target = document.createElement('button');
    target.id = 'save-btn';
    document.body.appendChild(target);

    pick(overlay, target);

    const input = query<HTMLTextAreaElement>(overlay, '.dn-ext-note-input')!;
    input.value = 'this should be right-aligned';
    input.dispatchEvent(new Event('input'));

    const markdown = overlay.toMarkdown();
    expect(markdown).toContain('# Domnotate Annotations');
    expect(markdown).toContain('#save-btn');
    expect(markdown).toContain('> this should be right-aligned');
    expect(markdown).toContain(window.location.href);
  });

  it('deletes a note from its row', () => {
    const overlay = mount();
    const target = document.createElement('div');
    document.body.appendChild(target);
    pick(overlay, target);

    query<HTMLButtonElement>(overlay, '.dn-note-delete')!.click();

    expect(overlay.root.querySelectorAll('.dn-note-row')).toHaveLength(0);
    expect(query(overlay, '.dn-empty-state')).not.toBeNull();
  });

  it('clears every note', () => {
    const overlay = mount();
    const a = document.createElement('div');
    const b = document.createElement('span');
    document.body.append(a, b);
    pick(overlay, a);
    pick(overlay, b);
    expect(overlay.root.querySelectorAll('.dn-note-row')).toHaveLength(2);

    button(overlay, 'Clear').click();

    expect(overlay.root.querySelectorAll('.dn-note-row')).toHaveLength(0);
  });

  it('gives Escape back to the app once closed', () => {
    const overlay = mount();
    overlay.unmount();

    const event = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });
});

describe('source hint handoff', () => {
  it('asks the MAIN world about the picked element and puts the answer in the export', async () => {
    const overlay = mount();
    const target = document.createElement('button');
    document.body.appendChild(target);

    const onMessage = (event: MessageEvent): void => {
      const data = event.data as { channel?: string; kind?: string; nonce?: string };
      if (data?.channel !== 'domnotate:source-hint' || data.kind !== 'request') return;
      window.postMessage(
        {
          channel: 'domnotate:source-hint',
          kind: 'response',
          nonce: data.nonce,
          hint: {
            signals: [{ kind: 'literal-text', text: 'Sentiment breakdown', truncated: false }],
            confidence: 'weak',
            provider: 'dom',
          },
        },
        window.location.origin,
      );
    };
    window.addEventListener('message', onMessage);

    pick(overlay, target);

    // The hint is only useful if it reaches the clipboard, so assert on the
    // export rather than on an internal collection.
    await vi.waitFor(() => expect(overlay.toMarkdown()).toContain('Sentiment breakdown'));
    expect(overlay.toMarkdown()).toContain('[weak]');

    window.removeEventListener('message', onMessage);
  });
});

describe('bootstrapIsolatedWorld', () => {
  it('toggles: a second injection tears the first one down', () => {
    const first = bootstrapIsolatedWorld(window);
    expect(first).not.toBeNull();
    expect(document.querySelector('[data-domnotate-root]')).not.toBeNull();

    expect(bootstrapIsolatedWorld(window)).toBeNull();
    expect(document.querySelector('[data-domnotate-root]')).toBeNull();

    expect(bootstrapIsolatedWorld(window)).not.toBeNull();
    expect(document.querySelector('[data-domnotate-root]')).not.toBeNull();
    (window as unknown as Record<string, DomnotateOverlay>).__domnotateOverlay?.unmount();
  });
});

describe('host page keyboard shortcuts', () => {
  /** Stand-in for an app that binds single-key shortcuts on the document. */
  function spyHostShortcut(target: Document | Window, capture = false) {
    const fired = vi.fn();
    target.addEventListener('keydown', fired as EventListener, capture);
    return {
      fired,
      remove: () => target.removeEventListener('keydown', fired as EventListener, capture),
    };
  }

  function typeInto(el: Element, key: string): void {
    el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, composed: true }));
  }

  it('does not leak a keystroke typed in a note to the host page', () => {
    const overlay = mount();
    const target = document.createElement('div');
    document.body.appendChild(target);
    pick(overlay, target);

    const host = spyHostShortcut(document);
    const note = query<HTMLTextAreaElement>(overlay, '.dn-ext-note-input');
    expect(note).not.toBeNull();

    // Regression: "t" is a global shortcut on dashboard.enterpret.com, so every
    // "t" in a note opened a modal.
    typeInto(note!, 't');

    expect(host.fired).not.toHaveBeenCalled();
    host.remove();
  });

  it('also beats a host handler bound in the capture phase', () => {
    const overlay = mount();
    const target = document.createElement('div');
    document.body.appendChild(target);
    pick(overlay, target);

    const host = spyHostShortcut(document, true);
    typeInto(query<HTMLTextAreaElement>(overlay, '.dn-ext-note-input')!, 't');

    expect(host.fired).not.toHaveBeenCalled();
    host.remove();
  });

  /**
   * Stand-in for MUI's `FocusTrap`, which is the reason notes could not be
   * typed inside a Dialog or Drawer. It registers a bubble-phase `focusin`
   * listener on the document and drags focus back whenever the active element
   * is outside the trap. See the `swallowFocus` comment for why our closed
   * shadow root always looks "outside".
   */
  function spyFocusTrap() {
    const contain = vi.fn();
    document.addEventListener('focusin', contain as EventListener);
    return {
      contain,
      remove: () => document.removeEventListener('focusin', contain as EventListener),
    };
  }

  it('does not let a host focus trap see focus entering a note', () => {
    const overlay = mount();
    const target = document.createElement('div');
    document.body.appendChild(target);
    pick(overlay, target);

    const trap = spyFocusTrap();
    const note = query<HTMLTextAreaElement>(overlay, '.dn-ext-note-input');
    expect(note).not.toBeNull();

    // Regression: annotations 8-10 of the Phase 2 capture picked correctly
    // inside a dialog but could not be typed into, because MUI's FocusTrap
    // pulled focus back to the dialog the instant the note received it.
    note!.dispatchEvent(new FocusEvent('focusin', { bubbles: true, composed: true }));

    expect(trap.contain).not.toHaveBeenCalled();
    trap.remove();
  });

  it('leaves the host page focus changes alone', () => {
    mount();
    const trap = spyFocusTrap();

    // A focus trap still has to work for the page's own fields.
    const field = document.createElement('input');
    document.body.appendChild(field);
    field.dispatchEvent(new FocusEvent('focusin', { bubbles: true, composed: true }));

    expect(trap.contain).toHaveBeenCalledTimes(1);
    trap.remove();
  });

  it('stops swallowing focus once unmounted', () => {
    const overlay = mount();
    const target = document.createElement('div');
    document.body.appendChild(target);
    pick(overlay, target);
    const note = query<HTMLTextAreaElement>(overlay, '.dn-ext-note-input');
    const hostEl = document.querySelector('[data-domnotate-root]') as HTMLElement;

    overlay.unmount();
    // `unmount` detaches the host, and a detached node's events never reach the
    // document at all. Re-attaching is what makes this a test of the guard
    // rather than of DOM propagation.
    document.body.appendChild(hostEl);

    const trap = spyFocusTrap();
    note!.dispatchEvent(new FocusEvent('focusin', { bubbles: true, composed: true }));

    expect(trap.contain).toHaveBeenCalledTimes(1);
    trap.remove();
    hostEl.remove();
  });

  it('leaves the host page keystrokes alone', () => {
    mount();
    const host = spyHostShortcut(document);

    // Typing on the page itself, outside our UI, must still reach the app.
    typeInto(document.body, 't');

    expect(host.fired).toHaveBeenCalledTimes(1);
    host.remove();
  });

  it('stops swallowing once unmounted', () => {
    const overlay = mount();
    const host = spyHostShortcut(document);
    overlay.unmount();

    typeInto(document.body, 't');

    expect(host.fired).toHaveBeenCalledTimes(1);
    host.remove();
  });
});

describe('docking the page', () => {
  it('insets the page so nothing sits under the sidebar', () => {
    mount();
    // Overlaying hid elements, which meant they could not be annotated at all.
    expect(document.documentElement.style.getPropertyValue('margin-right')).toBe('360px');
    expect(document.documentElement.style.getPropertyPriority('margin-right')).toBe('important');
  });

  it('tells the app to re-measure, on the way in and out', () => {
    const onResize = vi.fn();
    window.addEventListener('resize', onResize);
    const overlay = mount();
    expect(onResize).toHaveBeenCalledTimes(1);

    overlay.unmount();
    expect(onResize).toHaveBeenCalledTimes(2);
    window.removeEventListener('resize', onResize);
  });

  it('leaves no inset behind on unmount', () => {
    const overlay = mount();
    overlay.unmount();
    expect(document.documentElement.style.getPropertyValue('margin-right')).toBe('');
    expect(document.documentElement.getAttribute('style') ?? '').not.toContain('margin-right');
  });

  it('restores a margin the page had set itself', () => {
    document.documentElement.style.setProperty('margin-right', '12px');
    const overlay = mount();
    expect(document.documentElement.style.getPropertyValue('margin-right')).toBe('360px');

    overlay.unmount();
    expect(document.documentElement.style.getPropertyValue('margin-right')).toBe('12px');
    document.documentElement.style.removeProperty('margin-right');
  });
});

describe('shortcuts while active', () => {
  it('toggles annotate mode on "a" without the host app seeing the key', () => {
    const overlay = mount();
    const hostShortcut = vi.fn();
    document.addEventListener('keydown', hostShortcut as EventListener);
    const pressA = () =>
      document.body.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'a', bubbles: true, composed: true, cancelable: true }),
      );

    // Armed on mount, so the first press turns it off.
    pressA();
    expect(isArmed(overlay)).toBe(false);
    expect(document.documentElement.style.cursor).toBe('');

    pressA();
    expect(isArmed(overlay)).toBe(true);
    expect(document.documentElement.style.cursor).toBe('crosshair');

    expect(hostShortcut).not.toHaveBeenCalled();
    document.removeEventListener('keydown', hostShortcut as EventListener);
  });

  it('gives every key back once unmounted', () => {
    const overlay = mount();
    overlay.unmount();
    const hostShortcut = vi.fn();
    document.addEventListener('keydown', hostShortcut as EventListener);

    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));

    expect(hostShortcut).toHaveBeenCalledTimes(1);
    document.removeEventListener('keydown', hostShortcut as EventListener);
  });
});

describe('sidebar parity with the web client', () => {
  it('badges the actions with their shortcut keys', () => {
    const overlay = mount();

    const badge = (label: string) =>
      button(overlay, label).querySelector('.dn-action-btn__shortcut')?.textContent ?? null;

    expect(badge('Annotate')).toBe('A');
    expect(badge('Copy')).toBe('C');
    // Actions with no shortcut get no badge rather than an empty one.
    expect(badge('Clear')).toBeNull();
    expect(badge('Close')).toBeNull();
  });

  it('uses a kbd element, so it inherits the web client styling', () => {
    const overlay = mount();
    const badge = button(overlay, 'Annotate').querySelector('.dn-action-btn__shortcut');
    expect(badge?.tagName).toBe('KBD');
  });

  it('names the shortcut in the accessible label too', () => {
    const overlay = mount();
    expect(button(overlay, 'Annotate').getAttribute('aria-label')).toContain('(A)');
  });
});

describe('committing a note from the keyboard', () => {
  function noteInput(overlay: DomnotateOverlay): HTMLTextAreaElement {
    const input = query<HTMLTextAreaElement>(overlay, '.dn-ext-note-input');
    if (!input) throw new Error('no note input');
    return input;
  }

  function typeInNote(input: HTMLTextAreaElement, value: string): void {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  /**
   * A real keystroke starts at the field and is caught on its way out by the
   * window-capture guard, so it has to be dispatched from there.
   */
  function pressEnter(input: HTMLTextAreaElement, init: KeyboardEventInit = {}): KeyboardEvent {
    const event = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      composed: true,
      cancelable: true,
      ...init,
    });
    input.dispatchEvent(event);
    return event;
  }

  function setup() {
    const overlay = mount();
    const target = document.createElement('button');
    document.body.appendChild(target);
    pick(overlay, target);
    const input = noteInput(overlay);
    input.focus();
    return { overlay, input };
  }

  it('commits on Enter and hands the keyboard back to the page', () => {
    const { overlay, input } = setup();
    typeInNote(input, 'move this right');

    const event = pressEnter(input);

    expect(event.defaultPrevented).toBe(true);
    expect(input.value).not.toContain('\n');
    expect(overlay.root.activeElement).not.toBe(input);
    expect(overlay.toMarkdown()).toContain('move this right');
  });

  it('inserts a newline on Cmd+Enter, at the caret', () => {
    const { input } = setup();
    typeInNote(input, 'oneTWO');
    input.setSelectionRange(3, 3);

    pressEnter(input, { metaKey: true });

    expect(input.value).toBe('one\nTWO');
    expect(input.selectionStart).toBe(4);
  });

  it('does the same on Ctrl+Enter', () => {
    const { input } = setup();
    typeInNote(input, 'one');
    input.setSelectionRange(3, 3);

    pressEnter(input, { ctrlKey: true });

    expect(input.value).toBe('one\n');
  });

  it('persists a Cmd+Enter newline into the export', () => {
    const { overlay, input } = setup();
    typeInNote(input, 'first');
    input.setSelectionRange(5, 5);

    pressEnter(input, { metaKey: true });
    typeInNote(input, `${input.value}second`);

    expect(overlay.toMarkdown()).toContain('first\nsecond');
  });

  it('replaces the selection rather than appending to it', () => {
    const { input } = setup();
    typeInNote(input, 'keepDROPend');
    input.setSelectionRange(4, 8);

    pressEnter(input, { metaKey: true });

    expect(input.value).toBe('keep\nend');
  });

  it('leaves Shift+Enter to the browser, which inserts a newline', () => {
    const { input } = setup();
    typeInNote(input, 'one');

    const event = pressEnter(input, { shiftKey: true });

    // Not ours: no preventDefault, so the default newline still happens.
    expect(event.defaultPrevented).toBe(false);
  });

  it('ignores Enter when the note is not focused', () => {
    const { overlay, input } = setup();
    input.blur();

    const event = pressEnter(input);

    expect(event.defaultPrevented).toBe(false);
    expect(overlay.root.activeElement).not.toBe(input);
  });
});

describe('closing with Escape', () => {
  function annotate(overlay: DomnotateOverlay, note: string): void {
    const target = document.createElement('button');
    document.body.appendChild(target);
    pick(overlay, target);
    const input = query<HTMLTextAreaElement>(overlay, '.dn-ext-note-input')!;
    input.value = note;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function pressEscape(from: EventTarget = document): KeyboardEvent {
    const event = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      composed: true,
      cancelable: true,
    });
    from.dispatchEvent(event);
    return event;
  }

  it('brings the notes back when reopened, so closing is not destructive', () => {
    const first = mount();
    annotate(first, 'align this');
    // The note has focus after a pick, so the first Escape only lets go of it.
    pressEscape(query<HTMLTextAreaElement>(first, '.dn-ext-note-input')!);
    pressEscape();
    expect(document.querySelector('[data-domnotate-root]')).toBeNull();

    // Escape is a reflex; it must not be how an afternoon's notes disappear.
    const second = mount();
    expect(second.root.querySelectorAll('.dn-note-row')).toHaveLength(1);
    expect(second.toMarkdown()).toContain('align this');
  });

  it('commits and blurs the note first, rather than closing mid-sentence', () => {
    const overlay = mount();
    annotate(overlay, 'half a thought');
    const input = query<HTMLTextAreaElement>(overlay, '.dn-ext-note-input')!;
    input.focus();

    const event = pressEscape(input);

    expect(event.defaultPrevented).toBe(true);
    expect(document.querySelector('[data-domnotate-root]')).not.toBeNull();
    expect(overlay.root.activeElement).not.toBe(input);
    expect(overlay.toMarkdown()).toContain('half a thought');
  });

  it('closes on the second Escape, once the note has been let go', () => {
    const overlay = mount();
    annotate(overlay, 'note');
    const input = query<HTMLTextAreaElement>(overlay, '.dn-ext-note-input')!;
    input.focus();

    pressEscape(input);
    pressEscape();

    expect(document.querySelector('[data-domnotate-root]')).toBeNull();
  });

  it('keeps nothing on the page when there was nothing to keep', () => {
    const overlay = mount();
    overlay.unmount();
    expect(
      (window as unknown as Record<string, unknown>).__domnotateStash,
    ).toBeUndefined();
  });

  it('restores into a session that can still be added to', () => {
    const first = mount();
    annotate(first, 'one');
    first.unmount();

    const second = mount();
    annotate(second, 'two');

    expect(second.root.querySelectorAll('.dn-note-row')).toHaveLength(2);
  });
});
