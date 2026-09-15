// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "solid-js/web";
import { ReactiveEditor } from "../reactive-editor/editor";
import { registerCoreViews } from "./register-core-views";
import { ReactiveTreeView } from "./reactive-tree-view";
import { resolvedWindowIcon, resolvedWindowState } from "./window-icon";
import type { ExistingBlockDto } from "../block-tree/types";
import { matchSources } from "../runtime/search-matching";

vi.mock("../runtime/search-worker", () => ({ runSearchWorker: async (sources: Parameters<typeof matchSources>[0], query: string, options: Parameters<typeof matchSources>[2]) => matchSources(sources, query, options) }));

const cleanup: Array<() => void> = [];
afterEach(() => { while (cleanup.length) cleanup.pop()?.(); document.body.replaceChildren(); });

function mount(dto: ExistingBlockDto = {
  id: "window",
  type: "document-window-block",
  metadata: { title: "Research notes", position: { x: 20, y: 30 }, size: { w: 400, h: 300 }, state: "normal", zIndex: 4 },
  children: [{ id: "document", type: "document-block", children: [{ id: "page", type: "page-block", children: [{ id: "text", type: "plain-text-block", text: "Remember this selection" }] }] }],
}) {
  const editor = new ReactiveEditor(dto); registerCoreViews(editor);
  const projection = editor.createView("window-icon-test"), host = globalThis.document.body.appendChild(globalThis.document.createElement("div"));
  const dispose = render(() => <ReactiveTreeView editor={editor} projection={projection} />, host); editor.installGateway(globalThis.document);
  cleanup.push(() => { dispose(); editor.dispose(); });
  const node = (id: string) => Object.values(projection.state.nodes).find(item => item.payload.id === id)!;
  return { editor, projection, host, node };
}

const click = (element: HTMLElement) => element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

