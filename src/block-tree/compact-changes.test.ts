import { describe, expect, it, vi } from "vitest";
import { clone } from "./clone";
import * as capture from "./commit-capture";
import * as compact from "./compact-changes";
import { applyHistoryChanges } from "../history/replay";
import { setupCaptureSpike } from "./test-support/captured-replay";
import type { DeepReadonly } from "./commit-capture";

describe("compact exact capture", () => {
  it("replays margins, linked definitions, shared placements, inline images, joins, pruning and root replacement", () => {
    const s = setupCaptureSpike({ id: "doc", type: "document-block", linkedAnnotations: { linked: { type: "codex/entity-reference", value: "entity:1" } }, children: [
      { id: "A", type: "container-block" }, { id: "B", type: "container-block", children: [
        { id: "p", type: "standoff-editor-block", text: "abcdef", standoffProperties: [{ id: "segment", annotationId: "linked", start: 1, end: 3 }], relation: { leftMargin: { type: "left-margin-block", children: [{ type: "plain-text-block", text: "margin" }] }, opaque: { nested: [null, { id: "foreign" }] } } },
      ] },
    ] });
    let replay = clone(s.baseline), count = 0;
    s.repository.subscribeHistoryChanges(event => {
      replay = applyHistoryChanges(replay, event); expect(replay).toEqual(s.repository.snapshot()); count++;
    }, error => s.errors.push(error));
    s.commands.move(s.block("p").key, { kind: "at", parentKey: s.block("A").key, index: 0 });
    s.commands.setRelation(s.block("p").key, "rightMargin", { type: "right-margin-block", children: [] });
    s.commands.editStandoffProperty(s.block("p").key, 0, { id: "segment", annotationId: "linked", start: 1, end: 3 }, { start: 1, end: 3, value: "entity:2" });
    const reference = s.commands.transclude(s.block("p").key, { kind: "at", parentKey: s.block("B").key, index: 0 });
    s.commands.unlink(reference);
    s.commands.insertInlineImage(s.block("p").key, 3, { assetId: "image", src: "/image.png", alt: "picture" });
    const right = s.commands.splitStandoff(s.block("p").key, 2);
    s.commands.joinStandoff(s.block("p").key, right);
    s.commands.remove(s.block("A").key);
    for (let i = 0; i < 9; i++) s.repository.undo();
    for (let i = 0; i < 9; i++) s.repository.redo();
    expect(count).toBe(27);
    const root = clone(s.repository.readState().placements[s.repository.readState().rootPlacementKey]); s.view.dispose();
    s.repository.commit("root", [{ kind: "put-placement", record: { ...root, key: "new-root" } }, { kind: "set-root", key: "new-root" }, { kind: "remove-placement", key: root.key }]);
    const content = clone(s.repository.readState().contents[root.contentKey]);
    const transient = { ...content, key: "transient", children: [], payload: { id: "transient" } };
    s.repository.commit("transient", [{ kind: "put-content", record: transient }, { kind: "remove-content", key: "transient" }]);
    expect(replay).toEqual(s.repository.snapshot()); expect(s.errors).toEqual([]);
  });

  it("uses exact full fallback for unknown canonical fields and owns nested changed values", () => {
    const s = setupCaptureSpike(); let event!: DeepReadonly<compact.HistoryChanges>;
    s.repository.subscribeHistoryChanges(value => { event = value; }, error => s.errors.push(error));
    const record = { ...clone(s.repository.readState().contents[s.block("p").contentKey]), futureField: { nested: ["original"] } };
    s.repository.commit("future field", [{ kind: "put-content", record }]);
    expect(event.contents[0].kind).toBe("record-content");
    record.futureField.nested.push("caller mutation");
    expect(applyHistoryChanges(s.baseline, event)).toEqual(s.repository.snapshot());
    expect(Object.isFrozen(event.contents[0])).toBe(true); expect(s.errors).toEqual([]); s.view.dispose();
  });

  it("matches full capture and every live revision through text, structure and undo", () => {
    const s = setupCaptureSpike();
    let replay = clone(s.baseline);
    const events: DeepReadonly<compact.HistoryChanges>[] = [];
    s.repository.subscribeHistoryChanges(event => {
      events.push(event); replay = applyHistoryChanges(replay, event);
      expect(replay).toEqual(s.repository.snapshot());
      const { contents, placements, format, version, ...envelope } = event;
      const { contents: fullContents, placements: fullPlacements, ...fullEnvelope } = s.events.at(-1)!;
      expect(envelope).toEqual(fullEnvelope);
    }, error => s.errors.push(error));
    s.commands.replaceInlineRange(s.block("p").key, 1, 2, "😀é漢字");
    const right = s.commands.splitStandoff(s.block("p").key, 3);
    s.commands.move(right, { kind: "after", anchorKey: s.block("q").key });
    s.commands.insertEmptyStandoffSibling(s.block("q").key, "after");
    s.commands.setPayloadField(s.block("p").key, "extra", { unknown: null });
    for (let i = 0; i < 5; i++) s.repository.undo();
    for (let i = 0; i < 5; i++) s.repository.redo();
    let seed = 7129;
    const random = (n: number) => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed % n; };
    for (let i = 0; i < 60; i++) {
      const length = s.block("p").inlineContent.length, start = random(length + 1);
      s.commands.replaceInlineRange(s.block("p").key, start, Math.min(length, start + random(4)), ["", "😀", "é", "漢字"][random(4)]);
    }
    for (let i = 0; i < 10; i++) s.repository.undo();
    for (let i = 0; i < 5; i++) s.repository.redo();
    s.commands.replaceInlineRange(s.block("p").key, 0, 0, "branch");
    expect(s.repository.canRedo()).toBe(false);
    expect(events.reduce((state, event) => applyHistoryChanges(state, event), clone(s.baseline))).toEqual(replay);
    expect(s.errors).toEqual([]); s.view.dispose();
  });

  it("covers extra payload fields and counters even on the inline route, including presence", () => {
    const s = setupCaptureSpike(); let replay = clone(s.baseline);
    s.repository.subscribeHistoryChanges(event => { replay = applyHistoryChanges(replay, event); }, error => s.errors.push(error));
    const record = clone(s.repository.readState().contents[s.block("p").contentKey]);
    record.payload.nullable = null; record.payload.undefined = undefined; record.inlineRevision += 7; record.revision += 42;
    s.repository.commit("direct", [{ kind: "put-content", record }]);
    expect(replay).toEqual(s.repository.snapshot());
    const next = clone(record); delete next.payload.nullable; delete next.payload.undefined; delete next.inlineKind;
    s.repository.commit("general", [{ kind: "put-content", record: next }, { kind: "put-content", record: { ...next, revision: 100 } }]);
    expect(replay).toEqual(s.repository.snapshot()); expect(s.errors).toEqual([]); s.view.dispose();
  });

  it.each([100, 5600, 25000])("copies only changed sequence keys for %i character typing and undo", length => {
    const s = setupCaptureSpike({ id: "doc", type: "document-block", children: [{ id: "p", type: "standoff-editor-block", text: "x".repeat(length) }] });
    s.unsubscribe();
    const full = vi.spyOn(capture, "prepareCommitCapture");
    const events: DeepReadonly<compact.HistoryChanges>[] = [];
    s.repository.subscribeHistoryChanges(event => events.push(event), error => s.errors.push(error));
    s.commands.replaceInlineRange(s.block("p").key, 50, 50, "a"); s.repository.undo(); s.repository.redo();
    expect(full).not.toHaveBeenCalled();
    for (const event of events) {
      const owner = event.contents.find(c => c.key === s.block("p").contentKey)!;
      expect(owner.kind).toBe("patch-content");
      if (owner.kind !== "patch-content") throw new Error("Full owner capture");
      expect(owner.sequences.reduce((n, seq) => n + seq.removed.length + seq.inserted.length, 0)).toBe(1);
      expect(JSON.stringify(event).length).toBeLessThan(4000);
    }
    expect(events.reduce((state, event) => applyHistoryChanges(state, event), clone(s.baseline))).toEqual(s.repository.snapshot());
    expect(s.errors).toEqual([]); full.mockRestore(); s.view.dispose();
  });

  it("reports each format failure independently and blocks mutation from compact callbacks", () => {
    const s = setupCaptureSpike(); const received = vi.fn(), errors = vi.fn();
    s.repository.subscribeHistoryChanges(received, errors);
    const failedFull = vi.spyOn(capture, "prepareCommitCapture").mockImplementationOnce(() => { throw new Error("full"); });
    s.commands.setPayloadField(s.block("p").key, "extra", 1);
    expect(received).toHaveBeenCalledOnce(); expect(s.errors).toHaveLength(1); failedFull.mockRestore();
    const failedCompact = vi.spyOn(compact, "prepareHistoryChanges").mockImplementationOnce(() => { throw new Error("compact"); });
    s.commands.setPayloadField(s.block("p").key, "extra", 2);
    expect(s.events).toHaveLength(1); expect(errors).toHaveBeenCalledOnce(); failedCompact.mockRestore();
    const stop = s.repository.subscribeHistoryChanges(() => s.repository.undo(), errors);
    s.commands.setPayloadField(s.block("p").key, "extra", 3);
    expect(errors).toHaveBeenCalledTimes(2); stop(); s.view.dispose();
  });

  it("rejects stale bases, invalid splices/fields/versions without altering source", () => {
    const s = setupCaptureSpike(); let event!: compact.HistoryChanges;
    s.repository.subscribeHistoryChanges(value => { event = clone(value) as compact.HistoryChanges; }, error => s.errors.push(error));
    s.commands.replaceInlineRange(s.block("p").key, 1, 1, "X");
    const source = clone(s.baseline);
    expect(() => applyHistoryChanges(s.repository.snapshot(), event)).toThrow("base");
    expect(() => applyHistoryChanges(source, { ...event, version: 99 } as unknown as compact.HistoryChanges)).toThrow("version");
    const owner = event.contents.find(c => c.kind === "patch-content")!;
    if (owner.kind !== "patch-content") throw new Error("Expected patch");
    owner.sequences[0].index = -1;
    expect(() => applyHistoryChanges(source, event)).toThrow("Sequence");
    owner.fields.push({ scope: "record", field: "payload.__proto__", before: { present: false }, after: { present: false } });
    expect(() => applyHistoryChanges(source, event)).toThrow("field");
    expect(source).toEqual(s.baseline); s.view.dispose();
  });
});
