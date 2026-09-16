import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { PersistenceService } from "../reactive-editor/persistence";
import { DocumentDialog } from "./document-dialog";
import "./document-browser.css";

export function WorkspaceBrowser(props: {
  mode: "open" | "save";
  initialFilename?: string;
  busy?: boolean;
  error?: string;
  conflict?: boolean;
  onChoose: (filename: string, overwrite: boolean) => Promise<boolean>;
  onClose: () => void;
}) {
  const [files, setFiles] = createSignal<string[]>([]);
  const [selected, setSelected] = createSignal("");
  const [filename, setFilename] = createSignal(props.mode === "save" ? props.initialFilename ?? "Workspace.json" : "");
  const [filter, setFilter] = createSignal("");
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal("");
  const [replacement, setReplacement] = createSignal("");
  const lifetime = new AbortController();
  onCleanup(() => lifetime.abort());
  const load = async () => {
    setLoading(true); setError("");
    try { setFiles(await PersistenceService.listWorkspaces(lifetime.signal)); }
    catch (reason) { if (!lifetime.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { if (!lifetime.signal.aborted) setLoading(false); }
  };
  onMount(() => void load());
  createEffect(() => { if (props.conflict && filename().trim()) setReplacement(filename().trim().endsWith(".json") ? filename().trim() : `${filename().trim()}.json`); });
  const visible = createMemo(() => files().filter(item => item.toLocaleLowerCase().includes(filter().toLocaleLowerCase())));
  const choose = async (name = props.mode === "save" ? filename().trim() : selected()) => {
    if (!name || props.busy || loading()) return;
    if (!/\.json$/i.test(name)) name += ".json";
    if (/[\\/\0]/.test(name) || name.startsWith(".")) { setError("Enter a Workspace filename without path separators."); return; }
    if (props.mode === "save" && files().includes(name) && replacement() !== name) { setReplacement(name); return; }
    await props.onChoose(name, replacement() === name);
  };
  return <DocumentDialog title={props.mode === "open" ? "Open Workspace" : "Save Workspace"} onClose={props.onClose} busy={props.busy}
    resizable={{ initial: { width: 620, height: 480 }, minimum: { width: 440, height: 300 } }}>
    <div class="document-browser__path"><span>Workspaces</span><button type="button" disabled={props.busy} onClick={() => void load()}>Refresh</button></div>
    <label class="document-browser__filter">Find Workspace<input data-autofocus type="search" value={filter()} onInput={event => setFilter(event.currentTarget.value)} placeholder="Filter Workspaces…" /></label>
    <div class="document-browser__list" role="listbox" aria-label="Workspaces" aria-busy={loading()}>
      <Show when={!loading()} fallback={<p role="status">Loading Workspaces…</p>}>
        <For each={visible()}>{name => <button type="button" role="option" aria-selected={selected() === name} onClick={() => { setSelected(name); if (props.mode === "save") setFilename(name); setReplacement(""); }} onDblClick={() => void choose(name)}><span aria-hidden="true">▦</span>{name}</button>}</For>
        <Show when={!visible().length && !error()}><p>No Workspaces found.</p></Show>
      </Show>
    </div>
    <Show when={error() || props.error}><p class="document-dialog__error" role="alert">{error() || props.error}</p></Show>
    <Show when={replacement()}>{name => <div class="document-browser__replace" role="alert"><p>“{name()}” already exists. Replace it?</p><button type="button" disabled={props.busy} onClick={() => void props.onChoose(name(), true)}>Replace Workspace</button><button type="button" disabled={props.busy} onClick={() => setReplacement("")}>Keep existing file</button></div>}</Show>
    <form class="document-dialog__footer" onSubmit={event => { event.preventDefault(); void choose(); }}>
      <Show when={props.mode === "save"}><label>Workspace name<input aria-label="Workspace name" value={filename()} disabled={props.busy} onInput={event => { setFilename(event.currentTarget.value); setReplacement(""); }} /></label></Show>
      <button type="button" disabled={props.busy} onClick={props.onClose}>Cancel</button>
      <button type="submit" class="document-dialog__primary" disabled={props.busy || loading() || !(props.mode === "save" ? filename().trim() : selected())}>{props.busy ? "Please wait…" : props.mode === "save" ? "Save Workspace" : "Open Workspace"}</button>
    </form>
  </DocumentDialog>;
}
