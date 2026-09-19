import { CompactPreviewView } from "./history-preview";
import { For, Show, createMemo, onCleanup, onMount } from "solid-js";
import { Portal } from "solid-js/web";
import type { ReactiveEditor } from "../reactive-editor/editor";
import "./block-history.css";

const labels: Record<string, string> = { authored: "Content or properties changed", children: "Child Blocks changed", location: "Location changed", dependency: "References or annotations changed", created: "Block created", deleted: "Block deleted" };

function HistoryPanel(props: { editor: ReactiveEditor }) {
  const history = props.editor.blockHistory, state = history.state;
  let root!: HTMLDivElement;
  const selected = createMemo(() => state.entries.find(entry => entry.revisionId === state.selectedRevisionId));
  onMount(() => {
    const unregister = props.editor.mounts.register(history.owner, { root, focusElement: root, inputPolicy: "opaque-widget", focus: () => { (root.querySelector<HTMLElement>("[aria-current=true]") ?? root).focus(); } });
    onCleanup(unregister);
    root.focus();
  });
  const keys = (event: KeyboardEvent) => {
    event.stopPropagation();
    if (event.key === "Escape") { event.preventDefault(); history.close(); return; }
    if (event.key === "Tab") {
      const buttons = [...root.querySelectorAll<HTMLElement>("button:not(:disabled), select:not(:disabled), summary, [tabindex='0']")];
      const at = buttons.indexOf(document.activeElement as HTMLElement);
      if (event.shiftKey && at <= 0) { event.preventDefault(); buttons.at(-1)?.focus(); }
      else if (!event.shiftKey && (at < 0 || at === buttons.length - 1)) { event.preventDefault(); buttons[0]?.focus(); }
    }
    if (!(event.target as HTMLElement)?.closest(".block-history-timeline") || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const buttons = [...root.querySelectorAll<HTMLButtonElement>("[data-history-revision]")], current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const index = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : Math.max(0, Math.min(buttons.length - 1, current + (event.key === "ArrowDown" ? 1 : -1)));
    buttons[index]?.focus(); buttons[index]?.click();
  };
  const date = (value: string) => { const d = new Date(value); return Number.isNaN(d.getTime()) ? value : d.toLocaleString(); };
  return <div class="block-history-shade" onPointerDown={event => { if (event.target === event.currentTarget) history.close(); }}>
    <div ref={root} class="block-history-panel" role="dialog" aria-modal="true" aria-label="Block history" tabIndex={-1} data-native-context-menu onKeyDown={keys}>
      <header class="block-history-header"><div><span class="block-history-eyebrow">BLOCK HISTORY <span class="block-history-badge">{state.storage === "persistent" ? "Persistent" : "Session-only"}</span></span><h2>{state.title}</h2></div><button type="button" aria-label="Close Block history" onClick={() => history.close()}>×</button></header>
      <p class="block-history-notice">{state.storage === "persistent"
        ? "History is recorded separately from Save. Earlier recording sessions remain available after reopening. Browsing never changes your Document; restoring requires confirmation."
        : "Recording starts when History is first opened. Close this panel, make edits, then reopen History to see them. This history is lost when the Document session closes or the page reloads. Save the Document to use persistent history."}</p>
      <Show when={state.storage === "persistent" && state.sessions.length}>
        <label class="block-history-session">Recording session <select aria-label="Recording session" value={state.segmentId} disabled={state.loading} onChange={event => void history.chooseSession(event.currentTarget.value)}>
          <For each={state.sessions}>{session => <option value={session.segmentId}>{date(session.metadata.timestamp ?? "")} · {session.headSequence} revisions</option>}</For>
        </select></label>
      </Show>
      <Show when={state.error}><p class="block-history-error" role="alert">{state.error}</p></Show>
      <Show when={state.incomplete}><p class="block-history-error" role="status">Recording stopped at a supported limit or capture error. Earlier revisions are available; the latest recorded state may differ from your current Document. See Recording status below.</p></Show>
      <div class="block-history-body">
        <nav class="block-history-timeline" aria-label="Historical revisions" aria-busy={state.loading}>
          <h3>Revisions</h3>
          <For each={state.entries}>{entry => <button type="button" data-history-revision={entry.revisionId} aria-current={entry.revisionId === state.selectedRevisionId ? "true" : undefined} onClick={() => void history.select(entry.revisionId)}>
            <span class="block-history-revision-title">{entry.baseline ? "Recording started" : entry.label}</span>
            <time dateTime={entry.timestamp}>{date(entry.timestamp)}</time>
            <Show when={!entry.baseline}><span class="block-history-muted">{entry.cause}</span></Show>
            <Show when={entry.location}><span class="block-history-location">{entry.location}</span></Show>
          </button>}</For>
          <Show when={state.loading}><p role="status">Loading revisions…</p></Show>
          <Show when={state.nextCursor}><button type="button" disabled={state.loading || state.selecting} onClick={() => void history.more()}>More revisions</button></Show>
          <Show when={!state.loading && !state.entries.length && !state.error}><p>No recorded revisions for this Block.</p></Show>
        </nav>
        <section class="block-history-preview" aria-label="Historical preview" aria-busy={state.selecting} tabIndex={0}>
          <Show when={state.selecting}><p role="status">Loading historical Block…</p></Show>
          <Show when={state.result}>{result => <>
            <div class="block-history-comparison-summary" aria-live="polite"><h3>{selected()?.baseline ? "Recording started" : selected()?.label ?? "Selected revision"}</h3>
              <Show when={result().comparison.comparable} fallback={<p>These states cannot be compared completely.</p>}>
                <Show when={result().comparison.changes.length} fallback={<p>No authored changes from the latest recorded state.</p>}>
                  <ul><For each={[...new Set(result().comparison.changes.map(change => labels[change.kind]))]}>{label => <li>{label}</li>}</For></ul>
                </Show>
              </Show>
            </div>
            <div class="block-history-restore">
              <button type="button" disabled={!!history.restoreReason() || state.restoring || state.selecting || state.loading} onClick={() => void history.prepareRestore()}>Restore this Block…</button>
              <Show when={history.restoreReason()}>{reason => <p class="block-history-muted">{reason()}</p>}</Show>
              <Show when={state.restoring}><p role="status">Checking the historical source and current Block…</p></Show>
              <Show when={state.restoreConfirmation}>{confirmation => <div role="group" aria-label="Confirm Block restore" class="block-history-restore-confirmation">
                <p>Restore <strong>{confirmation().label}</strong> to this Block?</p>
                <p>Historical revision <code>{confirmation().revisionId}</code> will become a new current change after Document revision {confirmation().currentRevision}. Your current version remains available in History and Undo. This does not rewind or truncate History.</p>
                <button type="button" onClick={() => history.confirmRestore()}>Confirm Restore this Block</button>
                <button type="button" onClick={() => history.cancelRestore()}>Cancel restore</button>
              </div>}</Show>
            </div>
            <div class="block-history-compare"><section aria-label="Selected historical state"><h4>Selected revision</h4><CompactPreviewView value={result().selected} /></section><section aria-label="Latest recorded state"><h4>Latest recorded state · fixed on opening</h4><CompactPreviewView value={result().comparison.after} /></section></div>
          </>}</Show>
        </section>
      </div>
      <Show when={state.restoreNotice}><p role="status" class="block-history-restore-notice">{state.restoreNotice} <button type="button" disabled={history.hasPendingCapture() || state.loading || state.selecting} onClick={() => void history.latest()}>Show latest revisions</button></p></Show>
      <footer><span>Immutable historical preview · Restore creates a new current change.</span><details><summary>Recording status</summary><p>{state.message}</p><Show when={state.recording}>{status => <p>{status().message} Browser committed: {status().browserCommitted}; server durable: {status().serverDurable}; verified: {status().verified}; pending: {status().pendingCount + status().pendingCapture}.</p>}</Show></details></footer>
    </div>
  </div>;
}

export function BlockHistoryLayer(props: { editor: ReactiveEditor; viewId: string }) {
  return <Show when={props.editor.features.blockHistory && props.editor.blockHistory.state.open && props.editor.blockHistory.state.viewId === props.viewId}><Portal><HistoryPanel editor={props.editor} /></Portal></Show>;
}
