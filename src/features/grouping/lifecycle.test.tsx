import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "solid-js/web";
import { ReactiveEditor } from "../../reactive-editor/editor";
import { registerApplicationViews } from "../../application/features";
import { textOperationCapabilities } from "../../application/text-operation-capabilities";
import { registerCoreViews } from "../../rendering/register-core-views";
import { ReactiveTreeView } from "../../rendering/reactive-tree-view";
import { createGroupingFeature } from "./index";

const disposers: (() => void)[] = [];
afterEach(() => { disposers.splice(0).reverse().forEach(dispose => dispose()); document.body.replaceChildren(); localStorage.clear(); vi.restoreAllMocks(); });
function fixture(grouping = true) {
  const editor = new ReactiveEditor({ type: "document-window-block", children: [{ type: "document-block", children: [
    { id: "a", type: "standoff-editor-block", text: "alpha beta" },
  ] }] }, { features: { grouping, timer: false, compactEditorChrome: false } });
  disposers.push(() => editor.dispose());
  const projection = editor.createView("lifetime"), node = Object.values(projection.state.nodes).find(n => n.payload.id === "a")!;
  return { editor, projection, node };
}
describe("Grouping feature lifetime", () => {
  it.each([false, true])("activates only through composition (grouping=%s)", enabled => {
    const { editor } = fixture(enabled);
    expect(editor.currentTextOperation.owner()).toBeUndefined();
    expect(editor.featureHost.list()).toEqual([]);
    registerApplicationViews(editor);
    expect(editor.featureHost.list().includes("grouping")).toBe(enabled);
    expect(editor.currentTextOperation.owner()).toBe(enabled ? "grouping" : undefined);
    expect(editor.commandRegistry.owner("grouping.delete")).toBe(enabled ? "grouping" : undefined);
    expect(editor.featureActions.toolbar()).toHaveLength(enabled ? 1 : 0);
  });
  it("owns registrations, notices, highlights, subscriptions and retained visibility across repeated disposal", () => {
    for (let i = 0; i < 3; i++) {
      const { editor, projection, node } = fixture(); registerCoreViews(editor);
      const subscribe = editor.repository.subscribeBeforeChanges.bind(editor.repository), stops: ReturnType<typeof vi.fn>[] = [];
      vi.spyOn(editor.repository, "subscribeBeforeChanges").mockImplementation(listener => {
        const stop = vi.fn(subscribe(listener)); stops.push(stop); return stop;
      });
      const feature = createGroupingFeature(scope => textOperationCapabilities(editor, scope));
      const release = editor.featureHost.activate(feature), selection = feature.selection!;
      const host = document.body.appendChild(document.createElement("div"));
      const unmount = render(() => <ReactiveTreeView editor={editor} projection={projection} />, host);
      disposers.push(unmount); editor.installGateway(document);
      selection.begin(projection.state.rootKey); selection.add(node.key, 0, 5);
      expect(host.textContent).toContain("1 grouped range");
      expect(editor.decorations.nodes[node.key][0].owner).toBe("grouping");
      selection.apply("style/show-hide");
      const authored = editor.encodeDocument(); expect(editor.showHide.selectionActive()).toBe(true);
      release(); release();
      expect(editor.currentTextOperation.owner()).toBeUndefined();
      expect(editor.commandRegistry.owner("grouping.delete")).toBeUndefined();
      expect(editor.featureActions.toolbar()).toEqual([]);
      expect(host.textContent).not.toContain("grouped range");
      expect(Object.values(editor.decorations.nodes).flat()).toHaveLength(0);
      expect(editor.showHide.selectionActive()).toBe(false);
      expect(editor.encodeDocument()).toEqual(authored);
      expect(selection.deleteSelected(node.key)).toBe(false);
      expect(stops).toHaveLength(1); expect(stops[0]).toHaveBeenCalledOnce();
      editor.repository.undo(); expect(selection.message()).toBe("");
      const releaseProbe = editor.selectionGestures.register({ owner: "probe", modifier: "Control", complete() {}, removeAt: () => false, error() {} }); releaseProbe();
    }
  });
  it("rolls back a partially activated module without taking another owner's contribution", () => {
    const { editor } = fixture();
    const releaseOther = editor.featureActions.registerToolbar({ id: "grouping.selection", notice: () => "other", selectionDetails: () => null }, "other");
    const feature = createGroupingFeature(scope => textOperationCapabilities(editor, scope));
    expect(() => editor.featureHost.activate(feature)).toThrow("activation failed");
    expect(editor.featureHost.list()).toEqual([]);
    expect(editor.currentTextOperation.owner()).toBeUndefined();
    expect(editor.commandRegistry.owner("grouping.cancel")).toBeUndefined();
    expect(editor.featureActions.toolbar().map(item => item.owner)).toEqual(["other"]);
    releaseOther();
  });
  it("disposal invalidates pointer completion already queued by core input", async () => {
    const { editor, projection, node } = fixture(); registerCoreViews(editor);
    const feature = createGroupingFeature(scope => textOperationCapabilities(editor, scope)); const release = editor.featureHost.activate(feature);
    const host = document.body.appendChild(document.createElement("div"));
    disposers.push(render(() => <ReactiveTreeView editor={editor} projection={projection} />, host)); editor.installGateway(document);
    const flow = editor.mounts.get(node.key)!.focusElement; flow.focus();
    flow.dispatchEvent(new MouseEvent("pointerdown", { ctrlKey: true, bubbles: true, button: 0 }));
    editor.mounts.get(node.key)!.restoreInlineSelection!({ anchor: 0, head: 5 });
    flow.dispatchEvent(new MouseEvent("pointerup", { ctrlKey: true, bubbles: true, button: 0 }));
    release(); await Promise.resolve();
    expect(feature.selection!.ranges()).toEqual([]); expect(editor.currentTextOperation.active()).toBeUndefined();
    expect(Object.values(editor.decorations.nodes).flat()).toHaveLength(0);
  });
});
