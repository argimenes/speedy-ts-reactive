/** B1 qualification ONLY. No application save/open route imports this module.
 * Reuses the existing resource graph; deliberately fails at unproven boundaries. */
import { clone } from "../../block-tree/clone";
import { freeze, type DeepReadonly } from "../../block-tree/commit-capture";
import { externalDefinitionLink } from "../../block-tree/external-reference";
import type { CanonicalRepository } from "../../block-tree/repository";
import type { ContentRecord, RepositoryState } from "../../block-tree/types";
import { assertPortableJson } from "../../block-tree/portable-spike/codec";
import { durablePlacementId, resourceToRepository } from "../../history/durable-core";
import { decodeGateDocument, encodeGateDocument, type GateDocument } from "../../history/stage-c-gates/portable";
import { projectOwned, validateResource, type ResourceSnapshot } from "../../history/stage-c-gates/resource";

function check(value: unknown, message: string): asserts value {
  if (!value) throw new Error(`Native B1: ${message}`);
}
const id = (v: unknown): v is string => typeof v === "string" && !!v.trim();
const slots = (c: DeepReadonly<ContentRecord>) => [...c.children, ...c.inlineContent, ...Object.values(c.ownedRelations)];
const identity = (c: DeepReadonly<ContentRecord>) => (c.payload.metadata as Record<string, unknown> | undefined)?.documentId ?? c.payload.id;

/** One immutable snapshot. Membership follows owned/inline edges and explicit
 * definition retention, NEVER references or visible occurrence traversal. */
export function captureNative(state: DeepReadonly<RepositoryState>, resourceId: string): DeepReadonly<ResourceSnapshot> {
  check(id(resourceId), "missing resource identity");
  const documents = Object.values(state.contents).filter(c => c.viewType === "document-block" && identity(c) === resourceId);
  check(documents.length === 1, "missing or ambiguous canonical Document identity");
  const root = documents[0];
  const owners = Object.values(state.placements).filter(p => !p.externalReference && p.kind === "owned" && p.contentKey === root.key);
  check(owners.length === 1, "Document needs one canonical owned placement");
  const membership = new Map<string, string>(), visiting = new Set<string>();
  const visit = (key: string) => {
    check(!visiting.has(key), "owned cycle");
    if (membership.has(key)) return;
    const c = state.contents[key]; check(c, "missing owned content");
    check(c.definitionOwnerKey === undefined || c.definitionOwnerKey === root.key, "conflicting retained-definition owner");
    membership.set(key, resourceId); visiting.add(key);
    for (const slot of slots(c)) {
      const p = state.placements[slot]; check(p, "missing placement");
      if (p.kind !== "reference") visit(p.contentKey);
    }
    visiting.delete(key);
  };
  visit(root.key);
  for (const c of Object.values(state.contents)) if (c.definitionOwnerKey === root.key) visit(c.key);
  const localSlots = new Set([...membership.keys()].flatMap(key => slots(state.contents[key])));
  localSlots.add(owners[0].key);
  const ownerCounts = new Map<string, number>();
  for (const p of Object.values(state.placements)) if (membership.has(p.contentKey) && p.kind !== "reference") {
    check(localSlots.has(p.key), "content has an owner outside this resource");
    ownerCounts.set(p.contentKey, (ownerCounts.get(p.contentKey) ?? 0) + 1);
  }
  check([...ownerCounts.values()].every(count => count <= 1), "multiple canonical owners for one content record");
  // Implicit Workspace-root registries cannot silently become Document-owned.
  const definitions = root.payload.linkedAnnotations as Record<string, unknown> | undefined;
  for (const key of membership.keys()) {
    const c = state.contents[key];
    for (const property of Array.isArray(c.payload.standoffProperties) ? c.payload.standoffProperties : []) {
      if (id(property.annotationId)) check(definitions?.[property.annotationId] || externalDefinitionLink(property),
        `linked annotation ${property.annotationId} lacks Document ownership or explicit foreign provenance`);
    }
  }
  return projectOwned(state as RepositoryState, resourceId, {
    contents: membership,
    placementIds: new Map(Object.values(state.placements).map(p => [p.key, durablePlacementId(p, resourceId)])),
    externalTargets: new Map(), // No invented provenance for live cross-resource pointers.
    root: { key: owners[0].key, contentKey: root.key, placementId: durablePlacementId(owners[0], resourceId) },
  }, 0);
}

export interface NativeDocument {
  format: "mutable-document"; version: 1; resourceId: string;
  document: GateDocument;
  definitionOwnerBlockIds: string[];
}
export function nativeEnvelope(resource: DeepReadonly<ResourceSnapshot>): NativeDocument {
  for (const c of Object.values(resource.contents)) if (!["text-cell", "image-cell"].includes(c.viewType)) {
    check(c.payload.type === c.viewType, "legacy/missing authored type would be rewritten by the resource codec");
  }
  return { format: "mutable-document", version: 1, resourceId: resource.resourceId,
    document: encodeGateDocument(resource), definitionOwnerBlockIds: Object.values(resource.contents)
      .filter(c => c.definitionOwnerKey !== undefined).map(c => c.payload.id as string).sort() };
}

/** Stable map order for comparison; authored arrays/edges retain their order. */
function ordered(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(ordered);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, ordered(v)]));
  return value;
}
export function nativeText(resource: DeepReadonly<ResourceSnapshot>): string {
  const envelope = nativeEnvelope(resource);
  envelope.document.blocks.sort((a, b) => a.id.localeCompare(b.id));
  return JSON.stringify(ordered(envelope), null, 2) + "\n";
}
export const nativeBytes = (resource: DeepReadonly<ResourceSnapshot>) => new TextEncoder().encode(nativeText(resource));

