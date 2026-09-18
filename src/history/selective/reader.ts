import { equal, freeze, type DeepReadonly } from "../../block-tree/commit-capture";
import type { ReaderIdentity } from "../durable-reader";
import { DURABLE_LIMITS, queryDurableClosure } from "../durable-core";
import type { HistorySelection } from "../ui-session-source";
import type { ResourceSnapshot } from "../stage-c-gates/resource";
import type { SubtreeResult } from "../types";
import { PageReader, SELECTIVE_LIMITS, requireRead, type BlobIO, type BlobRef } from "./pages";
import { isCell, type BlockEntry, type Bundle, type Certificate, type Manifest, type Row } from "./contracts";

export interface SelectiveIO extends BlobIO {
  /** Production routing uses authenticated actual closure cost, before loading it. */
  chooseRoute?: boolean;
  certificate(sequence: number, revisionId: string, signal?: AbortSignal): Promise<Certificate | undefined>;
  fallback(sequence: number, revisionId: string, selection: HistorySelection, signal?: AbortSignal): Promise<DeepReadonly<SubtreeResult>>;
}
/** Serialized session use, with optional bounded production routing. */
export class SelectiveReader {
  readonly pages: PageReader;
  constructor(private identity: ReaderIdentity, private io: SelectiveIO) { this.pages = new PageReader(io); }
  clear() { this.pages.clear(); }
  async select(sequence: number, revisionId: string, selection: HistorySelection, signal?: AbortSignal) {
    this.pages.begin(); const start = performance.now(); let source: "selective" | "full" = "selective";
    let result: DeepReadonly<SubtreeResult>;
    try { result = await this.reconstruct(sequence, revisionId, selection, signal); }
    catch (error) {
      signal?.throwIfAborted(); if ((error as Error)?.name === "AbortError") throw error;
      this.pages.clear(); this.pages.metrics.fallback = String(error); source = "full";
      // Never fabricate an empty/deleted state from a missing or corrupt index.
      result = await this.io.fallback(sequence, revisionId, selection, signal);
    }
    signal?.throwIfAborted(); this.pages.metrics.totalMs = performance.now() - start;
    return { result, source, metrics: { ...this.pages.metrics } };
  }
  private async reconstruct(sequence: number, revisionId: string, selection: HistorySelection, signal?: AbortSignal): Promise<DeepReadonly<SubtreeResult>> {
    signal?.throwIfAborted(); requireRead(Number.isSafeInteger(sequence) && sequence >= 0 && sequence <= this.identity.headSequence, "outside fixed head");
    const certificate = await this.io.certificate(sequence, revisionId, signal); requireRead(certificate, "no certified acceleration");
    const c = certificate!, expected = this.identity;
    requireRead(c.binding.resourceId === expected.resourceId && c.binding.memoirId === expected.memoirId && c.binding.segmentId === expected.segmentId &&
      c.binding.sequence === sequence && c.binding.revisionId === revisionId, "certificate identity mismatch");
    const manifest = await this.pages.value(c.manifest, signal) as Manifest;
    requireRead(manifest.format === "selective-history-spike" && manifest.version === 1 && equal(manifest.binding, c.binding), "manifest binding mismatch");
    requireRead(Number.isSafeInteger(manifest.locationWork) && manifest.locationWork >= 0 && manifest.locationWork <= DURABLE_LIMITS.maxGraphRecords * 2, "location evidence bound");
    const lookup = (key: string) => this.pages.lookup(manifest.lookup, key, signal);
    const blockRef = await lookup(`B:${selection.blockId}`) as BlobRef | undefined;
    if (!blockRef) return freeze({ blockId: selection.blockId, revisionId, status: "unknown-block", message: "Block absent in this exact state; no unbounded ancestry search was performed." });
    const block = await this.pages.value(blockRef, signal) as BlockEntry;
    if (this.io.chooseRoute) {
      requireRead(block.cost && Number.isFinite(block.cost.bytes) && Number.isFinite(block.cost.pages) && manifest.stateBytes,
        "closure cost unavailable");
      requireRead(block.cost!.bytes <= Math.min(1024 * 1024, Math.max(128 * 1024, manifest.stateBytes! * 0.4)) && block.cost!.pages <= 48,
        "full route: closure byte/page cost");
    }
    const graph: Pick<ResourceSnapshot, "contents" | "placements"> = { contents: Object.create(null), placements: Object.create(null) };
    for (const o of block.occurrences) {
      requireRead(o.placement.key === o.occurrence.placementKey && o.placement.target.kind === "local" && o.placement.target.contentKey === block.contentKey, "occurrence binding mismatch");
      graph.placements[o.placement.key] = o.placement;
    }
    if (selection.placementId) {
      const placementKey = await lookup(`P:${selection.placementId}`);
      requireRead(block.occurrences.every(o => o.placement.placementId !== selection.placementId || o.placement.key === placementKey), "placement evidence mismatch");
    }
    const candidates = block.occurrences.filter(o => (!selection.placementId || o.placement.placementId === selection.placementId) && (!selection.route || equal(selection.route, o.occurrence.route)));
    if (candidates.length > 1) return freeze({ blockId: selection.blockId, revisionId, status: "ambiguous-occurrence", candidates: candidates.map(o => o.occurrence) });
    if (block.occurrences.length && !candidates.length) return freeze({ blockId: selection.blockId, revisionId, status: "absent-occurrence", candidates: block.occurrences.map(o => o.occurrence) });

    const scheduled = new Set([block.contentKey]), pending = [block.contentKey]; let cursor = 0, records = 0;
    while (cursor < pending.length) {
      signal?.throwIfAborted(); const key = pending[cursor++], referenced = new Set<string>();
      const bundleRef = await lookup(`C:${key}`) as BlobRef; requireRead(bundleRef, "missing content address");
      const bundle = await this.pages.value(bundleRef, signal) as Bundle;
      requireRead(bundle.contentKey === key && Array.isArray(bundle.parts) && bundle.parts.length <= SELECTIVE_LIMITS.readPages, "bundle identity/bound");
      // Four bounded shards at a time; finish siblings before returning failure.
      for (let offset = 0; offset < bundle.parts.length; offset += SELECTIVE_LIMITS.concurrency) {
        const group = await Promise.allSettled(bundle.parts.slice(offset, offset + SELECTIVE_LIMITS.concurrency).map(ref => this.pages.value(ref, signal)));
        for (const item of group) {
          if (item.status === "rejected") throw item.reason;
          for (const row of item.value.rows as Row[]) {
            requireRead(++records <= DURABLE_LIMITS.maxGraphRecords * 2, "closure record budget");
            let kind: string = row[0], recordKey = row[1], value: any = row[2];
            if (row[0] === "inline-content") {
              const split = row[2], keys: string[] = [];
              requireRead(split.record.key === recordKey && split.record.inlineContent.length === 0 && split.length <= DURABLE_LIMITS.maxGraphRecords && split.parts.length <= SELECTIVE_LIMITS.readPages, "inline field bound");
              for (let at = 0; at < split.parts.length; at += SELECTIVE_LIMITS.concurrency) {
                const arrays = await Promise.allSettled(split.parts.slice(at, at + SELECTIVE_LIMITS.concurrency).map(ref => this.pages.value(ref, signal)));
                for (const array of arrays) { if (array.status === "rejected") throw array.reason; requireRead(Array.isArray(array.value.keys) && array.value.keys.length <= 512, "inline page bound"); keys.push(...array.value.keys); }
              }
              requireRead(keys.length === split.length, "incomplete inline field"); value = { ...split.record, inlineContent: keys }; kind = "content";
            }
            requireRead(value.key === recordKey && (kind === "content" || kind === "placement"), "record identity");
            const map = kind === "content" ? graph.contents : graph.placements;
            requireRead(!Object.hasOwn(map, recordKey) || equal(map[recordKey], value), "inconsistent shared record");
            (map as Record<string, unknown>)[recordKey] = value;
            if (kind === "placement" && value.target.kind === "local") referenced.add(value.target.contentKey);
          }
        }
      }
      requireRead(graph.contents[key], "missing bundle root");
      // Only structurally referenced non-Cell definitions require another bundle.
      for (const contentKey of referenced) if (!graph.contents[contentKey] && !scheduled.has(contentKey)) { scheduled.add(contentKey); pending.push(contentKey); }
    }
    const root = graph.contents[block.contentKey]; requireRead(root && !isCell(root) && root.payload.id === selection.blockId, "Block identity mismatch");
    const registry: Record<string, unknown> = Object.create(null), dependencies = new Set<string>();
    for (const content of Object.values(graph.contents)) for (const value of [content.payload, ...Array.isArray(content.payload.standoffProperties) ? content.payload.standoffProperties : [], ...Array.isArray(content.payload.blockProperties) ? content.payload.blockProperties : []]) {
      if (value && typeof value === "object" && typeof (value as any).annotationId === "string") dependencies.add((value as any).annotationId);
    }
    for (const id of dependencies) { const entry = await lookup(`A:${id}`); if (entry) registry[id] = entry.value; }
    signal?.throwIfAborted();
    return queryDurableClosure(graph, { ...selection, revisionId }, root, block.occurrences.map(o => o.occurrence), registry, manifest.locationWork);
  }
}
