import { equal, type DeepReadonly } from "../block-tree/commit-capture";
import type { HistoryChanges } from "../block-tree/compact-changes";
import type { RepositoryState, Slot } from "../block-tree/types";
import type { HistoricalOccurrence } from "./types";

export function edges(content: DeepReadonly<RepositoryState>["contents"][string]): Array<{ key: string; slot: Slot; index?: number }> {
  return [
    ...content.children.map((key, index) => ({ key, slot: { kind: "children" } as Slot, index })),
    ...content.inlineContent.map((key, index) => ({ key, slot: { kind: "inline-content" } as Slot, index })),
    ...Object.entries(content.ownedRelations).map(([name, key]) => ({ key, slot: { kind: "relation", name } as Slot })),
  ];
}
/** Rebuildable indexes for one exact state; no runtime projection or live keys. */
export function indexHistoricalState(state: DeepReadonly<RepositoryState>) {
  const byBlock = new Map<string, string>();
  const occurrences = new Map<string, HistoricalOccurrence[]>();
  const definitionUsers = new Map<string, Set<string>>();
  for (const content of Object.values(state.contents)) {
    if (typeof content.payload.id === "string" && content.viewType !== "text-cell" && content.viewType !== "image-cell") byBlock.set(content.payload.id, content.key);
    for (const field of ["standoffProperties", "blockProperties"]) {
      const properties = content.payload[field];
      if (Array.isArray(properties)) for (const property of properties) if (typeof property?.annotationId === "string") {
        const users = definitionUsers.get(property.annotationId) ?? new Set<string>();
        users.add(content.key); definitionUsers.set(property.annotationId, users);
      }
    }
  }
  const visit = (key: string, route: string[], ancestors: Set<string>, parentContentKey?: string, slot?: Slot, index?: number) => {
    const placement = state.placements[key], content = state.contents[placement.contentKey];
    const path = [...route, key];
    const occurrence = { placementKey: key, contentKey: content.key, route: path, parentContentKey, slot, index };
    const matches = occurrences.get(content.key) ?? []; matches.push(occurrence); occurrences.set(content.key, matches);
    if (ancestors.has(content.key)) return;
    const next = new Set(ancestors).add(content.key);
    for (const edge of edges(content)) visit(edge.key, path, next, content.key, edge.slot, edge.index);
  };
  visit(state.rootPlacementKey, [], new Set());
  return { byBlock, occurrences, definitionUsers };
}

/** Conservative before/after relevance. Query traversal options refine this
 * superset. Reverse graph edges include references; visited sets stop cycles. */
export function affectedBlockIds(before: RepositoryState, after: RepositoryState, event: DeepReadonly<HistoryChanges>): Set<string> {
  const result = new Set<string>();
  const locations = (state: RepositoryState) => new Map(Object.values(state.contents).flatMap(content => edges(content).map(edge => [edge.key, [content.key, edge.slot, edge.index]] as const)));
  const oldLocations = locations(before), newLocations = locations(after);
  const moved = new Set([...oldLocations.keys(), ...newLocations.keys()].filter(key => !equal(oldLocations.get(key), newLocations.get(key))));
  if (before.rootPlacementKey !== after.rootPlacementKey) { moved.add(before.rootPlacementKey); moved.add(after.rootPlacementKey); }
  const oldIds = new Set(Object.values(before.contents).map(c => c.payload.id)), newIds = new Set(Object.values(after.contents).map(c => c.payload.id));
  for (const state of [before, after]) {
    const byId = new Map(Object.values(state.contents).filter(c => typeof c.payload.id === "string").map(c => [String(c.payload.id), c.key]));
    const parents = new Map<string, Set<string>>();
    const link = (child: string, parent: string) => { const owners = parents.get(child) ?? new Set(); owners.add(parent); parents.set(child, owners); };
    const root = state.contents[state.placements[state.rootPlacementKey].contentKey];
    const definitions = (root.payload.linkedAnnotations ?? {}) as Record<string, unknown>;
    const touched = new Set(event.contents.map(change => change.key));
    const descendants = new Set<string>();
    const movedSubtree = (key: string) => {
      const contentKey = state.placements[key]?.contentKey;
      if (!contentKey || descendants.has(contentKey)) return;
      descendants.add(contentKey); touched.add(contentKey);
      for (const edge of edges(state.contents[contentKey])) movedSubtree(edge.key);
    };
    moved.forEach(movedSubtree);
    for (const placement of event.placements) {
      if (placement.before) touched.add(placement.before.contentKey);
      if (placement.after) touched.add(placement.after.contentKey);
    }
    for (const content of Object.values(state.contents)) {
      for (const edge of edges(content)) { const child = state.placements[edge.key]?.contentKey; if (child) link(child, content.key); }
      const inspect = (value: unknown) => {
        if (!value || typeof value !== "object") return;
        const property = value as Record<string, unknown>;
        if (property.type === "codex/block-reference" && typeof property.value === "string") {
          const target = byId.get(property.value); if (target) link(target, content.key);
          // Target creation/deletion changes the dependency's availability.
          if ((state === before ? newIds : oldIds).has(property.value) !== !!target) touched.add(content.key);
        }
      };
      inspect(content.payload);
      for (const field of ["standoffProperties", "blockProperties"]) if (Array.isArray(content.payload[field])) for (const property of content.payload[field]) {
        inspect(property);
        if (typeof property?.annotationId === "string") {
          const other = state === before ? after : before;
          const otherDefinitions = (other.contents[other.placements[other.rootPlacementKey].contentKey].payload.linkedAnnotations ?? {}) as Record<string, unknown>;
          if (!equal(definitions[property.annotationId], otherDefinitions[property.annotationId])) touched.add(content.key);
          inspect(definitions[property.annotationId]);
        }
      }
    }
    const seen = new Set<string>();
    const visit = (key: string) => {
      if (seen.has(key)) return; seen.add(key);
      const content = state.contents[key];
      if (content && typeof content.payload.id === "string") result.add(content.payload.id);
      for (const parent of parents.get(key) ?? []) visit(parent);
    };
    touched.forEach(visit);
  }
  return result;
}
