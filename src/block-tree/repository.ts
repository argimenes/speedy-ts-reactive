import { batch } from "solid-js";
import { createStore, reconcile, unwrap } from "solid-js/store";
import { inlineOwnerFor } from "./inline-plan";
import { emptyParagraphParentFor, splitChangeFor, type SplitChange } from "./split-plan";
import { clone } from "./clone";
import { createCommitId } from "./ids";
import { BlockIdentityIndex } from "./identity";
import { prepareCommitCapture, finishCommitCapture, freeze, normalizeInputIntent, type CommitMetadata, type DeepReadonly, type PreparedCommitCapture, type RepositoryCommitResult, type RepositoryOptions } from "./commit-capture";
import { prepareHistoryChanges, finishHistoryChanges, type PreparedHistoryChanges, type HistoryChanges, type CommitEnvelope } from "./compact-changes";
import type {
  ContentKey,
  CommitId,
  ContentRecord,
  HistoryEntry,
  Location,
  PlacementKey,
  RepositoryOperation,
  RepositoryState,
} from "./types";

export class ModelInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelInvariantError";
  }
}

function applyOperation(state: RepositoryState, operation: RepositoryOperation) {
  switch (operation.kind) {
    case "put-content":
      state.contents[operation.record.key] = clone(operation.record);
      return;
    case "remove-content":
      delete state.contents[operation.key];
      return;
    case "put-placement":
      state.placements[operation.record.key] = clone(operation.record);
      return;
    case "remove-placement":
      delete state.placements[operation.key];
      return;
    case "set-root":
      state.rootPlacementKey = operation.key;
  }
}

function inverseFor(state: RepositoryState, operation: RepositoryOperation): RepositoryOperation {
  switch (operation.kind) {
    case "put-content": {
      const previous = state.contents[operation.record.key];
      return previous
        ? { kind: "put-content", record: clone(previous) }
        : { kind: "remove-content", key: operation.record.key };
    }
    case "remove-content": {
      const previous = state.contents[operation.key];
      if (!previous) throw new ModelInvariantError(`Unknown content ${operation.key}`);
      return { kind: "put-content", record: clone(previous) };
    }
    case "put-placement": {
      const previous = state.placements[operation.record.key];
      return previous
        ? { kind: "put-placement", record: clone(previous) }
        : { kind: "remove-placement", key: operation.record.key };
    }
    case "remove-placement": {
      const previous = state.placements[operation.key];
      if (!previous) throw new ModelInvariantError(`Unknown placement ${operation.key}`);
      return { kind: "put-placement", record: clone(previous) };
    }
    case "set-root":
      return { kind: "set-root", key: state.rootPlacementKey };
  }
}

export function deriveLocations(state: RepositoryState): Map<PlacementKey, Location> {
  const locations = new Map<PlacementKey, Location>();

  for (const content of Object.values(state.contents)) {
    content.children.forEach((childKey, index) => {
      if (locations.has(childKey)) {
        throw new ModelInvariantError(`Placement ${childKey} has more than one owner`);
      }
      locations.set(childKey, {
        ownerContentKey: content.key,
        slot: { kind: "children" },
        index,
      });
    });

    content.inlineContent.forEach((inlineKey, index) => {
      if (locations.has(inlineKey)) {
        throw new ModelInvariantError(`Placement ${inlineKey} has more than one owner`);
      }
      locations.set(inlineKey, {
        ownerContentKey: content.key,
        slot: { kind: "inline-content" },
        index,
      });
    });

    for (const [name, relationKey] of Object.entries(content.ownedRelations)) {
      if (locations.has(relationKey)) {
        throw new ModelInvariantError(`Placement ${relationKey} has more than one owner`);
      }
      locations.set(relationKey, {
        ownerContentKey: content.key,
        slot: { kind: "relation", name },
      });
    }
  }

  return locations;
}

