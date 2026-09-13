import { clone } from "./clone";
import { createContentKey, createPlacementKey } from "./ids";
import type { RepositoryState } from "./types";

export interface BlockFragment { state: RepositoryState; roots: string[] }

/** Canonical capture avoids the legacy DTO format's lossy inline-image export. */
export function captureBlocks(source: RepositoryState, roots: string[]): BlockFragment {
  const state: RepositoryState = { rootPlacementKey: roots[0], contents: {}, placements: {}, revision: 0 };
  const visit = (key: string) => {
    if (state.placements[key]) return;
    const placement = source.placements[key];
    if (!placement) throw new Error("The selected Block no longer exists.");
    state.placements[key] = clone(placement);
    const content = source.contents[placement.contentKey];
    if (state.contents[content.key]) return;
    state.contents[content.key] = clone(content);
    [...content.children, ...content.inlineContent, ...Object.values(content.ownedRelations)].forEach(visit);
  };
  roots.forEach(visit);
  return { state, roots: [...roots] };
}

export function cloneBlocks(fragment: BlockFragment, preserveIds = false): BlockFragment {
  const state = clone(fragment.state);
  const contentKeys = new Map(Object.keys(state.contents).map(key => [key, createContentKey()]));
  const placementKeys = new Map(Object.keys(state.placements).map(key => [key, createPlacementKey()]));
  const ids = new Map<string, string>();
  if (!preserveIds) for (const content of Object.values(state.contents)) {
    if (typeof content.payload.id === "string") ids.set(content.payload.id, crypto.randomUUID());
  }
  const contents: RepositoryState["contents"] = {};
  for (const content of Object.values(state.contents)) {
    content.key = contentKeys.get(content.key)!;
    content.children = content.children.map(key => placementKeys.get(key)!);
    content.inlineContent = content.inlineContent.map(key => placementKeys.get(key)!);
    content.ownedRelations = Object.fromEntries(Object.entries(content.ownedRelations).map(([name, key]) => [name, placementKeys.get(key)!]));
    if (!preserveIds) {
      if (typeof content.payload.id === "string") content.payload.id = ids.get(content.payload.id)!;
      for (const field of ["standoffProperties", "blockProperties"]) {
        const properties = content.payload[field];
        if (Array.isArray(properties)) for (const property of properties) {
          if (!property || typeof property !== "object") continue;
          if (typeof property.id === "string") property.id = crypto.randomUUID();
          if (property.type === "codex/block-reference" && ids.has(property.value)) property.value = ids.get(property.value);
        }
      }
    }
    contents[content.key] = content;
  }
  state.contents = contents;
  state.placements = Object.fromEntries(Object.values(state.placements).map(placement => {
    placement.key = placementKeys.get(placement.key)!;
    placement.contentKey = contentKeys.get(placement.contentKey)!;
    return [placement.key, placement];
  }));
  state.rootPlacementKey = placementKeys.get(state.rootPlacementKey)!;
  return { state, roots: fragment.roots.map(key => placementKeys.get(key)!) };
}
