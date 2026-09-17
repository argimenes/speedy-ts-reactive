/** Finite G1 read oracle. No live editor/source capability and no persistence API.
 * P5 must replace full lineage arrays/scans with bounded reader continuations. */
import { clone } from "../../block-tree/clone";
import { equal, freeze, type DeepReadonly } from "../../block-tree/commit-capture";
import { externalDefinitionLink, externalAssetLink, type ExternalTarget } from "../../block-tree/external-reference";
import type { ContentRecord } from "../../block-tree/types";
import { locations, type ResourceSnapshot, type ResourcePlacement, type ResourceOccurrence } from "./resource";

export interface ResourceSelection { blockId: string; placementId?: string; route?: string[] }
export interface ResourceFragment {
  contents: Record<string, ContentRecord>; placements: Record<string, ResourcePlacement>;
  definitions: Record<string, unknown>; external: ExternalTarget[];
}
export interface ResourceQueryResult {
  status: "available" | "unplaced" | "ambiguous-occurrence" | "absent-occurrence" | "deleted" | "not-yet-created" | "unknown-block";
  candidates?: ResourceOccurrence[]; fragment?: ResourceFragment;
}
const block = (s: DeepReadonly<ResourceSnapshot>, id: string) => Object.values(s.contents).find(c => c.payload.id === id);

/** Ancestors/future are proven STATE ancestry for the selected branch, never
 * physical append order. The caller supplies complete finite gate evidence. */
export function queryResource(snapshot: DeepReadonly<ResourceSnapshot>, selection: ResourceSelection,
  lineage: { ancestors: DeepReadonly<ResourceSnapshot>[]; future: DeepReadonly<ResourceSnapshot>[] } = { ancestors: [], future: [] }): DeepReadonly<ResourceQueryResult> {
  const content = block(snapshot, selection.blockId);
  if (!content) {
    if (lineage.ancestors.some(s => block(s, selection.blockId))) return freeze({ status: "deleted" });
    if (lineage.future.some(s => block(s, selection.blockId))) return freeze({ status: "not-yet-created" });
    return freeze({ status: "unknown-block" });
  }
  const all = Object.values(snapshot.placements).filter(p => p.target.kind === "local" && p.target.contentKey === content.key)
    .flatMap(p => locations(snapshot, p.placementId)) as ResourceOccurrence[];
  const candidates = all.filter(p => (!selection.placementId || p.placementId === selection.placementId) && (!selection.route || equal(p.route, selection.route)));
  if (candidates.length > 1) return freeze({ status: "ambiguous-occurrence", candidates });
  if (all.length && !candidates.length) return freeze({ status: "absent-occurrence", candidates: all });
  const fragment: ResourceFragment = { contents: Object.create(null), placements: Object.create(null), definitions: Object.create(null), external: [] };
  const root = snapshot.placements[snapshot.rootPlacementKey];
  const registry = root.target.kind === "local" ? snapshot.contents[root.target.contentKey].payload.linkedAnnotations as Record<string, unknown> | undefined : undefined;
  const inspect = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    const property = value as Record<string, unknown>, external = externalDefinitionLink(property);
    if (external) { fragment.external.push(clone(external)); return; }
    // Candidate payload asset provenance is an explicit typed hint, not a live
    // asset resolver or authority inferred from a URL/assetId string.
    const asset = externalAssetLink(property);
    if (asset) fragment.external.push(clone(asset));
    if (typeof property.annotationId === "string" && registry && Object.hasOwn(registry, property.annotationId) && !Object.hasOwn(fragment.definitions, property.annotationId)) {
      const definition = registry[property.annotationId];
      fragment.definitions[property.annotationId] = clone(definition); inspect(definition);
    }
    if (property.type === "codex/block-reference" && typeof property.value === "string") {
      const dependency = block(snapshot, property.value);
      if (dependency) visitContent(dependency.key);
    }
  };
  const visitContent = (key: string) => {
    if (fragment.contents[key]) return;
    const c = snapshot.contents[key]; fragment.contents[key] = clone(c) as ContentRecord;
    inspect(c.payload);
    for (const field of ["standoffProperties", "blockProperties"]) if (Array.isArray(c.payload[field])) c.payload[field].forEach(inspect);
    for (const pk of [...c.children, ...c.inlineContent, ...Object.values(c.ownedRelations)]) {
      const p = snapshot.placements[pk]; fragment.placements[pk] = clone(p) as ResourcePlacement;
      if (p.target.kind === "external") fragment.external.push(clone(p.target.reference));
      else visitContent(p.target.contentKey);
    }
  };
  if (candidates[0]) {
    const p = Object.values(snapshot.placements).find(p => p.placementId === candidates[0].placementId)!;
    fragment.placements[p.key] = clone(p) as ResourcePlacement;
  }
  visitContent(content.key);
  return freeze({ status: all.length ? "available" : "unplaced", candidates, fragment });
}
