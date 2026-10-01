import {resolveLinkedProperty, linkedDefinitionOwner} from '../block-tree/linked-annotations';
import {canonicalSearchSource} from '../runtime/canonical-search-source';
import type {SearchSource} from '../runtime/search-matching';
import type {RepositoryState} from '../block-tree/types';
import type {Facts,BlockFact,Mention} from './facts';
import {normalizePolicy,opaqueType,type ExtractionPolicy} from './policy';
/** Inline text adapter; never used by native admission/save. */
export interface InlineFacts {
 length:number; text:Omit<SearchSource,'contentKey'|'version'>;
 snippet(start:number,end:number):string|Promise<string>;
}
export type InlineReader=(blockId:string,signal?:AbortSignal)=>Promise<InlineFacts>;
export interface ObservationPolicy {
 extraction?:ExtractionPolicy; check?:()=>void; step?:()=>Promise<void>; cloneValue?:(value:unknown)=>Promise<unknown>;
 timings?:{textMs:number;annotationsMs:number};
}
/** State may be borrowed; callers must reject changed revisions at every yield. */
export async function collectFacts(state:RepositoryState,resourceId:string,signal?:AbortSignal,inlineReader?:InlineReader,policy?:ObservationPolicy):Promise<Facts> {
 signal?.throwIfAborted();policy?.check?.();
 const extraction=normalizePolicy(policy?.extraction);
 const root=state.contents[state.placements[state.rootPlacementKey].contentKey];
 const metadata=root.payload.metadata as Record<string,unknown>|undefined;
 const facts:Facts={id:resourceId,rootBlockId:String(root.payload.id),title:typeof metadata?.title==='string'?metadata.title:'',tags:[],blocks:[],annotations:[],mentions:[],diagnostics:[]};
 if(metadata?.tags!==undefined) {
  if(Array.isArray(metadata.tags)){const tags=new Set<string>();let valid=true;for(const tag of metadata.tags){await policy?.step?.();if(typeof tag!=='string'){valid=false;break;}tags.add(tag);}if(valid)facts.tags=[...tags];else facts.diagnostics.push('Unsupported tags payload');}
  else facts.diagnostics.push('Unsupported tags payload');
 }
 const seen=new Set<string>(),queue=[state.rootPlacementKey],groups=new Map<string,Mention>(),bad=new Set<string>(),localIds=new Set<string>();
 let visits=0,properties=0;
 while(queue.length) {
  await policy?.step?.();
  if(++visits>10000){facts.diagnostics.push('Block budget reached');break;}
  if(!policy?.step&&visits%64===0){await new Promise(r=>setTimeout(r,0));signal?.throwIfAborted();policy?.check?.();}
  const p=state.placements[queue.pop()!];if(!p){facts.diagnostics.push('Missing placement');continue;}
  if(p.externalReference||p.resolvedReference){facts.diagnostics.push('External resource body not expanded');continue;}
  if(p.kind==='reference')continue; // inspect canonical owned content once, never occurrence multiplicity
  const c=state.contents[p.contentKey];if(!c||seen.has(c.key))continue;seen.add(c.key);
  const blockId=String(c.payload.id),block:BlockFact={id:blockId,type:c.viewType};facts.blocks.push(block);
  if(opaqueType(c.viewType,extraction)||c.inlineKind!=='standoff'&&!['plain-text-block','text-block'].includes(c.viewType)&&typeof c.payload.text==='string'&&!!c.payload.text){facts.diagnostics.push(`Unsupported hosted content (${c.viewType}) omitted.`);continue;}
  let inline:InlineFacts|undefined;const textStart=performance.now();
  if(c.inlineKind==='standoff') {
   if(inlineReader){inline=await inlineReader(blockId,signal);block.text=inline.text;}
   else {const {contentKey:_,version:__,...text}=await canonicalSearchSource(state,c.key,0,signal,2000000);block.text=text;}
  }
  else if(c.viewType==='plain-text-block'||c.viewType==='text-block') {
   const {contentKey:_,version:__,...text}=await canonicalSearchSource(state,c.key,0,signal,2000000);block.text=text;
  }
  policy?.check?.();if(policy?.timings)policy.timings.textMs+=performance.now()-textStart;const annotationStart=performance.now();
  for(const raw of Array.isArray(c.payload.standoffProperties)?c.payload.standoffProperties:[]) {
   await policy?.step?.();
   if(++properties>10000)throw Error('Annotation budget exceeded');
   if(policy&&!policy.step&&properties%128===0){await new Promise(r=>setTimeout(r,0));signal?.throwIfAborted();policy.check?.();}
   if(!raw||typeof raw!=='object'){facts.diagnostics.push('Malformed annotation');continue;}
   let owner;try{owner=linkedDefinitionOwner(state,raw,c.key);}catch{facts.diagnostics.push('Ambiguous linked definition');continue;}
   if(raw.annotationId&&(!owner||owner.key!==root.key)){facts.diagnostics.push('Foreign/unresolved linked definition');continue;}
   const a=resolveLinkedProperty(state,raw,c.key);
   if(a.isDeleted||a.clientOnly)continue;
   if(c.inlineKind!=='standoff'||typeof raw.id!=='string'||!raw.id||typeof a.type!=='string'||!a.type||typeof a.start!=='number'||typeof a.end!=='number'||!Number.isInteger(a.start)||!Number.isInteger(a.end)||a.start<0||a.end<a.start||a.end>=(inline?.length??c.inlineContent.length)){facts.diagnostics.push('Unsupported annotation identity/range');continue;}
   const segmentId=JSON.stringify([resourceId,blockId,raw.id]);
   const logicalId=JSON.stringify([resourceId,raw.annotationId?'linked':blockId,raw.annotationId??raw.id]);
   if(localIds.has(segmentId)){bad.add(logicalId);groups.delete(logicalId);facts.diagnostics.push('Duplicate segment identity');continue;}localIds.add(segmentId);
   const definition=raw.annotationId?{resourceId:resourceId,blockId:String(owner!.payload.id),annotationId:String(raw.annotationId)}:undefined;
   facts.annotations.push({id:segmentId,logicalId,blockId,type:a.type,start:a.start,end:a.end+1,value:policy?.cloneValue?await policy.cloneValue(a.value):structuredClone(a.value),definition});
   if(!['codex/block-reference','codex/entity-reference'].includes(a.type))continue;
   if(typeof a.value!=='string'||!a.value){facts.diagnostics.push('Unsupported reference value');continue;}
   const kind=a.type==='codex/block-reference'?'document':'entity',docId=(a.metadata as any)?.documentId;
   if(kind==='document'&&docId!==undefined&&typeof docId!=='string'){facts.diagnostics.push('Unsupported target resource identity');continue;}
   if(bad.has(logicalId))continue;
   let mention=groups.get(logicalId);
   if(mention&&(mention.kind!==kind||mention.targetId!==a.value||mention.targetResourceId!==(kind==='document'?docId:undefined))){groups.delete(logicalId);bad.add(logicalId);facts.diagnostics.push('Conflicting linked mention');continue;}
   const text=inline?await inline.snippet(a.start,a.end+1):c.inlineContent.slice(a.start,a.end+1).map(key=>{const cell=state.contents[state.placements[key].contentKey];return cell.viewType==='text-cell'?String(cell.payload.text):'[inline object]';}).join('');
   if(!mention){mention={id:logicalId,kind,targetId:a.value,targetResourceId:kind==='document'?docId:undefined,ranges:[],text:'',annotationIds:[],definition};groups.set(logicalId,mention);}
   mention.ranges.push({blockId,start:a.start,end:a.end+1});mention.annotationIds.push(segmentId);mention.text+=(mention.text?'\n':'')+text;
  }
  if(policy?.timings)policy.timings.annotationsMs+=performance.now()-annotationStart;
  const relations=Object.keys(c.ownedRelations).sort((a,b)=>a.localeCompare(b));
  for(let i=relations.length-1;i>=0;i--){await policy?.step?.();queue.push(c.ownedRelations[relations[i]]);}
  for(let i=c.children.length-1;i>=0;i--){await policy?.step?.();queue.push(c.children[i]);}
 }
 facts.annotations=facts.annotations.filter(a=>!bad.has(a.logicalId));facts.mentions=[...groups.values()];facts.diagnostics=[...new Set(facts.diagnostics)];signal?.throwIfAborted();policy?.check?.();return facts;
}
