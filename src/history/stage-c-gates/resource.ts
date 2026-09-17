/** G1 candidate only. Not a shipped schema or an editor repository. */
import { clone } from "../../block-tree/clone";
import { equal, freeze, type DeepReadonly } from "../../block-tree/commit-capture";
import type { ContentRecord, PlacementRecord, RepositoryState } from "../../block-tree/types";
import { diffContent, type ContentChange, type HistoryChanges } from "../../block-tree/compact-changes";
import { applyExactRecords } from "../apply-records";

import { externalDefinitionLink, validateTarget, type ExternalTarget } from "../../block-tree/external-reference";
export type { ExternalTarget } from "../../block-tree/external-reference";
export type ResourcePlacement =
  | { key: string; placementId: string; target: { kind: "local"; contentKey: string }; kind: PlacementRecord["kind"] }
  | { key: string; placementId: string; target: { kind: "external"; reference: ExternalTarget }; kind: "reference" };
export interface ResourceSnapshot {
  format: "codex-resource-gate";
  version: 1;
  resourceId: string;
  rootPlacementKey: string;
  revision: number;
  contents: Record<string, ContentRecord>;
  placements: Record<string, ResourcePlacement>;
}
export interface OwnershipEvidence {
  /** Authoritative enrollment/creation evidence, never inferred by this projector. */
  contents: ReadonlyMap<string, string>;
  placementIds: ReadonlyMap<string, string>;
  /** Source information captured at the owned reference, not fetched during replay. */
  externalTargets: ReadonlyMap<string, ExternalTarget>;
  root: { key: string; placementId: string; contentKey: string };
}

function requireValid(ok: unknown, reason: string): asserts ok {
  if (!ok) throw new Error(`G1 resource: ${reason}`);
}
const id = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

export function validateResource(state: ResourceSnapshot): void {
  requireValid(state.format === "codex-resource-gate" && state.version === 1 && id(state.resourceId), "unsupported envelope");
  requireValid(Number.isSafeInteger(state.revision) && state.revision >= 0, "invalid local counter");
  const root = state.placements[state.rootPlacementKey];
  requireValid(root && root.kind === "owned" && root.target.kind === "local" &&
    state.contents[root.target.contentKey]?.viewType === "document-block", "invalid local Document root");
  const assigned = new Set<string>(), authored = new Set<string>(), slots = new Set<string>();
  for (const [key, c] of Object.entries(state.contents)) {
    requireValid(c.key === key, "content key mismatch");
    if (!["text-cell", "image-cell"].includes(c.viewType)) {
      requireValid(id(c.payload.id) && !authored.has(c.payload.id), "missing/duplicate Block identity");
      authored.add(c.payload.id);
    }
    requireValid(c.viewType !== "workspace-block" && (c.viewType !== "document-block" || root.target.kind === "local" && root.target.contentKey === key), "nested resource");
    for (const value of [c.payload, ...Array.isArray(c.payload.standoffProperties) ? c.payload.standoffProperties : [], ...Array.isArray(c.payload.blockProperties) ? c.payload.blockProperties : []]) {
      if (value && typeof value === "object") {
        const link = externalDefinitionLink(value as Record<string, unknown>);
        requireValid(!link || link.source.scope !== "document" || link.source.resourceId !== state.resourceId, "owned definition disguised as external");
      }
    }
    for (const p of [...c.children, ...c.inlineContent, ...Object.values(c.ownedRelations)]) {
      requireValid(p !== state.rootPlacementKey && !slots.has(p) && state.placements[p], "missing/duplicate structural slot");
      slots.add(p);
    }
    for (const p of c.inlineContent) requireValid(state.placements[p]?.kind === "inline", "non-inline Cell placement");
  }
  for (const [key, p] of Object.entries(state.placements)) {
    requireValid(p.key === key && id(p.placementId) && !assigned.has(p.placementId), "missing/duplicate placement identity");
    assigned.add(p.placementId);
    requireValid(key === state.rootPlacementKey || slots.has(key), "detached edge");
    if (p.target.kind === "external") {
      requireValid(p.kind === "reference", "external target must be explicit reference");
      validateTarget(p.target.reference);
      requireValid(p.target.reference.kind !== "block" || !authored.has(p.target.reference.targetId), "external Block identity conflicts with owned definition");
      requireValid(p.target.reference.source.scope !== "document" || p.target.reference.source.resourceId !== state.resourceId, "local target disguised as external");
    } else requireValid(p.target.kind === "local" && state.contents[p.target.contentKey], "missing owned target");
  }
  const visit = (key: string, ancestors: Set<string>) => {
    const p = state.placements[key];
    if (p.target.kind === "external") return;
    if (ancestors.has(p.target.contentKey)) {
      requireValid(p.kind === "reference", "owned cycle"); return;
    }
    const c = state.contents[p.target.contentKey], next = new Set(ancestors).add(c.key);
    for (const child of [...c.children, ...c.inlineContent, ...Object.values(c.ownedRelations)]) visit(child, next);
  };
  visit(state.rootPlacementKey, new Set());
  // Owned unplaced content is still owned state; validate its component too.
  for (const c of Object.values(state.contents)) for (const p of [...c.children, ...c.inlineContent, ...Object.values(c.ownedRelations)]) visit(p, new Set([c.key]));
}

