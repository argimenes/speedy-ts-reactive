import type { JsonObject, RepositoryState } from "./types";

export type LinkedAnnotationRegistry = Record<string, JsonObject>;
export function linkedRegistry(state: RepositoryState): LinkedAnnotationRegistry {
  return state.contents[state.placements[state.rootPlacementKey].contentKey].payload.linkedAnnotations as LinkedAnnotationRegistry ?? {};
}
export function resolveLinkedProperty(state: RepositoryState, property: JsonObject): JsonObject {
  const shared = typeof property.annotationId === "string" ? linkedRegistry(state)[property.annotationId] : undefined;
  return shared ? { ...property, ...shared, id: property.id, annotationId: property.annotationId, start: property.start, end: property.end, isDeleted: !!property.isDeleted || !!shared.isDeleted } : property;
}
