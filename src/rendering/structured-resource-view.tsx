import {createEffect,createMemo,createSignal,For,Show,onCleanup,onMount} from 'solid-js';
import {useReactiveView} from '../reactive-editor/context';
import type {BlockViewProps} from '../block-tree/types';
import {structuredPayload,type Presentation} from '../structured/model';
import type {Tree,StructuredView} from '../structured/parse';
import {runInterchange} from '../runtime/interchange-worker';
import './structured-resource.css';
function Branch(props:{node:Tree;label:string}){
 const [open,setOpen]=createSignal(false),[limit,setLimit]=createSignal(100);
 return <Show when={props.node.entries} fallback={<div class="structured-leaf"><span>{props.label}</span> <small>{props.node.type}</small> <span class="structured-value">{props.node.value}</span></div>}><details onToggle={e=>setOpen(e.currentTarget.open)}><summary>{props.label} <small>{props.node.type} · {props.node.entries!.length}</small></summary><Show when={open()}><div class="structured-branch"><For each={props.node.entries!.slice(0,limit())}>{entry=><Branch label={entry.key} node={entry.node}/>}</For><Show when={props.node.entries!.length>limit()}><button onClick={()=>setLimit(n=>n+100)}>Show next 100</button></Show></div></Show></details></Show>;
}
export function StructuredResourceView(props:BlockViewProps){
 const {editor,projection}=useReactiveView(),payload=()=>projection.state.nodes[props.nodeKey]?.payload;
 const data=createMemo(()=>{const p=payload();return structuredPayload(p)?{text:String(p.text),meta:p.structured as any}:undefined;});
 const [format,setFormat]=createSignal<Presentation>(data()?.meta.presentation??'source'),[source,setSource]=createSignal(false),[wrap,setWrap]=createSignal(false),[language,setLanguage]=createSignal('Auto'),[header,setHeader]=createSignal(true),[rows,setRows]=createSignal(100),[parsed,setParsed]=createSignal<StructuredView>(),[status,setStatus]=createSignal(''),[languages,setLanguages]=createSignal<string[]>([]);
 let root!:HTMLElement,display!:HTMLDivElement,alive=true;onCleanup(()=>{alive=false;});
 onMount(()=>onCleanup(editor.mounts.register(props.nodeKey,{root,focusElement:root,inputPolicy:'opaque-widget',focus:()=>root.focus()})));
 createEffect(()=>{
  const d=data(),f=format(),asSource=source()||f==='source',lang=language(),wrapping=wrap();const c=new AbortController();let dispose:(()=>void)|undefined;
  onCleanup(()=>{c.abort();dispose?.();});setParsed(undefined);setRows(100);setStatus('Loading…');display?.replaceChildren();
  if(!d){setStatus('Unsupported resource. Original data retained.');return;}
  void(async()=>{try{
   if(asSource){const module=await import('../structured/source-view');if(c.signal.aborted)return;setLanguages(module.sourceLanguages);const view=await module.sourceView(display,d.text,lang==='Auto'?module.languageFor(d.meta.filename):lang,wrapping,c.signal);dispose=view.dispose;if(c.signal.aborted){dispose();return;}setStatus(view.notice);}
   else if(f==='mermaid'){const {diagramFrame}=await import('../structured/mermaid-view');if(c.signal.aborted)return;dispose=await diagramFrame(display,d.text,c.signal,error=>{if(!c.signal.aborted)setStatus(error??'');});}
   else{const result=await runInterchange({kind:'structured-preview',source:d.text,format:f},c.signal);if(c.signal.aborted)return;setParsed(result);setStatus(result.error??'');}
  }catch(e){if(!c.signal.aborted)setStatus(String(e));}})();
 });
 async function copy(){try{await navigator.clipboard.writeText(data()?.text??'');if(alive)setStatus('Source copied.');}catch{if(alive)setStatus('Clipboard unavailable. Select and copy from Source.');}}
 return <section ref={root} tabindex="0" class="abstract-block structured-resource" data-runtime-key={props.nodeKey} data-client-id={props.nodeKey}>
  <div class="structured-toolbar"><strong>{data()?.meta.filename??'Resource'}</strong><small>read-only</small><label>View <select aria-label="Resource presentation" value={format()} onChange={e=>{setFormat(e.currentTarget.value as Presentation);setSource(false);}}><option value="json">JSON tree</option><option value="yaml">YAML tree</option><option value="csv">CSV table</option><option value="tsv">TSV table</option><option value="source">Source</option><option value="mermaid">Mermaid diagram</option></select></label>
   <Show when={format()!=='source'}><button aria-pressed={source()} onClick={()=>setSource(v=>!v)}>{source()?'Structured':'Source'}</button></Show><button onClick={()=>void copy()}>Copy source</button>
   <Show when={source()||format()==='source'}><label>Language <select aria-label="Source language" value={language()} onChange={e=>setLanguage(e.currentTarget.value)}><option>Auto</option><For each={languages()}>{l=><option>{l}</option>}</For></select></label><label><input type="checkbox" checked={wrap()} onChange={e=>setWrap(e.currentTarget.checked)}/>Wrap</label></Show>
  </div>
  <Show when={status()}><p role="status">{status()}</p></Show><div ref={display}/>
  <Show when={parsed()?.tree}>{tree=><div class="structured-scroll"><Branch label="$" node={tree()}/></div>}</Show>
  <Show when={parsed()?.rows}>{table=><><label><input type="checkbox" checked={header()} onChange={e=>setHeader(e.currentTarget.checked)}/>First row is a header</label><div class="structured-scroll"><table><Show when={header()}><thead><tr><For each={table()[0]}>{cell=><th scope="col">{cell}</th>}</For></tr></thead></Show><tbody><For each={table().slice(header()?1:0,rows())}>{row=><tr><For each={row}>{cell=><td>{cell}</td>}</For></tr>}</For></tbody></table></div><Show when={table().length>rows()}><button onClick={()=>setRows(n=>n+100)}>Show next 100 rows ({table().length} total)</button></Show></>}</Show>
 </section>;
}
