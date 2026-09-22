// @vitest-environment node
import { describe, expect, it } from "vitest";
import { leafAuthoredState } from "./block-restore";
import { captureFixture } from "../history/selective-spike/fixture";
import { historicalBlockSource, restoreAvailability } from "../history/block-restore";
import { queryDurableSubtree, projectWholeDocument } from "../history/durable-core";
import { restoreCaptureProposal, validateRestoreCapture } from "../history/restore-preflight";
import { restoreProperties } from "./restore-properties";
import { workspaceDocumentFixture } from "../demo/workspace-document";
const doc = { id: "doc", type: "document-block", children: [{ id: "p", type: "standoff-editor-block", text: "one 🙂 two",
  standoffProperties: [
    { id: "old-bold", type: "style/bold", start: 0, end: 2, value: "", text: "on", metadata: {}, plugin: null, isDeleted: false },
    { id: "old-colour", type: "text/colour", start: 4, end: 4, value: "#123456", metadata: {}, attributes: {} },
    { type: "style/superscript", start: 6, end: 8 },
  ], blockProperties: [
    { type: "block/alignment", value: "right", metadata: {}, isDeleted: false },
    { type: "block/font/size", value: "h3", metadata: {}, isDeleted: false },
    { type: "block/font/size/three-quarters" },
  ] }] };
