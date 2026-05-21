// ============================================================
// Domnotate — Diagnostics Panel (debug-only)
// ============================================================

import {
  describePinVisibility,
  generateScopeDiagnostics,
  type PinVisibilityReason,
  type ScopeDiagnosticsSnapshot,
} from '@/diagnostics/scope-diagnostics';
import { scopeAnnotationToCurrentPanel } from '@/diagnostics/scope-override';
import type {
  AnnotationManager,
  EventBus,
  SlideObserver,
  ViewScope,
} from '@/types/core';

const PANEL_QUERY_FLAG = 'dn-debug';

export function isDiagnosticsEnabled(search: string = window.location.search): boolean {
  const params = new URLSearchParams(search);
  return params.has(PANEL_QUERY_FLAG);
}

export interface DiagnosticsPanel {
  destroy(): void;
}

export interface DiagnosticsPanelDeps {
  bus: EventBus;
  manager: AnnotationManager;
  observer: SlideObserver;
  getIframeDocument: () => Document | null;
}

export function mountDiagnosticsPanel(
  container: HTMLElement,
  deps: DiagnosticsPanelDeps,
): DiagnosticsPanel {
  const { bus, manager, observer, getIframeDocument } = deps;
  const root = document.createElement('aside');
  root.className = 'dn-diagnostics-panel';
  root.setAttribute('data-dn-debug', 'scope');
  applyBaseStyles(root);

  const header = document.createElement('div');
  header.className = 'dn-diagnostics-panel__header';
  header.textContent = 'Scope Diagnostics';
  applyHeaderStyles(header);
  root.appendChild(header);

  const detection = section('Detection');
  const scopesEl = section('Detected scopes');
  const selectedEl = section('Selected annotation');
  const overrideEl = document.createElement('div');
  applyOverrideStyles(overrideEl);
  selectedEl.body.appendChild(overrideEl);

  root.appendChild(detection.wrapper);
  root.appendChild(scopesEl.wrapper);
  root.appendChild(selectedEl.wrapper);

  container.appendChild(root);

  let selectedId: string | null = null;

  function render(): void {
    const snapshot = generateScopeDiagnostics(observer);
    detection.body.firstChild?.remove();
    detection.body.appendChild(renderDetection(snapshot));

    scopesEl.body.firstChild?.remove();
    scopesEl.body.appendChild(renderScopes(snapshot));

    overrideEl.innerHTML = '';
    const headingNode = selectedEl.body.firstChild;
    if (headingNode && headingNode !== overrideEl) {
      headingNode.remove();
    }
    selectedEl.body.insertBefore(renderSelected(), overrideEl);
  }

  function renderSelected(): HTMLElement {
    const wrap = document.createElement('div');
    if (!selectedId) {
      wrap.textContent = 'No annotation selected.';
      return wrap;
    }
    const annotation = manager.getById(selectedId);
    if (!annotation) {
      wrap.textContent = 'Selected annotation not found.';
      return wrap;
    }
    const report = describePinVisibility(annotation, observer);

    const summary = document.createElement('div');
    summary.textContent = `Pin ${report.visible ? 'VISIBLE' : 'HIDDEN'} — ${describeReason(report.reason)}`;
    summary.style.fontWeight = '600';
    wrap.appendChild(summary);

    if (report.storedScope) {
      wrap.appendChild(kv('Stored scope', `${report.storedScope.kind}:${report.storedScope.id}`));
    } else if (report.storedSlideIndex !== undefined) {
      wrap.appendChild(kv('Legacy slideIndex', String(report.storedSlideIndex)));
    } else {
      wrap.appendChild(kv('Stored scope', '(none — unscoped)'));
    }

    overrideEl.innerHTML = '';
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Scope to current panel';
    applyButtonStyles(button);
    button.addEventListener('click', () => {
      const applied = scopeAnnotationToCurrentPanel(
        manager,
        observer,
        getIframeDocument(),
        annotation.id,
      );
      if (!applied) {
        button.textContent = 'No active panel to scope to';
        setTimeout(() => {
          button.textContent = 'Scope to current panel';
        }, 1500);
      }
    });
    overrideEl.appendChild(button);

    const clear = document.createElement('button');
    clear.type = 'button';
    clear.textContent = 'Clear scope';
    applyButtonStyles(clear);
    clear.style.marginLeft = '6px';
    clear.addEventListener('click', () => {
      manager.updateScope(annotation.id, null);
    });
    overrideEl.appendChild(clear);

    return wrap;
  }

  const unsubs: Array<() => void> = [];
  unsubs.push(bus.on('annotation:select', (e) => {
    selectedId = e.id;
    render();
  }));
  unsubs.push(bus.on('annotation:deselect', () => {
    selectedId = null;
    render();
  }));
  unsubs.push(bus.on('annotation:create', () => render()));
  unsubs.push(bus.on('annotation:update', () => render()));
  unsubs.push(bus.on('annotation:delete', (e) => {
    if (selectedId === e.id) selectedId = null;
    render();
  }));
  unsubs.push(bus.on('scope:changed', () => render()));
  unsubs.push(bus.on('slide:changed', () => render()));
  unsubs.push(bus.on('session:loaded', () => render()));
  unsubs.push(bus.on('session:cleared', () => {
    selectedId = null;
    render();
  }));
  unsubs.push(bus.on('content:loaded', () => render()));
  unsubs.push(bus.on('content:unloaded', () => {
    selectedId = null;
    render();
  }));

  render();

  return {
    destroy(): void {
      for (const unsub of unsubs) unsub();
      root.remove();
    },
  };
}

