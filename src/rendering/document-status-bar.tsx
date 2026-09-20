import { Show } from "solid-js";
import type { ReactiveEditor } from "../reactive-editor/editor";
import { DocumentCountBar } from "./document-count-bar";
import "./document-style-bar.css";

/** Chrome only: DocumentCountBar continues to own the single counting worker. */
export function DocumentStatusBar(props: { editor: ReactiveEditor; scopeKey?: string; notice?: string }) {
  const historyProblem = () => {
    const state = props.editor.blockHistory.state;
    return state.recordingError || (["stopped", "offline"].includes(state.recording?.phase ?? "") ? state.recording?.message : "");
  };
  const message = () => historyProblem() ? `History: ${historyProblem()}` : props.notice;
  return <footer class="document-status-bar" aria-label="Document status" data-native-context-menu>
    <DocumentCountBar editor={props.editor} scopeKey={props.scopeKey} />
    <Show when={message()}><details class="document-status-bar__notice" onKeyDown={event => { if (event.key === "Escape") { event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); event.stopPropagation(); } }}>
      <summary aria-label="Editor message"><span role="status">{message()}</span></summary>
      <div class="document-status-bar__message">{message()}</div>
    </details></Show>
  </footer>;
}
