import {
  createScopeRecord,
  escapeAttrValue,
  escapeIdentifier,
  findController,
  getElementText,
  hasActiveMarker,
  isHiddenBySelfOrAncestor,
  type ScopeRecord,
} from '@/slides/view-scope-records';
import type { ScopeDetectionContext } from '@/slides/view-scope-detection-types';

function getLocationHash(context: ScopeDetectionContext): string {
  const hash = (context.win as { location?: { hash?: string } } | null)?.location?.hash;
  return hash?.startsWith('#') ? hash.slice(1) : '';
}

export function detectDeckSlides(context: ScopeDetectionContext): ScopeRecord[] {
  const slides = Array.from(context.doc.querySelectorAll('.deck > .slide[data-slide]'));
  if (slides.length < 2) return [];
  return slides.map((el, index) =>
    createScopeRecord(context.doc, el, index, 'slide', 'Slide', {}, context),
  );
}

export function detectActiveSlides(context: ScopeDetectionContext): ScopeRecord[] {
  const slides = Array.from(context.doc.querySelectorAll('.slide'));
  if (slides.length < 2) return [];
  return slides.map((el, index) =>
    createScopeRecord(context.doc, el, index, 'slide', 'Slide', {}, context),
  );
}

export function detectTabPanels(context: ScopeDetectionContext): ScopeRecord[] {
  const panels = Array.from(context.doc.querySelectorAll('[role="tabpanel"]'));
  if (panels.length < 2) return [];
  return panels.map((el, index) =>
    createScopeRecord(context.doc, el, index, 'tabpanel', 'Tab', {}, context),
  );
}

export function detectRadioTabPanels(context: ScopeDetectionContext): ScopeRecord[] {
  const { doc } = context;
  const records: ScopeRecord[] = [];
  const tabsets = Array.from(doc.querySelectorAll('.tabset'));

  for (const tabset of tabsets) {
    const inputs = Array.from(
      tabset.querySelectorAll('input[type="radio"]'),
    ) as HTMLInputElement[];
    const panels = Array.from(tabset.querySelectorAll('.tabpanels > .panel'));
    const hasTabstrip = tabset.querySelector('[role="tablist"], .tabstrip') !== null;

    if (!hasTabstrip || inputs.length < 2 || panels.length < 2) continue;

    const count = Math.min(inputs.length, panels.length);
    for (let i = 0; i < count; i++) {
      const input = inputs[i];
      const panel = panels[i];
      if (!input.id) continue;

      const controller = tabset.querySelector(`label[for="${escapeAttrValue(input.id)}"]`);
      const inputSelector = `#${escapeIdentifier(input.id, context.win)}`;
      const record = createScopeRecord(doc, panel, records.length, 'tabpanel', 'Tab', {
        id: input.id,
        label: getElementText(controller) ?? `Tab ${records.length + 1}`,
        controller,
        isActive: () => input.checked || !isHiddenBySelfOrAncestor(panel),
        activate: () => {
          const clickableController = controller as (Element & { click?: () => void }) | null;
          if (typeof clickableController?.click === 'function') {
            clickableController.click();
          } else {
            input.checked = true;
            const EventCtor = input.ownerDocument.defaultView?.Event ?? Event;
            input.dispatchEvent(new EventCtor('change', { bubbles: true }));
          }
        },
      }, context);
      record.scope = {
        ...record.scope,
        activeSelector: `${inputSelector}:checked`,
      };
      records.push(record);
    }
  }

  return records.length >= 2 ? records : [];
}

export function detectHashRoutes(context: ScopeDetectionContext): ScopeRecord[] {
  const { doc } = context;
  const links = Array.from(doc.querySelectorAll('a[href^="#"]')).filter((link) => {
    const hash = link.getAttribute('href')?.slice(1);
    return hash !== undefined && hash.length > 0;
  });
  if (links.length < 2) return [];

  const linkedIds = new Set(links.map((link) => link.getAttribute('href')?.slice(1)).filter(Boolean));
  const candidates = Array.from(
    doc.querySelectorAll('section[id], article[id], [role="region"][id], [data-route][id], [data-view][id], [data-page][id]'),
  ).filter((el) => el.id && linkedIds.has(el.id));
  if (candidates.length < 2) return [];

  const currentHash = getLocationHash(context);
  const hasActiveRouteEvidence =
    (currentHash !== '' && candidates.some((el) => el.id === currentHash)) ||
    links.some((link) => {
      const href = link.getAttribute('href');
      return (
        link.classList.contains('active') ||
        link.classList.contains('is-active') ||
        link.getAttribute('aria-current') === 'page' ||
        (currentHash !== '' && href === `#${currentHash}`)
      );
    });
  if (!hasActiveRouteEvidence) return [];

  return candidates.map((el, index) =>
    createScopeRecord(doc, el, index, 'hash-route', 'Section', {
      isActive: () => {
        const currentHash = getLocationHash(context);
        if (currentHash) return el.id === currentHash;
        return links.some((link) => {
          const href = link.getAttribute('href');
          return (
            href === `#${el.id}` &&
            (
              link.classList.contains('active') ||
              link.classList.contains('is-active') ||
              link.getAttribute('aria-current') === 'page'
            )
          );
        });
      },
    }, context),
  );
}

