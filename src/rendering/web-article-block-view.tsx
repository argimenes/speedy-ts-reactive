import {ResourceRelationships} from './resource-relationships';
import {createSignal,createEffect,onMount,onCleanup,Show,For} from 'solid-js';
import type {BlockViewProps} from '../block-tree/types';
import {useReactiveView} from '../reactive-editor/context';
import {runInterchange} from '../runtime/interchange-worker';
import {HttpApplicationServices} from '../runtime/application-services';
import type {EnrichmentCapture,WikiSnapshot} from '../interchange/encyclopedia';
import type {compileSourcePreview} from '../interchange/source-preview';
/** Occurrence-owned view state: no network on mount, no authored changes for review. */
export function WebArticleBlockView(props:BlockViewProps){
 const {editor,projection}=useReactiveView(),node=()=>projection.state.nodes[props.nodeKey],article=()=>node()?.payload.article as unknown as WikiSnapshot;
 const links=()=>{const values=node()?.payload.links;return Array.isArray(values)?values.filter((v):v is string=>{try{const u=new URL(String(v));return typeof v==='string'&&v.length<=4096&&['https:','http:'].includes(u.protocol)&&!u.username&&!u.password;}catch{return false;}}).slice(0,100):[];};
 const [preview,setPreview]=createSignal<ReturnType<typeof compileSourcePreview>>(),[status,setStatus]=createSignal(''),[busy,setBusy]=createSignal(false),[capture,setCapture]=createSignal<EnrichmentCapture>();
 let root!:HTMLDivElement,active:AbortController|undefined,alive=true;const operations=new Map<string,string>();
 const api=new HttpApplicationServices(()=>{const c=editor.readAssetContext();if(!c?.cavernId||!c.session)throw Error('Open the source Vault to review enrichment');return {cavernId:c.cavernId,session:c.session};});
 createEffect(()=>{const source=node()?.payload.text;if(typeof source!=='string')return;const c=new AbortController();setPreview(undefined);void runInterchange({kind:'preview',source,format:'html'},c.signal).then(p=>{if(!c.signal.aborted)setPreview(p);},e=>{if(!c.signal.aborted)setStatus(String(e));});onCleanup(()=>c.abort());});
 onMount(()=>{const stop=editor.mounts.register(props.nodeKey,{root,focusElement:root,inputPolicy:'opaque-widget',focus:()=>root.focus()});onCleanup(stop);});
 onCleanup(()=>{alive=false;active?.abort();});
 const run=async(fn:(s:AbortSignal)=>Promise<void>)=>{if(busy())return;active=new AbortController();setBusy(true);setStatus('Working…');try{await fn(active.signal);}catch(e){if(alive)setStatus(String(e));}finally{if(alive)setBusy(false);}};
 async function enrich(){await run(async signal=>{const snapshotId=article()?.snapshotId;const c=await api.call('encyclopedia.enrich',{id:crypto.randomUUID(),snapshotId},signal);if(!alive||article()?.snapshotId!==snapshotId)return;setCapture(c);setStatus('Acquisition does not accept statements. Review each statement; accepted facts are stored in Vault knowledge independently of document Undo.');});}
 async function review(id:string,decision:'accepted'|'rejected'){await run(async signal=>{const c=capture();if(!c)return;const key=c.snapshot.snapshotId+':'+id+':'+decision;let operationId=operations.get(key);if(!operationId){operationId=crypto.randomUUID();operations.set(key,operationId);}const result=await api.call('encyclopedia.review',{operationId,snapshotId:c.snapshot.snapshotId,statementId:id,decision},signal);if(!alive)return;setCapture({...c,reviews:[...c.reviews.filter(r=>r.statementId!==id),result]});setStatus(decision==='accepted'?'Created a source-imported Claim. Existing facts were not changed.':'Rejected; no Claim created.');});}
 return <section ref={root} tabindex="0" class="abstract-block mutable-web-article" data-runtime-key={props.nodeKey} data-client-id={props.nodeKey} data-block-type="mutable/web-article-block" style={{padding:'12px',border:'1px solid var(--flint-border,#ddd)'}}>
  <h3>{article()?.title??'Captured Wikipedia article'}</h3>
  <p>{article()?.site} · revision {article()?.revision} · captured {article()?.retrievedAt}. Retained offline copy; live changes are not checked.</p>
  <Show when={/^[a-z][a-z0-9-]{0,30}\.wikipedia\.org$/.test(article()?.site??'')&&Number.isSafeInteger(article()?.revision)}><a href={`https://${article().site}/w/index.php?oldid=${article().revision}`} target="_blank" rel="noopener noreferrer">Open captured revision and attribution history ↗</a></Show>
  <p>Wikipedia contributors · CC BY-SA. <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer">License</a></p>
  <button onClick={()=>void editor.interchange.convertSourceBlock(props.nodeKey)}>Convert to editable Ink…</button>{' '}
  <Show when={editor.features.academicResourceLoaders&&!node()?.payload.archive&&article()?.qid} fallback={<span>No Wikidata enrichment available.</span>}><button disabled={busy()} onClick={()=>void enrich()}>Acquire Wikidata {article()?.qid} for review…</button></Show>
  <Show when={busy()}><button onClick={()=>active?.abort()}>Cancel</button></Show>
  <p role="status">{status()}</p>
  <Show when={preview()} fallback={<p>Preparing isolated reading view…</p>}>{p=><iframe title="Captured Wikipedia article" sandbox="" referrerpolicy="no-referrer" srcdoc={p().srcdoc} style={{width:'100%',height:'600px',border:'0'}}/>}</Show>
  <Show when={links().length}><details><summary>Captured external links (not loaded)</summary><ul><For each={links()}>{url=><li><a href={url} target="_blank" rel="noopener noreferrer">{url}</a></li>}</For></ul></details></Show>
  <details><summary>Capture and conversion limitations</summary><For each={Array.isArray(node()?.payload.diagnostics)?node().payload.diagnostics as string[]:[]}>{d=><p>{d}</p>}</For><p>Converting creates native standoff text; image/media placeholders remain inert. Undo restores this article Block and its identity.</p></details>
  <Show when={capture()}>{c=><section aria-label="Wikidata claim review"><h4>{c().projection.label} — {c().projection.qid}, revision {c().projection.revision}</h4><p>{c().projection.description}</p>
   <For each={c().projection.diagnostics}>{d=><p>{d}</p>}</For>
   <details><summary>Existing subject claims (up to 100; possible conflicts)</summary><For each={c().existingClaims.slice(0,100)}>{v=><p>{v.expression} ({v.typename})</p>}</For><p>No automatic conflict resolution or overwrite is performed.</p></details>
   <For each={c().projection.statements}>{s=><article style={{padding:'8px',border:'1px solid #ddd'}}><strong>{s.label}</strong>: {s.summary} <small>({s.rank})</small>
    <details><summary>Value, qualifiers and source references</summary><pre style={{'white-space':'pre-wrap'}}>{JSON.stringify({value:s.value,qualifiers:s.qualifiers,qualifierOrder:s.qualifierOrder,references:s.references},null,2)}</pre></details>
    <For each={s.diagnostics}>{d=><p>{d}</p>}</For>
    <Show when={c().reviews.find(r=>r.statementId===s.id)} fallback={<><button disabled={busy()||!s.supported} onClick={()=>void review(s.id,'accepted')}>Accept as Claim</button><button disabled={busy()} onClick={()=>void review(s.id,'rejected')}>Reject</button></>}>{r=><p>{r().decision}{r().claimGuid?' · '+r().claimGuid:''}</p>}</Show>
   </article>}</For>
  </section>}</Show>
 <Show when={!node()?.payload.archive}><ResourceRelationships ownerKey={props.nodeKey} snapshotId={article()?.snapshotId}/></Show>
 </section>;
}
