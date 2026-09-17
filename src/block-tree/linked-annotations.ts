import type { JsonObject, RepositoryState } from "./types";
import { externalDefinitionLink } from "./external-reference";

export type LinkedAnnotationRegistry = Record<string, JsonObject>;
export function linkedRegistry(state: RepositoryState): LinkedAnnotationRegistry {
  return state.contents[state.placements[state.rootPlacementKey].contentKey].payload.linkedAnnotations as LinkedAnnotationRegistry ?? {};
}
export function resolveLinkedProperty(state: RepositoryState, property: JsonObject): JsonObject {
  // An explicitly foreign definition cannot be replaced by a same-named local
  // registry entry. Resolution of its owner is separate from this local helper.
  const external = externalDefinitionLink(property);
  if (external) {
    const root = state.contents[state.placements[state.rootPlacementKey].contentKey];
    const metadata = root.payload.metadata as Record<string, unknown> | undefined;
    const matchesOwner = external.source.scope === "workspace" && root.viewType === "workspace-block" && metadata?.workspaceId === external.source.resourceId ||
      external.source.scope === "document" && root.viewType === "document-block" && metadata?.documentId === external.source.resourceId;
    // This live helper may resolve an unpinned reference only against its known
    // owner. Historical resource queries do not use this helper or fetch owners.
    if (!matchesOwner || external.version.kind !== "unpinned") return property;
  }
  const shared = typeof property.annotationId === "string" ? linkedRegistry(state)[property.annotationId] : undefined;
  return shared ? { ...property, ...shared, id: property.id, annotationId: property.annotationId, start: property.start, end: property.end, isDeleted: !!property.isDeleted || !!shared.isDeleted } : property;
}
