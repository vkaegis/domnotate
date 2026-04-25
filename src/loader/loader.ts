// ============================================================
// Domnotate — Content Loader
// ============================================================

import type { ContentLoader, EventBus } from '@/types/core';
import { createDropZone } from './drop-zone';

export function createContentLoader(): ContentLoader {
  let iframeEl: HTMLIFrameElement | null = null;
  let dropZoneEl: HTMLElement | null = null;
  let bus: EventBus | null = null;
  let currentBlobUrl: string | null = null;

  /** Create a blob URL from HTML text and load it in the iframe. */
  function loadHtmlText(
    html: string,
    sourceType: 'file' | 'url',
    sourceName: string,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!iframeEl || !bus || !dropZoneEl) {
        reject(new Error('ContentLoader not initialised'));
        return;
      }

      // Revoke any previous blob URL
      if (currentBlobUrl) {
        URL.revokeObjectURL(currentBlobUrl);
        currentBlobUrl = null;
      }

      const blob = new Blob([html], { type: 'text/html' });
      const blobUrl = URL.createObjectURL(blob);
      currentBlobUrl = blobUrl;

      const iframe = iframeEl;
      const eventBus = bus;
      const dzEl = dropZoneEl;

      const onLoad = (): void => {
        iframe.removeEventListener('load', onLoad);
        iframe.removeEventListener('error', onError);

        // Hide drop zone, show content area
        dzEl.classList.add('hidden');
        const contentArea = document.getElementById('content-area');
        if (contentArea) contentArea.classList.remove('hidden');

        eventBus.emit({
          type: 'content:loaded',
          url: blobUrl,
          sourceType,
          sourceName,
        });

        resolve();
      };

      const onError = (): void => {
        iframe.removeEventListener('load', onLoad);
        iframe.removeEventListener('error', onError);
        reject(new Error(`Failed to load content in iframe`));
      };

      iframe.addEventListener('load', onLoad);
      iframe.addEventListener('error', onError);
      iframe.src = blobUrl;
    });
  }

  /** Display a friendly error message inside the drop zone. */
  function showDropZoneError(msg: string): void {
    if (!dropZoneEl) return;

    // Find or create error element
    let errEl = dropZoneEl.querySelector('[data-dn-error]') as HTMLElement | null;
    if (!errEl) {
      errEl = document.createElement('div');
      errEl.setAttribute('data-dn-error', '');
      Object.assign(errEl.style, {
        color: 'var(--dn-error)',
        fontSize: '13px',
        textAlign: 'center',
        padding: '12px 16px',
        borderRadius: 'var(--dn-radius-sm)',
        background: 'var(--dn-error-subtle)',
        position: 'fixed',
        bottom: '24px',
        left: '50%',
        transform: 'translateX(-50%)',
        maxWidth: '420px',
        zIndex: '9999',
      });
      document.body.appendChild(errEl);
    }

    errEl.textContent = msg;
    errEl.style.display = 'block';

    setTimeout(() => {
      if (errEl) errEl.style.display = 'none';
    }, 5000);
  }

  const loader: ContentLoader = {
    init(
      iframe: HTMLIFrameElement,
      dropZone: HTMLElement,
      eventBus: EventBus,
    ): void {
      iframeEl = iframe;
      dropZoneEl = dropZone;
      bus = eventBus;

      // Build the drop zone UI with callbacks
      createDropZone(
        dropZone,
        (file: File) => {
          loader.loadFile(file).catch((err) => {
            console.error('[Domnotate] loadFile error:', err);
          });
        },
        (url: string) => {
          loader.loadUrl(url).catch((err) => {
            console.error('[Domnotate] loadUrl error:', err);
          });
        },
      );
    },

    async loadFile(file: File): Promise<void> {
      const html = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsText(file);
      });

      await loadHtmlText(html, 'file', file.name);
    },

    async loadUrl(url: string): Promise<void> {
      try {
        const proxyUrl = `/api/proxy?url=${encodeURIComponent(url)}`;
        const response = await fetch(proxyUrl);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const html = await response.text();
        await loadHtmlText(html, 'url', url);
      } catch (err: unknown) {
        const message =
          err instanceof TypeError
            ? 'Could not fetch the URL. This is likely a CORS restriction — the remote server does not allow cross-origin requests.'
            : err instanceof Error
              ? err.message
              : 'An unknown error occurred while fetching the URL.';

        showDropZoneError(message);
        throw err;
      }
    },

    getIframeDocument(): Document | null {
      if (!iframeEl) return null;
      try {
        return iframeEl.contentDocument;
      } catch {
        // Cross-origin access blocked
        return null;
      }
    },

    unload(): void {
      if (!iframeEl || !bus || !dropZoneEl) return;

      // Revoke blob URL
      if (currentBlobUrl) {
        URL.revokeObjectURL(currentBlobUrl);
        currentBlobUrl = null;
      }

      // Clear iframe
      iframeEl.src = 'about:blank';

      // Hide content area, show drop zone
      const contentArea = document.getElementById('content-area');
      if (contentArea) contentArea.classList.add('hidden');
      dropZoneEl.classList.remove('hidden');

      bus.emit({ type: 'content:unloaded' });
    },
  };

  return loader;
}
