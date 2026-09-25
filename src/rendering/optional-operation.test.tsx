import { afterEach, describe, expect, it } from "vitest";
import { render } from "solid-js/web";
import { ReactiveEditor } from "../reactive-editor/editor";
import { registerApplicationViews } from "../application/features";
import { ReactiveTreeView } from "./reactive-tree-view";
import { encodeDocument } from "../block-tree/codecs";

const cleanup: (() => void)[] = [];
afterEach(() => { cleanup.splice(0).reverse().forEach(dispose => dispose()); document.body.replaceChildren(); localStorage.clear(); });
function fixture() {
  const editor = new ReactiveEditor({ type: "document-block", children: [
    { id: "a", type: "standoff-editor-block", text: "alpha beta", standoffProperties: [{ id: "hidden", type: "style/show-hide", start: 6, end: 9 }] },
    { id: "b", type: "standoff-editor-block", text: "gamma delta" },
  ] }, { features: { grouping: false, timer: false } });
  registerApplicationViews(editor); const projection = editor.createView("optional-operation");
  const host = document.body.appendChild(document.createElement("div"));
  const unmount = render(() => <ReactiveTreeView editor={editor} projection={projection} />, host); editor.installGateway(document);
  cleanup.push(() => { unmount(); editor.dispose(); });
  const node = (id: string) => Object.values(projection.state.nodes).find(node => node.payload.id === id)!;
  const flow = (id: string) => editor.mounts.get(node(id).key)!.focusElement;
  const caret = (id: string, index: number) => { flow(id).focus(); editor.mounts.get(node(id).key)!.restoreInlineSelection!({ anchor: index, head: index }); };
  return { editor, projection, host, node, flow, caret };
}
describe("editing without an optional retained-range operation", () => {
  it("keeps local and cross-Block typing/selection/undo functional with no provider", () => {
    const { editor, node, flow, caret } = fixture();
    expect(editor.currentTextOperation.owner()).toBeUndefined(); expect(editor.featureActions.toolbar()).toEqual([]);
    const before = encodeDocument(editor.repository.readState());
    caret("a", 2); flow("a").dispatchEvent(new InputEvent("beforeinput", { inputType: "insertText", data: "X", bubbles: true, cancelable: true }));
    expect(editor.encodeDocument().children![0].text).toBe("alXpha beta");
    editor.repository.undo(); expect(encodeDocument(editor.repository.readState())).toEqual(before);
    editor.crossText.enable(true);
    editor.crossText.set(editor.crossText.position(node("a").key, 2), editor.crossText.position(node("b").key, 3));
    expect(editor.crossText.selectedText()).toBe("pha beta\ngam");
    flow("a").dispatchEvent(new InputEvent("beforeinput", { inputType: "insertText", data: "Z", bubbles: true, cancelable: true }));
    expect(editor.encodeDocument().children![0].text).toBe("alZma delta");
    editor.repository.undo(); expect(encodeDocument(editor.repository.readState())).toEqual(before);
  });
  it("retains ordinary annotations and Show/Hide authored rendering without deletion authority", () => {
    const { editor, projection, node, host } = fixture();
    const before = editor.encodeDocument();
    expect(host.querySelectorAll(".reactive-standoff-cell--concealed")).toHaveLength(4);
    editor.showHide.toggle(projection.state.rootKey);
    expect(host.querySelectorAll(".reactive-standoff-cell--concealed")).toHaveLength(0);
    expect(editor.encodeDocument()).toEqual(before);
    editor.rangeAnnotations.apply([editor.textRanges.snapshot(node("a").key, 0, 5)], "style/bold");
    expect(node("a").payload.standoffProperties).toContainEqual(expect.objectContaining({ type: "style/bold", start: 0, end: 4 }));
    editor.rangeAnnotations.apply([editor.textRanges.snapshot(node("b").key, 0, 5)], "style/show-hide");
    expect(editor.showHide.selectionActive()).toBe(true); expect(editor.currentTextOperation.active()).toBeUndefined();
    const wire = editor.encodeDocument(), reloaded = new ReactiveEditor(wire, { features: { grouping: false } });
    cleanup.push(() => reloaded.dispose()); expect(reloaded.encodeDocument()).toEqual(wire);
  });
  it("keeps passive Find/Entity ranges separate from native text deletion", () => {
    const { editor, node, flow, caret } = fixture();
    const ranges = [editor.textRanges.snapshot(node("a").key, 0, 5), editor.textRanges.snapshot(node("b").key, 0, 5)];
    editor.decorations.attachRanges("find", ranges, { type: "editor/search-match" });
    editor.decorations.attachRanges("entity", ranges, { type: "editor/entity-list-preview" });
    caret("b", 11);
    const key = new KeyboardEvent("keydown", { key: "Backspace", bubbles: true, cancelable: true });
    flow("b").dispatchEvent(key); expect(key.defaultPrevented).toBe(false);
    flow("b").dispatchEvent(new InputEvent("beforeinput", { inputType: "deleteContentBackward", bubbles: true, cancelable: true }));
    expect(editor.encodeDocument().children!.map(node => node.text)).toEqual(["alpha beta", "gamma delt"]);
    expect(editor.currentTextOperation.active()).toBeUndefined();
  });
});
