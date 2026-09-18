/** Temporary, finite, session-only bridge from the live editor to the existing
 * read-only query contracts. This is NOT a durable resource reader: the bounded
 * source log may contain Workspace commits, but queries expose one closed
 * Document. It never creates an editable producer or snapshots in a callback. */
import { clone } from "../block-tree/clone";
import { equal, freeze, type DeepReadonly } from "../block-tree/commit-capture";
import type { HistoryChanges } from "../block-tree/compact-changes";
import { createCommitId } from "../block-tree/ids";
import type { CanonicalRepository } from "../block-tree/repository";
import type { RepositoryState } from "../block-tree/types";
import { HistoryError, applyHistoryChanges } from "./replay";
import type { HistorySource, Revision } from "./memory-store";
import { HistoryQueries } from "./query";
import type { SubtreeComparison, SubtreeRequest, SubtreeResult, TimelineEntry } from "./types";

export interface HistorySelection { blockId: string; placementId?: string; route?: readonly string[] }
export interface SessionTimelineEntry extends Omit<TimelineEntry, "kinds"> {
  readonly kinds: readonly TimelineEntry["kinds"][number][];
  cause: string; location?: string; baseline?: boolean;
}
export interface HistorySelectionResult {
  selected: DeepReadonly<SubtreeResult>;
  comparison: DeepReadonly<SubtreeComparison>;
}
export interface ReadonlyHistorySession {
  readonly storage: "session-only" | "persistent";
  readonly segmentId?: string;
  readonly headRevisionId: string;
  readonly status: "available" | "incomplete";
  readonly message: string;
  timeline(options?: { cursor?: string; limit?: number; signal?: AbortSignal }): Promise<{
    entries: readonly DeepReadonly<SessionTimelineEntry>[]; nextCursor?: string; headRevisionId: string;
  }>;
  select(revisionId: string, options?: { signal?: AbortSignal }): Promise<HistorySelectionResult>;
}
export interface SessionHistoryRecorder {
  open(selection: HistorySelection, signal?: AbortSignal): Promise<ReadonlyHistorySession>;
  dispose(): void;
}
export interface SessionHistoryOptions {
  maxEvents?: number; maxRecordBytes?: number; maxEventBytes?: number;
  maxStateBytes?: number; maxGraphRecords?: number; timelineScanLimit?: number;
}
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
const slots = (content: DeepReadonly<RepositoryState["contents"][string]>) =>
  [...content.children, ...content.inlineContent, ...Object.values(content.ownedRelations)];
const identity = (placement: DeepReadonly<RepositoryState["placements"][string]>) => placement.placementId ?? `session:${placement.key}`;
function aborted(signal?: AbortSignal): void { if (signal?.aborted) throw new DOMException("History request cancelled", "AbortError"); }
async function yieldTask(signal?: AbortSignal): Promise<void> {
  aborted(signal); await new Promise<void>(resolve => setTimeout(resolve, 0)); aborted(signal);
}

/** Legacy closed-tree admission is deliberately narrow. Explicit foreign edges,
 * cross-owner definitions and nested resources are reported, never resolved. */
function documentProjection(state: DeepReadonly<RepositoryState>, rootKey: string, documentId: string): DeepReadonly<RepositoryState> {
  const root = state.placements[rootKey], document = root && state.contents[root.contentKey];
  if (!root || !document || document.viewType !== "document-block" || document.payload.id !== documentId) {
    throw new HistoryError("unsupported", "The enrolled Document was closed or replaced. Start a new session in the reopened Document.");
  }
  const result: RepositoryState = { rootPlacementKey: rootKey, revision: state.revision, contents: Object.create(null), placements: Object.create(null) };
  const visitContent = (key: string) => {
    if (result.contents[key]) return;
    const content = state.contents[key];
    if (!content || content.viewType === "workspace-block" || content.viewType === "document-block" && key !== document.key ||
      content.definitionOwnerKey !== undefined && content.definitionOwnerKey !== document.key) {
      throw new HistoryError("unsupported", "Session history supports one closed Document; nested or foreign definitions need the persistent resource reader.");
    }
    result.contents[key] = content as RepositoryState["contents"][string];
    for (const key of slots(content)) visitPlacement(key);
  };
  const visitPlacement = (key: string) => {
    const placement = state.placements[key];
    if (!placement || placement.kind === "reference" || placement.externalReference) {
      throw new HistoryError("unsupported", "Session history does not resolve reference placements or external resources.");
    }
    if (result.placements[key]) throw new HistoryError("unsupported", "Session history requires an unambiguous closed Document tree.");
    result.placements[key] = placement as RepositoryState["placements"][string];
    visitContent(placement.contentKey);
  };
  visitPlacement(rootKey);
  // Portable definition ownership, when present, also proves unplaced members.
  for (const content of Object.values(state.contents)) if (content.definitionOwnerKey === document.key) visitContent(content.key);
  return freeze(result);
}

