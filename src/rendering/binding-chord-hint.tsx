import { Show } from "solid-js";
import { Portal } from "solid-js/web";
import type { ReactiveEditor } from "../reactive-editor/editor";
import "./binding-chord-hint.css";

export function BindingChordHint(props: { editor: ReactiveEditor; viewId: string }) {
  const firstView = () => props.editor.projections.values().next().value?.viewId;
  return <Show when={firstView() === props.viewId}><Portal><Show when={props.editor.bindings.pendingHint()}>{hint => <div class="binding-chord-hint" role="status" aria-live="polite">{hint()}</div>}</Show></Portal></Show>;
}
