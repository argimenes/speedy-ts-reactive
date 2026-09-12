import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "solid-js/web";
import { ReactiveEditor } from "../reactive-editor/editor";
import { registerCoreViews } from "./register-core-views";
import { ReactiveTreeView } from "./reactive-tree-view";

const disposers: Array<() => void> = [];
afterEach(() => { while (disposers.length) disposers.pop()!(); document.body.replaceChildren(); });
function setup(properties: Record<string, unknown>[] = [
  { id: "a", type: "style/bold", start: 0, end: 2, metadata: { preserved: true }, future: "keep" },
  { type: "codex/entity-reference", start: 1, end: 4, value: "entity-id" },
  { type: "style/italics", start: 0, end: 5, isDeleted: true },
]) {
  const editor = new ReactiveEditor({ type: "document-block", children: [{ id: "p", type: "standoff-editor-block", text: "one two three", standoffProperties: properties }] });
  registerCoreViews(editor); const projection = editor.createView("monitor-test");
  const host = document.body.appendChild(document.createElement("div"));
  const dispose = render(() => <ReactiveTreeView editor={editor} projection={projection} />, host);
  editor.installGateway(document);
  disposers.push(() => { dispose(); editor.dispose(); });
  const flow = host.querySelector<HTMLElement>(".reactive-standoff-flow")!;
  const key = projection.node(projection.state.rootKey)!.children[0];
  const open = async (caret = 2, combo: KeyboardEventInit = { key: ".", ctrlKey: true }) => {
    flow.focus(); const range = document.createRange(); range.setStart(flow, caret); range.collapse(true);
    document.getSelection()!.removeAllRanges(); document.getSelection()!.addRange(range);
    const event = new KeyboardEvent("keydown", { ...combo, bubbles: true, cancelable: true }); flow.dispatchEvent(event);
    await Promise.resolve(); return event;
  };
  const panel = () => document.querySelector<HTMLElement>(".reactive-annotation-monitor")!;
  const button = (label: string) => [...panel().querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === label)!;
  const propertiesNow = () => projection.node(key)!.payload.standoffProperties as Array<Record<string, unknown>>;
  return { editor, projection, key, flow, open, panel, button, propertiesNow };
}

