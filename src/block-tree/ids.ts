import { v4 as uuid } from "uuid";
import type { BlockId, CommitId, ContentKey, NodeKey, PlacementKey, ViewId } from "./types";

export const createBlockId = (): BlockId => uuid();
export const createCommitId = (): CommitId => uuid();

let fallbackId = 0;

function unique(prefix: string): string {
  const id = globalThis.crypto?.randomUUID?.() ?? `local-${++fallbackId}`;
  return `${prefix}:${id}`;
}

export const createContentKey = (): ContentKey => unique("content");
export const createPlacementKey = (): PlacementKey => unique("placement");
export const createViewId = (): ViewId => unique("view");
export const createNodeKey = (_viewId: ViewId, _placementKey: PlacementKey): NodeKey => unique("node");
