// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "solid-js/web";
import { ReactiveEditor } from "../reactive-editor/editor";
import { ReactiveTreeView } from "./reactive-tree-view";
import { DocumentStyleBar } from "./document-style-bar";
import { toolbarControl } from "./toolbar-test-helpers";
import { registerCoreViews } from "./register-core-views";

const cleanup: Array<() => void> = [];
afterEach(() => { cleanup.splice(0).reverse().forEach(dispose => dispose()); document.body.replaceChildren(); vi.unstubAllGlobals(); localStorage.clear(); });

function setup(fail = false, pageless = false) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: !fail, json: async () => fail ? { Success: false, Error: "Graph offline" } : { Success: true, Results: [{ id: "alpha", name: "Alpha", mentions: 10 }, { id: "beta", name: "Beta", mentions: 2 }] } }));
  const page = { id: "page", type: "page-block", children: [
    { id: "a", type: "standoff-editor-block", text: "Alpha Beta", standoffProperties: [
      { id: "alpha-ref", type: "codex/entity-reference", value: "alpha", metadata: { entityName: "Alpha cached" }, start: 0, end: 4 },
      { id: "beta-ref-1", type: "codex/entity-reference", value: "beta", metadata: { entityName: "Beta cached" }, start: 6, end: 9 },
    ] },
    { id: "b", type: "standoff-editor-block", text: "Beta", standoffProperties: [{ id: "beta-ref-2", type: "codex/entity-reference", value: "beta", start: 0, end: 3 }] },
    { id: "c", type: "standoff-editor-block", text: "No entity" },
  ] };
  const editor = new ReactiveEditor({ type: pageless ? "main-list-block" : "document-block", children: pageless ? page.children : [page] });
  registerCoreViews(editor); const projection = editor.createView("entity-list-test"), host = document.body.appendChild(document.createElement("div"));
  const dispose = render(() => <><DocumentStyleBar editor={editor} scopeKey={projection.state.rootKey} /><ReactiveTreeView editor={editor} projection={projection} /></>, host);
  const uninstall = editor.installGateway(document); cleanup.push(() => { uninstall(); dispose(); editor.dispose(); });
  const node = (id: string) => Object.values(projection.state.nodes).find(node => node.payload.id === id)!;
  const panel = () => document.querySelector<HTMLElement>('[role="dialog"][aria-label="Entities in document"]')!;
  const rows = () => [...panel().querySelectorAll<HTMLTableRowElement>("tbody tr")];
  return { editor, host, node, panel, rows };
}

