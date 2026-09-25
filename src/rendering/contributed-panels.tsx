import { For, Show } from "solid-js";
import { Dynamic, Portal } from "solid-js/web";
import type { ReactiveEditor } from "../reactive-editor/editor";
import { panelSession } from "../runtime/panel-session";

export function ContributedPanels(props: { editor: ReactiveEditor; viewId: string }) {
  return <Portal><For each={props.editor.overlays.overlays.filter(overlay => props.editor.node(overlay.ownerKey)?.viewId === props.viewId)}>{overlay =>
    <Show when={props.editor.panels.get(overlay.viewType)}>{definition => <Dynamic component={definition().view} panel={panelSession(props.editor, overlay)} />}</Show>
  }</For></Portal>;
}
