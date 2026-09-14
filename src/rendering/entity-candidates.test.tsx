import { afterEach,beforeEach,describe,expect,it,vi } from "vitest";
import { render } from "solid-js/web";
import { ReactiveEditor } from "../reactive-editor/editor";
import { registerCoreViews } from "./register-core-views";
import { ReactiveTreeView } from "./reactive-tree-view";
import { openEntitySearch } from "../runtime/entity-search";
import { matchSources } from "../runtime/search-matching";
import { keyboard } from "../input/bindings";
vi.mock("../runtime/search-worker",() => ({ runSearchWorker: async (sources: Parameters<typeof matchSources>[0],query: string,options: Parameters<typeof matchSources>[2]) => matchSources(sources,query,options) }));
const cleanup: (() => void)[] = [];
beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ ok: true,json: async () => ({ Success: true,Results: [{ id: "blake",name: "Vernon Blake" }],Count: 1,Page: 1,MaxPage: 1 }) })); });
afterEach(() => { cleanup.splice(0).reverse().forEach(fn => fn()); document.body.replaceChildren(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); localStorage.clear(); });
function setup() {
  const editor = new ReactiveEditor({ type: "document-block",children: [{ id: "a",type: "standoff-editor-block",text: "he the he" },{ id: "b",type: "standoff-editor-block",text: "he" }] });
  registerCoreViews(editor); const projection = editor.createView("candidate-ui"),host = document.body.appendChild(document.createElement("div"));
  const dispose = render(() => <ReactiveTreeView editor={editor} projection={projection} />,host); editor.installGateway(document);
  cleanup.push(() => { dispose(); editor.dispose(); });
  const node = (id: string) => Object.values(projection.state.nodes).find(n => n.payload.id === id)!;
  editor.mounts.get(node("a").key)!.focus();
  openEntitySearch(editor,[{ nodeKey: node("a").key,start: 0,end: 2 }]);
  const panel = () => document.querySelector<HTMLElement>('[aria-label="Search entities"][role=dialog]')!;
  const button = (label: string) => [...panel().querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.startsWith(label))!;
  const field = (label: string) => panel().querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
  return { editor,node,panel,button,field };
}
describe("entity candidate review",() => {
  it("keeps native select-all in query fields, supports a remapped opener and only nominates on Enter",async () => {
    const { editor,field,panel,button } = setup(); await vi.advanceTimersByTimeAsync(310);
    const native = new KeyboardEvent("keydown",{ key: "a",ctrlKey: true,bubbles: true,cancelable: true }); field("Search entities").dispatchEvent(native); expect(native.defaultPrevented).toBe(false);
    expect(field("Mention text")).toBeNull();
    editor.bindings.assign("entity.candidates.open",[keyboard("m","Alt")]);
    field("Search entities").dispatchEvent(new KeyboardEvent("keydown",{ key: "m",altKey: true,bubbles: true,cancelable: true })); await vi.advanceTimersByTimeAsync(250);
    expect(field("Mention text").value).toBe("he"); expect(panel().textContent).toContain("3 selected / 3 unique targets");
    field("Search entities").value = "Vernon Blake"; field("Search entities").dispatchEvent(new InputEvent("input",{ bubbles: true })); await vi.advanceTimersByTimeAsync(310);
    expect(field("Mention text").value).toBe("he");
    field("Search entities").dispatchEvent(new KeyboardEvent("keydown",{ key: "Enter",bubbles: true,cancelable: true }));
    expect(panel()).toBeTruthy(); expect(editor.repository.canUndo()).toBe(false); expect(button("Bind 3").disabled).toBe(false);
    button("Bind 3").click(); expect(panel()).toBeNull(); expect(editor.repository.canUndo()).toBe(true);
    editor.repository.undo(); expect(editor.encodeDocument().children!.every(d => !d.standoffProperties)).toBe(true);
  });
  it("checks across all rows, synchronizes exclusion/undo and stays open for document-side review",async () => {
    const { editor,node,button,panel } = setup(); button("Find other occurrences").click(); await vi.advanceTimersByTimeAsync(250);
    const owner = editor.overlays.overlays[0].key, layer = `entity-candidates:${owner}`;
    editor.mounts.get(node("b").key)!.root.dispatchEvent(new MouseEvent("pointerdown",{ bubbles: true,button: 0 })); expect(panel()).toBeTruthy();
    const b = editor.decorations.nodes[node("b").key][0]; editor.decorations.exclude(layer,b.id);
    expect(panel().textContent).toContain("2 selected / 3 unique targets");
    expect(panel().querySelectorAll('table[aria-label="Mention candidates"] input:checked')).toHaveLength(2);
    button("Undo exclusion").click(); expect(panel().querySelectorAll('table[aria-label="Mention candidates"] input:checked')).toHaveLength(3);
    button("Select none").click();
    const selectAll = new KeyboardEvent("keydown",{ key: "a",ctrlKey: true,bubbles: true,cancelable: true }); button("Select none").dispatchEvent(selectAll); expect(selectAll.defaultPrevented).toBe(true);
    expect(panel().textContent).toContain("3 selected / 3 unique targets");
    button("Cancel").click(); expect(Object.values(editor.decorations.nodes).flat()).toHaveLength(0); expect(editor.repository.canUndo()).toBe(false);
  });
  it("closes and clears candidates on an external edit, and never restores stale worker highlights",async () => {
    const { editor,node,button,panel } = setup(); button("Find other occurrences").click();
    editor.commands.replaceInlineRange(node("a").key,0,0,"x"); expect(panel()).toBeNull();
    await vi.advanceTimersByTimeAsync(500); expect(Object.values(editor.decorations.nodes).flat()).toHaveLength(0); expect(node("b").payload.standoffProperties).toBeUndefined();
  });
});
