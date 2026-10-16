import {DocumentDialog} from '../demo/document-dialog';
import '../demo/document-browser.css';
import './collection-dialog.css';
import {createSignal,For,Show,onCleanup} from 'solid-js';
import {CollectionInterchange,type CollectionFile} from '../runtime/collection-interchange';
import type {ReactiveEditor} from '../reactive-editor/editor';
import {COLLECTION_LIMITS} from '../interchange/collection/plan';
/** Directory picker plus explicit upload fallback. Selection grants reads only. */
async function directoryFiles(signal:AbortSignal):Promise<{files:CollectionFile[];excluded:string[]}> {
 const root=await (window as any).showDirectoryPicker({mode:'read'}),files:CollectionFile[]=[],excluded:string[]=[];let count=0,total=0;
 const walk=async(handle:any,prefix:string,depth:number)=>{if(depth>32)throw Error('Directory depth limit');for await(const [name,child] of handle.entries()){
  signal.throwIfAborted();if(++count>COLLECTION_LIMITS.files)throw Error('Folder selection exceeds 5,000 entries.');const path=prefix?`${prefix}/${name}`:name;
  if(child.kind==='directory'){if(!name.startsWith('.'))await walk(child,path,depth+1);else excluded.push(path);}else {const blob:File=await child.getFile();if((total+=blob.size)>COLLECTION_LIMITS.bytes)throw Error('Folder selection exceeds 512 MiB.');files.push({path,blob});}
 }};await walk(root,'',0);return {files,excluded};
}
export function CollectionDialog(props:{editor:ReactiveEditor;vault:string;current:()=>boolean;mode:'import'|'export';close:()=>void}) {
 const vault=props.vault,service=new CollectionInterchange(props.editor,vault,()=>props.current()&&props.vault===vault),[files,setFiles]=createSignal<CollectionFile[]>([]),[destination,setDestination]=createSignal('Imports'),[mode,setMode]=createSignal<'native'|'source'>('native'),[policy,setPolicy]=createSignal<'keep'|'skip'|'abort'>('keep'),[error,setError]=createSignal(''),[exclusions,setExclusions]=createSignal<string[]>([]),[folder,setFolder]=createSignal('.'),[selecting,setSelecting]=createSignal(false);
 let alive=true;let pickerController:AbortController|undefined;onCleanup(()=>{alive=false;pickerController?.abort();service.dispose();});
 const runPicker=async()=>{setSelecting(true);pickerController=new AbortController();try{const result=await directoryFiles(pickerController.signal);if(alive){service.invalidateReview();setFiles(result.files);setExclusions(result.excluded);setError('');}}catch(e){if(alive)setError(String(e));}finally{if(alive)setSelecting(false);}};
 const download=()=>{const bytes=service.download();if(!bytes)return;const url=URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:'application/zip'})),a=document.createElement('a');a.href=url;a.download='Mutable collection.zip';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 const downloadReport=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(service.report(),null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='Mutable collection import report.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 const disabled=()=>service.busy()||selecting();
 return <DocumentDialog title={props.mode==='import'?'Import collection':'Export collection'} onClose={props.close} busy={service.busy()}><div class="collection-dialog"><p>Vault: {props.vault}. {props.mode==='import'?'Import creates new Ink documents. Source files are never overwritten.':'Export reads saved files only; save any editor changes first.'}</p>
 <Show when={props.mode==='import'} fallback={<><label>Saved collection directory (relative to Vault)<input value={folder()} disabled={disabled()} onInput={e=>setFolder(e.currentTarget.value)}/></label><button disabled={disabled()} onClick={()=>void service.listExport(folder())}>Review export inventory</button><For each={service.exports()}>{item=><label class="collection-file"><input type="checkbox" checked={item.selected} disabled={disabled()} onChange={e=>service.toggleExport(item.path,e.currentTarget.checked)}/>{item.path}</label>}</For><button disabled={disabled()||!service.exports().length} onClick={()=>void service.export()}>Prepare selected collection</button><Show when={service.download()}><button onClick={download}>Download reviewed collection ZIP</button></Show></>}>
 <p>Choose a folder, then review the proposed destinations. Supported Markdown, HTML and text become new Ink documents; source mode embeds authoritative Markdown/HTML. PNG/JPEG attachments are imported only when referenced. No remote resources are fetched.</p>
 <Show when={'showDirectoryPicker' in window}><button disabled={disabled()} onClick={()=>void runPicker()}>Choose source folder…</button></Show>
 <label>Folder upload fallback<input type="file" multiple {...{webkitdirectory:''}} disabled={disabled()} onChange={e=>{const selected=Array.from(e.currentTarget.files??[]);setExclusions([]);service.invalidateReview();setFiles(selected.map(blob=>({blob,path:blob.webkitRelativePath.split('/').slice(1).join('/')})));setError('');}}/></label><p>{files().length} selected files. Hidden/private paths are excluded.</p><Show when={exclusions().length}><details><summary>Excluded hidden directories ({exclusions().length})</summary><For each={exclusions()}>{path=><div>{path}/</div>}</For></details></Show><button disabled={disabled()} onClick={()=>void service.reviewSaved()}>Review saved batch</button>
 <label>Destination directory (relative to Vault)<input value={destination()} disabled={disabled()} onInput={e=>{service.invalidateReview();setDestination(e.currentTarget.value);}}/></label>
 <label>Content mode<select value={mode()} disabled={disabled()} onChange={e=>{service.invalidateReview();setMode(e.currentTarget.value as 'native'|'source');}}><option value="native">Convert to native Ink</option><option value="source">Preserve Markdown / HTML source</option></select></label>
 <label>Existing destinations<select value={policy()} disabled={disabled()} onChange={e=>{service.invalidateReview();setPolicy(e.currentTarget.value as any);}}><option value="keep">Keep both (numbered suffix)</option><option value="skip">Skip colliding documents</option><option value="abort">Abort review on collision</option></select></label>
 <button disabled={disabled()||!files().length} onClick={()=>void service.review(files(),destination(),mode(),policy())}>Review collection</button><button disabled={disabled()||!files().length} onClick={()=>void service.review(files(),destination(),mode(),policy(),true)}>Review resume (reselect original folder)</button>
 <Show when={service.plan()}>{plan=><>
 <p>{plan().entries.length} files; {plan().directories.length} destination directories. Mode: {plan().mode}. Destination: {plan().destination}.</p>
 <details><summary>Source files and attachments</summary><For each={plan().entries}>{entry=><div>{entry.path} — {entry.kind}, {entry.size} bytes{entry.reason?`: ${entry.reason}`:''}</div>}</For></details>
 <details><summary>Destination directories</summary><For each={plan().directories}>{dir=><div>{dir}/</div>}</For></details>
 <table><thead><tr><th>Source</th><th>Destination</th><th>Outcome</th></tr></thead><tbody><For each={plan().documents}>{doc=><tr><td>{doc.source}</td><td>{doc.path}</td><td>{doc.status}{doc.diagnosticCount?` · ${doc.diagnosticCount} diagnostics`:''}{doc.error?`: ${doc.error}`:''}<Show when={doc.status==='failed'&&service.canSkip(doc.source)}><button disabled={disabled()} onClick={()=>service.skip(doc.source)}>Skip this document</button></Show></td></tr>}</For></tbody></table>
 <p>Document outcomes: {(['completed','skipped','failed','pending'] as const).map(status=>`${status}: ${plan().documents.filter(d=>d.status===status).length}`).join(' · ')}</p>
 <button onClick={downloadReport}>Download import report</button><Show when={service.canAbandon()}><button disabled={disabled()} onClick={()=>void service.abandon()}>Abandon remaining import (keep saved files)</button></Show>
 <p><strong>Import and Save collection</strong> explicitly saves each document. Cancellation keeps completed saves. This batch is not a single Undo operation. Resume requires the same folder and unchanged source and saved destination files.</p>
 <button disabled={disabled()||!plan().documents.length||!service.canSave()} onClick={()=>void service.save()}>Import and Save collection</button>
 </>}</Show>
 </Show>
 <Show when={service.notes().length}><details open><summary>Conversion and reference diagnostics ({service.notes().length})</summary><ul><For each={service.notes()}>{note=><li>{note}</li>}</For></ul></details></Show>
 <p role="status">{service.status()}</p><p role="alert">{error()}</p><Show when={service.busy()}><button onClick={()=>service.cancel()}>Cancel operation</button></Show><button onClick={()=>props.close()}>{service.busy()?'Cancel and close':'Close'}</button>
 </div></DocumentDialog>;
}
