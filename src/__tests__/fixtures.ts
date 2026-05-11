import type { Annotation, ElementDescriptor, AnnotationSession, ViewScope } from '@/types/core';

let counter = 0;

type TabVisibilityMode = 'hidden' | 'aria-hidden';

export function makeDescriptor(overrides: Partial<ElementDescriptor> = {}): ElementDescriptor {
  counter++;
  return {
    cssSelector: `div.item-${counter}`,
    xpath: `/html/body/div[${counter}]`,
    tagName: 'div',
    classes: [`item-${counter}`],
    id: null,
    textPreview: `Sample text ${counter}`,
    rect: { x: 10, y: 20, width: 100, height: 50 },
    depth: 3,
    domPath: `body > div.container > div.item-${counter}`,
    ...overrides,
  };
}

export function makeAnnotation(overrides: Partial<Annotation> = {}): Annotation {
  counter++;
  const now = new Date().toISOString();
  return {
    id: `ann-${counter}`,
    element: makeDescriptor(),
    anchorPoint: { x: 50, y: 25 },
    text: `Annotation ${counter}`,
    color: '#C4725A',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export function makeViewScope(overrides: Partial<ViewScope> = {}): ViewScope {
  counter++;
  return {
    kind: 'tabpanel',
    id: `panel-${counter}`,
    index: counter,
    label: `Panel ${counter}`,
    selector: `#panel-${counter}`,
    controllerSelector: `[aria-controls="panel-${counter}"]`,
    activation: 'click-controller',
    ...overrides,
  };
}

export function makeSession(overrides: Partial<AnnotationSession> = {}): AnnotationSession {
  counter++;
  const now = new Date().toISOString();
  return {
    id: `session-${counter}`,
    sourceType: 'file',
    sourceName: 'test-page.html',
    loadedUrl: 'blob:http://localhost:8000/abc-123',
    annotations: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export function makePlainDocument(bodyHtml = '<main><p>Hello</p></main>'): Document {
  const doc = document.implementation.createHTMLDocument('plain');
  doc.body.innerHTML = bodyHtml;
  return doc;
}

export function makeDeckSlideDocument(slideCount: number, activeIndex = 0): Document {
  const doc = document.implementation.createHTMLDocument('deck slides');
  const deck = doc.createElement('div');
  deck.className = 'deck';

  for (let i = 0; i < slideCount; i++) {
    const slide = doc.createElement('section');
    slide.className = `slide${i === activeIndex ? ' active' : ''}`;
    slide.setAttribute('data-slide', String(i));
    slide.innerHTML = `<p>Slide ${i} content</p>`;
    deck.appendChild(slide);
  }

  doc.body.appendChild(deck);
  return doc;
}

export function makeActiveSlideDocument(slideCount: number, activeIndex = 0): Document {
  const doc = document.implementation.createHTMLDocument('active slides');

  for (let i = 0; i < slideCount; i++) {
    const slide = doc.createElement('section');
    slide.className = `slide${i === activeIndex ? ' active' : ''}`;
    slide.innerHTML = `<p>Active slide ${i} content</p>`;
    doc.body.appendChild(slide);
  }

  return doc;
}

function setTabPanelVisibility(panel: HTMLElement, active: boolean, mode: TabVisibilityMode): void {
  if (mode === 'hidden') {
    panel.hidden = !active;
    return;
  }

  panel.setAttribute('aria-hidden', active ? 'false' : 'true');
}

export function makeAriaTabDocument(activeIndex = 0, mode: TabVisibilityMode = 'hidden'): Document {
  const doc = document.implementation.createHTMLDocument(`${mode} tabs`);
  const tabList = doc.createElement('div');
  tabList.setAttribute('role', 'tablist');

  for (let i = 0; i < 3; i++) {
    const tab = doc.createElement('button');
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', `part-${i}`);
    tab.setAttribute('aria-selected', i === activeIndex ? 'true' : 'false');
    tab.textContent = `Part ${i}`;
    tab.addEventListener('click', () => {
      doc.querySelectorAll('[role="tab"]').forEach((el, tabIndex) => {
        el.setAttribute('aria-selected', tabIndex === i ? 'true' : 'false');
      });
      doc.querySelectorAll('[role="tabpanel"]').forEach((el, panelIndex) => {
        setTabPanelVisibility(el as HTMLElement, panelIndex === i, mode);
      });
    });
    tabList.appendChild(tab);
  }

  doc.body.appendChild(tabList);

  for (let i = 0; i < 3; i++) {
    const panel = doc.createElement('div');
    panel.id = `part-${i}`;
    panel.setAttribute('role', 'tabpanel');
    setTabPanelVisibility(panel, i === activeIndex, mode);
    panel.innerHTML = `<p>Part ${i} content</p>`;
    doc.body.appendChild(panel);
  }

  return doc;
}

export function makeExplicitScopeDocument(activeIndex = 0): Document {
  const doc = document.implementation.createHTMLDocument('explicit scopes');

  for (let i = 0; i < 3; i++) {
    const section = doc.createElement('section');
    section.setAttribute('data-domnotate-scope', i === 1 ? 'wizard-step' : '');
    section.setAttribute('data-domnotate-scope-id', `scope-${i}`);
    section.setAttribute('data-domnotate-scope-label', `Scope ${i}`);
    section.className = i === activeIndex ? 'active' : '';
    section.innerHTML = `<p>Scope ${i} content</p>`;
    doc.body.appendChild(section);
  }

  return doc;
}

export function makeFakeIframe(doc: Document, contentWindow: Record<string, unknown> = {}): HTMLIFrameElement {
  const iframe = document.createElement('iframe');
  Object.defineProperty(iframe, 'contentDocument', { value: doc, writable: true });
  Object.defineProperty(iframe, 'contentWindow', { value: contentWindow, writable: true });
  return iframe;
}
