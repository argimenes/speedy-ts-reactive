import { createGroupingFeature } from "./index";
import { textOperationCapabilities } from "../../application/text-operation-capabilities";
import { afterEach, describe, expect, it } from "vitest";
import { ReactiveEditor } from "../../reactive-editor/editor";

const editors: ReactiveEditor[] = [];
afterEach(() => { while (editors.length) editors.pop()!.dispose(); });

function fixture() {
  const editor = new ReactiveEditor({ type: "document-block", children: [
    { id: "a", type: "standoff-editor-block", text: "alpha beta" },
    { id: "b", type: "standoff-editor-block", text: "gamma delta" },
  ] });
  const feature = createGroupingFeature(scope => textOperationCapabilities(editor, scope));
  editor.featureHost.activate(feature);
  const groupSelection = feature.selection!;
  editors.push(editor);
  const view = editor.createView("group-test"), nodes = Object.values(view.state.nodes);
  const node = (id: string) => nodes.find(candidate => candidate.payload.id === id)!;
  return { editor, groupSelection, root: view.state.rootKey, a: node("a"), b: node("b") };
}

describe("manual grouped ranges", () => {
  it("reuses session decorations and fans out independent annotations in one undo step", () => {
    const { editor, groupSelection, root, a, b } = fixture();
    groupSelection.begin(root);
    expect(groupSelection.add(a.key, 0, 5)).toBe(true);
    expect(groupSelection.add(b.key, 6, 11)).toBe(true);
    expect(editor.decorations.nodes[a.key][0]).toMatchObject({ owner: groupSelection.owner, type: "editor/group-selection", range: { start: 0, end: 5 } });
    expect(editor.decorations.nodes[b.key][0].range).toMatchObject({ start: 6, end: 11 });

    expect(groupSelection.apply("style/highlight")).toBe(2);
    expect(groupSelection.active()).toBe(false);
    expect(Object.values(editor.decorations.nodes).flat()).toHaveLength(0);
    expect(a.payload.standoffProperties).toEqual([expect.objectContaining({ type: "style/highlight", start: 0, end: 4 })]);
    expect(b.payload.standoffProperties).toEqual([expect.objectContaining({ type: "style/highlight", start: 6, end: 10 })]);

    editor.repository.undo();
    expect(a.payload.standoffProperties).toBeUndefined();
    expect(b.payload.standoffProperties).toBeUndefined();
  });

  it("cancels transient ranges when another document change makes them stale", () => {
    const { editor, groupSelection, root, a } = fixture();
    groupSelection.begin(root);
    groupSelection.add(a.key, 0, 5);
    editor.commands.setPayloadField(a.key, "metadata", { changed: true });
    expect(groupSelection.active()).toBe(false);
    expect(groupSelection.ranges()).toHaveLength(0);
    expect(Object.values(editor.decorations.nodes).flat()).toHaveLength(0);
  });

  it.each([false, true])("reveals and forgets a cleared group (previously visible=%s)", shown => {
    const { editor, groupSelection, root, a, b } = fixture();
    groupSelection.begin(root);
    groupSelection.add(a.key, 0, 5);
    groupSelection.apply("style/show-hide");
    const first = (a.payload.standoffProperties as { id: string }[])[0].id;
    if (shown) editor.showHide.toggle(root);
    groupSelection.cancel();
    expect(groupSelection.ranges()).toHaveLength(0);
    expect(editor.showHide.selectionActive(a.key, first)).toBe(false);

    groupSelection.begin(root);
    groupSelection.add(a.key, 6, 10);
    groupSelection.add(b.key, 0, 5);
    groupSelection.apply("style/show-hide");
    const second = (a.payload.standoffProperties as { id: string }[])[1].id;
    const third = (b.payload.standoffProperties as { id: string }[])[0].id;
    const before = editor.encodeDocument();
    for (const visible of [false, true, false, true]) {
      expect(editor.showHide.shows(a.key, first)).toBe(true);
      expect(editor.showHide.selectionActive(a.key, first)).toBe(false);
      expect(editor.showHide.shows(a.key, second)).toBe(visible);
      expect(editor.showHide.shows(b.key, third)).toBe(visible);
      expect(editor.showHide.selectionActive(a.key, second)).toBe(true);
      editor.showHide.toggle(root);
    }
    expect(editor.encodeDocument()).toEqual(before);
  });

  it("deletes overlapping and disjoint ranges once, preserves empty Blocks, and undoes atomically", () => {
    const { editor, groupSelection, root, a, b } = fixture();
    editor.commands.setPayloadField(a.key, "standoffProperties", [{ id: "bold", type: "style/bold", start: 2, end: 8 }]);
    const before = editor.encodeDocument();
    groupSelection.begin(root);
    groupSelection.add(a.key, 1, 4);
    groupSelection.add(a.key, 3, 6);
    groupSelection.add(a.key, 8, 10);
    groupSelection.add(b.key, 0, 11);
    expect(groupSelection.deleteSelected(a.key)).toBe(true);
    expect(editor.encodeDocument().children!.map(block => block.text)).toEqual(["abe", ""]);
    expect(groupSelection.active()).toBe(false);
    expect(groupSelection.ranges()).toHaveLength(0);
    editor.repository.undo(); expect(editor.encodeDocument()).toEqual(before);
    editor.repository.redo(); expect(editor.encodeDocument().children!.map(block => block.text)).toEqual(["abe", ""]);
  });

  it("deletes hidden group membership but never an excluded or cancelled range", () => {
    const { editor, groupSelection, root, a, b } = fixture();
    groupSelection.begin(root);
    groupSelection.add(a.key, 0, 5);
    groupSelection.apply("style/show-hide");
    groupSelection.cancel();
    groupSelection.begin(root);
    groupSelection.add(a.key, 6, 10);
    groupSelection.add(b.key, 0, 5);
    groupSelection.add(b.key, 6, 11);
    groupSelection.apply("style/show-hide");
    editor.showHide.toggle(root);
    expect(groupSelection.removeAt(b.key, 7)).toBe(true);
    editor.showHide.toggle(root);
    const before = editor.encodeDocument();
    expect(groupSelection.deleteSelected(a.key)).toBe(true);
    expect(editor.encodeDocument().children!.map(block => block.text)).toEqual(["alpha ", " delta"]);
    expect(editor.showHide.selectionActive()).toBe(false);
    editor.repository.undo(); expect(editor.encodeDocument()).toEqual(before);
    expect(groupSelection.deleteSelected(a.key)).toBe(false);
  });

  it("deduplicates shared-content aliases and deletes overlapping membership once", () => {
    const { editor, groupSelection, root, a, b } = fixture();
    const placement = editor.commands.transclude(a.key, { kind: "after", anchorKey: b.key });
    const alias = editor.nodeForPlacementInView(placement, a.viewId)!;
    const before = editor.encodeDocument();
    groupSelection.begin(root);
    expect(groupSelection.add(a.key, 0, 5)).toBe(true);
    expect(groupSelection.add(alias.key, 0, 5)).toBe(false);
    expect(groupSelection.add(alias.key, 3, 8)).toBe(true);
    expect(groupSelection.deleteSelected(a.key)).toBe(true);
    expect(editor.encodeDocument().children![0].text).toBe("ta");
    editor.repository.undo(); expect(editor.encodeDocument()).toEqual(before);
  });

  it("keeps Show/Hide projection state outside the canonical document", () => {
    const { editor, groupSelection, root, a } = fixture();
    const before = editor.encodeDocument();
    expect(editor.showHide.shows(a.key)).toBe(false);
    expect(editor.showHide.toggle(root)).toBe(true);
    expect(editor.showHide.shows(a.key)).toBe(true);
    expect(editor.encodeDocument()).toEqual(before);
  });
});
