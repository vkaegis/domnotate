import { describe, expect, test, vi } from 'vitest';
import {
  ACTIVATION_STRATEGIES,
  activateScopeRecord,
  selectActivationStrategy,
  type ActivationContext,
} from '@/slides/activation-strategy';
import type { ScopeRecord } from '@/slides/view-scope-records';
import type { ViewScope } from '@/types/core';

function makeScope(overrides: Partial<ViewScope> = {}): ViewScope {
  return {
    kind: 'tabpanel',
    id: 'panel-0',
    index: 0,
    selector: '#panel-0',
    ...overrides,
  };
}

function makeRecord(
  el: Element,
  overrides: Partial<ScopeRecord> = {},
  scope?: Partial<ViewScope>,
): ScopeRecord {
  return {
    el,
    scope: makeScope(scope),
    ...overrides,
  };
}

function makeContext(
  doc: Document,
  recordEl: Element,
  scope: Partial<ViewScope>,
  recordOverrides: Partial<ScopeRecord> = {},
  win: ActivationContext['win'] = null,
  extraRecords: ScopeRecord[] = [],
): ActivationContext {
  const record = makeRecord(recordEl, recordOverrides, scope);
  return {
    record,
    records: [record, ...extraRecords],
    doc,
    win,
  };
}

describe('activation strategy registry', () => {
  test('exposes all named strategies in priority order', () => {
    expect(ACTIVATION_STRATEGIES.map((s) => s.id)).toEqual([
      'custom-activate',
      'noop',
      'click-controller',
      'radio-input',
      'call-goTo',
      'set-hash',
      'set-hidden',
      'toggle-active',
    ]);
  });

  test('custom-activate runs the record callback and short-circuits', () => {
    const doc = document.implementation.createHTMLDocument();
    const el = doc.createElement('div');
    doc.body.appendChild(el);
    const activate = vi.fn();
    const ctx = makeContext(doc, el, { activation: 'toggle-active' }, { activate });

    const strategy = selectActivationStrategy(ctx);

    expect(strategy?.id).toBe('custom-activate');
    expect(activateScopeRecord(ctx.record, ctx.records, ctx.doc, ctx.win)).toBe(true);
    expect(activate).toHaveBeenCalledOnce();
  });

  test('noop preserves DOM state for unrestorable scopes', () => {
    const doc = document.implementation.createHTMLDocument();
    const el = doc.createElement('div');
    el.classList.add('untouched');
    doc.body.appendChild(el);
    const ctx = makeContext(doc, el, { activation: 'noop' });

    const strategy = selectActivationStrategy(ctx);

    expect(strategy?.id).toBe('noop');
    expect(activateScopeRecord(ctx.record, ctx.records, ctx.doc, ctx.win)).toBe(true);
    expect(el.classList.contains('untouched')).toBe(true);
  });

  test('click-controller clicks the resolved controller element', () => {
    const doc = document.implementation.createHTMLDocument();
    const panel = doc.createElement('section');
    panel.id = 'panel-0';
    const controller = doc.createElement('button');
    controller.id = 'tab-0';
    controller.setAttribute('aria-controls', 'panel-0');
    doc.body.appendChild(controller);
    doc.body.appendChild(panel);

    const click = vi.spyOn(controller, 'click');
    const ctx = makeContext(doc, panel, {
      activation: 'click-controller',
      controllerSelector: '#tab-0',
    });

    expect(activateScopeRecord(ctx.record, ctx.records, ctx.doc, ctx.win)).toBe(true);
    expect(click).toHaveBeenCalledOnce();
  });

  test('radio-input falls back to setting checked + dispatching change when no controller is clickable', () => {
    const doc = document.implementation.createHTMLDocument();
    const panel = doc.createElement('section');
    panel.id = 'panel-0';
    const input = doc.createElement('input');
    input.type = 'radio';
    input.id = 'tab-0';
    doc.body.appendChild(input);
    doc.body.appendChild(panel);

    const change = vi.fn();
    input.addEventListener('change', change);

    const ctx = makeContext(doc, panel, {
      activation: 'radio-input',
      controllerSelector: 'label[for="tab-0"]',
    });

    const strategy = selectActivationStrategy(ctx);

    expect(strategy?.id).toBe('radio-input');
    expect(activateScopeRecord(ctx.record, ctx.records, ctx.doc, ctx.win)).toBe(true);
    expect(input.checked).toBe(true);
    expect(change).toHaveBeenCalledOnce();
  });

  test('call-goTo invokes the iframe goTo function with the scope index', () => {
    const doc = document.implementation.createHTMLDocument();
    const slide = doc.createElement('section');
    doc.body.appendChild(slide);
    const goTo = vi.fn();
    const ctx = makeContext(
      doc,
      slide,
      { activation: 'call-goTo', index: 2 },
      {},
      { goTo } as unknown as ActivationContext['win'],
    );

    expect(activateScopeRecord(ctx.record, ctx.records, ctx.doc, ctx.win)).toBe(true);
    expect(goTo).toHaveBeenCalledWith(2);
  });

  test('set-hash updates the iframe location hash', () => {
    const doc = document.implementation.createHTMLDocument();
    const section = doc.createElement('section');
    section.id = 'details';
    doc.body.appendChild(section);
    const win = { location: { hash: '' } } as unknown as ActivationContext['win'];
    const ctx = makeContext(
      doc,
      section,
      { activation: 'set-hash', id: 'details' },
      {},
      win,
    );

    expect(activateScopeRecord(ctx.record, ctx.records, ctx.doc, ctx.win)).toBe(true);
    expect((win as unknown as { location: { hash: string } }).location.hash).toBe('#details');
  });

  test('toggle-active flips the active class across same-kind records', () => {
    const doc = document.implementation.createHTMLDocument();
    const a = doc.createElement('section');
    a.classList.add('active');
    const b = doc.createElement('section');
    doc.body.appendChild(a);
    doc.body.appendChild(b);

    const recordA = makeRecord(a, {}, { activation: 'toggle-active', id: 'a' });
    const recordB = makeRecord(b, {}, { activation: 'toggle-active', id: 'b' });

    activateScopeRecord(recordB, [recordA, recordB], doc, null);

    expect(a.classList.contains('active')).toBe(false);
    expect(b.classList.contains('active')).toBe(true);
  });

  test('toggle-active leaves records in other activation groups unchanged', () => {
    const doc = document.implementation.createHTMLDocument();
    const groupA = doc.createElement('section');
    const groupB = doc.createElement('section');
    const a = doc.createElement('div');
    const b0 = doc.createElement('div');
    const b1 = doc.createElement('div');
    a.classList.add('active');
    b0.classList.add('active');
    groupA.appendChild(a);
    groupB.appendChild(b0);
    groupB.appendChild(b1);
    doc.body.appendChild(groupA);
    doc.body.appendChild(groupB);

    const recordA = makeRecord(a, {}, { activation: 'toggle-active', id: 'a' });
    const recordB0 = makeRecord(b0, {}, { activation: 'toggle-active', id: 'b0' });
    const recordB1 = makeRecord(b1, {}, { activation: 'toggle-active', id: 'b1' });

    activateScopeRecord(recordB1, [recordA, recordB0, recordB1], doc, null);

    expect(a.classList.contains('active')).toBe(true);
    expect(b0.classList.contains('active')).toBe(false);
    expect(b1.classList.contains('active')).toBe(true);
  });

  test('set-hidden toggles hidden/aria-hidden across the records list', () => {
    const doc = document.implementation.createHTMLDocument();
    const a = doc.createElement('section') as HTMLElement;
    a.hidden = false;
    const b = doc.createElement('section') as HTMLElement;
    b.hidden = true;
    doc.body.appendChild(a);
    doc.body.appendChild(b);

    const recordA = makeRecord(a, {}, { activation: 'set-hidden', id: 'a' });
    const recordB = makeRecord(b, {}, { activation: 'set-hidden', id: 'b' });

    activateScopeRecord(recordB, [recordA, recordB], doc, null);

    expect(a.hidden).toBe(true);
    expect(b.hidden).toBe(false);
    expect(b.getAttribute('aria-hidden')).toBe('false');
  });

  test('set-hidden leaves records in other activation groups unchanged', () => {
    const doc = document.implementation.createHTMLDocument();
    const groupA = doc.createElement('section');
    const groupB = doc.createElement('section');
    const a = doc.createElement('div') as HTMLElement;
    const b0 = doc.createElement('div') as HTMLElement;
    const b1 = doc.createElement('div') as HTMLElement;
    a.hidden = false;
    b0.hidden = false;
    b1.hidden = true;
    groupA.appendChild(a);
    groupB.appendChild(b0);
    groupB.appendChild(b1);
    doc.body.appendChild(groupA);
    doc.body.appendChild(groupB);

    const recordA = makeRecord(a, {}, { activation: 'set-hidden', id: 'a' });
    const recordB0 = makeRecord(b0, {}, { activation: 'set-hidden', id: 'b0' });
    const recordB1 = makeRecord(b1, {}, { activation: 'set-hidden', id: 'b1' });

    activateScopeRecord(recordB1, [recordA, recordB0, recordB1], doc, null);

    expect(a.hidden).toBe(false);
    expect(b0.hidden).toBe(true);
    expect(b1.hidden).toBe(false);
  });

  test('returns false when no strategy can handle the record', () => {
    const doc = document.implementation.createHTMLDocument();
    const el = doc.createElement('div');
    doc.body.appendChild(el);
    const record = makeRecord(el, {}, { activation: 'click-controller', controllerSelector: '#missing' });

    expect(activateScopeRecord(record, [record], doc, null)).toBe(false);
  });
});
