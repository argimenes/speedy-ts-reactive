import {For,Show,createSignal,onCleanup,onMount} from 'solid-js';
import {unwrap} from 'solid-js/store';
import {ReactiveEditor} from '../../reactive-editor/editor';
import {ReactiveTreeView} from '../../rendering/reactive-tree-view';
import {registerCoreViews} from '../../rendering/register-core-views';
import {createEntityReferencesFeature} from '../entity-references';
import {annotationCapabilities} from '../../application/annotation-capabilities';
import {registerStandaloneEntityService} from '../../application/entity-service';
import {nativeDocumentSession} from '../../persistence/native-session';
import {openThesisSource} from '../../application/thesis';
import {thesisRequest,thesisEntityService} from './service';
import {serializeAnnotations,propositionDraft,passageHash,type Draft,type Proposition} from './model';
import type {JsonObject} from '../../block-tree/types';
import './view.css';

// One active draft router per DOM Document, independent of the number of open Thesis windows.
const activeDraftInputs=new WeakMap<Document,{owner:ReactiveEditor;release:()=>void}>();
export interface DraftPort {read():{text:string;annotations:ReturnType<typeof serializeAnnotations>};focus():void}
/** Constant work subscriber: no text serialization, vault access, or list refresh on typing. */
export function watchDraftDirty(editor:ReactiveEditor,dirty:()=>void){return editor.repository.subscribeChanges(()=>dirty());}
export function NativePropositionEditor(props:{draft:Draft;vault:string;features?:ReactiveEditor["features"];changed:()=>void;ready:(port:DraftPort)=>void;notice:(message:string)=>void}) {
 const editor=new ReactiveEditor({id:crypto.randomUUID(),type:'standoff-editor-block',text:props.draft.text,standoffProperties:props.draft.properties},{features:{...props.features,thesis:false,nativeDocumentPersistence:false,documentInterchange:false,mutableClipboard:false,blockHistory:false,flint:false,phosphor:false}});
 registerCoreViews(editor);
 onCleanup(registerStandaloneEntityService(editor,()=>thesisEntityService(props.vault,()=>new Set(((editor.node(key)?.payload.standoffProperties??[]) as JsonObject[]).filter(p=>p.type==='codex/entity-reference'&&!p.isDeleted&&typeof p.value==='string').map(p=>String(p.value))))));
 const view=editor.createView(),key=view.state.rootKey;
 if(editor.features.entityReferences)editor.featureHost.activate(createEntityReferencesFeature(scope=>annotationCapabilities(editor,scope,key)));
 let root!:HTMLDivElement,activateInput=()=>{};
 const focus=()=>editor.focus.request(key,{reason:'thesis-draft',caret:'end'});
 const selection=()=>editor.mounts.get(key)?.captureInlineSelection?.()??editor.mounts.inlineSelection(key);
 const annotate=(type:string)=>{try{const r=selection();if(!r||r.anchor===r.head)throw Error('Select some proposition text first.');editor.rangeAnnotations.apply([editor.textRanges.snapshot(key,Math.min(r.anchor,r.head),Math.max(r.anchor,r.head))],type);editor.mounts.get(key)?.restoreInlineSelection?.(r);}catch(e){props.notice(String(e));}};
 onMount(()=>{
  editor.mounts.get(key)?.focusElement.setAttribute('aria-label','Proposition text');
  // A Proposition is one multiline Block. Reuse replacement/range/undo behavior for Enter.
  const newline=(event:Event)=>{
   const resolved=editor.mounts.resolveEvent(event);if(resolved?.nodeKey!==key||resolved.handle.composing||event.defaultPrevented)return;
   const keyEvent=event instanceof KeyboardEvent,enter=keyEvent?event.key==='Enter'&&!event.isComposing&&!event.ctrlKey&&!event.metaKey&&!event.altKey:event instanceof InputEvent&&['insertParagraph','insertLineBreak'].includes(event.inputType)&&!event.isComposing;
   if(!enter)return;const r=selection();if(!r)return;
   event.preventDefault();event.stopImmediatePropagation();const start=Math.min(r.anchor,r.head),end=Math.max(r.anchor,r.head);
   editor.commands.replaceInlineRange(key,start,end,'\n','Proposition newline');queueMicrotask(()=>editor.mounts.get(key)?.restoreInlineSelection?.({anchor:start+1,head:start+1}));
  };
  activateInput=()=>{
   if(activeDraftInputs.get(document)?.owner===editor)return;
   activeDraftInputs.get(document)?.release();
   document.addEventListener('keydown',newline,true);document.addEventListener('beforeinput',newline,true);
   const gateway=editor.installGateway(document);let active=true;
   const release=()=>{if(!active)return;active=false;gateway();document.removeEventListener('keydown',newline,true);document.removeEventListener('beforeinput',newline,true);if(activeDraftInputs.get(document)?.owner===editor)activeDraftInputs.delete(document);};
   activeDraftInputs.set(document,{owner:editor,release});
  };
  activateInput();const dirty=watchDraftDirty(editor,props.changed);
  onCleanup(()=>{dirty();if(activeDraftInputs.get(document)?.owner===editor)activeDraftInputs.get(document)?.release();});
  props.ready({focus,read(){const node=editor.node(key)!;const cells=node.inlineContent.map(k=>editor.node(k)!);if(cells.some(c=>c.viewType!=='text-cell'))throw Error('Embedded objects are not supported in a Proposition.');const text=cells.map(c=>String(c.payload.text)).join('');return {text,annotations:serializeAnnotations(text,unwrap((node.payload.standoffProperties??[]) as JsonObject[]))};}});
  focus();
 });
 onCleanup(()=>editor.dispose());
 return <div class="thesis-native" ref={root} onFocusIn={()=>activateInput()}>
  <div class="thesis-tools" role="toolbar" aria-label="Proposition annotations" onMouseDown={e=>e.preventDefault()}>
   <button type="button" onClick={()=>annotate('style/bold')}>Bold</button><button type="button" onClick={()=>annotate('style/italics')}>Italic</button><button type="button" onClick={()=>annotate('style/highlight')}>Highlight</button>
   <Show when={editor.features.entityReferences&&editor.features.sqliteEntities}><button type="button" onClick={()=>{try{void editor.commandRegistry.execute('entity.open',{targetKey:key,args:undefined});}catch(e){props.notice(String(e));}}}>Entity reference</button></Show>
   <button type="button" onClick={()=>editor.repository.undo()}>Undo</button><button type="button" onClick={()=>editor.repository.redo()}>Redo</button>
  </div>
  <ReactiveTreeView editor={editor} projection={view}/>
 </div>;
}
export function ThesisView(props:{host:ReactiveEditor;initial?:Draft;windowKey?:string;close:()=>void}) {
 const [vault,setVault]=createSignal(''),[ready,setReady]=createSignal(false),[error,setError]=createSignal(''),[notice,setNotice]=createSignal(''),[busy,setBusy]=createSignal(false),[saving,setSaving]=createSignal(false);
 const [query,setQuery]=createSignal(''),[archived,setArchived]=createSignal(false),[rows,setRows]=createSignal<any[]>([]),[next,setNext]=createSignal<string|null>(null),[page,setPage]=createSignal('');
 const [draft,setDraft]=createSignal<Draft>(),[record,setRecord]=createSignal<Proposition>(),[name,setName]=createSignal(''),[dirty,setDirty]=createSignal(false),[editorOnly,setEditorOnly]=createSignal(!!props.initial);
 let port:DraftPort|undefined,alive=true,listing=0,editVersion=0,pendingVersion=0,controller:AbortController|undefined,pending:Record<string,unknown>|undefined;
 const current=()=>alive;
 const discard=()=>!busy()&&(!pending&&!dirty()||window.confirm(pending?'The previous operation has an unconfirmed or rejected outcome. Retry Save to resolve it, or discard this draft?':'Discard unsaved Proposition changes?'));
 const call=(request:unknown,signal?:AbortSignal)=>thesisRequest(vault(),request,signal);
 const refresh=async(after='')=>{
  const token=++listing;controller?.abort();controller=new AbortController();setError('');
  try{const r=await call({op:'list',query:query(),archived:archived(),after,limit:30},controller.signal);if(alive&&token===listing){setRows(r.rows);setNext(r.next);setPage(after);}}
  catch(e){if(alive&&token===listing&&!controller.signal.aborted)setError(String(e));}
 };
 const load=(p:Proposition)=>{editVersion=0;pendingVersion=0;pending=undefined;port=undefined;setRecord(p);setName(p.name);setDraft(propositionDraft(p));setDirty(false);setError('');};
 const edit=async(id:string)=>{if(!discard())return;setBusy(true);try{const r=await call({op:'get',id});if(alive)load(r.proposition);}catch(e){if(alive)setError(String(e));}finally{if(alive)setBusy(false);}};
 const create=()=>{if(!discard())return;editVersion=0;pendingVersion=0;pending=undefined;port=undefined;setRecord(undefined);setName('');setDraft({text:'',properties:[],warnings:[]});setDirty(false);setError('');setNotice('');};
 const changed=()=>{editVersion++;setDirty(true);};
 const save=async()=>{
  if(busy()||!port)return;
  setSaving(true);setBusy(true);setError('');
  try{
   // Retain the exact operation on uncertain transport failure; retries cannot duplicate a create.
   if(!pending){const r=record(),data=port.read();pendingVersion=editVersion;pending={op:r?'update':'create',operationId:crypto.randomUUID(),id:r?.id??crypto.randomUUID(),blockId:r?.blockId??crypto.randomUUID(),...(r?{expectedRevision:r.revision}:{}),name:name(),...data,...(!r&&draft()?.source?{source:draft()!.source}:{})};}
   const submitted=pending,isTextSave=submitted.op==='create'||submitted.op==='update';setSaving(isTextSave);const result=await call(submitted);if(!alive)return;
   if(isTextSave){pending=undefined;setRecord(result.proposition);if(editVersion===pendingVersion)setName(result.proposition.name);setDirty(editVersion!==pendingVersion);setError('');}
   else load(result.proposition); // Retry of an Archive/Restore may need to discard an edited draft.
   setNotice(dirty()?'Saved the submitted draft; newer edits remain unsaved.':'Proposition saved.');await refresh();
  }catch(e){if((e as any)?.notDispatched)pending=undefined;if(alive)setError(String(e)+(pending?' — Retry Save uses the same operation. Reload before resolving a revision conflict.':''));}
  finally{if(alive){setBusy(false);setSaving(false);}}
 };
 const archive=async()=>{const r=record();if(!r||!discard())return;setBusy(true);setError('');try{pending??={op:r.attributes.thesis.archived?'restore':'archive',id:r.id,expectedRevision:r.revision,operationId:crypto.randomUUID()};const result=await call(pending);if(alive){load(result.proposition);await refresh();}}catch(e){if(alive)setError(String(e));}finally{if(alive)setBusy(false);}};
 onMount(()=>{
  if(props.windowKey)props.host.viewCloseGuards.set(props.windowKey,()=>{if(!discard())return false;setDirty(false);return true;});
  const warn=(event:BeforeUnloadEvent)=>{if(dirty()||busy()||pending){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',warn);
  onCleanup(()=>{window.removeEventListener('beforeunload',warn);if(props.windowKey)props.host.viewCloseGuards.delete(props.windowKey);});
  void(async()=>{try{const v=await nativeDocumentSession(props.host).defaultVault();if(!alive)return;if(!v)throw Error('Open a Mutable Vault before using Thesis.');setVault(v);const context=await call({op:'context'});if(!alive)return;setReady(true);
   if(props.initial){const d=props.initial;if(d.source){const {blockText,...source}=d.source;d.source={...source,blockHash:await passageHash(blockText??''),vault:v,vaultGuid:context.vaultGuid};if(!alive)return;}setDraft(d);setDirty(!!d.text||!!d.properties.length);}
   await refresh();
  }catch(e){if(alive)setError(String(e));}})();
 });
 onCleanup(()=>{alive=false;listing++;controller?.abort();});
 const source=()=>draft()?.source;
 return <section class="thesis" aria-label="Thesis" onKeyDown={event=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='s'&&!event.isComposing){event.preventDefault();event.stopPropagation();void save();}}}>
  <header><strong>Thesis</strong><Show when={ready()}><form onSubmit={e=>{e.preventDefault();setEditorOnly(false);void refresh();}}><input aria-label="Search propositions" placeholder="Search labels and statements…" value={query()} onInput={e=>setQuery(e.currentTarget.value)}/><button type="submit">Search</button></form><button type="button" onClick={create} disabled={busy()}>New</button><label><input type="checkbox" checked={archived()} onChange={e=>{setArchived(e.currentTarget.checked);setEditorOnly(false);void refresh();}}/> Archived</label><Show when={editorOnly()}><button type="button" onClick={()=>setEditorOnly(false)}>Browse</button></Show></Show></header>
  <Show when={error()}><p role="alert">{error()}</p></Show><Show when={notice()}><p role="status">{notice()}</p></Show>
  <div class="thesis-body" classList={{'thesis-editor-only':editorOnly()}}>
   <Show when={ready()&&!editorOnly()}><aside aria-label="Propositions"><Show when={rows().length} fallback={<p>No propositions found. <button type="button" onClick={create}>Create proposition</button></p>}><ul><For each={rows()}>{r=><li><button type="button" aria-pressed={record()?.id===r.id} disabled={busy()} onClick={()=>void edit(r.id)}><strong>{r.name}</strong><span class="thesis-preview">{r.preview}</span><small>{r.referenceCount?`${r.referenceCount} references · `:''}{r.sourceResourceGuid?'Source · ':''}{r.modifiedUtc?.slice(0,10)}{r.labelMatch?' · Label match':''}{r.textMatch?' · Text match':''}</small></button></li>}</For></ul></Show><nav aria-label="Proposition pages"><button type="button" disabled={!page()} onClick={()=>void refresh()}>First page</button><button type="button" disabled={!next()} onClick={()=>void refresh(next()!)}>Next page</button></nav></aside></Show>
   <main><Show when={draft()} keyed fallback={<p>Select a proposition or choose New.</p>}>{d=><>
    <label>Name <input aria-label="Proposition name" maxLength={240} value={name()} disabled={busy()&&!saving()} onInput={e=>{setName(e.currentTarget.value);changed();}}/></label><span role="status">{dirty()?'Unsaved changes':''}</span>
    <Show when={d.warnings.length}><details open><summary>Selection transfer notes</summary><ul><For each={d.warnings}>{w=><li>{w}</li>}</For></ul></details></Show>
    <fieldset disabled={busy()&&!saving()} class="thesis-editor-field" inert={busy()&&!saving()?true:undefined}><legend>Proposition</legend><NativePropositionEditor draft={d} vault={vault()} features={props.host.features} changed={changed} ready={p=>port=p} notice={setNotice}/></fieldset>
    <Show when={source()}>{s=><section class="thesis-source" aria-label="Source"><strong>Source passage</strong><blockquote>{s().text}</blockquote><small>Captured {s().capturedUtc.slice(0,10)} · {s().location?.filename??'Ink passage'}</small><button type="button" onClick={()=>{void openThesisSource(props.host,s(),current).then(setNotice,e=>{if(alive)setError(String(e));});}}>Open source</button></section>}</Show>
    <footer><button type="button" disabled={busy()} onClick={()=>void save()}>Save</button><button type="button" disabled={busy()} onClick={()=>{if(discard()){pending=undefined;setDirty(false);setDraft(undefined);setRecord(undefined);if(editorOnly())props.close();}}}>Cancel / Close</button><Show when={record()}>{r=><><button type="button" disabled={busy()||!!pending} onClick={()=>void archive()}>{r().attributes.thesis.archived?'Restore':'Archive'}</button><button type="button" disabled={busy()} onClick={()=>void edit(r().id)}>Reload</button></>}</Show></footer>
   </>}</Show></main>
  </div>
 </section>;
}
