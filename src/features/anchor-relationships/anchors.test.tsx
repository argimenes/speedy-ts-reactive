// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { ReactiveEditor } from "../../reactive-editor/editor";
import { registerApplicationViews } from "../../application/features";
import { anchorCapabilities } from "../../application/anchor-capabilities";
import { anchorRecord, allowedTarget, metadataAnchor, resolveAnchor } from "./model";
import { captureBlocks, cloneBlocks } from "../../block-tree/clipboard";
import { materializeLocalWorkspace } from "../../reactive-editor/workspace-manifest";

const stops: Array<() => void> = [];
afterEach(() => stops.splice(0).reverse().forEach(stop => stop()));
const dto = () => ({ id: "doc", type: "document-block", children: [
  { id: "a", type: "standoff-editor-block", text: "Anchor paragraph" },
  { id: "b", type: "plain-text-block", text: "Ordinary B", metadata: { unknown: "retained" } },
  { id: "c", type: "image-block", metadata: { url: "example.png" } },
] });
function setup(enabled = true, input: any = dto()) {
  const editor = new ReactiveEditor(input, { features: { anchorRelationships: enabled } }); stops.push(() => editor.dispose());
  registerApplicationViews(editor); const projection = editor.createView();
  const node = (id: string) => Object.values(projection.state.nodes).find(node => node.payload.id === id)!;
  let port!: ReturnType<typeof anchorCapabilities>;
  editor.featureHost.activate({ id: "anchor-test", activate(scope) { port = anchorCapabilities(editor, scope); } });
  return { editor, projection, node, port };
}
describe("Anchor Relationships", () => {
  it("validates finite versioned offsets and preserves unsupported records", () => {
    expect(anchorRecord({ version: 1, blockId: "a", offset: { x: -30, y: 12 } })).toBeTruthy();
    for (const value of [null, {}, { version: 2, blockId: "a", offset: { x: 0, y: 0 } }, { version: 1, blockId: "a", offset: { x: Infinity, y: 1 } }]) expect(anchorRecord(value)).toBeUndefined();
  });
  it("keeps ownership, supports the Document exception and records one undoable metadata edit", () => {
    const { editor, node, port } = setup();
    const children = [...node("doc").children];
    expect(allowedTarget(port, node("b").key, node("doc").key)).toBe(true);
    port.commit(node("b").key, node("doc").key, { x: -80, y: 10 });
    expect(node("doc").children).toEqual(children);
    expect(resolveAnchor(port, node("b").key, anchorRecord(metadataAnchor(node("b")))!)?.target).toBe(node("doc").key);
    const saved = editor.encodeDocument();
    expect((saved.children![1].metadata as any).unknown).toBe("retained");
    editor.repository.undo(); expect(metadataAnchor(node("b"))).toBeUndefined();
    editor.repository.redo(); expect(metadataAnchor(node("b"))).toEqual((saved.children![1].metadata as any).anchor);
    const reopened = setup(false, saved);
    expect(reopened.editor.blockPresentation.current()).toBeUndefined();
    expect(metadataAnchor(reopened.node("b"))).toEqual(metadataAnchor(node("b")));
    expect(reopened.editor.encodeDocument()).toEqual(saved);
  });
  it("rejects chains and self references; deletion leaves B reachable and undo resolves it", () => {
    const { editor, node, port } = setup();
    expect(allowedTarget(port, node("a").key, node("a").key)).toBe(false);
    port.commit(node("b").key, node("a").key, { x: 5, y: 8 });
    expect(allowedTarget(port, node("c").key, node("b").key)).toBe(false);
    expect(allowedTarget(port, node("a").key, node("doc").key)).toBe(false);
    const record = anchorRecord(metadataAnchor(node("b")))!;
    editor.commands.remove(node("a").key);
    expect(node("b")).toBeTruthy(); expect(resolveAnchor(port, node("b").key, record)).toBeUndefined();
    editor.repository.undo(); expect(resolveAnchor(port, node("b").key, record)?.target).toBe(node("a").key);
  });
  it("remaps only the copied anchor identity and retains unknown metadata", () => {
    const { editor, node, port } = setup(); port.commit(node("b").key, node("a").key, { x: 10, y: 20 });
    const copy = cloneBlocks(captureBlocks(editor.repository.readState(), [node("a").placementKey, node("b").placementKey]));
    const a = copy.state.contents[copy.state.placements[copy.roots[0]].contentKey];
    const b = copy.state.contents[copy.state.placements[copy.roots[1]].contentKey];
    expect((b.payload.metadata as any).anchor.blockId).toBe(a.payload.id);
    expect((b.payload.metadata as any).unknown).toBe("retained");
    const solo = cloneBlocks(captureBlocks(editor.repository.readState(), [node("b").placementKey]));
    expect((solo.state.contents[solo.state.placements[solo.roots[0]].contentKey].payload.metadata as any).anchor.blockId).toBe("a");
  });
  it("resolves shared Documents per occurrence and refuses ambiguous internal transclusions", () => {
    const doc = dto(); (doc.children[1].metadata as any).anchor = { version: 1, blockId: "a", offset: { x: 2, y: 3 } };
    const loaded = materializeLocalWorkspace({ type: "workspace-block", children: ["one", "two"].map(id => ({ id, type: "document-window-block", children: [structuredClone(doc)] })) });
    const { editor, projection, port } = setup(true, loaded);
    const occurrences = Object.values(projection.state.nodes).filter(n => n.payload.id === "b");
    expect(occurrences).toHaveLength(2);
    const resolved = occurrences.map(b => resolveAnchor(port, b.key, anchorRecord(metadataAnchor(b))!)!);
    expect(resolved[0].document).not.toBe(resolved[1].document);
    expect(resolved[0].target).not.toBe(resolved[1].target);
    const a = editor.node(resolved[0].target)!;
    editor.commands.transclude(a.key, { kind: "after", anchorKey: a.key });
    expect(resolveAnchor(port, occurrences[0].key, anchorRecord(metadataAnchor(occurrences[0]))!)).toBeUndefined();
  });
});
