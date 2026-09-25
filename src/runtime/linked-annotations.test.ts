import { afterEach, expect, it } from "vitest";
import { ReactiveEditor } from "../reactive-editor/editor";
const cleanup: (() => void)[] = [];
afterEach(() => { cleanup.reverse().forEach(fn => fn()); cleanup.length = 0; });
it("keeps linked annotation batching generic and rejects the whole batch when any snapshot is stale", () => {
  const editor = new ReactiveEditor({ type: "document-block", children: [{ type: "standoff-editor-block", text: "One" }, { type: "standoff-editor-block", text: "Two" }] });
  cleanup.push(() => editor.dispose()); const view = editor.createView("batch"), keys = view.node(view.state.rootKey)!.children;
  const ranges = keys.map(key => editor.textRanges.snapshot(key, 0, 3)); const before = editor.encodeDocument();
  expect(() => editor.linkedAnnotations.createBatch([[ranges[0]], [{ ...ranges[1], version: -1 }]], "future/reference", "id", {}, editor.repository.state.revision, "Test batch")).toThrow("stale");
  expect(editor.encodeDocument()).toEqual(before); expect(editor.repository.canUndo()).toBe(false);
  const ids = editor.linkedAnnotations.createBatch([ranges], "future/reference", "id", { opaque: true }, editor.repository.state.revision, "Test batch");
  expect(editor.linkedAnnotations.segments(ids[0])).toHaveLength(2); editor.repository.undo(); expect(editor.encodeDocument()).toEqual(before);
});
