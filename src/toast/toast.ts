// ============================================================
// Domnotate — Central Toast Notification
// ============================================================

import type { EventBus } from '@/types/core';

const DISPLAY_MS = 1500;
const FADE_MS = 300;

export function createToast(
  anchorEl: HTMLElement,
  bus: EventBus,
): { destroy(): void } {
  const unsubs: (() => void)[] = [];
  let hideTimer: ReturnType<typeof setTimeout> | null = null;

  // Container lives inside the content area so it's centered over the page
  const el = document.createElement('div');
  el.className = 'dn-toast';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  anchorEl.appendChild(el);

  function show(message: string): void {
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }

    el.textContent = message;
    el.classList.remove('dn-toast--hidden');
    // Force reflow so re-triggering the same message replays the animation
    void el.offsetWidth;
    el.classList.add('dn-toast--visible');

    hideTimer = setTimeout(() => {
      el.classList.remove('dn-toast--visible');
      hideTimer = setTimeout(() => {
        el.classList.add('dn-toast--hidden');
        hideTimer = null;
      }, FADE_MS);
    }, DISPLAY_MS);
  }

  // Wire up events
  unsubs.push(bus.on('output:copy', () => show('Copied to clipboard')));
  unsubs.push(bus.on('output:download', () => show('Exported')));
  unsubs.push(bus.on('session:cleared', () => show('Cleared all annotations')));
  unsubs.push(bus.on('share:publishing', () => show('Publishing share...')));
  unsubs.push(bus.on('share:copied', () => show('Share link copied')));
  unsubs.push(bus.on('share:notice', (event) => show(event.message)));
  unsubs.push(bus.on('share:error', (event) => show(event.message)));

  // Start hidden
  el.classList.add('dn-toast--hidden');

  return {
    destroy(): void {
      for (const unsub of unsubs) unsub();
      if (hideTimer) clearTimeout(hideTimer);
      el.remove();
    },
  };
}
