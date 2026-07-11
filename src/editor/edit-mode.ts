// ============================================================
// Domnotate — Text Edit Mode
// ============================================================
//
// A third interaction mode alongside the element picker. When armed, hovering
// highlights text elements; clicking one makes it contentEditable (rich text,
// preserving inline formatting). Committing an edit emits `edit:commit` — main
// resolves the view scope and records it via the EditManager. Nothing is ever
// written to the source file; the DOM edit is a live preview + the authoring
// gesture, and the captured change is exported as an instruction for an agent.
//
// Mode is sticky: it stays armed across edits until toggled off or Escape.

import type { ElementDescriptor, EventBus, TextEdit, TextEditor, ViewScope } from '@/types/core';
import { generateDescriptor } from '@/picker/selector-engine';
import { createHighlighter, type Highlighter } from '@/picker/highlight';
import { reanchorAnnotation } from '@/output/reanchor';

/** Tags that can never be edited as text even if they contain text nodes. */
const SKIP_TAGS = new Set([
  'SCRIPT',
  'STYLE',
  'IMG',
  'VIDEO',
  'AUDIO',
  'CANVAS',
  'SVG',
  'INPUT',
  'TEXTAREA',
  'SELECT',
  'BR',
  'HR',
]);

interface ActiveField {
  el: HTMLElement;
  descriptor: ElementDescriptor;
  originalHtml: string;
  originalText: string;
}

function generateStableDescriptor(el: HTMLElement): ElementDescriptor {
  const hadEditingClass = el.classList.contains('dn-editing');
  const hadEditedClass = el.classList.contains('dn-edited');
  el.classList.remove('dn-editing', 'dn-edited');
  try {
    return generateDescriptor(el);
  } finally {
    if (hadEditingClass) el.classList.add('dn-editing');
    if (hadEditedClass) el.classList.add('dn-edited');
  }
}