function fixture() {
  const f = captureFixture(doc), pk = f.key("p"), ck = f.baseline.placements[pk].target;
  if (ck.kind !== "local") throw Error("fixture");
  const authored = () => leafAuthoredState(f.repository.readState().contents[ck.contentKey], f.repository.readState());
  const original = historicalBlockSource(queryDurableSubtree(f.baseline, { blockId: "p", revisionId: "past" }), "segment");
  return { ...f, pk, ck: ck.contentKey, authored, original };
}
describe("Restore this Block is an ordinary current edit", () => {
  it("creates one new exact revision, preserves identities, and records normal Undo/Redo without rewriting earlier history", () => {
    const f = fixture(), id = f.repository.state.placements[f.pk].placementId;
    f.commands.transaction("Edit text and formatting", () => {
      f.commands.replaceInlineRange(f.pk, 0, 3, "current");
      f.commands.setPayloadField(f.pk, "standoffProperties", [{ type: "style/underline", start: 0, end: 6 }]);
      f.commands.setPayloadField(f.pk, "blockProperties", [{ type: "block/font/size", value: "h1" }]);
    });
    const before = f.repository.snapshot(), previous = f.authored(), oldEvidence = JSON.stringify(f.states);
    const plan = f.commands.prepareBlockRestore(f.pk, "p", f.original.authored);
    validateRestoreCapture(projectWholeDocument(before, "resource", 1) as any, before.revision, restoreCaptureProposal(before, plan));
    f.commands.restoreBlock(plan);
    expect(f.repository.state.revision).toBe(before.revision + 1);
    expect(f.events.at(-1)).toMatchObject({ label: "Restore this Block", cause: { kind: "edit" }, commands: [{ commandId: "tree.restoreBlock" }] });
    expect(f.authored()).toEqual(f.original.authored);
    expect(f.repository.state.placements[f.pk]).toEqual(before.placements[f.pk]);
    expect(f.repository.state.contents[f.ck].payload.id).toBe("p");
    expect(f.repository.state.placements[f.pk].placementId).toBe(id);
    expect(f.repository.state.contents[f.ck].inlineRevision).toBe(before.contents[f.ck].inlineRevision + 1);
    expect((f.repository.state.contents[f.ck].payload.standoffProperties as any)[0].id).not.toBe("old-bold");
    const restoredKeys = f.repository.state.contents[f.ck].inlineContent.slice(0, 3);
    expect(restoredKeys.some(k => Object.hasOwn(f.baseline.placements, k))).toBe(false);
    expect(JSON.stringify(f.states.slice(0, 2))).toBe(oldEvidence);
    const restored = f.repository.snapshot();
    f.repository.undo(); expect(f.authored()).toEqual(previous);
    expect(f.repository.state.contents[f.ck].payload).toEqual(before.contents[f.ck].payload);
    f.repository.redo(); expect(f.authored()).toEqual(f.original.authored);
    expect(f.repository.state.contents[f.ck].inlineContent).toEqual(restored.contents[f.ck].inlineContent);
    expect(f.events.slice(-3).map(e => e.cause.kind)).toEqual(["edit", "undo", "redo"]);
    expect(f.states).toHaveLength(5);
    for (const [index, state] of f.states.entries()) {
      const exported = historicalBlockSource(queryDurableSubtree(state, { blockId: "p", revisionId: String(index) }), "segment");
      expect(exported.authored).toEqual(index === 1 || index === 3 ? previous : f.original.authored);
    }
  });
  it("rejects stale plans, replayed plans and failed admission atomically; identical authored states are no-ops", () => {
    const f = fixture(); const noop = f.commands.prepareBlockRestore(f.pk, "p", f.original.authored);
    f.commands.restoreBlock(noop); expect(f.events).toHaveLength(0);
    f.commands.replaceInlineRange(f.pk, 0, 1, "X");
    const stale = f.commands.prepareBlockRestore(f.pk, "p", f.original.authored);
    f.commands.replaceInlineRange(f.pk, 0, 1, "Y"); const state = f.repository.snapshot(), count = f.events.length;
    expect(() => f.commands.restoreBlock(stale)).toThrow("Document changed"); expect(f.repository.snapshot()).toEqual(state); expect(f.events).toHaveLength(count);
    const valid = f.commands.prepareBlockRestore(f.pk, "p", f.original.authored); f.commands.restoreBlock(valid);
    expect(() => f.commands.restoreBlock(valid)).toThrow("Document changed");
    const tooLarge = f.commands.prepareBlockRestore(f.pk, "p", { ...f.original.authored, text: "Z".repeat(500) });
    const unchanged = f.repository.snapshot(), proposal = restoreCaptureProposal(unchanged, tooLarge);
    expect(() => validateRestoreCapture(projectWholeDocument(unchanged, "resource") as any, unchanged.revision, proposal)).toThrow("single-change history limit");
    expect(f.repository.snapshot()).toEqual(unchanged);
    expect(() => f.commands.prepareBlockRestore(f.pk, "p", { ...f.original.authored, payload: { metadata: { revision: 100 } } })).toThrow("metadata");
    expect(f.repository.snapshot()).toEqual(unchanged);
  });
  it("refuses shared Blocks, shared ancestors, missing identities, relations and linked annotations", () => {
    const f = fixture(); f.commands.transclude(f.pk, { kind: "after", anchorKey: f.pk });
    expect(() => f.commands.prepareBlockRestore(f.pk, "p", f.original.authored)).toThrow("shared");
    expect(() => f.commands.prepareBlockRestore(f.pk, "someone-else", f.original.authored)).toThrow("removed or replaced");
    const g = captureFixture({ id: "doc", type: "document-block", children: [{ id: "container", type: "container-block", children: [doc.children[0]] }] });
    g.commands.transclude(g.key("container"), { kind: "after", anchorKey: g.key("container") });
    expect(() => g.commands.prepareBlockRestore(g.key("p"), "p", f.original.authored)).toThrow("shared");
    const h = fixture(); h.commands.setPayloadField(h.pk, "standoffProperties", [{ annotationId: "shared", type: "style/bold", start: 0, end: 1 }]);
    expect(() => h.commands.prepareBlockRestore(h.pk, "p", h.original.authored)).toThrow("Linked annotations");
  });
  it("creates a normal new branch after Undo, preserving old evidence and redo on failed preparation", () => {
    const f = fixture(); f.commands.replaceInlineRange(f.pk, 0, 3, "later");
    const source = historicalBlockSource(queryDurableSubtree(f.states[1], { blockId: "p", revisionId: "old-later" }), "segment");
    f.repository.undo(); expect(f.repository.canRedo()).toBe(true);
    const evidence = JSON.stringify(f.states), before = f.repository.snapshot();
    expect(() => f.commands.prepareBlockRestore(f.pk, "p", { ...source.authored, payload: { history: "forbidden" } })).toThrow("Invalid authored");
    expect(f.repository.canRedo()).toBe(true); expect(f.repository.snapshot()).toEqual(before);
    f.commands.restoreBlock(f.commands.prepareBlockRestore(f.pk, "p", source.authored));
    expect(f.repository.canRedo()).toBe(false); expect(f.authored()).toEqual(source.authored);
    expect(JSON.stringify(f.states.slice(0, 3))).toBe(evidence);
    expect(f.events[2].commitId).not.toBe(f.events[0].commitId);
  });
  it("restores plain text without importing historical counters or changing ownership", () => {
    const f = captureFixture({ id: "doc", type: "document-block", children: [{ id: "p", type: "plain-text-block", text: "old" }] });
    const pk = f.key("p"), ck = f.repository.state.placements[pk].contentKey;
    const original = leafAuthoredState(f.repository.readState().contents[ck], f.repository.readState());
    f.commands.setPayloadField(pk, "text", "now"); const before = f.repository.snapshot();
    f.commands.restoreBlock(f.commands.prepareBlockRestore(pk, "p", original));
    expect(f.repository.state.contents[ck]).toMatchObject({ payload: { id: "p", text: "old" }, revision: before.contents[ck].revision + 1 });
    f.repository.undo(); expect(f.repository.state.contents[ck].payload.text).toBe("now");
  });
  it("admits the unchanged ordinary Workspace sample heading, including its real font-size and decorative annotations", () => {
    const blocks = (d: any): any[] => [d, ...(d.children ?? []).flatMap(blocks)];
    const heading = blocks(workspaceDocumentFixture).find(b => b.text === "Standoff Property Text Editor");
    expect(heading.blockProperties).toEqual([{ type: "block/font/size", value: "h3" }]);
    const f = captureFixture({ id: "doc", type: "document-block", children: [{ ...heading, id: "p" }] });
    const source = historicalBlockSource(queryDurableSubtree(f.baseline, { blockId: "p", revisionId: "heading" }), "segment");
    expect(source.authored.payload.blockProperties).toEqual(heading.blockProperties);
    expect(source.authored.payload.standoffProperties).toEqual(heading.standoffProperties);
  });
  it("restores distinct text revisions carrying the legacy template's trailing-space alignment property verbatim", () => {
    const properties = [{ type: "block/alignment/left ", metadata: {}, isDeleted: false }];
    const f = captureFixture({ id: "doc", type: "document-block", children: [{ id: "p", type: "standoff-editor-block", text: "past", blockProperties: properties }] });
    const pk = f.key("p"), placement = { ...f.repository.state.placements[pk] };
    const source = historicalBlockSource(queryDurableSubtree(f.baseline, { blockId: "p", revisionId: "past" }), "segment");
    f.commands.replaceInlineRange(pk, 0, 4, "now");
    f.commands.replaceInlineRange(pk, 0, 3, "later");
    const before = f.repository.snapshot(), evidence = JSON.stringify(f.states);
    f.commands.restoreBlock(f.commands.prepareBlockRestore(pk, "p", source.authored));
    expect(f.repository.state.revision).toBe(before.revision + 1);
    expect(f.repository.state.placements[pk]).toEqual(placement);
    expect(f.events.at(-1)).toMatchObject({ label: "Restore this Block", cause: { kind: "edit" } });
    expect(JSON.stringify(f.states.slice(0, 3))).toBe(evidence);
    f.repository.undo();
    expect(f.repository.state.contents[placement.contentKey].payload).toEqual(before.contents[placement.contentKey].payload);
    f.repository.redo();
    const texts = ["past", "now", "later", "past", "later", "past"];
    expect(f.states).toHaveLength(texts.length);
    f.states.forEach((state, i) => {
      const selection = queryDurableSubtree(state, { blockId: "p", revisionId: String(i) });
      expect(restoreAvailability(selection)).toEqual({ supported: true });
      const authored = historicalBlockSource(selection, "segment").authored;
      expect(authored.text).toBe(texts[i]);
      expect(authored.payload.blockProperties).toEqual(properties);
    });
    expect(() => restoreProperties([{ type: "block/alignment/left  " }], "Block property")).toThrow('("block/alignment/left  ")');
    expect(() => restoreProperties([{ type: "block/alignment/left ", annotationId: "shared" }], "Block property")).toThrow("annotationId");
  });
  it("round-trips every ordinary toolbar style, serialized fields, deleted local ranges and authored geometry without dropping fields", () => {
    const types = ["style/bold", "style/italics", "style/underline", "style/strikethrough", "style/superscript", "style/subscript", "style/uppercase", "style/highlight", "style/highlighter", "style/rainbow", "style/rectangle", "style/spiky", "style/blur", "style/glow", "style/chromatic-aberration", "style/motion-blur", "style/ghost", "style/grayscale", "style/sepia", "style/invert", "style/contrast-brightness", "style/grain", "style/ink-bleed", "style/turbulence", "amber-crt", "style/flip", "style/mirror", "text/colour", "text/background-colour", "style/strike", "style/color"];
    const annotations = types.map(type => ({ type, start: 0, end: 2, value: "", metadata: {}, attributes: {}, text: "legacy excerpt", plugin: null, isDeleted: false }));
    annotations.push({ ...annotations[0], start: 30, end: 40, isDeleted: true });
    expect(restoreProperties(annotations, "Annotation", 3)).toEqual(annotations);
    const properties = [
      { type: "block/position", metadata: { x: 20, y: "10px", position: "relative" }, isDeleted: false },
      { type: "block/size", metadata: { width: "50%", height: 100, "min-width": 20 } },
      { type: "block/margin", metadata: { top: "2em", right: 3, bottom: 0, left: "1px" } },
      { type: "block/rotate", value: 20 }, { type: "block/alignment/left", metadata: {} },
      { type: "block/margin/top/40px" }, { type: "block/font/size/h1" },
    ];
    expect(restoreProperties(properties, "Block property")).toEqual(properties);
  });
  it.each([
    ["blockProperties", { type: "block/font/size", value: "h3", metadata: { documentId: "other" } }, "Block property #1 (block/font/size): metadata.documentId"],
    ["blockProperties", { type: "block/draggable" }, "Block property #1 (block/draggable)"],
    ["standoffProperties", { type: "codex/entity-reference", start: 0, end: 1, value: "entity" }, "Annotation #1 (codex/entity-reference)"],
    ["standoffProperties", { type: "style/bold", start: 0, end: 1, annotationId: "shared" }, "Linked annotations / references (annotationId)"],
    ["standoffProperties", { type: "style/bold", start: 0, end: 1, plugin: { id: "old" } }, "non-null plugin state"],
    ["standoffProperties", { type: "style/bold", start: 0, end: 1, attributes: { target: "other" } }, "attributes.target"],
    ["standoffProperties", { type: "style/bold", start: 0, end: 100 }, "active ranges"],
    ["standoffProperties", { type: "style/bold", start: 0, end: 1, externalDefinitionLink: null }, "externalDefinitionLink"],
  ])("refuses unsupported %s data with a specific reason and no mutation", (field, property, reason) => {
    const f = fixture(), before = f.repository.snapshot();
    expect(() => f.commands.prepareBlockRestore(f.pk, "p", { ...f.original.authored, payload: { [field as string]: [property] } })).toThrow(reason as string);
    expect(f.repository.snapshot()).toEqual(before); expect(f.events).toHaveLength(0);
    f.commands.setPayloadField(f.pk, field as string, [property]);
    const current = f.repository.snapshot();
    expect(() => f.commands.prepareBlockRestore(f.pk, "p", f.original.authored)).toThrow(reason as string);
    expect(f.repository.snapshot()).toEqual(current);
  });
});
