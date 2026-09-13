import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "solid-js/web";
import { ReactiveEditor } from "../reactive-editor/editor";
import { registerCoreViews } from "./register-core-views";
import { ReactiveTreeView } from "./reactive-tree-view";
import { DocumentStyleBar, annotationTools } from "./document-style-bar";
import type { ExistingBlockDto } from "../block-tree/types";

const cleanups: (() => void)[] = [];
afterEach(() => { cleanups.splice(0).reverse().forEach(fn => fn()); document.body.replaceChildren(); vi.restoreAllMocks(); });
const paragraph = (id: string, text = "abc😀def"): ExistingBlockDto => ({ id, type: "standoff-editor-block", text });
function setup(children = [paragraph("a"), paragraph("b"), paragraph("c")]) {
  const editor = new ReactiveEditor({ type: "document-block", children }); registerCoreViews(editor);
  const projection = editor.createView("cross-test"), host = document.body.appendChild(document.createElement("div"));
  const dispose = render(() => <><DocumentStyleBar editor={editor} /><ReactiveTreeView editor={editor} projection={projection} /></>, host); editor.installGateway(document);
  cleanups.push(() => { editor.dispose(); dispose(); host.remove(); });
  const node = (id: string) => Object.values(projection.state.nodes).find(n => n.payload.id === id)!;
  const point = (id: string, index: number) => editor.crossText.position(node(id).key, index);
  const flow = (id: string) => editor.mounts.get(node(id).key)!.focusElement;
  return { editor, projection, host, node, point, flow };
}
describe("experimental cross-Block text selection", () => {
  it("owns a held Shift+Left gesture from inside a Block through its first character into the previous Block", () => {
    const { editor, node, flow } = setup(); editor.crossText.enable(true);
    const mount = editor.mounts.get(node("b").key)!; mount.focus(); mount.restoreInlineSelection!({ anchor: 3, head: 3 });
    for (let i = 0; i < 6; i++) flow("b").dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", shiftKey: true, repeat: i > 0, bubbles: true, cancelable: true }));
    expect(editor.crossText.range()!.anchor.occurrenceKey).toBe(node("b").key);
    expect(editor.crossText.range()!.anchor.boundary.index).toBe(3);
    expect(editor.crossText.range()!.head.occurrenceKey).toBe(node("a").key);
    expect(editor.crossText.range()!.head.boundary.index).toBe(5);
    expect(editor.repository.state.revision).toBe(0);
  });
  it("clears a previous local highlight on click-away but preserves it for toolbar controls", () => {
    const { editor, node, flow, host } = setup();
    editor.selections.setPrimary(node("a").key, node("a").contentKey, node("a").viewId, 1, 4);
    host.querySelector('button[data-annotation-type]')!.dispatchEvent(new MouseEvent("pointerdown", { button: 0, bubbles: true }));
    expect(editor.selections.sets[node("a").key]).toBeDefined();
    flow("b").dispatchEvent(new MouseEvent("pointerdown", { button: 0, bubbles: true }));
    expect(editor.selections.sets[node("a").key]).toBeUndefined();
    editor.crossText.enable(true);
    editor.crossText.set(editor.crossText.position(node("a").key, 1), editor.crossText.position(node("b").key, 4));
    flow("c").dispatchEvent(new MouseEvent("pointerdown", { button: 0, bubbles: true }));
    expect(editor.crossText.range()).toBeUndefined();
  });
  it("is off by default; resolves reverse ranges and empty paragraphs without mutations", () => {
    const { editor, point, node } = setup([paragraph("a"), paragraph("b", ""), paragraph("c")]);
    expect(editor.crossText.set(point("a", 2), point("c", 4))).toBe(false);
    editor.crossText.enable(true);
    const snapshot = vi.spyOn(editor.repository, "snapshot");
    editor.crossText.set(point("c", 4), point("a", 2));
    expect(editor.crossText.resolve(point("c", 4), point("a", 2)).map(s => [s.start, s.end])).toEqual([[2, 7], [0, 0], [0, 4]]);
    expect(editor.crossText.range()!.anchor.occurrenceKey).toBe(node("c").key);
    expect(snapshot).not.toHaveBeenCalled(); expect(editor.repository.state.revision).toBe(0);
  });
  it("rejects media, nested-list, hidden, stale and cross-view endpoints", () => {
    const { editor, node, point, flow } = setup([paragraph("a"), { id: "media", type: "image-block" }, paragraph("b"), { type: "indented-list-block", children: [paragraph("nested")] }]);
    editor.crossText.enable(true);
    expect(() => editor.crossText.set(point("a", 0), point("b", 1))).toThrow("barriers");
    expect(() => editor.crossText.set(point("b", 0), point("nested", 1))).toThrow("boundaries");
    flow("b").hidden = true;
    expect(() => editor.crossText.set(point("b", 0), point("b", 1))).toThrow("barriers"); flow("b").hidden = false;
    expect(() => editor.crossText.set({ ...point("b", 0), contentKey: "stale" }, point("b", 1))).toThrow("stale");
    const view = editor.createView("other"), other = Object.values(view.state.nodes).find(n => n.contentKey === node("b").contentKey)!;
    expect(() => editor.crossText.set(point("b", 0), editor.crossText.position(other.key, 1))).toThrow("different views");
  });
  it("applies all ordinary styles and colours locally with atomic history and persistence", () => {
    const { editor, point } = setup([paragraph("a"), paragraph("b", ""), paragraph("c")]);
    editor.crossText.enable(true); editor.crossText.set(point("a", 2), point("c", 3));
    for (const type of [...annotationTools.map(t => t[0]), "text/colour", "text/background-colour"]) editor.crossText.annotate(type, type.startsWith("text/") ? "#123456" : undefined);
    const saved = editor.encodeDocument(), [a, b, c] = saved.children!;
    expect((a.standoffProperties as any[])).toHaveLength(17); expect(b.standoffProperties).toBeUndefined();
    expect((a.standoffProperties as any[])[0]).toMatchObject({ start: 2, end: 6 });
    expect((c.standoffProperties as any[])[0]).toMatchObject({ start: 0, end: 2 });
    const revision = editor.repository.state.revision; editor.crossText.annotate("style/bold"); expect(editor.repository.state.revision).toBe(revision);
    const restored = new ReactiveEditor(saved); expect(restored.encodeDocument()).toEqual(saved); restored.dispose();
    editor.repository.undo(); expect(editor.crossText.range()).toBeUndefined();
    expect((editor.encodeDocument().children![0].standoffProperties as any[])).toHaveLength(16);
    editor.repository.redo(); expect(editor.encodeDocument()).toEqual(saved);
  });
  it("rolls back a failed style command without damaging original annotations", () => {
    const { editor, point } = setup(); editor.crossText.enable(true); editor.crossText.set(point("a", 1), point("b", 3));
    const before = editor.encodeDocument(), original = editor.commands.setPayloadField.bind(editor.commands); let count = 0;
    vi.spyOn(editor.commands, "setPayloadField").mockImplementation((...args) => { if (++count === 2) throw new Error("failure"); original(...args); });
    expect(() => editor.crossText.annotate("style/bold")).toThrow("failure"); expect(editor.encodeDocument()).toEqual(before);
  });
  it("supports keyboard boundary extension, blocks mutations and collapses with Escape", () => {
    const { editor, node, flow } = setup(); editor.crossText.enable(true);
    const mount = editor.mounts.get(node("a").key)!; mount.focus(); mount.restoreInlineSelection!({ anchor: 5, head: 7 });
    flow("a").dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", shiftKey: true, bubbles: true, cancelable: true }));
    expect(editor.crossText.range()!.head.occurrenceKey).toBe(node("b").key);
    expect(flow("a").getAttribute("contenteditable")).toBe("false");
    const before = editor.encodeDocument();
    for (const type of ["beforeinput", "input", "compositionstart", "compositionend", "copy", "cut", "paste", "drop", "contextmenu"]) {
      const event = new Event(type, { bubbles: true, cancelable: true }); flow("a").dispatchEvent(event); expect(event.defaultPrevented).toBe(true);
    }
    for (const key of ["Enter", "Backspace", "Delete", "q"]) { const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }); flow("a").dispatchEvent(event); expect(event.defaultPrevented).toBe(true); }
    expect(editor.encodeDocument()).toEqual(before);
    flow("a").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    expect(editor.crossText.range()).toBeUndefined(); expect(flow("a").getAttribute("contenteditable")).toBe("true");
    expect(document.activeElement).toBe(flow("b"));
  });
  it("retains cross selection for toolbar styles, protects clear/layout actions and preserves local capture", () => {
    const { editor, point, flow, host, node } = setup(); editor.crossText.enable(true); flow("a").focus();
    editor.crossText.set(point("a", 1), point("b", 3));
    host.querySelector<HTMLButtonElement>('[data-annotation-type="style/bold"]')!.click();
    expect(editor.crossText.range()).toBeDefined();
    const before = editor.encodeDocument();
    host.querySelector<HTMLButtonElement>('[title="Clear formatting"]')!.click();
    host.querySelector<HTMLButtonElement>('[title="Increase indent"]')!.click();
    expect(editor.encodeDocument()).toEqual(before);
    editor.crossText.clear();
    const a = editor.mounts.get(node("a").key)!.inlineBoundary!(1), b = editor.mounts.get(node("b").key)!.inlineBoundary!(2);
    document.getSelection()!.setBaseAndExtent(a.node, a.offset, b.node, b.offset);
    expect(editor.mounts.get(node("a").key)!.captureInlineSelection!()).toBeUndefined();
  });
  it("invalidates before external text/structural changes and when a selected mount disappears", async () => {
    const { editor, point, node, flow } = setup(); editor.crossText.enable(true); editor.crossText.set(point("a", 1), point("b", 3));
    editor.commands.replaceInlineRange(node("a").key, 0, 1, "changed"); expect(editor.crossText.range()).toBeUndefined();
    editor.crossText.set(point("a", 1), point("b", 3)); flow("b").hidden = true;
    await Promise.resolve(); expect(editor.crossText.range()).toBeUndefined();
  });
  it("retains inline atoms and semantic data, and transfers ownership to whole-Block selection", () => {
    const { editor, node, point } = setup([
      { ...paragraph("a"), standoffProperties: [{ id: "semantic", type: "codex/entity-reference", start: 0, end: 1, value: "entity-1", metadata: { name: "Example" } }] }, paragraph("b"),
    ]);
    editor.commands.insertInlineImage(node("a").key, 2, { assetId: "asset", src: "image.png", alt: "image" });
    const before = structuredClone(editor.repository.readState().contents[node("a").contentKey].payload.standoffProperties);
    editor.crossText.enable(true); editor.crossText.set(point("a", 1), point("b", 3)); editor.crossText.annotate("style/rectangle");
    expect((node("a").payload.standoffProperties as unknown[])[0]).toEqual((before as unknown[])[0]);
    expect(node("a").inlineContent.map(key => editor.node(key)!.viewType)).toContain("image-cell");
    expect(() => editor.crossText.annotate("codex/entity-reference")).toThrow("ordinary styles");
    editor.blockSelection.select(node("b").key); expect(editor.crossText.range()).toBeUndefined(); expect(editor.blockSelection.ids).toEqual(["b"]);
  });
  it("applies formatting and undoes it through platform key bindings", () => {
    const { editor, point, flow } = setup(); editor.crossText.enable(true); flow("a").focus();
    editor.crossText.set(point("a", 1), point("b", 2));
    const primary = /Mac|iPhone|iPad|iPod/i.test(navigator.platform) ? { metaKey: true } : { ctrlKey: true };
    flow("a").dispatchEvent(new KeyboardEvent("keydown", { key: "b", ...primary, bubbles: true, cancelable: true }));
    expect((editor.encodeDocument().children![0].standoffProperties as any[])[0]).toMatchObject({ type: "style/bold", start: 1, end: 6 });
    flow("a").dispatchEvent(new KeyboardEvent("keydown", { key: "z", ...primary, bubbles: true, cancelable: true }));
    expect(editor.encodeDocument().children![0].standoffProperties).toBeUndefined(); expect(editor.crossText.range()).toBeUndefined();
  });
});
