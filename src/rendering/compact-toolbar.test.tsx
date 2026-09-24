import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "solid-js/web";
import { ReactiveEditor } from "../reactive-editor/editor";
import { registerCoreViews } from "./register-core-views";
import { ReactiveTreeView } from "./reactive-tree-view";
import { toolbarControl } from "./toolbar-test-helpers";
import { countText } from "../runtime/text-counts";

const cleanup: (() => void)[] = [];
afterEach(() => { cleanup.splice(0).reverse().forEach(fn => fn()); document.body.replaceChildren(); localStorage.clear(); vi.unstubAllGlobals(); vi.useRealTimers(); });
const tick = async () => { await Promise.resolve(); await Promise.resolve(); };
function fixture(twoWindows = false) {
  const windowDto = (id: string) => ({ id, type: "document-window-block", children: [{ type: "document-block", children: [
    { id: `${id}-p`, type: "standoff-editor-block", text: "one two three" },
    { id: `${id}-q`, type: "standoff-editor-block", text: "four five" },
  ] }] });
  const editor = new ReactiveEditor(twoWindows ? { type: "workspace-block", children: [windowDto("a"), windowDto("b")] } : windowDto("a"), { features: { publicHostedVersion: false } });
  registerCoreViews(editor); const projection = editor.createView("compact-test");
  const host = document.body.appendChild(document.createElement("div"));
  const dispose = render(() => <ReactiveTreeView editor={editor} projection={projection} />, host); editor.installGateway(document);
  cleanup.push(() => { dispose(); editor.dispose(); });
  const node = (id: string) => Object.values(projection.state.nodes).find(n => n.payload.id === id)!;
  const select = (id = "a-p") => { const n = node(id), mount = editor.mounts.get(n.key)!; mount.focus(); mount.restoreInlineSelection?.({ anchor: 1, head: 5 }); document.dispatchEvent(new Event("selectionchange")); };
  const choose = (name: string, window: HTMLElement = host) => { const picker = window.querySelector<HTMLSelectElement>('[aria-label="Toolset"]')!; picker.value = name; picker.dispatchEvent(new Event("change", { bubbles: true })); };
  return { editor, host, node, select, choose, dispose };
}

