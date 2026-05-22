import {
  createScopeRecord,
  isHiddenScope,
  type ScopeRecord,
} from '@/slides/view-scope-records';
import type { ScopeDetectionContext } from '@/slides/view-scope-detection-types';

const PANEL_LIKE_TAGS = new Set([
  'DIV',
  'SECTION',
  'ARTICLE',
  'ASIDE',
  'MAIN',
  'FORM',
  'FIELDSET',
  'DETAILS',
  'LI',
]);

function elementHasOpenAttribute(el: Element): boolean {
  return el.hasAttribute('open');
}

function isExplicitlyHidden(el: Element): boolean {
  return isHiddenScope(el);
}

function isVisibleEnough(el: Element): boolean {
  return !isExplicitlyHidden(el);
}

function hasSubstantialContent(el: Element): boolean {
  if (el.children.length >= 1) return true;
  const text = el.textContent?.trim() ?? '';
  return text.length >= 8;
}

function sharedClasses(panels: Element[]): string[] {
  if (panels.length === 0) return [];
  let shared = new Set<string>(Array.from(panels[0].classList));
  for (let i = 1; i < panels.length; i++) {
    const next = new Set<string>(Array.from(panels[i].classList));
    shared = new Set([...shared].filter((cls) => next.has(cls)));
    if (shared.size === 0) return [];
  }
  return Array.from(shared);
}

function panelsLookSimilar(panels: Element[]): boolean {
  if (sharedClasses(panels).length > 0) return true;
  if (panels.every((el) => el.tagName === 'DETAILS')) return true;
  return false;
}

type CandidateGroup = {
  parent: Element;
  panels: Element[];
};

function candidateGroupsForParent(parent: Element): CandidateGroup | null {
  const children = Array.from(parent.children);
  if (children.length < 2) return null;

  const firstTag = children[0].tagName;
  if (!PANEL_LIKE_TAGS.has(firstTag)) return null;
  if (!children.every((child) => child.tagName === firstTag)) return null;
  if (!children.some(hasSubstantialContent)) return null;
  if (!panelsLookSimilar(children)) return null;

  return { parent, panels: children };
}

function collectCandidateGroups(doc: Document): CandidateGroup[] {
  const groups: CandidateGroup[] = [];
  if (!doc.body) return groups;
  const elements = Array.from(doc.body.querySelectorAll('*'));
  elements.push(doc.body);
  for (const el of elements) {
    const group = candidateGroupsForParent(el);
    if (group) groups.push(group);
  }
  return groups;
}

function findVisibilityExclusiveGroups(doc: Document): Element[][] {
  const groups: Element[][] = [];
  for (const { panels } of collectCandidateGroups(doc)) {
    if (panels.every((el) => el.tagName === 'DETAILS')) continue;
    const visible = panels.filter(isVisibleEnough);
    const hidden = panels.filter(isExplicitlyHidden);
    if (visible.length !== 1) continue;
    if (hidden.length === 0) continue;
    groups.push(panels);
  }
  return groups;
}

function findDetailsAccordionGroups(doc: Document): Element[][] {
  const groups: Element[][] = [];
  for (const { panels } of collectCandidateGroups(doc)) {
    if (!panels.every((el) => el.tagName === 'DETAILS')) continue;
    const open = panels.filter(elementHasOpenAttribute);
    if (open.length !== 1) continue;
    groups.push(panels);
  }
  return groups;
}

function applyVisibilityActivation(group: Element[], target: Element): void {
  for (const sibling of group) {
    const isTarget = sibling === target;
    const htmlLike = sibling as Element & {
      hidden?: boolean;
      style?: { display?: string; visibility?: string };
    };

    if (isTarget) {
      if ('hidden' in htmlLike) htmlLike.hidden = false;
      else htmlLike.removeAttribute('hidden');
      if (sibling.getAttribute('aria-hidden') === 'true') {
        sibling.setAttribute('aria-hidden', 'false');
      }
      if (htmlLike.style?.display === 'none') htmlLike.style.display = '';
      if (htmlLike.style?.visibility === 'hidden') htmlLike.style.visibility = '';
    } else {
      if ('hidden' in htmlLike) htmlLike.hidden = true;
      else sibling.setAttribute('hidden', '');
      if (sibling.getAttribute('aria-hidden') === 'false') {
        sibling.setAttribute('aria-hidden', 'true');
      }
      if (htmlLike.style?.display !== undefined && htmlLike.style.display !== 'none') {
        htmlLike.style.display = 'none';
      }
    }
  }
}

function createVisibilityScopeRecords(
  context: ScopeDetectionContext,
  group: Element[],
  startIndex: number,
): ScopeRecord[] {
  return group.map((el, offset) => {
    const record = createScopeRecord(
      context.doc,
      el,
      startIndex + offset,
      'active-panel',
      'View',
      {
        isActive: () => isVisibleEnough(el),
        activate: () => applyVisibilityActivation(group, el),
      },
      context,
    );
    record.scope = { ...record.scope, activation: 'set-hidden' };
    return record;
  });
}

function createDetailsScopeRecords(
  context: ScopeDetectionContext,
  group: Element[],
  startIndex: number,
): ScopeRecord[] {
  return group.map((el, offset) =>
    createScopeRecord(
      context.doc,
      el,
      startIndex + offset,
      'active-panel',
      'View',
      {
        isActive: () => elementHasOpenAttribute(el),
        activate: () => {
          for (const sibling of group) {
            if (sibling === el) {
              sibling.setAttribute('open', '');
            } else {
              sibling.removeAttribute('open');
            }
          }
        },
      },
      context,
    ),
  );
}

export function detectRenderedStateScopes(context: ScopeDetectionContext): ScopeRecord[] {
  const { doc } = context;
  const records: ScopeRecord[] = [];

  for (const group of findVisibilityExclusiveGroups(doc)) {
    records.push(...createVisibilityScopeRecords(context, group, records.length));
  }

  for (const group of findDetailsAccordionGroups(doc)) {
    records.push(...createDetailsScopeRecords(context, group, records.length));
  }

  return records;
}
