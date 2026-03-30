import type { ElementDescriptor } from '@/types/core';

export interface Highlighter {
  highlight(descriptor: ElementDescriptor, mouseX: number, mouseY: number): void;
  clear(): void;
  destroy(): void;
}

export function createHighlighter(
  overlayEl: HTMLElement,
  iframeEl: HTMLIFrameElement,
): Highlighter {
  // --- Highlight box ---
  const box = document.createElement('div');
  box.className = 'dn-highlight-box';
  Object.assign(box.style, {
    position: 'absolute',
    pointerEvents: 'none',
    background: 'var(--dn-highlight-bg, rgba(59, 130, 246, 0.15))',
    border: '2px solid var(--dn-highlight-border, rgba(59, 130, 246, 0.8))',
    borderRadius: '2px',
    transition: 'top 0.1s ease, left 0.1s ease, width 0.1s ease, height 0.1s ease, opacity 0.15s ease',
    opacity: '0',
    zIndex: '10000',
  });

  // --- Info tooltip ---
  const tooltip = document.createElement('div');
  tooltip.className = 'dn-highlight-tooltip';
  Object.assign(tooltip.style, {
    position: 'absolute',
    pointerEvents: 'none',
    background: '#1e293b',
    color: '#f1f5f9',
    fontSize: '11px',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    lineHeight: '1.4',
    padding: '4px 8px',
    borderRadius: '4px',
    whiteSpace: 'nowrap',
    zIndex: '10001',
    transition: 'top 0.1s ease, left 0.1s ease, opacity 0.15s ease',
    opacity: '0',
    boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
  });

  overlayEl.appendChild(box);
  overlayEl.appendChild(tooltip);

  function highlight(
    descriptor: ElementDescriptor,
    mouseX: number,
    mouseY: number,
  ): void {
    const iframeRect = iframeEl.getBoundingClientRect();
    const overlayRect = overlayEl.getBoundingClientRect();

    // Element rect is iframe-relative, so offset by iframe position within overlay
    const offsetX = iframeRect.left - overlayRect.left;
    const offsetY = iframeRect.top - overlayRect.top;

    const r = descriptor.rect;

    // Position highlight box
    box.style.left = `${r.x + offsetX}px`;
    box.style.top = `${r.y + offsetY}px`;
    box.style.width = `${r.width}px`;
    box.style.height = `${r.height}px`;
    box.style.opacity = '1';

    // Build tooltip content
    let label = `<${descriptor.tagName}>`;
    if (descriptor.id) {
      label += `#${descriptor.id}`;
    }
    if (descriptor.classes.length > 0) {
      label += `.${descriptor.classes.join('.')}`;
    }
    const dims = `${Math.round(r.width)} × ${Math.round(r.height)}`;
    tooltip.textContent = `${label}  ${dims}`;

    // Position tooltip near the mouse, clamped within overlay
    const tooltipGap = 12;
    let tx = mouseX + tooltipGap;
    let ty = mouseY + tooltipGap;

    // Prevent overflow on the right
    const tooltipWidth = tooltip.offsetWidth || 180;
    if (tx + tooltipWidth > overlayRect.width) {
      tx = mouseX - tooltipWidth - tooltipGap;
    }
    // Prevent overflow on the bottom
    const tooltipHeight = tooltip.offsetHeight || 24;
    if (ty + tooltipHeight > overlayRect.height) {
      ty = mouseY - tooltipHeight - tooltipGap;
    }

    tooltip.style.left = `${tx}px`;
    tooltip.style.top = `${ty}px`;
    tooltip.style.opacity = '1';
  }

  function clear(): void {
    box.style.opacity = '0';
    tooltip.style.opacity = '0';
  }

  function destroy(): void {
    box.remove();
    tooltip.remove();
  }

  return { highlight, clear, destroy };
}
