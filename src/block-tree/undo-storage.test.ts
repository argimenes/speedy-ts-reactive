import { describe, expect, it } from "vitest";
import { clone } from "./clone";
import { UndoStorage, type StoredHistoryEntry } from "./undo-storage";
import type { ContentRecord, RepositoryOperation } from "./types";

function content(inlineContent: string[], extra: Partial<ContentRecord> = {}): ContentRecord {
  return { key: "paragraph", viewType: "standoff-editor-block", payload: { id: "authored", nested: { absent: undefined, zero: -0 } },
    children: [], inlineContent, inlineRevision: 0, ownedRelations: {}, opaqueRelations: {}, wireChildren: "omitted", wireRelation: "null", revision: 0, ...extra };
}
const put = (record: ContentRecord): RepositoryOperation[] => [{ kind: "put-content", record }];

describe("private undo sequence storage", () => {
  it("retains exact independent operations, property order and cloning isolation", () => {
    const storage = new UndoStorage(), before = content(["a", "b"]), after = content(["a", "new", "b"], { revision: 6 });
    const forward = put(after), inverse = put(before), expected = clone({ forward, inverse });
    const entry = storage.store("commit", "label", forward, inverse);
    after.inlineContent[0] = "mutated"; before.payload.id = "changed";
    expect(storage.materialize(entry.forward)).toEqual(expected.forward);
    expect(storage.materialize(entry.inverse)).toEqual(expected.inverse);
    expect(JSON.stringify(storage.materialize(entry.forward))).toBe(JSON.stringify(expected.forward));
    const read = storage.materialize(entry.forward);
    (read[0] as any).record.inlineContent.push("another mutation");
    (read[0] as any).record.payload.nested.zero = 42;
    expect(storage.materialize(entry.forward)).toEqual(expected.forward);
    expect(Object.is((storage.materialize(entry.forward)[0] as any).record.payload.nested.zero, -0)).toBe(true);
    const extended = [{ extension: "preserved", record: content(["a"]), kind: "put-content" as const }];
    const extendedEntry = storage.store("extended", "edit", extended, []);
    expect(JSON.stringify(storage.materialize(extendedEntry.forward))).toBe(JSON.stringify(extended));
    Object.assign(extended, { namedArrayProperty: { value: "preserved" } });
    expect(storage.materialize(storage.store("named", "edit", extended, []).forward)).toEqual(clone(extended));
  });

  it("round-trips every stored version across seeded insertion, deletion and replacement", () => {
    const storage = new UndoStorage(), entries: StoredHistoryEntry[] = [], expected: RepositoryOperation[][] = [];
    let value = Array.from({ length: 1000 }, (_, i) => `cell-${i}`), seed = 7321;
    const random = (limit: number) => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % limit; };
    for (let step = 0; step < 250; step++) {
      const old = value, next = [...value], index = random(next.length + 1);
      next.splice(index, random(8), ...Array.from({ length: random(8) }, (_, i) => `new-${step}-${i}`));
      const forward = put(content(next, { revision: step + 1 })), inverse = put(content(old, { revision: step }));
      entries.push(storage.store(String(step), "edit", forward, inverse)); expected.push(forward, inverse); value = next;
    }
    for (let i = 0; i < entries.length; i++) {
      expect(storage.materialize(entries[i].forward)).toEqual(expected[i * 2]);
      expect(storage.materialize(entries[i].inverse)).toEqual(expected[i * 2 + 1]);
    }
    const diagnostics = storage.diagnostics(entries);
    expect(diagnostics.uniqueSlots).toBeLessThan(250 * 2 * 1000 / 4);
    expect(diagnostics.chunkReferences).toBeGreaterThan(diagnostics.uniqueChunks);
  });

  it("shares unchanged 25k sequences and bounds fragmentation across repeated small edits", () => {
    const storage = new UndoStorage(), entries: StoredHistoryEntry[] = [];
    let value = Array.from({ length: 25000 }, (_, i) => `placement-${i}`);
    for (let i = 0; i < 300; i++) {
      const next = [...value]; next.splice([0, 12500, 24999][i % 3], 1, `new-${i}`);
      entries.push(storage.store(String(i), "edit", put(content(next)), put(content(value)))); value = next;
    }
    const result = storage.diagnostics(entries);
    // Structural counts count each shared chunk once, unlike JSON.stringify.
    expect(result.uniqueSlots).toBeLessThan(300 * 2 * 25000 / 50);
    expect(result.chunkReferences / result.sequenceVersions).toBeLessThan(2 * Math.ceil(25000 / 128) + 1);
    expect(storage.materialize(entries.at(-1)!.forward)).toEqual(put(content(value)));
  });

  it("does not chain snapshots and materializes after cache eviction or branch disposal", () => {
    const storage = new UndoStorage(), value = Array.from({ length: 1000 }, (_, i) => `key-${i}`);
    const first = storage.store("one", "edit", put(content(value)), []);
    for (let i = 0; i < 80; i++) storage.store(String(i), "other", put(content([String(i)], { key: `other-${i}` })), []);
    expect(storage.diagnostics([first]).cacheEntries).toBeLessThanOrEqual(32);
    expect(storage.materialize(first.forward)).toEqual(put(content(value)));
    const serialized = JSON.stringify(first);
    expect(serialized).not.toContain("previous");
    expect(serialized).not.toContain("parent");
  });

  it("keeps exact legacy graphs for aliases, sparse/named sequences and special values", () => {
    const storage = new UndoStorage();
    const shared = ["a", "b"], aliased = content(shared, { payload: { alias: shared } });
    const sparse = new Array<string>(3); sparse[1] = "middle";
    const named = ["a"]; Object.assign(named, { extra: "named property" });
    const records = [aliased, content(sparse), content(named), content(["a"], { payload: { date: new Date(0), map: new Map([["key", shared]]), bytes: new Uint8Array([1, 2]) } })];
    for (const record of records) {
      const source = put(record), entry = storage.store("id", "edit", source, source);
      expect(storage.materialize(entry.forward)).toEqual(clone(source));
    }
    const restored = (storage.materialize(storage.store("a", "edit", put(aliased), []).forward)[0] as any).record;
    expect(restored.payload.alias).toBe(restored.inlineContent);
    const cyclic = put(content(["a"]));
    (cyclic[0] as any).record.payload.operations = cyclic;
    const restoredCycle = storage.materialize(storage.store("c", "edit", cyclic, []).forward);
    expect((restoredCycle[0] as any).record.payload.operations).toBe(restoredCycle);
  });
});
