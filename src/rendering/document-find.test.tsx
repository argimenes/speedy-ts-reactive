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
    const findPanel = panel()!, titlebar = findPanel.querySelector<HTMLElement>(".document-find__windowbar")!;
    expect(titlebar.textContent).toContain("Find in Document");
    expect(titlebar.lastElementChild?.querySelector('[aria-label="Close Find"]')).not.toBeNull();
    const originalLeft = Number.parseFloat(findPanel.style.left), originalTop = Number.parseFloat(findPanel.style.top), dragRevision = editor.repository.state.revision;
    titlebar.dispatchEvent(new MouseEvent("pointerdown", { button: 0, clientX: 400, clientY: 100, bubbles: true, cancelable: true }));
    titlebar.dispatchEvent(new MouseEvent("pointermove", { button: 0, clientX: 350, clientY: 130, bubbles: true, cancelable: true }));
    titlebar.dispatchEvent(new MouseEvent("pointerup", { button: 0, clientX: 350, clientY: 130, bubbles: true, cancelable: true }));
    expect(Number.parseFloat(findPanel.style.left)).toBe(originalLeft - 50); expect(Number.parseFloat(findPanel.style.top)).toBe(originalTop + 30);
    expect(editor.repository.state.revision).toBe(dragRevision); expect(editor.repository.canUndo()).toBe(false);
    const resize = findPanel.querySelector<HTMLElement>(".document-find__resize")!; resize.setPointerCapture = vi.fn();
    resize.dispatchEvent(new MouseEvent("pointerdown", { button: 0, clientX: 0, clientY: 0, bubbles: true, cancelable: true }));
    resize.dispatchEvent(new MouseEvent("pointermove", { button: 0, clientX: -100, clientY: 50, bubbles: true, cancelable: true }));
    resize.dispatchEvent(new MouseEvent("pointerup", { button: 0, clientX: -100, clientY: 50, bubbles: true, cancelable: true }));
    expect(findPanel.style.width).toBe("660px"); expect(findPanel.style.height).toBe("230px");
    expect(editor.repository.state.revision).toBe(dragRevision);
    await editor.find.flush(); expect(editor.find.state.result?.matches).toHaveLength(2);
    expect(editor.find.state.scope?.rootKey).toBe(node("page").key);
    expect(editor.minimap.layersFor(node("page").key)[0].markers).toHaveLength(2);
    expect(editor.mounts.get(node("b").key)).toBeUndefined();
    await editor.find.navigate(-1); expect(editor.mounts.get(node("b").key)).toBeDefined();
    expect(editor.find.state.active).toBe(1); expect(document.activeElement).toBe(query());
    expect(editor.find.state.scope?.rootKey).toBe(node("page").key);
    query().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    expect(panel()).toBeNull(); expect(document.activeElement).toBe(editor.mounts.get(node("b").key)?.focusElement);
    expect(editor.repository.canUndo()).toBe(false);
    expect(Object.values(editor.decorations.nodes).flat()).toHaveLength(0);
    expect(editor.minimap.layersFor(node("page").key)).toHaveLength(0);
  });
  it("updates matches after edit/undo and hides highlights without dropping results", async () => {
    const { editor, node } = setup(); editor.find.open(node("a").key); editor.find.setQuery("Hello"); await editor.find.flush();
    editor.find.toggleHighlights(); expect(editor.find.state.result?.matches).toHaveLength(2); expect(Object.values(editor.decorations.nodes).flat()).toHaveLength(0);
    expect(editor.minimap.layersFor(node("page").key)[0].visible).toBe(false);
    editor.find.toggleHighlights();
    expect(editor.minimap.layersFor(node("page").key)[0].visible).toBe(true);
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
