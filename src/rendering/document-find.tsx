import { Show, createEffect, createSignal, onCleanup } from "solid-js";
import type { ReactiveEditor } from "../reactive-editor/editor";
import type { ScopeKind } from "../runtime/text-search";
import "./document-find.css";

export function DocumentFindLayer(props: { editor: ReactiveEditor; viewId: string }) {
  const find = props.editor.find, state = find.state;
  let input!: HTMLInputElement;
  const [mountRevision, setMountRevision] = createSignal(0);
  const unsubscribe = props.editor.mounts.subscribe(() => { if (state.open) setMountRevision(n => n + 1); });
  onCleanup(unsubscribe);
  createEffect(() => { state.focusRequest; if (state.open && state.scope?.viewId === props.viewId) queueMicrotask(() => { input?.focus(); input?.select(); }); });
  const hidden = () => { mountRevision(); state.active; return state.result?.matches.filter(match => !props.editor.mounts.get(match.ranges[0].nodeKey) || props.editor.mounts.get(match.ranges[0].nodeKey)?.root.closest('[aria-hidden="true"]')).length ?? 0; };
  return <Show when={state.open && state.scope?.viewId === props.viewId}>
    <section class="document-find" data-document-find role="dialog" aria-label="Find in document" aria-modal="false" onKeyDown={event => {
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
      <div class="document-find__row">
        <label>Find<input ref={input} type="text" aria-label="Find text" placeholder="Text or regex pattern" value={state.query} onInput={e => find.setQuery(e.currentTarget.value)} /></label>
        <label>Scope<select aria-label="Find scope" value={state.scope?.kind} onChange={e => find.setScope(e.currentTarget.value as ScopeKind)}><option value="container">Container</option><option value="page">Page</option><option value="document">Document</option></select></label>
        <button type="button" title={props.editor.bindings.label("find.previous")} disabled={!state.result?.matches.length || state.pending} onClick={() => { input.focus(); void find.navigate(-1); }}>↑ Previous</button>
        <button type="button" title={props.editor.bindings.label("find.next")} disabled={!state.result?.matches.length || state.pending} onClick={() => { input.focus(); void find.navigate(1); }}>↓ Next</button>
        <button type="button" aria-label="Close Find" title={props.editor.bindings.label("find.close")} onClick={() => find.close()}>×</button>
      </div>
      <div class="document-find__row">
        <label><input type="checkbox" checked={!!state.options.matchCase} onChange={e => find.setOption("matchCase", e.currentTarget.checked)} />Match case</label>
        <label><input type="checkbox" checked={!!state.options.wholeWords} disabled={state.options.regex} onChange={e => find.setOption("wholeWords", e.currentTarget.checked)} />Whole words</label>
        <label><input type="checkbox" checked={!!state.options.regex} onChange={e => find.setOption("regex", e.currentTarget.checked)} />Regex</label>
        <Show when={state.options.regex}><label><input type="checkbox" checked={!!state.options.multiline} onChange={e => find.setOption("multiline", e.currentTarget.checked)} />Multiline ^/$</label><label><input type="checkbox" checked={!!state.options.dotAll} onChange={e => find.setOption("dotAll", e.currentTarget.checked)} />Dot matches newline</label></Show>
        <label><input type="checkbox" checked={state.visible} onChange={() => find.toggleHighlights()} />Highlights</label>
        <output aria-live="polite">{state.pending ? "Searching…" : `${Math.max(0, state.active + 1)} of ${state.result?.matches.length ?? 0}${state.result && !state.result.exact ? " (partial)" : ""}`}</output>
      </div>
      <small>{state.scope?.label}. {state.scope?.fallback} {hidden() ? `${hidden()} matches in hidden content; Next/Previous reveals them.` : ""}</small>
      <Show when={state.active >= 0}><p class="document-find__snippet">{state.result?.matches[state.active]?.context}<small>{state.result?.matches[state.active]?.breadcrumb}</small></p></Show>
      <Show when={state.message}><p role="status">{state.message}</p></Show>
    </section>
  </Show>;
}
