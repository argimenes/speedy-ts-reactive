import type { HistorySource } from "./memory-store";

/** Pass actual query capabilities, not merely a TypeScript view of a store that
 * also owns editable producers. Policies cannot discover fork/editor methods. */
export function readOnlyHistorySource(source: HistorySource): HistorySource {
  return Object.freeze({
    segmentId: source.segmentId, baselineRevisionId: source.baselineRevisionId,
    getStateAt: source.getStateAt.bind(source), getRevision: source.getRevision.bind(source),
    ancestry: source.ancestry.bind(source),
    ...(source.candidateRevisions ? { candidateRevisions: source.candidateRevisions.bind(source) } : {}),
  });
}
