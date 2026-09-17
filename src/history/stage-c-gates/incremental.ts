/** G3 candidate. Only exact committed deltas enter this adapter. It retains
 * current membership keys, never a repository, a paragraph sequence or tombstones. */
import { freeze, type DeepReadonly } from "../../block-tree/commit-capture";
import type { ContentChange, HistoryChanges } from "../../block-tree/compact-changes";
import type { ContentRecord, PlacementRecord } from "../../block-tree/types";
import type { ResourcePlacement, ResourceSnapshot, ResourceTransition } from "./resource";

export class ProjectionBoundary extends Error {}
const slots = (c: DeepReadonly<ContentRecord>) => [...c.children, ...c.inlineContent, ...Object.values(c.ownedRelations)];
const authored = (c: DeepReadonly<ContentRecord>) => !["text-cell", "image-cell"].includes(c.viewType);

export class IncrementalResourceCapture {
  private readonly contents: Set<string>;
  private readonly placements: Set<string>;
  private readonly rootContent: string;
  private revision: number;
  private sourceRevision: number;
  private failed = false;
  readonly resourceId: string;
  readonly rootKey: string;
  constructor(baseline: DeepReadonly<ResourceSnapshot>, sourceRevision = baseline.revision) {
    const root = baseline.placements[baseline.rootPlacementKey];
    if (root.target.kind !== "local") throw new ProjectionBoundary("Missing owned root");
    this.rootContent = root.target.contentKey; this.rootKey = baseline.rootPlacementKey;
    this.resourceId = baseline.resourceId; this.revision = baseline.revision; this.sourceRevision = sourceRevision;
    for (const c of Object.values(baseline.contents)) if (authored(c) && c.definitionOwnerKey !== this.rootContent) {
      throw new ProjectionBoundary("Normalize explicit definition ownership before enrollment");
    }
    this.contents = new Set(Object.keys(baseline.contents)); this.placements = new Set(Object.keys(baseline.placements));
  }
  get retainedKeys() { return { contents: this.contents.size, placements: this.placements.size }; }
  get localRevision() { return this.revision; }
  capture(source: DeepReadonly<HistoryChanges>): DeepReadonly<ResourceTransition> | undefined {
    if (this.failed) throw new ProjectionBoundary("Projection requires a new enrollment boundary");
    try { return this.project(source); }
    catch (error) { this.failed = true; throw error; }
  }
  private project(source: DeepReadonly<HistoryChanges>): DeepReadonly<ResourceTransition> | undefined {
    if (source.beforeRevision !== this.sourceRevision || source.afterRevision !== source.beforeRevision + 1) throw new ProjectionBoundary("Noncontiguous source capture");
    const addContents = new Set<string>(), removeContents = new Set<string>();
    const addSlots = new Set<string>(), removeSlots = new Set<string>();
    const ownedChanges: DeepReadonly<ContentChange>[] = [];
    const changes = new Map(source.placements.map(p => [p.key, p]));
    for (const c of source.contents) {
      let owned = this.contents.has(c.key);
      if (c.kind === "record-content") {
        const nextOwned = c.after && authored(c.after) && c.after.definitionOwnerKey === this.rootContent;
        if (owned && c.after && authored(c.after) && !nextOwned || !owned && c.before && nextOwned) throw new ProjectionBoundary("Definition ownership transfer");
        if (!owned && nextOwned) { owned = true; addContents.add(c.key); }
        if (!owned) continue;
        if (c.before) for (const pk of slots(c.before)) removeSlots.add(pk);
        if (c.after) for (const pk of slots(c.after)) addSlots.add(pk);
        else removeContents.add(c.key);
      } else {
        const membership = c.fields.find(f => f.scope === "record" && f.field === "definitionOwnerKey");
        if (membership && (owned || membership.after.present && membership.after.value === this.rootContent)) throw new ProjectionBoundary("Definition ownership transfer");
        if (!owned) continue;
        for (const sequence of c.sequences) {
          for (const pk of sequence.removed) removeSlots.add(pk);
          for (const pk of sequence.inserted) addSlots.add(pk);
        }
        for (const f of c.fields) if (f.scope === "record" && f.field === "ownedRelations") {
          if (f.before.present) for (const pk of Object.values(f.before.value as Record<string, string>)) removeSlots.add(pk);
          if (f.after.present) for (const pk of Object.values(f.after.value as Record<string, string>)) addSlots.add(pk);
        }
      }
      ownedChanges.push(c);
    }
    const nextSlot = (key: string) => addSlots.has(key) || this.placements.has(key) && !removeSlots.has(key);
    // Cells acquire ownership only through an owned host's exact inserted slot.
    for (const key of addSlots) {
      const p = changes.get(key)?.after;
      if (!p && !this.placements.has(key)) throw new ProjectionBoundary("Unproved incoming structural placement");
      if (p?.kind === "inline") addContents.add(p.contentKey);
    }
    const already = new Set(ownedChanges.map(c => c.key));
    for (const c of source.contents) if (!already.has(c.key) && addContents.has(c.key)) {
      if (c.kind !== "record-content" || c.before || !c.after || authored(c.after)) throw new ProjectionBoundary("Unproved Cell ownership");
      ownedChanges.push(c);
    }
    if (removeContents.has(this.rootContent)) throw new ProjectionBoundary("Document scope ended");
    const ownsContent = (key: string) => !removeContents.has(key) && (this.contents.has(key) || addContents.has(key));
    const projectPlacement = (p: DeepReadonly<PlacementRecord> | null, before: boolean): ResourcePlacement | null => {
      if (!p) return null;
      const placementId = p.kind === "inline" ? `private-cell:${p.key}` : p.placementId;
      if (!placementId) throw new ProjectionBoundary("Missing semantic Placement identity");
      if (p.externalReference) return { key: p.key, placementId, kind: "reference", target: { kind: "external", reference: p.externalReference } } as ResourcePlacement;
      if (!(before ? this.contents.has(p.contentKey) : ownsContent(p.contentKey))) throw new ProjectionBoundary("External target lacks a terminal descriptor");
      return { key: p.key, placementId, kind: p.kind, target: { kind: "local", contentKey: p.contentKey } };
    };
    const placements: ResourceTransition["placements"] = [];
    for (const p of source.placements) {
      const wasOwned = this.placements.has(p.key), isOwned = nextSlot(p.key);
      if (!wasOwned && !isOwned) continue;
      if (p.key === this.rootKey && !p.after) throw new ProjectionBoundary("Document scope ended");
      if (wasOwned && !isOwned && p.after || !wasOwned && isOwned && p.before) throw new ProjectionBoundary("Placement ownership transfer");
      placements.push({ key: p.key, before: wasOwned ? projectPlacement(p.before, true) : null, after: isOwned ? projectPlacement(p.after, false) : null });
    }
    // Every changed membership must be backed by captured placement pre/postimages.
    for (const pk of removeSlots) if (!addSlots.has(pk) && !changes.has(pk)) throw new ProjectionBoundary("Missing removed placement preimage");
    this.sourceRevision = source.afterRevision;
    if (!ownedChanges.length && !placements.length) return;
    // Preserve source order for direct oracle equality; no traversal of content values.
    const included = new Set(ownedChanges.map(c => c.key));
    const contents = source.contents.filter(c => included.has(c.key));
    for (const key of removeContents) this.contents.delete(key);
    for (const key of addContents) this.contents.add(key);
    for (const key of removeSlots) this.placements.delete(key);
    for (const key of addSlots) this.placements.add(key);
    const beforeRevision = this.revision++;
    return freeze({ format: "codex-resource-transition-gate", version: 1, resourceId: this.resourceId,
      commitId: source.commitId, cause: source.cause, timestamp: source.timestamp, label: source.label, commands: source.commands,
      ...(source.inputIntent ? { inputIntent: source.inputIntent } : {}),
      sourceCounters: { before: source.beforeRevision, after: source.afterRevision }, beforeRevision, afterRevision: this.revision,
      root: { before: this.rootKey, after: this.rootKey }, contents, placements } as ResourceTransition);
  }
}