describe("Window icon minimization", () => {
  it("keeps one Block identity, follows metadata through history and restores focus, selection, geometry and children", async () => {
    const { editor, projection, host, node } = mount();
    const windowKey = node("window").key, contentKey = node("window").contentKey;
    const childKeys = Object.values(projection.state.nodes).map(item => item.key).sort();
    const textarea = host.querySelector<HTMLTextAreaElement>("textarea")!;
    textarea.focus(); textarea.setSelectionRange(2, 11, "forward");
    expect(editor.focus.state.focusedKey).toBe(node("text").key);
    editor.find.open(node("text").key); editor.find.setQuery("selection"); await editor.find.flush();
    expect(editor.find.state.open).toBe(true); expect(editor.minimap.layersFor(node("page").key)).toHaveLength(1);

    click(host.querySelector<HTMLButtonElement>('[aria-label="Minimize window"]')!); await Promise.resolve();
    const icon = host.querySelector<HTMLButtonElement>('[data-window-icon]')!;
    expect(icon).not.toBeNull(); expect(icon.dataset.iconKind).toBe("document");
    expect(icon.getAttribute("aria-label")).toBe("Restore Research notes");
    expect(host.querySelector("textarea")).toBeNull(); expect(document.activeElement).toBe(icon);
    expect(editor.find.state.open).toBe(false); expect(editor.minimap.layersFor(node("page").key)).toHaveLength(0);
    expect((node("window").payload.metadata as any).state).toBe("minimized");
    expect(node("window").key).toBe(windowKey); expect(node("window").contentKey).toBe(contentKey);
    expect(Object.values(projection.state.nodes).map(item => item.key).sort()).toEqual(childKeys);

    editor.repository.undo();
    expect(host.querySelector("[data-window-icon]")).toBeNull(); expect(host.querySelector("textarea")).not.toBeNull();
    expect((node("window").payload.metadata as any).state).toBe("normal");
    editor.repository.redo(); expect(host.querySelector("[data-window-icon]")).not.toBeNull();

    const revision = editor.repository.state.revision, draggedIcon = host.querySelector<HTMLButtonElement>("[data-window-icon]")!;
    draggedIcon.dispatchEvent(new MouseEvent("pointerdown", { button: 0, clientX: 100, clientY: 100, bubbles: true, cancelable: true }));
    draggedIcon.dispatchEvent(new MouseEvent("pointermove", { button: 0, clientX: 140, clientY: 120, bubbles: true, cancelable: true }));
    expect(editor.repository.state.revision).toBe(revision);
    draggedIcon.dispatchEvent(new MouseEvent("pointerup", { button: 0, clientX: 140, clientY: 120, bubbles: true, cancelable: true }));
    expect((node("window").payload.metadata as any).position).toEqual({ x: 60, y: 50 });
    expect(editor.repository.state.revision).toBe(revision + 1);
    click(draggedIcon); expect(host.querySelector("[data-window-icon]")).not.toBeNull();
    click(draggedIcon); await Promise.resolve(); await Promise.resolve();

    const restored = host.querySelector<HTMLElement>("[data-block-id='window']")!, restoredText = host.querySelector<HTMLTextAreaElement>("textarea")!;
    expect(host.querySelector("[data-window-icon]")).toBeNull(); expect(restored.style.transform).toBe("translate(60px, 50px)");
    expect(restored.style.width).toBe("400px"); expect(restored.style.height).toBe("300px");
    expect(document.activeElement).toBe(restoredText); expect([restoredText.selectionStart, restoredText.selectionEnd]).toEqual([2, 11]);
    expect(Object.values(projection.state.nodes).map(item => item.key).sort()).toEqual(childKeys);
  });

  it("round-trips a minimized icon and resolves semantic and legacy defaults", () => {
    const first = mount({
      id: "window", type: "document-window-block",
      metadata: { title: "Saved icon", position: { x: 12, y: 18 }, size: { w: 500, h: 350 }, state: "normal", zIndex: 2, icon: { kind: "window" } },
      children: [{ id: "document", type: "document-block", children: [] }],
    });
    click(first.host.querySelector<HTMLButtonElement>('[aria-label="Minimize window"]')!);
    const saved = first.editor.encodeDocument(); expect((saved.metadata as any).state).toBe("minimized");

    const secondEditor = new ReactiveEditor(saved); registerCoreViews(secondEditor); const secondProjection = secondEditor.createView("reloaded-window");
    const secondHost = globalThis.document.body.appendChild(globalThis.document.createElement("div")), dispose = render(() => <ReactiveTreeView editor={secondEditor} projection={secondProjection} />, secondHost);
    cleanup.push(() => { dispose(); secondEditor.dispose(); });
    expect(secondHost.querySelector<HTMLElement>("[data-window-icon]")?.dataset.iconKind).toBe("window");
    click(secondHost.querySelector<HTMLButtonElement>("[data-window-icon]")!);
    expect(secondHost.querySelector("[data-window-icon]")).toBeNull();
    expect(secondHost.querySelector<HTMLElement>("[data-block-id='window']")?.style.width).toBe("500px");

    expect(resolvedWindowState("maximised")).toBe("maximized");
    expect(resolvedWindowState("unexpected")).toBe("normal");
    expect(resolvedWindowIcon("document-window-block", undefined)).toBe("document");
    expect(resolvedWindowIcon("window-block", undefined)).toBe("window");
  });

  it("restores a standoff Cell selection after its child view remounts", async () => {
    const { editor, host, node } = mount({
      id: "window", type: "document-window-block",
      metadata: { title: "Annotated document", position: { x: 20, y: 20 }, size: { w: 400, h: 300 }, state: "normal" },
      children: [{ id: "document", type: "document-block", children: [{ id: "page", type: "page-block", children: [{ id: "text", type: "standoff-editor-block", text: "Alpha beta" }] }] }],
    });
    const textKey = node("text").key, handle = editor.mounts.get(textKey)!;
    handle.focus(); handle.restoreInlineSelection?.({ anchor: 1, head: 5 }); editor.focus.adopt(textKey);
    click(host.querySelector<HTMLButtonElement>('[aria-label="Minimize window"]')!);
    expect(editor.mounts.get(textKey)).toBeUndefined();
    click(host.querySelector<HTMLButtonElement>("[data-window-icon]")!); await Promise.resolve(); await Promise.resolve();
    expect(editor.focus.state.focusedKey).toBe(textKey);
    expect(editor.mounts.get(textKey)?.captureInlineSelection?.()).toEqual({ anchor: 1, head: 5 });
  });
});
