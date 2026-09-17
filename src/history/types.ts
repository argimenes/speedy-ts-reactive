import type { DeepReadonly } from "../block-tree/commit-capture";
import type { ContentRecord, PlacementRecord, Slot } from "../block-tree/types";
export type QueryStatus = "available" | "deleted" | "unplaced" | "absent-occurrence" | "unknown-block" | "not-yet-created" | "ambiguous-occurrence" | "incomplete" | "unsupported";
export interface TraversalOptions { ownedRelations?: boolean; references?: boolean }
export interface SubtreeRequest extends TraversalOptions {
  segmentId: string; revisionId: string; blockId: string;
  placementKey?: string; route?: readonly string[]; branchHeadRevisionId?: string;
}
export interface HistoricalOccurrence {
  placementKey: string; contentKey: string; route: string[];
  parentContentKey?: string; slot?: Slot; index?: number;
}
export interface OccurrenceTree extends HistoricalOccurrence { cycle?: boolean; excludedReference?: boolean; children: OccurrenceTree[] }
export interface DependencyDiagnostic { kind: "asset" | "block-reference" | "linked-annotation"; id: string; available: boolean; contentKey: string }
export interface HistoricalFragment {
  contents: Record<string, ContentRecord>; placements: Record<string, PlacementRecord>;
  tree?: OccurrenceTree;
  linkedAnnotations: Record<string, unknown>;
  dependencyContentKeys: string[];
  diagnostics: DependencyDiagnostic[];
}
export interface SubtreeResult {
  status: QueryStatus; revisionId: string; blockId: string;
  occurrence?: HistoricalOccurrence; candidates?: HistoricalOccurrence[];
  fragment?: HistoricalFragment; lastAvailableRevisionId?: string;
  deletedKind?: "content" | "placement"; message?: string;
}
export interface TimelineRequest extends Omit<SubtreeRequest, "revisionId"> {
  headRevisionId: string; afterRevisionId?: string; limit?: number;
}
export interface TimelineEntry {
  revisionId: string; timestamp: string; label: string;
  kinds: Array<"content" | "location" | "membership" | "dependency" | "genealogy">;
}
export interface TimelinePage { entries: TimelineEntry[]; nextCursor?: string; headRevisionId: string }
export interface CompareRequest { before: SubtreeRequest; after: SubtreeRequest }
export interface SubtreeComparison {
  comparable: boolean;
  before: DeepReadonly<SubtreeResult>; after: DeepReadonly<SubtreeResult>;
  changes: Array<{ kind: "created" | "deleted" | "authored" | "children" | "location" | "dependency"; blockId?: string }>;
}
