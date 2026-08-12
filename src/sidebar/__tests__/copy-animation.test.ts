import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { flyPinsToButton, runCopyFeedback, popIcon } from '@/sidebar/copy-animation';

/** happy-dom has no Web Animations API, so the ghost path needs a stand-in. */
function stubAnimate(): ReturnType<typeof vi.fn> {
  const animate = vi.fn(() => ({ onfinish: null }) as unknown as Animation);
  (HTMLElement.prototype as unknown as { animate: unknown }).animate = animate;
  return animate;
}

function makeRows(count: number): HTMLElement {
  const list = document.createElement('div');
  for (let i = 0; i < count; i++) {
    const row = document.createElement('div');
    row.className = 'dn-note-row';
    const pin = document.createElement('div');
    pin.className = 'dn-note-pin';
    pin.textContent = String(i + 1);
    row.appendChild(pin);
    list.appendChild(row);
  }
  document.body.appendChild(list);
  return list;
}

beforeEach(() => vi.useFakeTimers());

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
  delete (HTMLElement.prototype as unknown as { animate?: unknown }).animate;
});

describe('flyPinsToButton', () => {
  it('launches one ghost per note, into the given layer', () => {
    const animate = stubAnimate();
    const list = makeRows(3);
    const layer = document.createElement('div');
    document.body.appendChild(layer);
    const button = document.createElement('button');
    document.body.appendChild(button);

    flyPinsToButton(list.querySelectorAll('.dn-note-row'), button, layer);

    expect(animate).toHaveBeenCalledTimes(3);
    // Parented to the layer we were handed, never to document.body implicitly:
    // in the extension that layer is a shadow root, and the host page's DOM is
    // not ours to write into.
    expect(layer.querySelectorAll('.dn-copy-ghost')).toHaveLength(3);
    expect(document.body.querySelectorAll(':scope > .dn-copy-ghost')).toHaveLength(0);
  });

  it('does nothing when there is nothing to copy', () => {
    const animate = stubAnimate();
    const layer = document.createElement('div');
    flyPinsToButton([], document.createElement('button'), layer);
    expect(animate).not.toHaveBeenCalled();
    expect(layer.children).toHaveLength(0);
  });

  it('degrades rather than throwing where animations are unavailable', () => {
    const list = makeRows(2);
    const layer = document.createElement('div');

    expect(() =>
      flyPinsToButton(list.querySelectorAll('.dn-note-row'), document.createElement('button'), layer),
    ).not.toThrow();
    expect(layer.children).toHaveLength(0);
  });
});

describe('runCopyFeedback', () => {
  function setup(rowCount = 2) {
    stubAnimate();
    const list = makeRows(rowCount);
    const button = document.createElement('button');
    document.body.appendChild(button);
    const setIcon = vi.fn();
    const cancel = runCopyFeedback({
      rows: list.querySelectorAll('.dn-note-row'),
      button,
      ghostLayer: document.createElement('div'),
      setIcon,
    });
    return { button, setIcon, cancel };
  }

  it('shows the check only once the ghosts start landing, then reverts', () => {
    const { button, setIcon } = setup();

    expect(setIcon).not.toHaveBeenCalled();

    vi.advanceTimersByTime(180);
    expect(setIcon).toHaveBeenLastCalledWith('check');
    expect(button.classList.contains('dn-action-btn--copied')).toBe(true);

    vi.advanceTimersByTime(1500);
    expect(setIcon).toHaveBeenLastCalledWith('clipboard');
    expect(button.classList.contains('dn-action-btn--copied')).toBe(false);
  });

  it('cancel stops a pending revert firing at a detached button', () => {
    const { button, setIcon, cancel } = setup();
    vi.advanceTimersByTime(180);
    cancel();

    vi.advanceTimersByTime(5000);

    expect(setIcon).toHaveBeenCalledTimes(1);
    expect(button.classList.contains('dn-action-btn--copied')).toBe(true);
  });
});

describe('popIcon', () => {
  it('adds the entry class and removes it when the animation ends', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    popIcon(svg);
    expect(svg.classList.contains('dn-icon-enter')).toBe(true);

    // Must come off, or the next swap cannot re-trigger it.
    svg.dispatchEvent(new Event('animationend'));
    expect(svg.classList.contains('dn-icon-enter')).toBe(false);
  });

  it('tolerates a missing icon', () => {
    expect(() => popIcon(null)).not.toThrow();
  });
});
