import { afterEach, describe, expect, it } from "vitest";
import { render } from "solid-js/web";
import { ReactiveEditor } from "../reactive-editor/editor";
import { registerCoreViews } from "./register-core-views";
import { ReactiveTreeView } from "./reactive-tree-view";
import { blockMenuItems } from "../runtime/block-menu-actions";
import { keyboard } from "../input/bindings";

const cleanup: (() => void)[] = [];
afterEach(() => { while (cleanup.length) cleanup.pop()!(); document.body.replaceChildren(); localStorage.clear(); });
const tick = async () => { await Promise.resolve(); await Promise.resolve(); };
function setup() {
  const editor = new ReactiveEditor({ type: "document-window-block", children: [{ type: "document-block", children: [
    { id: "before", type: "standoff-editor-block", text: "Before" },
    { id: "source", type: "standoff-editor-block", text: "one 😀 two", standoffProperties: [{ id: "annotation", type: "style/bold", start: 0, end: 2, metadata: { keep: true } }], relation: { leftMargin: { id: "margin", type: "left-margin-block", children: [{ id: "note", type: "standoff-editor-block", text: "Note" }] } } },
    { id: "after", type: "standoff-editor-block", text: "After" },
  ] }] });
  registerCoreViews(editor); const projection = editor.createView("text-tab-test");
  const host = document.body.appendChild(document.createElement("div"));
  const dispose = render(() => <ReactiveTreeView editor={editor} projection={projection} />, host); editor.installGateway(document);
  cleanup.push(() => { dispose(); editor.dispose(); });
  const node = (id: string) => Object.values(projection.state.nodes).find(n => n.payload.id === id)!;
  const flow = () => host.querySelector<HTMLElement>('[data-block-id="source"] > .reactive-standoff-surface > .reactive-standoff-flow')!;
  const focus = () => { flow().focus(); editor.mounts.get(node("source").key)!.restoreInlineSelection!({ anchor: 2, head: 5 }); document.dispatchEvent(new Event("selectionchange")); };
  const trigger = (extra: KeyboardEventInit = {}) => { const event = new KeyboardEvent("keydown", { key: "t", ctrlKey: true, bubbles: true, cancelable: true, ...extra }); document.activeElement!.dispatchEvent(event); return event; };
  const blocks = () => editor.encodeDocument().children![0].children!;
  return { editor, host, node, flow, focus, trigger, blocks };
}
describe("text-block tabs", () => {
  it("wraps in place and preserves identity, annotations, margins and selection; appends an independent copy", async () => {
    const { editor, focus, trigger, blocks, node } = setup(); focus();
    const before = blocks(); expect(trigger().defaultPrevented).toBe(true); await tick();
    expect(blocks().map(b => b.id ?? b.type)).toEqual(["before", expect.any(String), "after"]);
    const row = blocks()[1]; expect(row.type).toBe("tab-row-block");
    expect(row.children![0]).toMatchObject({ type: "tab-block", metadata: { name: "1", active: true }, children: [{ id: "source", text: "one 😀 two" }] });
    expect(editor.mounts.get(node("source").key)!.captureInlineSelection!()).toEqual({ anchor: 2, head: 5 });
    editor.repository.undo(); expect(blocks()).toEqual(before);
    editor.repository.redo(); expect(blocks()[1].type).toBe("tab-row-block"); focus();
    expect(trigger({ ctrlKey: false, altKey: true }).defaultPrevented).toBe(true); await tick();
    const tabs = blocks()[1].children!; expect(tabs).toHaveLength(2);
    const original = tabs[0].children![0], copy = tabs[1].children![0];
    expect(tabs[0].metadata).toMatchObject({ active: false }); expect(tabs[1].metadata).toMatchObject({ active: true, name: "2" });
    expect(copy.id).not.toBe(original.id); expect(copy.text).toBe(original.text);
    expect(copy.standoffProperties).toEqual([expect.objectContaining({ type: "style/bold", start: 0, end: 2, metadata: { keep: true } })]);
    expect((copy.standoffProperties as any[])[0].id).not.toBe("annotation");
    expect((copy.relation!.leftMargin as any).id).not.toBe("margin");
    expect((copy.relation!.leftMargin as any).children[0].text).toBe("Note");
    expect(document.activeElement).toBe(editor.mounts.get(node(copy.id!).key)!.focusElement);
    editor.commands.replaceInlineRange(node(copy.id!).key, 0, 0, "Changed "); expect(blocks()[1].children![0].children![0].text).toBe("one 😀 two");
    const saved = editor.encodeDocument(), loaded = new ReactiveEditor(saved); expect(loaded.encodeDocument()).toEqual(saved); loaded.dispose();
  });
  it("uses the same action from the toolbar and context menu", async () => {
    const { host, focus, blocks, node, editor } = setup(); focus();
    const button = host.querySelector<HTMLButtonElement>('[aria-label="To tab / add tab"]')!;
    button.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, cancelable: true })); button.click(); await tick();
    expect(blocks()[1].type).toBe("tab-row-block");
    blockMenuItems(editor, node("source").key).find(item => item.label === "To tab / add tab")!.run!(); await tick();
    expect(blocks()[1].children).toHaveLength(2);
    editor.repository.undo(); expect(blocks()[1].children).toHaveLength(1);
  });
  it("honours rebinding and ignores composition, repeats, extra modifiers and native fields", async () => {
    const { focus, trigger, blocks, editor, host } = setup(); focus();
    for (const extra of [{ isComposing: true }, { repeat: true }, { shiftKey: true }, { metaKey: true }]) { trigger(extra); expect(blocks()[1].id).toBe("source"); }
    editor.bindings.assign("tabs.create", [keyboard("F8")]);
    expect(trigger().defaultPrevented).toBe(false); expect(blocks()[1].id).toBe("source");
    const input = host.querySelector<HTMLInputElement>('input[type="color"]')!; input.focus();
    expect(trigger({ key: "F8", ctrlKey: false }).defaultPrevented).toBe(false);
    focus(); expect(trigger({ key: "F8", ctrlKey: false }).defaultPrevented).toBe(true); await tick();
    expect(blocks()[1].type).toBe("tab-row-block");
    expect(host.querySelector('[aria-label="To tab / add tab"]')!.getAttribute("title")).toContain("F8");
  });
});
