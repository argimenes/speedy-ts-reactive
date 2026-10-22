import type { ReactiveEditor } from '../../reactive-editor/editor';
import type { CodexFeature } from '../../feature-api';
import { keyboard, chord } from '../../feature-api';
import { annotationCapabilities } from '../../application/annotation-capabilities';
import { completionDocuments } from '../../application/completion-documents';
import { collectDocumentEntities } from '../entity-references/document-entities';
import { invocation } from './model';
import { CompletionSession, type CompletionSource } from './session';
import { CompletionPopup } from './view';
import type { EntitySearchData } from '../entity-references/entity-search';
import type { DocumentTarget } from '../../feature-api/document-application';
import './style.css';

export function createAutocompleteFeature(editor: ReactiveEditor): CodexFeature {
 return { id:'autocomplete-workstation',activate(scope) {
  const api=annotationCapabilities(editor,scope);
  let current:CompletionSession|undefined, overlay:string|undefined, stopInventory:(()=>void)|undefined;
  const text=(key:string,start:number,end:number)=>{const n=editor.node(key); if(!n)return '';let out='';for(let i=start;i<end;i++){const c=editor.node(n.inlineContent[i]);if(c?.viewType!=='text-cell')throw Error('Completion requires plain text');out+=String(c.payload.text??'');}return out;};
  const snapshot=(key:string,start:number,end:number,inline:boolean):CompletionSource=>{
   const n=editor.node(key);if(!n||n.viewType!=='standoff-editor-block')throw Error('Select a text occurrence first');
   return {nodeKey:key,contentKey:n.contentKey,placementKey:n.placementKey,viewId:n.viewId,version:editor.repository.state.contents[n.contentKey]?.inlineRevision??0,start,end,literal:text(key,start,end),inline};
  };
  const valid=(s:CompletionSource)=>{
   const n=editor.node(s.nodeKey),handle=editor.mounts.get(s.nodeKey);
   return !!n&&!!handle?.root.isConnected&&!handle.root.closest('[hidden],[inert]')&&!handle.composing&&n.viewId===s.viewId&&n.contentKey===s.contentKey&&n.placementKey===s.placementKey&&(editor.repository.state.contents[n.contentKey]?.inlineRevision??0)===s.version;
  };
  const cancel=()=>{const old=current;current=undefined;old?.dispose();stopInventory?.();stopInventory=undefined;const key=overlay;overlay=undefined;if(key)editor.overlays.close(key,false,true);};
  const restore=(s:CompletionSource,end:number)=>{queueMicrotask(()=>{const n=editor.node(s.nodeKey),h=editor.mounts.get(s.nodeKey);if(!h?.root.isConnected||h.root.closest('[hidden],[inert]')||n?.contentKey!==s.contentKey)return;editor.focus.request(s.nodeKey,{reason:'autocomplete-commit'});h.restoreInlineSelection?.({anchor:end,head:end});editor.selections.setPrimary(s.nodeKey,s.contentKey,s.viewId,end);});};
  const advanced=(session:CompletionSession,review=false,authority=false)=>{
   try {
    session.assertSource(); const s=session.source, parsed=session.parsed;
    // Review annotations on the authored phrase; opening the tool never deletes syntax.
    let start=s.start,end=s.end;
    if(s.inline){start++;end=start+[...parsed.mention].length;}
    const ranges=end>start?[{...editor.textRanges.snapshot(s.nodeKey,start,end),coordinate:'cell' as const}]:[];
    const data:EntitySearchData={entityRanges:ranges,entityRevision:api.revision(),entityQuery:parsed.mention,workstation:{query:parsed.createName??parsed.query,review,entityId:session.state.selected,createName:parsed.createName,authority,...(s.inline?{invocation:editor.textRanges.snapshot(s.nodeKey,s.start,s.end)}:{})}};
    if(!editor.panels.get('entity-search'))throw Error('Entity workstation unavailable');
    const documentScope=api.scope(s.nodeKey,'document');
    const existing=editor.overlays.overlays.find(o=>o.viewType==='entity-search'&&editor.node(o.ownerKey)?.viewId===s.viewId&&api.scope(o.ownerKey,'document').rootKey===documentScope.rootKey);
    cancel();
    if(existing){editor.focus.request(existing.key,{reason:'autocomplete-workstation'});return;}
    // The Entity feature owns this contributed panel and its close/recovery guards.
    editor.overlays.open({ownerKey:s.nodeKey,viewType:'entity-search',data,anchor:{x:20,y:20},explicitDismissal:true});
   }catch(e){session.fail(e);}
  };
  const open=(source:CompletionSource,kind:CompletionSession['state']['kind'],input:string)=>{
   cancel(); let service:import("../../feature-api/entities").EntityService|undefined;try{service=api.entities?.(source.nodeKey);}catch{/* Non-Entity commands remain usable. */}
   const session=new CompletionSession({service,historyScope:()=>service?.historyScope?.()??Promise.resolve(`session:${source.viewId}`),
    documentEntities:()=>collectDocumentEntities(api,source.nodeKey).rows.map(r=>({id:r.id,name:r.fallbackName??r.id,reason:`${r.documentMentions} committed Document mention(s)`,frequency:r.documentMentions})),
    documents:async()=>{const pool=await completionDocuments(editor,source.nodeKey).completionTargets();return pool.sources.map(t=>({id:t.documentId,name:t.title,reason:`Document · ${t.location}`,data:t}));},
    commands:()=>[
     {id:'entity',name:'entity',reason:'Resolve an Entity or create explicitly'},
     {id:'link',name:'link',reason:'Reference an available native Document'},
     {id:'entity.list.open',name:'backlinks',reason:'Open the current Document Entity references'},
     {id:'thesis.createProposition',name:'proposition',reason:'Open a Thesis draft'},
     {id:'date',name:'date',reason:'Insert today’s local ISO date'},
    ].filter(r=>['entity','link','date'].includes(r.id)||editor.commandRegistry.canExecute(r.id,{targetKey:source.nodeKey,args:undefined})),
    valid,
    commit:(s,e,label)=>{if(!valid(s))throw Error('Stale source');if(api.text(s.nodeKey)?.properties.some(p=>!p.isDeleted&&p.type==='codex/entity-reference'&&Number(p.start)<s.end&&Number(p.end)>=s.start))throw Error('This phrase overlaps an existing Entity reference. Use reviewed occurrences to inspect the conflict.');const range=editor.textRanges.snapshot(s.nodeKey,s.start,s.end);api.replaceAndAnnotate!(range,label,'codex/entity-reference',e.id,{entityId:e.id,entityName:e.name},api.revision());restore(s,s.start+[...label].length);},
    reference:async(s,c,label)=>{const k=completionDocuments(editor,s.nodeKey),token=k.selection(editor.textRanges.snapshot(s.nodeKey,s.start,s.end));await k.createReference(token,c.data as DocumentTarget,label,()=>session.alive&&valid(s));restore(s,s.start+[...label].length);},
    command:(s,id)=>{
     if(id==='entity'||id==='link') {queueMicrotask(()=>open(s,id==='entity'?'entity':'document',''));return;}
     if(id==='date'){const now=new Date(),label=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;editor.commands.replaceInlineRange(s.nodeKey,s.start,s.end,label);restore(s,s.start+label.length);return;}
     if(!editor.commandRegistry.canExecute(id,{targetKey:s.nodeKey,args:undefined}))throw Error('Action unavailable');
     // Navigation/tool actions preserve the literal invocation; they do not rewrite prose.
     queueMicrotask(()=>{if(valid(s))void editor.commandRegistry.execute(id,{targetKey:s.nodeKey,args:undefined});});
    },dismiss:cancel,
   },source,kind,input);
   current=session;
   if(kind==='entity'){const watch=api.watchDocumentEntities(source.nodeKey,change=>{if(change.removed)cancel();else if(current===session)session.inventoryChanged();});stopInventory=()=>watch.dispose();}
   overlay=editor.overlays.open({ownerKey:source.nodeKey,viewType:'autocomplete',data:{session,advanced},anchor:{x:0,y:0},allowDocumentInput:true,explicitDismissal:true,retainEditorFocus:source.inline});
  };
  api.register.panel({type:'autocomplete',view:props=><CompletionPopup editor={editor} panel={props.panel} cancelled={()=>{if(current===(props.panel.data as any).session)cancel();}}/>});
  const binding=(id:string,key:string,mods:('Ctrl'|'Shift'|'Meta'|'Alt')[]=[])=>api.register.binding({id:`autocomplete.${id}`,name:`Autocomplete ${id}`,description:'Only inside an active completion session',category:'Autocomplete',tags:[],scope:'autocomplete',defaults:[keyboard(key,...mods)],handler:ctx=>ctx.run(`autocomplete.${id}`)});
  binding('next','ArrowDown');binding('previous','ArrowUp');binding('choose','Enter');binding('close','Escape');binding('review','a',['Ctrl']);
  const run=(id:string)=>{const s=current;if(!s)return false;if(id==='autocomplete.next')s.move(1);else if(id==='autocomplete.previous')s.move(-1);else if(id==='autocomplete.choose')void s.choose();else if(id==='autocomplete.close'){const source=s.source;cancel();restore(source,source.end);}else if(id==='autocomplete.review'){if(s.state.kind!=='entity')return false;advanced(s,true);}else return false;return true;};
  editor.completionInput={cancel,before(key,start,end,text,type){
   if(type!=='insertText'||text!==':'||end<=start||end-start>1000)return false;
   const n=editor.node(key);if((n?.payload.standoffProperties as any[]??[]).some(p=>!p.isDeleted&&/code|literal/.test(p.type??'')&&p.start<end&&p.end>=start))return false;
   try{const s=snapshot(key,start,end,false);open(s,'entity',s.literal+' : ');return true;}catch{return false;}
  },edited(key,caret,type){
   if(type!=='insertText'){cancel();return;}
   const n=editor.node(key);if(!n||editor.mounts.get(key)?.composing){cancel();return;}
   // Ordinary typing cannot begin an invocation. Read one new cell, not the suffix.
   if(!current){const last=editor.node(n.inlineContent[caret-1]);if(!['@','[','(','/'].includes(String(last?.payload.text??'')))return;}
   const token=invocation(caret,i=>{const c=editor.node(n.inlineContent[i]);return c?.viewType==='text-cell'?String(c.payload.text??''):undefined;});
   if(!token){cancel();return;}
   // Code/literal annotations are excluded; only this affected Block's metadata is read.
   if((n.payload.standoffProperties as any[]??[]).some(p=>!p.isDeleted&&/code|literal/.test(p.type??'')&&p.start<caret&&p.end>=token.start)){cancel();return;}
   const source=snapshot(key,token.start,token.end,true);
   if(current?.source.nodeKey===key&&current.source.start===token.start&&current.state.kind===token.kind&&!current.state.expanded)current.update(source,token.input);
   else open(source,token.kind,token.input);
  },key(event){
   const s=current;if(!s)return false;
   const target=event.target as Element,inside=!!target.closest?.('.autocomplete-workstation');
   if(event.isComposing){if(!inside)cancel();return false;}
   const resolved=editor.mounts.resolveEvent(event);
   if(!inside&&resolved?.nodeKey!==s.source.nodeKey){cancel();return false;}
   // Native field editing, Save, history, copying and Tab are never completion shortcuts.
   if((event.metaKey||event.ctrlKey)&&['s','z','y'].includes(event.key.toLowerCase())){if(!inside)cancel();return false;}
   if(event.key==='Tab'){if(!inside)cancel();return false;}
   if(inside&&target.closest('button,select')&&['Enter','ArrowUp','ArrowDown'].includes(event.key))return false;
   if(!inside&&event.ctrlKey&&event.key.toLowerCase()==='a')return false;
   return editor.bindings.dispatch(event,['autocomplete'],run);
  }};
  const explicit=(key:string)=>{const h=editor.mounts.get(key),r=h?.captureInlineSelection?.();if(!r||r.anchor===r.head)throw Error('Select a phrase, or type @ to open Autocomplete');const s=snapshot(key,Math.min(r.anchor,r.head),Math.max(r.anchor,r.head),false);open(s,'entity',s.literal);};
  api.register.command({id:'autocomplete.open',label:'Autocomplete selected text',canExecute:({targetKey})=>editor.node(targetKey)?.viewType==='standoff-editor-block',execute:({targetKey})=>explicit(targetKey)});
  api.register.binding({id:'autocomplete.open',name:'Autocomplete selected text',description:'Keep the selected phrase and edit an independent query',category:'Autocomplete',tags:[],scope:'editor/standoff',defaults:[chord(keyboard(';','Ctrl'),keyboard('a'))],handler:ctx=>ctx.run('autocomplete.open')});
  api.register.action({id:'autocomplete.open',slot:'document-actions',command:'autocomplete.open',label:'Autocomplete',title:'Autocomplete selected text',binding:'autocomplete.open'});
  const release=editor.repository.subscribeChanges(()=>{const s=current,source=s?.source;if(s)queueMicrotask(()=>{if(current===s&&s.source===source&&!valid(source!))cancel();});});
  scope.own(()=>{cancel();release();editor.completionInput=undefined;});
 }};
}
