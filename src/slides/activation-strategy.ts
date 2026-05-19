import type { ViewScope } from '@/types/core';
import {
  recordsInSameActivationGroup,
  type ScopeRecord,
} from '@/slides/view-scope-records';

type ActivatableWindow = Window & {
  goTo?: (index: number) => void;
  location?: { hash?: string };
};

export type ActivationContext = {
  record: ScopeRecord;
  records: ScopeRecord[];
  doc: Document;
  win: ActivatableWindow | null;
};

export type ActivationStrategyId =
  | 'custom-activate'
  | 'click-controller'
  | 'radio-input'
  | 'call-goTo'
  | 'set-hash'
  | 'set-hidden'
  | 'toggle-active'
  | 'noop';

export type ActivationStrategy = {
  id: ActivationStrategyId;
  canHandle(ctx: ActivationContext): boolean;
  activate(ctx: ActivationContext): boolean;
};

function setHiddenActivation(records: ScopeRecord[], scope: ViewScope): void {
  for (const record of records) {
    const isActive = record.scope.id === scope.id;
    const htmlLike = record.el as Element & { hidden?: boolean };
    if ('hidden' in htmlLike) {
      htmlLike.hidden = !isActive;
    } else if (isActive) {
      record.el.removeAttribute('hidden');
    } else {
      record.el.setAttribute('hidden', '');
    }
    record.el.setAttribute('aria-hidden', isActive ? 'false' : 'true');
  }
}

function setActiveActivation(records: ScopeRecord[], scope: ViewScope): void {
  for (const record of records) {
    record.el.classList.toggle('active', record.scope.id === scope.id);
  }
}

function clickElement(el: Element | null): boolean {
  const clickable = el as (Element & { click?: () => void }) | null;
  if (typeof clickable?.click !== 'function') return false;
  clickable.click();
  return true;
}

function findRadioInputFromController(doc: Document, scope: ViewScope): HTMLInputElement | null {
  const selector = scope.controllerSelector;
  if (!selector) return null;
  const labelMatch = selector.match(/^label\[for="(.+)"\]$/);
  if (!labelMatch) return null;
  const id = labelMatch[1].replace(/\\(.)/g, '$1');
  const input = doc.getElementById(id);
  if (!input || (input as HTMLInputElement).type !== 'radio') return null;
  return input as HTMLInputElement;
}

const customActivateStrategy: ActivationStrategy = {
  id: 'custom-activate',
  canHandle: ({ record }) => typeof record.activate === 'function',
  activate: ({ record }) => {
    record.activate?.();
    return true;
  },
};

const clickControllerStrategy: ActivationStrategy = {
  id: 'click-controller',
  canHandle: ({ record, doc }) => {
    if (record.scope.activation !== 'click-controller') return false;
    if (!record.scope.controllerSelector) return false;
    return doc.querySelector(record.scope.controllerSelector) !== null;
  },
  activate: ({ record, doc }) => {
    const controller = doc.querySelector(record.scope.controllerSelector!);
    return clickElement(controller);
  },
};

const radioInputStrategy: ActivationStrategy = {
  id: 'radio-input',
  canHandle: ({ record, doc }) => {
    if (record.scope.activation !== 'radio-input' && record.scope.activation !== 'click-controller') {
      return false;
    }
    return findRadioInputFromController(doc, record.scope) !== null;
  },
  activate: ({ record, doc }) => {
    const input = findRadioInputFromController(doc, record.scope);
    if (!input) return false;
    input.checked = true;
    const EventCtor = input.ownerDocument.defaultView?.Event ?? Event;
    input.dispatchEvent(new EventCtor('change', { bubbles: true }));
    return true;
  },
};

const callGoToStrategy: ActivationStrategy = {
  id: 'call-goTo',
  canHandle: ({ record, win }) =>
    record.scope.activation === 'call-goTo' && typeof win?.goTo === 'function',
  activate: ({ record, win }) => {
    win!.goTo!(record.scope.index);
    return true;
  },
};

const setHashStrategy: ActivationStrategy = {
  id: 'set-hash',
  canHandle: ({ record, win }) =>
    record.scope.activation === 'set-hash' && win?.location !== undefined,
  activate: ({ record, win }) => {
    win!.location!.hash = `#${record.scope.id}`;
    return true;
  },
};

const setHiddenStrategy: ActivationStrategy = {
  id: 'set-hidden',
  canHandle: ({ record }) => record.scope.activation === 'set-hidden',
  activate: ({ record, records }) => {
    setHiddenActivation(recordsInSameActivationGroup(record, records), record.scope);
    return true;
  },
};

const toggleActiveStrategy: ActivationStrategy = {
  id: 'toggle-active',
  canHandle: ({ record }) => {
    const activation = record.scope.activation;
    return activation === undefined || activation === 'toggle-active';
  },
  activate: ({ record, records }) => {
    setActiveActivation(records, record.scope);
    return true;
  },
};

const noopStrategy: ActivationStrategy = {
  id: 'noop',
  canHandle: ({ record }) => record.scope.activation === 'noop',
  activate: () => true,
};

export const ACTIVATION_STRATEGIES: ActivationStrategy[] = [
  customActivateStrategy,
  noopStrategy,
  clickControllerStrategy,
  radioInputStrategy,
  callGoToStrategy,
  setHashStrategy,
  setHiddenStrategy,
  toggleActiveStrategy,
];

export function selectActivationStrategy(ctx: ActivationContext): ActivationStrategy | null {
  return ACTIVATION_STRATEGIES.find((strategy) => strategy.canHandle(ctx)) ?? null;
}

export function activateScopeRecord(
  record: ScopeRecord,
  records: ScopeRecord[],
  doc: Document,
  win: ActivatableWindow | null,
): boolean {
  const ctx: ActivationContext = { record, records, doc, win };
  const strategy = selectActivationStrategy(ctx);
  if (!strategy) return false;
  return strategy.activate(ctx);
}
