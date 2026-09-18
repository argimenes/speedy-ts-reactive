import { For, Show, createMemo, onCleanup, onMount } from "solid-js";
import { Portal } from "solid-js/web";
import type { ReactiveEditor } from "../reactive-editor/editor";
import type { DeepReadonly } from "../block-tree/commit-capture";
import { textRuns } from "../history/preview-text";
import type { HistoricalFragment, OccurrenceTree, SubtreeResult } from "../history/types";
import "./block-history.css";

const containers = new Set(["document-block", "container-block", "page-block", "fixed-size-page-block", "indented-list-block", "tab-row-block", "tab-block", "document-tab-row-block", "document-tab-block", "grid-block", "grid-row-block", "grid-cell-block", "table-block", "table-row-block", "table-cell-block", "left-margin-block", "right-margin-block"]);
const textTypes = new Set(["standoff-editor-block", "plain-text-block", "code-mirror-block"]);
const labels: Record<string, string> = { authored: "Content or properties changed", children: "Child Blocks changed", location: "Location changed", dependency: "References or annotations changed", created: "Block created", deleted: "Block deleted" };
const typeLabel = (type: string) => type.replace(/-block$/, "").replaceAll("-", " ");


function HistoricalBlock(props: { fragment: DeepReadonly<HistoricalFragment>; contentKey: string; tree?: DeepReadonly<OccurrenceTree> }) {
  const content = () => props.fragment.contents[props.contentKey];
  const childTrees = () => props.tree?.children.filter(child => child.slot?.kind !== "inline-content") ?? [];
  const caption = () => {
    const metadata = content()?.payload.metadata as { name?: string; title?: string } | undefined;
    return metadata?.name ?? metadata?.title ?? typeLabel(content()?.viewType ?? "Block");
  };
  return <Show when={content()} fallback={<p class="block-history-muted">Historical content is unavailable.</p>}>
    <div class="block-history-node" data-history-block-id={String(content().payload.id ?? "")}>
      <Show when={textTypes.has(content().viewType)} fallback={<>
        <div class="block-history-node-label">{caption()}</div>
        <Show when={!containers.has(content().viewType)}><p class="block-history-placeholder">Static preview unavailable for this Block type. Its tools and media are not running.</p></Show>
      </>}>
        <p class="block-history-text"><For each={textRuns(content(), props.fragment)}>{run => <span class={run.classes}>{run.text}</span>}</For><Show when={!content().inlineContent.length && !content().payload.text}><span class="block-history-muted">Empty text</span></Show></p>
      </Show>
      <Show when={props.tree?.cycle || props.tree?.excludedReference} fallback={<For each={childTrees()}>{child => child.excludedReference ? <p class="block-history-placeholder">Reference — historical target not included.</p> : <HistoricalBlock fragment={props.fragment} contentKey={child.contentKey} tree={child} />}</For>}>
        <p class="block-history-placeholder">Reference — traversal stops here.</p>
      </Show>
    </div>
  </Show>;
}

export function HistoricalPreview(props: { result: DeepReadonly<SubtreeResult> }) {
  const root = () => props.result.fragment?.tree?.contentKey ?? Object.values(props.result.fragment?.contents ?? {}).find(c => c.payload.id === props.result.blockId)?.key;
  const statusLabels: Record<string, string> = { deleted: "This Block was deleted.", "not-yet-created": "This Block had not been created.", "unknown-block": "This Block is not present in the recorded history.", "absent-occurrence": "This occurrence is not present at this revision.", "ambiguous-occurrence": "More than one historical occurrence matches this Block.", incomplete: "This historical state is incomplete.", unsupported: "This historical state is not supported by the preview.", unplaced: "This Block existed without a placement in the Document." };
  return <div class="block-history-fragment">
    <Show when={props.result.status !== "available"}><p role="status">{props.result.message ?? statusLabels[props.result.status]}</p></Show>
    <Show when={root() && props.result.fragment}><HistoricalBlock fragment={props.result.fragment!} contentKey={root()!} tree={props.result.fragment?.tree} /></Show>
    <Show when={props.result.fragment?.diagnostics.some(d => !d.available)}><p class="block-history-muted">Some referenced material is unavailable in this historical view.</p></Show>
  </div>;
}

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
        ? "History is recorded separately from Save. Earlier recording sessions remain available after reopening; unsaved historical edits are never applied to your current Document."
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
            <div class="block-history-compare"><section aria-label="Selected historical state"><h4>Selected revision</h4><HistoricalPreview result={result().selected} /></section><section aria-label="Latest recorded state"><h4>Latest recorded state · fixed on opening</h4><HistoricalPreview result={result().comparison.after} /></section></div>
          </>}</Show>
        </section>
      </div>
      <footer><span>Read-only preview · Your current Document is unchanged.</span><details><summary>Recording status</summary><p>{state.message}</p><Show when={state.recording}>{status => <p>{status().message} Browser committed: {status().browserCommitted}; server durable: {status().serverDurable}; verified: {status().verified}; pending: {status().pendingCount + status().pendingCapture}.</p>}</Show></details></footer>
    </div>
  </div>;
}

export function BlockHistoryLayer(props: { editor: ReactiveEditor; viewId: string }) {
  return <Show when={props.editor.blockHistory.state.open && props.editor.blockHistory.state.viewId === props.viewId}><Portal><HistoryPanel editor={props.editor} /></Portal></Show>;
}
