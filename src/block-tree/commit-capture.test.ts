import { describe, expect, it, vi } from "vitest";
import { clone } from "./clone";
import type { RepositoryOperation, RepositoryState } from "./types";
import { applyCapturedCommitForTest, setupCaptureSpike } from "./test-support/captured-replay";

describe("repository commit results", () => {
  it("links undo and redo to an edit made before capture was subscribed", () => {
    const s = setupCaptureSpike();
    s.unsubscribe();
    s.commands.replaceInlineRange(s.block("p").key, 1, 2, "X");
    expect(s.events).toEqual([]);
    const baseline = s.repository.snapshot();
    const stop = s.repository.subscribeCommits(event => s.events.push(event), error => s.errors.push(error));
    s.repository.undo();
    let replay = applyCapturedCommitForTest(baseline, s.events[0]);
    expect(replay).toEqual(s.repository.snapshot());
    s.repository.redo();
    replay = applyCapturedCommitForTest(replay, s.events[1]);
    expect(replay).toEqual(s.repository.snapshot());
    const undo = s.events[0].cause, redo = s.events[1].cause;
    expect(undo.kind).toBe("undo"); expect(redo.kind).toBe("redo");
    if (undo.kind === "edit" || redo.kind === "edit") throw new Error("Missing source commit");
    expect(undo.sourceCommitId).toBe(redo.sourceCommitId);
    expect(new Set([undo.sourceCommitId, ...s.events.map(event => event.commitId)]).size).toBe(3);
    expect(s.errors).toEqual([]);
    stop(); s.view.dispose();
  });

  it("replays final records through typing, split, empty insertion, general edits and undo/redo", () => {
    const s = setupCaptureSpike();
    let replay = clone(s.baseline);
    const check = (action: () => void) => {
      const count = s.events.length; action();
      expect(s.errors).toEqual([]);
      expect(s.events).toHaveLength(count + 1);
      replay = applyCapturedCommitForTest(replay, s.events.at(-1)!);
      expect(replay).toEqual(s.repository.snapshot());
    };
    check(() => s.commands.replaceInlineRange(s.block("p").key, 1, 2, "😀é"));
    let right = "";
    check(() => { right = s.commands.splitStandoff(s.block("p").key, 3); });
    check(() => { s.commands.insertEmptyStandoffSibling(s.block("q").key, "after"); });
    check(() => s.commands.move(right, { kind: "after", anchorKey: s.block("q").key }));
    check(() => s.commands.setPayloadField(s.block("p").key, "extra", { unknown: null }));
    for (let i = 0; i < 5; i++) check(() => s.repository.undo());
    for (let i = 0; i < 5; i++) check(() => s.repository.redo());
    expect(s.events.reduce(applyCapturedCommitForTest, clone(s.baseline))).toEqual(replay);
    expect(new Set(s.events.map(e => e.commitId)).size).toBe(s.events.length);
    expect(s.events[5].cause).toEqual({ kind: "undo", sourceCommitId: s.events[4].commitId });
    expect(s.events[10].cause).toEqual({ kind: "redo", sourceCommitId: s.events[0].commitId });
  });

  it("coalesces repeated record writes and captures set-root, deletes and non-undo commits", () => {
    const s = setupCaptureSpike();
    const content = clone(s.repository.readState().contents[s.block("p").contentKey]);
    const first = { ...clone(content), payload: { ...content.payload, extra: "first" } };
    const last = { ...clone(content), payload: { ...content.payload, extra: "last" } };
    s.repository.commit("opaque direct caller", [{ kind: "put-content", record: first }, { kind: "put-content", record: last }], false);
    expect(s.events[0].undoRecorded).toBe(false);
    expect(s.events[0].contents).toHaveLength(1);
    expect(s.events[0].contents[0].before).toEqual(content);
    expect(s.events[0].commands[0].commandId).toBe("repository.commit");
    let replay = applyCapturedCommitForTest(s.baseline, s.events[0]);
    expect(replay).toEqual(s.repository.snapshot());
    const originalRoot = replay.rootPlacementKey;
    const originalRootRecord = replay.placements[originalRoot];
    // Projections deliberately target a fixed placement. This raw repository
    // operation is tested without a view still mounted on the removed root.
    s.view.dispose();
    s.repository.commit("change root placement", [
      { kind: "put-placement", record: { ...originalRootRecord, key: "new-root" } },
      { kind: "set-root", key: "new-root" }, { kind: "remove-placement", key: originalRoot },
    ]);
    replay = applyCapturedCommitForTest(replay, s.events[1]);
    expect(replay).toEqual(s.repository.snapshot());
    expect(s.events[1].placements.find(d => d.key === originalRoot)?.before).toEqual(originalRootRecord);
  });

  it("captures nested transactions once, and excludes invalid, aborted and command-level no-ops", () => {
    const s = setupCaptureSpike();
    const key = s.block("p").key;
    s.repository.commit("empty", []);
    s.commands.move(key, { kind: "before", anchorKey: key });
    expect(() => s.commands.transaction("abort", () => {
      s.commands.setPayloadField(key, "extra", "draft"); throw new Error("abort");
    })).toThrow("abort");
    const invalid: RepositoryOperation[] = [{ kind: "set-root", key: "missing" }];
    expect(() => s.repository.commit("invalid", invalid)).toThrow();
    expect(s.events).toEqual([]);
    expect(s.repository.snapshot()).toEqual(s.baseline);
    s.commands.transaction("outer", () => {
      s.commands.setPayloadField(key, "extra", "first");
      s.commands.transaction("inner", () => s.commands.setPayloadField(key, "extra", "last"), { commandId: "test.inner", subjects: [] });
    }, { commandId: "test.outer", subjects: [] });
    expect(s.events).toHaveLength(1);
    expect(s.events[0].commands.map(c => c.commandId)).toEqual(["test.outer", "tree.setPayloadField", "test.inner", "tree.setPayloadField"]);
    expect(applyCapturedCommitForTest(s.baseline, s.events[0])).toEqual(s.repository.snapshot());
    const same = clone(s.repository.readState().contents[s.block("p").contentKey]);
    s.repository.commit("nonempty no difference", [{ kind: "put-content", record: same }]);
    expect(s.events).toHaveLength(2);
    expect(s.events[1].contents).toEqual([]);
  });

  it("isolates capture observers, freezes nested values, blocks reentrancy, and unsubscribes", () => {
    const s = setupCaptureSpike();
    const error = vi.fn();
    const unsubscribe = s.repository.subscribeCommits(event => {
      (event.contents[0].after!.payload as Record<string, unknown>).extra = "corrupt";
    }, error);
    const reentrant = vi.fn();
    const stop = s.repository.subscribeCommits(() => s.repository.undo(), reentrant);
    const stopThrow = s.repository.subscribeCommits(() => { throw new Error("observer"); }, () => { throw new Error("reporter"); });
    const last = vi.fn(); s.repository.subscribeCommits(last, error);
    s.commands.setPayloadField(s.block("p").key, "extra", { nested: ["original"] });
    const first = s.events[0], original = clone(first);
    expect(Object.isFrozen(first.contents[0].after!.payload.extra)).toBe(true);
    expect(error).toHaveBeenCalledOnce(); expect(reentrant).toHaveBeenCalledOnce(); expect(last).toHaveBeenCalledOnce();
    expect(s.repository.canUndo()).toBe(true);
    unsubscribe(); stop(); stopThrow();
    s.commands.setPayloadField(s.block("p").key, "extra", { nested: ["new"] });
    expect(first).toEqual(original);
    expect(error).toHaveBeenCalledOnce();
    s.unsubscribe(); s.repository.undo();
    expect(s.events).toHaveLength(2);
  });

  it("preserves stack entries when undo/redo validation fails and records before legacy observer failure", () => {
    const s = setupCaptureSpike();
    s.commands.replaceInlineRange(s.block("p").key, 0, 1, "X");
    const fail = s.repository.subscribeBeforeChanges(() => { throw new Error("before mutation"); });
    expect(() => s.repository.undo()).toThrow("before mutation");
    expect(s.repository.canUndo()).toBe(true); expect(s.repository.canRedo()).toBe(false); expect(s.events).toHaveLength(1);
    fail(); s.repository.undo();
    const failRedo = s.repository.subscribeBeforeChanges(() => { throw new Error("before redo"); });
    expect(() => s.repository.redo()).toThrow("before redo"); expect(s.repository.canRedo()).toBe(true);
    failRedo();
    const legacy = s.repository.subscribeChanges(() => { throw new Error("legacy after mutation"); });
    expect(() => s.repository.redo()).toThrow("legacy after mutation");
    expect(s.events).toHaveLength(3); expect(s.repository.canUndo()).toBe(true); expect(s.repository.canRedo()).toBe(false);
    legacy();
    s.repository.undo();
    s.commands.replaceInlineRange(s.block("p").key, 0, 1, "Y");
    expect(s.repository.canRedo()).toBe(false);
    expect(s.events.reduce(applyCapturedCommitForTest, clone(s.baseline))).toEqual(s.repository.snapshot());
  });

  it("replays every intermediate Unicode edit, undo/redo and branch deterministically", () => {
    const s = setupCaptureSpike({ type: "document-block", children: [{ id: "p", type: "standoff-editor-block", text: "a😀é漢字abcdef", standoffProperties: [{ id: "bold", type: "style/bold", start: 1, end: 5 }] }] });
    let replay = clone(s.baseline), seed = 7129;
    const states: RepositoryState[] = [];
    const random = (limit: number) => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed % limit; };
    const check = (action: () => void) => {
      const count = s.events.length; action();
      // A randomly generated empty replacement can legitimately be a no-op.
      for (const event of s.events.slice(count)) {
        replay = applyCapturedCommitForTest(replay, event);
        expect(replay).toEqual(s.repository.snapshot()); states.push(clone(replay));
      }
    };
    for (let step = 0; step < 60; step++) {
      const start = random(s.block("p").inlineContent.length + 1);
      const end = Math.min(s.block("p").inlineContent.length, start + random(4));
      check(() => s.commands.replaceInlineRange(s.block("p").key, start, end, ["", "a", "😀", "é", "漢字"][random(5)]));
    }
    for (let i = 0; i < 15; i++) check(() => s.repository.undo());
    for (let i = 0; i < 10; i++) check(() => s.repository.redo());
    check(() => s.commands.replaceInlineRange(s.block("p").key, 0, 0, "branch"));
    expect(s.repository.canRedo()).toBe(false);
    let second = clone(s.baseline);
    s.events.forEach((event, i) => { second = applyCapturedCommitForTest(second, event); expect(second).toEqual(states[i]); });
    expect(s.errors).toEqual([]);
  });

  it("exactly replays moved children, margins, linked annotations, shared content, pruning and inline atoms", () => {
    const s = setupCaptureSpike({ id: "doc", type: "document-block", linkedAnnotations: {
      linked: { id: "linked", type: "codex/entity-reference", value: "entity:1", extra: null },
    }, children: [
      { id: "A", type: "container-block", children: null },
      { id: "B", type: "container-block", children: [
        { id: "B1", type: "standoff-editor-block", text: "abcdefgh", standoffProperties: [{ id: "segment", annotationId: "linked", type: "codex/entity-reference", start: 1, end: 3 }], relation: { leftMargin: { type: "left-margin-block", children: [{ type: "plain-text-block", text: "margin", unknown: null }] }, opaque: { nested: [null, { id: "foreign" }] } } },
        { id: "B2", type: "standoff-editor-block", text: "more" },
      ] },
      { id: "C", type: "container-block" },
    ] });
    const states: RepositoryState[] = []; let replay = clone(s.baseline);
    const check = (action: () => void) => {
      const count = s.events.length; action(); expect(s.events).toHaveLength(count + 1);
      replay = applyCapturedCommitForTest(replay, s.events.at(-1)!);
      expect(replay).toEqual(s.repository.snapshot()); states.push(clone(replay));
    };
    check(() => s.commands.move(s.block("B1").key, { kind: "at", parentKey: s.block("A").key, index: 0 }));
    expect(s.events.at(-1)!.commands[0]).toMatchObject({ commandId: "tree.move", subjects: [{ blockId: "B1" }] });
    check(() => s.commands.move(s.block("B").key, { kind: "at", parentKey: s.block("C").key, index: 0 }));
    check(() => s.commands.setRelation(s.block("B2").key, "rightMargin", { type: "right-margin-block", children: [] }));
    check(() => s.commands.editStandoffProperty(s.block("B1").key, 0, { id: "segment", annotationId: "linked", type: "codex/entity-reference", start: 1, end: 3 }, { start: 1, end: 3, value: "entity:2" }));
    let reference = "";
    check(() => { reference = s.commands.transclude(s.block("B1").key, { kind: "at", parentKey: s.block("C").key, index: 1 }); });
    const shared = s.block("B1").contentKey;
    check(() => s.commands.unlink(reference));
    expect(s.events.at(-1)!.contents.some(delta => delta.key === shared && delta.after === null)).toBe(false);
    check(() => s.commands.insertInlineImage(s.block("B1").key, 3, { assetId: "image", src: "/image.png", alt: "picture", width: 80 }));
    let right = "";
    check(() => { right = s.commands.splitStandoff(s.block("B1").key, 2); });
    check(() => s.commands.joinStandoff(s.block("B1").key, right));
    check(() => s.commands.remove(s.block("A").key));
    expect(s.events.at(-1)!.contents.some(delta => delta.key === shared && delta.after === null)).toBe(true);
    for (let i = 0; i < 10; i++) check(() => s.repository.undo());
    for (let i = 0; i < 10; i++) check(() => s.repository.redo());
    let second = clone(s.baseline);
    s.events.forEach((event, i) => { second = applyCapturedCommitForTest(second, event); expect(second).toEqual(states[i]); });
    expect(s.errors).toEqual([]);
  });

  it("owns operation data, reports preparation failure without rolling back edits, and coalesces transient records", () => {
    const s = setupCaptureSpike();
    const content = clone(s.repository.readState().contents[s.block("p").contentKey]);
    content.payload.extra = { values: ["original"] };
    s.repository.commit("caller data", [{ kind: "put-content", record: content }]);
    const captured = clone(s.events[0]);
    (content.payload.extra as { values: string[] }).values.push("later");
    expect(s.events[0]).toEqual(captured);
    const transient = { ...clone(content), key: "transient", payload: { id: "transient" }, inlineContent: [] };
    s.repository.commit("transient", [{ kind: "put-content", record: transient }, { kind: "remove-content", key: transient.key }]);
    expect(s.events[1].contents).toEqual([]);
    const broken = clone(s.repository.readState().contents[s.block("p").contentKey]); broken.payload.extra = "committed";
    const metadata = { commands: [{ commandId: "not cloneable", subjects: [], unexpected: () => undefined }] };
    s.repository.commit("capture preparation fails", [{ kind: "put-content", record: broken }], true, metadata);
    expect(s.errors).toHaveLength(1);
    expect(s.events).toHaveLength(2);
    expect(s.repository.readState().contents[broken.key].payload.extra).toBe("committed");
    s.repository.undo(); expect(s.events).toHaveLength(3);
  });

  it("never snapshots, serializes or enumerates the whole graph for strict captured typing and Enter", () => {
    const s = setupCaptureSpike({ type: "document-block", children: Array.from({ length: 30 }, (_, i) => ({ id: `p${i}`, type: "standoff-editor-block", text: "x".repeat(100) })) });
    const key = s.block("p0").key, state = s.repository.readState();
    const unrelated = new Set(Object.values(state.contents).filter(c => c.viewType === "standoff-editor-block" && c.payload.id !== "p0").map(c => c.key));
    const snapshot = vi.spyOn(s.repository, "snapshot"), stringify = vi.spyOn(JSON, "stringify");
    const enumerators = [vi.spyOn(Object, "keys"), vi.spyOn(Object, "values"), vi.spyOn(Object, "entries")];
    try {
      s.commands.replaceInlineRange(key, 1, 1, "a"); s.repository.undo(); s.repository.redo();
      s.commands.insertEmptyStandoffSibling(key, "after"); s.repository.undo(); s.repository.redo();
      s.commands.splitStandoff(key, 50); s.repository.undo(); s.repository.redo();
      expect(snapshot).not.toHaveBeenCalled();
      // Existing validators compare individual records with JSON.stringify;
      // the gate forbids whole-graph serialization, not those bounded checks.
      expect(stringify.mock.calls.some(([value]) => value === state || value === state.contents || value === state.placements ||
        (value && typeof value === "object" && "contents" in value && "placements" in value))).toBe(false);
      for (const enumerator of enumerators) expect(enumerator.mock.calls.some(([value]) => value === state.contents || value === state.placements)).toBe(false);
      expect(s.events).toHaveLength(9);
      expect(s.errors).toEqual([]);
      expect(s.events.every(event => !event.contents.some(delta => unrelated.has(delta.key)))).toBe(true);
    } finally {
      snapshot.mockRestore(); stringify.mockRestore(); enumerators.forEach(spy => spy.mockRestore());
    }
  });
});
