import type { ContentKey, RepositoryState } from "../block-tree/types";

export interface ModelEventMap {
  beforeChange: { label: string; state: RepositoryState };
  afterChange: { label: string; state: RepositoryState };
  textChanged: { label: string; contentKey: ContentKey; revision: number };
}

type Handler<T> = (event: T) => void;

export class ModelEventBus {
  private handlers = new Map<keyof ModelEventMap, Set<Handler<any>>>();

  hasSubscribers(name: keyof ModelEventMap): boolean {
    return !!this.handlers.get(name)?.size;
  }

  subscribe<K extends keyof ModelEventMap>(name: K, handler: Handler<ModelEventMap[K]>): () => void {
    const handlers = this.handlers.get(name) ?? new Set();
    handlers.add(handler);
    this.handlers.set(name, handlers);
    return () => handlers.delete(handler);
  }

  publish<K extends keyof ModelEventMap>(name: K, event: ModelEventMap[K]): void {
    for (const handler of this.handlers.get(name) ?? []) {
      try {
        handler(event);
      } catch (error) {
        console.error(`Model event ${name} failed`, error);
      }
    }
  }
}
