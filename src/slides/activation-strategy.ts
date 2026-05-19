import type { ViewScope } from '@/types/core';
import { type ScopeRecord } from '@/slides/view-scope-records';

type ActivatableWindow = Window & {
  goTo?: (index: number) => void;
  location?: { hash?: string };
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

export function activateScopeRecord(
  record: ScopeRecord,
  records: ScopeRecord[],
  doc: Document,
  win: ActivatableWindow | null,
): boolean {
  if (record.activate) {
    record.activate();
    return true;
  }

  if (record.scope.activation === 'click-controller' && record.scope.controllerSelector) {
    const controller = doc.querySelector(record.scope.controllerSelector);
    const clickableController = controller as (Element & { click?: () => void }) | null;
    if (typeof clickableController?.click === 'function') {
      clickableController.click();
      return true;
    }
  }

  if (record.scope.activation === 'call-goTo') {
    if (win && typeof win.goTo === 'function') {
      win.goTo(record.scope.index);
      return true;
    }
  }

  if (record.scope.activation === 'set-hash') {
    if (win?.location) {
      win.location.hash = `#${record.scope.id}`;
      return true;
    }
  }

  if (record.scope.activation === 'set-hidden') {
    setHiddenActivation(records, record.scope);
    return true;
  }

  setActiveActivation(records, record.scope);
  return true;
}
