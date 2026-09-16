import { For, Show, createEffect, createMemo, createSignal, createUniqueId, onCleanup, onMount } from "solid-js";
import { createStore } from "solid-js/store";
import { PersistenceService, type DocumentLocation } from "../reactive-editor/persistence";
import { DocumentDialog } from "./document-dialog";
import "./document-browser.css";

export interface DocumentBrowserProps {
  mode: "open" | "save";
  initialLocation?: DocumentLocation;
  busy?: boolean;
  error?: string;
  conflict?: boolean;
  onChoose: (location: DocumentLocation, overwrite: boolean) => Promise<boolean>;
  onClose: () => void;
}

const childPath = (parent: string, name: string) => parent === "." ? name : `${parent}/${name}`;
const parentPath = (folder: string) => folder.includes("/") ? folder.slice(0, folder.lastIndexOf("/")) : ".";

export function DocumentBrowser(props: DocumentBrowserProps) {
  const listId = createUniqueId();
  const fileId = (name: string) => `${listId}-${encodeURIComponent(name)}`;
  const [folder, setFolder] = createSignal(props.initialLocation?.folder || ".");
  const [filename, setFilename] = createSignal(props.mode === "save" ? props.initialLocation?.filename ?? "Untitled.json" : "");
  const [selected, setSelected] = createSignal("");
  const [filter, setFilter] = createSignal("");
  const [files, setFiles] = createSignal<string[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal("");
  const [refresh, setRefresh] = createSignal(0);
  const [replacement, setReplacement] = createSignal<DocumentLocation>();
  const [tree, setTree] = createStore<{
    children: Record<string, string[] | undefined>;
    expanded: Record<string, boolean>;
    loading: Record<string, boolean>;
    errors: Record<string, string | undefined>;
  }>({ children: {}, expanded: { ".": true }, loading: {}, errors: {} });
  const lifetime = new AbortController();
  const requests = new Map<string, number>();
  let treeRoot!: HTMLDivElement;
  onCleanup(() => lifetime.abort());

  const loadChildren = async (path: string, force = false) => {
    if (!force && (tree.children[path] || tree.loading[path])) return;
    const token = (requests.get(path) ?? 0) + 1;
    requests.set(path, token);
    setTree("loading", path, true); setTree("errors", path, undefined);
    try {
      const children = await PersistenceService.listFolders(path, lifetime.signal);
      if (!lifetime.signal.aborted && requests.get(path) === token) setTree("children", path, children);
    } catch (error) {
      if (!lifetime.signal.aborted && requests.get(path) === token) setTree("errors", path, error instanceof Error ? error.message : String(error));
    } finally {
      if (!lifetime.signal.aborted && requests.get(path) === token) setTree("loading", path, false);
    }
  };
  onMount(async () => {
    let path = ".";
    await loadChildren(path);
    for (const part of folder().split("/").filter((part) => part !== "." && part)) {
      if (lifetime.signal.aborted) return;
      path = childPath(path, part); setTree("expanded", path, true); await loadChildren(path);
    }
  });
  createEffect(() => {
    const path = folder(); refresh();
    const request = new AbortController();
    onCleanup(() => request.abort());
    setLoading(true); setError(""); setFiles([]); setSelected(""); setFilter(""); setReplacement(undefined);
    void PersistenceService.listDocuments(path, request.signal).then((files) => {
      if (!request.signal.aborted) setFiles(files);
    }).catch((error) => {
      if (!request.signal.aborted) setError(error instanceof Error ? error.message : String(error));
    }).finally(() => { if (!request.signal.aborted) setLoading(false); });
  });
  const rows = createMemo(() => {
    const result: Array<{ path: string; name: string; level: number }> = [];
    const visit = (path: string, name: string, level: number) => {
      result.push({ path, name, level });
      if (tree.expanded[path]) for (const child of tree.children[path] ?? []) visit(childPath(path, child), child, level + 1);
    };
    visit(".", "Documents", 1); return result;
  });
  const visibleFiles = createMemo(() => files().filter((name) => name.toLocaleLowerCase().includes(filter().toLocaleLowerCase())));
  createEffect(() => { if (selected() && !visibleFiles().includes(selected())) setSelected(""); });
  const selectFolder = (path: string, focus = false) => {
    setFolder(path);
    if (focus) queueMicrotask(() => [...treeRoot.querySelectorAll<HTMLElement>("[data-folder]")].find((item) => item.dataset.folder === path)?.focus());
  };
  const expand = (path: string) => { setTree("expanded", path, !tree.expanded[path]); if (tree.expanded[path]) void loadChildren(path); };
  const treeKey = (event: KeyboardEvent, path: string) => {
    const index = rows().findIndex((item) => item.path === path);
    let target: string | undefined;
    switch (event.key) {
      case "ArrowDown": target = rows()[index + 1]?.path; break;
      case "ArrowUp": target = rows()[index - 1]?.path; break;
      case "Home": target = "."; break;
      case "End": target = rows().at(-1)?.path; break;
      case "ArrowRight": if (!tree.expanded[path]) expand(path); else target = tree.children[path]?.[0] ? childPath(path, tree.children[path]![0]) : undefined; break;
      case "ArrowLeft": if (tree.expanded[path]) expand(path); else target = parentPath(path); break;
      case "Enter": case " ": target = path; break;
      default: return;
    }
    event.preventDefault(); if (target) selectFolder(target, true);
  };
  const selectFile = (name: string) => { setSelected(name); if (props.mode === "save") setFilename(name); setReplacement(undefined); };
  const choose = async (name = props.mode === "save" ? filename().trim() : selected()) => {
    if (!name || props.busy || loading()) return;
    if (props.mode === "save" && !/\.json$/i.test(name)) name += ".json";
    if (/[\\/\0]/.test(name) || name.startsWith(".")) { setError("Enter a filename without path separators."); return; }
    const location = { folder: folder(), filename: name };
    if (props.mode === "save" && files().includes(name)) { setReplacement(location); return; }
    const success = await props.onChoose(location, false);
    if (!success && props.mode === "save" && props.conflict) setReplacement(location);
  };
  const listKey = (event: KeyboardEvent) => {
    const index = visibleFiles().indexOf(selected());
    let next: string | undefined;
    if (event.key === "ArrowDown") next = visibleFiles()[Math.min(index + 1, visibleFiles().length - 1)];
    else if (event.key === "ArrowUp") next = visibleFiles()[Math.max(0, index - 1)];
    else if (event.key === "Home") next = visibleFiles()[0];
    else if (event.key === "End") next = visibleFiles().at(-1);
    else if (event.key === "Enter") { event.preventDefault(); void choose(); return; }
    else return;
    event.preventDefault();
    if (next) {
      selectFile(next);
      const id = fileId(next);
      queueMicrotask(() => document.getElementById(id)?.scrollIntoView?.({ block: "nearest" }));
    }
  };
  return <DocumentDialog title={props.mode === "open" ? "Open document" : "Save document as"} onClose={props.onClose} busy={props.busy}
    resizable={{ initial: { width: 880, height: 600 }, minimum: { width: 560, height: 360 } }}>
    <div class="document-browser__path">
      <button type="button" disabled={folder() === "." || props.busy} onClick={() => selectFolder(parentPath(folder()))} aria-label="Parent folder">↑</button>
      <span>Documents{folder() !== "." ? ` / ${folder().replaceAll("/", " / ")}` : ""}</span>
      <button type="button" disabled={props.busy} onClick={() => { setRefresh((value) => value + 1); void loadChildren(folder(), true); }}>Refresh</button>
    </div>
    <div class="document-browser__panes" classList={{ "document-browser--busy": !!props.busy }} inert={props.busy ? true : undefined}>
      <div class="document-browser__tree" ref={treeRoot} role="tree" aria-label="Document folders">
        <For each={rows()}>{(row) => <>
          <div role="treeitem" data-folder={row.path} aria-level={row.level} aria-selected={folder() === row.path} aria-expanded={tree.expanded[row.path] ?? false} tabIndex={folder() === row.path ? 0 : -1} style={{ "padding-left": `${(row.level - 1) * 16 + 8}px` }} onClick={() => selectFolder(row.path)} onKeyDown={(event) => treeKey(event, row.path)}>
            <span class="document-browser__expander" aria-hidden="true" onClick={(event) => { event.stopPropagation(); expand(row.path); }}>{tree.expanded[row.path] ? "▾" : "▸"}</span>
            <span aria-hidden="true">{tree.expanded[row.path] ? "📂" : "📁"}</span><span>{row.name}</span>
            <Show when={tree.loading[row.path]}><small>…</small></Show>
          </div>
          <Show when={tree.errors[row.path]}><p class="document-browser__tree-error" role="alert">{tree.errors[row.path]} <button type="button" onClick={() => void loadChildren(row.path, true)}>Retry</button></p></Show>
        </>}</For>
      </div>
      <div class="document-browser__files">
        <label class="document-browser__filter">Find in this folder<input data-autofocus type="search" value={filter()} onInput={(event) => setFilter(event.currentTarget.value)} placeholder="Filter documents…" /></label>
        <div class="document-browser__list" role="listbox" aria-label="Documents in selected folder" aria-busy={loading()} aria-activedescendant={selected() ? fileId(selected()) : undefined} tabIndex={0} onKeyDown={listKey}>
          <Show when={!loading()} fallback={<p role="status">Loading documents…</p>}>
            <For each={visibleFiles()}>{(name) => <button id={fileId(name)} type="button" role="option" aria-selected={selected() === name} tabIndex={-1} onClick={() => selectFile(name)} onDblClick={() => void choose(name)}><span aria-hidden="true">▤</span>{name}</button>}</For>
            <Show when={!visibleFiles().length && !error()}><p>{files().length ? "No matching documents." : "This folder has no documents."}</p></Show>
          </Show>
        </div>
        <small class="document-browser__count">{visibleFiles().length} document{visibleFiles().length === 1 ? "" : "s"}</small>
      </div>
    </div>
    <Show when={error() || props.error}><p class="document-dialog__error" role="alert">{error() || props.error}</p></Show>
    <Show when={replacement()}>{(target) => <div class="document-browser__replace" role="alert">
      <p>“{target().filename}” already exists. Replace its contents?</p>
      <button type="button" disabled={props.busy} onClick={() => void props.onChoose(target(), true)}>Replace document</button>
      <button type="button" disabled={props.busy} onClick={() => setReplacement(undefined)}>Keep existing file</button>
    </div>}</Show>
    <form class="document-dialog__footer" onSubmit={(event) => { event.preventDefault(); void choose(); }}>
      <Show when={props.mode === "save"}><label>File name<input aria-label="File name" value={filename()} disabled={props.busy} onInput={(event) => { setFilename(event.currentTarget.value); setReplacement(undefined); }} /></label></Show>
      <button type="button" disabled={props.busy} onClick={props.onClose}>Cancel</button>
      <button type="submit" class="document-dialog__primary" disabled={props.busy || loading() || !!replacement() || !(props.mode === "save" ? filename().trim() : selected())}>{props.busy ? "Please wait…" : props.mode === "save" ? "Save" : "Open"}</button>
    </form>
  </DocumentDialog>;
}
