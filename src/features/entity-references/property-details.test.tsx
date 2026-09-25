import { registerEntityTestViews } from "./test-support";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "solid-js/web";
import { ReactiveEditor } from "../../reactive-editor/editor";
import { registerCoreViews } from "../../rendering/register-core-views";
import { ReactiveTreeView } from "../../rendering/reactive-tree-view";
import type { ExistingBlockDto } from "../../block-tree/types";

const disposers: Array<() => void> = [];
afterEach(() => { while (disposers.length) disposers.pop()!(); document.body.replaceChildren(); });
function setup(properties: Record<string, unknown>[] = [
  { id: "a", type: "style/bold", start: 0, end: 2, metadata: { preserved: true }, future: "keep" },
  { type: "codex/entity-reference", start: 1, end: 4, value: "entity-id" },
  { type: "style/italics", start: 0, end: 5, isDeleted: true },
], additional: ExistingBlockDto[] = []) {
  const editor = new ReactiveEditor({ type: "document-block", children: [{ id: "p", type: "standoff-editor-block", text: "one two three", standoffProperties: properties }, ...additional] });
  registerEntityTestViews(editor); const projection = editor.createView("monitor-test");
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

describe("entity property details contribution", () => {
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

});
