import type { Annotation, ElementDescriptor, AnnotationSession } from '@/types/core';

let counter = 0;

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
