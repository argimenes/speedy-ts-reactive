/** Offline spike materializer. Full archive verification precedes certification.
 * The private certificate table is deliberately NOT loaded from derived files. */
import { clone } from "../../block-tree/clone";
import type { ContentRecord, Slot } from "../../block-tree/types";
import { DURABLE_LIMITS, decodeDurableWire, replayDurablePath } from "../durable-core";
import type { ReaderIO, ReaderIdentity, ReadPath } from "../durable-reader";
import type { ResourceSnapshot, ResourceTransition, ResourcePlacement } from "../stage-c-gates/resource";
import type { HistoricalOccurrence } from "../types";
import { buildLookup, bytesOf, putValue, requireRead, SELECTIVE_LIMITS, type BlobRef, type BlobWriter } from "./pages";

export interface ArchiveIO extends ReaderIO { revisionId(sequence: number): Promise<string> }
export interface Binding { resourceId: string; memoirId: string; segmentId: string; sequence: number; revisionId: string; pathHash: string }
export interface Certificate { binding: Binding; manifest: BlobRef }
export interface Manifest { format: "selective-history-spike"; version: 1; binding: Binding; lookup: BlobRef; locationWork: number }
export interface BlockEntry { contentKey: string; occurrences: Array<{ occurrence: HistoricalOccurrence; placement: ResourcePlacement }> }
export interface Bundle { contentKey: string; parts: BlobRef[] }
export type Row = ["content", string, ContentRecord] | ["placement", string, ResourcePlacement]
  | ["inline-content", string, { record: ContentRecord; parts: BlobRef[]; length: number }];
export const isCell = (c: { viewType: string }) => ["text-cell", "image-cell"].includes(c.viewType);
export const edges = (c: Pick<ContentRecord, "children" | "inlineContent" | "ownedRelations">): Array<{ key: string; slot: Slot; index?: number }> => [
  ...c.children.map((key, index) => ({ key, slot: { kind: "children" as const }, index })),
  ...c.inlineContent.map((key, index) => ({ key, slot: { kind: "inline-content" as const }, index })),
  ...Object.entries(c.ownedRelations).map(([name, key]) => ({ key, slot: { kind: "relation" as const, name } }))];

