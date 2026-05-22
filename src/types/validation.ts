import type { ViewScope } from '@/types/core';

const VIEW_SCOPE_KINDS = new Set([
  'slide',
  'tabpanel',
  'hash-route',
  'carousel',
  'wizard-step',
  'active-panel',
  'custom',
]);

const VIEW_SCOPE_ACTIVATIONS = new Set([
  'click-controller',
  'radio-input',
  'set-hash',
  'call-goTo',
  'toggle-active',
  'set-hidden',
  'noop',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

export function isViewScope(value: unknown): value is ViewScope {
  if (!isRecord(value)) return false;

  if (typeof value.kind !== 'string' || !VIEW_SCOPE_KINDS.has(value.kind)) return false;
  if (typeof value.id !== 'string' || value.id.length === 0) return false;
  if (!isFiniteNumber(value.index)) return false;
  if (typeof value.selector !== 'string' || value.selector.length === 0) return false;

  if (!isOptionalString(value.label)) return false;
  if (!isOptionalString(value.activeSelector)) return false;
  if (!isOptionalString(value.controllerSelector)) return false;
  if (
    value.activation !== undefined &&
    (typeof value.activation !== 'string' || !VIEW_SCOPE_ACTIVATIONS.has(value.activation))
  ) {
    return false;
  }

  return true;
}
