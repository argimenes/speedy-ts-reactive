// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "solid-js/web";
import { ReactiveEditor } from "../../reactive-editor/editor";
import { registerCoreViews } from "../../rendering/register-core-views";
import { ReactiveTreeView } from "../../rendering/reactive-tree-view";
import { createCompactDocumentFeature } from "./index";
import { presentationCapabilities } from "../../application/presentation-capabilities";
import type { ExistingBlockDto } from "../../block-tree/types";
import { matchSources } from "../../runtime/search-matching";
import type { ReactiveEditorConfiguration } from "../../configuration";

vi.mock("../../runtime/search-worker", () => ({ runSearchWorker: async (sources: Parameters<typeof matchSources>[0], query: string, options: Parameters<typeof matchSources>[2]) => matchSources(sources, query, options) }));

const cleanup: Array<() => void> = [];
afterEach(() => { while (cleanup.length) cleanup.pop()?.(); document.body.replaceChildren(); vi.useRealTimers(); vi.unstubAllGlobals(); });

function mount(dto: ExistingBlockDto = {
  id: "window",
  type: "document-window-block",
  metadata: { title: "Research notes", position: { x: 20, y: 30 }, size: { w: 400, h: 300 }, state: "normal", zIndex: 4 },
  children: [{ id: "document", type: "document-block", children: [{ id: "page", type: "page-block", children: [{ id: "text", type: "plain-text-block", text: "Remember this selection" }] }] }],
}, configuration: ReactiveEditorConfiguration = {}) {
  const editor = new ReactiveEditor(dto, configuration); registerCoreViews(editor);
  const releaseFeature = editor.featureHost.activate(createCompactDocumentFeature(scope => presentationCapabilities(editor, scope)));
  const projection = editor.createView("window-icon-test"), host = globalThis.document.body.appendChild(globalThis.document.createElement("div"));
  const dispose = render(() => <ReactiveTreeView editor={editor} projection={projection} />, host); editor.installGateway(globalThis.document);
  cleanup.push(() => { dispose(); editor.dispose(); });
  const node = (id: string) => Object.values(projection.state.nodes).find(item => item.payload.id === id)!;
  return { editor, projection, host, node, releaseFeature, dispose };
}

const click = (element: HTMLElement) => element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

