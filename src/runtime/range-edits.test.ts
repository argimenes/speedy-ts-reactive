import { afterEach, expect, it, vi } from "vitest";
import { ReactiveEditor } from "../reactive-editor/editor";
import { deleteTextRanges } from "./range-edits";
const editors: ReactiveEditor[] = [];
afterEach(() => editors.splice(0).forEach(editor => editor.dispose()));
function fixture() {
  const editor = new ReactiveEditor({ type: "document-block", children: [
    { id: "a", type: "standoff-editor-block", text: "alpha" }, { id: "b", type: "standoff-editor-block", text: "beta" },
  ] }); editors.push(editor);
  const projection = editor.createView("delete-ranges"), [a, b] = projection.state.nodes[projection.state.rootKey].children;
  const remove = vi.fn((key: string, start: number, end: number) => editor.commands.replaceInlineRange(key, start, end, ""));
  const transaction = vi.fn((label: string, apply: () => void) => editor.commands.transaction(label, apply));
  return { editor, a, b, ports: { ranges: editor.textRanges, order: (key: string) => editor.blockQueries.documentOrder(key), transaction, remove } };
}
it("validates all ranges before acquiring mutation authority", () => {
  const { editor, a, b, ports } = fixture();
  const ranges = [editor.textRanges.snapshot(a, 1, 3), editor.textRanges.snapshot(b, 0, 2)];
  editor.commands.replaceInlineRange(b, 0, 0, "x"); const before = editor.encodeDocument();
  expect(() => deleteTextRanges(ports, ranges, "Delete ranges")).toThrow("stale");
  expect(ports.transaction).not.toHaveBeenCalled(); expect(ports.remove).not.toHaveBeenCalled(); expect(editor.encodeDocument()).toEqual(before);
});
it("returns the first document caret and rolls a failed batch back atomically", () => {
  const { editor, a, b, ports } = fixture(), before = editor.encodeDocument();
  const ranges = [editor.textRanges.snapshot(b, 1, 3), editor.textRanges.snapshot(a, 2, 4)];
  ports.remove.mockImplementationOnce((key, start, end) => editor.commands.replaceInlineRange(key, start, end, "")).mockImplementationOnce(() => { throw Error("write failed"); });
  expect(() => deleteTextRanges(ports, ranges, "Delete ranges")).toThrow("write failed"); expect(editor.encodeDocument()).toEqual(before);
  ports.remove.mockImplementation((key, start, end) => editor.commands.replaceInlineRange(key, start, end, ""));
  expect(deleteTextRanges(ports, ranges, "Delete ranges")).toEqual({ nodeKey: a, index: 2 });
  expect(editor.encodeDocument().children!.map(block => block.text)).toEqual(["ala", "ba"]);
  editor.repository.undo(); expect(editor.encodeDocument()).toEqual(before);
});
