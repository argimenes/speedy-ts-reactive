import { clone } from "./clone";
import { equal, freeze, type DeepReadonly, type RecordDelta, type RepositoryCommitResult } from "./commit-capture";
import type { ContentRecord, PlacementRecord, RepositoryOperation, RepositoryState } from "./types";

export type CommitEnvelope = Omit<RepositoryCommitResult, "contents" | "placements">;
export type PresentValue = { present: false } | { present: true; value: unknown };
export interface FieldChange { scope: "record" | "payload"; field: string; before: PresentValue; after: PresentValue }
export interface SequenceChange {
  field: "children" | "inlineContent";
  beforeLength: number; afterLength: number;
  index: number; removed: string[]; inserted: string[];
}
export interface ContentPatch {
  kind: "patch-content"; key: string;
  beforeRevision: number; afterRevision: number;
  fields: FieldChange[]; sequences: SequenceChange[];
}
export type ContentChange = ContentPatch | ({ kind: "record-content" } & RecordDelta<string, ContentRecord>);
export interface HistoryChanges extends CommitEnvelope {
  format: "codex-exact-changes"; version: 1;
  contents: ContentChange[];
  placements: RecordDelta<string, PlacementRecord>[];
}

export const recordFields = new Set(["definitionOwnerKey", "viewType", "inlineRevision", "inlineKind", "ownedRelations", "opaqueRelations", "wireChildren", "wireRelation", "revision"]);
const knownFields = new Set(["key", "payload", "children", "inlineContent", ...recordFields]);
const has = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);
export function present(value: object, key: string): PresentValue {
  return has(value, key) ? { present: true, value: (value as Record<string, unknown>)[key] } : { present: false };
}

/** Compare every field before mutation; retain only owned changed values.
 * Prefix/suffix verification scans the sequence but never copies its unchanged
 * portion. No command hint or optimized-route eligibility authorizes a delta.
 */
export function diffContent(before: ContentRecord | null, after: ContentRecord | null, key: string): ContentChange | undefined {
  if (!before && !after) return;
  if (!before || !after || before.key !== after.key || [...Object.keys(before), ...Object.keys(after)].some(field => !knownFields.has(field))) {
    if (equal(before, after)) return;
    return { kind: "record-content", key, before: clone(before), after: clone(after) };
  }
  const fields: FieldChange[] = [], sequences: SequenceChange[] = [];
  for (const scope of ["record", "payload"] as const) {
    const a = scope === "record" ? before : before.payload;
    const b = scope === "record" ? after : after.payload;
    for (const field of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (scope === "record" && !recordFields.has(field)) continue;
      const old = present(a, field), next = present(b, field);
      if (!equal(old, next)) fields.push({ scope, field, before: clone(old), after: clone(next) });
    }
  }
  for (const field of ["children", "inlineContent"] as const) {
    const a = before[field], b = after[field];
    let start = 0, end = 0;
    while (start < a.length && start < b.length && a[start] === b[start]) start++;
    while (end < a.length - start && end < b.length - start && a[a.length - 1 - end] === b[b.length - 1 - end]) end++;
    if (start === a.length && start === b.length) continue;
    sequences.push({ field, beforeLength: a.length, afterLength: b.length, index: start,
      removed: a.slice(start, a.length - end), inserted: b.slice(start, b.length - end) });
  }
  if (fields.length || sequences.length) return { kind: "patch-content", key, beforeRevision: before.revision, afterRevision: after.revision, fields, sequences };
}

export interface PreparedHistoryChanges {
  contents: ContentChange[]; placements: RecordDelta<string, PlacementRecord>[];
}

export function prepareHistoryChanges(before: RepositoryState, operations: readonly RepositoryOperation[], final?: RepositoryState): PreparedHistoryChanges {
  const contents = new Map<string, ContentRecord | null>(), placements = new Map<string, PlacementRecord | null>();
  for (const op of operations) {
    if (op.kind === "put-content") contents.set(op.record.key, op.record);
    if (op.kind === "remove-content") contents.set(op.key, null);
    if (op.kind === "put-placement") placements.set(op.record.key, op.record);
    if (op.kind === "remove-placement") placements.set(op.key, null);
  }
  const result: PreparedHistoryChanges = { contents: [], placements: [] };
  for (const [key, value] of contents) {
    const change = diffContent(before.contents[key] ?? null, final ? final.contents[key] ?? null : value, key);
    if (change) result.contents.push(change);
  }
  for (const [key, value] of placements) {
    const old = before.placements[key] ?? null, next = final ? final.placements[key] ?? null : value;
    if (!equal(old, next)) result.placements.push({ key, before: clone(old), after: clone(next) });
  }
  return result;
}

export function finishHistoryChanges(prepared: PreparedHistoryChanges, envelope: DeepReadonly<CommitEnvelope>): DeepReadonly<HistoryChanges> {
  return freeze({ ...envelope, ...prepared, format: "codex-exact-changes", version: 1 } as HistoryChanges);
}