describe("compact editor chrome", () => {
  it("defaults on, has one footer outside scrolling content and leaves document mounts/history unchanged on switching", () => {
    const { editor, host, select, choose } = fixture(); select();
    const tree = host.querySelector('.reactive-standoff-flow'), before = editor.encodeDocument(), revision = editor.repository.state.revision;
    expect(editor.features.compactEditorChrome).toBe(true);
    for (const name of ["Typography", "Annotations", "Visual effects"]) {
      choose(name);
      expect(host.querySelector<HTMLButtonElement>('[data-tool-id="group-selection"]')).toBeNull();
    }
    expect(host.querySelectorAll('.document-count-bar')).toHaveLength(1);
    expect(host.querySelector('.document-style-bar .document-count-bar')).toBeNull();
    expect(host.querySelector('.reactive-window__content .document-status-bar')).toBeNull();
    expect(host.querySelector('.document-status-bar .document-count-bar')).not.toBeNull();
    for (const name of ["Annotations", "Visual effects", "Typography"]) choose(name);
    expect(host.querySelector('.reactive-standoff-flow')).toBe(tree);
    expect(editor.encodeDocument()).toEqual(before); expect(editor.repository.state.revision).toBe(revision);
    expect(document.activeElement).toBe(tree);
  });

  it("keeps Show/Hide in Selection without Group or Clear buttons", () => {
    const { host, select, choose } = fixture();
    select();
    const toggle = toolbarControl(host, '[aria-label="Show / hide"]', "Selection");
    expect([...toggle.parentElement!.querySelectorAll<HTMLElement>('[data-tool-id]')].map(button => button.dataset.toolId))
      .toEqual(["style/show-hide"]);
    for (const name of ["Typography", "Annotations", "Visual effects"]) {
      choose(name);
      host.querySelector<HTMLButtonElement>('.compact-toolbar__more')!.click();
      expect(document.querySelector('[data-tool-id="group-selection"], [data-tool-id="style/show-hide"], [data-tool-id="group-clear"]')).toBeNull();
    }
  });

  it("keeps toolset state per window across minimize/restore", async () => {
    const { host, choose } = fixture(true);
    const windows = [...host.querySelectorAll<HTMLElement>('.reactive-window')];
    choose("Visual effects", windows[0]);
    expect(windows[1].querySelector<HTMLSelectElement>('[aria-label="Toolset"]')!.value).toBe("Typography");
    windows[0].querySelector<HTMLButtonElement>('[aria-label="Minimize window"]')!.click();
    windows[0].querySelector<HTMLButtonElement>('[data-window-icon]')!.click(); await tick();
    expect(windows[0].querySelector<HTMLSelectElement>('[aria-label="Toolset"]')!.value).toBe("Visual effects");
  });

  it("retains cross-selection through More and linked fields, while hidden-toolset shortcuts still work", async () => {
    const { editor, host, node, select, choose } = fixture(); select(); editor.crossText.enable(true);
    editor.crossText.set(editor.crossText.position(node("a-p").key, 1), editor.crossText.position(node("a-q").key, 3));
    choose("Visual effects"); host.querySelector<HTMLButtonElement>('.compact-toolbar__more')!.click(); await tick();
    expect(editor.crossText.range()).toBeDefined();
    const details = document.querySelector<HTMLDetailsElement>('.compact-toolbar__panel details')!; details.open = true;
    const type = details.querySelector<HTMLInputElement>('[aria-label="Linked annotation type"]')!;
    type.focus(); type.value = "codex/claim-reference"; type.dispatchEvent(new Event("input", { bubbles: true }));
    expect(editor.crossText.range()).toBeDefined();
    type.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    expect(document.querySelector('.compact-toolbar__panel')).toBeNull(); expect(editor.crossText.range()).toBeDefined();
    // The existing cross-text binding is independent of visible buttons.
    const input = editor.mounts.get(node("a-p").key)!.focusElement!; input.focus();
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "b", ...(/Mac/.test(navigator.platform) ? { metaKey: true } : { ctrlKey: true }), bubbles: true, cancelable: true }));
    expect(node("a-p").payload.standoffProperties).toEqual([expect.objectContaining({ type: "style/bold", start: 1, end: 12 })]);
    expect(host.querySelector<HTMLSelectElement>('[aria-label="Toolset"]')!.value).toBe("Visual effects");
  });

  it("switches once per wheel burst only over the picker and leaves zoom alone", () => {
    vi.useFakeTimers(); const { host, editor } = fixture();
    const picker = host.querySelector('.compact-toolbar__picker')!;
    const wheel = (extra = {}) => { const event = new WheelEvent("wheel", { deltaY: 100, bubbles: true, cancelable: true, ...extra }); picker.dispatchEvent(event); return event; };
    const revision = editor.repository.state.revision;
    expect(wheel({ ctrlKey: true }).defaultPrevented).toBe(false);
    wheel(); wheel(); wheel();
    expect(host.querySelector<HTMLSelectElement>('select')!.value).toBe("Annotations");
    vi.advanceTimersByTime(200); wheel();
    expect(host.querySelector<HTMLSelectElement>('select')!.value).toBe("Visual effects");
    expect(editor.repository.state.revision).toBe(revision);
  });

  it("keeps one worker through switching and disposes it with the window", async () => {
    vi.useFakeTimers();
    const workers: Array<{ terminate: ReturnType<typeof vi.fn>; postMessage: ReturnType<typeof vi.fn> }> = [];
    vi.stubGlobal("Worker", class {
      onmessage?: (event: { data: unknown }) => void;
      onerror?: () => void;
      terminate = vi.fn();
      postMessage = vi.fn(({ id, text }: { id: number; text: string }) => queueMicrotask(() => this.onmessage?.({ data: { id, counts: countText(text) } })));
      constructor() { workers.push(this); }
    });
    const { host, choose, dispose } = fixture();
    await vi.advanceTimersByTimeAsync(350);
    expect(workers).toHaveLength(1);
    expect(host.querySelector('.document-count-bar summary')!.textContent).toContain('Document: 5 words');
    const calls = workers[0].postMessage.mock.calls.length;
    choose("Annotations"); choose("Visual effects");
    host.querySelector<HTMLDetailsElement>('.document-count-bar')!.open = true;
    await vi.advanceTimersByTimeAsync(350);
    expect(workers).toHaveLength(1); expect(workers[0].postMessage).toHaveBeenCalledTimes(calls);
    dispose(); expect(workers[0].terminate).toHaveBeenCalledTimes(1);
  });

  it("preserves colour drafts without creating edits and keeps linked creation contextual", () => {
    const { editor, host, select, choose } = fixture(); select();
    const input = toolbarControl<HTMLInputElement>(host, 'input[aria-label="Text colour"]', 'Visual effects');
    input.value = "#123456"; input.dispatchEvent(new Event("input", { bubbles: true }));
    const before = editor.repository.state.revision;
    choose("Typography"); choose("Visual effects");
    expect(toolbarControl<HTMLInputElement>(host, 'input[aria-label="Text colour"]', 'Visual effects').value).toBe("#123456");
    expect(editor.repository.state.revision).toBe(before);
    choose("Annotations"); host.querySelector<HTMLButtonElement>('.compact-toolbar__more')!.click();
    expect(document.querySelector('[aria-label="Linked annotation type"]')).toBeNull();
  });
});