export function createTextEditor(): TextEditor {
  let iframeEl: HTMLIFrameElement;
  let overlayEl: HTMLElement;
  let bus: EventBus;
  let highlighter: Highlighter;
  let active = false;
  let field: ActiveField | null = null;
  // Resolves the logical view scope from the *actual* edited node, so scoped
  // content with a repeated selector stamps the correct scope on the edit
  // rather than main.ts re-querying the selector and taking the first match.
  let resolveScope: ((el: Element) => ViewScope | undefined) | undefined;

  let onMouseMove: ((e: MouseEvent) => void) | null = null;
  let onClick: ((e: MouseEvent) => void) | null = null;
  let onMouseLeave: (() => void) | null = null;
  let rafId: number | null = null;

  function getIframeDoc(): Document | null {
    try {
      return iframeEl.contentDocument;
    } catch {
      return null;
    }
  }

  function toParentCoords(iframeX: number, iframeY: number) {
    const iframeRect = iframeEl.getBoundingClientRect();
    const overlayRect = overlayEl.getBoundingClientRect();
    return {
      x: iframeX + iframeRect.left - overlayRect.left,
      y: iframeY + iframeRect.top - overlayRect.top,
    };
  }

  function isEditableTextElement(el: Element | null): el is HTMLElement {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
    if (SKIP_TAGS.has(el.tagName)) return false;
    return (el.textContent ?? '').trim().length > 0;
  }

  /** Walk up from the clicked node to the nearest text-bearing element. */
  function resolveEditable(el: Element | null): HTMLElement | null {
    const doc = getIframeDoc();
    let cur: Element | null = el;
    while (cur && cur !== doc?.body && cur !== doc?.documentElement) {
      if (isEditableTextElement(cur)) return cur;
      cur = cur.parentElement;
    }
    return null;
  }

  function placeCaret(doc: Document, x: number, y: number): void {
    try {
      const anyDoc = doc as Document & {
        caretRangeFromPoint?: (x: number, y: number) => Range | null;
        caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
      };
      const sel = doc.defaultView?.getSelection();
      if (!sel) return;

      if (typeof anyDoc.caretRangeFromPoint === 'function') {
        const range = anyDoc.caretRangeFromPoint(x, y);
        if (range) {
          sel.removeAllRanges();
          sel.addRange(range);
        }
      } else if (typeof anyDoc.caretPositionFromPoint === 'function') {
        const pos = anyDoc.caretPositionFromPoint(x, y);
        if (pos) {
          const range = doc.createRange();
          range.setStart(pos.offsetNode, pos.offset);
          range.collapse(true);
          sel.removeAllRanges();
          sel.addRange(range);
        }
      }
    } catch {
      // Caret APIs vary by engine; focus alone is an acceptable fallback.
    }
  }

  /** Read the active field and emit an edit if its content changed. */
  function commitField(): void {
    if (!field) return;
    const { el, descriptor, originalHtml, originalText } = field;
    field = null;

    el.contentEditable = 'false';
    el.removeAttribute('contenteditable');
    el.classList.remove('dn-editing');

    const newHtml = el.innerHTML;
    const newText = (el.textContent ?? '').trim();

    const changed = newHtml !== originalHtml || newText !== originalText;
    if (!changed) return;

    el.classList.add('dn-edited');
    const viewScope = resolveScope?.(el);
    bus.emit({
      type: 'edit:commit',
      element: descriptor,
      oldHtml: originalHtml,
      newHtml,
      oldText: originalText,
      newText,
      ...(viewScope && { viewScope }),
    });
  }

  function openField(el: HTMLElement, clientX: number, clientY: number): void {
    // Capture identity + original content BEFORE the edit so selectors and the
    // "before" state reflect the source, not the in-progress text.
    field = {
      el,
      descriptor: generateStableDescriptor(el),
      originalHtml: el.innerHTML,
      originalText: (el.textContent ?? '').trim(),
    };

    el.contentEditable = 'true';
    el.classList.add('dn-editing');
    el.focus();

    const doc = getIframeDoc();
    if (doc) placeCaret(doc, clientX, clientY);

    highlighter.clear();
  }

  const STYLE_ID = 'dn-edit-mode-styles';

  /**
   * Parent CSS can't reach the sandboxed iframe document, so inject the
   * editing/edited affordances directly (once per loaded document).
   */
  function injectStyles(doc: Document): void {
    if (doc.getElementById(STYLE_ID)) return;
    const style = doc.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      [contenteditable="true"].dn-editing {
        outline: 2px solid #C4725A;
        outline-offset: 2px;
        border-radius: 2px;
      }
      .dn-edited {
        background: rgba(196, 114, 90, 0.12);
        box-shadow: inset 2px 0 0 #C4725A;
      }
    `;
    (doc.head ?? doc.documentElement).appendChild(style);
  }

  function init(
    iframe: HTMLIFrameElement,
    overlay: HTMLElement,
    eventBus: EventBus,
    scopeResolver?: (el: Element) => ViewScope | undefined,
  ): void {
    iframeEl = iframe;
    overlayEl = overlay;
    bus = eventBus;
    resolveScope = scopeResolver;
    highlighter = createHighlighter(overlayEl, iframeEl);
    const doc = getIframeDoc();
    if (doc) injectStyles(doc);
  }

  function activate(): void {
    if (active) return;
    active = true;

    const doc = getIframeDoc();
    if (!doc) return;

    doc.documentElement.style.cursor = 'text';

    let pendingEvent: MouseEvent | null = null;
    onMouseMove = (e: MouseEvent) => {
      pendingEvent = e;
      if (rafId !== null) return;

      rafId = requestAnimationFrame(() => {
        rafId = null;
        if (!pendingEvent || !active) return;
        const ev = pendingEvent;
        pendingEvent = null;

        // Don't fight the caret while a field is open.
        if (field) return;

        const target = resolveEditable(ev.target as Element | null);
        if (!target) {
          highlighter.clear();
          return;
        }

        const descriptor = generateDescriptor(target);
        const parent = toParentCoords(ev.clientX, ev.clientY);
        highlighter.highlight(descriptor, parent.x, parent.y);
      });
    };

    onClick = (e: MouseEvent) => {
      const target = e.target as Element | null;

      // Clicks inside the open field move the caret — leave them alone.
      if (field && target && field.el.contains(target)) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      const editable = resolveEditable(target);
      if (!editable) {
        // Clicked a non-text region; commit any open field but don't arm.
        commitField();
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      // Sticky: commit the current field, then open the newly clicked one.
      commitField();
      openField(editable, e.clientX, e.clientY);
    };

    onMouseLeave = () => {
      highlighter.clear();
    };

    doc.addEventListener('mousemove', onMouseMove, true);
    doc.addEventListener('click', onClick, true);
    doc.addEventListener('mouseleave', onMouseLeave);

    bus.emit({ type: 'edit:activate' });
  }

  function deactivate(): void {
    if (!active) return;
    active = false;

    // Commit the open field before tearing down (Esc keeps your work).
    commitField();

    const doc = getIframeDoc();
    if (doc) {
      doc.documentElement.style.cursor = '';
      if (onMouseMove) doc.removeEventListener('mousemove', onMouseMove, true);
      if (onClick) doc.removeEventListener('click', onClick, true);
      if (onMouseLeave) doc.removeEventListener('mouseleave', onMouseLeave);
    }

    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }

    onMouseMove = null;
    onClick = null;
    onMouseLeave = null;
    highlighter.clear();

    bus.emit({ type: 'edit:deactivate' });
  }

  function isActive(): boolean {
    return active;
  }

  function isEditing(): boolean {
    return field !== null;
  }

  function commitPending(): void {
    commitField();
  }

  function applyEdits(edits: TextEdit[]): void {
    const doc = getIframeDoc();
    if (!doc) return;

    for (const edit of edits) {
      const match = reanchorAnnotation(
        edit.element,
        doc,
        edit.viewScope ? { viewScope: edit.viewScope } : undefined,
      );
      if (match?.element) {
        match.element.innerHTML = edit.newHtml;
        (match.element as HTMLElement).classList?.add('dn-edited');
      }
    }
  }

  function revertEdit(edit: TextEdit): boolean {
    const doc = getIframeDoc();
    if (!doc) return false;

    const match = reanchorAnnotation(
      edit.element,
      doc,
      edit.viewScope ? { viewScope: edit.viewScope } : undefined,
    );
    if (!match?.element) return false;

    match.element.innerHTML = edit.oldHtml;
    (match.element as HTMLElement).classList?.remove('dn-edited');
    return true;
  }

  function clearEditedMarker(element: ElementDescriptor, viewScope?: TextEdit['viewScope']): boolean {
    const doc = getIframeDoc();
    if (!doc) return false;

    const match = reanchorAnnotation(
      element,
      doc,
      viewScope ? { viewScope } : undefined,
    );
    if (!match?.element) return false;

    (match.element as HTMLElement).classList?.remove('dn-edited');
    return true;
  }

  return {
    init,
    activate,
    deactivate,
    isActive,
    isEditing,
    commitPending,
    applyEdits,
    revertEdit,
    clearEditedMarker,
  };
}
