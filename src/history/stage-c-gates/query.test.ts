import { describe, expect, it } from "vitest";
import { clone } from "../../block-tree/clone";
import { TreeCommands } from "../../block-tree/commands";
import { decodeGateDocument, encodeGateDocument, type GateDocument } from "./portable";
import { openGateEditor } from "./editor";
import { queryResource } from "./query";
import { locations } from "./resource";

const edge = (placementId: string, blockId: string, kind: "owned" | "reference" = "owned") => ({ placementId, kind, target: { kind: "local" as const, blockId } });
function fixture(): GateDocument {
  return { format: "codex-portable-resource-gate", version: 1, resourceId: "A", root: edge("root", "doc"), blocks: [
    { id: "doc", type: "document-block", properties: { linkedAnnotations: { local: { value: "historical" }, D: { value: "wrong local shadow" } } }, children: [edge("first", "container"), edge("second", "container", "reference")] },
    { id: "container", type: "container-block", properties: {}, children: [edge("paragraph", "p"), edge("cycle", "container", "reference"), {
      placementId: "external", kind: "reference", target: { kind: "external", reference: { kind: "block", targetId: "foreign", source: { scope: "document", resourceId: "B" }, version: { kind: "revision", memoirId: "B-memory", segmentId: "segment", revisionId: "revision" }, targetRoute: ["b-root", "x"] } },
    }] },
    { id: "p", type: "standoff-editor-block", properties: { standoffProperties: [
      { id: "local-use", annotationId: "local", start: 0, end: 1 },
      { id: "foreign-use", annotationId: "D", start: 1, end: 2, externalDefinition: { format: "codex-external-definition-gate", version: 1, target: { kind: "definition", targetId: "D", source: { scope: "workspace", resourceId: "W" }, version: { kind: "unpinned" } } } },
    ] }, inline: [{ kind: "text", text: "A😀é" }, { kind: "image", properties: { assetId: "image", src: "/absent.png", alt: "absent", externalAsset: { format: "codex-external-asset-gate", version: 1, target: { kind: "asset", targetId: "image", source: { scope: "unknown" }, version: { kind: "unpinned" } } } } }],
    relations: { owned: { leftMargin: edge("margin", "m") }, opaque: { extension: { id: "opaque" } } } },
    { id: "m", type: "left-margin-block", properties: {}, children: [] },
  ] };
}

describe("G1 isolated owned queries", () => {
  it("preserves shared occurrences, margins, internal cycles and terminal external provenance", () => {
    const snapshot = decodeGateDocument(fixture());
    expect(queryResource(snapshot, { blockId: "p" }).status).toBe("ambiguous-occurrence");
    const result = queryResource(snapshot, { blockId: "p", route: ["root", "first", "paragraph"] });
    expect(result.status).toBe("available");
    expect(Object.values(result.fragment!.contents).map(c => c.payload.id)).toContain("m");
    expect(result.fragment!.definitions).toEqual({ local: { value: "historical" } });
    expect(result.fragment!.external.map(t => t.kind)).toEqual(["definition", "asset"]);
    const subtree = queryResource(snapshot, { blockId: "doc" });
    expect(subtree.fragment!.external.find(t => t.kind === "block")?.targetRoute).toEqual(["b-root", "x"]);
    expect(Object.values(subtree.fragment!.contents).some(c => c.payload.id === "foreign")).toBe(false);
    expect(queryResource(snapshot, { blockId: "foreign" }).status).toBe("unknown-block");
    expect(locations(snapshot, "external")).toHaveLength(2);
    expect(() => { (result.fragment!.definitions as Record<string, unknown>).local = "mutated"; }).toThrow();
    expect(encodeGateDocument(decodeGateDocument(encodeGateDocument(snapshot)))).toEqual(fixture());
  });

  it("uses selected state ancestry for deleted/not-yet-created, independently of another branch", () => {
    const wire = fixture(); wire.blocks[0].children = [];
    // Definition P is initially unplaced, not deleted or unavailable.
    const editor = openGateEditor(decodeGateDocument(wire)), commands = new TreeCommands(editor.repository, k => k);
    const before = editor.snapshot();
    expect(queryResource(before, { blockId: "p" }).status).toBe("unplaced");
    const root = editor.repository.readState().rootPlacementKey;
    commands.insert({ id: "new", type: "plain-text-block", text: "new" }, { kind: "at", parentKey: root, index: 0 });
    const created = editor.snapshot(), placement = Object.values(editor.repository.readState().placements).find(p => editor.repository.readState().contents[p.contentKey]?.payload.id === "new")!;
    commands.remove(placement.key); commands.deleteUnplacedDefinition(placement.contentKey);
    const deleted = editor.snapshot();
    expect(queryResource(before, { blockId: "new" }, { ancestors: [], future: [created, deleted] }).status).toBe("not-yet-created");
    expect(queryResource(deleted, { blockId: "new" }, { ancestors: [before, created], future: [] }).status).toBe("deleted");
    // A chronologically later sibling with no selected-branch evidence cannot
    // make a Block on another branch appear deleted or not-yet-created.
    expect(queryResource(before, { blockId: "new" }).status).toBe("unknown-block");
    editor.repository.undo(); expect(queryResource(editor.snapshot(), { blockId: "new" }).status).toBe("unplaced");
    expect(editor.errors).toEqual([]); editor.stop();
  });

  it("reads historical internal dependencies after live registries are unavailable", () => {
    const editor = openGateEditor(decodeGateDocument(fixture()));
    const saved = editor.snapshot();
    const root = editor.repository.readState().contents[editor.repository.readState().placements[editor.repository.readState().rootPlacementKey].contentKey];
    editor.repository.commit("change owned definition", [{ kind: "put-content", record: { ...clone(root), payload: { ...clone(root.payload), linkedAnnotations: { local: { value: "new" } } } } }]);
    const later = editor.snapshot();
    // The oracle receives only frozen resource snapshots; no callback can fetch
    // repository state or resolve a definition through the live Workspace.
    Object.defineProperty(editor.repository, "readState", { value: () => { throw new Error("live access"); } });
    const select = { blockId: "p", route: ["root", "first", "paragraph"] };
    expect(queryResource(saved, select).fragment!.definitions.local).toEqual({ value: "historical" });
    expect(queryResource(later, select).fragment!.definitions.local).toEqual({ value: "new" });
    editor.stop();
  });
});
