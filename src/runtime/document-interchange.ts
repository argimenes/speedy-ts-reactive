import { sourceFormat } from '../interchange/source-block';
import { diagnostic } from '../interchange/diagnostics';
import { createSignal } from 'solid-js';
import type { ReactiveEditor } from '../reactive-editor/editor';
import type { Destination } from '../block-tree/types';
import type { CrossTextSegment } from '../block-tree/cross-text-edit';
import { resourceOwner, resourceSource } from '../block-tree/resource-identity';
import { serializeSelection, fragmentText } from '../interchange/serializer';
import { documentFragment, joinFragments } from '../interchange/document-import';
import { conversionSource } from '../interchange/conversion';
import { checkFiles, type SuppliedFile } from '../interchange/file-input';
import { safeFilename, type ImportFormat, type ExportFormat } from '../interchange/formats';
import type { MutableFragment, InterchangeScope } from '../interchange/fragment';
import type { InterchangeDiagnostic } from '../interchange/diagnostics';
import { resolveClipboardImages } from '../interchange/clipboard-images';
import { nativeDocumentSession } from '../persistence/native-session';
import { captureNative } from '../persistence/native-resource';
import { resourceToRepository } from '../history/durable-core';
import { runInterchange } from './interchange-worker';
import type { AssetLease } from './managed-assets';
export interface ImportHost { current():boolean; open(id:string):void }
interface Ticket { revision:number; session?:string; scope:InterchangeScope; viewId?:string; segments?:CrossTextSegment[]; destination?:Destination; current():boolean }
type Question = {title:string;details:string[];urls?:string[]};
/** Explicit actions only: no repository, selection, layout or typing subscriptions. */
export class DocumentInterchange {
 private alive=true;
 private controller?:AbortController;
 private lease?:AssetLease;
 private committed=false;
 private activeTicket?:Ticket;
 private pickerView?:string;
 private status=createSignal(''); readonly message=this.status[0];
 private busySignal=createSignal(false); readonly busy=this.busySignal[0];
 private questionSignal=createSignal<Question>(); readonly question=this.questionSignal[0];
 private answer?: (value:string[]|undefined)=>void;
 private pickerSignal=createSignal<{title:string;embed?:boolean;run:(files:SuppliedFile[],format?:ImportFormat)=>void}>();readonly picker=this.pickerSignal[0];
 constructor(private editor:ReactiveEditor){}
 respond(value:string[]|undefined){if(value===undefined)this.controller?.abort();this.answer?.(value);}
 closePicker(){this.pickerSignal[1](undefined);this.pickerView=undefined;}
 cancel(){this.controller?.abort();this.respond(undefined);this.closePicker();}
 dismiss(){if(this.busy())this.cancel();this.status[1]('');}
 private async ask(question:Question){this.questionSignal[1](question);try{return await new Promise<string[]|undefined>(resolve=>{this.answer=resolve;});}finally{this.answer=undefined;this.questionSignal[1](undefined);}}
 private async confirm(diagnostics:InterchangeDiagnostic[]) {const details=[...new Set(diagnostics.filter(d=>d.loss).map(d=>`${d.sourceName?d.sourceName+': ':''}${d.detail}`))];if(details.length&&(await this.ask({title:'Confirm conversion losses',details:details.length>50?[...details.slice(0,50),`${details.length-50} further unsupported semantics are omitted from this projection.`]:details}))===undefined)throw Error('Operation cancelled.');}
 private base(current:()=>boolean=()=>true):Ticket {const context=this.editor.readAssetContext();return {revision:this.editor.repository.state.revision,session:context.session,scope:{...(context.cavernId?{cavernId:context.cavernId}:{})},current};}
 private valid(t:Ticket){const context=this.editor.readAssetContext();return this.alive&&!this.controller?.signal.aborted&&t.current()&&t.revision===this.editor.repository.state.revision&&t.session===context.session&&t.scope.cavernId===context.cavernId&&(!t.viewId||this.editor.projections.has(t.viewId));}
 closeView(viewId:string){if(this.activeTicket?.viewId===viewId||this.pickerView===viewId){this.cancel();this.status[1]('The view closed; operation cancelled.');}}
 cancelUnavailable(){if(this.activeTicket&&!this.activeTicket.current())this.cancel();}
 private check(t:Ticket){this.activeTicket=t;if(!this.valid(t))throw Error('The destination, Document or Cavern changed. Nothing further was inserted.');}
 private async task(run:(signal:AbortSignal)=>Promise<void>){
  if(!this.alive||!this.editor.features.documentInterchange)return;
  if(this.busy()){this.status[1]('Finish or cancel the current interchange operation first.');return;}
  this.busySignal[1](true);this.controller=new AbortController();this.committed=false;this.lease=undefined;this.status[1]('Preparing interchange…');
  try{await run(this.controller.signal);}catch(e){this.status[1](e instanceof Error?e.message:String(e));}
  finally{if(this.lease)await this.editor.assets.action(this.lease,this.committed?'finish':'abort').catch(()=>{});this.lease=undefined;this.controller=undefined;this.activeTicket=undefined;this.busySignal[1](false);}
 }
 private selection(key:string):Ticket {
  const node=this.editor.node(key),mount=this.editor.mounts.get(key);if(!node||!mount||mount.composing)throw Error('Choose a mounted text selection first.');
  const menu=this.editor.overlays.overlays.find(o=>o.viewType==='context-menu'&&o.ownerKey===key);
  const local=menu?.returnInlineSelection??mount.captureInlineSelection?.();
  if(menu)this.editor.overlays.close(menu.key,false);
  mount.focus();if(local)mount.restoreInlineSelection?.(local);
  const t=this.base();t.viewId=node.viewId;
  const owner=resourceOwner(this.editor.repository.readState(),node.contentKey);const resourceId=owner?resourceSource(owner)?.resourceId:undefined;if(resourceId)t.scope.resourceId=resourceId;
  if(this.editor.selections.sets[key]?.items.length>1)throw Error('Choose one contiguous selection.');
  const cross=this.editor.crossText.range();
  if(cross)t.segments=this.editor.crossText.resolve(cross.anchor,cross.head).map(s=>({placementKey:this.editor.node(s.nodeKey)!.placementKey,start:s.start,end:s.end}));
  else if(node.viewType==='standoff-editor-block'&&local)t.segments=[{placementKey:node.placementKey,start:Math.min(local.anchor,local.head),end:Math.max(local.anchor,local.head)}];
  else throw Error('Choose a text caret or selection first.');
  const signature=JSON.stringify(cross??local);
  t.current=()=>{if(!this.editor.node(key)||this.editor.mounts.get(key)?.composing)return false;const active=this.editor.crossText.range();if(cross||active)return JSON.stringify(active)===signature;const handle=this.editor.mounts.get(key),focused=this.editor.mounts.resolveElement(document.activeElement);if(focused&&focused.nodeKey!==key)return false;return !handle?.root.contains(document.activeElement)||JSON.stringify(handle.captureInlineSelection?.())===signature;};
  return t;
 }
 private async admit(fragment:MutableFragment,files:SuppliedFile[],t:Ticket,signal:AbortSignal){
  this.check(t);
  if(!fragment.embeds.length)return {fragment,admitted:[] as [string,string][]};
  const result=await resolveClipboardImages({fragment,files,assets:this.editor.assets,cavernId:t.scope.cavernId,signal,valid:()=>this.valid(t),lease:value=>{this.lease=value;},choose:urls=>this.ask({title:'External images',details:['Download only explicitly selected remote images, or keep inert placeholders. Relative resources are never read automatically.'],urls})});
  this.check(t);return result;
 }
 pickNew(host:ImportHost){if(!this.editor.features.documentInterchange)return;this.pickerView=undefined;this.pickerSignal[1]({title:'Import external files as new Ink documents',run:(files,format)=>{this.closePicker();void this.importNew(files,host,format);}});}
 pickInsert(key:string){try{const t=this.selection(key);this.pickerView=t.viewId;this.pickerSignal[1]({title:'Insert external files at the captured selection',run:(files,format)=>{this.closePicker();void this.insertFiles(files,t,format);}});}catch(e){this.status[1](String(e));}}
 pickEmbed(key:string){
  if(!this.editor.features.documentInterchange)return;
  try{const node=this.editor.node(key);if(!node||this.editor.mounts.get(key)?.composing)throw Error('Finish editing the source before embedding.');
   const t=this.base(()=>!!this.editor.node(key)&&!this.editor.mounts.get(key)?.composing);t.viewId=node.viewId;
   t.destination=node.viewType==='document-block'?{kind:'at',parentKey:node.placementKey,index:node.children.length}:{kind:'after',anchorKey:node.placementKey};
   this.pickerView=t.viewId;this.pickerSignal[1]({title:'Embed HTML or Markdown source as a Block',embed:true,run:(files,format)=>{this.closePicker();void this.task(async signal=>{
    this.check(t);const fragments=await runInterchange({kind:'embed',files,format},signal);this.check(t);
    await this.commit(joinFragments(fragments),[],t,signal,'import');this.status[1]('Embedded an independent source copy. Save the Ink document to retain it. The external file is unchanged.');
   });}});
  }catch(e){this.status[1](String(e));}
 }
 async convertSourceBlock(key:string){return this.task(async signal=>{
  const node=this.editor.node(key),mount=this.editor.mounts.get(key);if(!node||mount?.composing)throw Error('Finish source editing before conversion.');
  const state=this.editor.repository.readState(),content=state.contents[node.contentKey],placement=state.placements[node.placementKey];
  const format=sourceFormat(content.viewType,content.payload);
  if(placement.kind!=='owned'||placement.externalReference||placement.resolvedReference||Object.values(state.placements).filter(p=>p.contentKey===content.key).length!==1)throw Error('Shared or referenced source Blocks must be detached before conversion.');
  if(content.children.length||Object.keys(content.ownedRelations).length||Object.keys(content.opaqueRelations).length)throw Error('Move child and related Blocks outside the source Block before conversion.');
  const parent=Object.values(state.contents).find(c=>c.children.includes(placement.key));if(!parent)throw Error('Only a whole source Block in an ordinary child slot can be converted.');
  const t=this.base(()=>!!this.editor.node(key)&&!this.editor.mounts.get(key)?.composing);t.viewId=node.viewId;
  const owner=resourceOwner(state,node.contentKey);if(owner)t.scope.resourceId=resourceSource(owner)?.resourceId;
  this.check(t);const converted=await runInterchange({kind:'convert',source:String(content.payload.text),format},signal);this.check(t);
  const losses=[diagnostic('source-conversion','The source Block becomes native Ink. Source syntax, source metadata and any Block or inactive annotations are replaced; Undo restores the original Block exactly.'),...converted.diagnostics];
  await this.confirm(losses);this.check(t);const admitted=await this.admit(converted.fragment,[],t,signal);
  const native=await runInterchange({kind:'materialize',fragment:admitted.fragment,scope:t.scope,assets:admitted.admitted},signal);this.check(t);
  let roots:string[]=[];
  this.editor.commands.transaction('Convert source Block to Mutable Ink',()=>{
   roots=this.editor.commands.insertFragment(native,{kind:'before',anchorKey:placement.key});this.editor.commands.remove(placement.key);
  },{commandId:'interchange.convert-source-block',subjects:[]});
  this.committed=true;this.status[1]('Converted the whole source Block. Undo restores the original source, identity and metadata.');
  queueMicrotask(()=>{if(!this.alive)return;const next=this.editor.nodeForPlacementInView(roots[0],node.viewId);if(next)this.editor.focus.request(next.key,{reason:'context-menu',caret:'start'});});
 });}
 async importNew(files:SuppliedFile[],host:ImportHost,format?:ImportFormat){return this.task(async signal=>{
  if(!this.editor.features.nativeDocumentPersistence)throw Error('Native document persistence is required for new Ink imports.');checkFiles(files);
  const ticket=this.base(host.current),outcomes:string[]=[];
  for(const file of files){
   this.check(ticket);this.committed=false;this.lease=undefined;
   try{
    const [prepared]=await runInterchange({kind:'files',files:[file],format},signal);this.check(ticket);await this.confirm(prepared.diagnostics);this.check(ticket);
    const admitted=await this.admit(prepared.fragment,[file],ticket,signal);
    const wrapped=documentFragment(admitted.fragment,prepared.title,prepared.filename);
    const root=wrapped.blocks.at(-1)!; (root.data.metadata as any).interchange.provenance=prepared.provenance;
    const native=await runInterchange({kind:'materialize',fragment:wrapped,scope:ticket.scope,assets:admitted.admitted},signal);this.check(ticket);
    const state=this.editor.repository.readState(),workspace=state.contents[state.placements[state.rootPlacementKey].contentKey];
    const banks=workspace.children.filter(k=>state.contents[state.placements[k].contentKey].viewType==='workspace-object-bank-block');if(banks.length!==1)throw Error('A workspace with one object bank is required.');
    const id=String(native.state.contents[native.state.placements[native.roots[0]].contentKey].payload.id);
    this.editor.commands.insertFragment(native,{kind:'at',parentKey:banks[0],index:state.contents[state.placements[banks[0]].contentKey].children.length},{commandId:'interchange.import-new',subjects:[]});this.committed=true;
    nativeDocumentSession(this.editor).trackCandidate(id);host.open(id);outcomes.push(`${file.name}: imported as an unsaved Ink copy.`);
   }catch(e){outcomes.push(`${file.name}: ${e instanceof Error?e.message:String(e)}`);if(signal.aborted||!this.valid(ticket)&&!this.committed)throw Error(outcomes.join('\n'));}
   finally{if(this.lease)await this.editor.assets.action(this.lease,this.committed?'finish':'abort').catch(()=>{});this.lease=undefined;}
   ticket.revision=this.editor.repository.state.revision;this.status[1](outcomes.join('\n'));
  }
 });}
 async insertFiles(files:SuppliedFile[],ticket:Ticket,format?:ImportFormat){return this.task(async signal=>{
  this.check(ticket);const prepared=await runInterchange({kind:'files',files,format},signal);this.check(ticket);await this.confirm(prepared.flatMap(p=>p.diagnostics));this.check(ticket);
  const admitted=await this.admit(joinFragments(prepared.map(p=>p.fragment)),files,ticket,signal);
  await this.commit(admitted.fragment,admitted.admitted,ticket,signal,'import');this.status[1]('Inserted files in supplied order. Undo restores the previous content.');
 });}
 async convert(key:string,format:'html'|'markdown') {let ticket:Ticket;try{ticket=this.selection(key);}catch(e){this.status[1](String(e));return;}
  return this.task(async signal=>{this.check(ticket);const segments=ticket.segments!;if(segments.every(s=>s.start===s.end))throw Error('Select literal source text to convert.');
   const source=this.editor.repository.readState(),affected=conversionSource(source,segments);
   const fragment=serializeSelection(source,segments,ticket.scope),text=fragmentText(fragment);
   const converted=await runInterchange({kind:'convert',source:text,format},signal);this.check(ticket);await this.confirm([...affected.diagnostics,...converted.diagnostics]);this.check(ticket);
   // Only ordinary paragraph slices merge with surviving literal text. Headings,
   // lists and tables remain independent Blocks.
   for(const r of converted.fragment.roots){const p=converted.fragment.placements.find(p=>p.localId===r.placement)!;const b=p.target.kind==='local'?converted.fragment.blocks.find(b=>b.localId===(p.target as {id:string}).id):undefined;if(b?.type==='standoff-editor-block'&&!b.blockProperties.length&&!Object.keys(b.data.metadata as object??{}).length){r.openStart=true;r.openEnd=true;}}
   const admitted=await this.admit(converted.fragment,[],ticket,signal);await this.commit(admitted.fragment,admitted.admitted,ticket,signal,'convert');this.status[1]('Converted source to Mutable Ink. Undo restores source and annotations.');
  });
 }
 private async commit(fragment:MutableFragment,assets:[string,string][],t:Ticket,signal:AbortSignal,operation:'import'|'convert'){
  const native=await runInterchange({kind:'materialize',fragment,scope:t.scope,assets},signal);this.check(t);
  if(t.destination)this.editor.commands.insertFragment(native,t.destination,{commandId:'interchange.insert',subjects:[]});
  else {const [result]=this.editor.commands.insertMutableText([{segments:t.segments!,fragment:native,slices:fragment.roots}],false,operation);this.editor.crossText.clear();const node=this.editor.nodeForPlacementInView(result.placementKey,t.viewId!);if(node){this.editor.selections.setPrimary(node.key,node.contentKey,node.viewId,result.caret);queueMicrotask(()=>{if(this.alive){const mount=this.editor.mounts.get(node.key);mount?.focus();mount?.restoreInlineSelection?.({anchor:result.caret,head:result.caret});}});}}
  this.committed=true;
 }
 async exportDocument(id:string,format:ExportFormat,current:()=>boolean){return this.task(async signal=>{
  const t=this.base(current),snapshot=captureNative(this.editor.repository.readState(),id),state=resourceToRepository(snapshot);
  const title=String((state.contents[state.placements[state.rootPlacementKey].contentKey].payload.metadata as {title?:string})?.title??'Document');
  const fragment=serializeSelection(state,[{placementKey:state.rootPlacementKey}],{...t.scope,resourceId:id});
  const result=await runInterchange({kind:'export',fragment,format,title,document:true},signal);await this.confirm(result.diagnostics);this.check(t);
  const url=URL.createObjectURL(new Blob([result.text],{type:result.mediaType+';charset=utf-8'})),link=document.createElement('a');link.href=url;link.download=`${safeFilename(title)}.${result.extension}`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);this.status[1]('Export downloaded. The Ink document and its save destination are unchanged.');
 });}
 async copyAs(key:string,format:'html'|'markdown'){let t:Ticket;try{t=this.selection(key);}catch(e){this.status[1](String(e));return;}
  return this.task(async signal=>{this.check(t);const fragment=serializeSelection(this.editor.repository.readState(),t.segments!,t.scope);if(t.segments!.every(s=>s.start===s.end))throw Error('Select text to copy.');
   const result=await runInterchange({kind:'export',fragment,format},signal);await this.confirm(result.diagnostics);this.check(t);
   const plain=format==='html'?await runInterchange({kind:'export',fragment,format:'text'},signal):result;this.check(t);
   const reps:Record<string,string>=format==='html'?{'text/html':result.text,'text/plain':plain.text}:{'text/markdown':result.text,'text/plain':result.text};
   const mount=this.editor.mounts.get(key);mount?.focus();if(t.segments?.length===1){const s=t.segments[0];mount?.restoreInlineSelection?.({anchor:s.start,head:s.end});}
   await this.editor.clipboard.copyProjection(reps,()=>this.alive&&t.current()&&t.revision===this.editor.repository.state.revision&&t.session===this.editor.readAssetContext().session&&t.scope.cavernId===this.editor.readAssetContext().cavernId,event=>this.editor.mounts.resolveEvent(event)?.nodeKey===key||!!(this.editor.crossText.range()&&event.target instanceof Element&&event.target.matches('[data-cross-text-input]')));
   this.status[1]('Copy projection prepared. See clipboard status for acknowledgement or the keyboard fallback.');
  });
 }
 /** Drop at an explicit Block gap. It never guesses a pixel-to-character position. */
 dropFiles(files:SuppliedFile[],key:string,current:()=>boolean){try{const node=this.editor.node(key);if(!node)throw Error('Drop over a Document Block.');const t=this.base(current);t.viewId=node.viewId;t.destination={kind:'after',anchorKey:node.placementKey};return this.insertFiles(files,t);}catch(e){this.status[1](String(e));}}
 dispose(){this.alive=false;this.cancel();this.status[1]('');}
}