export function validateRepository(state: RepositoryState): void {
  if (!state.placements[state.rootPlacementKey]) {
    throw new ModelInvariantError(`Missing root placement ${state.rootPlacementKey}`);
  }

  const locations = deriveLocations(state);
  for (const placementKey of Object.keys(state.placements)) {
    if (placementKey === state.rootPlacementKey) continue;
    if (!locations.has(placementKey)) {
      throw new ModelInvariantError(`Placement ${placementKey} is detached`);
    }
  }
  if (locations.has(state.rootPlacementKey)) {
    throw new ModelInvariantError("The root placement cannot have an owner");
  }

  const reachable = new Set<PlacementKey>();
  const visit = (placementKey: PlacementKey, ancestors: Set<ContentKey>) => {
    const placement = state.placements[placementKey];
    if (!placement) throw new ModelInvariantError(`Missing placement ${placementKey}`);
    reachable.add(placementKey);
    if (ancestors.has(placement.contentKey) && placement.kind !== "reference") {
      throw new ModelInvariantError(`Ownership cycle through ${placement.contentKey}`);
    }
    if (ancestors.has(placement.contentKey)) return;
    const content = state.contents[placement.contentKey];
    const next = new Set(ancestors).add(content.key);
    for (const childKey of content.children) visit(childKey, next);
    for (const inlineKey of content.inlineContent) visit(inlineKey, next);
    for (const relationKey of Object.values(content.ownedRelations)) visit(relationKey, next);
  };
  visit(state.rootPlacementKey, new Set());
  for (const placementKey of Object.keys(state.placements)) {
    if (!reachable.has(placementKey)) {
      throw new ModelInvariantError(`Placement ${placementKey} is unreachable from the root`);
    }
  }
}

export function planOperations(
  source: RepositoryState,
  operations: RepositoryOperation[],
): { next: RepositoryState; inverse: RepositoryOperation[] } {
  const next = clone(source);
  const inverse: RepositoryOperation[] = [];
  for (const operation of operations) {
    inverse.unshift(inverseFor(next, operation));
    applyOperation(next, operation);
  }
  validateRepository(next);
  return { next, inverse };
}

type RepositorySubscriber = (state: RepositoryState, label: string) => void;
type CommitSubscriber = {
  listener: (result: DeepReadonly<RepositoryCommitResult>) => void;
  onError: (error: unknown, commitId: CommitId) => void;
};
type Attempt<T> = { capture: T } | { error: unknown };
type CaptureAttempt = {
  full?: Attempt<PreparedCommitCapture>; compact?: Attempt<PreparedHistoryChanges>;
  envelope: Attempt<Omit<CommitEnvelope, "commitId" | "label" | "timestamp" | "undoRecorded" | "afterRevision">>;
};
type HistorySubscriber = { listener: (event: DeepReadonly<HistoryChanges>) => void; onError: CommitSubscriber["onError"] };

export interface RepositoryChange {
  label: string;
  previousContents: Map<ContentKey, ContentRecord | undefined>;
  /** Present only for a validated, single-owner leaf-text edit. */
  inlineOwner?: ContentKey;
  split?: SplitChange;
  childrenOwner?: ContentKey;
}

export class CanonicalRepository {
  readonly state: RepositoryState;
  private readonly setState: (...args: any[]) => void;
  private subscribers = new Set<RepositorySubscriber>();
  private beforeSubscribers = new Set<RepositorySubscriber>();
  private changeSubscribers = new Set<(change: RepositoryChange) => void>();
  private beforeChangeSubscribers = new Set<(label: string) => void>();
  private references = new Map<ContentKey, number>();
  private locations = new Map<PlacementKey, Location>();
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private readonly identity?: BlockIdentityIndex;
  private readonly commitSubscribers = new Set<CommitSubscriber>();
  private readonly historySubscribers = new Set<HistorySubscriber>();
  private deliveringCommit = false;

  constructor(initial: RepositoryState, options: RepositoryOptions = {}) {
    validateRepository(initial);
    if (options.enforceBlockIdentity) this.identity = new BlockIdentityIndex(initial);
    const [state, setState] = createStore(clone(initial));
    this.state = state;
    this.setState = setState;
    this.rebuildReferences();
  }

