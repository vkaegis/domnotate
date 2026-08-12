import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createDropZone } from '../drop-zone';

describe('createDropZone', () => {
  let container: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  it('accepts an HTML file dropped anywhere on the right pane', () => {
    const onFile = vi.fn();
    createDropZone(container, onFile, vi.fn());

    const file = new File(['<html></html>'], 'prototype.html', {
      type: 'text/html',
    });
    const drop = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(drop, 'dataTransfer', {
      value: { files: [file] },
    });

    container.querySelector<HTMLElement>('.dn-landing__drop')!.dispatchEvent(drop);

    expect(drop.defaultPrevented).toBe(true);
    expect(onFile).toHaveBeenCalledOnce();
    expect(onFile).toHaveBeenCalledWith(file);
  });

  it('shows the project and author links without the old eyebrow', () => {
    createDropZone(container, vi.fn(), vi.fn());

    expect(container.textContent).not.toContain('HTML Annotation Tool');

    const repoLink = container.querySelector<HTMLAnchorElement>(
      'a[href="https://github.com/vkaegis/domnotate"]',
    );
    expect(repoLink?.textContent).toBe('GitHub');

    const authorLink = container.querySelector<HTMLAnchorElement>(
      'a[href="https://github.com/vkaegis"]',
    );
    expect(authorLink?.textContent).toBe('Vineet Kumar');
    expect(authorLink?.parentElement?.textContent).toBe('Made with love by Vineet Kumar');
  });

  it('points at the extension and says what it adds over the web app', () => {
    createDropZone(container, vi.fn(), vi.fn());

    const link = container.querySelector<HTMLAnchorElement>(
      'a[href="https://chromewebstore.google.com/detail/domnotate/hgllflmkglkhaamjkgmmjhgelhokdkma"]',
    );
    expect(link?.textContent).toBe('Get it on the Chrome Web Store');
    expect(link?.rel).toBe('noopener noreferrer');

    // The link alone would satisfy "there is a callout" while telling a visitor
    // nothing. What it has to carry is the reason to want it: the web app
    // cannot load a page behind a login, and the extension can.
    const callout = container.querySelector<HTMLElement>('.dn-landing__callout');
    expect(callout?.textContent).toContain('behind a login');
    expect(callout?.contains(link!)).toBe(true);
  });

  it('opens the file picker from the keyboard-accessible drop area', () => {
    createDropZone(container, vi.fn(), vi.fn());

    const dropArea = container.querySelector<HTMLElement>('.dn-drop-area')!;
    const fileInput = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    const click = vi.spyOn(fileInput, 'click');
    const keydown = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    });

    dropArea.dispatchEvent(keydown);

    expect(dropArea.tabIndex).toBe(0);
    expect(dropArea.getAttribute('role')).toBe('button');
    expect(keydown.defaultPrevented).toBe(true);
    expect(click).toHaveBeenCalledOnce();
  });
});
