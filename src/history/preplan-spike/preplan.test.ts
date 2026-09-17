import { describe, expect, it } from "vitest";
import { clone } from "../../block-tree/clone";
import { decodeDocument } from "../../block-tree/codecs";
import { applyBlockIdentityNormalization, planBlockIdentityNormalization } from "../../block-tree/identity";
import { CanonicalRepository } from "../../block-tree/repository";
import { TreeCommands } from "../../block-tree/commands";
import { resolveLinkedProperty } from "../../block-tree/linked-annotations";
import type { HistoryChanges } from "../../block-tree/compact-changes";
import type { RepositoryState } from "../../block-tree/types";
import { applyHistoryChanges } from "../replay";
import { encodeWire, decodeWire } from "./wire";
import { context, partition, projectTransition } from "./projection";

export function fixture(length = 20) {
  const state = decodeDocument({ id: "workspace", type: "workspace-block", children: [
    { id: "background", type: "canvas-background-block" },
    ...["A", "B", "C"].map(id => ({ id, type: "document-block", metadata: { documentId: `resource-${id}` }, linkedAnnotations: { bold: { type: "style/bold" } },
      children: [{ id: `p-${id}`, type: "standoff-editor-block", text: "x".repeat(length), standoffProperties: [{ id: `annotation-${id}`, annotationId: "bold", start: 0, end: 1 }] }] })),
  ] }).state;
  return applyBlockIdentityNormalization(state, planBlockIdentityNormalization(state));
}
function setup() {
  const repository = new CanonicalRepository(fixture(), { enforceBlockIdentity: true }), commands = new TreeCommands(repository, key => key);
  const key = (id: string) => Object.values(repository.readState().placements).find(p => repository.readState().contents[p.contentKey].payload.id === id)!.key;
  const ctx = context(), local = new Map<string, number>(); let before = repository.snapshot();
  const mirrors = partition(before, ctx).graphs;
  const results: ReturnType<typeof projectTransition>[] = [];
  repository.subscribeHistoryChanges(readonlyEvent => {
    const event = decodeWire(encodeWire(readonlyEvent)) as HistoryChanges, after = repository.snapshot();
    const result = projectTransition(before, after, event, ctx, local); results.push(result);
    for (const r of result.revisions) {
      const replay = applyHistoryChanges(mirrors.get(r.resourceId)!, decodeWire(encodeWire(r.event)) as HistoryChanges);
      const expected = clone(result.after.get(r.resourceId)!); expected.revision = r.event.afterRevision;
      expect(replay).toEqual(expected); mirrors.set(r.resourceId, replay);
    }
    before = after;
  }, error => { throw error; });
  return { repository, commands, key, ctx, local, mirrors, results };
}

describe("pre-plan history wire value experiment", () => {
  it("round-trips own undefined, numeric edge values, tag collisions and hostile property names", () => {
    const value = { absentTest: {}, undefined: undefined, array: [undefined, null, -0, NaN, Infinity, -Infinity],
      nested: { $codexHistoryValue: ["undefined"], other: true }, opaque: JSON.parse('{"__proto__":{"x":1},"constructor":7}') };
    const output = decodeWire(encodeWire(value)); expect(output).toStrictEqual(value);
    expect(Object.hasOwn(output as object, "undefined")).toBe(true); expect(({} as any).x).toBeUndefined();
  });
  it.each([Array(2), new Date(), new Map(), 1n, () => {}, Symbol("x")])("rejects unsupported domain: %s", value => {
    expect(() => encodeWire(value)).toThrow();
  });
  it("rejects cycles/accessors, unknown tags/versions and duplicate-key/noncanonical encodings", () => {
    const cycle: any = {}; cycle.self = cycle; expect(() => encodeWire(cycle)).toThrow("cyclic");
    expect(() => encodeWire({ get x() { throw new Error("executed"); } })).toThrow("accessor");
    expect(() => decodeWire(encodeWire(undefined).replace('"undefined"', '"future"'))).toThrow();
    expect(() => decodeWire(encodeWire({ x: 1 }).replace('"x":1', '"x":0,"x":1'))).toThrow("noncanonical");
    expect(() => decodeWire(encodeWire(null).replace('"version":1', '"version":2'))).toThrow("unsupported");
  });
  it("replays wire checkpoints and every compact revision through structure, rich edits and undo", () => {
    const s = setup(); let replay = decodeWire(encodeWire(s.repository.snapshot())) as RepositoryState;
    s.repository.subscribeHistoryChanges(event => { replay = applyHistoryChanges(replay, decodeWire(encodeWire(event)) as HistoryChanges); expect(replay).toStrictEqual(s.repository.snapshot()); }, error => { throw error; });
    s.commands.replaceInlineRange(s.key("p-A"), 2, 3, "😀é");
    s.commands.setPayloadField(s.key("p-A"), "presentUndefined", undefined);
    s.commands.setPayloadField(s.key("p-A"), "numbers", [-0, NaN, Infinity]);
    s.commands.insertInlineImage(s.key("p-A"), 1, { assetId: "image", src: "/image", alt: "image" });
    s.commands.setRelation(s.key("p-A"), "leftMargin", { type: "left-margin-block", children: [{ type: "plain-text-block", text: "margin" }] });
    const split = s.commands.splitStandoff(s.key("p-A"), 2); s.commands.joinStandoff(s.key("p-A"), split);
    for (let i = 0; i < 7; i++) s.repository.undo();
    for (let i = 0; i < 7; i++) s.repository.redo();
  });
});

