import { clone } from "../block-tree/clone";
import { finishHistoryChanges, prepareHistoryChanges, diffContent, type HistoryChanges } from "../block-tree/compact-changes";
import type { DeepReadonly } from "../block-tree/commit-capture";
import type { RepositoryState } from "../block-tree/types";
import type { BlockRestorePlan } from "../block-tree/block-restore";
import { WholeDocumentCapture, encodeDurableWire, assertBoundedSnapshot, applyDurableTransitionSized } from "./durable-core";
import type { ResourceSnapshot, ResourceTransition } from "./stage-c-gates/resource";
import { HISTORY_OUTBOX_DEFAULTS } from "./persistent-outbox";

export function restoreCaptureProposal(state: RepositoryState, plan: DeepReadonly<BlockRestorePlan>): DeepReadonly<HistoryChanges> {
  if (state.revision !== plan.expectedRevision) throw Error("The Document changed; prepare the restore again.");
  return finishHistoryChanges(prepareHistoryChanges(state, plan.operations as any), {
    commitId: "00000000-0000-4000-8000-000000000000", timestamp: "2000-01-01T00:00:00.000Z", label: "Restore this Block",
    beforeRevision: state.revision, afterRevision: state.revision + 1, root: { before: state.rootPlacementKey, after: state.rootPlacementKey },
    cause: { kind: "edit" }, undoRecorded: true, commands: [plan.descriptor],
  });
}
/** Private worker draft only; no capture cursor, outbox, archive or live mutation.
 * Reserve 1 KiB inside the existing packet bound for later Undo/Redo envelope
 * labels/counters. No single-operation limit is raised or history split. */
export function validateRestoreCapture(state: ResourceSnapshot, sourceRevision: number, proposal: DeepReadonly<HistoryChanges>, stateBytes = assertBoundedSnapshot(state)): void {
  const event = new WholeDocumentCapture(state, sourceRevision).capture(proposal);
  if (new TextEncoder().encode(encodeDurableWire(event)).length > HISTORY_OUTBOX_DEFAULTS.maxRecordBytes - 1024) {
    throw Error("This restore exceeds the existing single-change history limit. Nothing was changed; a larger atomic restore needs a separate design.");
  }
  const draft = clone(state);
  let bytes = applyDurableTransitionSized(draft, event, stateBytes);
  const restored = new Map(event.contents.map(c => [c.key, draft.contents[c.key] ? clone(draft.contents[c.key]) : null]));
  // Check the immediate ordinary Undo and Redo as well. Existing content counters
  // advance normally; removed/recreated Cell records follow normal undo rules.
  for (const [index, kind] of (["undo", "redo"] as const).entries()) {
    const contents = event.contents.flatMap(change => {
      const desired = kind === "undo" ? state.contents[change.key] ?? null : restored.get(change.key) ?? null;
      const next = desired ? clone(desired) : null, current = draft.contents[change.key] ?? null;
      if (next && current) next.revision = current.revision + 1;
      const delta = diffContent(current, next, change.key); return delta ? [delta] : [];
    });
    const transition: ResourceTransition = { ...event, commitId: "00000000-0000-4000-8000-000000000000", label: `${kind === "undo" ? "Undo" : "Redo"} Restore this Block`,
      cause: { kind, sourceCommitId: event.commitId }, commands: [{ commandId: "repository.commit", subjects: [] }],
      beforeRevision: draft.revision, afterRevision: draft.revision + 1,
      sourceCounters: { before: proposal.afterRevision + index, after: proposal.afterRevision + index + 1 }, contents,
      placements: event.placements.map(p => ({ key: p.key, before: draft.placements[p.key] ?? null, after: kind === "undo" ? p.before : p.after })),
    };
    if (new TextEncoder().encode(encodeDurableWire(transition)).length > HISTORY_OUTBOX_DEFAULTS.maxRecordBytes - 1024) throw Error("Restore Undo/Redo exceeds the existing single-change history limit. Nothing was changed.");
    bytes = applyDurableTransitionSized(draft, transition, bytes);
  }
}
