import { describe, it, expect, beforeEach, vi } from 'vitest';

import { createDropZone } from '../drop-zone';

describe('drop-zone mobile visibility', () => {
  let container: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  it('does not hide the drop panel or drop area on narrow viewports', () => {
    createDropZone(container, vi.fn(), vi.fn());

    const dropPanel = container.querySelector<HTMLElement>('.dn-landing__drop')!;
    const dropArea = container.querySelector<HTMLElement>('.dn-drop-area')!;

    expect(dropPanel).toBeTruthy();
    expect(dropArea).toBeTruthy();

    const panelStyle = getComputedStyle(dropPanel);
    const areaStyle = getComputedStyle(dropArea);

    expect(panelStyle.display).not.toBe('none');
    expect(panelStyle.visibility).not.toBe('hidden');
    expect(areaStyle.display).not.toBe('none');
    expect(areaStyle.visibility).not.toBe('hidden');
  });

  it('keeps the drop area keyboard-focusable on narrow viewports', () => {
    createDropZone(container, vi.fn(), vi.fn());

    const dropArea = container.querySelector<HTMLElement>('.dn-drop-area')!;

    expect(dropArea.tabIndex).toBe(0);
    expect(dropArea.getAttribute('role')).toBe('button');
  });
});
