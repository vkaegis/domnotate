// ============================================================
// Domnotate — the pin itself
// ============================================================
//
// Shared by the web app's pin renderer and the extension's pin layer, because
// a pin should look and behave the same in both. Only the *element* is shared:
// where a pin goes is a property of its host, and those two hosts disagree
// (a static document with one scroll root versus a live app with many), so
// positioning deliberately stays with each caller.

/** Diameter in px. Positioning code offsets by half of this. */
export const PIN_SIZE = 24;

export interface PinElementOptions {
  annotationId: string;
  /** Zero-based; rendered as its 1-based ordinal. */
  index: number;
  onSelect: () => void;
  /** Defaults to the global document; the extension passes its own. */
  doc?: Document;
}

export function createPinElement(options: PinElementOptions): HTMLElement {
  const { annotationId, index, onSelect, doc = document } = options;

  const pin = doc.createElement('div');
  pin.dataset.annotationId = annotationId;

  Object.assign(pin.style, {
    position: 'absolute',
    width: `${PIN_SIZE}px`,
    height: `${PIN_SIZE}px`,
    borderRadius: '50%',
    background: 'var(--dn-pin-color)',
    color: 'var(--dn-text-on-accent)',
    fontSize: '11px',
    fontWeight: '700',
    lineHeight: `${PIN_SIZE}px`,
    textAlign: 'center',
    cursor: 'pointer',
    pointerEvents: 'auto',
    boxShadow: 'var(--dn-shadow-sm)',
    userSelect: 'none',
    transition: 'transform 80ms ease',
    zIndex: 'var(--dn-z-pins)',
  });

  pin.textContent = String(index + 1);

  pin.addEventListener('mouseenter', () => {
    pin.style.transform = 'scale(1.2)';
  });
  pin.addEventListener('mouseleave', () => {
    pin.style.transform = 'scale(1)';
  });
  pin.addEventListener('click', (e) => {
    e.stopPropagation();
    onSelect();
  });

  return pin;
}
