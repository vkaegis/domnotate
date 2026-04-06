import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { createEventBus } from '@/events';
import { createToast } from '@/toast/toast';

describe('createToast', () => {
  let anchor: HTMLElement;
  let bus: ReturnType<typeof createEventBus>;
  let toast: ReturnType<typeof createToast>;

  beforeEach(() => {
    anchor = document.createElement('div');
    document.body.appendChild(anchor);
    bus = createEventBus();
    toast = createToast(anchor, bus);
  });

  afterEach(() => {
    toast.destroy();
    anchor.remove();
  });

  test('appends a toast element to the anchor', () => {
    const el = anchor.querySelector('.dn-toast');
    expect(el).not.toBeNull();
    expect(el!.getAttribute('role')).toBe('status');
  });

  test('starts hidden', () => {
    const el = anchor.querySelector('.dn-toast')!;
    expect(el.classList.contains('dn-toast--hidden')).toBe(true);
    expect(el.classList.contains('dn-toast--visible')).toBe(false);
  });

  test('shows on output:copy', () => {
    bus.emit({ type: 'output:copy', format: 'markdown' });
    const el = anchor.querySelector('.dn-toast')!;
    expect(el.classList.contains('dn-toast--visible')).toBe(true);
    expect(el.classList.contains('dn-toast--hidden')).toBe(false);
    expect(el.textContent).toBe('Copied to clipboard');
  });

  test('shows on output:download', () => {
    bus.emit({ type: 'output:download', format: 'json' });
    const el = anchor.querySelector('.dn-toast')!;
    expect(el.textContent).toBe('Exported');
  });

  test('shows on session:cleared', () => {
    bus.emit({ type: 'session:cleared' });
    const el = anchor.querySelector('.dn-toast')!;
    expect(el.textContent).toBe('Cleared all annotations');
  });

  test('hides after timeout', () => {
    vi.useFakeTimers();
    bus.emit({ type: 'output:copy', format: 'markdown' });
    const el = anchor.querySelector('.dn-toast')!;
    expect(el.classList.contains('dn-toast--visible')).toBe(true);

    // Advance past display + fade
    vi.advanceTimersByTime(1500 + 300 + 50);
    expect(el.classList.contains('dn-toast--visible')).toBe(false);
    expect(el.classList.contains('dn-toast--hidden')).toBe(true);
    vi.useRealTimers();
  });

  test('destroy removes the element', () => {
    toast.destroy();
    expect(anchor.querySelector('.dn-toast')).toBeNull();
  });
});
