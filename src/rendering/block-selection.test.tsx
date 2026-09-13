import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "solid-js/web";
import { ReactiveEditor } from "../reactive-editor/editor";
import { registerCoreViews } from "./register-core-views";
import { ReactiveTreeView } from "./reactive-tree-view";
import type { ExistingBlockDto } from "../block-tree/types";
import { BindingRegistry } from "../input/bindings";
import { registerInputActions } from "../input/binding-catalog";
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
  it.each(["ctrlKey", "metaKey"] as const)("undoes and redoes document changes with %s from text and Block handles", modifier => {
    const { editor, key, root, handle } = setup();
    const flow = root("a").querySelector<HTMLElement>(".reactive-standoff-flow")!;
    const press = (target: HTMLElement, shiftKey = false) => {
      const event = new KeyboardEvent("keydown", { key: shiftKey ? "Z" : "z", [modifier]: true, shiftKey, bubbles: true, cancelable: true });
      target.dispatchEvent(event); return event;
    };
    editor.commands.replaceInlineRange(key("a"), 0, 0, "New ");
    flow.focus(); expect(press(flow).defaultPrevented).toBe(true);
    expect(editor.encodeDocument().children![0].text).toBe("Text a");
    expect(press(flow, true).defaultPrevented).toBe(true);
    expect(editor.encodeDocument().children![0].text).toBe("New Text a");
    handle("a").focus(); press(handle("a"));
    expect(editor.encodeDocument().children![0].text).toBe("Text a");
    press(handle("a"), true); expect(editor.encodeDocument().children![0].text).toBe("New Text a");
    const input = root("a").appendChild(document.createElement("input")); input.focus();
    expect(press(input).defaultPrevented).toBe(false);
    expect(editor.encodeDocument().children![0].text).toBe("New Text a");
    const composing = new KeyboardEvent("keydown", { key: "z", [modifier]: true, isComposing: true, bubbles: true, cancelable: true });
    flow.dispatchEvent(composing); expect(composing.defaultPrevented).toBe(false);
  });
  it("registers platform-specific, reassignable Block clipboard shortcuts", () => {
    for (const platform of ["MacIntel", "Win32", "Linux x86_64"]) {
      const registry = new BindingRegistry(); registerInputActions(registry, platform);
      const run = vi.fn(); const mac = platform === "MacIntel";
      expect(registry.dispatch(new KeyboardEvent("keydown", { key: "c", metaKey: mac, ctrlKey: !mac, cancelable: true }), ["block-handle"], run)).toBe(true);
      expect(run).toHaveBeenCalledWith("selection.copy");
      expect(registry.dispatch(new KeyboardEvent("keydown", { key: "c", metaKey: !mac, ctrlKey: mac, cancelable: true }), ["block-handle"], run)).toBe(false);
      registry.dispose();
    }
  });
  it("copies discontiguous Blocks, pastes fresh identities after the destination and supports undo/redo", async () => {
    const { editor, click, keys } = setup();
    const primary = /Mac|iPhone|iPad|iPod/i.test(navigator.platform) ? { metaKey: true } : { ctrlKey: true };
    click("a"); click("c", { ctrlKey: true }); keys("c", primary);
    expect(editor.repository.state.revision).toBe(0);
    click("d"); keys("v", primary); await tick();
    const blocks = editor.encodeDocument().children!;
    expect(blocks.map(b => b.text)).toEqual(["Text a", "Text b", "Text c", "Text d", "Text a", "Text c"]);
    expect(new Set(blocks.map(b => b.id)).size).toBe(6);
    expect(editor.blockSelection.ids).toEqual(blocks.slice(4).map(b => b.id));
    editor.repository.undo(); expect(editor.encodeDocument().children).toHaveLength(4);
    editor.repository.redo(); expect(editor.encodeDocument().children).toHaveLength(6);
  });
  it("cuts all Blocks and pastes from the empty-list inspector, preserving cut IDs once", async () => {
    const { editor, click, keys } = setup();
    const primary = /Mac|iPhone|iPad|iPod/i.test(navigator.platform) ? { metaKey: true } : { ctrlKey: true };
    click("a"); click("d", { shiftKey: true }); keys("x", primary); await tick();
    expect(editor.encodeDocument().children).toEqual([]);
    expect(document.activeElement?.hasAttribute("data-block-selection-inspector")).toBe(true);
    keys("v", primary); await tick();
    expect(editor.encodeDocument().children!.map(b => b.id)).toEqual(["a", "b", "c", "d"]);
    keys("v", primary); await tick();
    expect(new Set(editor.encodeDocument().children!.map(b => b.id)).size).toBe(8);
    editor.repository.undo(); expect(editor.encodeDocument().children).toHaveLength(4);
    editor.repository.undo(); expect(editor.encodeDocument().children).toHaveLength(0);
    editor.repository.undo(); expect(editor.encodeDocument().children!.map(b => b.id)).toEqual(["a", "b", "c", "d"]);
  });
  it("deletes the selection atomically, ignores repeats, and leaves ID field copy native", async () => {
    const { editor, click, keys } = setup(); click("a"); click("c", { ctrlKey: true });
    const input = document.querySelector<HTMLInputElement>('input[aria-label="Selected Block ID"]')!; input.focus();
    const event = new KeyboardEvent("keydown", { key: "c", ctrlKey: true, bubbles: true, cancelable: true }); input.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    click("a"); click("c", { ctrlKey: true }); keys("Delete", { repeat: true });
    expect(editor.encodeDocument().children).toHaveLength(4);
    keys("Backspace"); await tick(); expect(editor.encodeDocument().children!.map(b => b.id)).toEqual(["b", "d"]);
    editor.repository.undo(); expect(editor.encodeDocument().children!.map(b => b.id)).toEqual(["a", "b", "c", "d"]);
  });
  it("keeps nested data and inline images lossless with immutable snapshots and remapped references", () => {
    const { editor, click, key } = setup([
      { ...paragraph("a"), standoffProperties: [{ id: "annotation", type: "codex/block-reference", start: 0, end: 2, value: "a" }], relation: { leftMargin: { type: "left-margin-block", children: [paragraph("note")] } } }, paragraph("b"),
    ]);
    editor.commands.insertInlineImage(key("a"), 1, { assetId: "image-asset", src: "test.png", alt: "picture" });
    click("a"); editor.blockClipboard.copy();
    editor.commands.setPayloadField(key("a"), "metadata", { changed: true });
    click("b"); editor.blockClipboard.paste();
    const copied = editor.node(editor.blockSelection.nodeKeys[0])!;
    expect(copied.payload.metadata).toBeUndefined();
    const property = (copied.payload.standoffProperties as any[])[0];
    expect(property.id).not.toBe("annotation"); expect(property.value).toBe(copied.payload.id);
    expect(copied.inlineContent.map(key => editor.node(key)!.viewType)).toContain("image-cell");
    expect(Object.keys(copied.ownedRelations)).toContain("leftMargin");
  });
  it("shares the clipboard between documents and clones cut IDs when undo restored their source", () => {
    const first = setup(); first.click("a"); first.editor.blockClipboard.remove(true);
    first.editor.repository.undo(); first.click("d"); first.editor.blockClipboard.paste();
    expect(new Set(first.editor.encodeDocument().children!.map(b => b.id)).size).toBe(5);
    const second = setup([paragraph("destination")]); second.click("destination"); second.editor.blockClipboard.paste();
    expect(second.editor.encodeDocument().children!.map(b => b.text)).toEqual(["Text destination", "Text a"]);
  });
  it("does not partially cut or replace the clipboard on a failed removal", () => {
    const { editor, click } = setup(); click("b"); editor.blockClipboard.copy();
    click("a"); click("c", { ctrlKey: true });
    const before = editor.encodeDocument(), remove = editor.commands.remove.bind(editor.commands);
    let count = 0; const spy = vi.spyOn(editor.commands, "remove").mockImplementation(key => { if (++count === 2) throw new Error("failed removal"); remove(key); });
    expect(() => editor.blockClipboard.remove(true)).toThrow("failed removal");
    expect(editor.encodeDocument()).toEqual(before); spy.mockRestore();
    click("d"); editor.blockClipboard.paste(); expect(editor.encodeDocument().children!.at(-1)!.text).toBe("Text b");
  });
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
