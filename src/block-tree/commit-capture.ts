import { clone } from "./clone";
import type { BlockId, CommitId, ContentKey, ContentRecord, PlacementKey, PlacementRecord, RepositoryOperation, RepositoryState } from "./types";

export type DeepReadonly<T> = T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> } : T;
export type CommitCause = { kind: "edit" } | { kind: "undo" | "redo"; sourceCommitId: CommitId };

export interface BlockCommitSubject {
  contentKey: ContentKey;
  placementKey?: PlacementKey;
  blockId?: BlockId;
}

export interface CommandDescriptor {
  commandId: string;
  subjects: BlockCommitSubject[];
  relation?:
    | { kind: "split"; source: BlockCommitSubject; created: BlockCommitSubject; at: number }
    | { kind: "join"; survivor: BlockCommitSubject; absorbed: BlockCommitSubject; at: number }
    | { kind: "copy"; pairs: Array<{ source: BlockCommitSubject; copy: BlockCommitSubject }> }
    | { kind: "replace"; previous: BlockCommitSubject; next: BlockCommitSubject }
    | { kind: "cross-text-replace"; inputs: BlockCommitSubject[]; outputs: BlockCommitSubject[] };
  clipboard?: { token: string; action: "cut" | "paste"; preservedIds?: boolean };
}

export interface CommitMetadata { cause?: CommitCause; commands?: CommandDescriptor[] }
export interface RecordDelta<K, T> { key: K; before: T | null; after: T | null }
export interface RepositoryCommitResult {
  commitId: CommitId;
  label: string;
  timestamp: string;
  cause: CommitCause;
  undoRecorded: boolean;
  beforeRevision: number;
  afterRevision: number;
  root: { before: PlacementKey; after: PlacementKey };
  contents: RecordDelta<ContentKey, ContentRecord>[];
  placements: RecordDelta<PlacementKey, PlacementRecord>[];
  commands: CommandDescriptor[];
}
export interface RepositoryOptions { enforceBlockIdentity?: boolean }

export interface PreparedCommitCapture {
  revision: number;
  root: PlacementKey;
  contents: Map<ContentKey, ContentRecord | null>;
  placements: Map<PlacementKey, PlacementRecord | null>;
  metadata: CommitMetadata;
}

// Records contain JSON-shaped payloads. Compare without serializing on typing.
function equal(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object" || Array.isArray(a) !== Array.isArray(b)) return false;
  const left = Object.keys(a), right = Object.keys(b);
  return left.length === right.length && left.every(key => Object.prototype.hasOwnProperty.call(b, key) &&
    equal((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
}

function freeze<T>(value: T): DeepReadonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value as DeepReadonly<T>;
}

export function prepareCommitCapture(state: RepositoryState, operations: readonly RepositoryOperation[], metadata: CommitMetadata): PreparedCommitCapture {
  const contents = new Map<ContentKey, ContentRecord | null>();
  const placements = new Map<PlacementKey, PlacementRecord | null>();
  for (const operation of operations) {
    if (operation.kind === "put-content" || operation.kind === "remove-content") {
      const key = operation.kind === "put-content" ? operation.record.key : operation.key;
      if (!contents.has(key)) contents.set(key, clone(state.contents[key] ?? null));
    } else if (operation.kind === "put-placement" || operation.kind === "remove-placement") {
      const key = operation.kind === "put-placement" ? operation.record.key : operation.key;
      if (!placements.has(key)) placements.set(key, clone(state.placements[key] ?? null));
    }
  }
  return { revision: state.revision, root: state.rootPlacementKey, contents, placements, metadata: clone(metadata) };
}

export function finishCommitCapture(before: PreparedCommitCapture, state: RepositoryState,
  commitId: CommitId, label: string, undoRecorded: boolean): DeepReadonly<RepositoryCommitResult> {
  const deltas = <T>(previous: Map<string, T | null>, current: Record<string, T>): RecordDelta<string, T>[] => {
    const result: RecordDelta<string, T>[] = [];
    for (const [key, value] of previous) {
      const next = current[key] ?? null;
      if (!equal(value, next)) result.push({ key, before: value, after: clone(next) });
    }
    return result;
  };
  return freeze({
    commitId, label, timestamp: new Date().toISOString(), undoRecorded,
    cause: before.metadata.cause ?? { kind: "edit" },
    beforeRevision: before.revision, afterRevision: state.revision,
    root: { before: before.root, after: state.rootPlacementKey },
    contents: deltas(before.contents, state.contents), placements: deltas(before.placements, state.placements),
    commands: before.metadata.commands ?? [{ commandId: "repository.commit", subjects: [] }],
  });
}