export function createSessionHistorySource(repository: CanonicalRepository, documentPlacementKey: string,
  supplied: SessionHistoryOptions = {}): SessionHistoryRecorder {
  const limits = { maxEvents: 500, maxRecordBytes: 128 * 1024, maxEventBytes: 8 * 1024 * 1024,
    maxStateBytes: 8 * 1024 * 1024, maxGraphRecords: 60_000, timelineScanLimit: 40, ...supplied };
  for (const [key, value] of Object.entries(limits)) if (!Number.isSafeInteger(value) || value < 1) throw new HistoryError("invalid", `Invalid session limit: ${key}`);
  const checkSize = (state: DeepReadonly<RepositoryState>) => {
    if (Object.keys(state.contents).length + Object.keys(state.placements).length > limits.maxGraphRecords || bytes(state) > limits.maxStateBytes) {
      throw new HistoryError("unsupported", "This repository exceeds the finite session-history baseline/state budget.");
    }
  };
  const live = repository.readState();
  // Refuse large enrollment before cloning the baseline. No callback reads live state.
  checkSize(live);
  const document = live.contents[live.placements[documentPlacementKey]?.contentKey];
  if (!document || document.viewType !== "document-block" || typeof document.payload.id !== "string") {
    throw new HistoryError("unsupported", "Select a Block inside one identified Document to start history.");
  }
  const documentId = document.payload.id;
  const baseline = freeze(repository.snapshot()), baselineRevisionId = createCommitId(), segmentId = createCommitId();
  documentProjection(baseline, documentPlacementKey, documentId);
  const startedAt = new Date().toISOString();
  const events: DeepReadonly<HistoryChanges>[] = [];
  const indices = new Map([[baselineRevisionId, 0]]);
  let eventBytes = 0, disposed = false, gap: string | undefined;
  const stop = repository.subscribeHistoryChanges(event => {
    if (disposed || gap) return;
    try {
      const expected = events.at(-1)?.afterRevision ?? baseline.revision;
      if (event.beforeRevision !== expected || event.afterRevision !== expected + 1 || indices.has(event.commitId)) throw new Error("Noncontiguous source capture");
      if (events.length >= limits.maxEvents) throw new Error(`The ${limits.maxEvents}-commit session limit was reached`);
      const size = bytes(event);
      if (size > limits.maxRecordBytes || eventBytes + size > limits.maxEventBytes) throw new Error("The session history byte budget was reached");
      events.push(event); indices.set(event.commitId, events.length); eventBytes += size;
    } catch (error) { gap = `${String(error)}. Capture stopped; earlier retained revisions remain available. No history was pruned.`; }
  }, error => { gap = `Capture failed: ${String(error)}. Earlier retained revisions remain available.`; });
  const assertActive = () => { if (disposed) throw new HistoryError("disposed", "Session history disposed"); };

  // One replay cursor, not a full-state cache per revision. All graph replay and
  // projection happens in asynchronous reader work, never the commit callback.
  let cachedIndex = 0, cachedState: DeepReadonly<RepositoryState> = baseline;
  const stateAt = async (index: number, signal?: AbortSignal) => {
    assertActive(); aborted(signal);
    let at = cachedIndex <= index ? cachedIndex : 0, state = at ? cachedState : baseline;
    while (at < index) {
      if ((at % 4) === 0) await yieldTask(signal);
      assertActive(); aborted(signal);
      state = freeze(applyHistoryChanges(state, events[at++])); checkSize(state);
    }
    cachedIndex = index; cachedState = state;
    return documentProjection(state, documentPlacementKey, documentId);
  };

  return Object.freeze({
    async open(selection: HistorySelection, signal?: AbortSignal): Promise<ReadonlyHistorySession> {
      assertActive(); aborted(signal);
      // Head is fixed before any reader yields. Later live edits enter the log,
      // but can only appear in a newly opened panel/session.
      const headIndex = events.length, ids = [baselineRevisionId, ...events.slice(0, headIndex).map(event => event.commitId)];
      const headRevisionId = ids[headIndex];
      const selected = freeze(clone(selection));
      await yieldTask(signal);
      const head = await stateAt(headIndex, signal);
      const findKey = (id: string) => Object.values(head.placements).find(p => identity(p) === id)?.key;
      const placementKey = selected.placementId ? findKey(selected.placementId) : undefined;
      const route = selected.route?.map(findKey);
      if (selected.placementId && !placementKey || route?.some(key => !key)) throw new HistoryError("unsupported", "The selected occurrence is not in this enrolled Document.");

      const request = (revisionId: string): SubtreeRequest => ({ segmentId, revisionId, branchHeadRevisionId: headRevisionId,
        blockId: selected.blockId, ...(placementKey ? { placementKey } : {}), ...(route ? { route: route as string[] } : {}),
        references: false, ownedRelations: true });
      const queriesFor = (signal?: AbortSignal) => {
        let reads = 0, replayWork = 0;
        const ensure = (id: string) => {
          assertActive(); aborted(signal);
          const index = indices.get(id);
          if (index === undefined || index > headIndex) throw new HistoryError("incomplete", "Revision is outside this fixed session head");
          if (++reads > 2048) throw new HistoryError("incomplete", "Finite history read budget exhausted");
          return index;
        };
        const source: HistorySource = {
          segmentId, baselineRevisionId,
          async getStateAt(segment, id) {
            if (segment !== segmentId) throw new HistoryError("incomplete", "Unknown session segment");
            const index = ensure(id); replayWork += cachedIndex <= index ? index - cachedIndex : index;
            if (replayWork > 2500) throw new HistoryError("incomplete", "Finite replay budget exhausted; select a nearer retained revision");
            return stateAt(index, signal);
          },
          async getRevision(id) {
            const index = ensure(id); if (!index) return;
            return freeze({ segmentId, revisionId: id, sequence: index, producerId: "live-session",
              stateParentRevisionId: ids[index - 1], previousJournalRevisionId: ids[index - 1], event: events[index - 1] } as Revision);
          },
          async ancestry(id) { return Object.freeze(ids.slice(0, ensure(id) + 1)); },
        };
        return new HistoryQueries(source);
      };
      return Object.freeze({
        storage: "session-only" as const, headRevisionId,
        get status() { return gap ? "incomplete" as const : "available" as const; },
        get message() { return `Session-only history starts when History is first opened. Earlier edits and history after a reload are unavailable. Temporary occurrence identities apply only to this session. ${gap ?? `Finite limit: ${limits.maxEvents} source commits; no pruning.`}`; },
        async timeline(options: { cursor?: string; limit?: number; signal?: AbortSignal } = {}) {
          assertActive(); await yieldTask(options.signal);
          const limit = options.limit ?? 25;
          if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new HistoryError("invalid", "Timeline page size must be between 1 and 100");
          const start = options.cursor === undefined ? 0 : ids.indexOf(options.cursor) + 1;
          if (options.cursor !== undefined && start === 0) throw new HistoryError("invalid", "Unknown timeline cursor");
          const queries = queriesFor(options.signal), entries: SessionTimelineEntry[] = [];
          let scanned = 0, next = start;
          for (; next <= headIndex && scanned < limits.timelineScanLimit && entries.length < limit; next++, scanned++) {
            if (!next) {
              entries.push({ revisionId: baselineRevisionId, timestamp: startedAt, label: "History started", cause: "baseline", kinds: [], baseline: true });
              continue;
            }
            const before = await queries.getSubtreeAt(request(ids[next - 1])), after = await queries.getSubtreeAt(request(ids[next]));
            for (const result of [before, after]) if (result.status === "incomplete" || result.status === "unsupported") throw new HistoryError(result.status, result.message ?? "History reconstruction unavailable");
            const event = events[next - 1], kinds: TimelineEntry["kinds"] = [];
            const keys = new Set([...Object.keys(before.fragment?.contents ?? {}), ...Object.keys(after.fragment?.contents ?? {})]);
            if (event.contents.some(change => keys.has(change.key))) kinds.push("content");
            if (!equal(before.occurrence, after.occurrence)) kinds.push("location");
            if (!equal(before.fragment?.tree, after.fragment?.tree)) kinds.push("membership");
            if (!equal(before.fragment?.linkedAnnotations, after.fragment?.linkedAnnotations) || !equal(before.fragment?.diagnostics, after.fragment?.diagnostics)) kinds.push("dependency");
            if (!kinds.length) continue;
            entries.push({ revisionId: ids[next], timestamp: event.timestamp, label: event.label, cause: event.cause.kind,
              kinds, location: after.occurrence ? `Depth ${after.occurrence.route.length - 1}` : after.status });
          }
          aborted(options.signal);
          return freeze({ entries, ...(next <= headIndex ? { nextCursor: ids[next - 1] } : {}), headRevisionId });
        },
        async select(revisionId: string, options: { signal?: AbortSignal } = {}): Promise<HistorySelectionResult> {
          assertActive(); await yieldTask(options.signal);
          const queries = queriesFor(options.signal);
          const comparison = await queries.compareSubtree({ before: request(revisionId), after: request(headRevisionId) });
          aborted(options.signal);
          return freeze({ selected: comparison.before, comparison });
        },
      });
    },
    dispose() { if (disposed) return; disposed = true; stop(); events.length = 0; indices.clear(); },
  });
}
