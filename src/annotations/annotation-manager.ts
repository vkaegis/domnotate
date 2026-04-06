// ============================================================
// Domnotate — Annotation Manager
// ============================================================

import type {
  Annotation,
  AnnotationManager,
  ElementDescriptor,
  EventBus,
} from '@/types/core';

export function createAnnotationManager(): AnnotationManager {
  const store = new Map<string, Annotation>();
  let bus: EventBus | null = null;

  function requireBus(): EventBus {
    if (!bus) throw new Error('AnnotationManager not initialised — call init(bus) first');
    return bus;
  }

  function now(): string {
    return new Date().toISOString();
  }

  const manager: AnnotationManager = {
    init(eventBus: EventBus): void {
      bus = eventBus;
    },

    getAll(): Annotation[] {
      return Array.from(store.values()).sort((a, b) =>
        a.createdAt.localeCompare(b.createdAt),
      );
    },

    getById(id: string): Annotation | undefined {
      return store.get(id);
    },

    create(
      element: ElementDescriptor,
      anchorPoint: { x: number; y: number },
      text: string,
      slideIndex?: number,
    ): Annotation {
      const b = requireBus();
      const timestamp = now();

      const annotation: Annotation = {
        id: crypto.randomUUID(),
        element,
        anchorPoint,
        text,
        color: '#C4725A',
        ...(slideIndex !== undefined && { slideIndex }),
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      store.set(annotation.id, annotation);
      b.emit({ type: 'annotation:create', annotation });

      return annotation;
    },

    updateText(annotationId: string, text: string): void {
      const b = requireBus();
      const annotation = store.get(annotationId);
      if (!annotation) {
        throw new Error(`Annotation not found: ${annotationId}`);
      }

      annotation.text = text;
      annotation.updatedAt = now();

      b.emit({ type: 'annotation:update', annotation });
    },

    delete(id: string): void {
      const b = requireBus();
      if (!store.has(id)) {
        throw new Error(`Annotation not found: ${id}`);
      }

      store.delete(id);
      b.emit({ type: 'annotation:delete', id });
    },

    loadAnnotations(annotations: Annotation[]): void {
      for (const annotation of annotations) {
        store.set(annotation.id, annotation);
      }
    },

    clearAll(): void {
      store.clear();
    },
  };

  return manager;
}
