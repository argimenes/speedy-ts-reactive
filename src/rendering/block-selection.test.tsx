import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "solid-js/web";
import { ReactiveEditor } from "../reactive-editor/editor";
import { registerCoreViews } from "./register-core-views";
import { ReactiveTreeView } from "./reactive-tree-view";
import type { ExistingBlockDto } from "../block-tree/types";
const disposers: (() => void)[] = [];
afterEach(() => { while (disposers.length) disposers.pop()!(); document.body.replaceChildren(); vi.restoreAllMocks(); });
const paragraph = (id: string): ExistingBlockDto => ({ id, type: "standoff-editor-block", text: `Text ${id}` });
const tick = async () => { await Promise.resolve(); await Promise.resolve(); };
function setup(children = ["a", "b", "c", "d"].map(paragraph)) {
  const editor = new ReactiveEditor({ type: "document-block", children }); registerCoreViews(editor);
  const projection = editor.createView("selection-test");
  const host = document.body.appendChild(document.createElement("div")); host.className = "workspace-demo";
  const dispose = render(() => <ReactiveTreeView editor={editor} projection={projection} />, host); editor.installGateway(document);
  disposers.push(() => { dispose(); editor.dispose(); });
  const key = (id: string) => Object.values(projection.state.nodes).find(n => n.payload.id === id)!.key;
  const root = (id: string) => host.querySelector<HTMLElement>(`[data-block-id="${id}"]`)!;
  const handle = (id: string) => root(id).querySelector<HTMLButtonElement>(":scope > [data-block-selection-handle]")!;
  const click = (id: string, modifiers: MouseEventInit = {}) => {
    const button = handle(id); button.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, cancelable: true, button: 0, ...modifiers })); button.focus();
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ...modifiers }));
  };
  const keys = (key: string, options: KeyboardEventInit = {}) => document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...options }));
  return { editor, projection, host, key, root, handle, click, keys };
}
describe("Block selection and reordering", () => {
  it("selects single, forward/reverse ranges, toggles and additive ranges without changing document data", () => {
    const { editor, click, root } = setup(); const before = editor.encodeDocument();
    const snapshot = vi.spyOn(editor.repository, "snapshot");
    click("b"); expect(editor.blockSelection.ids).toEqual(["b"]); expect(root("b").classList.contains("block-is-selected")).toBe(true);
    click("d", { shiftKey: true }); expect(editor.blockSelection.ids).toEqual(["b", "c", "d"]);
    click("a", { shiftKey: true }); expect(editor.blockSelection.ids).toEqual(["a", "b"]);
    click("d", { ctrlKey: true }); expect(editor.blockSelection.ids).toEqual(["a", "b", "d"]);
    click("b", { metaKey: true }); expect(editor.blockSelection.ids).toEqual(["a", "d"]);
    click("c", { ctrlKey: true, shiftKey: true }); expect(editor.blockSelection.ids).toEqual(["a", "b", "c", "d"]);
    expect(editor.blockSelection.snapshot()[0]).toMatchObject({ blockId: "a", viewId: "selection-test", type: "standoff-editor-block" });
    expect(snapshot).not.toHaveBeenCalled(); snapshot.mockRestore();
    expect(editor.encodeDocument()).toEqual(before); expect(editor.repository.state.revision).toBe(0);
  });
  it("supports keyboard navigation, range extension and Escape without touching inline Cell flows", () => {
    const { editor, click, handle, keys, root } = setup(); click("b"); keys("ArrowDown", { shiftKey: true });
    expect(editor.blockSelection.ids).toEqual(["b", "c"]); expect(document.activeElement).toBe(handle("c"));
    keys("ArrowUp", { shiftKey: true }); expect(editor.blockSelection.ids).toEqual(["b"]);
    keys("Escape"); expect(editor.blockSelection.ids).toEqual([]);
    expect(document.activeElement).toBe(root("b").querySelector(".reactive-standoff-flow"));
    expect(root("b").querySelector(".reactive-standoff-flow [data-block-selection-handle]")).toBeNull();
  });
  it("keeps Ctrl-click context menus inside text and never opens one from a selection handle", () => {
    const { editor, click, handle, root } = setup(); click("a"); click("c", { ctrlKey: true });
    handle("c").dispatchEvent(new MouseEvent("contextmenu", { ctrlKey: true, bubbles: true, cancelable: true }));
    expect(editor.overlays.overlays).toHaveLength(0); expect(editor.blockSelection.ids).toEqual(["a", "c"]);
    handle("b").dispatchEvent(new MouseEvent("pointerdown", { ctrlKey: true, bubbles: true }));
    handle("b").dispatchEvent(new MouseEvent("contextmenu", { ctrlKey: true, bubbles: true, cancelable: true }));
    handle("b").dispatchEvent(new MouseEvent("click", { ctrlKey: true, bubbles: true, cancelable: true }));
    expect(editor.blockSelection.ids).toEqual(["a", "b", "c"]);
    click("b", { ctrlKey: true }); expect(editor.blockSelection.ids).toEqual(["a", "c"]);
    const flow = root("b").querySelector(".reactive-standoff-flow")!;
    flow.dispatchEvent(new MouseEvent("click", { ctrlKey: true, bubbles: true, cancelable: true }));
    expect(editor.overlays.overlays[0].viewType).toBe("context-menu"); expect(editor.blockSelection.ids).toEqual(["a", "c"]);
    flow.dispatchEvent(new MouseEvent("pointerdown", { button: 0, bubbles: true })); expect(editor.blockSelection.ids).toEqual([]);
  });
  it("normalizes selected descendants, keeps margins separate and prunes removed targets", async () => {
    const { editor, click, key } = setup([paragraph("a"), { id: "group", type: "indented-list-block", children: [paragraph("nested")] }, paragraph("d")]);
    click("group"); click("nested", { ctrlKey: true });
    expect(editor.blockSelection.ids).toEqual(["group", "nested"]);
    expect(editor.blockSelection.actionTargets().map(item => item.blockId)).toEqual(["group"]);
    editor.commands.remove(key("group")); await tick(); expect(editor.blockSelection.ids).toEqual([]);
    editor.commands.ensureMargin(key("a"), "left");
    click("a");
    const margin = editor.node(editor.node(key("a"))!.ownedRelations.leftMargin)!;
    editor.blockSelection.select(margin.children[0], "toggle");
    expect(editor.blockSelection.state.scopeKey).toBe(margin.key); expect(editor.blockSelection.state.items).toHaveLength(1);
  });
  it("excludes inactive tabs and clears hidden selections on tab switches", async () => {
    const { editor, click, host } = setup([{ id: "tabs", type: "tab-row-block", children: [{ type: "tab-block", metadata: { active: true, name: "First" }, children: [paragraph("a")] }, { type: "tab-block", metadata: { name: "Second" }, children: [paragraph("hidden")] }] }, paragraph("d")]);
    click("a"); click("d", { shiftKey: true }); expect(editor.blockSelection.ids).toEqual(["a", "d"]);
    click("a"); host.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1].click(); await tick(); expect(editor.blockSelection.ids).toEqual([]);
  });
  it("isolates views and provides a placement-key fallback for legacy Blocks without IDs", () => {
    const { editor, click, key } = setup(); click("a");
    const second = editor.createView("second"); const host = document.body.appendChild(document.createElement("div"));
    const dispose = render(() => <ReactiveTreeView editor={editor} projection={second} />, host); disposers.push(dispose);
    const other = Object.values(second.state.nodes).find(node => node.payload.id === "b")!;
    editor.blockSelection.select(other.key, "toggle"); expect(editor.blockSelection.ids).toEqual(["b"]); expect(editor.blockSelection.state.viewId).toBe("second");
    expect(editor.blockSelection.isSelected(key("a"))).toBe(false);
    editor.commands.insert({ type: "standoff-editor-block", text: "No ID" }, { kind: "after", anchorKey: key("d") });
    const missing = Object.values(second.state.nodes).find(node => node.viewType === "standoff-editor-block" && !node.payload.id)!;
    editor.blockSelection.select(missing.key); expect(editor.blockSelection.ids).toEqual([missing.placementKey]);
  });
  it("reorders discontiguous selections together in order with atomic undo and redo", () => {
    const { editor, click, key } = setup(); const before = editor.encodeDocument();
    click("a"); click("c", { ctrlKey: true });
    expect(editor.blockSelection.moveTo(key("d"), "after")).toBe(true);
    expect(editor.encodeDocument().children!.map(b => b.id)).toEqual(["b", "d", "a", "c"]);
    expect(editor.blockSelection.ids).toEqual(["a", "c"]);
    editor.repository.undo(); expect(editor.encodeDocument()).toEqual(before);
    editor.repository.redo(); expect(editor.encodeDocument().children!.map(b => b.id)).toEqual(["b", "d", "a", "c"]);
    const revision = editor.repository.state.revision;
    expect(editor.blockSelection.moveTo(key("a"), "after")).toBe(false); expect(editor.repository.state.revision).toBe(revision);
  });
  it("handles drag/drop events and rejects cross-parent list moves", () => {
    const { editor, click, handle, root, key } = setup([paragraph("a"), paragraph("b"), { id: "group", type: "indented-list-block", children: [paragraph("nested")] }]);
    click("a"); const dataTransfer = { setData: vi.fn(), effectAllowed: "", dropEffect: "" };
    const drag = (element: Element, type: string, clientY = 20) => {
      const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientY }); Object.defineProperty(event, "dataTransfer", { value: dataTransfer }); element.dispatchEvent(event); return event;
    };
    drag(handle("a"), "dragstart"); expect(dataTransfer.effectAllowed).toBe("move");
    expect(drag(root("b"), "dragover").defaultPrevented).toBe(true); expect(root("b").dataset.blockDrop).toBe("after");
    drag(root("b"), "drop"); drag(handle("a"), "dragend");
    expect(editor.encodeDocument().children!.map(b => b.id)).toEqual(["b", "a", "group"]);
    expect(root("b").dataset.blockDrop).toBeUndefined();
    const revision = editor.repository.state.revision; expect(editor.blockSelection.moveTo(key("nested"), "before")).toBe(false); expect(editor.repository.state.revision).toBe(revision);
  });
});