/** Whole-state correctness oracle, deliberately unsuitable for a commit callback. */
export function projectOwned(state: RepositoryState, resourceId: string, evidence: OwnershipEvidence, revision: number): DeepReadonly<ResourceSnapshot> {
  const contents: ResourceSnapshot["contents"] = Object.create(null), placements: ResourceSnapshot["placements"] = Object.create(null);
  const edge = (key: string) => {
    const p = state.placements[key], placementId = evidence.placementIds.get(key);
    requireValid(p && placementId, "missing committed placement evidence");
    if (p.externalReference) {
      placements[key] = { key, placementId, kind: "reference", target: { kind: "external", reference: clone(p.externalReference) } };
    } else if (evidence.contents.get(p.contentKey) === resourceId) {
      placements[key] = { key, placementId, kind: p.kind, target: { kind: "local", contentKey: p.contentKey } };
    } else {
      const reference = evidence.externalTargets.get(key);
      requireValid(p.kind === "reference" && reference, "missing external ownership/provenance evidence");
      placements[key] = { key, placementId, kind: "reference", target: { kind: "external", reference: clone(reference) } };
    }
  };
  for (const [key, owner] of evidence.contents) {
    if (owner !== resourceId || !state.contents[key]) continue;
    const c = contents[key] = clone(state.contents[key]);
    for (const p of [...c.children, ...c.inlineContent, ...Object.values(c.ownedRelations)]) edge(p);
  }
  const root = evidence.root;
  requireValid(evidence.contents.get(root.contentKey) === resourceId, "missing Document ownership evidence");
  placements[root.key] = { key: root.key, placementId: root.placementId, kind: "owned", target: { kind: "local", contentKey: root.contentKey } };
  const result: ResourceSnapshot = { format: "codex-resource-gate", version: 1, resourceId, revision,
    rootPlacementKey: root.key, contents, placements };
  validateResource(result);
  return freeze(result);
}

export interface ResourceOccurrence { placementId: string; route: string[]; blockId?: string; external?: ExternalTarget; cycle?: boolean }
export function locations(snapshot: DeepReadonly<ResourceSnapshot>, placementId: string): DeepReadonly<ResourceOccurrence[]> {
  const results: ResourceOccurrence[] = [];
  const visit = (key: string, route: string[], ancestors: Set<string>) => {
    const p = snapshot.placements[key], nextRoute = [...route, p.placementId];
    if (p.target.kind === "external") {
      if (p.placementId === placementId) results.push({ placementId, route: nextRoute, external: clone(p.target.reference) as ExternalTarget });
      return;
    }
    const c = snapshot.contents[p.target.contentKey], cycle = ancestors.has(c.key);
    if (p.placementId === placementId) results.push({ placementId, route: nextRoute, blockId: c.payload.id as string, ...(cycle ? { cycle } : {}) });
    if (cycle) return;
    for (const child of [...c.children, ...Object.values(c.ownedRelations)]) visit(child, nextRoute, new Set(ancestors).add(c.key));
  };
  visit(snapshot.rootPlacementKey, [], new Set());
  return freeze(results);
}

