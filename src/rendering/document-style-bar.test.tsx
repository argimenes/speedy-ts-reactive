import { afterEach, describe, expect, it } from "vitest";
import { render } from "solid-js/web";
import { ReactiveEditor } from "../reactive-editor/editor";
import { registerCoreViews } from "./register-core-views";
import { ReactiveTreeView } from "./reactive-tree-view";
import { annotationTools } from "./document-style-bar";
import { toolbarControl } from "./toolbar-test-helpers";
import { standoffStyleSchemas } from "./standoff-styles";

const cleanup: (() => void)[] = [];
afterEach(() => { while (cleanup.length) cleanup.pop()!(); document.body.replaceChildren(); });
function fixture(compactEditorChrome: boolean) {
  const editor = new ReactiveEditor({ type: "document-window-block", children: [{ type: "document-block", children: [
    { id: "p", type: "standoff-editor-block", text: "one 😀 two", standoffProperties: [{ id: "entity", type: "codex/entity-reference", start: 0, end: 2, value: "entity-id" }], blockProperties: [{ type: "block/alignment", value: "right" }] },
    { id: "q", type: "standoff-editor-block", text: "Other paragraph" },
  ] }] }, { features: { compactEditorChrome, publicHostedVersion: false } });
  registerCoreViews(editor); const projection = editor.createView("format-test");
  const host = document.body.appendChild(document.createElement("div"));
  const dispose = render(() => <ReactiveTreeView editor={editor} projection={projection} />, host); editor.installGateway(document);
  cleanup.push(() => { dispose(); editor.dispose(); });
  const node = () => Object.values(projection.state.nodes).find(n => n.payload.id === "p")!;
  const flowFor = (id = "p") => host.querySelector<HTMLElement>(`.reactive-standoff-block[data-block-id="${id}"] .reactive-standoff-flow`)!;
  const flow = flowFor();
  const select = (start = 0, end = 5, id = "p") => {
    const flow = flowFor(id);
    flow.focus(); const range = document.createRange(); range.setStart(flow, start); range.setEnd(flow, end);
    document.getSelection()!.removeAllRanges(); document.getSelection()!.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
    return flow;
  };
  const click = (title: string) => {
    const button = toolbarControl(host, `button[title="${title}"]`);
    button.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, cancelable: true })); button.click();
  };
  return { editor, host, node, flow, select, click };
}
describe.each([true, false])("DocumentWindow annotation toolbar (compact=%s)", compact => {
  const setup = () => fixture(compact);
  it("exposes every canonical style and both colours, creating inclusive Cell ranges with IDs", () => {
    const { host, node, select, click, editor } = setup();
    expect(annotationTools.map(t => t[0]).sort()).toEqual(Object.keys(standoffStyleSchemas).filter(type => type.startsWith("style/") || type === "amber-crt").sort());
    for (const [type, name] of annotationTools) {
      select(); click(name);
      const p = (node().payload.standoffProperties as any[]).find(p => p.type === type);
      expect(p).toMatchObject({ type, start: 0, end: 4 }); expect(p.id).toBeTruthy();
    }
    expect((node().payload.standoffProperties as any[]).find(p => p.type === "style/blur")).toMatchObject({ amount: 3 });
    if (compact) expect(toolbarControl(host, 'button[title="Blur"]', "Typography").dataset.toolId).toBe("style/blur");
    select(); click("Apply text colour"); select(); click("Apply background colour");
    expect(node().payload.standoffProperties).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "text/colour", value: "#ff0000", start: 0, end: 4 }),
      expect.objectContaining({ type: "text/background-colour", value: "#ffff00", start: 0, end: 4 }),
      expect.objectContaining({ id: "entity", value: "entity-id" }),
    ]));
    if (!compact) expect(host.querySelectorAll("[data-annotation-type]")).toHaveLength(annotationTools.length + 2);
    else expect(host.querySelector(".document-status-bar .document-count-bar")).not.toBeNull();
    const saved = editor.encodeDocument(), reloaded = new ReactiveEditor(saved);
    expect(reloaded.encodeDocument()).toEqual(saved); reloaded.dispose();
  });
  it("preserves the range through colour-picker focus and leaves collapsed selections unchanged", () => {
    const { host, node, select, click, editor } = setup();
    select(4, 5);
    const colour = toolbarControl<HTMLInputElement>(host, 'input[aria-label="Text colour"]', 'Visual effects');
    colour.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true })); colour.focus();
    colour.value = "#123456"; colour.dispatchEvent(new InputEvent("input", { bubbles: true })); click("Apply text colour");
    expect(node().payload.standoffProperties).toEqual(expect.arrayContaining([expect.objectContaining({ type: "text/colour", start: 4, end: 4, value: "#123456" })]));
    select(2, 2); const revision = editor.repository.state.revision; click("Bold selection");
    expect(editor.repository.state.revision).toBe(revision); expect(host.textContent).toContain("Select a non-empty text range");
  });
  it("increments paragraph placement repeatedly, clamps outdent at zero, preserves tree and undoes", () => {
    const { host, node, select, click, editor } = setup(); select();
    const children = editor.encodeDocument().children;
    click("Increase indent"); click("Increase indent"); click("Increase indent");
    expect(node().payload.blockProperties).toEqual(expect.arrayContaining([{ type: "block/indent", value: "3" }, { type: "block/alignment", value: "right" }]));
    expect(host.querySelector<HTMLElement>(".reactive-standoff-block")!.style.marginLeft).toBe("60px");
    click("Decrease indent"); expect(host.querySelector<HTMLElement>(".reactive-standoff-block")!.style.marginLeft).toBe("40px");
    editor.repository.undo(); expect(host.querySelector<HTMLElement>(".reactive-standoff-block")!.style.marginLeft).toBe("60px");
    for (let i = 0; i < 5; i++) click("Decrease indent");
    expect(host.querySelector<HTMLElement>(".reactive-standoff-block")!.style.marginLeft).toBe("0px");
    expect(editor.encodeDocument().children?.map(p => p.children?.map(c => c.id))).toEqual(children?.map(p => p.children?.map(c => c.id)));
    expect(JSON.stringify(editor.encodeDocument())).not.toContain("indented-list-block");
  });
  it("does not toggle away annotations on repeat application and clear preserves semantic references", () => {
    const { node, select, click, editor } = setup(); select(); click("Bold selection");
    const revision = editor.repository.state.revision; click("Bold selection"); expect(editor.repository.state.revision).toBe(revision);
    click("Clear formatting"); expect(node().payload.standoffProperties).toEqual([{ id: "entity", type: "codex/entity-reference", start: 0, end: 2, value: "entity-id" }]);
    editor.repository.undo(); expect((node().payload.standoffProperties as any[]).some(p => p.type === "style/bold")).toBe(true);
  });
  it("collects ranges across Blocks, applies Highlight, cancels with Escape, and toggles the Show/Hide projection", async () => {
    const { host, node, select, click, editor } = setup();
    select(0, 0); click("Group text ranges");
    expect(editor.groupSelection.active()).toBe(true);
    select(0, 5).dispatchEvent(new MouseEvent("pointerup", { bubbles: true })); await Promise.resolve();
    select(0, 5, "q").dispatchEvent(new MouseEvent("pointerup", { bubbles: true })); await Promise.resolve();
    expect(editor.groupSelection.ranges()).toHaveLength(2);
    click("Highlight");
    expect(editor.groupSelection.active()).toBe(false);
    expect(node().payload.standoffProperties).toEqual(expect.arrayContaining([expect.objectContaining({ type: "style/highlight", start: 0, end: 4 })]));
    const q = Object.values(editor.projections.get("format-test")!.state.nodes).find(candidate => candidate.payload.id === "q")!;
    expect(q.payload.standoffProperties).toEqual([expect.objectContaining({ type: "style/highlight", start: 0, end: 4 })]);

    select(6, 6); click("Group text ranges");
    select(6, 9).dispatchEvent(new MouseEvent("pointerup", { bubbles: true })); await Promise.resolve();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    expect(editor.groupSelection.active()).toBe(false);
    expect((node().payload.standoffProperties as any[]).filter(property => property.start === 6)).toHaveLength(0);

    select(6, 9).dispatchEvent(new MouseEvent("pointerup", { bubbles: true, ctrlKey: true })); await Promise.resolve();
    expect(editor.groupSelection.active()).toBe(true);
    expect(editor.groupSelection.ranges()).toHaveLength(1);
    editor.groupSelection.cancel();

    const shortcutTarget = select(3, 5);
    shortcutTarget.dispatchEvent(new KeyboardEvent("keydown", { key: ";", ctrlKey: true, bubbles: true, cancelable: true }));
    shortcutTarget.dispatchEvent(new KeyboardEvent("keydown", { key: "g", bubbles: true, cancelable: true }));
    expect(editor.groupSelection.active()).toBe(true);
    expect(editor.groupSelection.ranges()).toHaveLength(1);
    editor.groupSelection.cancel();

    select(0, 2); click("Show / hide");
    expect(node().payload.standoffProperties).toEqual(expect.arrayContaining([expect.objectContaining({ type: "style/show-hide", start: 0, end: 1 })]));
    expect(host.querySelector('[data-inline-index="0"]')?.classList.contains("reactive-standoff-cell--concealed")).toBe(true);
    select(2, 2); click("Show / hide");
    expect(editor.showHide.shows(node().key)).toBe(true);
    expect(host.querySelector('[data-inline-index="0"]')?.classList.contains("reactive-standoff-cell--concealed")).toBe(false);
  });
});
