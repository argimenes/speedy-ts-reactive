import { describe, expect, it, vi } from "vitest";
import { ReactiveEditor } from "../reactive-editor/editor";
import { validateRepository } from "./repository";

function setup(relation?: Record<string, unknown>) {
  const editor = new ReactiveEditor({ type: "document-block", children: [{ id: "source", type: "standoff-editor-block", text: "Annotated", standoffProperties: [{ type: "style/bold", start: 0, end: 4 }], ...(relation ? { relation } : {}) }] });
  const view = editor.createView("margin-test");
  const key = view.node(view.state.rootKey)!.children[0];
  return { editor, view, key };
}

describe("margin commands", () => {
  it("preserves both sides, text and annotations through creation, persistence and undo/redo", () => {
    const { editor, key } = setup();
    const before = editor.encodeDocument();
    editor.commands.ensureMargin(key, "left"); editor.commands.ensureMargin(key, "right");
    const saved = editor.encodeDocument();
    for (const side of ["left", "right"]) {
      const margin = saved.children![0].relation![`${side}Margin`] as any;
      expect(margin.type).toBe(`${side}-margin-block`);
      expect(margin.blockProperties).toContainEqual({ type: `block/marginalia/${side}` });
      expect(margin.children[0].text).toBe("");
      expect(margin.children[0].blockProperties).toEqual([{ type: "block/alignment", value: side }, { type: "block/font/size/three-quarters" }]);
    }
    const restored = new ReactiveEditor(saved); expect(restored.encodeDocument()).toEqual(saved); restored.dispose();
    editor.repository.undo(); editor.repository.undo(); expect(editor.encodeDocument()).toEqual(before);
    editor.repository.redo(); editor.repository.redo(); expect(editor.encodeDocument()).toEqual(saved);
    validateRepository(editor.repository.readState()); editor.dispose();
  });

  it("reuses existing text without snapshots or history and repairs empty margins", () => {
    const { editor, key } = setup({ leftMargin: { type: "left-margin-block", children: [] } });
    const text = editor.commands.ensureMargin(key, "left");
    editor.commands.replaceInlineRange(text, 0, 0, "Keep this note");
    const revision = editor.repository.state.revision;
    const snapshot = vi.spyOn(editor.repository, "snapshot");
    expect(editor.commands.ensureMargin(key, "left")).toBe(text);
    expect(editor.repository.state.revision).toBe(revision); expect(snapshot).not.toHaveBeenCalled();
    editor.dispose();
  });

  it("does not overwrite opaque or incompatible margin data", () => {
    for (const value of [{ reference: "opaque" }, { type: "image-block", metadata: { src: "image.png" } }]) {
      const { editor, key } = setup({ leftMargin: value });
      const before = editor.encodeDocument();
      expect(() => editor.commands.ensureMargin(key, "left")).toThrow();
      expect(editor.encodeDocument()).toEqual(before); expect(editor.repository.canUndo()).toBe(false);
      editor.dispose();
    }
  });
});
