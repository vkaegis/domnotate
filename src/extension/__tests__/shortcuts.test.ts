import { describe, it, expect, afterEach, vi } from 'vitest';

import { installExtensionShortcuts } from '@/extension/shortcuts';

const teardown: Array<() => void> = [];

afterEach(() => {
  while (teardown.length) teardown.pop()!();
  document.body.replaceChildren();
});

function setup(action = vi.fn()) {
  const hostEl = document.createElement('div');
  document.body.appendChild(hostEl);
  teardown.push(
    installExtensionShortcuts({
      hostEl,
      shortcuts: [{ key: 'a', label: 'Toggle annotate mode', action }],
    }),
  );
  return { hostEl, action };
}

/** A host app binding single-key shortcuts on the document, as Enterpret does. */
function spyHostShortcut(capture = false) {
  const fired = vi.fn();
  document.addEventListener('keydown', fired as EventListener, capture);
  teardown.push(() => document.removeEventListener('keydown', fired as EventListener, capture));
  return fired;
}

function press(target: EventTarget, key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    composed: true,
    cancelable: true,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
}

describe('extension shortcuts on a live page', () => {
  it('runs our action and takes the key away from the host app', () => {
    const { action } = setup();
    const hostShortcut = spyHostShortcut();

    const event = press(document.body, 'a');

    expect(action).toHaveBeenCalledTimes(1);
    expect(hostShortcut).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
  });

  it('beats a host handler bound in the capture phase', () => {
    const { action } = setup();
    const hostShortcut = spyHostShortcut(true);

    press(document.body, 'a');

    expect(action).toHaveBeenCalledTimes(1);
    expect(hostShortcut).not.toHaveBeenCalled();
  });

  it('leaves keys we do not claim entirely alone', () => {
    const { action } = setup();
    const hostShortcut = spyHostShortcut();

    // "t" opens a modal on the host app and is not ours.
    const event = press(document.body, 't');

    expect(action).not.toHaveBeenCalled();
    expect(hostShortcut).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(false);
  });

  it('does not steal a key while the user types in the host app', () => {
    const { action } = setup();
    const input = document.createElement('input');
    document.body.appendChild(input);
    const hostShortcut = spyHostShortcut();

    press(input, 'a');

    // Otherwise a page with a search box becomes impossible to annotate.
    expect(action).not.toHaveBeenCalled();
    expect(hostShortcut).toHaveBeenCalledTimes(1);
  });

  it('ignores contenteditable regions too', () => {
    const { action } = setup();
    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    Object.defineProperty(editable, 'isContentEditable', { value: true });
    document.body.appendChild(editable);

    press(editable, 'a');

    expect(action).not.toHaveBeenCalled();
  });

  it('ignores chords, so the browser keeps Cmd+A and Ctrl+A', () => {
    const { action } = setup();

    press(document.body, 'a', { metaKey: true });
    press(document.body, 'a', { ctrlKey: true });
    press(document.body, 'a', { altKey: true });

    expect(action).not.toHaveBeenCalled();
  });

  it('does not treat a keystroke inside our own UI as a command', () => {
    const { hostEl, action } = setup();

    press(hostEl, 'a');

    expect(action).not.toHaveBeenCalled();
  });

  it('gives the key back on uninstall', () => {
    const { action } = setup();
    const hostShortcut = spyHostShortcut();
    while (teardown.length) teardown.pop()!();

    press(document.body, 'a');

    expect(action).not.toHaveBeenCalled();
    expect(hostShortcut).not.toHaveBeenCalled();
  });
});