  /** Internal read-only access. Never mutate these records; use commit. */
  readState(): RepositoryState { return unwrap(this.state); }

  contentReferenceCount(key: ContentKey): number { return this.references.get(key) ?? 0; }

  locationOf(key: PlacementKey): Location | undefined { return this.locations.get(key); }

  private rebuildReferences(): void {
    this.locations = deriveLocations(this.readState());
    this.references.clear();
    for (const placement of Object.values(this.readState().placements)) {
      this.references.set(placement.contentKey, this.contentReferenceCount(placement.contentKey) + 1);
    }
  }

  subscribeChanges(subscriber: (change: RepositoryChange) => void): () => void {
    this.changeSubscribers.add(subscriber);
    return () => this.changeSubscribers.delete(subscriber);
  }

  subscribeBeforeChanges(subscriber: (label: string) => void): () => void {
    this.beforeChangeSubscribers.add(subscriber);
    return () => this.beforeChangeSubscribers.delete(subscriber);
  }

  snapshot(): RepositoryState {
    return clone(unwrap(this.state));
  }

  subscribe(subscriber: RepositorySubscriber): () => void {
    this.subscribers.add(subscriber);
    return () => this.subscribers.delete(subscriber);
  }

  subscribeBefore(subscriber: RepositorySubscriber): () => void {
    this.beforeSubscribers.add(subscriber);
    return () => this.beforeSubscribers.delete(subscriber);
  }

  subscribeCommits(listener: CommitSubscriber["listener"], onError: CommitSubscriber["onError"]): () => void {
    const subscriber = { listener, onError };
    this.commitSubscribers.add(subscriber);
    return () => { this.commitSubscribers.delete(subscriber); };
  }

  subscribeHistoryChanges(listener: HistorySubscriber["listener"], onError: HistorySubscriber["onError"]): () => void {
    const subscriber = { listener, onError };
    this.historySubscribers.add(subscriber);
    return () => { this.historySubscribers.delete(subscriber); };
  }

  private prepareCapture(state: RepositoryState, operations: RepositoryOperation[], metadata: CommitMetadata, final?: RepositoryState): CaptureAttempt | undefined {
    if (!this.commitSubscribers.size && !this.historySubscribers.size) return;
    metadata = { ...metadata, inputIntent: normalizeInputIntent(metadata.inputIntent) };
    const attempt = <T>(fn: () => T): Attempt<T> => { try { return { capture: fn() }; } catch (error) { return { error }; } };
    return {
      envelope: attempt(() => ({ beforeRevision: state.revision, root: { before: state.rootPlacementKey, after: final?.rootPlacementKey ?? state.rootPlacementKey },
        cause: clone(metadata.cause ?? { kind: "edit" }), commands: clone(metadata.commands ?? [{ commandId: "repository.commit", subjects: [] }]),
        ...(metadata.inputIntent ? { inputIntent: clone(metadata.inputIntent) } : {}) })),
      full: this.commitSubscribers.size ? attempt(() => prepareCommitCapture(state, operations, metadata)) : undefined,
      compact: this.historySubscribers.size ? attempt(() => prepareHistoryChanges(state, operations, final)) : undefined,
    };
  }

