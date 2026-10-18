import {ResourceRelationships} from './resource-relationships';
import {createMemo,createSignal,For,Show,onMount,onCleanup} from 'solid-js';
import type {BlockViewProps} from '../block-tree/types';
import {useReactiveView} from '../reactive-editor/context';
import {citationData,citationText,cslJson,doiUrl} from '../interchange/scholarly';
import {HttpApplicationServices} from '../runtime/application-services';
import type {ScholarlyBacklink} from '../application-services/academic-contracts';
export function CitationBlockView(props:BlockViewProps){
 const {editor,projection}=useReactiveView(),node=()=>projection.state.nodes[props.nodeKey];
 const citation=createMemo(()=>citationData(node()?.payload.citation));let root!:HTMLDivElement;
 const [online,setOnline]=createSignal(typeof navigator==='undefined'||navigator.onLine);
 onMount(()=>{const update=()=>setOnline(navigator.onLine);window.addEventListener('online',update);window.addEventListener('offline',update);onCleanup(()=>{window.removeEventListener('online',update);window.removeEventListener('offline',update);});});
 const [references,setReferences]=createSignal<ScholarlyBacklink[]>(),[status,setStatus]=createSignal('');const controller=new AbortController();
 onMount(()=>{const stop=editor.mounts.register(props.nodeKey,{root,focusElement:root,inputPolicy:'opaque-widget',focus:()=>root.focus()});onCleanup(stop);});
 onCleanup(()=>controller.abort());
 const api=new HttpApplicationServices(()=>{const scope=editor.readAssetContext();if(!scope?.cavernId||!scope.session)throw Error('Open a writable Vault to query saved references');return {cavernId:scope.cavernId,session:scope.session};});
 return <div ref={root} tabindex="0" class="abstract-block mutable-citation-block" data-runtime-key={props.nodeKey} data-client-id={props.nodeKey} data-block-type="mutable/citation-block" style={{padding:'12px',margin:'8px 0',border:'1px solid var(--flint-border,#ddd)'}}>
  <Show when={citation()} fallback={<p>Unsupported citation. Original data retained.</p>}>{c=><>
   <strong>{c().metadata.title}</strong><p>{citationText(c().metadata)}</p>
   <small>{c().metadata.providerType} · {c().provider} · Retained metadata from {c().retrievedAt}{online()?'':' (offline)'}. Live changes have not been checked.</small>
   <p><a href={doiUrl(c().metadata.doi)} target="_blank" rel="noopener noreferrer">Open DOI ↗</a>{' '}
   <button onClick={()=>{const href=URL.createObjectURL(new Blob([JSON.stringify([cslJson(c().metadata)],null,2)],{type:'application/vnd.citationstyles.csl+json'}));const a=document.createElement('a');a.href=href;a.download='citation.csl.json';a.click();setTimeout(()=>URL.revokeObjectURL(href),1000);}}>Export CSL JSON</button>{' '}
   <Show when={editor.features.academicResourceLoaders&&!node()?.payload.archive}><button onClick={async()=>{
    setStatus('Finding saved references…');try{const result=await api.call('academic.backlinks',{entityId:c().entityId},controller.signal);setReferences(result.rows.slice(0,100));setStatus(result.rows.length>100?'Showing the first 100 saved references.':'Saved indexed documents only; coverage may be incomplete. Unsaved occurrences are not included.');}catch(e){if(!controller.signal.aborted)setStatus(String(e));}
   }}>Saved references</button></Show></p>
   <Show when={editor.features.crossResourceLoaders&&!node()?.payload.archive}><details><summary>Declared full-text candidates</summary><p>Provider links are discovery metadata, not proof of access rights or Work identity. Inspect a candidate explicitly before acquisition; no publisher is contacted automatically.</p><For each={(Array.isArray(c().metadata.fullTextCandidates)?c().metadata.fullTextCandidates:[]).filter(v=>{try{const u=new URL(v);return typeof v==='string'&&v.length<=4096&&u.protocol==='https:'&&!u.username&&!u.password;}catch{return false;}}).slice(0,20)}>{url=><p><button onClick={()=>void editor.interchange.inspectLinkedResource(props.nodeKey,url)}>Inspect / import candidate</button> {url}</p>}</For></details></Show>
   <For each={c().metadata.diagnostics??[]}>{message=><p>{message}</p>}</For>
   <p role="status">{status()}</p><Show when={references()}><ul><For each={references()}>{r=><li>{r.title??r.path} · {r.path} · Block {r.blockId}</li>}</For></ul></Show>
  </>}</Show>
 <Show when={!node()?.payload.archive}><ResourceRelationships ownerKey={props.nodeKey} snapshotId={citation()?.snapshotId}/></Show>
 </div>;
}
