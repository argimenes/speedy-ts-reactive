import type { NodeKey, PlacementKey } from "./types";

export class OccurrenceIndex {
  private nodeToPlacement = new Map<NodeKey, PlacementKey>();

  register(nodeKey: NodeKey, placementKey: PlacementKey): void {
    this.nodeToPlacement.set(nodeKey, placementKey);
  }

  unregister(nodeKey: NodeKey): void {
    this.nodeToPlacement.delete(nodeKey);
  }

  resolve(key: NodeKey | PlacementKey): PlacementKey | undefined {
    return this.nodeToPlacement.get(key as NodeKey) ?? (key as PlacementKey);
  }
}
