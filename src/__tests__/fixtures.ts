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

export function makeRadioTabsetDocument(activeIndexes = [0, 0]): Document {
  const doc = document.implementation.createHTMLDocument('radio tabsets');

  for (let setIndex = 0; setIndex < activeIndexes.length; setIndex++) {
    const tabset = doc.createElement('div');
    tabset.className = 'tabset';

    const tabstrip = doc.createElement('div');
    tabstrip.className = 'tabstrip';
    tabstrip.setAttribute('role', 'tablist');

    const panels = doc.createElement('div');
    panels.className = 'tabpanels';

    for (let tabIndex = 0; tabIndex < 3; tabIndex++) {
      const input = doc.createElement('input');
      input.type = 'radio';
      input.className = 'tab-radio';
      input.name = `set-${setIndex}`;
      input.id = `set-${setIndex}-tab-${tabIndex}`;
      input.checked = tabIndex === activeIndexes[setIndex];
      tabset.appendChild(input);

      const label = doc.createElement('label');
      label.className = 'tab';
      label.setAttribute('for', input.id);
      label.textContent = `Set ${setIndex} Tab ${tabIndex}`;
      label.addEventListener('click', () => {
        input.checked = true;
        Array.from(panels.children).forEach((panel, panelIndex) => {
          (panel as HTMLElement).style.display = panelIndex === tabIndex ? 'block' : 'none';
        });
      });
      tabstrip.appendChild(label);
    }

    tabset.appendChild(tabstrip);

    for (let tabIndex = 0; tabIndex < 3; tabIndex++) {
      const panel = doc.createElement('div');
      panel.className = `panel p-${setIndex}-${tabIndex}`;
      panel.style.display = tabIndex === activeIndexes[setIndex] ? 'block' : 'none';
      panel.innerHTML = `<p class="target">Set ${setIndex} tab ${tabIndex} content</p>`;
      panels.appendChild(panel);
    }

    tabset.appendChild(panels);
    doc.body.appendChild(tabset);
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

export function makeHashRouteDocument(activeId = 'details'): Document {
  const doc = document.implementation.createHTMLDocument('hash routes');
  const nav = doc.createElement('nav');

  ['overview', 'details', 'settings'].forEach((id) => {
    const link = doc.createElement('a');
    link.href = `#${id}`;
    link.textContent = id;
    if (id === activeId) link.setAttribute('aria-current', 'page');
    nav.appendChild(link);
  });
  doc.body.appendChild(nav);

  ['overview', 'details', 'settings'].forEach((id) => {
    const section = doc.createElement('section');
    section.id = id;
    section.innerHTML = `<p>${id} route content</p>`;
    doc.body.appendChild(section);
  });

  return doc;
}

export function makeCarouselDocument(activeIndex = 0): Document {
  const doc = document.implementation.createHTMLDocument('carousel');
  const carousel = doc.createElement('div');
  carousel.setAttribute('aria-roledescription', 'carousel');

  for (let i = 0; i < 3; i++) {
    const button = doc.createElement('button');
    button.setAttribute('aria-controls', `item-${i}`);
    button.textContent = `Item ${i + 1}`;
    button.addEventListener('click', () => {
      carousel.querySelectorAll('.carousel-item').forEach((el, itemIndex) => {
        el.classList.toggle('active', itemIndex === i);
      });
    });
    carousel.appendChild(button);
  }

  for (let i = 0; i < 3; i++) {
    const item = doc.createElement('div');
    item.id = `item-${i}`;
    item.className = `carousel-item${i === activeIndex ? ' active' : ''}`;
    item.innerHTML = `<p>Carousel item ${i}</p>`;
    carousel.appendChild(item);
  }

  doc.body.appendChild(carousel);
  return doc;
}

export function makeWizardStepDocument(activeIndex = 0): Document {
  const doc = document.implementation.createHTMLDocument('wizard');
  const wizard = doc.createElement('form');
  wizard.setAttribute('data-wizard', '');

  for (let i = 0; i < 3; i++) {
    const button = doc.createElement('button');
    button.type = 'button';
    button.setAttribute('aria-controls', `step-${i}`);
    button.textContent = `Step ${i + 1}`;
    button.addEventListener('click', () => {
      wizard.querySelectorAll('[data-step]').forEach((el, stepIndex) => {
        el.classList.toggle('active', stepIndex === i);
        el.setAttribute('aria-hidden', stepIndex === i ? 'false' : 'true');
      });
    });
    wizard.appendChild(button);
  }

  for (let i = 0; i < 3; i++) {
    const step = doc.createElement('section');
    step.id = `step-${i}`;
    step.setAttribute('data-step', String(i));
    step.className = i === activeIndex ? 'active' : '';
    step.setAttribute('aria-hidden', i === activeIndex ? 'false' : 'true');
    step.innerHTML = `<p>Step ${i} content</p>`;
    wizard.appendChild(step);
  }

  doc.body.appendChild(wizard);
  return doc;
}

export function makeGenericActivePanelDocument(activeIndex = 0): Document {
  const doc = document.implementation.createHTMLDocument('active panels');
  const container = doc.createElement('div');
  container.setAttribute('data-panel-container', '');

  for (let i = 0; i < 3; i++) {
    const panel = doc.createElement('section');
    panel.id = `panel-${i}`;
    panel.setAttribute('data-panel', '');
    panel.className = i === activeIndex ? 'is-active' : '';
    panel.hidden = i !== activeIndex;
    panel.innerHTML = `<p>Panel ${i} content</p>`;
    container.appendChild(panel);
  }

  doc.body.appendChild(container);
  return doc;
}

export function makeNestedTabSlidesDocument(activeTabIndex = 0, activeSlideIndex = 0): Document {
  const doc = document.implementation.createHTMLDocument('nested tab slides');
  const tabs = doc.createElement('div');
  tabs.setAttribute('role', 'tablist');

  for (let tabIndex = 0; tabIndex < 2; tabIndex++) {
    const tab = doc.createElement('button');
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', `nested-tab-${tabIndex}`);
    tab.textContent = `Tab ${tabIndex}`;
    tab.addEventListener('click', () => {
      doc.querySelectorAll('[role="tabpanel"]').forEach((el, panelIndex) => {
        (el as HTMLElement).hidden = panelIndex !== tabIndex;
      });
    });
    tabs.appendChild(tab);
  }
  doc.body.appendChild(tabs);

  for (let tabIndex = 0; tabIndex < 2; tabIndex++) {
    const panel = doc.createElement('section');
    panel.id = `nested-tab-${tabIndex}`;
    panel.setAttribute('role', 'tabpanel');
    panel.hidden = tabIndex !== activeTabIndex;

    const deck = doc.createElement('div');
    deck.className = 'deck';
    for (let slideIndex = 0; slideIndex < 2; slideIndex++) {
      const slide = doc.createElement('section');
      slide.className = `slide${slideIndex === activeSlideIndex ? ' active' : ''}`;
      slide.setAttribute('data-slide', String(slideIndex));
      slide.innerHTML = `<p>Tab ${tabIndex} slide ${slideIndex}</p>`;
      deck.appendChild(slide);
    }
    panel.appendChild(deck);
    doc.body.appendChild(panel);
  }

  return doc;
}

export function makeNonsemanticCssTabsDocument(activeIndex = 0): Document {
  const doc = document.implementation.createHTMLDocument('nonsemantic css tabs');
  const container = doc.createElement('div');
  container.className = 'screens';

  for (let i = 0; i < 3; i++) {
    const panel = doc.createElement('div');
    panel.id = `screen-${i}`;
    panel.className = 'screen';
    panel.style.display = i === activeIndex ? 'block' : 'none';
    panel.innerHTML = `<p class="line">Screen ${i} content here</p>`;
    container.appendChild(panel);
  }

  doc.body.appendChild(container);
  return doc;
}

export function makeAccordionAsPageDocument(openIndex = 0): Document {
  const doc = document.implementation.createHTMLDocument('accordion as page');
  const container = doc.createElement('div');
  container.className = 'pages';

  for (let i = 0; i < 3; i++) {
    const details = doc.createElement('details');
    details.id = `page-${i}`;
    if (i === openIndex) details.setAttribute('open', '');
    details.innerHTML = `<summary>Page ${i}</summary><p>Page ${i} body content</p>`;
    container.appendChild(details);
  }

  doc.body.appendChild(container);
  return doc;
}

export function makeMixedDashboardDocument(): Document {
  const doc = document.implementation.createHTMLDocument('dashboard');
  const grid = doc.createElement('div');
  grid.className = 'dashboard';

  for (let i = 0; i < 3; i++) {
    const widget = doc.createElement('section');
    widget.className = 'widget';
    widget.innerHTML = `<h3>Widget ${i}</h3><p>Widget ${i} body</p>`;
    grid.appendChild(widget);
  }

  doc.body.appendChild(grid);
  return doc;
}

export function makeMultiGroupRenderedStateDocument(): Document {
  const doc = document.implementation.createHTMLDocument('multi group rendered state');

  for (let setIndex = 0; setIndex < 2; setIndex++) {
    const group = doc.createElement('div');
    group.className = `group-${setIndex}`;
    for (let i = 0; i < 3; i++) {
      const panel = doc.createElement('div');
      panel.id = `g${setIndex}-panel-${i}`;
      panel.className = 'card';
      panel.style.display = i === setIndex ? 'block' : 'none';
      panel.innerHTML = `<p>Group ${setIndex} panel ${i} content</p>`;
      group.appendChild(panel);
    }
    doc.body.appendChild(group);
  }

  return doc;
}

export function makeFakeIframe(doc: Document, contentWindow: Record<string, unknown> = {}): HTMLIFrameElement {
  const iframe = document.createElement('iframe');
  Object.defineProperty(iframe, 'contentDocument', { value: doc, writable: true });
  Object.defineProperty(iframe, 'contentWindow', { value: contentWindow, writable: true });
  return iframe;
}
