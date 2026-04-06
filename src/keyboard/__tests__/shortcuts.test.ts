import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { createKeyboardShortcuts } from '@/keyboard/shortcuts';
import { createEventBus } from '@/events';

function makeDeps(overrides: Record<string, unknown> = {}) {
  const bus = createEventBus();
  let pickerActive = false;
  return {
    bus,
    picker: {
      activate() { pickerActive = true; },
      deactivate() { pickerActive = false; },
      isActive() { return pickerActive; },
    },
    isContentLoaded: () => true,
    getSelectedAnnotationId: () => null,
    getPinsVisible: () => true,
    ...overrides,
  };
}

function fireKey(target: EventTarget, key: string, opts: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...opts });
  target.dispatchEvent(event);
  return event;
}

describe('keyboard shortcuts', () => {
  let shortcuts: ReturnType<typeof createKeyboardShortcuts>;

  afterEach(() => {
    shortcuts?.destroy();
  });

  test('shortcut "a" toggles picker', () => {
    const deps = makeDeps();
    shortcuts = createKeyboardShortcuts(deps);

    fireKey(document, 'a');
    expect(deps.picker.isActive()).toBe(true);

    fireKey(document, 'a');
    expect(deps.picker.isActive()).toBe(false);
  });

  test('shortcuts work from iframe document after attachIframe', () => {
    const deps = makeDeps();
    shortcuts = createKeyboardShortcuts(deps);

    // Create a minimal iframe-like structure with a contentDocument
    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe);

    shortcuts.attachIframe(iframe);

    // Fire the shortcut on the iframe's document
    const iframeDoc = iframe.contentDocument!;
    fireKey(iframeDoc, 'a');
    expect(deps.picker.isActive()).toBe(true);

    // Cleanup
    document.body.removeChild(iframe);
  });

  test('detachIframe stops listening on iframe document', () => {
    const deps = makeDeps();
    shortcuts = createKeyboardShortcuts(deps);

    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe);

    shortcuts.attachIframe(iframe);
    shortcuts.detachIframe();

    // Fire shortcut on iframe doc — should NOT toggle picker
    const iframeDoc = iframe.contentDocument!;
    fireKey(iframeDoc, 'a');
    expect(deps.picker.isActive()).toBe(false);

    document.body.removeChild(iframe);
  });

  test('navigation keys are forwarded to iframe document', () => {
    const deps = makeDeps();
    shortcuts = createKeyboardShortcuts(deps);

    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe);
    shortcuts.attachIframe(iframe);

    const iframeDoc = iframe.contentDocument!;
    const spy = vi.fn();
    iframeDoc.addEventListener('keydown', spy);

    // Fire ArrowRight on the parent document
    fireKey(document, 'ArrowRight');

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0].key).toBe('ArrowRight');

    document.body.removeChild(iframe);
  });

  test('navigation keys are NOT forwarded when no content is loaded', () => {
    const deps = makeDeps({ isContentLoaded: () => false });
    shortcuts = createKeyboardShortcuts(deps);

    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe);
    shortcuts.attachIframe(iframe);

    const iframeDoc = iframe.contentDocument!;
    const spy = vi.fn();
    iframeDoc.addEventListener('keydown', spy);

    fireKey(document, 'ArrowRight');
    expect(spy).not.toHaveBeenCalled();

    document.body.removeChild(iframe);
  });
});
