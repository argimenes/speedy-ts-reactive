import type { NodeKey } from "../block-tree/types";

export interface NativeTextSelection {
  start: number;
  end: number;
  direction: "forward" | "backward" | "none";
}

export interface MountHandle {
  root: Element;
  focusElement: HTMLElement;
  inputPolicy: "native-text" | "standoff" | "control" | "container" | "opaque-widget";
  generation: number;
  focus(): void;
  captureSelection?(): NativeTextSelection;
  restoreSelection?(selection: NativeTextSelection): void;
  captureInlineSelection?(): { anchor: number; head: number } | undefined;
  restoreInlineSelection?(selection: { anchor: number; head: number }): void;
  captureText?(): string;
  composing?: boolean;
}

type MountSubscriber = (nodeKey: NodeKey, handle: MountHandle) => void;

export class MountRegistry {
  private byNode = new Map<NodeKey, MountHandle>();
  private byElement = new WeakMap<Element, NodeKey>();
  private generations = new Map<NodeKey, number>();
  private subscribers = new Set<MountSubscriber>();
  private selections = new Map<NodeKey, NativeTextSelection>();

  register(
    nodeKey: NodeKey,
    handle: Omit<MountHandle, "generation">,
  ): () => void {
    const generation = (this.generations.get(nodeKey) ?? 0) + 1;
    this.generations.set(nodeKey, generation);
    const mounted: MountHandle = { ...handle, generation };
    this.byNode.set(nodeKey, mounted);
    this.byElement.set(mounted.root, nodeKey);
    this.byElement.set(mounted.focusElement, nodeKey);
    for (const subscriber of this.subscribers) subscriber(nodeKey, mounted);

    return () => {
      if (this.byNode.get(nodeKey)?.generation !== generation) return;
      const selection = mounted.captureSelection?.();
      if (selection) this.selections.set(nodeKey, selection);
      this.byNode.delete(nodeKey);
      this.byElement.delete(mounted.root);
      this.byElement.delete(mounted.focusElement);
    };
  }

  subscribe(subscriber: MountSubscriber): () => void {
    this.subscribers.add(subscriber);
    return () => this.subscribers.delete(subscriber);
  }

  get(nodeKey: NodeKey): MountHandle | undefined {
    return this.byNode.get(nodeKey);
  }

  rememberSelection(nodeKey: NodeKey, selection: NativeTextSelection): void {
    this.selections.set(nodeKey, selection);
  }

  selection(nodeKey: NodeKey): NativeTextSelection | undefined {
    return this.selections.get(nodeKey);
  }

  resolveEvent(event: Event): { nodeKey: NodeKey; handle: MountHandle } | undefined {
    const path = typeof event.composedPath === "function" ? event.composedPath() : [];
    for (const candidate of path) {
      if (!(candidate instanceof Element)) continue;
      const nodeKey = this.byElement.get(candidate);
      if (nodeKey) return { nodeKey, handle: this.byNode.get(nodeKey)! };
    }
    let element = event.target instanceof Element ? event.target : null;
    while (element) {
      const nodeKey = this.byElement.get(element);
      if (nodeKey) return { nodeKey, handle: this.byNode.get(nodeKey)! };
      element = element.parentElement;
    }
    return undefined;
  }

  resolveElement(element: Element | null): { nodeKey: NodeKey; handle: MountHandle } | undefined {
    let current = element;
    while (current) {
      const nodeKey = this.byElement.get(current);
      if (nodeKey) return { nodeKey, handle: this.byNode.get(nodeKey)! };
      current = current.parentElement;
    }
    return undefined;
  }
}
