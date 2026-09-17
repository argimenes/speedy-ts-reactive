import { clone } from "./clone";
import { createBlockId, createContentKey, createPlacementKey } from "./ids";
import { isAuthoredBlock, readBlockId } from "./identity";
import type { BlockCommitSubject } from "./commit-capture";
import type { JsonObject, RepositoryState } from "./types";
import { linkedRegistry, type LinkedAnnotationRegistry } from "./linked-annotations";

export interface BlockFragment {
  state: RepositoryState;
  roots: string[];
  linkedAnnotations?: LinkedAnnotationRegistry;
  copyIdentities?: Array<{ source: BlockCommitSubject; copy: BlockCommitSubject }>;
}

/** Remap only known Block references; opaque relations and entity IDs are data. */
export function remapKnownBlockReferences(payload: JsonObject, ids: ReadonlyMap<string, string>): void {
  const remap = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    const property = value as JsonObject;
    if (property.type === "codex/block-reference" && typeof property.value === "string" && ids.has(property.value)) {
      property.value = ids.get(property.value);
    }
  };
  remap(payload);
  for (const field of ["standoffProperties", "blockProperties"]) {
    if (Array.isArray(payload[field])) payload[field].forEach(remap);
  }
  if (payload.linkedAnnotations && typeof payload.linkedAnnotations === "object") {
    Object.values(payload.linkedAnnotations).forEach(remap);
  }
}

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
  const authoredIds = new Map<string, string>();
  const seenIds = new Set<string>();
  const copyIdentities: NonNullable<BlockFragment["copyIdentities"]> = [];
  const annotationIds = new Map(Object.keys(fragment.linkedAnnotations ?? {}).map(id => [id, preserveIds ? id : crypto.randomUUID()]));
  for (const content of Object.values(state.contents)) {
    if (!isAuthoredBlock(content)) continue;
    const oldId = readBlockId(content);
    if (oldId && seenIds.has(oldId)) throw new Error("Ambiguous source Block identities; normalize before copying");
    if (content.payload.id != null && typeof content.payload.id !== "string") throw new Error("Invalid source Block identity");
    if (oldId) seenIds.add(oldId);
    const newId = preserveIds && oldId ? oldId : createBlockId();
    authoredIds.set(content.key, newId);
    if (oldId) ids.set(oldId, newId);
    if (!preserveIds) copyIdentities.push({
      source: { contentKey: content.key, blockId: oldId },
      copy: { contentKey: contentKeys.get(content.key)!, blockId: newId },
    });
  }
  const contents: RepositoryState["contents"] = {};
  for (const content of Object.values(state.contents)) {
    if (authoredIds.has(content.key)) content.payload.id = authoredIds.get(content.key)!;
    content.key = contentKeys.get(content.key)!;
    content.children = content.children.map(key => placementKeys.get(key)!);
    content.inlineContent = content.inlineContent.map(key => placementKeys.get(key)!);
    content.ownedRelations = Object.fromEntries(Object.entries(content.ownedRelations).map(([name, key]) => [name, placementKeys.get(key)!]));
    if (Array.isArray(content.payload.standoffProperties)) for (const property of content.payload.standoffProperties) {
      if (property && annotationIds.has(property.annotationId)) property.annotationId = annotationIds.get(property.annotationId);
    }
    if (!preserveIds) {
      for (const field of ["standoffProperties", "blockProperties"]) {
        const properties = content.payload[field];
        if (Array.isArray(properties)) for (const property of properties) {
          if (!property || typeof property !== "object") continue;
          if (typeof property.id === "string") property.id = crypto.randomUUID();
        }
      }
      remapKnownBlockReferences(content.payload, ids);
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
    if (!preserveIds) remapKnownBlockReferences(copied, ids);
    return [annotationIds.get(id)!, copied];
  }));
  return { state, roots: fragment.roots.map(key => placementKeys.get(key)!), linkedAnnotations: definitions,
    ...(!preserveIds ? { copyIdentities } : {}),
  };
}
