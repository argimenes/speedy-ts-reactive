import {SavedCoverage} from './saved-coverage';
import {QueryResults} from './query-results';
import { For, Show, createSignal, onCleanup } from 'solid-js';
import type { ApplicationKnowledge, DocumentTarget, NativeReferenceItem, VaultSearchResults } from '../../feature-api/document-application';

export function KnowledgeView(props:{knowledge:ApplicationKnowledge; mode?:'search'|'references'}) {
  const api=props.knowledge;
  const [query,setQuery]=createSignal(''),[results,setResults]=createSignal<VaultSearchResults>(),[pending,setPending]=createSignal(false),[message,setMessage]=createSignal('');
  const [picker,setPicker]=createSignal<{selection:string;targets:readonly DocumentTarget[];diagnostics:readonly string[]}>();
  const [references,setReferences]=createSignal<{token:string;items:readonly NativeReferenceItem[];diagnostics:readonly string[]}>();
  let pickerButton!:HTMLButtonElement;
  const closePicker=()=>{api.cancelPicker();setPicker(undefined);queueMicrotask(()=>{if(live&&pickerButton?.isConnected)pickerButton.focus();});};
  const [acting,setActing]=createSignal(false);let generation=0,live=true;
  onCleanup(()=>{live=false;generation++;if(props.mode!=='references')api.cancel();if(props.mode!=='search')api.cancelPicker();});
  const cancel=()=>{generation++;api.cancel();setPending(false);setResults(undefined);};
  const search=async()=>{const request=++generation;setPending(true);setMessage('');setResults(undefined);try{const value=await api.search(query());if(live&&request===generation)setResults(value);}catch(e){if(live&&request===generation)setMessage((e as Error).name==='AbortError'?'Query cancelled or changed. Search again.':String(e));}finally{if(live&&request===generation)setPending(false);}};
  const act=async(action:()=>Promise<unknown>|void)=>{if(acting())return;setActing(true);setMessage('');try{await action();}catch(e){if(live)setMessage(String(e));}finally{if(live)setActing(false);}};
  return <section class="flint-knowledge" aria-label={props.mode==='search'?'Vault search':props.mode==='references'?'Document references':'Vault search and references'}>
    <Show when={props.mode!=='references'}><h2>Search</h2><form onSubmit={e=>{e.preventDefault();void search();}}><label>Titles and native text<input aria-label="Search vault" value={query()} maxLength={256} onInput={e=>{cancel();setQuery(e.currentTarget.value);}}/></label><button type="submit">Search vault</button><Show when={pending()}><button type="button" onClick={cancel}>Cancel search</button></Show></form>
    <Show when={pending()}><p role="status">Searching available native Documents…</p></Show>
    <Show when={results()}>{result=><div><SavedCoverage value={result().savedProvider}/><p role="status">{result().hits.length} results · {result().available}/{result().discovered} Documents available. {result().complete?(result().coverageMode==='saved-and-live'?'Verified saved/live coverage complete.':'Loaded vault coverage complete.'):'Incomplete coverage; zero results do not establish absence.'}</p>
      <Show when={!api.current(result().token)}><p role="status">Results are stale. Search again.</p></Show>
      <For each={result().diagnostics}>{d=><p>{d}</p>}</For>
      <QueryResults each={result().hits}>{hit=><button class="flint-search-hit" data-search-document={hit.documentId} data-search-block={hit.blockId} disabled={acting()||!api.current(result().token)} onClick={()=>void act(()=>api.activate(hit.id))}><strong>{hit.title}</strong><small>{hit.location} · {hit.kind} · {hit.documentId}</small><span>{hit.snippet}</span></button>}</QueryResults>
    </div>}</Show>
    </Show><Show when={props.mode!=='search'}><h2>Document references</h2>
    <button ref={pickerButton} onPointerDown={e=>e.preventDefault()} disabled={acting()} onClick={()=>void act(async()=>{const selection=api.selection();const value=await api.picker(selection);if(live)setPicker({selection,...value});})}>Link selected text</button>
    <Show when={picker()}>{value=><div ref={el=>queueMicrotask(()=>el.focus())} tabIndex={-1} role="dialog" aria-label="Choose reference Document" onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closePicker();}}}><p>Choose a loaded Document. The selected text becomes a native reference.</p><For each={value().diagnostics}>{d=><p>{d}</p>}</For><For each={value().targets}>{target=><button disabled={acting()} aria-label={`Reference ${target.title}`} onClick={()=>void act(async()=>{await api.createReference(value().selection,target);if(live){setPicker(undefined);setMessage('Native Document reference created.');}})}>{target.title}<small>{target.location} · {target.documentId}</small></button>}</For><button disabled={acting()} onClick={()=>{closePicker();}}>Cancel reference</button></div>}</Show>
    <button disabled={acting()} onClick={()=>void act(async()=>{const value=await api.references();if(live)setReferences(value);})}>References in this Document</button>
    <Show when={references()}>{value=><div><Show when={!api.current(value().token)}><p>Reference list is stale. Refresh it before acting.</p></Show><For each={value().diagnostics}>{d=><p>{d}</p>}</For><For each={value().items}>{item=><div class="flint-reference"><p>{item.label} → {item.target?.title??'Unavailable target'}</p><Show when={item.diagnostic}><p>{item.diagnostic}</p></Show><button disabled={acting()||!item.target||!api.current(value().token)} onClick={()=>void act(()=>api.followReference(item.id))}>Follow reference</button><button disabled={acting()||!item.removable||!api.current(value().token)} onClick={()=>void act(()=>api.removeReference(item.id))}>Remove reference</button></div>}</For><Show when={!value().items.length}><p>No supported Document references found.</p></Show></div>}</Show>
    </Show><Show when={message()}><p role="status">{message()}</p></Show>
  </section>;
}
