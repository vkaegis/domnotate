// ============================================================
// Domnotate — Comment Popup
// ============================================================

import type { EventBus, Annotation } from '@/types/core';
import { buildThread, flattenThread, type ThreadNode } from '@/annotations/thread';

const POPUP_WIDTH = 300;
const POPUP_MAX_HEIGHT = 400;

export function createCommentPopup(
  overlayEl: HTMLElement,
  bus: EventBus,
): {
  show(
    annotation: Annotation | null,
    x: number,
    y: number,
    onSubmit: (text: string) => void,
    onClose: () => void,
  ): void;
  hide(): void;
  destroy(): void;
} {
  // Suppress unused warning — bus reserved for future events
  void bus;

  let currentOnClose: (() => void) | null = null;

  // --- Build container ---
  const popup = document.createElement('div');
  Object.assign(popup.style, {
    position: 'absolute',
    width: `${POPUP_WIDTH}px`,
    maxHeight: `${POPUP_MAX_HEIGHT}px`,
    background: 'var(--dn-bg-overlay)',
    border: '1px solid var(--dn-border)',
    borderRadius: 'var(--dn-radius-md)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
    display: 'none',
    flexDirection: 'column',
    overflow: 'hidden',
    zIndex: 'var(--dn-z-popup)',
    pointerEvents: 'auto',
    fontFamily: 'system-ui, sans-serif',
    color: 'var(--dn-text-primary)',
  });

  overlayEl.appendChild(popup);

  // --- Escape key handler ---
  function onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      hide();
    }
  }

  // --- Render: New annotation (no existing annotation) ---
  function renderNewForm(onSubmit: (text: string) => void): void {
    popup.innerHTML = '';

    // Header
    const header = document.createElement('div');
    Object.assign(header.style, {
      padding: '12px 14px 8px',
      fontSize: '13px',
      fontWeight: '600',
      color: 'var(--dn-text-secondary)',
      borderBottom: '1px solid var(--dn-border)',
    });
    header.textContent = 'Add annotation';
    popup.appendChild(header);

    // Input area
    const inputWrap = document.createElement('div');
    Object.assign(inputWrap.style, { padding: '12px 14px' });

    const textarea = document.createElement('textarea');
    textarea.placeholder = 'Write a comment...';
    textarea.rows = 3;
    Object.assign(textarea.style, {
      width: '100%',
      padding: '8px 10px',
      border: '1px solid var(--dn-border)',
      borderRadius: 'var(--dn-radius-sm)',
      background: 'var(--dn-bg-secondary)',
      color: 'var(--dn-text-primary)',
      fontSize: '13px',
      lineHeight: '1.4',
      resize: 'vertical',
      outline: 'none',
      boxSizing: 'border-box',
      fontFamily: 'inherit',
    });

    const btnRow = document.createElement('div');
    Object.assign(btnRow.style, {
      display: 'flex',
      justifyContent: 'flex-end',
      gap: '8px',
      marginTop: '8px',
    });

    const cancelBtn = makeButton('Cancel', false, () => hide());
    const addBtn = makeButton('Add', true, () => {
      const text = textarea.value.trim();
      if (text) onSubmit(text);
    });

    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(addBtn);
    inputWrap.appendChild(textarea);
    inputWrap.appendChild(btnRow);
    popup.appendChild(inputWrap);

    // Focus after display
    requestAnimationFrame(() => textarea.focus());
  }

  // --- Render: Existing annotation with threaded comments ---
  function renderThread(
    annotation: Annotation,
    onSubmit: (text: string) => void,
  ): void {
    popup.innerHTML = '';

    // Header
    const header = document.createElement('div');
    Object.assign(header.style, {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '10px 14px',
      borderBottom: '1px solid var(--dn-border)',
    });

    const titleEl = document.createElement('span');
    titleEl.textContent = `Annotation #${annotation.id.slice(0, 6)}`;
    Object.assign(titleEl.style, {
      fontSize: '13px',
      fontWeight: '600',
      color: 'var(--dn-text-secondary)',
    });

    const statusBadge = document.createElement('span');
    statusBadge.textContent = annotation.status;
    Object.assign(statusBadge.style, {
      fontSize: '11px',
      fontWeight: '500',
      padding: '2px 8px',
      borderRadius: 'var(--dn-radius-pill)',
      background:
        annotation.status === 'open'
          ? 'var(--dn-accent-subtle)'
          : 'rgba(34,197,94,0.15)',
      color:
        annotation.status === 'open' ? 'var(--dn-accent)' : '#22c55e',
    });

    header.appendChild(titleEl);
    header.appendChild(statusBadge);
    popup.appendChild(header);

    // Comment list (scrollable)
    const commentList = document.createElement('div');
    Object.assign(commentList.style, {
      maxHeight: '220px',
      overflowY: 'auto',
      padding: '8px 14px',
    });

    const thread = buildThread(annotation.comments);
    const flat = flattenThread(thread);

    if (flat.length === 0) {
      const empty = document.createElement('div');
      empty.textContent = 'No comments yet.';
      Object.assign(empty.style, {
        fontSize: '13px',
        color: 'var(--dn-text-muted)',
        padding: '8px 0',
      });
      commentList.appendChild(empty);
    } else {
      for (const node of flat) {
        commentList.appendChild(renderCommentNode(node));
      }
    }

    popup.appendChild(commentList);

    // Reply input
    const replyWrap = document.createElement('div');
    Object.assign(replyWrap.style, {
      padding: '8px 14px 12px',
      borderTop: '1px solid var(--dn-border)',
    });

    const replyInput = document.createElement('input');
    replyInput.type = 'text';
    replyInput.placeholder = 'Reply...';
    Object.assign(replyInput.style, {
      width: '100%',
      padding: '7px 10px',
      border: '1px solid var(--dn-border)',
      borderRadius: 'var(--dn-radius-sm)',
      background: 'var(--dn-bg-secondary)',
      color: 'var(--dn-text-primary)',
      fontSize: '13px',
      outline: 'none',
      boxSizing: 'border-box',
      fontFamily: 'inherit',
    });

    replyInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const text = replyInput.value.trim();
        if (text) onSubmit(text);
      }
    });

    const actionRow = document.createElement('div');
    Object.assign(actionRow.style, {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: '8px',
    });

    const resolveBtn = makeButton(
      annotation.status === 'open' ? 'Resolve' : 'Reopen',
      false,
      () => {
        bus.emit({
          type: 'annotation:update',
          annotation: {
            ...annotation,
            status: annotation.status === 'open' ? 'resolved' : 'open',
            updatedAt: new Date().toISOString(),
          },
        });
        hide();
      },
    );

    const replyBtn = makeButton('Reply', true, () => {
      const text = replyInput.value.trim();
      if (text) onSubmit(text);
    });

    actionRow.appendChild(resolveBtn);
    actionRow.appendChild(replyBtn);
    replyWrap.appendChild(replyInput);
    replyWrap.appendChild(actionRow);
    popup.appendChild(replyWrap);

    requestAnimationFrame(() => replyInput.focus());
  }

  // --- Render a single threaded comment ---
  function renderCommentNode(node: ThreadNode): HTMLElement {
    const el = document.createElement('div');
    Object.assign(el.style, {
      marginLeft: `${node.depth * 16}px`,
      padding: '6px 0',
      borderBottom: '1px solid rgba(255,255,255,0.04)',
    });

    const meta = document.createElement('div');
    Object.assign(meta.style, {
      display: 'flex',
      alignItems: 'baseline',
      gap: '6px',
      marginBottom: '2px',
    });

    const author = document.createElement('span');
    author.textContent = node.authorName;
    Object.assign(author.style, {
      fontSize: '12px',
      fontWeight: '600',
      color: 'var(--dn-text-primary)',
    });

    const time = document.createElement('span');
    time.textContent = formatTime(node.createdAt);
    Object.assign(time.style, {
      fontSize: '11px',
      color: 'var(--dn-text-muted)',
    });

    meta.appendChild(author);
    meta.appendChild(time);

    const body = document.createElement('div');
    body.textContent = node.text;
    Object.assign(body.style, {
      fontSize: '13px',
      lineHeight: '1.4',
      color: 'var(--dn-text-secondary)',
    });

    el.appendChild(meta);
    el.appendChild(body);
    return el;
  }

  // --- Shared button helper ---
  function makeButton(
    label: string,
    primary: boolean,
    onClick: () => void,
  ): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = label;
    Object.assign(btn.style, {
      padding: '6px 14px',
      border: primary ? 'none' : '1px solid var(--dn-border)',
      borderRadius: 'var(--dn-radius-sm)',
      background: primary ? 'var(--dn-accent)' : 'transparent',
      color: primary ? '#fff' : 'var(--dn-text-secondary)',
      fontSize: '12px',
      fontWeight: '500',
      cursor: 'pointer',
      fontFamily: 'inherit',
    });
    btn.addEventListener('click', onClick);
    return btn;
  }

  // --- Time formatting ---
  function formatTime(iso: string): string {
    try {
      const d = new Date(iso);
      const now = Date.now();
      const diff = now - d.getTime();
      if (diff < 60_000) return 'just now';
      if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
      if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
      return d.toLocaleDateString();
    } catch {
      return '';
    }
  }

  // --- Viewport clamping ---
  function clampPosition(x: number, y: number): { left: number; top: number } {
    const overlayRect = overlayEl.getBoundingClientRect();
    const maxX = overlayRect.width - POPUP_WIDTH - 8;
    const maxY = overlayRect.height - POPUP_MAX_HEIGHT - 8;

    return {
      left: Math.max(8, Math.min(x, maxX)),
      top: Math.max(8, Math.min(y, maxY)),
    };
  }

  // --- Public API ---

  function show(
    annotation: Annotation | null,
    x: number,
    y: number,
    onSubmit: (text: string) => void,
    onClose: () => void,
  ): void {
    currentOnClose = onClose;

    if (annotation) {
      renderThread(annotation, onSubmit);
    } else {
      renderNewForm(onSubmit);
    }

    const { left, top } = clampPosition(x, y);
    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;
    popup.style.display = 'flex';

    document.addEventListener('keydown', onKeyDown);
  }

  function hide(): void {
    popup.style.display = 'none';
    popup.innerHTML = '';
    document.removeEventListener('keydown', onKeyDown);
    if (currentOnClose) {
      const fn = currentOnClose;
      currentOnClose = null;
      fn();
    }
  }

  return {
    show,
    hide,
    destroy(): void {
      hide();
      popup.remove();
    },
  };
}
