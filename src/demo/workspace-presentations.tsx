import { For } from "solid-js";
import type { WorkspaceSession } from "../application/workspace-session";
import { SystemSubmenu } from "./codex-system-bar";

export function WorkspacePresentations(props: { session: WorkspaceSession; menu?: boolean; busy?: boolean }) {
  const choose = (name: "desktop" | "canvas") => props.session.editor.commandRegistry.execute(`workspace.presentation.${name}`, { targetKey: props.session.projection.state.rootKey, args: undefined });
  const disabled = () => props.busy || !props.session.presentation.editable();
  return props.menu ? <SystemSubmenu label="Presentations"><For each={["desktop", "canvas"] as const}>{name =>
    <button type="button" role="menuitemradio" aria-checked={props.session.presentation.active() === name} disabled={disabled()} onClick={() => choose(name)}>{name === "desktop" ? "Desktop" : "Canvas"}<span aria-hidden="true">{props.session.presentation.active() === name ? "✓" : ""}</span></button>
  }</For></SystemSubmenu> : <span class="workspace-presentations" role="group" aria-label="Presentations"><For each={["desktop", "canvas"] as const}>{name =>
    <button type="button" aria-pressed={props.session.presentation.active() === name} disabled={disabled()} onClick={() => choose(name)}>{name === "desktop" ? "Desktop" : "Canvas"}</button>
  }</For></span>;
}