/** Diagnostic only: no resolver, live repository or implicit source lookup. */
export function externalStatus(target: DeepReadonly<ExternalTarget>): "unknown-source" | "unpinned" | "resolution-not-attempted" {
  return target.source.scope === "unknown" ? "unknown-source" : target.version.kind === "unpinned" ? "unpinned" : "resolution-not-attempted";
}

/** Gate equality deliberately excludes source Workspace counters, not owned counters. */
export function sameOwnedState(a: DeepReadonly<ResourceSnapshot>, b: DeepReadonly<ResourceSnapshot>): boolean {
  return equal(a, b);
}

export interface ResourceTransition {
  format: "codex-resource-transition-gate"; version: 1; resourceId: string;
  commitId: string; cause: HistoryChanges["cause"]; timestamp: string;
  label: string; commands: HistoryChanges["commands"]; inputIntent?: HistoryChanges["inputIntent"];
  sourceCounters: { before: number; after: number };
  beforeRevision: number; afterRevision: number;
  root: { before: string; after: string };
  contents: ContentChange[];
  placements: Array<{ key: string; before: ResourcePlacement | null; after: ResourcePlacement | null }>;
}

/** Independent before/after oracle. The incremental producer must match this. */
export function transition(before: DeepReadonly<ResourceSnapshot>, after: DeepReadonly<ResourceSnapshot>, source: DeepReadonly<HistoryChanges>): DeepReadonly<ResourceTransition> | undefined {
  requireValid(before.resourceId === after.resourceId, "resource mismatch");
  const contents = [...new Set([...Object.keys(before.contents), ...Object.keys(after.contents)])]
    .map(key => diffContent(before.contents[key] as ContentRecord ?? null, after.contents[key] as ContentRecord ?? null, key))
    .filter((c): c is ContentChange => !!c);
  const placements = [...new Set([...Object.keys(before.placements), ...Object.keys(after.placements)])]
    .filter(key => !equal(before.placements[key], after.placements[key]))
    .map(key => ({ key, before: clone(before.placements[key] ?? null) as ResourcePlacement | null, after: clone(after.placements[key] ?? null) as ResourcePlacement | null }));
  if (!contents.length && !placements.length && before.rootPlacementKey === after.rootPlacementKey) return;
  return freeze({ format: "codex-resource-transition-gate", version: 1, resourceId: before.resourceId,
    commitId: source.commitId, cause: clone(source.cause), timestamp: source.timestamp,
    label: source.label, commands: clone(source.commands), ...(source.inputIntent ? { inputIntent: clone(source.inputIntent) } : {}),
    sourceCounters: { before: source.beforeRevision, after: source.afterRevision },
    beforeRevision: before.revision, afterRevision: before.revision + 1,
    root: { before: before.rootPlacementKey, after: after.rootPlacementKey }, contents, placements });
}

export function replayResource(before: DeepReadonly<ResourceSnapshot>, event: DeepReadonly<ResourceTransition>): DeepReadonly<ResourceSnapshot> {
  requireValid(event.format === "codex-resource-transition-gate" && event.version === 1, "unsupported transition");
  requireValid(before.resourceId === event.resourceId && before.rootPlacementKey === event.root.before &&
    before.revision === event.beforeRevision && Number.isSafeInteger(event.afterRevision) && event.afterRevision === event.beforeRevision + 1, "wrong exact parent");
  const next = clone(before) as ResourceSnapshot;
  applyExactRecords(next, event);
  next.rootPlacementKey = event.root.after; next.revision = event.afterRevision;
  validateResource(next);
  return freeze(next);
}
