import { clone } from "../block-tree/clone";
import { freeze, type DeepReadonly } from "../block-tree/commit-capture";
import type { HistoryChanges } from "../block-tree/compact-changes";
import { encodeExtendedRepository, decodeExtendedRepository, type ExtendedRepositoryDto } from "../block-tree/extended-codec";
import { BlockIdentityIndex } from "../block-tree/identity";
import { createCommitId } from "../block-tree/ids";
import { CanonicalRepository, validateRepository } from "../block-tree/repository";
import type { RepositoryState } from "../block-tree/types";
import { applyHistoryChanges, HistoryError, type ReplayTiming } from "./replay";
import { affectedBlockIds } from "./index";

export interface Revision {
  segmentId: string; revisionId: string; sequence: number; producerId: string;
  stateParentRevisionId: string; previousJournalRevisionId: string;
  event: DeepReadonly<HistoryChanges>;
}
export interface Checkpoint { version: 1; segmentId: string; revisionId: string; graph: ExtendedRepositoryDto }
export interface HistorySource {
  readonly segmentId: string; readonly baselineRevisionId: string;
  getStateAt(segmentId: string, revisionId: string): Promise<DeepReadonly<RepositoryState>>;
  getRevision(revisionId: string): Promise<DeepReadonly<Revision> | undefined>;
  ancestry(headRevisionId: string): Promise<readonly string[]>;
  candidateRevisions?(blockId: string): Promise<readonly string[] | undefined>;
}
export interface StoreOptions {
  maxEvents?: number; maxEventBytes?: number; maxCheckpointBytes?: number;
  maxPending?: number; maxCacheBytes?: number; maxProducers?: number;
  maxIndexBytes?: number;
  checkpointEvery?: number; checkpointBytes?: number;
  schedule?: (drain: () => void) => (() => void);
}
export interface HistoryProducer { readonly producerId: string; readonly repository: CanonicalRepository; readonly headRevisionId: string; readonly verifiedHeadRevisionId: string }
interface ProducerState {
  handle: HistoryProducer; queuedHead: string; verifiedHead: string;
  mirror?: RepositoryState; sinceCheckpoint: number; sinceCheckpointBytes: number;
  stop: () => void; replayBlocked?: boolean; gap?: { revisionId: string; message: string };
}
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;

function validateDocument(state: RepositoryState, expectedDocumentId?: unknown, graphAlreadyValidated = false): void {
  if (!graphAlreadyValidated) { validateRepository(state); new BlockIdentityIndex(state); }
  const root = state.placements[state.rootPlacementKey].contentKey;
  if (state.contents[root].viewType !== "document-block" || expectedDocumentId !== undefined && state.contents[root].payload.id !== expectedDocumentId || Object.values(state.contents).some(c =>
    c.viewType === "workspace-block" || c.viewType === "document-block" && c.key !== root)) {
    throw new HistoryError("unsupported", "Stage B enrolls one Document, not Workspace or mixed-resource graphs");
  }
}

/** Finite session proof. Owns enrolled producers, never attaches to a live Workspace. */
export class MemoryHistoryStore implements HistorySource {
  readonly segmentId = createCommitId();
  readonly baselineRevisionId = createCommitId();
  readonly producer: HistoryProducer;
  private readonly options: Required<StoreOptions>;
  private readonly revisions = new Map<string, DeepReadonly<Revision>>();
  private readonly checkpoints = new Map<string, DeepReadonly<Checkpoint>>();
  private readonly producers = new Map<string, ProducerState>();
  private readonly cache = new Map<string, { state: DeepReadonly<RepositoryState>; bytes: number }>();
  private readonly timelineIndex = new Map<string, Set<string>>();
  private indexBytes = 0; private indexDisabled = false;
  private pending: Array<{ producerId: string; parent: string; event: DeepReadonly<HistoryChanges> }> = [];
  private cancel?: () => void;
  private disposed = false;
  private latestAppend: string;
  private sequence = 0;
  private eventBytes = 0; private checkpointBytes = 0; private cacheBytes = 0;
  private queueHighWater = 0;
  private timing: ReplayTiming = { applyMs: 0, validationMs: 0 };
  private readonly documentId: unknown;

  constructor(baseline: RepositoryState, options: StoreOptions = {}) {
    this.options = {
      maxEvents: 10000, maxEventBytes: 64 * 1024 * 1024, maxCheckpointBytes: 64 * 1024 * 1024,
      maxPending: 1024, maxCacheBytes: 32 * 1024 * 1024, maxProducers: 8, maxIndexBytes: 8 * 1024 * 1024,
      checkpointEvery: 500, checkpointBytes: 8 * 1024 * 1024,
      schedule: drain => { const id = setTimeout(drain, 0); return () => clearTimeout(id); }, ...options,
    };
    for (const [key, value] of Object.entries(this.options)) if (key !== "schedule" && (!Number.isSafeInteger(value) || Number(value) <= 0)) throw new HistoryError("invalid", `Invalid capacity ${key}`);
    validateDocument(baseline);
    this.documentId = baseline.contents[baseline.placements[baseline.rootPlacementKey].contentKey].payload.id;
    this.latestAppend = this.baselineRevisionId;
    this.addCheckpoint(this.baselineRevisionId, baseline);
    this.producer = this.enroll(baseline, this.baselineRevisionId);
  }