  private deliverCapture(attempt: CaptureAttempt | undefined, commitId: CommitId, label: string, recordHistory: boolean): void {
    if (!attempt) return;
    this.deliveringCommit = true;
    const report = (subscriber: { onError: CommitSubscriber["onError"] }, error: unknown) => {
      try { subscriber.onError(error, commitId); } catch { /* An observer cannot invalidate the edit. */ }
    };
    try {
      if ("error" in attempt.envelope) {
        [...this.commitSubscribers, ...this.historySubscribers].forEach(s => report(s, (attempt.envelope as { error: unknown }).error)); return;
      }
      const envelope = freeze({ ...attempt.envelope.capture, commitId, label, timestamp: new Date().toISOString(),
        undoRecorded: recordHistory, afterRevision: this.state.revision });
      const deliver = <T, E>(prepared: Attempt<T> | undefined, subscribers: Array<{ listener: (event: E) => void; onError: CommitSubscriber["onError"] }>, finish: (value: T) => E) => {
        if (!prepared) return;
        if ("error" in prepared) { subscribers.forEach(s => report(s, prepared.error)); return; }
        let event: E;
        try { event = finish(prepared.capture); } catch (error) { subscribers.forEach(s => report(s, error)); return; }
        for (const subscriber of subscribers) { try { subscriber.listener(event); } catch (error) { report(subscriber, error); } }
      };
      deliver(attempt.full, [...this.commitSubscribers], value => freeze({
        ...finishCommitCapture(value, this.readState(), commitId, label, recordHistory, envelope.timestamp), ...envelope,
      }));
      deliver(attempt.compact, [...this.historySubscribers], value => finishHistoryChanges(value, envelope));
    } finally { this.deliveringCommit = false; }
  }

  private assertNotCaptureCallback(): void {
    if (this.deliveringCommit) throw new ModelInvariantError("Commit observers cannot mutate the repository synchronously");
  }

  commit(label: string, operations: RepositoryOperation[], recordHistory = true, metadata: CommitMetadata = {}): void {
    this.assertNotCaptureCallback();
    if (!operations.length) return;
    const inlineOwner = inlineOwnerFor(this.readState(), operations, this.references);
    if (inlineOwner) {
      this.commitInline(label, operations, inlineOwner, recordHistory, metadata);
      return;
    }
    const split = splitChangeFor(this.readState(), operations, this.references);
    if (split) {
      this.commitInline(label, operations, undefined, recordHistory, metadata, split);
      return;
    }
    const childrenOwner = emptyParagraphParentFor(this.readState(), operations, this.references);
    if (childrenOwner) {
      this.commitInline(label, operations, undefined, recordHistory, metadata, undefined, childrenOwner);
      return;
    }
    const current = this.snapshot();
    for (const subscriber of this.beforeChangeSubscribers) subscriber(label);
    for (const subscriber of this.beforeSubscribers) subscriber(current, label);
    const { next, inverse } = planOperations(current, operations);
    for (const [key, content] of Object.entries(next.contents)) {
      const previous = current.contents[key];
      if (!previous) continue;
      const previousValue = { ...previous, revision: 0 };
      const nextValue = { ...content, revision: 0 };
      if (JSON.stringify(previousValue) !== JSON.stringify(nextValue)) {
        content.revision = previous.revision + 1;
      }
    }
    next.revision = current.revision + 1;
    const identityDelta = this.identity?.validateCommit(operations);
    const capture = this.prepareCapture(current, operations, metadata, next);
    const commitId = createCommitId();
    const previousContents = new Map<ContentKey, ContentRecord | undefined>();
    for (const operation of operations) {
      if (operation.kind === "put-content" || operation.kind === "remove-content") {
        const key = operation.kind === "put-content" ? operation.record.key : operation.key;
        previousContents.set(key, current.contents[key]);
      }
    }
    batch(() => {
      this.setState(reconcile(next));
      this.rebuildReferences();
      if (identityDelta) this.identity!.acceptCommit(identityDelta);
      if (recordHistory) {
        this.undoStack.push({
          commitId,
          label,
          forward: clone(operations),
          inverse,
        });
        this.redoStack = [];
      }
      this.deliverCapture(capture, commitId, label, recordHistory);
      for (const subscriber of this.subscribers) subscriber(this.snapshot(), label);
      for (const subscriber of this.changeSubscribers) subscriber({ label, previousContents });
    });
  }

