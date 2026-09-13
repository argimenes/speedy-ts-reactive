import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "solid-js/web";
import { ReactiveEditor } from "../reactive-editor/editor";
import { registerCoreViews } from "./register-core-views";
import { ReactiveTreeView } from "./reactive-tree-view";
import { matchSources } from "../runtime/search-matching";
import { keyboard } from "../input/bindings";
vi.mock("../runtime/search-worker", () => ({ runSearchWorker: async (sources: Parameters<typeof matchSources>[0], query: string, options: Parameters<typeof matchSources>[2]) => matchSources(sources, query, options) }));
const cleanup: (() => void)[] = [];
afterEach(() => { cleanup.splice(0).reverse().forEach(fn => fn()); document.body.replaceChildren(); vi.restoreAllMocks(); localStorage.clear(); });
function setup() {
  const editor = new ReactiveEditor({ type: "document-block", children: [{ id: "page", type: "page-block", children: [
    { id: "a", type: "standoff-editor-block", text: "Hello world" },
    { id: "tabs", type: "tab-row-block", children: [{ id: "first", type: "tab-block", metadata: { name: "First" }, children: [] }, { id: "second", type: "tab-block", metadata: { name: "Second" }, children: [{ id: "b", type: "standoff-editor-block", text: "Hello hidden" }] }] },
  ] }] });
  registerCoreViews(editor); const projection = editor.createView("find-ui"), host = document.body.appendChild(document.createElement("div"));
  const dispose = render(() => <ReactiveTreeView editor={editor} projection={projection} />, host); editor.installGateway(document);
  cleanup.push(() => { dispose(); editor.dispose(); });
  const node = (id: string) => Object.values(projection.state.nodes).find(n => n.payload.id === id)!;
  const panel = () => host.querySelector<HTMLElement>('[data-document-find]'), query = () => panel()!.querySelector<HTMLInputElement>('[aria-label="Find text"]')!;
  return { editor, node, panel, query };
}
describe("document Find UI", () => {
  it("opens from a remappable binding, seeds local selection, keeps Page scope and closes without history", async () => {
    const { editor, node, panel, query } = setup();
    editor.bindings.assign("find.open", [keyboard("f", "Meta")]);
    const mount = editor.mounts.get(node("a").key)!; mount.focus(); mount.restoreInlineSelection!({ anchor: 0, head: 5 });
    mount.focusElement.dispatchEvent(new KeyboardEvent("keydown", { key: "f", metaKey: true, bubbles: true, cancelable: true }));
    await Promise.resolve(); expect(panel()).not.toBeNull(); expect(query().value).toBe("Hello");
    await editor.find.flush(); expect(editor.find.state.result?.matches).toHaveLength(2);
    expect(editor.find.state.scope?.rootKey).toBe(node("page").key);
    expect(editor.mounts.get(node("b").key)).toBeUndefined();
    await editor.find.navigate(-1); expect(editor.mounts.get(node("b").key)).toBeDefined();
    expect(editor.find.state.active).toBe(1); expect(document.activeElement).toBe(query());
    expect(editor.find.state.scope?.rootKey).toBe(node("page").key);
    query().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    expect(panel()).toBeNull(); expect(document.activeElement).toBe(editor.mounts.get(node("b").key)?.focusElement);
    expect(editor.repository.canUndo()).toBe(false);
    expect(Object.values(editor.decorations.nodes).flat()).toHaveLength(0);
  });
  it("updates matches after edit/undo and hides highlights without dropping results", async () => {
    const { editor, node } = setup(); editor.find.open(node("a").key); editor.find.setQuery("Hello"); await editor.find.flush();
    editor.find.toggleHighlights(); expect(editor.find.state.result?.matches).toHaveLength(2); expect(Object.values(editor.decorations.nodes).flat()).toHaveLength(0);
    editor.find.toggleHighlights();
    editor.commands.replaceInlineRange(node("a").key, 0, 5, "Bye");
    expect(editor.find.state.pending).toBe(true); expect(editor.decorations.nodes[node("a").key]).toHaveLength(0);
    await editor.find.flush(); expect(editor.find.state.result?.matches).toHaveLength(1);
    editor.repository.undo(); await editor.find.flush(); expect(editor.find.state.result?.matches).toHaveLength(2);
    editor.find.setQuery("["); editor.find.setOption("regex", true); await editor.find.flush();
    expect(editor.find.state.result?.status).toBe("error"); expect(Object.values(editor.decorations.nodes).flat()).toHaveLength(0);
  });
  it("reveals nested inactive tabs on first mount and preserves independent owners on close", async () => {
    const { editor, node } = setup();
    const parent = node("second");
    editor.commands.insert({ type: "tab-row-block", children: [{ type: "tab-block", children: [] }, { type: "tab-block", children: [{ id: "deep", type: "standoff-editor-block", text: "Needle" }] }] }, { kind: "at", parentKey: parent.key, index: 1 });
    editor.find.open(node("a").key); editor.find.setQuery("Needle"); await editor.find.flush();
    expect(editor.find.state.result?.matches).toHaveLength(1);
    const before = editor.repository.state.revision;
    editor.decorations.attachMatches("other-tool", editor.find.state.result!);
    await editor.find.navigate(1);
    expect(editor.mounts.get(node("deep").key)).toBeDefined();
    expect(editor.repository.state.revision).toBe(before);
    editor.find.close(); expect(editor.decorations.nodes[node("deep").key]).toHaveLength(1);
    expect(editor.decorations.nodes[node("deep").key][0].owner).toBe("other-tool");
  });
});
