// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "solid-js/web";
import { ReactiveEditor } from "../reactive-editor/editor";
import { MinimapService, nodeKeysForPage, pageForNode } from "../runtime/minimap";
import { ReactiveTreeView } from "./reactive-tree-view";
import { registerCoreViews } from "./register-core-views";

const cleanup: Array<() => void> = [];
afterEach(() => { cleanup.splice(0).reverse().forEach(dispose => dispose()); document.body.replaceChildren(); vi.restoreAllMocks(); vi.useRealTimers(); });

const rect = (left: number, top: number, width: number, height: number) => ({ left, top, right: left + width, bottom: top + height, width, height, x: left, y: top, toJSON: () => ({}) });

describe("page minimap", () => {
  it("keeps owner layers and configuration entirely outside document state", () => {
    const editor = new ReactiveEditor({ type: "document-block", children: [{ id: "page", type: "page-block", children: [{ id: "text", type: "standoff-editor-block", text: "Text" }] }] });
    const projection = editor.createView("minimap-service"); cleanup.push(() => editor.dispose());
    const page = Object.values(projection.state.nodes).find(node => node.payload.id === "page")!;
    const text = Object.values(projection.state.nodes).find(node => node.payload.id === "text")!;
    const before = editor.encodeDocument(), revision = editor.repository.state.revision, activated = vi.fn();
    editor.minimap.attach("find", { pageKey: page.key, markers: [{ id: "one", group: "results", anchor: { kind: "text-range", range: { nodeKey: text.key, contentKey: text.contentKey, placementKey: text.placementKey, version: 0, start: 0, end: 2, coordinate: "cell" } }, colour: "#ff0", opacity: .4 }], onActivate: activated });
    editor.minimap.attach("entities", { pageKey: page.key, priority: 20, markers: [{ id: "two", group: "entity", anchor: { kind: "ratio", top: .75 }, colour: "#0ff", opacity: .5 }] });
    expect(editor.minimap.layersFor(page.key).map(layer => layer.owner)).toEqual(["find", "entities"]);
    editor.minimap.setGroupVisible("entities", "entity", false); expect(editor.minimap.hasVisibleMarkers(page.key)).toBe(true);
    editor.minimap.configure({ side: "left", blendMode: "source-over", width: 24 });
    expect(editor.minimap.state.options).toMatchObject({ side: "left", blendMode: "source-over", width: 24, height: "available" });
    expect(editor.minimap.activate("find", "one")).toBe(true); expect(activated).toHaveBeenCalledTimes(1);
    editor.minimap.invalidateContent(text.contentKey); expect(editor.minimap.layersFor(page.key)[0].markers).toHaveLength(0);
    expect(pageForNode(editor, text.key)).toBe(page.key); expect(nodeKeysForPage(editor, page.key).has(text.key)).toBe(true);
    expect(editor.repository.state.revision).toBe(revision); expect(editor.repository.canUndo()).toBe(false); expect(editor.encodeDocument()).toEqual(before);
  });

  it("fills the visible scrollport, omits non-Page markers, blends on canvas and delegates clicks", async () => {
    vi.useFakeTimers();
    const operations: string[] = [];
    const context = {
      globalCompositeOperation: "source-over", globalAlpha: 1, fillStyle: "", strokeStyle: "", lineWidth: 1,
      setTransform: vi.fn(), clearRect: vi.fn(),
      fillRect: vi.fn(function(this: typeof context) { operations.push(this.globalCompositeOperation); }), strokeRect: vi.fn(),
    };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function(this: HTMLElement) {
      if (this.id === "minimap-host") return rect(0, 80, 800, 520) as DOMRect;
      if (this.classList.contains("reactive-page__main")) return rect(250, 80, 300, 1000) as DOMRect;
      if (this.classList.contains("reactive-page")) return rect(100, 80, 600, 1000) as DOMRect;
      if (this instanceof HTMLCanvasElement) return rect(Number.parseFloat(this.style.left) || 0, Number.parseFloat(this.style.top) || 80, Number.parseFloat(this.style.width) || 20, Number.parseFloat(this.style.height) || 520) as DOMRect;
      return rect(250, 180, 300, 24) as DOMRect;
    });
    const editor = new ReactiveEditor({ type: "document-block", children: [
      { id: "page-a", type: "page-block", children: [{ id: "a", type: "standoff-editor-block", text: "Alpha" }] },
      { id: "page-b", type: "page-block", children: [{ id: "b", type: "standoff-editor-block", text: "Beta" }] },
    ] });
    registerCoreViews(editor); const projection = editor.createView("minimap-view");
    const host = document.body.appendChild(document.createElement("div")); host.id = "minimap-host"; host.style.overflowY = "auto";
    Object.defineProperty(host, "scrollHeight", { configurable: true, value: 1000 });
    Object.defineProperty(host, "clientHeight", { configurable: true, value: 520 });
    const dispose = render(() => <ReactiveTreeView editor={editor} projection={projection} />, host); cleanup.push(() => { dispose(); editor.dispose(); });
    const node = (id: string) => Object.values(projection.state.nodes).find(item => item.payload.id === id)!;
    const pageElement = editor.mounts.get(node("page-a").key)!.root as HTMLElement;
    Object.defineProperty(pageElement, "scrollHeight", { configurable: true, value: 1000 });
    const activated = vi.fn(), highPriority = vi.fn();
    editor.minimap.attach("test", { pageKey: node("page-a").key, markers: [
      { id: "ratio", anchor: { kind: "ratio", top: .25 }, colour: "#ff0", opacity: .5, label: "Quarter" },
      { id: "other-page", anchor: { kind: "block", nodeKey: node("b").key }, colour: "#0ff", opacity: .5 },
    ], onActivate: activated });
    editor.minimap.attach("high", { pageKey: node("page-a").key, priority: 20, markers: [
      { id: "same-position", anchor: { kind: "ratio", top: .25 }, colour: "#f0f", opacity: .5, label: "Priority marker" },
    ], onActivate: highPriority });
    await vi.runAllTimersAsync();
    const rail = document.querySelector<HTMLElement>("[data-page-minimap]")!, canvas = rail.querySelector("canvas")!;
    expect(rail.style.height).toBe("520px"); expect(rail.style.left).toBe("582px"); expect(rail.getAttribute("aria-label")).toContain("2 minimap markers; 1 hidden");
    expect(node("page-a").key).toBe(rail.dataset.pageMinimap); expect(pageElement.classList).toContain("reactive-page--minimap-right");
    expect(operations).toContain("multiply");
    canvas.dispatchEvent(new MouseEvent("click", { clientY: 210, bubbles: true, cancelable: true }));
    expect(highPriority).toHaveBeenCalledWith(expect.objectContaining({ id: "same-position" })); expect(activated).not.toHaveBeenCalled();

    const repositoryRevisionBeforeScroll = editor.repository.state.revision;
    canvas.dispatchEvent(new MouseEvent("pointerdown", { button: 0, clientY: 180, bubbles: true, cancelable: true }));
    canvas.dispatchEvent(new MouseEvent("pointermove", { button: 0, clientY: 300, bubbles: true, cancelable: true }));
    canvas.dispatchEvent(new MouseEvent("pointerup", { button: 0, clientY: 300, bubbles: true, cancelable: true }));
    expect(host.scrollTop).toBeGreaterThan(0);
    canvas.dispatchEvent(new MouseEvent("click", { clientY: 300, bubbles: true, cancelable: true }));
    await vi.runAllTimersAsync(); host.scrollTop = 0; await vi.runAllTimersAsync();
    canvas.dispatchEvent(new MouseEvent("click", { clientY: 570, bubbles: true, cancelable: true }));
    expect(host.scrollTop).toBeGreaterThan(0);
    const afterTrackClick = host.scrollTop;
    canvas.dispatchEvent(new WheelEvent("wheel", { deltaY: -60, bubbles: true, cancelable: true }));
    expect(host.scrollTop).toBe(afterTrackClick - 60);
    expect(editor.repository.state.revision).toBe(repositoryRevisionBeforeScroll); expect(editor.repository.canUndo()).toBe(false);

    editor.minimap.configure({ side: "left", blendMode: "source-over" }); await vi.runAllTimersAsync();
    expect(rail.style.left).toBe("198px"); expect(pageElement.classList).toContain("reactive-page--minimap-left");
    expect(pageElement.classList).not.toContain("reactive-page--minimap-right"); expect(operations).toContain("source-over");

    const repositoryRevision = editor.repository.state.revision;
    editor.minimap.dispose("high"); editor.minimap.attach("test", { pageKey: node("page-a").key, markers: Array.from({ length: 5000 }, (_, index) => ({ id: `bulk-${index}`, anchor: { kind: "ratio" as const, top: index / 4999 }, colour: "#ff0", opacity: .25 })) });
    await vi.runAllTimersAsync();
    expect(rail.getAttribute("aria-label")).toContain("5000 minimap markers"); expect(rail.children).toHaveLength(1);
    expect(editor.repository.state.revision).toBe(repositoryRevision); expect(editor.repository.canUndo()).toBe(false);
  });
});
