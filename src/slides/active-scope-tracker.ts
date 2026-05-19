import type { ViewScope } from '@/types/core';
import {
  elementDepth,
  hasActiveMarker,
  isHiddenBySelfOrAncestor,
  recordsInSameActivationGroup,
  type ScopeRecord,
} from '@/slides/view-scope-records';

export function isRecordActive(record: ScopeRecord): boolean {
  if (record.isActive) return record.isActive();
  return hasActiveMarker(record.el) || !isHiddenBySelfOrAncestor(record.el);
}

export function activeRecordIndexes(scopeRecords: ScopeRecord[], getLocationHash: () => string): number[] {
  if (scopeRecords.length === 0) return [];

  const currentHash = getLocationHash();
  if (currentHash) {
    const hashIndex = scopeRecords.findIndex(({ scope }) => scope.kind === 'hash-route' && scope.id === currentHash);
    if (hashIndex !== -1) return [hashIndex];
  }

  return activeIndexesByGroup(scopeRecords);
}

function activeIndexesByGroup(scopeRecords: ScopeRecord[]): number[] {
  const selectedIndexes: number[] = [];
  const seenGroups = new Set<ScopeRecord>();

  for (const record of scopeRecords) {
    if (seenGroups.has(record)) continue;

    const group = recordsInSameActivationGroup(record, scopeRecords);
    for (const groupRecord of group) seenGroups.add(groupRecord);

    const explicitIndexes = group
      .map((groupRecord) => ({ index: scopeRecords.indexOf(groupRecord), record: groupRecord }))
      .filter(({ record }) =>
        record.isActive ? record.isActive() : hasActiveMarker(record.el) && !isHiddenBySelfOrAncestor(record.el),
      )
      .map(({ index }) => index);
    if (explicitIndexes.length > 0) {
      selectedIndexes.push(...explicitIndexes);
      continue;
    }

    const ranked = group
      .map((groupRecord) => ({
        index: scopeRecords.indexOf(groupRecord),
        record: groupRecord,
        depth: elementDepth(groupRecord.el),
      }))
      .filter(({ record }) => !isHiddenBySelfOrAncestor(record.el))
      .sort((a, b) => b.depth - a.depth || a.index - b.index);

    if (ranked.length > 0) {
      selectedIndexes.push(ranked[0].index);
    }
  }

  return selectedIndexes;
}

export function getActiveSignature(scopeRecords: ScopeRecord[], getLocationHash: () => string): string {
  return activeRecordIndexes(scopeRecords, getLocationHash).join(',');
}

export function parseActiveSignature(signature: string): number[] {
  if (!signature) return [];
  return signature.split(',').map(Number).filter(Number.isFinite);
}

export function getChangedActiveIndex(oldSignature: string, newSignature: string, fallbackIndex: number): number {
  const oldIndexes = new Set(parseActiveSignature(oldSignature));
  const newIndexes = parseActiveSignature(newSignature);
  return newIndexes.find((index) => !oldIndexes.has(index)) ?? fallbackIndex;
}

export function getPreviousScopeForSignatureChange(
  oldSignature: string,
  newSignature: string,
  scopeRecords: ScopeRecord[],
): ViewScope | null {
  const newIndexes = new Set(parseActiveSignature(newSignature));
  const removedIndex = parseActiveSignature(oldSignature).find((index) => !newIndexes.has(index));
  return removedIndex === undefined ? null : scopeRecords[removedIndex]?.scope ?? null;
}

export function findActiveIndex(scopeRecords: ScopeRecord[], getLocationHash: () => string): number {
  if (scopeRecords.length === 0) return 0;

  const currentHash = getLocationHash();
  if (currentHash) {
    const hashIndex = scopeRecords.findIndex(({ scope }) => scope.kind === 'hash-route' && scope.id === currentHash);
    if (hashIndex !== -1) return hashIndex;
  }

  const customActiveIndexes = scopeRecords
    .map((record, index) => ({ record, index }))
    .filter(({ record }) => record.isActive?.())
    .map(({ index }) => index);
  if (customActiveIndexes.length > 0) {
    return customActiveIndexes
      .map((index) => ({ index, depth: elementDepth(scopeRecords[index].el) }))
      .sort((a, b) => b.depth - a.depth || a.index - b.index)[0].index;
  }

  const ranked = scopeRecords
    .map((record, index) => {
      const depth = elementDepth(record.el);
      const visible = !isHiddenBySelfOrAncestor(record.el);
      let score = visible ? 10 : 0;
      if (visible && record.el.classList.contains('active')) score += 100;
      if (visible && record.el.classList.contains('is-active')) score += 100;
      if (visible && record.el.classList.contains('swiper-slide-active')) score += 100;
      if (visible && record.el.getAttribute('aria-hidden') === 'false') score += 80;
      if (visible && record.el.getAttribute('aria-selected') === 'true') score += 70;
      return { index, depth, score };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score || b.depth - a.depth || a.index - b.index);

  if (ranked.length > 0) return ranked[0].index;

  const visibleScopes = scopeRecords
    .map((record, index) => ({ record, index, depth: elementDepth(record.el) }))
    .filter(({ record }) => isRecordActive(record));
  if (visibleScopes.length === 1) return visibleScopes[0].index;
  if (visibleScopes.length > 1) {
    return visibleScopes.sort((a, b) => b.depth - a.depth || a.index - b.index)[0].index;
  }

  return 0;
}
