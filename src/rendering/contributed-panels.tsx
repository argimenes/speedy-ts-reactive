import { For, Show } from "solid-js";
import { Dynamic } from "solid-js/web";
import { ApplicationSurfacePortal } from "./window-manager";
import type { ReactiveEditor } from "../reactive-editor/editor";
import { panelSession } from "../runtime/panel-session";

export function ContributedPanels(props: { editor: ReactiveEditor; viewId: string }) {
  return <For each={props.editor.overlays.overlays.filter(overlay => props.editor.node(overlay.ownerKey)?.viewId === props.viewId)}>{overlay =>
    <Show when={props.editor.panels.get(overlay.viewType)}>{definition =>
      <ApplicationSurfacePortal editor={props.editor} ownerKey={overlay.ownerKey} sourceViewId={props.viewId} id={overlay.key} kind="tool">
        <Dynamic component={definition().view} panel={panelSession(props.editor, overlay)} />
      </ApplicationSurfacePortal>
    }</Show>
  }</For>;
}
