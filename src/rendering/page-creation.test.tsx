import { afterEach, describe, expect, it } from "vitest";
import { render } from "solid-js/web";
import { ReactiveEditor } from "../reactive-editor/editor";
import { registerCoreViews } from "./register-core-views";
import { ReactiveTreeView } from "./reactive-tree-view";
import { blockMenuItems, type BlockMenuItem } from "../runtime/block-menu-actions";
import type { ExistingBlockDto } from "../block-tree/types";

const cleanup: (() => void)[] = [];
afterEach(() => { while (cleanup.length) cleanup.pop()!(); document.body.replaceChildren(); });
const text = { id: "p", type: "standoff-editor-block", text: "Original paragraph" };
function setup(children: ExistingBlockDto[]) {
  const editor = new ReactiveEditor({ type: "document-block", children }); registerCoreViews(editor);
  const projection = editor.createView("page-test");
  const host = document.body.appendChild(document.createElement("div")); host.className = "workspace-demo";
  const dispose = render(() => <ReactiveTreeView editor={editor} projection={projection} />, host);
  cleanup.push(() => { dispose(); editor.dispose(); });
  const key = (id: string) => Object.values(projection.state.nodes).find(n => n.payload.id === id)!.key;
  return { editor, projection, host, key };
}
function action(items: BlockMenuItem[], ...path: string[]): BlockMenuItem {
  const item = items.find(item => item.label === path[0])!;
  return path.length === 1 ? item : action(item.children!, ...path.slice(1));
}
describe("page creation convention", () => {
  it("adds a real PageBlock with editable main text, supports both margins, saves and undoes atomically", async () => {
    const { editor, projection, host, key } = setup([{ type: "document-tab-row-block", children: [{ type: "document-tab-block", metadata: { active: true, name: "Page 1" }, children: [{ type: "page-block", children: [text] }] }] }]);
    const before = editor.encodeDocument();
    action(blockMenuItems(editor, key("p")), "Pages", "Add page").run!(); await Promise.resolve();
    const after = editor.encodeDocument(), tabs = after.children![0].children!;
    expect(tabs).toHaveLength(2); expect(tabs[0].metadata).toMatchObject({ active: false });
    expect(tabs[1]).toMatchObject({ type: "document-tab-block", metadata: { active: true, name: "Page 2" }, children: [{ type: "page-block", children: [{ type: "standoff-editor-block", text: "" }] }] });
    const paragraph = tabs[1].children![0].children![0], paragraphKey = key(paragraph.id!);
    const flow = host.querySelector('.reactive-page .reactive-standoff-flow');
    expect(flow).not.toBeNull(); expect(document.activeElement).toBe(flow);
    editor.repository.undo(); expect(editor.encodeDocument()).toEqual(before);
    editor.repository.redo(); expect(editor.encodeDocument()).toEqual(after);
    editor.commands.ensureMargin(paragraphKey, "left"); editor.commands.ensureMargin(paragraphKey, "right");
    expect(projection.state.nodes[paragraphKey].ownedRelations.leftMargin).toBeTruthy();
    expect(projection.state.nodes[paragraphKey].ownedRelations.rightMargin).toBeTruthy();
    expect(host.querySelector('.reactive-page [data-relation-name="leftMargin"]')).not.toBeNull();
    expect(host.querySelector('.reactive-page [data-relation-name="rightMargin"]')).not.toBeNull();
    const saved = editor.encodeDocument(), loaded = new ReactiveEditor(saved); expect(loaded.encodeDocument()).toEqual(saved); loaded.dispose();
  });
  it("converts existing text into a page without changing its content or identity", () => {
    const { editor, key, host } = setup([text]); editor.focus.request(key("p")); const before = editor.encodeDocument();
    action(blockMenuItems(editor, key("p")), "Convert to page").run!();
    const page = editor.encodeDocument().children![0].children![0].children![0];
    expect(page.type).toBe("page-block"); expect(page.children![0]).toMatchObject(text);
    expect(host.querySelector('.reactive-page [data-block-id="p"]')).not.toBeNull();
    editor.repository.undo(); expect(editor.encodeDocument()).toEqual(before);
  });
  it("wraps every document child when invoked inside a nested block, preserving order, annotations and margins", () => {
    const { editor, key, host } = setup([
      { id: "intro", type: "standoff-editor-block", text: "Introduction" },
      { id: "list", type: "indented-list-block", children: [{ ...text,
        standoffProperties: [{ id: "mention", type: "codex/entity-reference", start: 0, end: 7, value: "entity-id" }],
        relation: { rightMargin: { id: "margin", type: "right-margin-block", children: [{ id: "note", type: "standoff-editor-block", text: "Margin note" }] } },
      }] },
      { id: "end", type: "standoff-editor-block", text: "Conclusion" },
    ]);
    const before = editor.encodeDocument();
    const convert = action(blockMenuItems(editor, key("p")), "Convert to page");
    convert.run!();
    const after = editor.encodeDocument();
    expect(after.children).toHaveLength(1);
    const page = after.children![0].children![0].children![0];
    expect(page.type).toBe("page-block");
    expect(page.children).toEqual(before.children);
    expect(after.id).toBe(before.id);
    expect(host.querySelector('.reactive-page [data-block-id="p"]')).not.toBeNull();
    expect(blockMenuItems(editor, key("p")).some(item => item.label === "Convert to page")).toBe(false);
    convert.run!(); expect(editor.encodeDocument()).toEqual(after);
    editor.repository.undo(); expect(editor.encodeDocument()).toEqual(before);
    editor.repository.redo(); expect(editor.encodeDocument()).toEqual(after);
    const loaded = new ReactiveEditor(after);
    expect(loaded.encodeDocument()).toEqual(after); loaded.dispose();
  });
  it("offers document-wide Page conversion on the document itself", () => {
    const { editor, projection } = setup([text, { id: "last", type: "standoff-editor-block", text: "Last paragraph" }]);
    const before = editor.encodeDocument();
    action(blockMenuItems(editor, projection.state.rootKey), "Convert to page").run!();
    const after = editor.encodeDocument();
    expect(after.children).toHaveLength(1);
    expect(after.children![0].children![0].children![0].children).toEqual(before.children);
    editor.repository.undo(); expect(editor.encodeDocument()).toEqual(before);
  });
  it("hides Page conversion both within a PageBlock and for a document nested inside one", () => {
    const { editor, projection, key } = setup([{ id: "page", type: "page-block", children: [
      text,
      { id: "nested-doc", type: "document-block", children: [{ id: "nested-text", type: "standoff-editor-block", text: "Nested document" }] },
    ] }]);
    for (const target of [projection.state.rootKey, key("page"), key("p"), key("nested-doc"), key("nested-text")]) {
      expect(blockMenuItems(editor, target).some(item => item.label === "Convert to page")).toBe(false);
    }
  });
});
