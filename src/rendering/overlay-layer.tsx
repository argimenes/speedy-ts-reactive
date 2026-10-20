import { For, onCleanup, onMount } from "solid-js";
import { Portal } from "solid-js/web";
import { ApplicationSurfacePortal } from "./window-manager";
import type { ReactiveEditor } from "../reactive-editor/editor";
import type { OverlayDescriptor } from "../runtime/overlays";

function OverlayView(props: { editor: ReactiveEditor; overlay: OverlayDescriptor }) {
  let root!: HTMLDivElement;
  let input!: HTMLInputElement;
  let dispose: (() => void) | undefined;
  onMount(() => {
    dispose = props.editor.mounts.register(props.overlay.key, {
      root,
      focusElement: input,
      inputPolicy: "opaque-widget",
      focus: () => input.focus({ preventScroll: true }),
    });
  });
  onCleanup(() => dispose?.());
  return (
    <div
      ref={root}
      class="reactive-overlay"
      role="dialog"
      aria-label={props.overlay.title ?? props.overlay.viewType}
      style={{ left: `${props.overlay.anchor.x}px`, top: `${props.overlay.anchor.y}px` }}
      data-session-overlay={props.overlay.key}
    >
      <header>
        <span>{props.overlay.title ?? props.overlay.viewType}</span>
        <button type="button" aria-label="Close panel" onClick={() => props.editor.overlays.close(props.overlay.key)}>×</button>
      </header>
      <input ref={input} type="search" placeholder="Search" />
    </div>
  );
}

export function OverlayLayer(props: { editor: ReactiveEditor }) {
  if (!props.editor.windowManager) return <Portal mount={document.body}><div class="reactive-overlay-layer"><For each={props.editor.overlays.overlays.filter(overlay => overlay.viewType !== "context-menu" && !props.editor.panels.get(overlay.viewType))}>{overlay=><OverlayView editor={props.editor} overlay={overlay}/>}</For></div></Portal>;
  return (
    <div class="reactive-overlay-layer">
        <For each={props.editor.overlays.overlays.filter(overlay => overlay.viewType !== "context-menu" && !props.editor.panels.get(overlay.viewType))}>
          {(overlay) => <ApplicationSurfacePortal editor={props.editor} ownerKey={overlay.ownerKey} id={overlay.key} kind="tool"><OverlayView editor={props.editor} overlay={overlay} /></ApplicationSurfacePortal>}
        </For>
    </div>
  );
}
