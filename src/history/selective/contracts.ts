import type { ReaderIO } from "../durable-reader";
import type { ContentRecord, Slot } from "../../block-tree/types";
import type { ResourcePlacement } from "../stage-c-gates/resource";
import type { HistoricalOccurrence } from "../types";
import type { BlobRef } from "./pages";
export interface ArchiveIO extends ReaderIO { revisionId(sequence: number): Promise<string> }
export interface Binding { resourceId: string; memoirId: string; segmentId: string; sequence: number; revisionId: string; pathHash: string }
export interface Certificate { binding: Binding; manifest: BlobRef }
export interface Manifest { format: "selective-history-spike"; version: 1; binding: Binding; lookup: BlobRef; locationWork: number; stateBytes?: number }
export interface BlockEntry { contentKey: string; occurrences: Array<{ occurrence: HistoricalOccurrence; placement: ResourcePlacement }>; cost?: { bytes: number; pages: number } }
export interface Bundle { contentKey: string; parts: BlobRef[] }
export type Row = ["content", string, ContentRecord] | ["placement", string, ResourcePlacement]
  | ["inline-content", string, { record: ContentRecord; parts: BlobRef[]; length: number }];
export const isCell = (c: { viewType: string }) => ["text-cell", "image-cell"].includes(c.viewType);
export const edges = (c: Pick<ContentRecord, "children" | "inlineContent" | "ownedRelations">): Array<{ key: string; slot: Slot; index?: number }> => [
  ...c.children.map((key, index) => ({ key, slot: { kind: "children" as const }, index })),
  ...c.inlineContent.map((key, index) => ({ key, slot: { kind: "inline-content" as const }, index })),
  ...Object.entries(c.ownedRelations).map(([name, key]) => ({ key, slot: { kind: "relation" as const, name } }))];
