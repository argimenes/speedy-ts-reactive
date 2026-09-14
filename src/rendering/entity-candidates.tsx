import { For, Show } from "solid-js";
import type { EntityCandidates } from "../runtime/entity-candidates";
import type { ScopeKind } from "../runtime/text-search";

export function EntityCandidatesPanel(props: { session: EntityCandidates; bind: () => void }) {
  const session = props.session, state = session.state, pageSize = 25;
  const pages = () => Math.max(1,Math.ceil(state.rows.length/pageSize));
  return <section class="entity-candidates" aria-label="Mention candidates">
    <h3>Matching mentions</h3>
    <label><input type="checkbox" aria-label="Search additional occurrences" checked={state.enabled} onChange={e => e.currentTarget.checked ? session.enable() : session.disable()} />Search additional occurrences</label>
    <Show when={!state.enabled}><p>Search is paused. Choosing an entity links only the original selected text, if any. Enable search to review additional mentions.</p></Show>
    <label>Mention text<input aria-label="Mention text" value={state.query} onInput={e => session.configure({ query: e.currentTarget.value })} /></label>
    <Show when={state.rows.some(row => row.original && row.match.ranges.length > 1)}><small>The original passage crosses Blocks. Enter a Block-local query to find additional mentions; the original stays a separate target.</small></Show>
    <div class="entity-search-options">
      <label>Scope<select aria-label="Mention scope" value={state.scope.kind} onChange={e => session.configure({ scope: e.currentTarget.value as ScopeKind })}><option value="container">Container</option><option value="page">Page</option><option value="document">Document</option></select></label>
      <label><input type="checkbox" checked={state.options.matchCase} onChange={e => session.configure({ options: { matchCase: e.currentTarget.checked } })} />Match case</label>
      <label><input type="checkbox" checked={state.options.wholeWords} disabled={state.options.regex} onChange={e => session.configure({ options: { wholeWords: e.currentTarget.checked } })} />Whole words</label>
      <label><input type="checkbox" checked={state.options.regex} onChange={e => session.configure({ options: { regex: e.currentTarget.checked } })} />Regex</label>
      <label><input type="checkbox" checked={state.visible} onChange={() => session.toggleHighlights()} />Highlights</label>
    </div>
    <small>{state.scope.label}. {state.scope.fallback}</small>
    <div class="entity-candidates__actions">
      <button type="button" disabled={state.pending || state.result?.status !== "complete" || !state.result.exact} onClick={() => session.selectAll()}>Select all eligible (all pages)</button>
      <button type="button" disabled={state.pending} onClick={() => session.selectNone()}>Select none</button>
      <button type="button" disabled={!state.undoCount || state.pending} onClick={() => session.undoExclusion()}>Undo exclusion</button>
    </div>
    <p role="status">{state.pending ? "Finding mentions…" : `${session.selected().length} selected / ${state.rows.length} unique targets`}</p>
    <Show when={state.message}><p role="status">{state.message}</p></Show>
    <Show when={state.result?.status === "partial"}><p role="status">Search coverage is incomplete. You can bind individually checked mentions below, but Select all is unavailable. Other matches may exist in unsearched Blocks or beyond the preview limit.</p></Show>
    <Show when={state.rows.some(r => r.occurrences.length > 1)}><p>Shared text occurs in multiple locations. Exclusion and binding affect every occurrence, including outside this scope.</p></Show>
    <table aria-label="Mention candidates"><thead><tr><th>Include</th><th>Mention and location</th><th /></tr></thead><tbody>
      <For each={state.rows.slice(state.page*pageSize,(state.page+1)*pageSize)}>{row => <tr data-candidate-row data-candidate-key={row.key} tabIndex={0} aria-label={`${row.original ? "Original: " : ""}${row.match.text}`} classList={{ current: state.active === row.key }}>
        <td><input type="checkbox" aria-label={`Include mention: ${row.match.text}`} checked={row.checked} disabled={!!row.reason || state.pending} onChange={e => session.toggle(row.key,e.currentTarget.checked)} /></td>
        <td><Show when={row.original}><strong>Original selection · </strong></Show>{row.match.context}<small>{row.match.breadcrumb}</small><Show when={row.reason}><small>{row.reason}</small></Show><Show when={row.occurrences.length>1}><small>{row.occurrences.length} locations, one annotation target</small></Show></td>
        <td><button type="button" disabled={state.pending} onClick={() => void session.reveal(row)}>Reveal</button><Show when={row.occurrences.length>1}><select aria-label="Reveal occurrence" onChange={e => void session.reveal(row,Number(e.currentTarget.value))}><For each={row.occurrences}>{(m,i) => <option value={i()}>{i()+1}: {m.breadcrumb}</option>}</For></select></Show></td>
      </tr>}</For>
    </tbody></table>
    <footer><button type="button" disabled={state.page<=0} onClick={() => session.setPage(state.page-1)}>Previous mentions</button><span>Page {state.page+1} / {pages()}</span><button type="button" disabled={state.page+1>=pages()} onClick={() => session.setPage(state.page+1)}>Next mentions</button></footer>
    <p>Entity: {state.entity ? `${state.entity.name} (${state.entity.id})` : "Choose a name or alias result on the left."}</p>
    <button type="button" class="entity-candidates__bind" disabled={!session.canBind()} title={session.bindingDisabledReason() || "Bind the checked mentions"} onClick={props.bind}>Bind {session.selected().length} selected mentions{state.entity ? ` to ${state.entity.name}` : ""}</button>
    <Show when={session.bindingDisabledReason()}><small role="status">{session.bindingDisabledReason()}</small></Show>
    <small>Review ambiguous names and pronouns. Matching text does not establish who it refers to. Binding is one undoable document change; database mention counts update through normal saving/indexing.</small>
  </section>;
}