function fields(value: any, allowed: string[]) {
  check(value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).every(k => allowed.includes(k)), "unknown reserved wire field or invalid record");
}
function target(value: any) {
  fields(value, ["kind", "targetId", "source", "version", "targetPlacementId", "targetRoute"]);
  fields(value.source, value.source?.scope === "unknown" ? ["scope"] : ["scope", "resourceId"]);
  fields(value.version, value.version?.kind === "unpinned" ? ["kind"] : ["kind", "memoirId", "segmentId", "revisionId"]);
}
export function decodeNative(bytes: Uint8Array): DeepReadonly<ResourceSnapshot> {
  const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as NativeDocument;
  assertPortableJson(value);
  fields(value, ["format", "version", "resourceId", "document", "definitionOwnerBlockIds"]);
  check(value.format === "mutable-document" && value.version === 1 && id(value.resourceId), "unsupported native envelope/version");
  const doc = value.document;
  fields(doc, ["format", "version", "resourceId", "root", "blocks"]);
  check(doc.resourceId === value.resourceId && Array.isArray(doc.blocks), "resource identity or definitions mismatch");
  const edge = (e: any) => {
    fields(e, ["placementId", "kind", "target"]);
    fields(e.target, e.target?.kind === "local" ? ["kind", "blockId"] : ["kind", "reference"]);
    if (e.target.kind === "external") target(e.target.reference);
  };
  edge(doc.root);
  for (const b of doc.blocks) {
    fields(b, ["id", "type", "properties", "children", "relations", "inline"]);
    if (b.children != null) { check(Array.isArray(b.children), "invalid children"); b.children.forEach(edge); }
    if (b.relations != null) {
      fields(b.relations, ["owned", "opaque"]);
      check(b.relations.owned && typeof b.relations.owned === "object" && !Array.isArray(b.relations.owned), "invalid relations");
      Object.values(b.relations.owned).forEach(edge);
    }
    if (b.inline !== undefined) {
      check(Array.isArray(b.inline), "invalid inline content");
      for (const atom of b.inline) fields(atom, atom.kind === "text" ? ["kind", "text"] : ["kind", "properties"]);
    }
  }
  check(Array.isArray(value.definitionOwnerBlockIds) && value.definitionOwnerBlockIds.every(id) &&
    new Set(value.definitionOwnerBlockIds).size === value.definitionOwnerBlockIds.length, "invalid retention membership");
  const resource = clone(decodeGateDocument(doc)) as ResourceSnapshot;
  const root = resource.placements[resource.rootPlacementKey]; check(root.target.kind === "local", "external root");
  const rootContent = resource.contents[root.target.contentKey];
  check(identity(rootContent) === value.resourceId, "root identity disagrees with resource identity");
  for (const blockId of value.definitionOwnerBlockIds) {
    const content = Object.values(resource.contents).find(c => c.payload.id === blockId);
    check(content, "unknown retained definition"); content.definitionOwnerKey = root.target.contentKey;
  }
  validateResource(resource);
  // Reject orphan/non-owned definitions instead of silently dropping on re-save.
  const recaptured = captureNative(resourceToRepository(resource), value.resourceId);
  check(Object.keys(recaptured.contents).length === Object.keys(resource.contents).length, "definition lacks canonical ownership/retention");
  return freeze(resource);
}

/** Admission into an EXISTING repository/object bank, never a new editor or DTO.
 * Detached decode + collision/ownership checks precede the one atomic commit. */
export function admitNative(repository: CanonicalRepository, bytes: Uint8Array, bankContentKey: string) {
  const resource = decodeNative(bytes), incoming = resourceToRepository(resource), before = repository.snapshot();
  const bank = before.contents[bankContentKey];
  check(bank?.viewType === "workspace-object-bank-block", "qualification admission requires the existing object bank");
  const root = incoming.contents[incoming.placements[incoming.rootPlacementKey].contentKey];
  check(!root.payload.linkedAnnotations || Object.keys(root.payload.linkedAnnotations as object).length === 0,
    "Document-owned linked registry cannot resolve in the current shared-Workspace host");
  const existing = Object.values(before.contents).filter(c => c.viewType === "document-block" && identity(c) === resource.resourceId);
  if (existing.length) {
    check(existing.length === 1, "ambiguous existing resource identity");
    const captured = captureNative(before, resource.resourceId);
    check(nativeText(captured) === nativeText(resource), "disk/live resource conflict; no overwrite or history reset");
    return { placementKey: captured.rootPlacementKey, reused: true };
  }
  const ids = new Set(Object.values(before.contents).map(c => c.payload.id).filter(id));
  const placements = new Set(Object.values(before.placements).map(p => p.placementId).filter(id));
  for (const c of Object.values(incoming.contents)) check(!before.contents[c.key] && (!id(c.payload.id) || !ids.has(c.payload.id)), "Block identity collision");
  for (const p of Object.values(incoming.placements)) check(!before.placements[p.key] && (!p.placementId || !placements.has(p.placementId)), "placement identity collision");
  const updatedBank = { ...bank, children: [...bank.children, incoming.rootPlacementKey], wireChildren: "present" as const };
  repository.commit("B1 admit native Document", [
    ...Object.values(incoming.contents).map(record => ({ kind: "put-content" as const, record })),
    ...Object.values(incoming.placements).map(record => ({ kind: "put-placement" as const, record })),
    { kind: "put-content", record: updatedBank },
  ]);
  return { placementKey: incoming.rootPlacementKey, reused: false };
}
