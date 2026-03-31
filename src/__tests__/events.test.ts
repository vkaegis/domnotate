import { describe, test, expect, vi } from 'vitest';
import { createEventBus } from '@/events';

describe('EventBus', () => {
  test('emit + subscribe delivers event', () => {
    const bus = createEventBus();
    const handler = vi.fn();

    bus.on('content:loaded', handler);
    bus.emit({ type: 'content:loaded', url: 'http://example.com', sourceType: 'url', sourceName: 'example.com' });

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith({
      type: 'content:loaded',
      url: 'http://example.com',
      sourceType: 'url',
      sourceName: 'example.com',
    });
  });

  test('multiple handlers on same event type', () => {
    const bus = createEventBus();
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    bus.on('content:unloaded', handler1);
    bus.on('content:unloaded', handler2);
    bus.emit({ type: 'content:unloaded' });

    expect(handler1).toHaveBeenCalledOnce();
    expect(handler2).toHaveBeenCalledOnce();
  });

  test('unsubscribe stops delivery', () => {
    const bus = createEventBus();
    const handler = vi.fn();

    const unsub = bus.on('content:unloaded', handler);
    bus.emit({ type: 'content:unloaded' });
    expect(handler).toHaveBeenCalledTimes(1);

    unsub();
    bus.emit({ type: 'content:unloaded' });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test('different event types do not cross-talk', () => {
    const bus = createEventBus();
    const loadedHandler = vi.fn();
    const unloadedHandler = vi.fn();

    bus.on('content:loaded', loadedHandler);
    bus.on('content:unloaded', unloadedHandler);

    bus.emit({ type: 'content:unloaded' });

    expect(loadedHandler).not.toHaveBeenCalled();
    expect(unloadedHandler).toHaveBeenCalledOnce();
  });
});
