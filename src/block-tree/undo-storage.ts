import { clone } from "./clone";
import type { ContentRecord, HistoryEntry, RepositoryOperation } from "./types";

// Private undo representation, never a repository operation or durable wire type.
// Each snapshot remains independently materializable, including after unrecorded
// commits. No dependency on the current repository, stack ancestry or replay delta.
const CHUNK_SIZE = 128;
const CACHE_SIZE = 32;
interface Sequence {
  length: number;
  chunks: readonly (readonly string[])[];
}
const EMPTY_SEQUENCE: Sequence = Object.freeze({ length: 0, chunks: Object.freeze([]) });
type StoredContent = {
  kind: "stored-content";
  record: Omit<ContentRecord, "children" | "inlineContent"> & { children: Sequence; inlineContent: Sequence };
};
type StoredOperation = RepositoryOperation | StoredContent;
export interface StoredHistoryEntry extends Omit<HistoryEntry, "forward" | "inverse"> {
  forward: StoredOperation[];
  inverse: StoredOperation[];
}

/** Cloned plain trees can be packed without changing aliases or special values.
 * Preserve the original cloned representation for unusual structured-clone
 * graphs (aliases, cycles, Map, Set, typed arrays, etc.). */
function plainTree(value: object): boolean {
  const seen = new WeakSet<object>(), pending = [value];
  while (pending.length) {
    const next = pending.pop()!;
    if (seen.has(next)) return false;
    seen.add(next);
    if (!Array.isArray(next) && Object.getPrototypeOf(next) !== Object.prototype) return false;
    for (const child of Object.values(next)) if (child !== null && typeof child === "object") pending.push(child);
  }
  return true;
}

function stringSequence(value: unknown): value is string[] {
  if (!Array.isArray(value) || Object.keys(value).length !== value.length) return false;
  for (let i = 0; i < value.length; i++) {
    if (!Object.hasOwn(value, i) || typeof value[i] !== "string") return false;
  }
  return true;
}

function pack(value: string[], previous?: Sequence): Sequence {
  let prefix = 0, suffix = 0;
  if (previous) {
    outer: for (const chunk of previous.chunks) for (const item of chunk) {
      if (prefix === value.length || value[prefix] !== item) break outer;
      prefix++;
    }
    if (prefix === value.length && prefix === previous.length) return previous;
    outer: for (let c = previous.chunks.length - 1; c >= 0; c--) {
      const chunk = previous.chunks[c];
      for (let i = chunk.length - 1; i >= 0; i--) {
        if (suffix === Math.min(previous.length, value.length) - prefix ||
          chunk[i] !== value[value.length - 1 - suffix]) break outer;
        suffix++;
      }
    }
  }
  const chunks: (readonly string[])[] = [];
  const append = (chunk: readonly string[]) => {
    if (!chunk.length) return;
    const last = chunks.at(-1);
    // Coalesce small boundary fragments: repeated insertions cannot build an
    // ever longer chain of one-element chunks. All full unaffected chunks share.
    if (last && last.length + chunk.length <= CHUNK_SIZE) {
      chunks[chunks.length - 1] = Object.freeze([...last, ...chunk]);
    } else chunks.push(chunk);
  };
  const range = (from: number, to: number) => {
    let start = 0;
    for (const chunk of previous!.chunks) {
      const end = start + chunk.length;
      if (start >= to) break;
      if (end > from) append(from <= start && end <= to ? chunk : Object.freeze(chunk.slice(Math.max(0, from - start), to - start)));
      start = end;
    }
  };
  if (prefix) range(0, prefix);
  for (let i = prefix; i < value.length - suffix; i += CHUNK_SIZE) {
    append(Object.freeze(value.slice(i, Math.min(i + CHUNK_SIZE, value.length - suffix))));
  }
  if (suffix) range(previous!.length - suffix, previous!.length);
  return Object.freeze({ length: value.length, chunks: Object.freeze(chunks) });
}

function unpack(sequence: Sequence): string[] {
  const result = new Array<string>(sequence.length);
  let i = 0;
  for (const chunk of sequence.chunks) for (const item of chunk) result[i++] = item;
  return result;
}

export class UndoStorage {
  // Weak, bounded lookup hints only. Entries own their chunks; neither cache
  // eviction nor GC can affect undo. Discarded redo branches have no strong cache
  // owner and do not leave tombstones or chains of prior snapshots behind.
  private readonly recent = new Map<string, WeakRef<Sequence>>();

  private sequence(key: string, value: string[]): Sequence {
    if (!value.length) return EMPTY_SEQUENCE;
    const next = pack(value, this.recent.get(key)?.deref());
    this.recent.delete(key);
    this.recent.set(key, new WeakRef(next));
    if (this.recent.size > CACHE_SIZE) this.recent.delete(this.recent.keys().next().value!);
    return next;
  }

  private operations(source: RepositoryOperation[]): StoredOperation[] {
    // Match legacy clone isolation before replacing sequence storage. The
    // existing commit planner/inverse generation and their validation stay intact.
    const copied = clone(source);
    if (Object.keys(copied).some((key, index) => key !== String(index)) || !plainTree(copied)) return copied;
    return copied.map(operation => {
      if (operation.kind !== "put-content" || !stringSequence(operation.record.children) ||
        !stringSequence(operation.record.inlineContent)) return operation;
      const record = operation.record;
      // Spread then replace existing keys preserves property insertion order;
      // repository revision comparisons still use the original JSON order.
      return { ...operation, kind: "stored-content", record: { ...record,
        children: this.sequence(JSON.stringify([record.key, "children"]), record.children),
        inlineContent: this.sequence(JSON.stringify([record.key, "inlineContent"]), record.inlineContent),
      } };
    });
  }

  store(commitId: string, label: string, forward: RepositoryOperation[], inverse: RepositoryOperation[]): StoredHistoryEntry {
    // Cache the forward version last, so the next edit's inverse can reuse it
    // exactly. Comparing with an older inverse would turn two distant small edits
    // into an unnecessarily large changed span.
    const storedInverse = this.operations(inverse);
    return { commitId, label, forward: this.operations(forward), inverse: storedInverse };
  }

  materialize(operations: StoredOperation[]): RepositoryOperation[] {
    if (!operations.some(operation => operation.kind === "stored-content")) return clone(operations as RepositoryOperation[]);
    return clone(operations.map(operation => operation.kind === "stored-content" ? {
      ...operation,
      kind: "put-content" as const,
      record: { ...operation.record, children: unpack(operation.record.children), inlineContent: unpack(operation.record.inlineContent) },
    } : operation));
  }

  /** Diagnostic counts, not an allocation/heap-byte estimate. Call outside edits. */
  diagnostics(entries: readonly StoredHistoryEntry[]) {
    const sequences = new Set<Sequence>(), chunks = new Set<readonly string[]>();
    let sequenceReferences = 0, chunkReferences = 0, uniqueSlots = 0;
    for (const entry of entries) for (const operations of [entry.forward, entry.inverse]) for (const operation of operations) {
      if (operation.kind !== "stored-content") continue;
      for (const sequence of [operation.record.children, operation.record.inlineContent]) {
        sequenceReferences++;
        if (sequences.has(sequence)) continue;
        sequences.add(sequence);
        for (const chunk of sequence.chunks) {
          chunkReferences++;
          if (chunks.has(chunk)) continue;
          chunks.add(chunk); uniqueSlots += chunk.length;
        }
      }
    }
    return { sequenceReferences, sequenceVersions: sequences.size, chunkReferences, uniqueChunks: chunks.size, uniqueSlots, cacheEntries: this.recent.size };
  }
}
