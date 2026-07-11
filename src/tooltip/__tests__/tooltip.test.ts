import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { attachTooltip } from '@/tooltip/tooltip';

function tip(): HTMLElement | null {
  return document.querySelector('.dn-tooltip');
}

function makeTarget(tooltip: string): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.dataset.tooltip = tooltip;
  document.body.appendChild(btn);
  return btn;
}

describe('attachTooltip', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('shows after a short delay on hover and hides on leave', () => {
    const btn = makeTarget('Download as JSON');
    const detach = attachTooltip(btn);

    btn.dispatchEvent(new MouseEvent('mouseenter'));
    // Not shown immediately (a small delay avoids flicker while sweeping).
    expect(tip()?.classList.contains('dn-tooltip--visible')).toBeFalsy();

    vi.advanceTimersByTime(50);
    expect(tip()?.classList.contains('dn-tooltip--visible')).toBe(true);
    expect(tip()?.textContent).toBe('Download as JSON');

    btn.dispatchEvent(new MouseEvent('mouseleave'));
    expect(tip()?.classList.contains('dn-tooltip--visible')).toBe(false);

    detach();
  });

  test('reads the live data-tooltip value at show time', () => {
    const btn = makeTarget('Enabled');
    const detach = attachTooltip(btn);

    btn.dataset.tooltip = 'Nothing to download yet. Add an annotation first.';
    btn.dispatchEvent(new MouseEvent('mouseenter'));
    vi.advanceTimersByTime(50);

    expect(tip()?.textContent).toBe('Nothing to download yet. Add an annotation first.');
    detach();
  });

  test('shows on focus and hides on blur (keyboard users)', () => {
    const btn = makeTarget('Copy as Markdown');
    const detach = attachTooltip(btn);

    btn.dispatchEvent(new FocusEvent('focus'));
    vi.advanceTimersByTime(50);
    expect(tip()?.classList.contains('dn-tooltip--visible')).toBe(true);

    btn.dispatchEvent(new FocusEvent('blur'));
    expect(tip()?.classList.contains('dn-tooltip--visible')).toBe(false);
    detach();
  });

  test('a pending tooltip is cancelled if the pointer leaves before the delay', () => {
    const btn = makeTarget('Copy');
    const detach = attachTooltip(btn);

    btn.dispatchEvent(new MouseEvent('mouseenter'));
    btn.dispatchEvent(new MouseEvent('mouseleave'));
    vi.advanceTimersByTime(50);

    expect(tip()?.classList.contains('dn-tooltip--visible')).toBeFalsy();
    detach();
  });

  test('stays hidden when the target has no data-tooltip', () => {
    const btn = document.createElement('button');
    document.body.appendChild(btn);
    const detach = attachTooltip(btn);

    btn.dispatchEvent(new MouseEvent('mouseenter'));
    vi.advanceTimersByTime(50);

    expect(tip()?.classList.contains('dn-tooltip--visible')).toBeFalsy();
    detach();
  });

  test('a pending tooltip does not fire after the target is detached mid-delay', () => {
    const btn = makeTarget('Clear');
    const detach = attachTooltip(btn);

    // Hover starts the delay, then the target is torn down before it elapses.
    btn.dispatchEvent(new MouseEvent('mouseenter'));
    detach();
    btn.remove();
    vi.advanceTimersByTime(50);

    // No tooltip should have been shown against the removed element.
    expect(tip()?.classList.contains('dn-tooltip--visible')).toBeFalsy();
  });

  test('detach stops future tooltips from showing', () => {
    const btn = makeTarget('Clear');
    const detach = attachTooltip(btn);
    detach();

    btn.dispatchEvent(new MouseEvent('mouseenter'));
    vi.advanceTimersByTime(50);

    expect(tip()?.classList.contains('dn-tooltip--visible')).toBeFalsy();
  });
});