describe("pre-plan exact resource projection oracle", () => {
  it("skips Workspace/other-Document edits while preserving exact local replay and source provenance", () => {
    const s = setup();
    s.commands.setPayloadField(s.key("background"), "position", { x: 1 });
    expect(s.results.at(-1)!.revisions).toHaveLength(0);
    s.commands.replaceInlineRange(s.key("p-A"), 1, 1, "a");
    const first = s.results.at(-1)!.revisions[0]; expect(first.sourceBeforeRevision).toBe(1); expect(first.event.beforeRevision).toBe(0);
    s.commands.replaceInlineRange(s.key("p-B"), 1, 1, "b");
    s.commands.move(s.key("A"), { kind: "after", anchorKey: s.key("C") });
    expect(s.results.at(-1)!.revisions).toHaveLength(0);
    s.commands.replaceInlineRange(s.key("p-A"), 2, 2, "a"); s.repository.undo(); s.repository.redo();
    expect(s.local.get("resource-A")).toBe(4); expect(s.local.get("resource-B")).toBe(1);
    expect(s.results.at(-1)!.revisions[0].event.cause.kind).toBe("redo");
  });
  it("handles repeated windows onto a Document as one resource with a synthetic root", () => {
    const s = setup(); s.commands.transclude(s.key("A"), { kind: "after", anchorKey: s.key("B") });
    expect(s.results.at(-1)!.revisions).toHaveLength(0);
    s.commands.replaceInlineRange(s.key("p-A"), 1, 1, "a");
    expect(s.results.at(-1)!.revisions.map(r => r.resourceId)).toEqual(["resource-A"]);
  });
  it("captures before/after deletion membership, surviving references and historical definitions", () => {
    const s = setup(), p = s.key("p-A");
    const ref = s.commands.transclude(p, { kind: "at", parentKey: s.key("A"), index: 1 });
    s.commands.remove(p);
    expect(Object.values(s.mirrors.get("resource-A")!.contents).some(c => c.payload.id === "p-A")).toBe(true);
    s.commands.setPayloadField(s.key("A"), "linkedAnnotations", { bold: { type: "style/italics" } });
    s.commands.unlink(ref); s.repository.undo();
    expect(s.results.every(r => !r.boundaries.length)).toBe(true);
  });
  it("marks cross-resource transfer and shared content as boundaries while an unrelated resource continues", () => {
    const s = setup(); s.commands.move(s.key("p-A"), { kind: "at", parentKey: s.key("B"), index: 0 });
    expect(s.results.at(-1)!.boundaries.sort()).toEqual(["resource-A", "resource-B"]);
    expect(s.results.at(-1)!.revisions).toHaveLength(0);
    s.commands.replaceInlineRange(s.key("p-C"), 1, 1, "safe");
    expect(s.results.at(-1)!.revisions.map(r => r.resourceId)).toEqual(["resource-C"]);
    const t = setup(); t.commands.transclude(t.key("p-A"), { kind: "at", parentKey: t.key("B"), index: 0 });
    expect(t.results.at(-1)!.boundaries.sort()).toEqual(["resource-A", "resource-B"]);
  });
  it("requires explicit ownership for unplaced data and explicit baselines for newly resolved Documents", () => {
    const s = setup(); const record = clone(s.repository.readState().contents[s.repository.readState().placements[s.key("background")].contentKey]);
    record.key = "orphan"; record.payload = { id: "orphan", type: "plain-text-block" }; record.viewType = "plain-text-block";
    s.repository.commit("unattributed", [{ kind: "put-content", record }]);
    expect(s.results.at(-1)!.unassigned).toEqual(["orphan"]);
    s.ctx.unplacedOwners.set("orphan", "resource-C");
    const graphs = partition(s.repository.snapshot(), s.ctx).graphs;
    expect(graphs.get("resource-C")!.contents.orphan).toEqual(s.repository.snapshot().contents.orphan);
    s.commands.insert({ id: "new-doc", type: "document-block", metadata: { documentId: "new-resource" } }, { kind: "after", anchorKey: s.key("C") });
    expect(s.results.at(-1)!.boundaries).toContain("new-resource");
  });

  it("exposes the unresolved Workspace-root definition dependency instead of claiming complete semantic projection", () => {
    const s = setup(), property = { annotationId: "bold", start: 0, end: 1 };
    s.commands.setPayloadField(s.repository.readState().rootPlacementKey, "linkedAnnotations", { bold: { type: "codex/entity-reference", value: "before" } });
    const sourceBefore = resolveLinkedProperty(s.repository.readState(), property);
    s.commands.setPayloadField(s.repository.readState().rootPlacementKey, "linkedAnnotations", { bold: { type: "codex/entity-reference", value: "after" } });
    expect(resolveLinkedProperty(s.repository.readState(), property).value).not.toBe(sourceBefore.value);
    expect(s.results.at(-1)!.revisions).toHaveLength(0); // Structural-only oracle misses effective dependency changes.
    expect(resolveLinkedProperty(s.mirrors.get("resource-A")!, property)).not.toEqual(resolveLinkedProperty(s.repository.readState(), property));
  });
});
