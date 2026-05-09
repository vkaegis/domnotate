import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createContentLoader } from '../loader';

describe('createContentLoader', () => {
  function stubIframeLoad(iframe: HTMLIFrameElement): () => void {
    const origSrcDescriptor = Object.getOwnPropertyDescriptor(
      HTMLIFrameElement.prototype,
      'src',
    );
    let srcValue = '';
    Object.defineProperty(iframe, 'src', {
      get() {
        return srcValue;
      },
      set(v: string) {
        srcValue = v;
        // Fire load event async so the listener is attached
        setTimeout(() => iframe.dispatchEvent(new Event('load')), 0);
      },
      configurable: true,
    });

    return () => {
      if (origSrcDescriptor) {
        Object.defineProperty(HTMLIFrameElement.prototype, 'src', origSrcDescriptor);
      }
    };
  }

  function mountContentArea(): HTMLElement {
    const contentArea = document.createElement('div');
    contentArea.id = 'content-area';
    contentArea.classList.add('hidden');
    document.body.appendChild(contentArea);
    return contentArea;
  }

  describe('loadUrl', () => {
    let fetchSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('<html></html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        }),
      );
    });

    afterEach(() => {
      fetchSpy.mockRestore();
    });

    it('fetches through the proxy endpoint instead of the raw URL', async () => {
      const loader = createContentLoader();

      const iframe = document.createElement('iframe');
      const dropZone = document.createElement('div');
      document.body.appendChild(dropZone);

      const contentArea = mountContentArea();

      const bus = { emit: vi.fn(), on: vi.fn(() => () => {}) };
      loader.init(iframe, dropZone, bus);

      const restoreIframeSrc = stubIframeLoad(iframe);

      await loader.loadUrl('https://example.com/page');

      expect(fetchSpy).toHaveBeenCalledOnce();
      const calledUrl = fetchSpy.mock.calls[0][0] as string;
      expect(calledUrl).toBe('/api/proxy?url=https%3A%2F%2Fexample.com%2Fpage');

      restoreIframeSrc();
      document.body.removeChild(dropZone);
      document.body.removeChild(contentArea);
    });
  });

  describe('loadHtml', () => {
    it('can disable iframe script execution for public shared HTML', async () => {
      const loader = createContentLoader();
      const iframe = document.createElement('iframe');
      const dropZone = document.createElement('div');
      document.body.appendChild(dropZone);
      const contentArea = mountContentArea();
      const bus = { emit: vi.fn(), on: vi.fn(() => () => {}) };
      loader.init(iframe, dropZone, bus);
      const restoreIframeSrc = stubIframeLoad(iframe);

      await loader.loadHtml('<html><body>Shared</body></html>', 'file', 'shared.html', {
        allowScripts: false,
      });

      expect(iframe.getAttribute('sandbox')).toBe('allow-same-origin');
      expect(bus.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'content:loaded',
          html: '<html><body>Shared</body></html>',
        }),
      );

      restoreIframeSrc();
      document.body.removeChild(dropZone);
      document.body.removeChild(contentArea);
    });
  });
});
