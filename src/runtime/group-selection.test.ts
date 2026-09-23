import { afterEach, describe, expect, it } from "vitest";
import { ReactiveEditor } from "../reactive-editor/editor";

const editors: ReactiveEditor[] = [];
afterEach(() => { while (editors.length) editors.pop()!.dispose(); });

function fixture() {
  const editor = new ReactiveEditor({ type: "document-block", children: [
    { id: "a", type: "standoff-editor-block", text: "alpha beta" },
    { id: "b", type: "standoff-editor-block", text: "gamma delta" },
  ] });
  editors.push(editor);
  const view = editor.createView("group-test"), nodes = Object.values(view.state.nodes);
  const node = (id: string) => nodes.find(candidate => candidate.payload.id === id)!;
  return { editor, root: view.state.rootKey, a: node("a"), b: node("b") };
}

describe("manual grouped ranges", () => {
  it("reuses session decorations and fans out independent annotations in one undo step", () => {
    const { editor, root, a, b } = fixture();
    editor.groupSelection.begin(root);
    expect(editor.groupSelection.add(a.key, 0, 5)).toBe(true);
    expect(editor.groupSelection.add(b.key, 6, 11)).toBe(true);
    expect(editor.decorations.nodes[a.key][0]).toMatchObject({ owner: editor.groupSelection.owner, type: "editor/group-selection", range: { start: 0, end: 5 } });
    expect(editor.decorations.nodes[b.key][0].range).toMatchObject({ start: 6, end: 11 });

    expect(editor.groupSelection.apply("style/highlight")).toBe(2);
    expect(editor.groupSelection.active()).toBe(false);
    expect(Object.values(editor.decorations.nodes).flat()).toHaveLength(0);
    expect(a.payload.standoffProperties).toEqual([expect.objectContaining({ type: "style/highlight", start: 0, end: 4 })]);
    expect(b.payload.standoffProperties).toEqual([expect.objectContaining({ type: "style/highlight", start: 6, end: 10 })]);

    editor.repository.undo();
    expect(a.payload.standoffProperties).toBeUndefined();
    expect(b.payload.standoffProperties).toBeUndefined();
  });

  it("cancels transient ranges when another document change makes them stale", () => {
    const { editor, root, a } = fixture();
    editor.groupSelection.begin(root);
    editor.groupSelection.add(a.key, 0, 5);
    editor.commands.setPayloadField(a.key, "metadata", { changed: true });
    expect(editor.groupSelection.active()).toBe(false);
    expect(editor.groupSelection.ranges()).toHaveLength(0);
    expect(Object.values(editor.decorations.nodes).flat()).toHaveLength(0);
  });

  it("keeps Show/Hide projection state outside the canonical document", () => {
    const { editor, root, a } = fixture();
    const before = editor.encodeDocument();
    expect(editor.showHide.shows(a.key)).toBe(false);
    expect(editor.showHide.toggle(root)).toBe(true);
    expect(editor.showHide.shows(a.key)).toBe(true);
    expect(editor.encodeDocument()).toEqual(before);
  });
});
