import { describe, expect, it } from "vitest";
import { ReactiveEditor } from "../reactive-editor/editor";
import type { ExistingBlockDto } from "./types";

const paragraph = (id: string, text: string, extra = {}): ExistingBlockDto => ({ type: "standoff-editor-block", id, text, ...extra });
function setup(children: ExistingBlockDto[]) {
  const editor = new ReactiveEditor({ type: "document-block", children }); const view = editor.createView("edit-test");
  const node = (id: string) => Object.values(view.state.nodes).find(n => n.payload.id === id)!;
  const segment = (id: string, start: number, end: number) => ({ placementKey: node(id).placementKey, start, end });
  return { editor, node, segment };
}
describe("atomic cross-Block replacement", () => {
  it("joins prefix/insert/suffix, retains first identity and unaffected Cells, and undoes the complete operation", () => {
    const { editor, node, segment } = setup([paragraph("a", "abc😀"), paragraph("b", "middle"), paragraph("c", "xyz"), paragraph("d", "untouched")]);
    const before = editor.encodeDocument(), untouched = [...node("d").inlineContent];
    const prefix = node("a").inlineContent[0], suffixPlacement = editor.node(node("c").inlineContent[2])!.placementKey;
    const result = editor.commands.replaceAcrossBlocks([segment("a", 1, 4), segment("b", 0, 6), segment("c", 0, 2)], "é");
    expect(editor.encodeDocument().children!.map(b => [b.id, b.text])).toEqual([["a", "aéz"], ["d", "untouched"]]);
    expect(result.caret).toBe(2); expect(node("a").inlineContent[0]).toBe(prefix);
    expect(editor.node(node("a").inlineContent[2])!.placementKey).toBe(suffixPlacement);
    expect(node("d").inlineContent).toEqual(untouched);
    editor.repository.undo(); expect(editor.encodeDocument()).toEqual(before);
    editor.repository.redo(); expect(editor.encodeDocument().children![0].text).toBe("aéz"); editor.dispose();
  });
  it("normalizes CRLF and creates fresh multiline paragraphs, including leading/trailing empty lines", () => {
    const { editor, segment } = setup([paragraph("a", "prefix"), paragraph("b", "suffix")]);
    const result = editor.commands.replaceAcrossBlocks([segment("a", 3, 6), segment("b", 0, 3)], "\r\nhello\r\n");
    const blocks = editor.encodeDocument().children!;
    expect(blocks.map(b => b.text)).toEqual(["pre", "hello", "fix"]);
    expect(blocks[0].id).toBe("a"); expect(new Set(blocks.map(b => b.id)).size).toBe(3); expect(result.caret).toBe(0); editor.dispose();
  });
  it("clips annotations without applying semantic membership to the insertion", () => {
    const { editor, segment } = setup([
      paragraph("a", "abcdef", { standoffProperties: [{ id: "p", annotationId: "shared", type: "codex/entity-reference", start: 0, end: 5 }, { id: "deleted", type: "style/bold", start: 3, end: 4 }] }),
      paragraph("b", "uvwxyz", { standoffProperties: [{ id: "q", annotationId: "shared", type: "codex/entity-reference", start: 0, end: 5 }] }),
    ]);
    editor.commands.replaceAcrossBlocks([segment("a", 2, 6), segment("b", 0, 3)], "new");
    expect(editor.encodeDocument().children![0].standoffProperties).toEqual([
      { id: "p", annotationId: "shared", type: "codex/entity-reference", start: 0, end: 1 },
      { id: "q", annotationId: "shared", type: "codex/entity-reference", start: 5, end: 7 },
    ]); editor.dispose();
  });
  it("preserves inline images and distinct margins without legacy export", () => {
    const { editor, segment, node } = setup([
      paragraph("a", "abc", { relation: { leftMargin: { type: "left-margin-block", children: [paragraph("left", "left note")] } } }),
      paragraph("b", "xyz", { relation: { rightMargin: { type: "right-margin-block", children: [paragraph("right", "right note")] } } }),
    ]);
    editor.commands.insertInlineImage(node("b").key, 3, { assetId: "image", src: "test.png", alt: "" });
    editor.commands.replaceAcrossBlocks([segment("a", 1, 3), segment("b", 0, 2)], "!");
    expect(Object.keys(node("a").ownedRelations).sort()).toEqual(["leftMargin", "rightMargin"]);
    expect(node("a").inlineContent.map(key => editor.node(key)!.viewType)).toContain("image-cell");
    expect(node("right").payload.id).toBe("right"); editor.dispose();
  });
  it.each(["margin", "child", "shared"])("refuses %s conflicts without partial deletion", kind => {
    const margin = { rightMargin: { type: "right-margin-block", children: [paragraph("note", "note")] } };
    const { editor, segment, node } = setup([paragraph("a", "abc", kind === "margin" ? { relation: margin } : {}), paragraph("b", "xyz", kind === "margin" ? { relation: margin } : kind === "child" ? { children: [paragraph("nested", "keep")] } : {})]);
    if (kind === "shared") editor.commands.transclude(node("b").key, { kind: "after", anchorKey: node("b").key });
    const before = editor.encodeDocument();
    expect(() => editor.commands.replaceAcrossBlocks([segment("a", 1, 3), segment("b", 0, 2)], "!")).toThrow();
    expect(editor.encodeDocument()).toEqual(before); editor.dispose();
  });
});