  private assertActive(): void { if (this.disposed) throw new HistoryError("disposed", "History store disposed"); }
  private enroll(state: RepositoryState, parent: string): HistoryProducer {
    this.assertActive();
    if (this.producers.size >= this.options.maxProducers) throw new HistoryError("incomplete", "Producer capacity exhausted");
    const repository = new CanonicalRepository(state, { enforceBlockIdentity: true });
    const producerId = createCommitId();
    const producer: ProducerState = { handle: undefined!, queuedHead: parent, verifiedHead: parent, mirror: clone(state), sinceCheckpoint: 0, sinceCheckpointBytes: 0, stop: () => {} };
    const handle = Object.freeze({ producerId, repository, get headRevisionId() { return producer.queuedHead; }, get verifiedHeadRevisionId() { return producer.verifiedHead; } });
    producer.handle = handle;
    producer.stop = repository.subscribeHistoryChanges(event => {
      if (this.disposed || producer.gap) return;
      const previous = producer.queuedHead;
      producer.queuedHead = event.commitId;
      if (this.pending.length >= this.options.maxPending) { this.markGap(producer, event.commitId, "Pending capture capacity exhausted"); return; }
      this.pending.push({ producerId, parent: previous, event });
      this.queueHighWater = Math.max(this.queueHighWater, this.pending.length);
      if (!this.cancel) this.cancel = this.options.schedule(() => { this.cancel = undefined; this.drain(); });
    }, (error, revisionId) => { producer.queuedHead = revisionId; this.markGap(producer, revisionId, String(error)); });
    this.producers.set(producerId, producer);
    return handle;
  }

  private markGap(producer: ProducerState, revisionId: string, message: string): void {
    producer.gap ??= { revisionId, message };
  }
  private addCheckpoint(revisionId: string, state: RepositoryState): void {
    const checkpoint: Checkpoint = { version: 1, segmentId: this.segmentId, revisionId, graph: encodeExtendedRepository(state) };
    const size = bytes(checkpoint);
    if (this.checkpointBytes + size > this.options.maxCheckpointBytes) throw new HistoryError("incomplete", "Checkpoint capacity exhausted");
    this.checkpoints.set(revisionId, freeze(checkpoint)); this.checkpointBytes += size;
  }

  private drain(): void {
    if (this.disposed) return;
    const pending = this.pending; this.pending = [];
    for (const item of pending) {
      const producer = this.producers.get(item.producerId)!;
      // A capture/queue gap can follow earlier valid queued events. Drain those
      // ancestors, but never accept a descendant of a failed replay.
      if (producer.replayBlocked) continue;
      try {
        if (producer.verifiedHead !== item.parent || item.parent !== this.baselineRevisionId && !this.revisions.has(item.parent)) throw new HistoryError("incomplete", "Missing/mismatched state parent");
        if (this.revisions.has(item.event.commitId) || item.event.commitId === this.baselineRevisionId) throw new HistoryError("invalid", "Duplicate revision ID");
        const revision: Revision = { segmentId: this.segmentId, revisionId: item.event.commitId, sequence: this.sequence + 1, producerId: item.producerId,
          stateParentRevisionId: item.parent, previousJournalRevisionId: this.latestAppend, event: item.event };
        const size = bytes(revision);
        if (this.revisions.size >= this.options.maxEvents || this.eventBytes + size > this.options.maxEventBytes) throw new HistoryError("incomplete", "Retained capture capacity exhausted");
        const next = applyHistoryChanges(producer.mirror!, item.event, this.timing);
        validateDocument(next, this.documentId, true);
        let affected: Set<string> | undefined;
        if (!this.indexDisabled) {
          try { affected = affectedBlockIds(producer.mirror!, next, item.event); }
          catch { this.timelineIndex.clear(); this.indexBytes = 0; this.indexDisabled = true; }
        }
        const checkpoint = producer.sinceCheckpoint + 1 >= this.options.checkpointEvery || producer.sinceCheckpointBytes + size >= this.options.checkpointBytes;
        if (checkpoint) this.addCheckpoint(revision.revisionId, next);
        this.revisions.set(revision.revisionId, freeze(revision));
        this.sequence++; this.latestAppend = revision.revisionId; this.eventBytes += size;
        if (affected) this.indexRevision(revision.revisionId, affected);
        producer.mirror = next; producer.verifiedHead = revision.revisionId;
        producer.sinceCheckpoint = checkpoint ? 0 : producer.sinceCheckpoint + 1;
        producer.sinceCheckpointBytes = checkpoint ? 0 : producer.sinceCheckpointBytes + size;
      } catch (error) { producer.replayBlocked = true; producer.gap = { revisionId: item.event.commitId, message: String(error) }; }
    }
  }

