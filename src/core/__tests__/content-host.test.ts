import { describe, it, expect, vi } from 'vitest';
import { createIframeHost, createPageHost, type ContentHost } from '@/core/content-host';

/**
 * happy-dom lays nothing out, so `getBoundingClientRect` returns zeros. The
 * translation arithmetic is the whole point of `toOverlayCoords`, so the rects
 * are stubbed — the geometry engine is a system boundary here, not an internal
 * module.
 */
function elementWithRect(rect: { left: number; top: number }): HTMLElement {
  const el = document.createElement('div');
  el.getBoundingClientRect = vi.fn(
    () => ({ left: rect.left, top: rect.top, width: 0, height: 0 }) as DOMRect,
  );
  return el;
}

describe('createIframeHost', () => {
  it('returns the iframe document', () => {
    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe);
    const host = createIframeHost(iframe, document.createElement('div'));
    expect(host.getDocument()).toBe(iframe.contentDocument);
    iframe.remove();
  });

  it('translates content coords by the iframe offset within the overlay', () => {
    const iframe = elementWithRect({ left: 120, top: 40 }) as unknown as HTMLIFrameElement;
    const overlay = elementWithRect({ left: 100, top: 10 });
    const host = createIframeHost(iframe, overlay);

    expect(host.toOverlayCoords(0, 0)).toEqual({ x: 20, y: 30 });
    expect(host.toOverlayCoords(5, 7)).toEqual({ x: 25, y: 37 });
  });

  it('reads scroll from the content document element', () => {
    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument!;
    Object.defineProperty(doc.documentElement, 'scrollLeft', { value: 12, configurable: true });
    Object.defineProperty(doc.documentElement, 'scrollTop', { value: 34, configurable: true });

    const host = createIframeHost(iframe, document.createElement('div'));
    expect(host.getScroll()).toEqual({ scrollX: 12, scrollY: 34 });
    iframe.remove();
  });

  it('reports zero scroll when the document is unreachable', () => {
    const iframe = document.createElement('iframe');
    const host = createIframeHost(iframe, document.createElement('div'));
    expect(host.getScroll()).toEqual({ scrollX: 0, scrollY: 0 });
  });
});

describe('createPageHost', () => {
  it('returns the page document', () => {
    expect(createPageHost(window).getDocument()).toBe(document);
  });

  it('translates coordinates as identity', () => {
    const host = createPageHost(window);
    expect(host.toOverlayCoords(0, 0)).toEqual({ x: 0, y: 0 });
    expect(host.toOverlayCoords(41, 99)).toEqual({ x: 41, y: 99 });
  });

  it('reads scroll from the window', () => {
    const fakeWindow = {
      document,
      scrollX: 7,
      scrollY: 21,
      innerWidth: 800,
      innerHeight: 600,
    } as unknown as Window;
    expect(createPageHost(fakeWindow).getScroll()).toEqual({ scrollX: 7, scrollY: 21 });
  });

  it('never reports a content size smaller than the viewport', () => {
    const fakeWindow = {
      document,
      scrollX: 0,
      scrollY: 0,
      innerWidth: 1280,
      innerHeight: 720,
    } as unknown as Window;
    const size = createPageHost(fakeWindow).getContentSize();
    expect(size.width).toBeGreaterThanOrEqual(1280);
    expect(size.height).toBeGreaterThanOrEqual(720);
  });
});

describe('subscriptions the iframe host has not needed yet', () => {
  // The web app still renders pins its own way, so these stay unimplemented
  // there — and throw rather than no-op, so a caller cannot ship broken pin
  // tracking with green tests.
  const host: ContentHost = createIframeHost(
    document.createElement('iframe'),
    document.createElement('div'),
  );

  it('fails loudly rather than silently no-op', () => {
    expect(() => host.onScroll(() => {})).toThrow(/Phase 4/);
    expect(() => host.onResize(() => {})).toThrow(/Phase 4/);
    expect(() => host.onNavigate(() => {})).toThrow(/Phase 4/);
  });
});

describe('page host subscriptions', () => {
  it('hears an inner pane scroll, not just the page', () => {
    const host = createPageHost(window);
    const cb = vi.fn();
    const unsub = host.onScroll(cb);

    const pane = document.createElement('div');
    document.body.appendChild(pane);
    // Scroll events do not bubble, so this only arrives if we captured.
    pane.dispatchEvent(new Event('scroll'));

    expect(cb).toHaveBeenCalledTimes(1);
    unsub();
    pane.dispatchEvent(new Event('scroll'));
    expect(cb).toHaveBeenCalledTimes(1);
    pane.remove();
  });

  it('reports resizes and stops on unsubscribe', () => {
    const host = createPageHost(window);
    const cb = vi.fn();
    const unsub = host.onResize(cb);

    window.dispatchEvent(new Event('resize'));
    expect(cb).toHaveBeenCalledTimes(1);

    unsub();
    window.dispatchEvent(new Event('resize'));
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('reports SPA navigation through pushState, replaceState and popstate', () => {
    const host = createPageHost(window);
    const cb = vi.fn();
    const unsub = host.onNavigate(cb);

    window.history.pushState({}, '', '/one');
    window.history.replaceState({}, '', '/two');
    window.dispatchEvent(new PopStateEvent('popstate'));

    expect(cb).toHaveBeenCalledTimes(3);
    unsub();
  });

  it('puts history back exactly as it found it', () => {
    const before = { push: window.history.pushState, replace: window.history.replaceState };

    const unsub = createPageHost(window).onNavigate(() => {});
    expect(window.history.pushState).not.toBe(before.push);
    unsub();

    expect(window.history.pushState).toBe(before.push);
    expect(window.history.replaceState).toBe(before.replace);
  });

  it('leaves a wrapper installed after ours alone', () => {
    const host = createPageHost(window);
    const unsub = host.onNavigate(() => {});

    // The page wraps history after we did; unwinding blindly would drop it.
    const theirs = vi.fn();
    const ours = window.history.pushState;
    window.history.pushState = theirs as typeof window.history.pushState;

    unsub();

    expect(window.history.pushState).toBe(theirs);
    window.history.pushState = ours;
    unsub();
  });
});
