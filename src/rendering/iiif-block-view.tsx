import { ReverseInformation } from './reversible-surface';
import {archivedResourceApi} from '../runtime/archived-resources';
import {ResourceRelationships} from './resource-relationships';
import {unwrap} from 'solid-js/store';
import {createSignal,createEffect,untrack,onMount,onCleanup,Show,For} from 'solid-js';
import type {BlockViewProps} from '../block-tree/types';
import {useReactiveView} from '../reactive-editor/context';
import {HttpApplicationServices} from '../runtime/application-services';
import {canvasAt,type Capture,type Projection} from '../iiif/model';
import {annotation,validAnchor,type ResourceAnnotation} from '../iiif/resource-anchor';
import {mountIIIFViewer,type IIIFViewer} from '../iiif/viewer';
/** All pan/zoom/cache state belongs to this mounted occurrence, not authored data. */
export function IIIFBlockView(props:BlockViewProps){
 const {editor,projection}=useReactiveView(),node=()=>projection.state.nodes[props.nodeKey],snapshot=()=>node()?.payload.iiif as unknown as Capture;
 const [source,setSource]=createSignal<Projection>(),[selected,setSelected]=createSignal(''),[status,setStatus]=createSignal(''),[busy,setBusy]=createSignal(false),[viewer,setViewer]=createSignal<IIIFViewer>(),[note,setNote]=createSignal(''),[imageNotice,setImageNotice]=createSignal(''),[region,setRegion]=createSignal({x:0,y:0,width:100,height:100});
 let root!:HTMLElement,host!:HTMLDivElement,active:AbortController|undefined,grant:string|undefined,alive=true,epoch=0;
 const archive=(node()?.payload.archive as any),local=archive?archivedResourceApi(editor,archive):undefined;onCleanup(()=>{void local?.close();});
 const api=local?.api??new HttpApplicationServices(()=>{const c=editor.readAssetContext();if(!c?.cavernId||!c.session)throw Error('Open the source Vault to read this IIIF capture');return {cavernId:c.cavernId,session:c.session};});
 const canvases=()=>{const p=source();return p?p.kind==='manifest'?p.canvases:[canvasAt(p,p.id)]:[];},canvas=()=>canvases().find(c=>c.id===selected());
 const annotations=()=>{const a=node()?.payload.blockProperties;return (Array.isArray(a)?a:[]).map(annotation).filter((a):a is ResourceAnnotation=>!!a);};
 const currentAnnotations=()=>annotations().filter(a=>a.anchor.snapshotId===snapshot()?.snapshotId&&a.anchor.manifestId===source()?.id&&a.anchor.canvasId===selected()&&a.anchor.canvasWidth===canvas()?.width&&a.anchor.canvasHeight===canvas()?.height);
 function close(){epoch++;setImageNotice('');active?.abort();active=undefined;untrack(viewer)?.destroy();setViewer(undefined);if(grant){const old=grant;grant=undefined;void api.call('iiif.close',{grant:old}).catch(()=>{});}setBusy(false);}
 createEffect(()=>{const id=snapshot()?.snapshotId;close();setSource(undefined);if(!id||!editor.features.iiifResourceLoaders)return;const c=new AbortController();void api.call('iiif.read',{snapshotId:id},c.signal).then(r=>{if(c.signal.aborted)return;setSource(r.projection);setSelected(r.projection.kind==='manifest'?r.projection.canvases[0].id:r.projection.id);setStatus('Source retained. Image tiles load only after activation.');},e=>{if(!c.signal.aborted)setStatus(String(e));});onCleanup(()=>c.abort());});
 onMount(()=>{const stop=editor.mounts.register(props.nodeKey,{root,focusElement:root,inputPolicy:'opaque-widget',focus:()=>root.focus()});onCleanup(stop);});
 onCleanup(()=>{alive=false;close();});
 async function activate(online:boolean){close();const generation=epoch,c=active=new AbortController(),selectedCanvas=canvas();if(!selectedCanvas?.service)return;setBusy(true);setStatus('Opening selected canvas…');
  try{const result=await api.call('iiif.open',{snapshotId:snapshot().snapshotId,canvasId:selectedCanvas.id,online,origins:online?[new URL(selectedCanvas.service).origin]:[]},c.signal);
   if(!alive||generation!==epoch){void api.call('iiif.close',{grant:result.grant}).catch(()=>{});return;}grant=result.grant;setImageNotice([result.info.attribution,result.info.rights].filter(Boolean).join(' · '));
   const v=await mountIIIFViewer(host,api,grant,result.info,selectedCanvas,c.signal,message=>{if(alive&&generation===epoch)setStatus(message);});if(!alive||generation!==epoch){v.destroy();return;}setViewer(v);setStatus(`${online?'Online tiles enabled':'Offline only'} · ${result.retained} retained tiles · ${result.cached} session-cached tiles. Blank regions may be unavailable.`);
  }catch(e){if(alive&&generation===epoch){close();setStatus(String(e));}}finally{if(alive&&generation===epoch)setBusy(false);}
 }
 async function retain(){if(!grant||busy())return;const g=grant,generation=epoch;setBusy(true);try{const r=await api.call('iiif.retain',{grant:g},active?.signal);if(alive&&generation===epoch)setStatus(`${r.retained} cached tiles retained in this Vault. Other resolutions/regions are not available offline.`);}catch(e){if(alive&&generation===epoch)setStatus(String(e));}finally{if(alive&&generation===epoch)setBusy(false);}}
 function saveNote(){const c=canvas(),p=source();if(!c||!p||!note().trim())return;const anchor={version:1,kind:'iiif-canvas',coordinateVersion:1,manifestId:p.id,canvasId:c.id,snapshotId:snapshot().snapshotId,canvasWidth:c.width,canvasHeight:c.height,region:{...region()}} as const;if(!validAnchor(anchor)){setStatus('Region must be within this canvas, with positive width and height.');return;}if(annotations().length>=500){setStatus('This Block has reached its 500 annotation limit.');return;}
  const item={id:crypto.randomUUID(),type:'mutable/resource-annotation',anchor,value:note().slice(0,4000),metadata:{origin:'authored',createdAt:new Date().toISOString()}};editor.commands.setPayloadField(props.nodeKey,'blockProperties',[...(unwrap(node().payload.blockProperties) as any[]??[]),item]);setNote('');setStatus('Spatial annotation added. Save the document to retain it.');}
 function remove(id:string){editor.commands.setPayloadField(props.nodeKey,'blockProperties',(unwrap(node().payload.blockProperties) as any[]).filter(p=>p.id!==id));}
 function Overlay(p:{id:string}){createEffect(()=>{const a=currentAnnotations().find(a=>a.id===p.id),v=viewer();if(a&&v)onCleanup(v.overlay(a.id,a.anchor,a.value));});return null;}
 return <section ref={root} tabindex="0" class="abstract-block mutable-iiif" data-runtime-key={props.nodeKey} data-client-id={props.nodeKey} style={{padding:'12px',border:'1px solid var(--flint-border,#ddd)'}}>
  <ReverseInformation nodeKey={props.nodeKey}>  <h3>{snapshot()?.label??'IIIF resource'}</h3><p>Captured {snapshot()?.retrievedAt}. Source and image-information captures are immutable; importing again creates a separate occurrence.</p>
  <Show when={source()}>{p=><><p>{p().attribution} {p().rights}</p><details><summary>Source and diagnostics</summary><p style={{'overflow-wrap':'anywhere'}}>{snapshot()?.sourceUrl}</p><For each={p().diagnostics}>{d=><p>{d}</p>}</For><Show when={p().kind==='manifest'}><For each={(p() as any).metadata??[]}>{(m:any)=><p>{m.label}: {m.value}</p>}</For></Show></details></>}</Show>
</ReverseInformation>
  <Show when={!editor.features.iiifResourceLoaders}><p>IIIF viewers are disabled. Saved source references and annotations are preserved.</p></Show>
  <label>Canvas <select aria-label="IIIF canvas" value={selected()} onChange={e=>{close();setSelected(e.currentTarget.value);setStatus('Canvas selected; activate its viewer.');}}><For each={canvases()}>{c=><option value={c.id}>{c.label}</option>}</For></select></label>
  <Show when={canvas()}>{c=><><ReverseInformation nodeKey={props.nodeKey}><p>{c().attribution} {c().rights} {imageNotice()}</p><p>{c().width} × {c().height} canvas units. <For each={c().diagnostics}>{d=><span>{d} </span>}</For></p></ReverseInformation>
   <Show when={c().service}><p>Online activation sends image-region requests to {new URL(c().service!).origin}. No cookies or credentials are forwarded.</p><Show when={!archive}><button disabled={busy()} onClick={()=>void activate(true)}>Activate online viewer</button></Show>{' '}<button disabled={busy()} onClick={()=>void activate(false)}>Open retained / cached tiles only</button></Show>
  </>}</Show>
  <button onClick={close}>Close / cancel viewer</button><p role="status">{status()}</p>
  <div ref={host} aria-label="IIIF image viewport" style={{width:'100%','max-width':'1200px',height:viewer()||busy()?'500px':'0px',overflow:'hidden',background:'#242424',position:'relative'}}/>
  <Show when={viewer()}><div><button onClick={()=>viewer()?.zoom(1.5)}>Zoom in</button><button onClick={()=>viewer()?.zoom(1/1.5)}>Zoom out</button><button onClick={()=>viewer()?.home()}>Fit image</button><Show when={!archive}><button disabled={busy()} onClick={()=>void retain()}>Retain cached tiles for offline viewing</button></Show></div></Show>
  <For each={currentAnnotations().map(a=>a.id)}>{id=><Overlay id={id}/>}</For>
  <Show when={canvas()}><details><summary>Spatial annotations ({currentAnnotations().length})</summary><p>Regions use the captured canvas coordinates. Overlapping notes are independent. Pan/zoom to a region, use the visible region, or enter precise coordinates.</p>
   <button disabled={!viewer()} onClick={()=>{try{setRegion(viewer()!.region());}catch(e){setStatus(String(e));}}}>Use visible region</button>
   <For each={['x','y','width','height'] as const}>{key=><label>{key} <input aria-label={`Region ${key}`} type="number" min="0" value={region()[key]} onInput={e=>setRegion({...region(),[key]:Number(e.currentTarget.value)})} style={{width:'90px'}}/></label>}</For>
   <label>Note <input aria-label="Spatial note" value={note()} maxlength={4000} onInput={e=>setNote(e.currentTarget.value)}/></label><button disabled={!note().trim()||!editor.features.iiifResourceLoaders} onClick={saveNote}>Add spatial annotation</button>
   <For each={currentAnnotations()}>{a=><p>{a.value} <button aria-label={`Delete annotation ${a.value}`} onClick={()=>remove(a.id)}>Delete</button></p>}</For>
  </details></Show>
 <Show when={!archive}><ReverseInformation nodeKey={props.nodeKey}><ResourceRelationships ownerKey={props.nodeKey} snapshotId={snapshot()?.snapshotId}/></ReverseInformation></Show>
 </section>;
}
