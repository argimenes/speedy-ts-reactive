import { For, Show, createEffect, createSignal, onCleanup, onMount } from "solid-js";
import { Portal } from "solid-js/web";
import type { ReactiveEditor } from "../reactive-editor/editor";
import type { OverlayDescriptor } from "../runtime/overlays";
import { chooseEntity } from "../runtime/entity-search";
import "./entity-search.css";
interface Entity { id: string; name: string; text?: string; mentions?: number }

function EntitySearch(props: { editor: ReactiveEditor; overlay: OverlayDescriptor }) {
  const { editor, overlay } = props;
  const [query, setQuery] = createSignal(overlay.entityQuery ?? ""), [alias, setAlias] = createSignal(false), [partial, setPartial] = createSignal(true);
  const [order, setOrder] = createSignal("ByMentions"), [direction, setDirection] = createSignal("Descending"), [page, setPage] = createSignal(1);
  const [results, setResults] = createSignal<Entity[]>([]), [current, setCurrent] = createSignal(0), [total, setTotal] = createSignal(0), [maxPage, setMaxPage] = createSignal(1);
  const [busy, setBusy] = createSignal(false), [error, setError] = createSignal("");
  let root!: HTMLDivElement, input!: HTMLInputElement, editing = false;
  const close = () => editor.overlays.close(overlay.key);
  const select = (entity?: Entity) => {
    if (!entity || busy()) return;
    try { editing = true; chooseEntity(editor, overlay, entity); close(); }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { editing = false; }
  };
  createEffect(() => {
    const search = query().trim(), requestedPage = page(), parameters = new URLSearchParams({ search, byPartial: String(partial()), page: String(requestedPage), order: order(), direction: direction() });
    const endpoint = alias() ? "findAgentsByAliasJson" : "findAgentsByNameJson";
    const controller = new AbortController(); let active = true;
    setResults([]); setCurrent(0); setError(""); setTotal(0); setMaxPage(1); setBusy(!!search);
    const timer = setTimeout(async () => {
      if (!search) return;
      try {
        const response = await fetch(`/api/${endpoint}?${parameters}`, { signal: controller.signal });
        const json = await response.json();
        if (!response.ok || json.Success !== true) throw new Error(json.Error || "Entity search failed. Check the Node server and SurrealDB connection.");
        if (!Array.isArray(json.Results) || json.Results.some((item: Entity) => typeof item.id !== "string" || typeof item.name !== "string")) throw new Error("The entity search API returned invalid results.");
        if (!active) return;
        setResults(json.Results); setTotal(Number(json.Count) || 0); setMaxPage(Math.max(1, Number(json.MaxPage) || 1));
        if (Number.isInteger(json.Page) && json.Page > 0 && json.Page !== requestedPage) setPage(json.Page);
      } catch (error) { if (active) setError(error instanceof Error ? error.message : "Entity search unavailable."); }
      finally { if (active) setBusy(false); }
    }, 300);
    onCleanup(() => { active = false; clearTimeout(timer); controller.abort(); });
  });
  onMount(() => {
    const disposeMount = editor.mounts.register(overlay.key, { root, focusElement: input, inputPolicy: "opaque-widget", focus: () => { input.focus(); input.select(); } });
    const unsubscribe = editor.repository.subscribeBeforeChanges(() => { if (!editing) editor.overlays.close(overlay.key, false); });
    input.focus(); input.select();
    onCleanup(() => { disposeMount(); unsubscribe(); });
  });
  const keys = (event: KeyboardEvent) => {
    event.stopPropagation();
    if (editor.bindings.dispatch(event, ["entity-search"], id => {
      if (id === "entity.close") { close(); return true; }
      if (id === "entity.clear") { setQuery(""); setPage(1); return true; }
      if ((event.target as Element).closest("select,button,input[type=checkbox]")) return false;
      if (id === "entity.choose") { select(results()[current()]); return true; }
      if (id === "entity.next" || id === "entity.previous") { const length = results().length; if (length) setCurrent((current() + (id === "entity.next" ? 1 : -1) + length) % length); return true; }
      return false;
    })) return;
    if (event.key === "Tab") {
      const fields = [...root.querySelectorAll<HTMLElement>('input,select,button:not([disabled])')];
      if (event.shiftKey && document.activeElement === fields[0]) { event.preventDefault(); fields.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === fields.at(-1)) { event.preventDefault(); fields[0]?.focus(); }
    }
  };
  return <div ref={root} class="reactive-entity-search" role="dialog" aria-modal="true" aria-label="Search entities" data-native-context-menu onKeyDown={keys}>
    <header><strong>Link text to an entity</strong><button type="button" onClick={close}>Cancel</button></header>
    <blockquote>{overlay.entityQuery}</blockquote>
    <label>Search entities<input ref={input} aria-label="Search entities" value={query()} maxLength={1000} onInput={event => { setQuery(event.currentTarget.value); setPage(1); }} /></label>
    <div class="entity-search-options">
      <label><input type="checkbox" checked={alias()} onChange={event => { setAlias(event.currentTarget.checked); setPage(1); }} />Search aliases</label>
      <label><input type="checkbox" checked={partial()} onChange={event => { setPartial(event.currentTarget.checked); setPage(1); }} />Partial match</label>
      <label>Sort<select value={order()} onChange={event => { setOrder(event.currentTarget.value); setPage(1); }}><option value="ByMentions">Mentions</option><option value="ByName">Name</option><Show when={alias()}><option value="ByText">Alias text</option></Show></select></label>
      <label>Direction<select value={direction()} onChange={event => { setDirection(event.currentTarget.value); setPage(1); }}><option>Descending</option><option>Ascending</option></select></label>
    </div>
    <p role="status">{busy() ? "Searching…" : !query().trim() ? "Enter a name or alias." : error() ? "Search unavailable." : `${total()} results${results().length ? "" : " — no matching entities."}`}</p>
    <Show when={error()}><p role="alert">{error()}</p></Show>
    <table aria-label="Entity results"><thead><tr><th>Entity</th><th>Matched text</th><th>Mentions</th><th /></tr></thead><tbody>
      <For each={results()}>{(entity, index) => <tr classList={{ current: current() === index() }}><td>{entity.name}<small>{entity.id}</small></td><td>{entity.text ?? "—"}</td><td>{entity.mentions ?? 0}</td><td><button type="button" aria-label={`Select ${entity.name}`} onClick={() => select(entity)}>Select</button></td></tr>}</For>
    </tbody></table>
    <footer><button type="button" disabled={busy() || page() <= 1} onClick={() => setPage(page() - 1)}>Previous page</button><span>Page {page()} / {maxPage()}</span><button type="button" disabled={busy() || page() >= maxPage()} onClick={() => setPage(page() + 1)}>Next page</button></footer>
    <small>Up/Down selects a result; Enter links it. Escape cancels. No annotation is created until you choose an entity.</small>
  </div>;
}
export function EntitySearchLayer(props: { editor: ReactiveEditor; viewId: string }) {
  return <Portal><For each={props.editor.overlays.overlays.filter(overlay => overlay.viewType === "entity-search" && props.editor.node(overlay.ownerKey)?.viewId === props.viewId)}>{overlay => <EntitySearch editor={props.editor} overlay={overlay} />}</For></Portal>;
}
