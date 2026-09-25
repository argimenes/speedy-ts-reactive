import type { AnnotationCapabilities, AnnotationTarget, SearchRange } from "../../feature-api";
export interface EntitySearchData { entityRanges: SearchRange[]; entityRevision: number; entityQuery: string }
export function openEntitySearch(api: AnnotationCapabilities, ranges: readonly AnnotationTarget[], contextKey?: string) {
  const selected = ranges.filter(range => range.end > range.start);
  const owner = selected[0]?.nodeKey ?? contextKey ?? ranges[0]?.nodeKey;
  if (!owner || !api.text(owner)) throw new Error("Open entity search from a document first.");
  const snapshots: SearchRange[] = [];
  const query = selected.map(range => {
    const node = api.text(range.nodeKey);
    if (!node || !Number.isInteger(range.start) || !Number.isInteger(range.end) || range.start < 0 || range.end > node.cells.length) throw new Error("The selected range is no longer valid.");
    snapshots.push({ ...range, contentKey: node.contentKey, placementKey: node.placementKey, version: node.version, coordinate: "cell" });
    return node.cells.slice(range.start, range.end).map(cell => cell.text).join("");
  }).join(" ");
  return api.openPanel("entity-search", owner, { entityRanges: snapshots, entityRevision: api.revision(), entityQuery: query } satisfies EntitySearchData, selected);
}
export function chooseEntity(api: AnnotationCapabilities, overlay: EntitySearchData, entity: { id: string; name: string }) {
  if (api.revision() !== overlay.entityRevision) throw new Error("The document changed. Select the text again.");
  if (!entity.id || !entity.name || !overlay.entityRanges.length) throw new Error("Select a valid entity.");
  return api.annotate([overlay.entityRanges], "codex/entity-reference", entity.id, { entityId: entity.id, entityName: entity.name }, overlay.entityRevision, "Annotate entity reference")[0];
}
