// ============================================================
// Domnotate — copy feedback animation
// ============================================================
//
// Shared by the web app's notes panel and the extension sidebar so the two
// surfaces behave identically. Everything host-specific is a parameter:
//
//   - `ghostLayer`, because the extension must not append to the host page's
//     body. Its stylesheet lives inside a closed shadow root, so a ghost
//     parented to the page would render unstyled and mutate someone else's DOM.
//   - `setIcon`, because the web app assigns icons as HTML strings while the
//     extension builds them as DOM nodes — a host page running Trusted Types
//     rejects `innerHTML`.

/** ms between each ghost launch. */
const STAGGER = 40;
/** ms per ghost flight. */
const FLIGHT = 350;
/** How long the check mark stays before reverting. */
const HOLD = 1500;
/** Ghosts past this many no longer delay the icon swap. */
const MAX_STAGGERED = 8;

export type CopyIcon = 'check' | 'clipboard';

export interface CopyFeedbackOptions {
  /** The note rows to launch ghosts from. Each needs a `.dn-note-pin` child. */
  rows: ArrayLike<Element>;
  /** The copy button the ghosts fly into. */
  button: HTMLElement;
  /** Where ghosts are parented. Must be a positioning-neutral container. */
  ghostLayer: Element;
  setIcon: (icon: CopyIcon) => void;
}

/**
 * Fly a ghost of each note's pin into the copy button.
 *
 * `.dn-copy-ghost` is `position: fixed`, so viewport coordinates from
 * `getBoundingClientRect()` are correct in either host as long as no ancestor
 * of `ghostLayer` establishes a containing block.
 */
export function flyPinsToButton(
  rows: ArrayLike<Element>,
  button: HTMLElement,
  ghostLayer: Element,
): void {
  if (rows.length === 0) return;

  const btnRect = button.getBoundingClientRect();
  const btnCx = btnRect.left + btnRect.width / 2;
  const btnCy = btnRect.top + btnRect.height / 2;

  Array.from(rows).forEach((row, i) => {
    const pin = row.querySelector('.dn-note-pin') as HTMLElement | null;
    if (!pin) return;

    const pinRect = pin.getBoundingClientRect();
    const ghost = ghostLayer.ownerDocument.createElement('div');
    ghost.className = 'dn-copy-ghost';
    ghost.textContent = pin.textContent;

    // Start at the pin's screen position
    ghost.style.left = `${pinRect.left}px`;
    ghost.style.top = `${pinRect.top}px`;
    ghost.style.width = `${pinRect.width}px`;
    ghost.style.height = `${pinRect.height}px`;
    ghostLayer.appendChild(ghost);

    const dx = btnCx - (pinRect.left + pinRect.width / 2);
    const dy = btnCy - (pinRect.top + pinRect.height / 2);

    // happy-dom has no Web Animations API; the ghost is decoration, so skip it
    // rather than making the copy itself fail.
    if (typeof ghost.animate !== 'function') {
      ghost.remove();
      return;
    }

    ghost.animate(
      [
        { transform: 'translate(0, 0) scale(1)', opacity: 1 },
        { transform: `translate(${dx}px, ${dy}px) scale(0.3)`, opacity: 0.4 },
      ],
      {
        duration: FLIGHT,
        delay: i * STAGGER,
        easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
        fill: 'forwards',
      },
    ).onfinish = () => ghost.remove();
  });
}

/**
 * Run the whole copy affordance: ghosts fly, the icon becomes a check once
 * they start landing, and it reverts after a hold.
 *
 * Returns a cancel function; call it on teardown so a pending revert cannot
 * fire against a detached button.
 */
export function runCopyFeedback(options: CopyFeedbackOptions): () => void {
  const { rows, button, ghostLayer, setIcon } = options;

  flyPinsToButton(rows, button, ghostLayer);

  // Hold the icon swap until the ghosts start arriving.
  const landDelay = Math.min(rows.length, MAX_STAGGERED) * STAGGER + 100;

  let revertTimer: ReturnType<typeof setTimeout> | null = null;
  const landTimer = setTimeout(() => {
    setIcon('check');
    button.classList.add('dn-action-btn--copied');

    revertTimer = setTimeout(() => {
      setIcon('clipboard');
      button.classList.remove('dn-action-btn--copied');
      revertTimer = null;
    }, HOLD);
  }, landDelay);

  return () => {
    clearTimeout(landTimer);
    if (revertTimer) clearTimeout(revertTimer);
  };
}

/**
 * Replay the pop animation on a freshly swapped icon. The class has to come
 * off again or the next swap will not re-trigger it.
 */
export function popIcon(svg: SVGElement | null): void {
  if (!svg) return;
  svg.classList.add('dn-icon-enter');
  svg.addEventListener('animationend', () => svg.classList.remove('dn-icon-enter'), { once: true });
}
