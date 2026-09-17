import { describe, expect, it } from "vitest";
import { clone } from "../../block-tree/clone";
import { TreeCommands } from "../../block-tree/commands";
import { captureBlocks, cloneBlocks } from "../../block-tree/clipboard";
import { BlockTreeProjection } from "../../block-tree/projection";
import { OccurrenceIndex } from "../../block-tree/occurrences";
import { decodePortable } from "../../block-tree/portable-spike/codec";
import { sharedContainer } from "../../block-tree/portable-spike/fixtures";
import { decodeGateDocument, encodeGateDocument, type GateDocument } from "./portable";
import { openGateEditor } from "./editor";
import { projectOwned } from "./resource";

function fixture(): GateDocument {
  return { format: "codex-portable-resource-gate", version: 1, resourceId: "resource-A",
    root: { placementId: "root", kind: "owned", target: { kind: "local", blockId: "A" } },
    blocks: [
      { id: "A", type: "document-block", properties: {}, children: [
        { placementId: "paragraph", kind: "owned", target: { kind: "local", blockId: "p" } },
        { placementId: "external-X", kind: "reference", target: { kind: "external", reference: {
          kind: "block", targetId: "X", source: { scope: "document", resourceId: "resource-B" }, version: { kind: "unpinned" },
        } } },
      ] },
      { id: "p", type: "standoff-editor-block", properties: {}, inline: [{ kind: "text", text: "A😀é" }] },
    ],
  };
}

describe("Stage C G1 portable/current-Document bridge", () => {
  it("reopens external structure without target definitions and regenerates only private runtime keys", () => {
    const doc = fixture(), first = decodeGateDocument(doc), second = decodeGateDocument(JSON.parse(JSON.stringify(encodeGateDocument(first))));
    expect(first.rootPlacementKey).not.toBe(second.rootPlacementKey);
    expect(encodeGateDocument(first)).toEqual(doc); expect(encodeGateDocument(second)).toEqual(doc);
    expect(Object.values(second.contents).filter(c => c.payload.id).map(c => c.payload.id)).toEqual(["A", "p"]);
    expect(JSON.stringify(doc)).not.toContain("private-cell:");
  });

  it("uses real commands/projection and existing undo while the external target is absent", () => {
    const editor = openGateEditor(decodeGateDocument(fixture()));
    const commands = new TreeCommands(editor.repository, key => key);
    const projection = new BlockTreeProjection(editor.repository, "G1", new OccurrenceIndex());
    const key = (semantic: string) => [...editor.placementIds].find(([, id]) => id === semantic)![0];
    const external = key("external-X");
    expect(projection.nodeForPlacement(external)?.viewType).toBe("external-reference");
    expect(projection.nodeForPlacement(external)?.payload).not.toHaveProperty("id");
    expect(Object.values(editor.repository.readState().contents).some(c => c.payload.id === "X")).toBe(false);
    commands.replaceInlineRange(key("paragraph"), 1, 1, "local ");
    commands.move(external, { kind: "before", anchorKey: key("paragraph") });
    commands.unlink(external);
    editor.repository.undo(); editor.repository.undo(); editor.repository.undo();
    expect(encodeGateDocument(editor.snapshot())).toEqual(fixture());
    expect(editor.repository.canUndo()).toBe(false);
    editor.repository.redo(); editor.repository.redo(); editor.repository.redo();
    const saved = encodeGateDocument(editor.snapshot());
    expect(saved.blocks[0].children).toHaveLength(1);
    expect(encodeGateDocument(decodeGateDocument(saved))).toEqual(saved);
    expect(editor.errors).toEqual([]);
    projection.dispose(); editor.stop();
  });

  it("copies owned structure with new identities and retains the foreign reference without copying its target", () => {
    const editor = openGateEditor(decodeGateDocument(fixture()));
    const fragment = cloneBlocks(captureBlocks(editor.repository.snapshot(), [editor.repository.readState().rootPlacementKey]));
    expect(Object.values(fragment.state.contents).some(c => c.payload.id === "X")).toBe(false);
    const sourceIds = new Set(Object.values(editor.repository.readState().contents).map(c => c.payload.id).filter(Boolean));
    expect(Object.values(fragment.state.contents).filter(c => c.payload.id).every(c => !sourceIds.has(c.payload.id))).toBe(true);
    const reference = Object.values(fragment.state.placements).find(p => p.externalReference);
    expect(reference?.externalReference?.targetId).toBe("X");
    expect(editor.repository.canUndo()).toBe(false); editor.stop();
  });

  it("retains shared containers, named relations and rich inline data from the accepted spike", () => {
    const decoded = decodePortable(clone(sharedContainer));
    if (decoded.status !== "ready") throw new Error("fixture");
    const root = decoded.state.placements[decoded.state.rootPlacementKey];
    const ids = new Map(decoded.bindings.placementIds);
    for (const p of Object.values(decoded.state.placements)) if (p.kind === "inline") ids.set(p.key, `private-cell:${p.key}`);
    const projected = projectOwned(decoded.state, decoded.bindings.resourceId, {
      contents: new Map(Object.keys(decoded.state.contents).map(key => [key, decoded.bindings.resourceId])),
      placementIds: ids, externalTargets: new Map(), root: { key: root.key, placementId: ids.get(root.key)!, contentKey: root.contentKey },
    }, 0);
    const wire = encodeGateDocument(projected), reopened = decodeGateDocument(JSON.parse(JSON.stringify(wire)));
    expect(encodeGateDocument(reopened)).toEqual(wire);
    expect(wire.blocks.filter(b => b.id === "container")).toHaveLength(1);
    expect(wire.blocks.find(b => b.id === "paragraph")?.inline?.[1].kind).toBe("image");
  });
});