describe("Compact Document presentation", () => {
  it("keeps explicit Compact Document state independent from narrow-window collapse", async () => {
    const observers: Array<{ callback: ResizeObserverCallback; targets: Element[] }> = [];
    vi.stubGlobal("ResizeObserver", class {
      private record: { callback: ResizeObserverCallback; targets: Element[] };
      constructor(callback: ResizeObserverCallback) { this.record = { callback, targets: [] }; observers.push(this.record); }
      observe(target: Element) { this.record.targets.push(target); }
      disconnect() { this.record.targets = []; }
      unobserve() {}
    });
    const { editor, host, node } = mount({
      id: "window", type: "document-window-block", metadata: { title: "Compact margins", size: { w: 840, h: 500 }, state: "normal" },
      children: [{ id: "document", type: "document-block", children: [{ id: "page", type: "page-block", children: [{
        id: "source", type: "standoff-editor-block", text: "Source", relation: { rightMargin: { id: "margin", type: "right-margin-block", children: [{ id: "note", type: "standoff-editor-block", text: "Note" }] } },
      }] }] }],
    }, { features: { compactDocumentMode: true } });
    const before = editor.encodeDocument(), revision = editor.repository.state.revision;
    const window = host.querySelector<HTMLElement>("[data-block-id='window']")!;
    const toggle = host.querySelector<HTMLButtonElement>('[aria-label="Compact document"]')!;
    const windowObserver = observers.find(observer => observer.targets.some(target => target === window))!;

    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    const noteKey = node("note").key, noteMount = editor.mounts.get(noteKey)!;
    noteMount.focus(); noteMount.restoreInlineSelection?.({ anchor: 1, head: 3 }); editor.focus.adopt(noteKey);
    click(toggle); await new Promise(resolve => setTimeout(resolve, 30));
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(window.classList).toContain("reactive-window--margins-collapsed");
    expect(editor.mounts.get(noteKey)?.captureInlineSelection?.()).toEqual({ anchor: 1, head: 3 });
    expect(editor.mounts.get(noteKey)?.focusElement.closest(".reactive-window__margin-drawer")).not.toBeNull();
    expect(host.querySelectorAll(".document-margin-indicator")).toHaveLength(1);
    click(host.querySelector<HTMLButtonElement>('[aria-label="Close margins"]')!); await Promise.resolve();
    click(host.querySelector<HTMLButtonElement>(".document-margin-indicator")!); await Promise.resolve();
    expect(host.querySelectorAll("[data-margin-drawer-item]")).toHaveLength(1);
    click(host.querySelector<HTMLButtonElement>('[aria-label="Close margins"]')!); await Promise.resolve();

    click(toggle);
    expect(window.classList).not.toContain("reactive-window--margins-collapsed");
    windowObserver.callback([{ contentRect: { width: 700 } } as ResizeObserverEntry], {} as ResizeObserver);
    expect(window.classList).toContain("reactive-window--margins-collapsed");
    click(toggle);
    windowObserver.callback([{ contentRect: { width: 840 } } as ResizeObserverEntry], {} as ResizeObserver);
    expect(window.classList).toContain("reactive-window--margins-collapsed");
    click(toggle);
    expect(window.classList).not.toContain("reactive-window--margins-collapsed");
    expect(editor.repository.state.revision).toBe(revision);
    expect(editor.encodeDocument()).toEqual(before);
  });


  it("restores expanded width after compact resizing, and releases per-window state on disposal", () => {
    const make = () => mount({ id: "window", type: "document-window-block", metadata: { size: { w: 840, h: 500 } }, children: [{ type: "document-block", children: [{ type: "page-block", children: [{ type: "plain-text-block", text: "Keep editing" }] }] }] });
    const first = make(), second = make();
    const root = first.host.querySelector<HTMLElement>(".reactive-window")!;
    const page = root.querySelector<HTMLElement>(".reactive-page")!;
    page.style.paddingLeft = "120px"; page.style.paddingRight = "120px";
    root.getBoundingClientRect = () => ({ left: 0, top: 0, width: parseFloat(root.style.width), height: 500 }) as DOMRect;
    const toggle = root.querySelector<HTMLButtonElement>('[aria-label="Compact document"]')!;
    const before = first.editor.encodeDocument(), textarea = root.querySelector("textarea");
    click(toggle);
    expect(root.style.width).toBe("664px");
    expect(first.editor.encodeDocument()).toEqual(before);
    expect(root.querySelector("textarea")).toBe(textarea);
    expect(second.host.querySelector('[aria-label="Compact document"]')?.getAttribute("aria-pressed")).toBe("false");
    const handle = root.querySelector<HTMLElement>(".reactive-window__resize")!;
    handle.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    handle.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect((first.node("window").payload.metadata as any).size.w).toBe(850);
    expect(root.style.width).toBe("674px");
    click(toggle); expect(root.style.width).toBe("850px");
    click(toggle); first.releaseFeature(); first.releaseFeature();
    expect(root.style.width).toBe("850px");
    expect(root.querySelector('[aria-label="Compact document"]')).toBeNull();
    expect(root.classList.contains("compact-document-feature")).toBe(false);
    expect(root.querySelector("textarea")).toBe(textarea);
    expect(second.host.querySelector('[aria-label="Compact document"]')).not.toBeNull();
    first.editor.featureHost.activate(createCompactDocumentFeature(scope => presentationCapabilities(first.editor, scope)));
    expect(root.querySelector('[aria-label="Compact document"]')?.getAttribute("aria-pressed")).toBe("false");
    first.dispose(); // Unmounting one window does not remove the contribution from its editor.
    expect(first.editor.windowPresentation.contribution()).toBeDefined();
    expect(second.host.querySelector('[aria-label="Compact document"]')).not.toBeNull();
  });

  it("keeps two windows in one editor independent across unmount and remount", () => {
    const dto = (id: string): ExistingBlockDto => ({ id, type: "document-window-block", metadata: { size: { w: 840, h: 500 } }, children: [{ type: "document-block", children: [] }] });
    const { editor, host, node, releaseFeature } = mount({ type: "workspace-block", children: [dto("first"), dto("second")] });
    const buttons = [...host.querySelectorAll<HTMLButtonElement>('[aria-label="Compact document"]')];
    click(buttons[0]);
    expect(buttons.map(button => button.getAttribute("aria-pressed"))).toEqual(["true", "false"]);
    editor.commands.remove(node("first").key);
    expect(host.querySelectorAll('[aria-label="Compact document"]')).toHaveLength(1);
    expect(buttons[1].getAttribute("aria-pressed")).toBe("false");
    editor.repository.undo();
    expect([...host.querySelectorAll('[aria-label="Compact document"]')].map(button => button.getAttribute("aria-pressed"))).toEqual(["false", "false"]);
    releaseFeature(); expect(host.querySelectorAll('[aria-label="Compact document"]')).toHaveLength(0);
  });
});
