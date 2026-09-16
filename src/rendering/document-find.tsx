import { Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import type { ReactiveEditor } from "../reactive-editor/editor";
import type { ScopeKind } from "../runtime/text-search";
import { nodeKeysForPage } from "../runtime/minimap";
import { createFloatingWindowResize, FloatingWindowResizeHandle, type FloatingWindowSize } from "./floating-window-resize";
import "./document-find.css";

export function DocumentFindLayer(props: { editor: ReactiveEditor; viewId: string }) {
  const find = props.editor.find, state = find.state;
  let input!: HTMLInputElement;
  let panel!: HTMLElement;
  let drag: { pointerId: number; x: number; y: number; originX: number; originY: number } | undefined;
  const initialWidth = () => Math.min(760, Math.max(240, (typeof window === "undefined" ? 808 : window.innerWidth) - 48));
  const [position, setPosition] = createSignal({ x: Math.max(8, (typeof window === "undefined" ? 808 : window.innerWidth) - initialWidth() - 24), y: 90 });
  const [sessionSize, setSessionSize] = createSignal<FloatingWindowSize>();
  const [mountRevision, setMountRevision] = createSignal(0);
  const unsubscribe = props.editor.mounts.subscribe(() => { if (state.open) setMountRevision(n => n + 1); });
  onCleanup(unsubscribe);
  createEffect(() => { state.focusRequest; if (state.open && state.scope?.viewId === props.viewId) queueMicrotask(() => { input?.focus(); input?.select(); }); });
  const hidden = createMemo(() => {
    mountRevision(); state.active;
    const pageNodes = state.pageKey ? nodeKeysForPage(props.editor, state.pageKey) : undefined;
    return state.result?.matches.filter(match => !match.ranges.some(range => {
      if (pageNodes && !pageNodes.has(range.nodeKey)) return false;
      const mount = props.editor.mounts.get(range.nodeKey);
      return !!mount && !mount.root.closest('[hidden], [aria-hidden="true"]');
    })).length ?? 0;
  });
  const clampPosition = (next: { x: number; y: number }) => {
    const width = panel?.offsetWidth || initialWidth(), height = panel?.offsetHeight || 180;
    return {
      x: Math.max(8, Math.min(next.x, Math.max(8, window.innerWidth - Math.min(width, window.innerWidth - 16) - 8))),
      y: Math.max(8, Math.min(next.y, Math.max(8, window.innerHeight - Math.min(height, window.innerHeight - 16) - 8))),
    };
  };
  const windowResize = createFloatingWindowResize({
    element: () => panel,
    size: () => sessionSize() ?? { width: panel?.getBoundingClientRect().width || initialWidth(), height: panel?.getBoundingClientRect().height || 180 },
    minimum: { width: 360, height: 150 },
    onCommit: size => { setSessionSize(size); queueMicrotask(() => setPosition(clampPosition(position()))); },
  });
  const displaySize = () => windowResize.preview() ?? sessionSize();
  onMount(() => {
    const keepReachable = () => setPosition(clampPosition(position()));
    window.addEventListener("resize", keepReachable);
    onCleanup(() => window.removeEventListener("resize", keepReachable));
  });
  return <Show when={state.open && state.scope?.viewId === props.viewId}>
    <section ref={panel} class="document-find" data-document-find role="dialog" aria-label="Find in document" aria-modal="false"
      style={{ left: `${position().x}px`, top: `${position().y}px`, ...(displaySize() ? { width: `${displaySize()!.width}px`, height: `${displaySize()!.height}px` } : {}) }} onKeyDown={event => {
      props.editor.bindings.dispatch(event, ["document-find", "document-find-open"], id => {
        if (id === "find.close") find.close();
        else if (id === "find.next") void find.navigate(1);
        else if (id === "find.previous") void find.navigate(-1);
        else if (id === "find.open") { input.focus(); input.select(); }
        else return false;
        return true;
      });
      event.stopPropagation();
    }}>
      <header class="document-find__windowbar" onPointerDown={event => {
        if (event.ctrlKey || event.button !== 0) return;
        drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, originX: position().x, originY: position().y };
        event.currentTarget.setPointerCapture?.(event.pointerId);
      }} onPointerMove={event => {
        if (!drag || drag.pointerId !== event.pointerId) return;
        setPosition(clampPosition({ x: drag.originX + event.clientX - drag.x, y: drag.originY + event.clientY - drag.y }));
      }} onPointerUp={event => { if (drag?.pointerId === event.pointerId) drag = undefined; }} onPointerCancel={() => { drag = undefined; }}>
        <span class="document-find__title">Find in Document</span>
        <span class="document-find__controls"><button type="button" aria-label="Close Find" title={props.editor.bindings.label("find.close")} onPointerDown={event => event.stopPropagation()} onClick={() => find.close()}>×</button></span>
      </header>
      <div class="document-find__content">
        <div class="document-find__row">
          <label>Find<input ref={input} type="text" aria-label="Find text" placeholder="Text or regex pattern" value={state.query} onInput={e => find.setQuery(e.currentTarget.value)} /></label>
          <label>Scope<select aria-label="Find scope" value={state.scope?.kind} onChange={e => find.setScope(e.currentTarget.value as ScopeKind)}><option value="container">Container</option><option value="page">Page</option><option value="document">Document</option></select></label>
          <button type="button" title={props.editor.bindings.label("find.previous")} disabled={!state.result?.matches.length || state.pending} onClick={() => { input.focus(); void find.navigate(-1); }}>↑ Previous</button>
          <button type="button" title={props.editor.bindings.label("find.next")} disabled={!state.result?.matches.length || state.pending} onClick={() => { input.focus(); void find.navigate(1); }}>↓ Next</button>
        </div>
        <div class="document-find__row">
          <label><input type="checkbox" checked={!!state.options.matchCase} onChange={e => find.setOption("matchCase", e.currentTarget.checked)} />Match case</label>
          <label><input type="checkbox" checked={!!state.options.wholeWords} disabled={state.options.regex} onChange={e => find.setOption("wholeWords", e.currentTarget.checked)} />Whole words</label>
          <label><input type="checkbox" checked={!!state.options.regex} onChange={e => find.setOption("regex", e.currentTarget.checked)} />Regex</label>
          <Show when={state.options.regex}><label><input type="checkbox" checked={!!state.options.multiline} onChange={e => find.setOption("multiline", e.currentTarget.checked)} />Multiline ^/$</label><label><input type="checkbox" checked={!!state.options.dotAll} onChange={e => find.setOption("dotAll", e.currentTarget.checked)} />Dot matches newline</label></Show>
          <label><input type="checkbox" checked={state.visible} onChange={() => find.toggleHighlights()} />Highlights</label>
          <button type="button" aria-label="Concertina matching Blocks on current Page" aria-pressed={state.concertinaRequested} disabled={!state.pageKey} title="Show matching Blocks on the current Page in context" onClick={() => find.toggleConcertina()}>Concertina</button>
          <output aria-live="polite">{state.pending ? "Searching…" : `${Math.max(0, state.active + 1)} of ${state.result?.matches.length ?? 0}${state.result && !state.result.exact ? " (partial)" : ""}`}</output>
        </div>
        <small>{state.scope?.label}. {state.scope?.fallback} {hidden() ? `${hidden()} matches in hidden content; Next/Previous reveals them.` : ""}</small>
        <Show when={state.active >= 0}><p class="document-find__snippet">{state.result?.matches[state.active]?.context}<small>{state.result?.matches[state.active]?.breadcrumb}</small></p></Show>
        <Show when={state.message}><p role="status">{state.message}</p></Show>
      </div>
      <FloatingWindowResizeHandle controller={windowResize} class="document-find__resize" label="Resize Find window" />
    </section>
  </Show>;
}
