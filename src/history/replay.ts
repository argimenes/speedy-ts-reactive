import { clone } from "../block-tree/clone";
import { type DeepReadonly } from "../block-tree/commit-capture";
import { type HistoryChanges } from "../block-tree/compact-changes";
import { BlockIdentityIndex } from "../block-tree/identity";
import { validateRepository } from "../block-tree/repository";
import type { RepositoryState } from "../block-tree/types";

export { HistoryError } from "./errors";
import { HistoryError } from "./errors";
import { applyExactRecords } from "./apply-records";
function requireExact(ok: unknown, message: string): asserts ok { if (!ok) throw new HistoryError("invalid", message); }
export interface ReplayTiming { applyMs: number; validationMs: number }

/** Pure exact application. Neither the source nor repository/undo APIs are mutated. */
export function applyHistoryChanges(source: DeepReadonly<RepositoryState>, event: DeepReadonly<HistoryChanges>, timing?: ReplayTiming): RepositoryState {
  if (event.format !== "codex-exact-changes" || event.version !== 1) throw new HistoryError("unsupported", "Unsupported exact change format/version");
  requireExact(source.revision === event.beforeRevision && source.rootPlacementKey === event.root.before, "Replay base revision/root mismatch");
  requireExact(Number.isSafeInteger(event.afterRevision) && event.afterRevision === event.beforeRevision + 1, "Invalid repository revision transition");
  const start = performance.now();
  const next = clone(source) as RepositoryState;
  applyExactRecords(next, event);
  next.rootPlacementKey = event.root.after;
  next.revision = event.afterRevision;
  const validationStart = performance.now();
  validateRepository(next);
  new BlockIdentityIndex(next);
  if (timing) { timing.applyMs += validationStart - start; timing.validationMs += performance.now() - validationStart; }
  return next;
}
