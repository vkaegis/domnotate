// ============================================================
// Domnotate — View Scope Observer
// ============================================================

import { activateScopeRecord } from '@/slides/activation-strategy';
import {
  activeRecordIndexes,
  findActiveIndex,
  getActiveSignature,
  getChangedActiveIndex,
  getPreviousScopeForSignatureChange,
} from '@/slides/active-scope-tracker';
import { detectScopeRecords } from '@/slides/view-scope-detectors';
import type { ScopeRecord } from '@/slides/view-scope-records';
import type { EventBus, SlideObserver, ViewScope } from '@/types/core';

type ObserverWindow = Window & {
  CSS?: { escape?: (ident: string) => string };
  goTo?: (index: number) => void;
  location?: { hash?: string };
  addEventListener?: (type: 'hashchange', listener: () => void) => void;
  removeEventListener?: (type: 'hashchange', listener: () => void) => void;
  requestAnimationFrame?: (callback: () => void) => number;
};

export function createSlideObserver(): SlideObserver {
  let iframeEl: HTMLIFrameElement | null = null;
  let bus: EventBus | null = null;
  let scopeRecords: ScopeRecord[] = [];
  let activeIndex: number | null = null;
  let activeSignature = '';
  let mutationObserver: MutationObserver | null = null;
  let controllerCleanups: Array<() => void> = [];
  let hashChangeWindow: (Window & {
    removeEventListener(type: 'hashchange', listener: () => void): void;
  }) | null = null;

  function getContentWindow(): ObserverWindow | null {
    return (iframeEl?.contentWindow as ObserverWindow | null) ?? null;
  }

  function getLocationHash(): string {
    const hash = getContentWindow()?.location?.hash;
    return hash?.startsWith('#') ? hash.slice(1) : '';
  }

  function currentActiveIndexes(): number[] {
    return activeRecordIndexes(scopeRecords, getLocationHash);
  }

  function currentActiveSignature(): string {
    return getActiveSignature(scopeRecords, getLocationHash);
  }

  function currentActiveIndex(): number {
    return findActiveIndex(scopeRecords, getLocationHash);
  }

  function detectScopes(): void {
    const doc = iframeEl?.contentDocument;
    if (!doc) {
      scopeRecords = [];
      activeIndex = null;
      activeSignature = '';
      return;
    }

    scopeRecords = detectScopeRecords({ doc, win: getContentWindow() });

    if (scopeRecords.length === 0) {
      activeIndex = null;
      activeSignature = '';
      return;
    }

    activeIndex = currentActiveIndex();
    activeSignature = currentActiveSignature();
  }

  function emitScopeChange(previousScope: ViewScope | null, nextIndex: number): void {
    const nextScope = scopeRecords[nextIndex]?.scope;
    if (!nextScope) return;

    bus?.emit({ type: 'scope:changed', scope: nextScope, previousScope });
    bus?.emit({ type: 'slide:changed', slideIndex: nextScope.index });
  }

  function onMutation(): void {
    const newIndex = currentActiveIndex();
    const newSignature = currentActiveSignature();
    if (newIndex !== activeIndex || newSignature !== activeSignature) {
      const changedIndex = getChangedActiveIndex(activeSignature, newSignature, newIndex);
      const previousScope =
        getPreviousScopeForSignatureChange(activeSignature, newSignature, scopeRecords) ??
        (activeIndex === null ? null : scopeRecords[activeIndex]?.scope ?? null);
      activeIndex = newIndex;
      activeSignature = newSignature;
      emitScopeChange(previousScope, changedIndex);
    }
  }

  function attachObserver(): void {
    if (scopeRecords.length === 0) return;

    mutationObserver = new MutationObserver(onMutation);

    for (const { el } of scopeRecords) {
      mutationObserver.observe(el, {
        attributes: true,
        attributeFilter: ['class', 'hidden', 'aria-hidden', 'style'],
      });
    }
  }

  function detachControllerObservers(): void {
    for (const cleanup of controllerCleanups) cleanup();
    controllerCleanups = [];
  }

  function scheduleMutationCheck(): void {
    const scheduler = getContentWindow()?.requestAnimationFrame ?? globalThis.requestAnimationFrame;
    if (typeof scheduler === 'function') {
      scheduler(onMutation);
    } else {
      setTimeout(onMutation, 0);
    }
  }

  function attachControllerObservers(): void {
    const doc = iframeEl?.contentDocument;
    if (!doc) return;

    for (const record of scopeRecords) {
      if (!record.scope.controllerSelector) continue;
      const controller = doc.querySelector(record.scope.controllerSelector);
      if (!controller) continue;

      const handler = () => {
        scheduleMutationCheck();
      };
      controller.addEventListener('click', handler);
      controller.addEventListener('change', handler);
      controllerCleanups.push(() => {
        controller.removeEventListener('click', handler);
        controller.removeEventListener('change', handler);
      });
    }
  }

  function detachHashObserver(): void {
    hashChangeWindow?.removeEventListener('hashchange', onMutation);
    hashChangeWindow = null;
  }

  function attachHashObserver(): void {
    if (!scopeRecords.some(({ scope }) => scope.kind === 'hash-route')) return;

    const win = getContentWindow();
    if (!win || typeof win.addEventListener !== 'function' || typeof win.removeEventListener !== 'function') {
      return;
    }

    win.addEventListener('hashchange', onMutation);
    hashChangeWindow = win as Window & {
      removeEventListener(type: 'hashchange', listener: () => void): void;
    };
  }

  const observer: SlideObserver = {
    init(_iframeEl: HTMLIFrameElement, _bus: EventBus): void {
      mutationObserver?.disconnect();
      detachControllerObservers();
      detachHashObserver();
      iframeEl = _iframeEl;
      bus = _bus;

      detectScopes();
      attachObserver();
      attachControllerObservers();
      attachHashObserver();
    },

    getActiveScope(): ViewScope | null {
      if (scopeRecords.length === 0 || activeIndex === null) return null;
      return scopeRecords[activeIndex]?.scope ?? null;
    },

    getActiveScopes(): ViewScope[] {
      return currentActiveIndexes()
        .map((index) => scopeRecords[index]?.scope)
        .filter((scope): scope is ViewScope => scope !== undefined);
    },

    getScopes(): ViewScope[] {
      return scopeRecords.map(({ scope }) => scope);
    },

    getScopeForElement(el: Element): ViewScope | undefined {
      let current: Element | null = el;
      while (current) {
        const record = scopeRecords.find(({ el: scopeEl }) => scopeEl === current);
        if (record) return record.scope;
        current = current.parentElement;
      }

      return undefined;
    },

    isScopeActive(scope: ViewScope): boolean {
      const index = scopeRecords.findIndex(({ scope: candidate }) => candidate.id === scope.id);
      return index !== -1 && currentActiveIndexes().includes(index);
    },

    activateScope(scope: ViewScope): void {
      const record = scopeRecords.find(({ scope: candidate }) => candidate.id === scope.id);
      if (!record) return;

      const doc = iframeEl?.contentDocument;
      if (!doc) return;

      activateScopeRecord(record, scopeRecords, doc, getContentWindow());
      onMutation();
    },

    getActiveSlide(): number | null {
      return observer.getActiveScope()?.index ?? null;
    },

    getSlideCount(): number | null {
      return scopeRecords.length === 0 ? null : scopeRecords.length;
    },

    goToSlide(n: number): void {
      const scope = scopeRecords[n]?.scope;
      if (!scope) return;
      observer.activateScope(scope);
    },

    getSlideForElement(el: Element): number | undefined {
      return observer.getScopeForElement(el)?.index;
    },

    destroy(): void {
      if (mutationObserver) {
        mutationObserver.disconnect();
        mutationObserver = null;
      }
      detachHashObserver();
      detachControllerObservers();
      scopeRecords = [];
      activeIndex = null;
      activeSignature = '';
      iframeEl = null;
      bus = null;
    },
  };

  return observer;
}
