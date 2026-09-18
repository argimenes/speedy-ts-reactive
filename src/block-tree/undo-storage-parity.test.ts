import { afterEach, describe, expect, it, vi } from "vitest";
import { clone } from "./clone";
import * as ids from "./ids";
import { CanonicalRepository } from "./repository";
import { setupCaptureSpike } from "./test-support/captured-replay";
import type { ExistingBlockDto, HistoryEntry, RepositoryOperation } from "./types";

afterEach(() => vi.restoreAllMocks());

/** The reference keeps the pre-optimization full-operation history representation.
 * Both repositories execute the same commit/undo implementation; only storage differs.
 * Commands run once so that generated content/placement/block identities are identical.
 */
function paired(dto?: ExistingBlockDto) {
  const s = setupCaptureSpike(dto);
  const reference = new CanonicalRepository(s.baseline, { enforceBlockIdentity: true });
  const internals = (repository: CanonicalRepository) => repository as unknown as {
    historyStorage: {
      store: (commitId: string, label: string, forward: RepositoryOperation[], inverse: RepositoryOperation[]) => unknown;
      materialize: (operations: unknown) => RepositoryOperation[];
    };
    undoStack: HistoryEntry[];
    redoStack: HistoryEntry[];
  };
  internals(reference).historyStorage.store = (commitId, label, forward, inverse) => ({
    commitId, label, forward: clone(forward), inverse: clone(inverse),
  });
  let nextId = 0;
  vi.spyOn(ids, "createCommitId").mockImplementation(() => `parity-commit-${++nextId}`);
  const observed = (repository: CanonicalRepository) => {
    const events: unknown[] = [], errors: unknown[] = [], changes: unknown[] = [];
    const event = (value: unknown) => {
      const copy = clone(value) as Record<string, unknown>;
      delete copy.timestamp;
      events.push(copy);
    };
    repository.subscribeCommits(event, error => errors.push(String(error)));
    repository.subscribeHistoryChanges(event, error => errors.push(String(error)));
    repository.subscribeChanges(change => changes.push(clone({ ...change, previousContents: [...change.previousContents] })));
    return { events, errors, changes };
  };
  const actual = observed(s.repository), expected = observed(reference);
  let checkedEvents = 0, checkedChanges = 0;
  const stacks = (repository: CanonicalRepository) => {
    const value = internals(repository);
    const materialize = (entry: HistoryEntry) => ({ ...entry,
      forward: value.historyStorage.materialize(entry.forward),
      inverse: value.historyStorage.materialize(entry.inverse),
    });
    return { undo: value.undoStack.map(materialize), redo: value.redoStack.map(materialize) };
  };
  const check = () => {
    expect(s.repository.snapshot()).toEqual(reference.snapshot());
    expect(s.repository.canUndo()).toBe(reference.canUndo());
    expect(s.repository.canRedo()).toBe(reference.canRedo());
    expect(stacks(s.repository)).toEqual(stacks(reference));
    expect(actual.events.length).toBe(expected.events.length);
    expect(actual.events.slice(checkedEvents)).toEqual(expected.events.slice(checkedEvents));
    expect(actual.changes.length).toBe(expected.changes.length);
    expect(actual.changes.slice(checkedChanges)).toEqual(expected.changes.slice(checkedChanges));
    expect(actual.errors).toEqual(expected.errors);
    checkedEvents = actual.events.length; checkedChanges = actual.changes.length;
    expect(s.errors).toEqual([]);
    for (const key of Object.keys(reference.readState().contents)) {
      expect(s.repository.contentReferenceCount(key)).toBe(reference.contentReferenceCount(key));
    }
    for (const key of Object.keys(reference.readState().placements)) {
      expect(s.repository.locationOf(key)).toEqual(reference.locationOf(key));
    }
  };
  const attempt = (action: () => unknown) => {
    try { action(); return undefined; } catch (error) { return String(error); }
  };
  const both = (action: (repository: CanonicalRepository) => unknown) => {
    const beforeId = nextId;
    const actualError = attempt(() => action(s.repository));
    const afterId = nextId;
    nextId = beforeId;
    const expectedError = attempt(() => action(reference));
    expect(nextId).toBe(afterId);
    expect(actualError).toEqual(expectedError);
    check();
    return actualError;
  };
  const command = (action: () => unknown) => {
    const calls: Parameters<CanonicalRepository["commit"]>[] = [];
    const original = s.repository.commit.bind(s.repository);
    const spy = vi.spyOn(s.repository, "commit").mockImplementation((...args) => {
      calls.push(clone(args));
      return original(...args);
    });
    const beforeId = nextId;
    const actualError = attempt(action);
    spy.mockRestore();
    const afterId = nextId;
    nextId = beforeId;
    const expectedError = attempt(() => { for (const args of calls) reference.commit(...args); });
    expect(nextId).toBe(afterId);
    expect(actualError).toEqual(expectedError);
    check();
    return actualError;
  };
  const cycle = () => {
    while (s.repository.canUndo()) both(repository => repository.undo());
    // Empty-stack calls are part of the original behavior too.
    both(repository => repository.undo());
    while (s.repository.canRedo()) both(repository => repository.redo());
    both(repository => repository.redo());
  };
  return { ...s, reference, command, both, check, cycle };
}