  async flush(): Promise<void> {
    this.assertActive(); this.cancel?.(); this.cancel = undefined; this.drain();
  }
  private indexRevision(revisionId: string, blocks: Set<string>): void {
    const size = bytes([revisionId, [...blocks]]);
    if (this.indexBytes + size > this.options.maxIndexBytes) {
      this.timelineIndex.clear(); this.indexBytes = 0; this.indexDisabled = true; return;
    }
    for (const block of blocks) {
      const revisions = this.timelineIndex.get(block) ?? new Set<string>();
      revisions.add(revisionId); this.timelineIndex.set(block, revisions);
    }
    this.indexBytes += size;
  }
  async candidateRevisions(blockId: string): Promise<readonly string[] | undefined> {
    await this.flush(); return this.indexDisabled ? undefined : Object.freeze([...(this.timelineIndex.get(blockId) ?? [])]);
  }
  async rebuildTimelineIndex(): Promise<void> {
    await this.flush(); this.timelineIndex.clear(); this.indexBytes = 0; this.indexDisabled = false;
    for (const revision of this.revisions.values()) {
      const before = await this.getStateAt(this.segmentId, revision.stateParentRevisionId);
      const after = await this.getStateAt(this.segmentId, revision.revisionId);
      this.indexRevision(revision.revisionId, affectedBlockIds(before as RepositoryState, after as RepositoryState, revision.event));
      if (this.indexDisabled) break;
    }
  }
  async forkFrom(revisionId: string): Promise<HistoryProducer> {
    const state = await this.getStateAt(this.segmentId, revisionId);
    return this.enroll(clone(state) as RepositoryState, revisionId);
  }
  async getRevision(revisionId: string): Promise<DeepReadonly<Revision> | undefined> {
    await this.flush(); if (revisionId === this.baselineRevisionId) return;
    const revision = this.revisions.get(revisionId);
    if (!revision) throw new HistoryError("incomplete", `Revision unavailable: ${revisionId}`);
    return revision;
  }
  async ancestry(headRevisionId: string): Promise<readonly string[]> {
    await this.flush();
    const reverse: string[] = [], seen = new Set<string>(); let id = headRevisionId;
    while (id !== this.baselineRevisionId) {
      if (seen.has(id)) throw new HistoryError("invalid", "Cyclic revision ancestry"); seen.add(id);
      const revision = this.revisions.get(id);
      if (!revision) throw new HistoryError("incomplete", `Missing revision ancestry: ${id}`);
      reverse.push(id); id = revision.stateParentRevisionId;
    }
    return Object.freeze([this.baselineRevisionId, ...reverse.reverse()]);
  }
  async getStateAt(segmentId: string, revisionId: string): Promise<DeepReadonly<RepositoryState>> {
    await this.flush();
    if (segmentId !== this.segmentId) throw new HistoryError("incomplete", "Unknown history segment");
    const cached = this.cache.get(revisionId);
    if (cached) { this.cache.delete(revisionId); this.cache.set(revisionId, cached); return cached.state; }
    const ancestry = await this.ancestry(revisionId);
    let position = ancestry.length - 1;
    while (!this.checkpoints.has(ancestry[position])) position--;
    const checkpoint = this.checkpoints.get(ancestry[position])!;
    if (checkpoint.version !== 1 || checkpoint.segmentId !== segmentId || checkpoint.revisionId !== ancestry[position]) throw new HistoryError("unsupported", "Checkpoint envelope mismatch");
    let state = decodeExtendedRepository(clone(checkpoint.graph) as ExtendedRepositoryDto);
    for (const id of ancestry.slice(position + 1)) state = applyHistoryChanges(state, this.revisions.get(id)!.event, this.timing);
    validateDocument(state, this.documentId);
    const result = freeze(state), size = bytes(result);
    if (size <= this.options.maxCacheBytes) {
      while (this.cacheBytes + size > this.options.maxCacheBytes) {
        const key = this.cache.keys().next().value!; this.cacheBytes -= this.cache.get(key)!.bytes; this.cache.delete(key);
      }
      this.cache.set(revisionId, { state: result, bytes: size }); this.cacheBytes += size;
    }
    return result;
  }
  diagnostics() {
    this.assertActive();
    return freeze({ events: this.revisions.size, eventBytes: this.eventBytes, checkpoints: this.checkpoints.size, checkpointBytes: this.checkpointBytes,
      cacheBytes: this.cacheBytes, indexBytes: this.indexBytes, indexDisabled: this.indexDisabled, mirrorBytes: [...this.producers.values()].reduce((sum, p) => sum + bytes(p.mirror), 0), queueLength: this.pending.length, queueHighWater: this.queueHighWater, ...this.timing,
      producers: [...this.producers.values()].map(p => ({ producerId: p.handle.producerId, head: p.queuedHead, verifiedHead: p.verifiedHead, gap: p.gap })) });
  }
  dispose(): void {
    if (this.disposed) return; this.disposed = true;
    this.cancel?.(); this.cancel = undefined;
    for (const producer of this.producers.values()) { producer.stop(); producer.mirror = undefined; }
    this.producers.clear(); this.pending = []; this.revisions.clear(); this.checkpoints.clear(); this.cache.clear(); this.timelineIndex.clear(); this.indexBytes = 0;
    this.eventBytes = this.checkpointBytes = this.cacheBytes = 0;
  }
}
