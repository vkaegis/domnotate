// ============================================================
// Domnotate — Tooltip
// A single body-portaled tooltip shared by all attached targets.
// Portaling to <body> keeps it clear of ancestor overflow/stacking
// (toolbar, overflow menu) and lets it flip within the viewport.
// ============================================================

import './tooltip.css';

// Near-immediate: just enough to avoid flicker when the pointer sweeps
// across the toolbar on its way somewhere else.
const SHOW_DELAY_MS = 50;
const GAP = 8;

let tipEl: HTMLDivElement | null = null;
let activeTarget: HTMLElement | null = null;
let showTimer: ReturnType<typeof setTimeout> | null = null;
// The target a pending (not-yet-fired) show timer belongs to, so detach can
// cancel it and it never fires against a removed element.
let pendingTarget: HTMLElement | null = null;

function getTipEl(): HTMLDivElement {
  if (!tipEl) {
    tipEl = document.createElement('div');
    tipEl.className = 'dn-tooltip';
    tipEl.setAttribute('role', 'tooltip');
    tipEl.setAttribute('aria-hidden', 'true');
    // Any scroll or resize invalidates the anchored position; drop the tip.
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
  }
  // Re-attach if something detached it (e.g. the host cleared <body>).
  if (!tipEl.isConnected) document.body.appendChild(tipEl);
  return tipEl;
}

function position(target: HTMLElement): void {
  const tip = getTipEl();
  const rect = target.getBoundingClientRect();
  const tw = tip.offsetWidth;
  const th = tip.offsetHeight;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Prefer below the target; flip above if it would overflow the bottom.
  let top = rect.bottom + GAP;
  if (top + th > vh - GAP) top = rect.top - th - GAP;

  // Center on the target, clamped to the viewport.
  let left = rect.left + rect.width / 2 - tw / 2;
  left = Math.max(GAP, Math.min(left, vw - tw - GAP));

  tip.style.left = `${Math.round(left)}px`;
  tip.style.top = `${Math.round(top)}px`;
}

function clearPending(): void {
  if (showTimer) {
    clearTimeout(showTimer);
    showTimer = null;
  }
  pendingTarget = null;
}

function show(target: HTMLElement): void {
  // The target may have been removed between hover and this delayed callback.
  if (!target.isConnected) return;
  const text = target.dataset.tooltip;
  if (!text) return;
  const tip = getTipEl();
  tip.textContent = text;
  activeTarget = target;
  position(target);
  tip.classList.add('dn-tooltip--visible');
  tip.setAttribute('aria-hidden', 'false');
}

function hide(): void {
  clearPending();
  activeTarget = null;
  if (tipEl) {
    tipEl.classList.remove('dn-tooltip--visible');
    tipEl.setAttribute('aria-hidden', 'true');
  }
}

/**
 * Wire a near-immediate tooltip on `target`, sourced from its live
 * `data-tooltip` attribute (read at show time, so dynamic reasons update).
 * Returns an unsubscribe that detaches the listeners and hides the tip if
 * this target currently owns it.
 */
export function attachTooltip(target: HTMLElement): () => void {
  const onEnter = (): void => {
    clearPending();
    pendingTarget = target;
    showTimer = setTimeout(() => {
      showTimer = null;
      pendingTarget = null;
      show(target);
    }, SHOW_DELAY_MS);
  };
  const onLeave = (): void => hide();

  target.addEventListener('mouseenter', onEnter);
  target.addEventListener('mouseleave', onLeave);
  target.addEventListener('focus', onEnter);
  target.addEventListener('blur', onLeave);
  // Activating a control should dismiss the tip rather than leave it stuck.
  target.addEventListener('click', onLeave);

  return () => {
    target.removeEventListener('mouseenter', onEnter);
    target.removeEventListener('mouseleave', onLeave);
    target.removeEventListener('focus', onEnter);
    target.removeEventListener('blur', onLeave);
    target.removeEventListener('click', onLeave);
    // Cancel a pending show and drop the tip if this target owns either.
    if (pendingTarget === target) clearPending();
    if (activeTarget === target) hide();
  };
}