function describeReason(reason: PinVisibilityReason): string {
  switch (reason.kind) {
    case 'unscoped-document':
      return 'document has no detected scopes';
    case 'unscoped-annotation':
      return 'annotation has no stored scope';
    case 'scope-active':
      return `stored scope matches active "${reason.matchedScope.label ?? reason.matchedScope.id}"`;
    case 'scope-inactive':
      return `stored scope "${reason.storedScope.label ?? reason.storedScope.id}" is not active`;
    case 'legacy-slide-matches':
      return `legacy slideIndex ${reason.slideIndex} matches active slide`;
    case 'legacy-slide-mismatch':
      return `legacy slideIndex ${reason.slideIndex} does not match active slide`;
  }
}

function renderDetection(snapshot: ScopeDiagnosticsSnapshot): HTMLElement {
  const list = document.createElement('div');
  list.appendChild(kv('Source', snapshot.detection.source ?? '(none)'));
  list.appendChild(kv(
    'Source confidence',
    snapshot.detection.sourceConfidence === null ? '—' : String(snapshot.detection.sourceConfidence),
  ));
  list.appendChild(kv('Detected scopes', String(snapshot.scopes.length)));
  list.appendChild(kv('Active scopes', String(snapshot.activeScopes.length)));
  if (snapshot.flags.segmentedButNoneActive) {
    const warn = document.createElement('div');
    warn.textContent = '⚠ scopes detected but none active — pin filtering will hide every scoped annotation';
    warn.style.color = '#c4725a';
    warn.style.marginTop = '4px';
    list.appendChild(warn);
  }
  return list;
}

function renderScopes(snapshot: ScopeDiagnosticsSnapshot): HTMLElement {
  if (snapshot.scopes.length === 0) {
    const empty = document.createElement('div');
    empty.textContent = '(none)';
    return empty;
  }
  const list = document.createElement('ol');
  list.style.paddingLeft = '20px';
  list.style.margin = '0';
  for (const { scope, active } of snapshot.scopes) {
    list.appendChild(renderScopeEntry(scope, active));
  }
  return list;
}

function renderScopeEntry(scope: ViewScope, active: boolean): HTMLElement {
  const li = document.createElement('li');
  li.style.padding = '2px 0';
  const title = document.createElement('div');
  title.textContent = `${active ? '● ' : '○ '}${scope.kind} — ${scope.label ?? scope.id}`;
  title.style.fontWeight = active ? '600' : '400';
  li.appendChild(title);
  const meta = document.createElement('div');
  meta.style.fontSize = '11px';
  meta.style.color = '#888';
  meta.textContent = `id=${scope.id} · selector=${scope.selector} · activation=${scope.activation ?? '—'}`;
  li.appendChild(meta);
  return li;
}

function section(title: string): { wrapper: HTMLElement; body: HTMLElement } {
  const wrapper = document.createElement('section');
  wrapper.style.marginTop = '8px';
  const heading = document.createElement('div');
  heading.textContent = title;
  heading.style.fontSize = '11px';
  heading.style.textTransform = 'uppercase';
  heading.style.letterSpacing = '0.06em';
  heading.style.color = '#888';
  heading.style.marginBottom = '4px';
  wrapper.appendChild(heading);
  const body = document.createElement('div');
  wrapper.appendChild(body);
  return { wrapper, body };
}

function kv(key: string, value: string): HTMLElement {
  const row = document.createElement('div');
  row.style.display = 'flex';
  row.style.justifyContent = 'space-between';
  row.style.gap = '12px';
  const k = document.createElement('span');
  k.textContent = key;
  k.style.color = '#888';
  const v = document.createElement('span');
  v.textContent = value;
  v.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, monospace';
  v.style.fontSize = '12px';
  row.appendChild(k);
  row.appendChild(v);
  return row;
}

function applyBaseStyles(el: HTMLElement): void {
  Object.assign(el.style, {
    position: 'fixed',
    right: '12px',
    bottom: '12px',
    width: '320px',
    maxHeight: '60vh',
    overflow: 'auto',
    background: 'var(--dn-surface, #fff)',
    color: 'var(--dn-text, #222)',
    border: '1px solid var(--dn-border, #ccc)',
    borderRadius: '8px',
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.18)',
    padding: '12px',
    font: '13px/1.4 system-ui, sans-serif',
    zIndex: '9999',
  });
}

function applyHeaderStyles(el: HTMLElement): void {
  Object.assign(el.style, {
    fontSize: '12px',
    fontWeight: '700',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: '#666',
    marginBottom: '6px',
  });
}

function applyOverrideStyles(el: HTMLElement): void {
  Object.assign(el.style, {
    marginTop: '8px',
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px',
  });
}

function applyButtonStyles(el: HTMLButtonElement): void {
  Object.assign(el.style, {
    padding: '4px 8px',
    fontSize: '12px',
    border: '1px solid var(--dn-border, #ccc)',
    background: 'var(--dn-surface-2, #f6f6f6)',
    color: 'inherit',
    borderRadius: '4px',
    cursor: 'pointer',
  });
}
