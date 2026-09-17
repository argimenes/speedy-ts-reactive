import { clone } from "../block-tree/clone";
import { equal, type DeepReadonly, type RecordDelta } from "../block-tree/commit-capture";
import { present, recordFields, type ContentChange, type PresentValue } from "../block-tree/compact-changes";
import type { ContentRecord } from "../block-tree/types";
import { HistoryError } from "./errors";

function requireExact(ok: unknown, message: string): asserts ok { if (!ok) throw new HistoryError("invalid", message); }
const own = (object: object, key: string) => Object.prototype.hasOwnProperty.call(object, key);
function validPresent(value: DeepReadonly<PresentValue>): boolean {
  return !!value && typeof value === "object" && (value.present === false ? !own(value, "value") : value.present === true && own(value, "value"));
}

/** Apply existing exact record/field/splice rules to a private draft only.
 * The caller validates its declared graph model before publishing the draft. */
export function applyExactRecords<P extends { key: string }>(
  next: { contents: Record<string, ContentRecord>; placements: Record<string, P> },
  changes: { contents: DeepReadonly<ContentChange[]>; placements: DeepReadonly<RecordDelta<string, P>[]> },
): void {
  const seen = new Set<string>();
  for (const change of changes.contents) {
    requireExact(!seen.has(change.key), "Duplicate content delta"); seen.add(change.key);
    const current = next.contents[change.key];
    if (change.kind === "record-content") {
      requireExact(equal(current ?? null, change.before), "Content preimage mismatch");
      requireExact(change.after === null || change.after.key === change.key, "Content key mismatch");
      if (change.after === null) delete next.contents[change.key];
      else Object.defineProperty(next.contents, change.key, { value: clone(change.after), enumerable: true, writable: true, configurable: true });
      continue;
    }
    requireExact(change.kind === "patch-content" && current && current.revision === change.beforeRevision, "Invalid content patch/base");
    const fields = new Set<string>();
    for (const field of change.fields) {
      requireExact(field.scope === "payload" || field.scope === "record" && recordFields.has(field.field), "Unsupported field path");
      const path = JSON.stringify([field.scope, field.field]);
      requireExact(!fields.has(path) && validPresent(field.before) && validPresent(field.after), "Malformed/duplicate field patch"); fields.add(path);
      const target = field.scope === "payload" ? current.payload : current;
      requireExact(equal(present(target, field.field), field.before), "Field preimage mismatch");
      if (!field.after.present) delete (target as Record<string, unknown>)[field.field];
      else Object.defineProperty(target, field.field, { value: clone(field.after.value), enumerable: true, configurable: true, writable: true });
    }
    const sequences = new Set<string>();
    for (const sequence of change.sequences) {
      requireExact((sequence.field === "children" || sequence.field === "inlineContent") && !sequences.has(sequence.field), "Malformed/duplicate sequence patch");
      sequences.add(sequence.field);
      const keys = current[sequence.field];
      requireExact(Number.isSafeInteger(sequence.index) && sequence.index >= 0 && keys.length === sequence.beforeLength &&
        sequence.index + sequence.removed.length <= keys.length && sequence.inserted.every(key => typeof key === "string") &&
        sequence.removed.every((key, index) => keys[sequence.index + index] === key) &&
        sequence.afterLength === keys.length - sequence.removed.length + sequence.inserted.length, "Sequence precondition mismatch");
      // Avoid argument-count limits for large exact fallback transfers.
      current[sequence.field] = [...keys.slice(0, sequence.index), ...sequence.inserted, ...keys.slice(sequence.index + sequence.removed.length)];
    }
    requireExact(current.revision === change.afterRevision, "Final content revision mismatch");
  }
  seen.clear();
  for (const delta of changes.placements) {
    requireExact(!seen.has(delta.key), "Duplicate placement delta"); seen.add(delta.key);
    requireExact(equal(next.placements[delta.key] ?? null, delta.before), "Placement preimage mismatch");
    requireExact(delta.after === null || delta.after.key === delta.key, "Placement key mismatch");
    if (delta.after === null) delete next.placements[delta.key];
    else Object.defineProperty(next.placements, delta.key, { value: clone(delta.after) as P, enumerable: true, writable: true, configurable: true });
  }
}
