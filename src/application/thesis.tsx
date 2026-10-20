import {unwrap} from 'solid-js/store';
import {onCleanup,onMount} from 'solid-js';
import {chord,keyboard,type CodexFeature} from '../feature-api';
import type {ReactiveEditor} from '../reactive-editor/editor';
import {captureTextSelection} from '../runtime/selection-snapshot';
import {resourceOwner,resourceSource} from '../block-tree/resource-identity';
import {linkedDefinitionOwner,resolveLinkedProperty} from '../block-tree/linked-annotations';
import {nativeDocumentSession} from '../persistence/native-session';
import {selectApplicationDocument} from './document-application-navigation';
import {transferSelection,passageHash,type Draft,type SourcePassage} from '../features/thesis/model';
import {ThesisView} from '../features/thesis/view';
import {thesisRequest} from '../features/thesis/service';
import type {JsonObject} from '../block-tree/types';

export function captureThesisDraft(editor:ReactiveEditor,targetKey:string):Draft {
 const menu=editor.overlays.overlays.find(o=>o.viewType==='context-menu'&&o.ownerKey===targetKey);
 let selection=captureTextSelection(document,editor.mounts,editor.crossText,editor.textRanges);
 if(!selection&&menu?.returnInlineSelection){const r=menu.returnInlineSelection,key=menu.returnFocusKey??targetKey;if(r.anchor!==r.head)selection={ranges:[editor.textRanges.snapshot(key,Math.min(r.anchor,r.head),Math.max(r.anchor,r.head))],head:{nodeKey:key,index:r.head}};}
 if(!selection)return {text:'',properties:[],warnings:[]};
 if(selection.ranges.length!==1)throw Error('Thesis currently accepts one text Block at a time. Select a passage within one Block; nothing has been copied.');
 editor.textRanges.validate(selection.ranges,'cell');
 const range=selection.ranges[0],node=editor.node(range.nodeKey)!,state=editor.repository.readState();
 const owner=resourceOwner(state,node.contentKey),identity=owner&&resourceSource(owner);
 if(!identity||identity.scope!=='document')throw Error('Select a passage in an Ink Document so its source can be identified.');
 const cells=node.inlineContent.map(k=>({type:editor.node(k)!.viewType,text:editor.node(k)!.payload.text as string}));
 const draft=transferSelection(cells,structuredClone(unwrap((node.payload.standoffProperties??[]) as JsonObject[])),range.start,range.end,p=>linkedDefinitionOwner(state,p,node.contentKey)?resolveLinkedProperty(state,p,node.contentKey):undefined);
 const proof=nativeDocumentSession(editor).knowledgeEvidence(identity.resourceId);
 draft.source={version:1,vault:'',vaultGuid:'',resourceGuid:identity.resourceId,blockGuid:String(node.payload.id),start:range.start,end:range.end,coordinate:'cell',text:draft.text,blockText:cells.map(c=>c.text).join(''),capturedUtc:new Date().toISOString(),sourceRevision:range.version,savedHash:proof.byteHash,location:proof.location,cavernId:editor.readAssetContext().cavernId};
 return draft;
}
/** Resolve identity explicitly on navigation. The stored path is only a fallback hint. */
export async function openThesisSource(editor:ReactiveEditor,source:SourcePassage,current:()=>boolean):Promise<string> {
 const focusValid=editor.windowManager?.lifecycle.ticket();
 const alive=current; current=()=>alive()&&focusValid?.()!==false;
 const native=nativeDocumentSession(editor),find=()=>{const matches=Object.values(editor.repository.readState().contents).filter(c=>c.viewType==='document-block'&&String((c.payload.metadata as any)?.documentId??c.payload.id)===source.resourceGuid);if(matches.length>1)throw Error('Source Resource identity is ambiguous.');return matches[0];};
 let owner=find();
 if(!owner){
  const listing=await native.discoverVault(source.vault);if(!current())throw Error('Thesis navigation canceled');
  const candidates=listing.documents.filter((d:any)=>d.resourceId===source.resourceGuid);
  if(candidates.length!==1)throw Error(candidates.length?'Source identity is ambiguous.':listing.complete===false?'Source availability is unverified because Vault discovery is incomplete.':'Source document is missing from the Vault.');
  const id=await native.openCompatible(candidates[0].location,source.vault);if(!current())throw Error('Thesis navigation canceled');
  if(id!==source.resourceGuid)throw Error('Source identity changed; the captured range was not selected.');owner=find();
 }
 if(!owner)throw Error('Source Document unavailable.');
 const applications=[...editor.projections.values()].flatMap(v=>Object.values(v.state.nodes)).filter(n=>n.viewType==='flint-application-block');
 const mountedSource=[...editor.projections.values()].some(v=>Object.values(v.state.nodes).some(n=>n.payload.id===source.blockGuid&&editor.mounts.get(n.key)));
 if(!applications.length&&!mountedSource){const root=[...editor.projections.values()][0]?.state.rootKey;if(root){const open=()=>editor.commandRegistry.execute('flint.open',{targetKey:root,args:undefined});await (editor.windowManager ? editor.windowManager.withoutActivation(open) : open());}await new Promise(r=>setTimeout(r,0));}
 if(!current())throw Error('Thesis navigation canceled');
 for(const view of editor.projections.values())for(const n of Object.values(view.state.nodes))if(n.viewType==='flint-application-block'&&selectApplicationDocument(editor,n.key,source.resourceGuid)){const win=editor.blockQueries.ancestors(n.key).find(a=>a.viewType==='window-block');if(win)editor.viewVisibility.set(win.placementKey,false);break;}
 await new Promise(r=>setTimeout(r,0));if(!current())throw Error('Thesis navigation canceled');
 const state=editor.repository.readState(),matches=[...editor.projections.values()].flatMap(v=>Object.values(v.state.nodes)).filter(n=>n.payload.id===source.blockGuid&&editor.mounts.get(n.key)&&resourceOwner(state,n.contentKey)?.key===owner!.key);
 if(!matches.length)return 'Source Document opened, but the original Block is missing or not mounted. The captured range may be stale.';
 const node=matches[0],revision=state.contents[node.contentKey].inlineRevision,text=node.inlineContent.map(k=>editor.node(k)?.viewType==='text-cell'?editor.node(k)!.payload.text:'\ufffc').join(''),exact=source.blockHash?await passageHash(text)===source.blockHash:text===source.blockText;
 if(!current())throw Error('Thesis navigation canceled');
 editor.mounts.get(node.key)?.root.scrollIntoView?.({block:'center'});editor.focus.request(node.key,{reason:'thesis-source'});
 const verified=exact&&editor.repository.readState().contents[node.contentKey]?.inlineRevision===revision&&[...text].slice(source.start,source.end).join('')===source.text;
 const managedOwner=editor.windowManager?.ownerForNode(node.key);
 const win=managedOwner ? editor.node(managedOwner) : editor.blockQueries.ancestors(node.key).find(n=>['window-block','document-window-block'].includes(n.viewType));
 if(win){
  if(editor.windowManager) editor.windowManager.raisePlacement(win.placementKey);
  else {
   const metadata=unwrap((win.payload.metadata??{}) as JsonObject),zIndex=Math.max(0,...Object.values(editor.repository.readState().contents).filter(c=>c.viewType==='window-block').map(c=>Number((c.payload.metadata as any)?.zIndex)||0))+1;
   editor.commands.setPayloadField(win.key,'metadata',{...metadata,minimized:false,zIndex},'Open Proposition source');
  }
 }
 if(verified)editor.mounts.get(node.key)?.restoreInlineSelection?.({anchor:source.start,head:source.end});
 return verified?'Loaded source passage located; current Block text matches the captured text.':'Source Block opened. Its text has changed; the captured range may be stale and was not selected.';
}
export function createThesisFeature(editor:ReactiveEditor):CodexFeature {
 return {id:'thesis',activate(scope){
  const drafts=new Map<string,Draft>();scope.own(()=>drafts.clear());
  const Instance=(props:{nodeKey:string})=>{
   const app=editor.node(props.nodeKey)!,id=String(app.payload.id),initial=drafts.get(id);drafts.delete(id);
   const windowKey=editor.blockQueries.ancestors(props.nodeKey).find(n=>n.viewType==='window-block')?.key;
   let root!:HTMLDivElement;
   onMount(()=>onCleanup(editor.mounts.register(props.nodeKey,{root,focusElement:root,inputPolicy:'opaque-widget',focus:()=>root.focus()})));
   return <div ref={root} tabIndex={-1} class="thesis-host"><ThesisView host={editor} initial={initial} windowKey={windowKey} close={()=>{if(windowKey)editor.closeView(windowKey);}}/></div>;
  };
  scope.own(editor.registry.register({type:'thesis-application-block',capabilities:['opaque-widget'],view:Instance},scope.owner));
  const open=(targetKey:string,draft?:Draft)=>{
   const state=editor.repository.readState(),root=state.rootPlacementKey,host=state.contents[state.placements[root].contentKey];
   if(host.viewType!=='workspace-block')throw Error('Open Thesis from the Mutable workspace.');
   const desktop=host.children.find(k=>['image-background-block','canvas-background-block','video-background-block','youtube-video-background-block'].includes(state.contents[state.placements[k].contentKey].viewType))??root;
   const id=crypto.randomUUID();if(draft)drafts.set(id,draft);
   // Legacy hosts retain their renderer floor; managed hosts use session ordering.
   const zIndex=editor.windowManager?.launchMetadata().zIndex ?? Math.max(101,...Object.values(state.contents).map(c=>Number((c.payload.metadata as any)?.zIndex)||0))+1;
   const placement=editor.commands.insert({id:crypto.randomUUID(),type:'window-block',metadata:{title:'Thesis',position:{x:55,y:50},size:{w:draft?740:1040,h:680},zIndex},children:[{id,type:'thesis-application-block'}]},{kind:'at',parentKey:desktop,index:0});
   editor.windowManager?.activatePlacement(placement);
  };
  const available=({targetKey}:{targetKey:string})=>!!editor.node(targetKey)&&editor.repository.state.contents[editor.repository.state.placements[editor.repository.state.rootPlacementKey].contentKey].viewType==='workspace-block';
  scope.own(editor.commandRegistry.register({id:'thesis.open',label:'Open Thesis',canExecute:available,execute:({targetKey})=>open(targetKey)},scope.owner));
  scope.own(editor.commandRegistry.register({id:'thesis.createProposition',label:'Create Proposition',canExecute:available,execute:({targetKey})=>{try{open(targetKey,captureThesisDraft(editor,targetKey));}catch(e){window.alert(String(e));}}},scope.owner));
  for(const bindingScope of ['editor','cross-text'])scope.own(editor.bindings.register({id:bindingScope==='editor'?'thesis.createProposition':'cross.thesisCreateProposition',name:'Create Proposition',description:'Copy the selected Ink passage, or create an empty draft. If the host captures Cmd/Ctrl+Shift+P, use Ctrl+;, then P or the context menu.',category:'Thesis',scope:bindingScope,tags:['thesis','proposition'],defaults:[keyboard('p','Meta','Shift'),keyboard('p','Ctrl','Shift'),chord(keyboard(';','Ctrl'),keyboard('p'))],handler:context=>context.run('thesis.createProposition')},scope.owner));
  scope.own(editor.featureActions.register({id:'thesis.create',slot:'document-actions',label:'Proposition',title:'Create Proposition',binding:'thesis.createProposition',command:'thesis.createProposition'},scope.owner));
 }};
}
