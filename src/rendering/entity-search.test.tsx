import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "solid-js/web";
import { ReactiveEditor } from "../reactive-editor/editor";
import { registerCoreViews } from "./register-core-views";
import { ReactiveTreeView } from "./reactive-tree-view";
import { DocumentStyleBar } from "./document-style-bar";
import { openEntitySearch } from "../runtime/entity-search";
import { matchSources } from "../runtime/search-matching";
vi.mock("../runtime/search-worker",() => ({ runSearchWorker: async (sources: Parameters<typeof matchSources>[0],query: string,options: Parameters<typeof matchSources>[2]) => matchSources(sources,query,options) }));
const cleanup: (() => void)[] = [];
beforeEach(() => vi.useFakeTimers());
afterEach(() => { cleanup.splice(0).reverse().forEach(fn => fn()); document.body.replaceChildren(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); localStorage.clear(); });
const reply = (Results = [{ id: "Agent:blake", name: "Vernon Blake", mentions: 3 }], extra = {}) => ({ ok: true, json: async () => ({ Success: true, Results, Count: Results.length, Page: 1, MaxPage: 1, ...extra }) });
function setup() {
  const editor = new ReactiveEditor({ type: "document-block", children: [{ id: "a", type: "standoff-editor-block", text: "Vernon Blake" }, { id: "b", type: "standoff-editor-block", text: "writes on art" }] });
  registerCoreViews(editor); const projection = editor.createView("entity-test"), host = document.body.appendChild(document.createElement("div"));
  const dispose = render(() => <><DocumentStyleBar editor={editor} /><ReactiveTreeView editor={editor} projection={projection} /></>, host); editor.installGateway(document);
  cleanup.push(() => { dispose(); editor.dispose(); });
  const node = (id: string) => Object.values(projection.state.nodes).find(n => n.payload.id === id)!;
  const select = () => { const mount = editor.mounts.get(node("a").key)!; mount.focus(); mount.restoreInlineSelection!({ anchor: 0, head: 6 }); };
  const pause = () => document.querySelector<HTMLInputElement>('[aria-label="Search additional occurrences"]')!.click();
  const open = () => { select(); host.querySelector<HTMLButtonElement>('[aria-label="Entity reference"]')!.click(); pause(); };
  const panel = () => document.querySelector<HTMLElement>('[role="dialog"][aria-label="Search entities"]');
  const query = () => panel()!.querySelector<HTMLInputElement>('[aria-label="Search entities"]')!;
  return { editor, node, select, open, panel, query, host, pause };
}
describe("entity search overlay", () => {
  it("seeds the query, searches existing API, commits local reference/name metadata and undoes atomically", async () => {
    const fetch = vi.fn().mockResolvedValue(reply()); vi.stubGlobal("fetch", fetch);
    const { editor, open, panel, query } = setup(); const before = editor.repository.snapshot(); open();
    expect(query().value).toBe("Vernon"); expect(editor.repository.snapshot()).toEqual(before);
    await vi.advanceTimersByTimeAsync(310);
    expect(String(fetch.mock.calls[0][0])).toContain("/api/findAgentsByNameJson?search=Vernon");
    panel()!.querySelector<HTMLButtonElement>('[aria-label="Select Vernon Blake"]')!.click();
    expect(panel()).toBeNull();
    expect(editor.encodeDocument().children![0].standoffProperties).toEqual([expect.objectContaining({ type: "codex/entity-reference", start: 0, end: 5, value: "Agent:blake", metadata: { entityId: "Agent:blake", entityName: "Vernon Blake" } })]);
    const saved = editor.encodeDocument(), restored = new ReactiveEditor(saved); expect(restored.encodeDocument()).toEqual(saved); restored.dispose();
    editor.repository.undo(); expect(editor.encodeDocument().children![0].standoffProperties).toBeUndefined();
  });
  it("cancels without history and supports original keyboard opener and result selection", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply()));
    const { editor, select, panel, node } = setup(); select();
    editor.mounts.get(node("a").key)!.focusElement.dispatchEvent(new KeyboardEvent("keydown", { key: "e", metaKey: true, bubbles: true, cancelable: true }));
    expect(panel()).not.toBeNull(); await vi.advanceTimersByTimeAsync(310);
    document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    expect(panel()).toBeNull(); expect(editor.repository.canUndo()).toBe(false);
    await vi.advanceTimersByTimeAsync(0); expect(document.activeElement).toBe(editor.mounts.get(node("a").key)!.focusElement);
  });
  it("creates a shared entity annotation across Blocks and invalidates an open search on edits", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply()));
    const { editor, node, panel, pause } = setup();
    openEntitySearch(editor, [{ nodeKey: node("a").key, start: 0, end: 12 }, { nodeKey: node("b").key, start: 0, end: 6 }]);
    pause();
    await vi.advanceTimersByTimeAsync(310);
    document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    const a = (node("a").payload.standoffProperties as any[])[0], b = (node("b").payload.standoffProperties as any[])[0];
    expect(a.annotationId).toBe(b.annotationId); expect(a.annotationId).toBeTruthy();
    expect(editor.linkedAnnotations.resolve(b)).toMatchObject({ value: "Agent:blake", metadata: { entityName: "Vernon Blake" } });
    editor.repository.undo(); expect(node("a").payload.standoffProperties).toBeUndefined(); expect(node("b").payload.standoffProperties).toBeUndefined();
    openEntitySearch(editor, [{ nodeKey: node("a").key, start: 0, end: 6 }]);
    editor.commands.replaceInlineRange(node("a").key, 0, 0, "New "); expect(panel()).toBeNull();
    await vi.advanceTimersByTimeAsync(500); expect(node("a").payload.standoffProperties).toBeUndefined();
  });
  it("debounces changes, rejects stale responses, supports alias options and displays server failures", async () => {
    let finish!: (value: unknown) => void;
    const fetch = vi.fn().mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValue(reply([{ id: "Agent:new", name: "New entity", mentions: 0 }])); vi.stubGlobal("fetch", fetch);
    const { open, panel, query } = setup(); open(); await vi.advanceTimersByTimeAsync(310);
    query().value = "New"; query().dispatchEvent(new InputEvent("input", { bubbles: true }));
    query().value = "New entity"; query().dispatchEvent(new InputEvent("input", { bubbles: true }));
    await vi.advanceTimersByTimeAsync(310); expect(fetch).toHaveBeenCalledTimes(2);
    finish(reply()); await vi.advanceTimersByTimeAsync(0);
    expect(panel()!.textContent).toContain("New entity"); expect(panel()!.querySelector('[aria-label="Select Vernon Blake"]')).toBeNull();
    fetch.mockResolvedValueOnce({ ok: false, json: async () => ({ Success: false, Error: "Database offline" }) });
    panel()!.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click(); await vi.advanceTimersByTimeAsync(310);
    expect(String(fetch.mock.calls.at(-1)![0])).toContain("findAgentsByAliasJson");
    expect(panel()!.querySelector('[role="alert"]')!.textContent).toContain("Database offline");
    expect(panel()!.querySelectorAll("tbody tr")).toHaveLength(0);
  });
});
