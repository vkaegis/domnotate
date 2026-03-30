import type { DomnotateEventType, DomnotateEventPayload, EventBus } from '@/types/core';

export function createEventBus(): EventBus {
  const listeners = new Map<string, Set<(event: any) => void>>();

  return {
    emit<T extends DomnotateEventType>(event: DomnotateEventPayload<T>) {
      const set = listeners.get(event.type);
      if (set) {
        for (const handler of set) {
          handler(event);
        }
      }
    },

    on<T extends DomnotateEventType>(
      type: T,
      handler: (event: DomnotateEventPayload<T>) => void,
    ): () => void {
      if (!listeners.has(type)) {
        listeners.set(type, new Set());
      }
      const set = listeners.get(type)!;
      set.add(handler);
      return () => set.delete(handler);
    },
  };
}
