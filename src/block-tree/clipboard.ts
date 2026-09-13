import { clone } from "./clone";
import { createContentKey, createPlacementKey } from "./ids";
import type { JsonObject, RepositoryState } from "./types";
import { linkedRegistry, type LinkedAnnotationRegistry } from "./linked-annotations";

export interface BlockFragment { state: RepositoryState; roots: string[]; linkedAnnotations?: LinkedAnnotationRegistry }

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
  const definitions: LinkedAnnotationRegistry = {};
  for (const content of Object.values(state.contents)) {
    delete content.payload.linkedAnnotations;
    const properties = content.payload.standoffProperties;
    if (Array.isArray(properties)) for (const property of properties) {
      if (property?.annotationId && linkedRegistry(source)[property.annotationId]) definitions[property.annotationId] = clone(linkedRegistry(source)[property.annotationId]);
    }
  }
  return { state, roots: [...roots], linkedAnnotations: definitions };
}

export function cloneBlocks(fragment: BlockFragment, preserveIds = false): BlockFragment {
  const state = clone(fragment.state);
  const contentKeys = new Map(Object.keys(state.contents).map(key => [key, createContentKey()]));
  const placementKeys = new Map(Object.keys(state.placements).map(key => [key, createPlacementKey()]));
  const ids = new Map<string, string>();
  const annotationIds = new Map(Object.keys(fragment.linkedAnnotations ?? {}).map(id => [id, preserveIds ? id : crypto.randomUUID()]));
  if (!preserveIds) for (const content of Object.values(state.contents)) {
    if (typeof content.payload.id === "string") ids.set(content.payload.id, crypto.randomUUID());
  }
  const contents: RepositoryState["contents"] = {};
  for (const content of Object.values(state.contents)) {
    content.key = contentKeys.get(content.key)!;
    content.children = content.children.map(key => placementKeys.get(key)!);
    content.inlineContent = content.inlineContent.map(key => placementKeys.get(key)!);
    content.ownedRelations = Object.fromEntries(Object.entries(content.ownedRelations).map(([name, key]) => [name, placementKeys.get(key)!]));
    if (Array.isArray(content.payload.standoffProperties)) for (const property of content.payload.standoffProperties) {
      if (property && annotationIds.has(property.annotationId)) property.annotationId = annotationIds.get(property.annotationId);
    }
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
  const definitions = Object.fromEntries(Object.entries(fragment.linkedAnnotations ?? {}).map(([id, record]) => {
    const copied: JsonObject = { ...clone(record), id: annotationIds.get(id)! };
    if (!preserveIds && copied.type === "codex/block-reference" && typeof copied.value === "string" && ids.has(copied.value)) copied.value = ids.get(copied.value);
    return [annotationIds.get(id)!, copied];
  }));
  return { state, roots: fragment.roots.map(key => placementKeys.get(key)!), linkedAnnotations: definitions };
}
