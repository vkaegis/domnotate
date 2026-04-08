import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createContentLoader } from '../loader';

describe('createContentLoader', () => {
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

      const contentArea = document.createElement('div');
      contentArea.id = 'content-area';
      contentArea.classList.add('hidden');
      document.body.appendChild(contentArea);

      const bus = { emit: vi.fn(), on: vi.fn(() => () => {}) };
      loader.init(iframe, dropZone, bus);

      // Simulate iframe load when src is set
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

      await loader.loadUrl('https://example.com/page');

      expect(fetchSpy).toHaveBeenCalledOnce();
      const calledUrl = fetchSpy.mock.calls[0][0] as string;
      expect(calledUrl).toBe('/api/proxy?url=https%3A%2F%2Fexample.com%2Fpage');

      // Restore
      if (origSrcDescriptor) {
        Object.defineProperty(HTMLIFrameElement.prototype, 'src', origSrcDescriptor);
      }
      document.body.removeChild(dropZone);
      document.body.removeChild(contentArea);
    });
  });
});
