import { createSignal, onCleanup, onMount } from "solid-js";
import { render } from "solid-js/web";
import { ReactiveEditor } from "../reactive-editor/editor";
import { registerApplicationViews } from "../application/features";
import { ReactiveTreeView } from "../rendering/reactive-tree-view";
import { coordinateScale } from "../runtime/local-coordinates";
import type { ExistingBlockDto } from "../block-tree/types";
import "./workspace-demo.css";

// An ordinary core document Window: no Canvas object model or custom editor.
export const scaledWindowDocument: ExistingBlockDto = {
  id: "scale-document", type: "document-block", metadata: { documentId: "scale-document" },
  children: [{ id: "page", type: "page-block", children: [
    { id: "a", type: "standoff-editor-block", text: "Blake wrote about art and colour. ".repeat(8), standoffProperties: [
      { id: "entity", type: "codex/entity-reference", start: 0, end: 200, value: "blake", metadata: { entityName: "Blake" } },
      { id: "rainbow", type: "style/rainbow", start: 0, end: 200 },
      { id: "highlight", type: "style/highlighter", start: 10, end: 40 },
    ] },
    { id: "b", type: "standoff-editor-block", text: "Another passage to select across Blocks." },
    { id: "native", type: "plain-text-block", text: "Native text field" },
    { id: "source", type: "standoff-editor-block", text: "Margin source", relation: { leftMargin: {
      id: "margin", type: "left-margin-block", children: [{ id: "note", type: "plain-text-block", text: "Margin note selection" }],
    } } },
  ] }],
};

/** Dev-only qualification host. Its layout signals never write authored metadata. */
export function mountScaledWindowPrototype(container: HTMLElement, options: { scale: number; document?: ExistingBlockDto; hosted?: boolean }) {
  if (!import.meta.env.DEV || import.meta.env.VITE_CANVAS_MILESTONE_A !== "1") throw new Error("Enable VITE_CANVAS_MILESTONE_A=1 for the scaled Window prototype.");
  const scale = coordinateScale(options.scale);
  const editor = new ReactiveEditor({ id: "win", type: "document-window-block", metadata: {
    title: "Scaled document qualification", position: { x: 12, y: 12 }, size: { w: 1000, h: 640 }, state: "normal",
  }, children: [structuredClone(options.document ?? scaledWindowDocument)] });
  registerApplicationViews(editor);
  const projection = editor.createView("scaled-window-prototype");
  const [position, move] = createSignal({ x: 12, y: 12 });
  const [size, resize] = createSignal({ width: 1000, height: 640 });
  const geometry = { position, expandedSize: size, move, resize };
  const host = document.createElement("div");
  host.className = "workspace-demo";
  host.style.cssText = "position:relative;padding:0;min-height:100vh;overflow:auto;background:#edf0f2";
  container.append(host);
  const disposeView = render(() => <div style={{ position: "absolute", left: "32px", top: "48px", width: "1100px", height: "800px", transform: `scale(${scale})`, "transform-origin": "0 0" }}>
    <ReactiveTreeView editor={editor} projection={projection}
      coordinates={options.hosted === false ? undefined : { scale: () => scale }}
      windowGeometry={options.hosted === false ? undefined : key => key === projection.state.rootKey ? geometry : undefined} />
  </div>, host);
  editor.installGateway(document);
  return { editor, projection, host, geometry, scale,
    dispose: () => { disposeView(); editor.dispose(); host.remove(); },
  };
}

export default function ScaledWindowPrototype() {
  let root!: HTMLDivElement;
  let instance: ReturnType<typeof mountScaledWindowPrototype> | undefined;
  const requested = Number(new URLSearchParams(location.search).get("scale") ?? 1);
  onMount(() => { instance = mountScaledWindowPrototype(root, { scale: [0.5, 1, 2].includes(requested) ? requested : 1 }); });
  onCleanup(() => instance?.dispose());
  return <div ref={root} aria-label="Milestone A scaled Window prototype" />;
}
