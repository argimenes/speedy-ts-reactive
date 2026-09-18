/** A read-only export of authored values, also usable by a future Copy action.
 * A preview is never a restore source. Resolve and verify the exact revision. */
import { leafAuthoredState, type LeafAuthoredState } from "../block-tree/block-restore";
import { freeze, type DeepReadonly } from "../block-tree/commit-capture";
import type { SubtreeResult } from "./types";
export interface HistoricalBlockSource {
  blockId: string; revisionId: string; segmentId: string;
  authored: DeepReadonly<LeafAuthoredState>;
}
export function historicalBlockSource(result: DeepReadonly<SubtreeResult>, segmentId: string): DeepReadonly<HistoricalBlockSource> {
  if (result.status !== "available" || !result.fragment || !result.occurrence || result.fragment.tree?.cycle || result.fragment.diagnostics.some(d => !d.available)) {
    throw Error("Only an available, unambiguous historical Block can be restored. Missing/deleted Blocks require Copy from History or Restore subtree semantics.");
  }
  const content = result.fragment.contents[result.occurrence.contentKey];
  if (!content || content.payload.id !== result.blockId) throw Error("Historical Block identity is incomplete.");
  return freeze({ blockId: result.blockId, revisionId: result.revisionId, segmentId, authored: leafAuthoredState(content, result.fragment) });
}
export function restoreAvailability(result: DeepReadonly<SubtreeResult>) {
  try { historicalBlockSource(result, "eligibility-only"); return { supported: true }; }
  catch (error) { return { supported: false, reason: (error as Error).message }; }
}
