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
  const flow = host.querySelector<HTMLElement>(".reactive-standoff-flow")!;
  const select = (start = 0, end = 5) => {
    flow.focus(); const range = document.createRange(); range.setStart(flow, start); range.setEnd(flow, end);
    document.getSelection()!.removeAllRanges(); document.getSelection()!.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
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
    expect(annotationTools.map(t => t[0]).sort()).toEqual(Object.keys(standoffStyleSchemas).filter(type => type.startsWith("style/")).sort());
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
    if (!compact) expect(host.querySelectorAll("[data-annotation-type]")).toHaveLength(17);
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
});
