// ============================================================
// Domnotate — Annotation Manager
// ============================================================

import type {
  Annotation,
  AnnotationManager,
  ElementDescriptor,
  EventBus,
  ViewScope,
} from '@/types/core';

type CreateAnnotationOptions = number | { slideIndex?: number; viewScope?: ViewScope };

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

  function normalizeCreateOptions(
    options: CreateAnnotationOptions | undefined,
  ): { slideIndex?: number; viewScope?: ViewScope } {
    if (typeof options === 'number') return { slideIndex: options };
    return options ?? {};
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
      options?: CreateAnnotationOptions,
    ): Annotation {
      const b = requireBus();
      const timestamp = now();
      const { slideIndex, viewScope } = normalizeCreateOptions(options);

      const annotation: Annotation = {
        id: crypto.randomUUID(),
        element,
        anchorPoint,
        text,
        color: '#C4725A',
        ...(viewScope !== undefined && { viewScope }),
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
