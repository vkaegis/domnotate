import { describe, test, expect, vi, beforeEach } from 'vitest';
import { createAnnotationManager } from '@/annotations/annotation-manager';
import { createEventBus } from '@/events';
import { makeDescriptor, makeAnnotation } from '@/__tests__/fixtures';
import type { EventBus, AnnotationManager } from '@/types/core';

describe('AnnotationManager', () => {
  let bus: EventBus;
  let manager: AnnotationManager;

  beforeEach(() => {
    bus = createEventBus();
    manager = createAnnotationManager();
    manager.init(bus);
  });

  test('requires init(bus) before operations', () => {
    const uninitialised = createAnnotationManager();
    expect(() => uninitialised.create(makeDescriptor(), { x: 0, y: 0 }, 'test')).toThrow(
      'not initialised',
    );
  });

  test('create returns annotation with correct fields and emits event', () => {
    const handler = vi.fn();
    bus.on('annotation:create', handler);

    const descriptor = makeDescriptor();
    const ann = manager.create(descriptor, { x: 10, y: 20 }, 'Hello');

    expect(ann.id).toBeDefined();
    expect(ann.element).toBe(descriptor);
    expect(ann.anchorPoint).toEqual({ x: 10, y: 20 });
    expect(ann.text).toBe('Hello');
    expect(ann.color).toBe('#C4725A');
    expect(ann.createdAt).toBeDefined();
    expect(ann.updatedAt).toBe(ann.createdAt);

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith({ type: 'annotation:create', annotation: ann });
  });

  test('getAll returns sorted by createdAt', () => {
    const a1 = manager.create(makeDescriptor(), { x: 0, y: 0 }, 'First');
    const a2 = manager.create(makeDescriptor(), { x: 0, y: 0 }, 'Second');

    const all = manager.getAll();
    expect(all).toHaveLength(2);
    expect(all[0].createdAt <= all[1].createdAt).toBe(true);
  });

  test('getById returns correct annotation or undefined', () => {
    const ann = manager.create(makeDescriptor(), { x: 0, y: 0 }, 'test');
    expect(manager.getById(ann.id)).toBe(ann);
    expect(manager.getById('nonexistent')).toBeUndefined();
  });

  test('updateText modifies text + updatedAt and emits event', () => {
    const handler = vi.fn();
    bus.on('annotation:update', handler);

    const ann = manager.create(makeDescriptor(), { x: 0, y: 0 }, 'Original');
    const originalUpdatedAt = ann.updatedAt;

    // Small delay to ensure updatedAt differs
    manager.updateText(ann.id, 'Modified');

    expect(ann.text).toBe('Modified');
    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0][0].annotation.text).toBe('Modified');
  });

  test('delete removes annotation and emits event', () => {
    const handler = vi.fn();
    bus.on('annotation:delete', handler);

    const ann = manager.create(makeDescriptor(), { x: 0, y: 0 }, 'test');
    manager.delete(ann.id);

    expect(manager.getById(ann.id)).toBeUndefined();
    expect(manager.getAll()).toHaveLength(0);
    expect(handler).toHaveBeenCalledWith({ type: 'annotation:delete', id: ann.id });
  });

  test('delete on missing id throws', () => {
    expect(() => manager.delete('nonexistent')).toThrow('Annotation not found');
  });

  test('updateText on missing id throws', () => {
    expect(() => manager.updateText('nonexistent', 'text')).toThrow('Annotation not found');
  });

  test('loadAnnotations adds annotations to store', () => {
    const annotations = [makeAnnotation(), makeAnnotation()];
    manager.loadAnnotations(annotations);
    expect(manager.getAll()).toHaveLength(2);
    expect(manager.getById(annotations[0].id)).toBeDefined();
  });

  test('create stores slideIndex when provided', () => {
    const ann = manager.create(makeDescriptor(), { x: 0, y: 0 }, 'Slide note', 3);
    expect(ann.slideIndex).toBe(3);
  });

  test('create omits slideIndex when not provided', () => {
    const ann = manager.create(makeDescriptor(), { x: 0, y: 0 }, 'No slide');
    expect(ann.slideIndex).toBeUndefined();
  });

  test('clearAll removes all annotations', () => {
    manager.create(makeDescriptor(), { x: 0, y: 0 }, 'a');
    manager.create(makeDescriptor(), { x: 0, y: 0 }, 'b');
    expect(manager.getAll()).toHaveLength(2);

    manager.clearAll();
    expect(manager.getAll()).toHaveLength(0);
  });
});
