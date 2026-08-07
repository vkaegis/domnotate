// ============================================================
// Domnotate — ContentHost
// ============================================================
//
// The three things every iframe-touching module actually needs: the content
// document, coordinate translation into the overlay's space, and the scroll
// offset. Two implementations satisfy it — the web app's iframe, and the
// extension's live page.
//
// Deliberately incremental (plan §3.8). Ten modules touch the iframe today
// (main, picker, highlight, pin-renderer, popover, edit-mode, shortcuts,
// slide-observer, loader, types/core) and only the picker migrates in Phase 1.
// The rest move in Phase 4, which is also when the subscription methods below
// get real implementations.

/** Phase 4 methods are declared but not implemented; calling one is a bug, not a no-op. */
function phase4(method: string): never {
  throw new Error(
    `ContentHost.${method}() is not implemented until Phase 4 (pins + popover). ` +
      'Phase 1 implements getDocument, toOverlayCoords, getScroll and getContentSize only.',
  );
}

export interface ContentHost {
  /** The document being annotated, or null when it is unavailable (unloaded / cross-origin). */
  getDocument(): Document | null;

  /**
   * Translate a point in the *content* coordinate space (client coords inside
   * the content document) into the overlay element's coordinate space.
   * Identity for a live page, an offset for an iframe.
   */
  toOverlayCoords(x: number, y: number): { x: number; y: number };

  /** Current scroll offset of the content. */
  getScroll(): { scrollX: number; scrollY: number };

  /** Full scrollable size of the content, used to size the pin layer. */
  getContentSize(): { width: number; height: number };

  /** @phase 4 — subscribe to content scroll. Returns an unsubscribe function. */
  onScroll(cb: () => void): () => void;

  /** @phase 4 — subscribe to content resize. Returns an unsubscribe function. */
  onResize(cb: () => void): () => void;

  /** @phase 4 — subscribe to SPA navigation. Returns an unsubscribe function. */
  onNavigate(cb: () => void): () => void;
}

/**
 * Host for the web app: content lives in an iframe, the overlay is a sibling
 * layer in the parent document.
 */
export function createIframeHost(
  iframeEl: HTMLIFrameElement,
  overlayEl: HTMLElement,
): ContentHost {
  function getDocument(): Document | null {
    try {
      return iframeEl.contentDocument;
    } catch {
      // Cross-origin
      return null;
    }
  }

  return {
    getDocument,

    toOverlayCoords(x: number, y: number) {
      const iframeRect = iframeEl.getBoundingClientRect();
      const overlayRect = overlayEl.getBoundingClientRect();
      return {
        x: x + iframeRect.left - overlayRect.left,
        y: y + iframeRect.top - overlayRect.top,
      };
    },

    getScroll() {
      const doc = getDocument();
      return {
        scrollX: doc?.documentElement.scrollLeft ?? 0,
        scrollY: doc?.documentElement.scrollTop ?? 0,
      };
    },

    getContentSize() {
      // Mirrors pin-renderer's sizing: never smaller than the visible overlay,
      // grown to the content's full scroll extent when it is readable.
      let width = overlayEl.clientWidth;
      let height = overlayEl.clientHeight;
      const doc = getDocument();
      const docEl = doc?.documentElement;
      const body = doc?.body;
      if (docEl) {
        width = Math.max(width, docEl.scrollWidth, body?.scrollWidth ?? 0, docEl.clientWidth);
        height = Math.max(height, docEl.scrollHeight, body?.scrollHeight ?? 0, docEl.clientHeight);
      }
      return { width, height };
    },

    onScroll: () => phase4('onScroll'),
    onResize: () => phase4('onResize'),
    onNavigate: () => phase4('onNavigate'),
  };
}

/**
 * Host for the extension: the content *is* the page the script was injected
 * into. Content coords are already viewport coords, and the overlay is a
 * viewport-anchored layer inside the shadow root, so translation is identity —
 * which is what keeps the pin-renderer counter-translate trick working
 * unchanged when Phase 4 migrates it.
 */
export function createPageHost(targetWindow: Window = window): ContentHost {
  return {
    getDocument(): Document | null {
      return targetWindow.document ?? null;
    },

    toOverlayCoords(x: number, y: number) {
      return { x, y };
    },

    getScroll() {
      return {
        scrollX: targetWindow.scrollX ?? 0,
        scrollY: targetWindow.scrollY ?? 0,
      };
    },

    getContentSize() {
      const docEl = targetWindow.document?.documentElement;
      const body = targetWindow.document?.body;
      return {
        width: Math.max(
          docEl?.scrollWidth ?? 0,
          body?.scrollWidth ?? 0,
          targetWindow.innerWidth ?? 0,
        ),
        height: Math.max(
          docEl?.scrollHeight ?? 0,
          body?.scrollHeight ?? 0,
          targetWindow.innerHeight ?? 0,
        ),
      };
    },

    onScroll: () => phase4('onScroll'),
    onResize: () => phase4('onResize'),
    onNavigate: () => phase4('onNavigate'),
  };
}
