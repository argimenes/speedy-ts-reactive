/** Read-only acceleration. The native path/descriptor remains authority on every
 * request. One verified checkpoint and one fixed-head subtree per open session;
 * no cache survives a session, changes branch identity or retains a live state. */
import { clone } from "../block-tree/clone";
import { freeze, type DeepReadonly } from "../block-tree/commit-capture";
import { DURABLE_LIMITS, applyDurableTransitionSized, decodeDurableWire, queryDurableSubtree, compareDurableSubtrees } from "./durable-core";
import { validateResource, type ResourceSnapshot, type ResourceTransition } from "./stage-c-gates/resource";
import type { HistorySelection, HistorySelectionResult } from "./ui-session-source";
import type { SubtreeResult } from "./types";
import { readTiming } from "./read-timing";

export interface ReadCheckpoint { hash: string; byteLength: number; chunks: { hash: string; byteLength: number }[] }
export interface ReadPath { checkpoint: ReadCheckpoint; checkpointSequence: number; records: string[] }
export interface ReaderIdentity { resourceId: string; memoirId: string; segmentId: string; headSequence: number; headRevisionId: string }
export interface ReaderIO {
  path(sequence: number, signal?: AbortSignal): Promise<ReadPath>;
  chunk(hash: string, signal?: AbortSignal): Promise<Uint8Array | string>;
  digest(bytes: Uint8Array): Promise<string>;
}
const check = (value: unknown, message: string): void => { if (!value) throw new Error(`Document history: ${message}`); };
const yieldRead = async (signal?: AbortSignal) => { signal?.throwIfAborted(); await new Promise(resolve => setTimeout(resolve, 0)); signal?.throwIfAborted(); };
export class DurableHistoryReader {
  private checkpoint?: { key: string; state: DeepReadonly<ResourceSnapshot>; bytes: number };
  private head?: { result: DeepReadonly<SubtreeResult>; proof: string };
  private lastProof = "";
  constructor(private identity: ReaderIdentity, private selection: HistorySelection, private io: ReaderIO) {}
  clear(): void { this.checkpoint = undefined; this.head = undefined; this.lastProof = ""; }
  cacheUsage() { return { checkpointEntries: this.checkpoint ? 1 : 0, checkpointBytes: this.checkpoint?.bytes ?? 0, headEntries: this.head ? 1 : 0 }; }
  private async reconstruct(sequence: number, profile: ReturnType<typeof readTiming>, signal?: AbortSignal): Promise<DeepReadonly<ResourceSnapshot>> {
    check(Number.isSafeInteger(sequence) && sequence >= 0 && sequence <= this.identity.headSequence, "Revision outside fixed history head");
    signal?.throwIfAborted();
    // Never use a cached entry to answer a failed/changed authoritative path read.
    const path = await profile.asyncMeasure("pathFetch", () => this.io.path(sequence, signal));
    const descriptor = path.checkpoint;
    this.lastProof = JSON.stringify(path);
    check(Number.isSafeInteger(path.checkpointSequence) && path.checkpointSequence >= 0 && path.checkpointSequence <= sequence &&
      Array.isArray(path.records) && path.records.length <= DURABLE_LIMITS.maxReadPath && sequence - path.checkpointSequence === path.records.length, "Invalid bounded replay path");
    check(descriptor && /^[a-f0-9]{64}$/.test(descriptor.hash) && Number.isSafeInteger(descriptor.byteLength) && descriptor.byteLength > 0 && descriptor.byteLength <= DURABLE_LIMITS.supportedStateBytes &&
      Array.isArray(descriptor.chunks) && descriptor.chunks.length > 0 && descriptor.chunks.length <= Math.ceil(DURABLE_LIMITS.supportedStateBytes / DURABLE_LIMITS.chunkBytes), "Invalid checkpoint descriptor");
    let size = 0;
    const offsets = descriptor.chunks.map(chunk => { const offset = size; check(/^[a-f0-9]{64}$/.test(chunk.hash) && Number.isSafeInteger(chunk.byteLength) && chunk.byteLength > 0 && chunk.byteLength <= DURABLE_LIMITS.chunkBytes, "Invalid checkpoint chunk"); size += chunk.byteLength; return offset; });
    check(size === descriptor.byteLength, "Invalid checkpoint total length");
    const key = JSON.stringify([this.identity.resourceId, this.identity.memoirId, this.identity.segmentId, path.checkpointSequence, descriptor]);
    if (this.checkpoint?.key === key) profile.timing.checkpointHits++;
    else {
      // Evict before allocation. At most four <=1MiB transfers plus one <=20MiB
      // assembly; cache accounting is canonical wire bytes AND <=100k records.
      this.checkpoint = undefined;
      const bytes = new Uint8Array(descriptor.byteLength), cancel = new AbortController();
      const transferSignal = signal ? AbortSignal.any([signal, cancel.signal]) : cancel.signal;
      let cursor = 0;
      await profile.asyncMeasure("checkpointLoad", async () => {
        const jobs = Array.from({ length: Math.min(4, descriptor.chunks.length) }, async () => {
          while (cursor < descriptor.chunks.length) {
            transferSignal.throwIfAborted(); const at = cursor++, chunk = descriptor.chunks[at];
            const transferred = await profile.asyncMeasure("checkpointFetch", () => this.io.chunk(chunk.hash, transferSignal));
            const part = typeof transferred === "string" ? profile.measure("decode", () => {
              const binary = atob(transferred), decoded = new Uint8Array(binary.length);
              for (let i = 0; i < binary.length; i++) decoded[i] = binary.charCodeAt(i);
              return decoded;
            }) : transferred;
            profile.timing.chunks++; profile.timing.fetchedBytes += part.length;
            check(part.length === chunk.byteLength && await profile.asyncMeasure("verification", () => this.io.digest(part)) === chunk.hash, "Checkpoint chunk hash mismatch");
            transferSignal.throwIfAborted(); bytes.set(part, offsets[at]);
          }
        }).map(job => job.catch(error => { cancel.abort(); throw error; }));
        const results = await Promise.allSettled(jobs);
        const failed = results.find(result => result.status === "rejected"); if (failed?.status === "rejected") throw failed.reason;
      });
      check(await profile.asyncMeasure("verification", () => this.io.digest(bytes)) === descriptor.hash, "Checkpoint identity mismatch");
      signal?.throwIfAborted();
      const baseline = decodeDurableWire(profile.measure("decode", () => new TextDecoder("utf-8", { fatal: true }).decode(bytes)), profile.measure) as ResourceSnapshot;
      profile.measure("verification", () => {
        validateResource(baseline);
        check(Object.keys(baseline.contents).length + Object.keys(baseline.placements).length <= DURABLE_LIMITS.maxGraphRecords, "Checkpoint graph bound exceeded");
        check(baseline.resourceId === this.identity.resourceId && baseline.revision === path.checkpointSequence, "Checkpoint resource/counter mismatch");
      });
      // decodeDurableWire already enforces exact canonical re-encoding. Its
      // checked input byteLength is the state size; serializing again proves no
      // additional invariant. Cache only after every check and cancellation yield.
      await yieldRead(signal);
      this.checkpoint = { key, state: profile.measure("freezing", () => freeze(baseline)), bytes: descriptor.byteLength };
    }
    signal?.throwIfAborted();
    if (!path.records.length) return this.checkpoint!.state;
    // One private draft, discarded on ANY failure; never mutate cached authority.
    const working = profile.measure("cloning", () => clone(this.checkpoint!.state)) as ResourceSnapshot;
    let byteLength = this.checkpoint!.bytes;
    for (const wire of path.records) {
      await yieldRead(signal);
      check(typeof wire === "string" && new TextEncoder().encode(wire).length <= DURABLE_LIMITS.recordBytes, "Replay record exceeds supported bound");
      const event = decodeDurableWire(wire, profile.measure) as ResourceTransition;
      byteLength = applyDurableTransitionSized(working, event, byteLength, profile.measure);
      profile.timing.replayRecords++;
    }
    check(working.revision === sequence, "Replay target mismatch");
    await yieldRead(signal);
    return working; // private; query copies/finalizes immutable subtree results
  }
  async select(sequence: number, revisionId: string, signal?: AbortSignal): Promise<HistorySelectionResult> {
    const profile = readTiming(), start = performance.now();
    const subtree = async (at: number, id: string, name: string) => {
      const state = await profile.asyncMeasure(name, () => this.reconstruct(at, profile, signal));
      return profile.measure("subtree", () => queryDurableSubtree(state, { ...this.selection, revisionId: id }));
    };
    const selected = await subtree(sequence, revisionId, "selectedReconstruction");
    if (sequence !== this.identity.headSequence && this.head) {
      const path = await profile.asyncMeasure("headAuthorityFetch", () => this.io.path(this.identity.headSequence, signal));
      if (JSON.stringify(path) !== this.head.proof) { this.head = undefined; this.checkpoint = undefined; }
    }
    let head: DeepReadonly<SubtreeResult>;
    if (sequence === this.identity.headSequence) head = selected;
    else if (this.head) { head = this.head.result; profile.timing.headHits++; }
    else head = await subtree(this.identity.headSequence, this.identity.headRevisionId, "headReconstruction");
    await yieldRead(signal);
    if ((sequence === this.identity.headSequence || !this.head) && (head.status === "available" || head.status === "unplaced")) this.head = { result: head, proof: this.lastProof };
    const comparison = profile.measure("comparison", () => compareDurableSubtrees(selected, head));
    profile.timing.workerMs = performance.now() - start;
    return { selected, comparison, timing: profile.timing };
  }
}