  private commitInline(label: string, operations: RepositoryOperation[], inlineOwner: ContentKey | undefined, recordHistory: boolean, metadata: CommitMetadata, split?: SplitChange, childrenOwner?: ContentKey): void {
    const current = this.readState();
    // Capture inverse data before changing any reactive records.
    const inverse = operations.map((operation) => inverseFor(current, operation)).reverse();
    const previousContents = new Map<ContentKey, ContentRecord | undefined>();
    const prepared = clone(operations);
    for (const operation of prepared) {
      if (operation.kind !== "put-content" && operation.kind !== "remove-content") continue;
      const key = operation.kind === "put-content" ? operation.record.key : operation.key;
      const previous = current.contents[key];
      previousContents.set(key, previous ? clone(previous) : undefined);
      if (operation.kind === "put-content" && previous &&
        JSON.stringify({ ...previous, revision: 0 }) !== JSON.stringify({ ...operation.record, revision: 0 })) {
        operation.record.revision = previous.revision + 1;
      }
    }
    for (const subscriber of this.beforeChangeSubscribers) subscriber(label);
    for (const subscriber of this.beforeSubscribers) subscriber(this.snapshot(), label);
    const identityDelta = this.identity?.validateCommit(prepared);
    const capture = this.prepareCapture(current, prepared, metadata);
    const commitId = createCommitId();
    batch(() => {
      // Remove old locations before installing new ones: a split transfers Cells
      // between two owners, and operation ordering must not erase their new home.
      for (const previous of previousContents.values()) {
        if (!previous) continue;
        for (const key of [...previous.children, ...previous.inlineContent, ...Object.values(previous.ownedRelations)]) this.locations.delete(key);
      }
      for (const operation of prepared) {
        switch (operation.kind) {
          case "put-content": this.setState("contents", operation.record.key, reconcile(operation.record)); break;
          case "remove-content": this.setState("contents", operation.key, undefined); break;
          case "put-placement": {
            const key = operation.record.contentKey;
            this.references.set(key, this.contentReferenceCount(key) + 1);
            this.setState("placements", operation.record.key, operation.record);
            break;
          }
          case "remove-placement": {
            const key = current.placements[operation.key].contentKey;
            const count = this.contentReferenceCount(key) - 1;
            if (count) this.references.set(key, count); else this.references.delete(key);
            this.setState("placements", operation.key, undefined);
            break;
          }
        }
      }
      for (const key of previousContents.keys()) {
        const content = current.contents[key];
        if (!content) continue;
        content.children.forEach((key, index) => this.locations.set(key, { ownerContentKey: content.key, slot: { kind: "children" }, index }));
        content.inlineContent.forEach((key, index) => this.locations.set(key, { ownerContentKey: content.key, slot: { kind: "inline-content" }, index }));
        for (const [name, key] of Object.entries(content.ownedRelations)) this.locations.set(key, { ownerContentKey: content.key, slot: { kind: "relation", name } });
      }
      this.setState("revision", current.revision + 1);
      if (identityDelta) this.identity!.acceptCommit(identityDelta);
      if (recordHistory) {
        this.undoStack.push({ commitId, label, forward: clone(operations), inverse });
        this.redoStack = [];
      }
      this.deliverCapture(capture, commitId, label, recordHistory);
      for (const subscriber of this.subscribers) subscriber(this.snapshot(), label);
      for (const subscriber of this.changeSubscribers) subscriber({ label, previousContents, inlineOwner, split, childrenOwner });
    });
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  undo(): void {
    this.assertNotCaptureCallback();
    const entry = this.undoStack.pop();
    if (!entry) return;
    batch(() => {
      const before = this.state.revision;
      try { this.commit(`Undo ${entry.label}`, entry.inverse, false, { cause: { kind: "undo", sourceCommitId: entry.commitId } }); }
      catch (error) {
        (this.state.revision === before ? this.undoStack : this.redoStack).push(entry);
        throw error;
      }
      this.redoStack.push(entry);
    });
  }

  redo(): void {
    this.assertNotCaptureCallback();
    const entry = this.redoStack.pop();
    if (!entry) return;
    batch(() => {
      const before = this.state.revision;
      try { this.commit(`Redo ${entry.label}`, entry.forward, false, { cause: { kind: "redo", sourceCommitId: entry.commitId } }); }
      catch (error) {
        (this.state.revision === before ? this.redoStack : this.undoStack).push(entry);
        throw error;
      }
      this.undoStack.push(entry);
    });
  }
}
