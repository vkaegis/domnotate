import { describe, test, expect, vi } from 'vitest';
import { createEventBus } from '@/events';
import { makeAnnotation, makeViewScope } from '@/__tests__/fixtures';

describe('EventBus integration wiring', () => {
  test('emitting annotation:create triggers subscribed handlers', () => {
    const bus = createEventBus();
    const handler = vi.fn();
    const annotation = makeAnnotation();

    bus.on('annotation:create', handler);
    bus.emit({ type: 'annotation:create', annotation });

    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0][0].annotation).toBe(annotation);
  });

  test('unsubscribing prevents further delivery', () => {
    const bus = createEventBus();
    const handler = vi.fn();

    const unsub = bus.on('annotation:delete', handler);
    bus.emit({ type: 'annotation:delete', id: 'test-1' });
    expect(handler).toHaveBeenCalledTimes(1);

    unsub();
    bus.emit({ type: 'annotation:delete', id: 'test-2' });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test('events with wrong type do not trigger unrelated handlers', () => {
    const bus = createEventBus();
    const createHandler = vi.fn();
    const deleteHandler = vi.fn();

    bus.on('annotation:create', createHandler);
    bus.on('annotation:delete', deleteHandler);

    bus.emit({ type: 'annotation:delete', id: 'test-1' });

    expect(createHandler).not.toHaveBeenCalled();
    expect(deleteHandler).toHaveBeenCalledOnce();
  });

  test('emitting scope:changed triggers subscribed handlers', () => {
    const bus = createEventBus();
    const handler = vi.fn();
    const previousScope = makeViewScope({ id: 'previous', index: 0 });
    const scope = makeViewScope({ id: 'next', index: 1 });

    bus.on('scope:changed', handler);
    bus.emit({ type: 'scope:changed', scope, previousScope });

    expect(handler).toHaveBeenCalledWith({ type: 'scope:changed', scope, previousScope });
  });
});