describe("ordinary undo storage semantic parity with full-operation snapshots", () => {
  it.each([7129, 0x12345678, 0xdeadbeef])("preserves every intermediate Unicode edit, counter and branch for seed %i", seed => {
    const s = paired({ type: "document-block", children: [{ id: "p", type: "standoff-editor-block", text: "a😀é漢字abcdef", standoffProperties: [{ id: "bold", type: "style/bold", start: 1, end: 5 }] }] });
    const random = (limit: number) => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % limit; };
    for (let step = 0; step < 50; step++) {
      const choice = random(10);
      if (choice === 0) s.both(repository => repository.undo());
      else if (choice === 1) s.both(repository => repository.redo());
      else {
        const length = s.block("p").inlineContent.length;
        const start = random(length + 1), end = Math.min(length, start + random(4));
        s.command(() => s.commands.replaceInlineRange(s.block("p").key, start, end, ["", "a", "😀", "é", "漢字"][random(5)]));
      }
    }
    s.cycle();
    for (let i = 0; i < 7; i++) s.both(repository => repository.undo());
    s.command(() => s.commands.replaceInlineRange(s.block("p").key, 0, 0, "branch"));
    expect(s.repository.canRedo()).toBe(false);
    s.both(repository => repository.redo());
    s.cycle();
    s.view.dispose();
  });

  it("restores exact recorded operations after unrecorded writes and owns caller data", () => {
    const s = paired();
    const key = s.block("p").contentKey;
    s.command(() => s.commands.replaceInlineRange(s.block("p").key, 1, 2, "X"));
    const recorded = clone(s.repository.readState().contents[key]);
    s.both(repository => {
      const record = clone(repository.readState().contents[key]);
      record.payload.unrecorded = { nested: ["must disappear"] };
      record.inlineContent.reverse(); record.inlineRevision += 73;
      repository.commit("unrecorded divergence", [{ kind: "put-content", record }], false);
    });
    s.both(repository => repository.undo());
    expect(s.repository.readState().contents[key].payload).not.toHaveProperty("unrecorded");
    // An unrecorded commit must also leave the redo branch intact.
    s.both(repository => {
      const record = clone(repository.readState().contents[key]);
      record.payload.other = "also disappears";
      repository.commit("unrecorded while redo exists", [{ kind: "put-content", record }], false);
    });
    expect(s.repository.canRedo()).toBe(true);
    s.both(repository => repository.redo());
    expect(s.repository.readState().contents[key].payload).toEqual(recorded.payload);
    expect(s.repository.readState().contents[key].inlineContent).toEqual(recorded.inlineContent);
    const record = { ...clone(s.repository.readState().contents[key]), futureField: { nested: ["owned"] } };
    record.payload.extra = { nested: ["owned"] };
    const operations: RepositoryOperation[] = [{ kind: "put-content", record }];
    s.both(repository => repository.commit("caller-owned values", operations));
    record.futureField.nested.push("caller mutation");
    (record.payload.extra as { nested: string[] }).nested.push("caller mutation");
    record.inlineContent.reverse(); operations.length = 0;
    s.cycle();
    expect((s.repository.readState().contents[key] as typeof record).futureField).toEqual({ nested: ["owned"] });
    s.view.dispose();
  });

  it("preserves general operations, repeated writes, explicit counters and field presence", () => {
    const s = paired();
    const key = s.block("p").contentKey;
    s.both(repository => {
      const first = clone(repository.readState().contents[key]);
      first.payload.explicitUndefined = undefined; first.payload.nullable = null;
      first.inlineRevision += 7; first.revision += 42;
      const last = clone(first); delete last.payload.nullable; delete last.inlineKind;
      last.revision = 100;
      repository.commit("repeated writes", [{ kind: "put-content", record: first }, { kind: "put-content", record: last }]);
    });
    s.both(repository => {
      const record = clone(repository.readState().contents[key]);
      repository.commit("nonempty identical write", [{ kind: "put-content", record }]);
    });
    s.both(repository => repository.commit("empty", []));
    s.cycle();
    s.view.dispose();
    s.both(repository => {
      const root = clone(repository.readState().placements[repository.readState().rootPlacementKey]);
      repository.commit("replace root placement", [
        { kind: "put-placement", record: { ...root, key: "parity-new-root" } },
        { kind: "set-root", key: "parity-new-root" }, { kind: "remove-placement", key: root.key },
      ]);
    });
    s.cycle();
  });

  it("preserves split/join, moves/copies, shared content, annotations, inline atoms and transactions", () => {
    const s = paired({ id: "doc", type: "document-block", linkedAnnotations: { linked: { type: "codex/entity-reference", value: "entity:1" } }, children: [
      { id: "A", type: "container-block" }, { id: "B", type: "container-block", children: [
        { id: "p", type: "standoff-editor-block", text: "abcdef", standoffProperties: [{ id: "segment", annotationId: "linked", start: 1, end: 3 }] },
      ] },
    ] });
    s.command(() => s.commands.move(s.block("p").key, { kind: "at", parentKey: s.block("A").key, index: 0 }));
    s.command(() => s.commands.copy(s.block("p").key, { kind: "at", parentKey: s.block("B").key, index: 0 }));
    s.command(() => s.commands.setRelation(s.block("p").key, "rightMargin", { type: "right-margin-block", children: [] }));
    s.command(() => s.commands.editStandoffProperty(s.block("p").key, 0, { id: "segment", annotationId: "linked", start: 1, end: 3 }, { start: 1, end: 3, value: "entity:2" }));
    let reference = "", right = "";
    s.command(() => { reference = s.commands.transclude(s.block("p").key, { kind: "at", parentKey: s.block("B").key, index: 0 }); });
    s.command(() => s.commands.unlink(reference));
    s.command(() => s.commands.insertInlineImage(s.block("p").key, 3, { assetId: "image", src: "/image.png", alt: "picture" }));
    s.command(() => { right = s.commands.splitStandoff(s.block("p").key, 2); });
    s.command(() => s.commands.joinStandoff(s.block("p").key, right));
    s.command(() => s.commands.transaction("outer", () => {
      s.commands.setPayloadField(s.block("p").key, "extra", "first");
      s.commands.transaction("inner", () => s.commands.setPayloadField(s.block("p").key, "extra", "last"), { commandId: "test.inner", subjects: [] });
    }, { commandId: "test.outer", subjects: [] }));
    s.cycle();
    s.view.dispose();
  });

  it("preserves rejected edits, aborted commands and stack recovery before/after commit exceptions", () => {
    const s = paired();
    s.command(() => s.commands.replaceInlineRange(s.block("p").key, 0, 1, "X"));
    expect(s.both(repository => repository.commit("invalid", [{ kind: "set-root", key: "missing" }]))).toContain("Missing root");
    expect(() => s.commands.transaction("abort", () => {
      s.commands.setPayloadField(s.block("p").key, "extra", "draft"); throw new Error("abort");
    })).toThrow("abort");
    s.check();
    const failBefore = [s.repository, s.reference].map(repository => repository.subscribeBeforeChanges(() => { throw new Error("before mutation"); }));
    expect(s.both(repository => repository.undo())).toContain("before mutation");
    failBefore.forEach(stop => stop());
    s.both(repository => repository.undo());
    const failRedo = [s.repository, s.reference].map(repository => repository.subscribeBeforeChanges(() => { throw new Error("before redo"); }));
    expect(s.both(repository => repository.redo())).toContain("before redo");
    failRedo.forEach(stop => stop());
    const failAfter = [s.repository, s.reference].map(repository => repository.subscribeChanges(() => { throw new Error("after mutation"); }));
    expect(s.both(repository => repository.redo())).toContain("after mutation");
    expect(s.both(repository => repository.undo())).toContain("after mutation");
    failAfter.forEach(stop => stop());
    s.cycle();
    s.view.dispose();
  });
});
