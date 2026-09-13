import { For, Show, createSignal, onCleanup, onMount } from "solid-js";
import type { ReactiveEditor } from "../reactive-editor/editor";
import { DocumentCounts } from "../runtime/document-counts";
import type { TextCounts } from "../runtime/text-counts";

export function DocumentCountBar(props: { editor: ReactiveEditor; scopeKey?: string }) {
  const [service, setService] = createSignal<DocumentCounts>();
  const [unavailable, setUnavailable] = createSignal(false);
  onMount(() => {
    if (typeof Worker === "undefined") { setUnavailable(true); return; }
    let worker: Worker;
    try { worker = new Worker(new URL("../runtime/text-count-worker.ts", import.meta.url), { type: "module" }); }
    catch { setUnavailable(true); return; }
    let id = 0;
    const requests = new Map<number, { resolve: (counts: TextCounts) => void; reject: () => void }>();
    worker.onmessage = event => { requests.get(event.data.id)?.resolve(event.data.counts); requests.delete(event.data.id); };
    worker.onerror = () => { setUnavailable(true); counts.dispose(); worker.terminate(); for (const request of requests.values()) request.reject(); requests.clear(); };
    const counts = new DocumentCounts(props.editor.repository, props.editor.node(props.scopeKey ?? "")?.placementKey ?? props.editor.repository.readState().rootPlacementKey,
      text => new Promise((resolve, reject) => { const key = ++id; requests.set(key, { resolve, reject }); worker.postMessage({ id: key, text }); }));
    setService(counts);
    onCleanup(() => { counts.dispose(); worker.terminate(); for (const request of requests.values()) request.reject(); requests.clear(); });
  });
  const focused = () => props.editor.node(props.editor.focus.state.focusedKey ?? "") ?? props.editor.node(props.editor.focus.state.lastFocusedKey ?? "");
  const rows = () => {
    const counts = service(), node = focused();
    const root = props.editor.node(props.scopeKey ?? "")?.placementKey ?? props.editor.repository.readState().rootPlacementKey;
    const page = node && counts?.state.pages[node.placementKey];
    return [
      { name: "Block", value: node && counts?.state.blocks[node.contentKey] },
      { name: "Page", value: page ? counts?.state.totals[page] : undefined },
      { name: "Document", value: counts?.state.totals[root] },
    ];
  };
  return <details class="document-count-bar" data-native-context-menu>
    <summary><For each={rows()}>{row => <span>{row.name}: {row.value?.words.toLocaleString() ?? "—"} words </span>}</For>
      <Show when={!unavailable() && service()?.state.pending}> · Updating…</Show>
      <Show when={unavailable() || service()?.state.error}> · Counts unavailable</Show>
    </summary>
    <table aria-label="Text counts"><thead><tr><th>Scope</th><th>Words</th><th>Characters</th><th>Without whitespace</th></tr></thead><tbody>
      <For each={rows()}>{row => <tr><th>{row.name}</th><td>{row.value?.words.toLocaleString() ?? "—"}</td><td>{row.value?.characters.toLocaleString() ?? "—"}</td><td>{row.value?.withoutWhitespace.toLocaleString() ?? "—"}</td></tr>}</For>
    </tbody></table>
    <small>Main text, including inactive Pages and all tab alternatives. Margins, sticky notes, owned attachments and media are excluded from totals. Block counts are own text only. Repeated Blocks count per occurrence. Characters are graphemes, not annotation Cells; paragraph separators are excluded. Updates follow a typing pause.</small>
  </details>;
}