export class SelectiveMaterializer {
  private certificates = new Map<number, Certificate>();
  private blobs: BlobWriter;
  constructor(private identity: ReaderIdentity, private archive: ArchiveIO, storage: BlobWriter) {
    const written = new Set<string>(); let bytes = 0;
    this.blobs = { ...storage, put: async (hash, value) => {
      if (written.has(hash)) return;
      requireRead(bytes + value.length <= SELECTIVE_LIMITS.buildBytes, "derived storage budget");
      await storage.put(hash, value); written.add(hash); bytes += value.length;
    } };
  }
  clearCertificates() { this.certificates.clear(); }
  private async evidence(sequence: number, signal?: AbortSignal) {
    requireRead(Number.isSafeInteger(sequence) && sequence >= 0 && sequence <= this.identity.headSequence, "revision outside segment");
    const path = await this.archive.path(sequence, signal), revisionId = await this.archive.revisionId(sequence);
    const { resourceId, memoirId, segmentId } = this.identity;
    return { path, binding: { resourceId, memoirId, segmentId, sequence, revisionId, pathHash: await this.blobs.digest(bytesOf(path)) } };
  }
  /** Served by the trusted archive adapter, never by the untrusted blob store. */
  async certificate(sequence: number, revisionId: string, signal?: AbortSignal): Promise<Certificate | undefined> {
    const { binding } = await this.evidence(sequence, signal); signal?.throwIfAborted();
    requireRead(binding.revisionId === revisionId, "revision identity mismatch");
    const known = this.certificates.get(sequence);
    return known && known.binding.pathHash === binding.pathHash ? clone(known) : undefined;
  }
  async build(sequence: number, signal?: AbortSignal): Promise<{ certificate: Certificate; buildMs: number; records: number }> {
    requireRead(this.certificates.has(sequence) || this.certificates.size < SELECTIVE_LIMITS.revisions, "spike materialized revision bound");
    const started = performance.now(), { path, binding } = await this.evidence(sequence, signal);
    const state = await this.fullState(path, sequence, signal);
    if (path.records.length) requireRead((decodeDurableWire(path.records.at(-1)!) as ResourceTransition).commitId === binding.revisionId, "tail revision identity mismatch");
    const index: [string, unknown][] = [], blocks = new Map<string, BlockEntry>();
    for (const c of Object.values(state.contents)) if (!isCell(c)) blocks.set(c.key, { contentKey: c.key, occurrences: [] });
    let locationWork = 0;
    const locate = (key: string, route: string[], ancestors: Set<string>, parent?: string, slot?: Slot, position?: number) => {
      requireRead(++locationWork <= DURABLE_LIMITS.maxGraphRecords * 2, "location work bound");
      const p = state.placements[key]; if (p.target.kind === "external") return;
      const c = state.contents[p.target.contentKey], next = [...route, p.placementId];
      blocks.get(c.key)?.occurrences.push({ occurrence: { placementKey: key, contentKey: c.key, route: next, ...(parent ? { parentContentKey: parent, slot, index: position } : {}) }, placement: p });
      if (ancestors.has(c.key)) return;
      for (const edge of edges(c)) if (edge.slot.kind !== "inline-content") locate(edge.key, next, new Set(ancestors).add(c.key), c.key, edge.slot, edge.index);
    };
    locate(state.rootPlacementKey, [], new Set());
    for (const [key, block] of blocks) {
      signal?.throwIfAborted();
      const rows: Row[] = [], seen = new Set<string>();
      const add = (c: ContentRecord) => {
        if (seen.has(c.key)) return; seen.add(c.key); rows.push(["content", c.key, c]);
        for (const edge of edges(c)) {
          const p = state.placements[edge.key]; rows.push(["placement", p.key, p]);
          if (p.target.kind === "local" && isCell(state.contents[p.target.contentKey])) add(state.contents[p.target.contentKey]);
        }
      };
      add(state.contents[key]);
      const parts: BlobRef[] = []; let pending: Row[] = [], size = 256;
      for (let row of rows) {
        // Split an oversized ordered inline field at ELEMENT boundaries. Each
        // record remains exact; no arbitrary encoded-byte slices or limit increase.
        if (row[0] === "content" && bytesOf(row).length > SELECTIVE_LIMITS.pageBytes && row[2].inlineContent.length) {
          const content = row[2], arrays: BlobRef[] = [];
          for (let at = 0; at < content.inlineContent.length; at += 512) arrays.push(await putValue(this.blobs, { keys: content.inlineContent.slice(at, at + 512) }));
          row = ["inline-content", row[1], { record: { ...content, inlineContent: [] }, parts: arrays, length: content.inlineContent.length }];
        }
        const cost = bytesOf(row).length;
        if (pending.length && size + cost > SELECTIVE_LIMITS.pageBytes) { parts.push(await putValue(this.blobs, { rows: pending })); pending = []; size = 256; }
        pending.push(row); size += cost;
      }
      if (pending.length) parts.push(await putValue(this.blobs, { rows: pending }));
      index.push([`C:${key}`, await putValue(this.blobs, { contentKey: key, parts } satisfies Bundle)]);
      index.push([`B:${String(state.contents[key].payload.id)}`, await putValue(this.blobs, block)]);
    }
    // Semantic placement lookup and dependency definitions are separately addressable.
    for (const p of Object.values(state.placements)) if (p.kind !== "inline") index.push([`P:${p.placementId}`, p.key]);
    const root = state.placements[state.rootPlacementKey]; requireRead(root.target.kind === "local", "external root");
    if (root.target.kind !== "local") throw Error("unreachable");
    const registry = state.contents[root.target.contentKey].payload.linkedAnnotations;
    if (registry && typeof registry === "object") for (const [key, value] of Object.entries(registry)) index.push([`A:${key}`, { value }]);
    const manifest: Manifest = { format: "selective-history-spike", version: 1, binding, lookup: await buildLookup(this.blobs, index), locationWork };
    const certificate = { binding, manifest: await putValue(this.blobs, manifest) };
    signal?.throwIfAborted();
    const current = await this.evidence(sequence, signal); requireRead(current.binding.pathHash === binding.pathHash && current.binding.revisionId === binding.revisionId, "archive changed during build");
    // Publication is only after complete verification/materialization. Derived files
    // alone, including a self-consistent forged manifest, cannot populate this table.
    this.certificates.set(sequence, certificate);
    return { certificate: clone(certificate), buildMs: performance.now() - started, records: Object.keys(state.contents).length + Object.keys(state.placements).length };
  }
  private async fullState(path: ReadPath, sequence: number, signal?: AbortSignal): Promise<ResourceSnapshot> {
    const d = path.checkpoint;
    requireRead(Number.isSafeInteger(path.checkpointSequence) && path.checkpointSequence >= 0 && path.checkpointSequence <= sequence && Array.isArray(path.records) && path.records.length === sequence - path.checkpointSequence && path.records.length <= DURABLE_LIMITS.maxReadPath, "invalid archive path");
    requireRead(d && /^[a-f0-9]{64}$/.test(d.hash) && Number.isSafeInteger(d.byteLength) && d.byteLength > 0 && d.byteLength <= DURABLE_LIMITS.supportedStateBytes && Array.isArray(d.chunks) && d.chunks.length <= Math.ceil(DURABLE_LIMITS.supportedStateBytes / DURABLE_LIMITS.chunkBytes) && d.chunks.length > 0, "checkpoint bound");
    const bytes = new Uint8Array(d.byteLength); let offset = 0;
    for (const chunk of d.chunks) {
      signal?.throwIfAborted(); requireRead(/^[a-f0-9]{64}$/.test(chunk.hash) && Number.isSafeInteger(chunk.byteLength) && chunk.byteLength > 0 && chunk.byteLength <= DURABLE_LIMITS.chunkBytes && offset + chunk.byteLength <= bytes.length, "chunk bound");
      const data = await this.archive.chunk(chunk.hash, signal);
      const part = typeof data === "string" ? Uint8Array.from(atob(data), c => c.charCodeAt(0)) : data;
      requireRead(part.length === chunk.byteLength && await this.blobs.digest(part) === chunk.hash, "checkpoint chunk hash"); bytes.set(part, offset); offset += part.length;
    }
    requireRead(offset === bytes.length && await this.blobs.digest(bytes) === d.hash, "checkpoint hash");
    const base = decodeDurableWire(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as ResourceSnapshot;
    requireRead(base.resourceId === this.identity.resourceId && base.revision === path.checkpointSequence, "checkpoint identity");
    const records = path.records.map(wire => {
      requireRead(typeof wire === "string" && new TextEncoder().encode(wire).length <= DURABLE_LIMITS.recordBytes, "record bound");
      const event = decodeDurableWire(wire) as ResourceTransition;
      requireRead(Number.isSafeInteger(event.sourceCounters.before) && event.sourceCounters.before >= 0 && event.sourceCounters.after === event.sourceCounters.before + 1, "source counter mismatch");
      return event;
    });
    const state = replayDurablePath(base, records) as ResourceSnapshot;
    requireRead(state.revision === sequence, "revision mismatch"); signal?.throwIfAborted(); return state;
  }
}