describe("document entity listing", () => {
  it("loads summaries, sorts every column and previews property ranges without document changes", async () => {
    const { editor, host, node, panel, rows } = setup(); const before = editor.encodeDocument();
    toolbarControl(host, "button[title^='Entities in Document']").click();
    await vi.waitFor(() => expect(rows().some(row => row.cells[1].textContent === "10")).toBe(true));
    expect(panel()).toBeTruthy(); expect(rows().map(row => row.cells[0].textContent)).toEqual(["Beta", "Alpha"]);
    const resize = panel().querySelector<HTMLElement>(".document-entity-list__resize")!; resize.setPointerCapture = vi.fn();
    resize.dispatchEvent(new MouseEvent("pointerdown", { button: 0, clientX: 0, clientY: 0, bubbles: true, cancelable: true }));
    resize.dispatchEvent(new MouseEvent("pointermove", { button: 0, clientX: 80, clientY: 100, bubbles: true, cancelable: true }));
    resize.dispatchEvent(new MouseEvent("pointerup", { button: 0, clientX: 80, clientY: 100, bubbles: true, cancelable: true }));
    expect(panel().style.width).toBe("440px"); expect(panel().style.height).toBe("400px");
    expect(editor.encodeDocument()).toEqual(before); expect(editor.repository.canUndo()).toBe(false);
    expect(rows()[0].cells[1].textContent).toBe("2"); expect(rows()[0].cells[2].textContent).toBe("2");
    panel().querySelector<HTMLButtonElement>("th:first-child button")!.click(); expect(rows().map(row => row.cells[0].textContent)).toEqual(["Alpha", "Beta"]);
    panel().querySelector<HTMLButtonElement>("th:first-child button")!.click(); expect(rows().map(row => row.cells[0].textContent)).toEqual(["Beta", "Alpha"]);
    panel().querySelector<HTMLButtonElement>("th:nth-child(2) button")!.click(); expect(rows().map(row => row.cells[0].textContent)).toEqual(["Alpha", "Beta"]);
    panel().querySelector<HTMLButtonElement>("th:nth-child(2) button")!.click(); expect(rows().map(row => row.cells[0].textContent)).toEqual(["Beta", "Alpha"]);
    panel().querySelector<HTMLButtonElement>("th:nth-child(3) button")!.click(); expect(rows().map(row => row.cells[0].textContent)).toEqual(["Beta", "Alpha"]);
    panel().querySelector<HTMLButtonElement>("th:nth-child(3) button")!.click(); expect(rows().map(row => row.cells[0].textContent)).toEqual(["Alpha", "Beta"]);
    panel().querySelector<HTMLButtonElement>("th:nth-child(3) button")!.click();
    rows()[0].dispatchEvent(new MouseEvent("pointerenter", { bubbles: true }));
    expect(editor.decorations.nodes[node("a").key]).toHaveLength(1); expect(editor.decorations.nodes[node("b").key]).toHaveLength(1);
    expect(editor.decorations.nodes[node("a").key][0]).toMatchObject({ type: "editor/entity-list-preview", fill: "#ffe34d", priority: 20 });
    rows()[0].dispatchEvent(new MouseEvent("pointerleave", { bubbles: true })); expect(editor.decorations.nodes[node("a").key]).toHaveLength(0);
    panel().querySelector<HTMLButtonElement>('[aria-label="Close entity listing"]')!.click(); expect(document.querySelector('[aria-label="Entities in document"]')).toBeNull();
    expect(editor.encodeDocument()).toEqual(before); expect(editor.repository.canUndo()).toBe(false);
  });

  it("opens from the browser-safe chord and keeps local rows when Graph summaries fail", async () => {
    const { editor, node, panel, rows } = setup(true); const flow = editor.mounts.get(node("a").key)!.focusElement; flow.focus();
    const prefix = new KeyboardEvent("keydown", { key: ";", ctrlKey: true, bubbles: true, cancelable: true }); flow.dispatchEvent(prefix);
    expect(prefix.defaultPrevented).toBe(true); expect(document.querySelector(".binding-chord-hint")?.textContent).toContain("Entity listing");
    const finish = new KeyboardEvent("keydown", { key: "l", bubbles: true, cancelable: true }); flow.dispatchEvent(finish);
    await vi.waitFor(() => expect(panel().textContent).toContain("Graph counts unavailable: Graph offline"));
    expect(finish.defaultPrevented).toBe(true); expect(panel()).toBeTruthy(); expect(rows()).toHaveLength(2);
    panel().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })); expect(editor.entityList.state.open).toBe(false);
  });

  it("updates live Document counts when standoff properties change", async () => {
    const { editor, host, node, rows } = setup();
    toolbarControl(host, "button[title^='Entities in Document']").click();
    await vi.waitFor(() => expect(rows()).toHaveLength(2));
    editor.commands.setPayloadField(node("b").key, "standoffProperties", []);
    await vi.waitFor(() => expect(rows().find(row => row.cells[0].textContent === "Beta")?.cells[2].textContent).toBe("1"));
  });

  it("focuses an entity on the current Page and restores the Page on toggle", async () => {
    const { editor, host, node, panel } = setup();
    toolbarControl(host, "button[title^='Entities in Document']").click();
    await vi.waitFor(() => expect(panel().querySelector('[aria-label="Focus occurrences of Alpha on current Page"]')).toBeTruthy());
    const button = panel().querySelector<HTMLButtonElement>('[aria-label="Focus occurrences of Alpha on current Page"]')!;
    expect(button.disabled).toBe(false);
    const before = editor.repository.state.revision;
    button.click();
    await vi.waitFor(() => expect((editor.mounts.get(node("b").key)!.root as HTMLElement).hidden).toBe(true));
    expect((editor.mounts.get(node("c").key)!.root as HTMLElement).hidden).toBe(true);
    expect(editor.entityList.state.concertinaEntityId).toBe("alpha");
    button.click();
    expect((editor.mounts.get(node("b").key)!.root as HTMLElement).hidden).toBe(false);
    expect(editor.repository.state.revision).toBe(before);
  });
  it("focuses and navigates a legacy letter without a Page, without changing authored content or undo", async () => {
    const { editor, node, panel } = setup(false, true);
    editor.entityList.open(node("a").key);
    await vi.waitFor(() => expect(panel().querySelector('[aria-label="Focus occurrences of Beta on current Document"]')).toBeTruthy());
    expect(editor.entityList.state.pageKey).toBeUndefined();
    const before = editor.repository.snapshot();
    const button = panel().querySelector<HTMLButtonElement>('[aria-label="Focus occurrences of Beta on current Document"]')!;
    expect(button.disabled).toBe(false); button.click();
    await vi.waitFor(() => expect((editor.mounts.get(node("c").key)!.root as HTMLElement).hidden).toBe(true));
    expect((editor.mounts.get(node("a").key)!.root as HTMLElement).hidden).toBe(false);
    expect((editor.mounts.get(node("b").key)!.root as HTMLElement).hidden).toBe(false);
    expect(button.getAttribute("aria-pressed")).toBe("true");
    editor.entityList.navigateConcertina(1); expect(editor.entityList.state.concertinaIndex).toBe(1);
    button.click(); expect((editor.mounts.get(node("c").key)!.root as HTMLElement).hidden).toBe(false);
    expect(editor.repository.snapshot()).toEqual(before); expect(editor.repository.canUndo()).toBe(false);
  });
});