describe("annotation monitor", () => {
  it("navigates annotations and action buttons without changing ranges, with explicit editing shortcuts", async () => {
    const { open, panel, propertiesNow } = setup(); await open();
    const key = (key: string, extra: KeyboardEventInit = {}) => document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key, ...extra, bubbles: true, cancelable: true }));
    key("ArrowDown");
    expect(document.activeElement).toBe(panel().querySelectorAll(".annotation-select")[1]);
    key("ArrowRight"); expect(document.activeElement?.textContent).toBe("Move left");
    key("ArrowRight"); expect(document.activeElement?.textContent).toBe("Move right");
    expect(propertiesNow()[1]).toMatchObject({ start: 1, end: 4 });
    key("ArrowRight", { shiftKey: true }); expect(propertiesNow()[1]).toMatchObject({ start: 2, end: 5 });
    key("ArrowLeft"); key("ArrowLeft");
    expect(document.activeElement).toBe(panel().querySelectorAll(".annotation-select")[1]);
    key("ArrowUp"); key("ArrowRight", { altKey: true });
    expect(propertiesNow()[0]).toMatchObject({ start: 4, end: 6 });
    expect(panel().querySelectorAll(".annotation-action kbd")).toHaveLength(7);
  });

  it("deletes an unselected annotation from its row, preserves selection and supports undo", async () => {
    const { editor, open, panel, propertiesNow } = setup(); await open();
    panel().querySelectorAll<HTMLButtonElement>(".annotation-trash")[1].click();
    expect(propertiesNow()[1].isDeleted).toBe(true);
    expect(propertiesNow()[0].isDeleted).toBeUndefined();
    expect(panel().querySelector<HTMLInputElement>("input[readonly]")!.value).toBe("a");
    editor.repository.undo(); expect(propertiesNow()[1].isDeleted).toBeUndefined();
  });

  it("drags and resizes without changing the document or reanchoring on selection", async () => {
    const { editor, open, panel } = setup(); await open();
    const before = editor.repository.snapshot(), header = panel().querySelector("header")!;
    header.setPointerCapture = vi.fn();
    const pointer = (target: Element, type: string, x: number, y: number) => target.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true, cancelable: true }));
    pointer(header, "pointerdown", 0, 0); pointer(header, "pointermove", 70, 80); pointer(header, "pointerup", 70, 80);
    expect(panel().style.left).toBe("70px"); expect(panel().style.top).toBe("80px");
    panel().querySelectorAll<HTMLButtonElement>(".annotation-select")[1].click(); await Promise.resolve();
    expect(panel().style.left).toBe("70px"); expect(panel().style.top).toBe("80px");
    const handle = panel().querySelector<HTMLElement>(".annotation-resize")!; handle.setPointerCapture = vi.fn();
    pointer(handle, "pointerdown", 0, 0); pointer(handle, "pointermove", 500, 300); pointer(handle, "pointerup", 500, 300);
    expect(panel().style.width).toBe("500px"); expect(panel().style.height).toBe("300px");
    expect(editor.repository.snapshot()).toEqual(before);
  });

  it("groups the horizontal columns, exposes a readonly annotation ID and displays populated entity details", async () => {
    const { editor, open, panel } = setup([{ id: "annotation-42", type: "codex/entity-reference", start: 0, end: 2, value: "entity-7", cache: { entity: { Guid: "entity-7", Name: "Vernon Blake" } } }]);
    const before = editor.repository.snapshot(); await open();
    expect(panel().querySelector(".annotation-layout > nav")).not.toBeNull();
    expect(panel().querySelector(".annotation-main blockquote")!.textContent).toBe("one");
    expect(panel().querySelectorAll(".annotation-settings textarea")).toHaveLength(2);
    const inputs = [...panel().querySelectorAll<HTMLInputElement>("input[readonly]")];
    expect(inputs.map(input => input.value)).toEqual(["annotation-42", "Vernon Blake", "entity-7"]);
    expect(editor.repository.snapshot()).toEqual(before);
  });

  it("shows honest fallbacks for missing IDs/names and ignores a mismatched entity cache", async () => {
    const { open, panel } = setup([{ type: "codex/entity-reference", start: 0, end: 2, value: "new-id", cache: { entity: { Guid: "old-id", Name: "Wrong entity" } } }]);
    await open();
    expect([...panel().querySelectorAll<HTMLInputElement>("input[readonly]")].map(input => input.value)).toEqual(["Not supplied", "Entity name not loaded", "new-id"]);
  });

  it("anchors below and 100px left of the selected annotation start, updating on selection", async () => {
    const { flow, open, panel } = setup();
    const first = flow.children[0], second = flow.children[1];
    const rect = (left: number, bottom: number) => ({ left, bottom, top: bottom - 20, right: left + 10, width: 10, height: 20, x: left, y: bottom - 20, toJSON: () => ({}) });
    vi.spyOn(first, "getClientRects").mockReturnValue([rect(300, 150)] as unknown as DOMRectList);
    vi.spyOn(second, "getClientRects").mockReturnValue([rect(400, 180)] as unknown as DOMRectList);
    await open(); await Promise.resolve();
    expect(panel().style.left).toBe("200px"); expect(panel().style.top).toBe("171px");
    panel().querySelectorAll<HTMLButtonElement>(".annotation-select")[1].click(); await Promise.resolve();
    expect(panel().style.left).toBe("300px"); expect(panel().style.top).toBe("201px");
  });

  it("maps Unicode words to Cell coordinates, updates shared views and round-trips unknown fields/history", () => {
    const { editor, key, propertiesNow } = setup([{ type: "style/bold", start: 0, end: 2, future: { retain: true } }]);
    const second = editor.createView("second-monitor-view");
    editor.commands.replaceInlineRange(key, 0, 0, "😀 ");
    const before = editor.encodeDocument();
    const expected = JSON.parse(JSON.stringify(propertiesNow()[0]));
    const next = editor.commands.editStandoffProperty(key, 0, expected, "next-word");
    expect(next).toMatchObject({ start: 6, end: 8, future: { retain: true } });
    const shared = Object.values(second.state.nodes).find(n => n.payload.id === "p")!;
    expect((shared.payload.standoffProperties as any[])[0]).toEqual(next);
    const saved = editor.encodeDocument(); const loaded = new ReactiveEditor(saved);
    expect(loaded.encodeDocument()).toEqual(saved); loaded.dispose();
    editor.repository.undo(); expect(editor.encodeDocument()).toEqual(before);
    editor.repository.redo(); expect(editor.encodeDocument()).toEqual(saved);
  });

  it("dismisses on outside pointer input without stealing focus", async () => {
    const { open, panel, flow } = setup(); await open();
    flow.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    expect(panel()).toBeNull();
  });

  it("lists inclusive left-Cell overlaps, ignores deleted annotations, previews and restores the caret", async () => {
    const { editor, flow, open, panel } = setup();
    expect((await open()).defaultPrevented).toBe(true);
    expect(panel().querySelectorAll(".annotation-select")).toHaveLength(2);
    expect(document.activeElement).toBe(panel());
    expect(editor.overlays.overlays[0].annotationPreview).toEqual({ start: 0, end: 2 });
    panel().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    await Promise.resolve(); expect(panel()).toBeNull(); expect(document.activeElement).toBe(flow);
    expect(document.getSelection()!.anchorOffset).toBe(2);
    await open(0); expect(panel().querySelectorAll(".annotation-select")).toHaveLength(1);
  });

  it("keeps moved annotations in the captured list, edits without snapshots, and tombstones deletion with undo", async () => {
    const { editor, open, panel, button, propertiesNow } = setup(); await open();
    const snapshot = vi.spyOn(editor.repository, "snapshot");
    button("Next word").click();
    expect(propertiesNow()[0]).toMatchObject({ start: 4, end: 6, future: "keep" });
    expect(panel().querySelectorAll(".annotation-select")).toHaveLength(2);
    button("Contract").click(); expect(propertiesNow()[0].end).toBe(5);
    button("Delete annotation").click(); expect(propertiesNow()[0].isDeleted).toBe(true);
    expect(panel().querySelectorAll(".annotation-select")).toHaveLength(1);
    expect(snapshot).not.toHaveBeenCalled();
    editor.repository.undo(); await Promise.resolve();
    expect(panel()).toBeNull(); expect(propertiesNow()[0].isDeleted).toBeUndefined();
    expect(propertiesNow()[0]).toMatchObject({ start: 4, end: 5 });
  });

  it("validates JSON atomically and leaves keyboard input to the attribute fields", async () => {
    const { editor, open, panel, propertiesNow } = setup(); await open();
    const areas = panel().querySelectorAll("textarea");
    areas[0].value = "{"; areas[0].dispatchEvent(new InputEvent("input", { bubbles: true }));
    panel().querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    expect(panel().querySelector('[role="alert"]')).not.toBeNull(); expect(editor.repository.state.revision).toBe(0);
    areas[0].value = '{"changed":true}'; areas[0].dispatchEvent(new InputEvent("input", { bubbles: true }));
    areas[1].value = '{"certainty":0.8}'; areas[1].dispatchEvent(new InputEvent("input", { bubbles: true }));
    const event = new KeyboardEvent("keydown", { key: "d", bubbles: true, cancelable: true }); areas[0].dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    panel().querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    expect(propertiesNow()[0]).toMatchObject({ metadata: { changed: true }, attributes: { certainty: .8 }, future: "keep" });
    expect(propertiesNow()[0].isDeleted).toBeUndefined();
  });

  it("opens an empty state, supports legacy slash aliases and excludes composition/extra modifiers", async () => {
    const { open, panel } = setup([]);
    expect((await open(0, { key: ".", ctrlKey: true, isComposing: true })).defaultPrevented).toBe(false); expect(panel()).toBeNull();
    expect((await open(0, { key: ".", ctrlKey: true, altKey: true })).defaultPrevented).toBe(false);
    await open(0, { key: "/", metaKey: true }); expect(panel().textContent).toContain("No active annotations");
    await open(0, { key: "/", ctrlKey: true }); expect(document.querySelectorAll(".reactive-annotation-monitor")).toHaveLength(1);
  });

  it("rejects stale targets and invalid endpoints and preserves one-Cell minimum length", () => {
    const { editor, key, propertiesNow } = setup([{ type: "style/bold", start: 0, end: 0, attributes: { extra: 1 } }]);
    const p = JSON.parse(JSON.stringify(propertiesNow()[0]));
    editor.commands.editStandoffProperty(key, 0, p, "contract"); expect(editor.repository.state.revision).toBe(0);
    expect(() => editor.commands.editStandoffProperty(key, 0, p, { start: -1, end: 3 })).toThrow();
    editor.commands.editStandoffProperty(key, 0, p, "expand");
    expect(() => editor.commands.editStandoffProperty(key, 0, p, "delete")).toThrow();
    expect(propertiesNow()[0]).toMatchObject({ start: 0, end: 1, attributes: { extra: 1 } });
  });
});
