import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { Portal } from "solid-js/web";
import type { ReactiveEditor } from "../reactive-editor/editor";
import type { EntityListSort } from "../runtime/document-entity-list";
import { createFloatingWindowResize, FloatingWindowResizeHandle, type FloatingWindowSize } from "./floating-window-resize";
import "./document-entity-list.css";

function EntityListWindow(props: { editor: ReactiveEditor }) {
  const list = props.editor.entityList, state = list.state;
  const rows = createMemo(() => list.sortedRows());
  const [position, setPosition] = createSignal({ x: Math.max(8, window.innerWidth - 388), y: 64 });
  const [sessionSize, setSessionSize] = createSignal<FloatingWindowSize>();
  let root!: HTMLElement;
  let disposeMount: (() => void) | undefined;
  let drag: { id: number; x: number; y: number; left: number; top: number } | undefined;
  const clamp = (x: number, y: number) => {
    const width = root?.offsetWidth || 360, height = root?.offsetHeight || 300;
    return { x: Math.max(8, Math.min(x, window.innerWidth - width - 8)), y: Math.max(8, Math.min(y, window.innerHeight - Math.min(height, window.innerHeight - 16) - 8)) };
  };
  const windowResize = createFloatingWindowResize({
    element: () => root,
    size: () => sessionSize() ?? { width: root?.getBoundingClientRect().width || 360, height: root?.getBoundingClientRect().height || 300 },
    minimum: { width: 300, height: 200 },
    onCommit: size => { setSessionSize(size); queueMicrotask(() => setPosition(current => clamp(current.x, current.y))); },
  });
  const displaySize = () => windowResize.preview() ?? sessionSize();
  const heading = (column: EntityListSort, label: string, title: string) => (
    <th aria-sort={state.sort === column ? state.direction : "none"}>
      <button type="button" title={title} onClick={() => list.sortBy(column)}>
        {label}<Show when={state.sort === column}> {state.direction === "ascending" ? "↑" : "↓"}</Show>
      </button>
    </th>
  );
  createEffect(() => { state.focusRequest; if (state.open) queueMicrotask(() => root?.focus({ preventScroll: true })); });
  onMount(() => {
    disposeMount = props.editor.mounts.register(list.owner, { root, focusElement: root, inputPolicy: "opaque-widget", focus: () => root.focus({ preventScroll: true }) });
    const resize = () => setPosition(value => clamp(value.x, value.y));
    window.addEventListener("resize", resize);
    onCleanup(() => { window.removeEventListener("resize", resize); disposeMount?.(); list.clearPreview(); });
  });
  return <section ref={root} class="document-entity-list" role="dialog" aria-modal="false" aria-label="Entities in document" tabIndex={-1}
    style={{ left: `${position().x}px`, top: `${position().y}px`, ...(displaySize() ? { width: `${displaySize()!.width}px`, height: `${displaySize()!.height}px` } : {}) }} onKeyDown={event => { event.stopPropagation(); if (event.key === "Escape") { event.preventDefault(); list.close(); } }}>
    <header class="document-entity-list__header"
      onPointerDown={event => { if (event.button !== 0 || (event.target as Element).closest("button")) return; const current = position(); drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: current.x, top: current.y }; event.currentTarget.setPointerCapture?.(event.pointerId); }}
      onPointerMove={event => { if (drag?.id !== event.pointerId) return; setPosition(clamp(drag.left + event.clientX - drag.x, drag.top + event.clientY - drag.y)); }}
      onPointerUp={event => { if (drag?.id === event.pointerId) drag = undefined; }} onPointerCancel={() => { drag = undefined; }}>
      <strong>Entities in Document</strong>
      <button type="button" aria-label="Close entity listing" onClick={() => list.close()}>×</button>
    </header>
    <div class="document-entity-list__body">
      <table aria-label="Document entities">
        <thead><tr>
          {heading("name", "Entity", "Sort by entity name")}
          {heading("graph", "Graph", "Sort by indexed mentions across the graph")}
          {heading("document", "Document", "Sort by logical entity mentions in this Document")}
        </tr></thead>
        <tbody>
          <For each={rows()}>{row => <tr tabIndex={0} classList={{ active: state.active === row.id }}
            onPointerEnter={() => list.preview(row.id)} onPointerLeave={event => { if (state.active === row.id && document.activeElement !== event.currentTarget) list.clearPreview(); }}
            onFocus={() => list.preview(row.id)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null) && !event.currentTarget.matches(":hover")) list.clearPreview(); }}>
            <td title={`${row.name} (${row.id})`}>{row.name}<button type="button" class="document-entity-list__focus" aria-label={`Focus occurrences of ${row.name} on current Page`} title={`Focus occurrences of ${row.name} on current Page`} disabled={!list.pageOccurrenceCount(row.id)} aria-pressed={state.concertinaEntityId === row.id} onClick={() => list.focusOccurrences(row.id)} /></td>
            <td>{row.graphMentions ?? "—"}</td>
            <td>{row.documentMentions}</td>
          </tr>}</For>
        </tbody>
      </table>
      <Show when={!state.rows.length && !state.pending}><p class="document-entity-list__empty">No entity references in this Document.</p></Show>
      <p class="document-entity-list__status" role="status" aria-live="polite">
        {state.pending ? "Loading indexed Graph counts…" : state.error ? `Graph counts unavailable: ${state.error}` : `${state.rows.length} entities · ${state.rows.reduce((sum, row) => sum + row.documentMentions, 0)} logical mentions`}
      </p>
      <Show when={state.concertinaEntityId}><div class="document-entity-list__navigation"><button type="button" onClick={() => list.navigateConcertina(-1)}>Previous occurrence</button><span>{state.concertinaIndex + 1} of {list.pageOccurrenceCount(state.concertinaEntityId!)}</span><button type="button" onClick={() => list.navigateConcertina(1)}>Next occurrence</button></div></Show>
      <small>Graph counts come from the saved index and may differ from live Document counts. Hover or focus a row to preview visible references.</small>
    </div>
    <FloatingWindowResizeHandle controller={windowResize} class="document-entity-list__resize" label="Resize Entity Listing window" />
  </section>;
}

export function DocumentEntityListLayer(props: { editor: ReactiveEditor; viewId: string }) {
  return <Portal><Show when={props.editor.entityList.state.open && props.editor.entityList.state.scope?.viewId === props.viewId}><EntityListWindow editor={props.editor} /></Show></Portal>;
}
