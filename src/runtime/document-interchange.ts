import { nativeBytes } from '../persistence/native-resource';
import { nativeInventory } from '../interchange/package/format';
import { hash, PACKAGE_LIMITS } from '../interchange/package/archive';
import type { PackageData } from '../interchange/package/data';
import { assetKey } from '../interchange/managed-asset';
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
type Question = {title:string;details:string[];urls?:string[];options?:string[]};
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
 private pickerSignal=createSignal<{title:string;embed?:boolean;package?:boolean;link?:boolean;sourceFormat?:'html'|'markdown';run:(files:SuppliedFile[],format?:ImportFormat)=>void}>();readonly picker=this.pickerSignal[0];
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
 pickEmbed(key:string,link=false){
  if(!this.editor.features.documentInterchange)return;
  try{const node=this.editor.node(key);if(!node||this.editor.mounts.get(key)?.composing)throw Error('Finish editing the source before embedding.');
   const t=this.base(()=>!!this.editor.node(key)&&!this.editor.mounts.get(key)?.composing);t.viewId=node.viewId;
   t.destination=node.viewType==='document-block'?{kind:'at',parentKey:node.placementKey,index:node.children.length}:{kind:'after',anchorKey:node.placementKey};
   this.pickerView=t.viewId;this.pickerSignal[1]({title:link?'Link to a local HTML or Markdown source':'Embed HTML or Markdown source as a Block',embed:true,link,run:(files,format)=>{this.closePicker();void this.task(async signal=>{
    this.check(t);const fragments=await runInterchange({kind:'embed',files,format},signal);this.check(t);
    if(link){if(fragments.length!==1)throw Error('Choose one local source file.');const b=fragments[0].blocks[0],meta=b.data.metadata as any;meta.sourceLink={version:1,linkId:crypto.randomUUID(),filename:meta.provenance.filename,format:meta.provenance.format??sourceFormat(b.type,b.data),byteHash:meta.provenance.byteHash,textHash:await hash(new TextEncoder().encode(String(b.data.text)))};}
    await this.commit(joinFragments(fragments),[],t,signal,'import');this.status[1](link?'Linked a local source snapshot. Refresh requires explicit file reselection. Save Ink to retain the link.':'Embedded an independent source copy. Save the Ink document to retain it. The external file is unchanged.');
   });}});
  }catch(e){this.status[1](String(e));}
 }
 refreshSource(key:string){
  if(!this.editor.features.documentInterchange)return;
  try{const node=this.editor.node(key);if(!node||this.editor.mounts.get(key)?.composing)throw Error('Finish source editing before refresh.');
   const t=this.base(()=>!!this.editor.node(key)&&!this.editor.mounts.get(key)?.composing);t.viewId=node.viewId;this.pickerView=node.viewId;
   this.pickerSignal[1]({title:'Reconnect local source for explicit refresh',embed:true,link:true,sourceFormat:sourceFormat(node.viewType,node.payload),run:files=>{this.closePicker();void this.task(async signal=>{
    this.check(t);if(files.length!==1)throw Error('Choose one source file.');const original=this.editor.node(key)!,meta=structuredClone(this.editor.repository.readState().contents[original.contentKey].payload.metadata as any??{}),baseline=meta.sourceLink;
    if(baseline?.version!==1||typeof baseline.byteHash!=='string'||typeof baseline.textHash!=='string')throw Error('This Block has no valid linked source baseline.');
    const [f]=await runInterchange({kind:'embed',files,format:sourceFormat(original.viewType,original.payload)},signal);this.check(t);const b=f.blocks[0],incoming=b.data.metadata as any;
    if(await this.ask({title:'Confirm source reconnection',details:[`Previous source: ${baseline.filename}. Selected file: ${files[0].name}. A filename does not prove source identity. Continue only to explicitly rebind this link to the selected file.`]})===undefined)throw Error('Refresh cancelled.');this.check(t);
    const current=String(original.payload.text),localHash=await hash(new TextEncoder().encode(current));this.check(t);
    if(incoming.provenance.byteHash===baseline.byteHash){if(incoming.provenance.filename!==baseline.filename){this.editor.commands.setPayloadField(key,'metadata',{...meta,provenance:incoming.provenance,sourceLink:{...baseline,filename:incoming.provenance.filename}},'Reconnect identical source');this.committed=true;}this.status[1]('Source bytes are unchanged; local edits were retained.');return;}
    const conflict=localHash!==baseline.textHash;
    const choice=await this.ask({title:conflict?'Source and local text have changed':'Review source refresh',details:[`Local text (${current.length} characters):\n${current.slice(0,600)}${current.length>600?'…':''}`,`Selected source (${String(b.data.text).length} characters):\n${String(b.data.text).slice(0,600)}${String(b.data.text).length>600?'…':''}`,conflict?'Choose exactly one action; Cancel leaves both unchanged.':'Continue replaces this source snapshot. Undo restores text and the accepted baseline together.'],...(conflict?{options:['Replace this source Block','Insert as a separate linked Block']}: {})});
    if(choice===undefined)throw Error('Refresh cancelled.');if(conflict&&choice.length!==1)throw Error('Choose exactly one conflict action.');this.check(t);
    const nextLink={version:1,linkId:baseline.linkId,filename:incoming.provenance.filename,format:baseline.format,byteHash:incoming.provenance.byteHash,textHash:await hash(new TextEncoder().encode(String(b.data.text)))};this.check(t);
    if(choice.includes('Insert as a separate linked Block')){incoming.sourceLink={...nextLink,linkId:crypto.randomUUID()};t.destination={kind:'after',anchorKey:original.placementKey};await this.commit(f,[],t,signal,'import');}
    else {this.editor.commands.transaction('Refresh linked source',()=>{this.editor.commands.setPayloadField(key,'text',b.data.text);this.editor.commands.setPayloadField(key,'metadata',{...meta,provenance:incoming.provenance,sourceLink:nextLink});},{commandId:'interchange.refresh-source',subjects:[]});this.committed=true;}
    this.status[1]('Refreshed local source snapshot. Save Ink explicitly; the external file is unchanged.');
   });}});
  }catch(error){this.status[1](String(error));}
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
 private download(value:BlobPart,name:string,type:string){const url=URL.createObjectURL(new Blob([value],{type})),link=document.createElement('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 async exportPortable(id:string,format:'html'|'markdown',standalone:boolean,current:()=>boolean){return this.task(async signal=>{
  const t=this.base(current),snapshot=captureNative(this.editor.repository.readState(),id),state=resourceToRepository(snapshot),inventory=nativeInventory(snapshot);this.check(t);
  const assets=[];for(const a of inventory.assets){assets.push(await this.editor.assets.original(a,signal));this.check(t);}
  const fragment=serializeSelection(state,[{placementKey:state.rootPlacementKey}],t.scope),title=String((state.contents[state.placements[state.rootPlacementKey].contentKey].payload.metadata as any)?.title??'Document');
  const result=await runInterchange({kind:'portable-export',fragment,assets,format,standalone,title},signal);this.check(t);await this.confirm(result.diagnostics);this.check(t);
  this.download(new Uint8Array(result.bytes),`${safeFilename(title)}.${result.extension}`,result.mediaType);this.status[1]('Portable projection downloaded with verified original images. The Ink document is unchanged.');
 });}
 async exportPackage(id:string,vault:string|undefined,current:()=>boolean){return this.task(async signal=>{
  const t=this.base(current),snapshot=captureNative(this.editor.repository.readState(),id),native=nativeBytes(snapshot),inventory=nativeInventory(snapshot);
  this.check(t);
  const chosen=await this.ask({title:'Choose package database boundary',details:['The archive retains the exact native document, including authored metadata which may be private, and referenced original images. Referenced Entity, Time, Claim (with participants/qualifiers) and curated/imported alias rows include full authored fields, descriptions, JSON attributes and actor identifiers. Optional related rows may contain private information. Nothing is followed through backlinks.'],options:['Relationships (one hop)','Claims and participants','Claim evidence (requires claims)','Actor records','Observed/recovered aliases']});if(!chosen)throw Error('Export cancelled.');this.check(t);
  let context:{data:PackageData;schema:unknown};
  if(vault){
   const response=await fetch('/api/sqlite/knowledge/package-data',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({vault,request:{entities:inventory.entities,claimsById:inventory.claims,documentHash:await hash(native),relationships:chosen.includes('Relationships (one hop)'),claims:chosen.includes('Claims and participants'),evidence:chosen.includes('Claim evidence (requires claims)'),actors:chosen.includes('Actor records'),observedAliases:chosen.includes('Observed/recovered aliases')}}),signal});
   if(!response.body)throw Error('Package database reader unavailable');const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
   try{for(;;){const p=await reader.read();if(p.done)break;if((size+=p.value.length)>10*1024*1024)throw Error('Package database response limit');chunks.push(p.value);}}finally{await reader.cancel();}
   const all=new Uint8Array(size);let at=0;for(const c of chunks){all.set(c,at);at+=c.length;}const result=JSON.parse(new TextDecoder().decode(all));if(!response.ok||!result.Success)throw Error(result.Error??'Package data unavailable');context=result.Data;
  }else{
   if(inventory.entities.length||inventory.claims.length)throw Error('Select the source Vault to archive referenced database records.');
   context={data:{kind:'mutable-package-data',version:1,readOnly:true,encoding:'sqlite-storage-class-v1',tables:[],provenance:{documentHash:await hash(native)},selection:{entitySeeds:[]},unresolved:[],excluded:[{reason:'No source database selected; document has no authored entity-reference seeds.'}]},schema:{kind:'mutable-knowledge-schema',version:1,tables:[]}};
  }
  this.check(t);const assets=[];for(const a of inventory.assets){assets.push(await this.editor.assets.original(a,signal));this.check(t);}
  const details=[`${inventory.blocks} Blocks; ${inventory.annotations} annotations (${inventory.points} points). Original native identities are preserved.`,...context.data.tables.map(table=>`${table.name}: ${table.rows.length} rows`),...assets.map(a=>`${a.reference.assetId}: ${a.bytes.length} original bytes`),...inventory.unresolvedAssets.map(v=>`${v.blockId}: ${v.reason}`),...context.data.unresolved.map(v=>'Unresolved: '+JSON.stringify(v)),...context.data.excluded.map(v=>'Excluded: '+JSON.stringify(v))];
  if(await this.ask({title:'Review package export inventory',details:details.length>200?[...details.slice(0,200),`${details.length-200} further inventory entries are retained in the package data. Inclusion is governed by the selected policies.`]:details})===undefined)throw Error('Export cancelled.');this.check(t);
  const result=await runInterchange({kind:'package-create',native,source:{resourceId:id,...t.scope.cavernId?{cavernId:t.scope.cavernId}:{}},...context,assets},signal);this.check(t);
  const root=snapshot.placements[snapshot.rootPlacementKey],title=root.target.kind==='local'?String((snapshot.contents[root.target.contentKey].payload.metadata as any)?.title??'Document'):'Document';
  this.download(new Uint8Array(result),`${safeFilename(title)}.inkpkg`,'application/zip');this.status[1]('Archival package downloaded. The original Ink document is unchanged.');
 });}
 pickPackage(host:ImportHost){if(!this.editor.features.documentInterchange)return;this.pickerSignal[1]({title:'Import Ink package as a new copy',package:true,run:files=>{this.closePicker();if(files.length!==1){this.status[1]('Choose one Ink package.');return;}void this.importPackage(files[0],host);}});}
 async importPackage(file:SuppliedFile,host:ImportHost){return this.task(async signal=>{
  if(!this.editor.features.nativeDocumentPersistence)throw Error('Native persistence is required.');
  const t=this.base(host.current);this.check(t);if(file.blob.size>PACKAGE_LIMITS.compressed)throw Error('Package exceeds 64 MiB');
  const prepared=await runInterchange({kind:'package-open',bytes:new Uint8Array(await file.blob.arrayBuffer())},signal);this.check(t);
  if(await this.ask({title:'Import package as a fresh Ink copy',details:[`${prepared.inventory.blocks} Blocks; ${prepared.inventory.annotations} annotations; ${prepared.assets.length} originals.`,...prepared.data.tables.filter(v=>v.rows.length).map(v=>`${v.name}: ${v.rows.length} frozen contextual rows`),...prepared.inventory.unresolvedAssets.map(v=>`${v.blockId}: ${v.reason}`),'All authored identities are replaced. SQL rows remain inert; no destination entities are matched or created. Active or unsupported content becomes inert. Out-of-package references remain unresolved.',...prepared.data.excluded.map(v=>JSON.stringify(v)),...prepared.data.unresolved.map(v=>JSON.stringify(v))]})===undefined)throw Error('Import cancelled.');this.check(t);
  const files=prepared.assets.map(a=>({name:a.reference.assetId,blob:new Blob([new Uint8Array(a.bytes)],{type:a.mediaType})}));
  for(const asset of prepared.fragment.assets){const index=prepared.assets.findIndex(a=>assetKey(a.reference)===`${asset.source.cavernId}/${asset.source.assetId}`);if(index>=0){asset.source={kind:'transfer',index};for(const e of prepared.fragment.embeds)if(e.asset?.kind==='local'&&e.asset.id===asset.localId)delete e.data.asset;}}
  const admitted=await this.admit(prepared.fragment,files,t,signal);
  const native=await runInterchange({kind:'package-materialize',fragment:admitted.fragment,cavernId:t.scope.cavernId,assets:admitted.admitted,context:{data:prepared.data,schema:prepared.schema,source:prepared.manifest.source}},signal);this.check(t);
  const state=this.editor.repository.readState(),workspace=state.contents[state.placements[state.rootPlacementKey].contentKey],banks=workspace.children.filter(k=>state.contents[state.placements[k].contentKey].viewType==='workspace-object-bank-block');if(banks.length!==1)throw Error('One workspace object bank is required.');
  const id=String(native.state.contents[native.state.placements[native.roots[0]].contentKey].payload.id);
  this.editor.commands.insertFragment(native,{kind:'at',parentKey:banks[0],index:state.contents[state.placements[banks[0]].contentKey].children.length},{commandId:'interchange.import-package',subjects:[]});this.committed=true;nativeDocumentSession(this.editor).trackCandidate(id);host.open(id);this.status[1]('Imported an unsaved Ink copy with frozen package context. Save explicitly to retain it.');
 });}
 async inspectPackage(id:string,current:()=>boolean){return this.task(async()=>{const t=this.base(current),snapshot=captureNative(this.editor.repository.readState(),id),contexts=Object.values(snapshot.contents).filter(c=>c.viewType==='mutable/package-data-block');this.check(t);if(!contexts.length)throw Error('This Document has no packaged database context.');await this.ask({title:'Frozen package context (read-only)',details:contexts.flatMap(c=>{const context=c.payload.packageContext as any;return [JSON.stringify(context.source),...context.data.tables.filter((v:any)=>v.rows.length).map((v:any)=>JSON.stringify(v)),...context.data.unresolved.map((v:any)=>JSON.stringify(v)),...context.data.excluded.map((v:any)=>JSON.stringify(v))];})});});}
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