function firstSameParentGroup(elements: Element[]): Element[] {
  const groups = new Map<Element, Element[]>();
  for (const el of elements) {
    const parent = el.parentElement;
    if (!parent) continue;
    const group = groups.get(parent) ?? [];
    group.push(el);
    groups.set(parent, group);
  }
  return Array.from(groups.values()).find((group) => group.length >= 2) ?? [];
}

function hasSingleActiveOrVisible(elements: Element[]): boolean {
  const activeCount = elements.filter(hasActiveMarker).length;
  if (activeCount === 1) return true;

  const visibleCount = elements.filter((el) => !isHiddenBySelfOrAncestor(el)).length;
  return visibleCount === 1;
}

export function detectCarouselScopes(context: ScopeDetectionContext): ScopeRecord[] {
  const { doc } = context;
  const container = doc.querySelector('[aria-roledescription="carousel"], [data-carousel], .carousel, .swiper');
  if (container) {
    const items = Array.from(
      container.querySelectorAll(
        '.carousel-item, .swiper-slide, [aria-roledescription="slide"], [data-carousel-item]',
      ),
    );
    if (items.length >= 2) {
      return items.map((el, index) =>
        createScopeRecord(doc, el, index, 'carousel', 'Item', {}, context),
      );
    }
  }

  const standaloneItems = firstSameParentGroup(Array.from(doc.querySelectorAll('.carousel-item, .swiper-slide')));
  if (standaloneItems.length < 2) return [];

  const parentClass = standaloneItems[0].parentElement?.className.toString() ?? '';
  const hasCarouselParent = /\b(carousel|swiper)\b/.test(parentClass);
  if (!hasCarouselParent && !hasSingleActiveOrVisible(standaloneItems)) return [];

  return standaloneItems.map((el, index) =>
    createScopeRecord(doc, el, index, 'carousel', 'Item', {}, context),
  );
}

export function detectWizardSteps(context: ScopeDetectionContext): ScopeRecord[] {
  const { doc } = context;
  const dataStepGroup = firstSameParentGroup(Array.from(doc.querySelectorAll('[data-step]')));
  if (dataStepGroup.length >= 2) {
    return dataStepGroup.map((el, index) =>
      createScopeRecord(doc, el, index, 'wizard-step', 'Step', {}, context),
    );
  }

  const stepGroup = firstSameParentGroup(Array.from(doc.querySelectorAll('.step')));
  if (stepGroup.length < 2) return [];

  const parent = stepGroup[0].parentElement;
  const parentEvidence = parent?.matches('[data-wizard], [data-steps], .wizard, .steps') ?? false;
  const controllerCount = stepGroup.filter((el) => findController(doc, el) !== null).length;
  if (!parentEvidence && controllerCount < 2 && !hasSingleActiveOrVisible(stepGroup)) return [];

  return stepGroup.map((el, index) =>
    createScopeRecord(doc, el, index, 'wizard-step', 'Step', {}, context),
  );
}

export function detectGenericActivePanels(context: ScopeDetectionContext): ScopeRecord[] {
  const { doc } = context;
  const parents = Array.from(
    doc.querySelectorAll('[data-view-container], [data-panel-container], [data-active-panel-container]'),
  );

  for (const parent of parents) {
    const panels = Array.from(parent.children).filter((child) => {
      return (
        child.hasAttribute('data-panel') ||
        child.hasAttribute('data-view') ||
        child.getAttribute('role') === 'region' ||
        findController(doc, child) !== null
      );
    });
    if (panels.length < 2) continue;

    const controllerCount = panels.filter((panel) => findController(doc, panel) !== null).length;
    const hasDataEvidence = panels.some((panel) => panel.hasAttribute('data-panel') || panel.hasAttribute('data-view'));
    if (!hasDataEvidence && controllerCount < 2) continue;
    if (!hasSingleActiveOrVisible(panels)) continue;

    return panels.map((el, index) =>
      createScopeRecord(doc, el, index, 'active-panel', 'View', {}, context),
    );
  }

  return [];
}
