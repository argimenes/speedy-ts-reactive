/** Investigation only: facts derived with the qualified native decoder; no admission or views. */
import {decodeNative} from '../../persistence/native-resource';
import {resourceToRepository} from '../../history/durable-core';
import {resolveLinkedProperty, linkedDefinitionOwner} from '../../block-tree/linked-annotations';
import {canonicalSearchSource} from '../../runtime/canonical-search-source';
import type {SearchSource} from '../../runtime/search-matching';
import type {ResourceSnapshot} from '../../history/stage-c-gates/resource';
import type {DeepReadonly} from '../../block-tree/commit-capture';
export const PROFILE='native-knowledge-investigation-1';
export interface AnnotationFact {
 id:string; logicalId:string; blockId:string; type:string; start:number; end:number; value:unknown;
 definition?:{resourceId:string;blockId:string;annotationId:string};
}
export interface Mention {
 id:string; kind:'document'|'entity'; targetId:string; targetResourceId?:string;
 ranges:Array<{blockId:string;start:number;end:number}>; text:string; annotationIds:string[];
 definition?:AnnotationFact['definition'];
}
export interface BlockFact {id:string;type:string;text?:Omit<SearchSource,'contentKey'|'version'>}
export interface Facts {
 id:string;rootBlockId:string;location:string;generation:string;title:string;tags:string[];
 blocks:BlockFact[];annotations:AnnotationFact[];mentions:Mention[];diagnostics:string[];
}
export const decode = decodeNative;
export async function extract(resource:DeepReadonly<ResourceSnapshot>,location:string,generation:string,signal?:AbortSignal):Promise<Facts> {
 signal?.throwIfAborted();
 const state=resourceToRepository(resource),root=state.contents[state.placements[state.rootPlacementKey].contentKey];
 const metadata=root.payload.metadata as Record<string,unknown>|undefined;
 const facts:Facts={id:resource.resourceId,rootBlockId:String(root.payload.id),location,generation,title:typeof metadata?.title==='string'?metadata.title:'',tags:[],blocks:[],annotations:[],mentions:[],diagnostics:[]};
 if(metadata?.tags!==undefined) {
  if(Array.isArray(metadata.tags)&&metadata.tags.every(t=>typeof t==='string'))facts.tags=[...new Set(metadata.tags as string[])];
  else facts.diagnostics.push('Unsupported tags payload');
 }
 const seen=new Set<string>(),queue=[state.rootPlacementKey],groups=new Map<string,Mention>(),bad=new Set<string>(),localIds=new Set<string>();
 let visits=0,properties=0;
 while(queue.length) {
  if(++visits>10000){facts.diagnostics.push('Block budget reached');break;}
  if(visits%64===0){await new Promise(r=>setTimeout(r,0));signal?.throwIfAborted();}
  const p=state.placements[queue.pop()!];if(!p){facts.diagnostics.push('Missing placement');continue;}
  if(p.externalReference||p.resolvedReference){facts.diagnostics.push('External resource body not expanded');continue;}
  if(p.kind==='reference')continue; // inspect canonical owned content once, never occurrence multiplicity
  const c=state.contents[p.contentKey];if(!c||seen.has(c.key))continue;seen.add(c.key);
  const blockId=String(c.payload.id),block:BlockFact={id:blockId,type:c.viewType};facts.blocks.push(block);
  if(c.inlineKind==='standoff') {
   const {contentKey:_,version:__,...text}=await canonicalSearchSource(state,c.key,0,signal,2000000);block.text=text;
  }
  for(const raw of Array.isArray(c.payload.standoffProperties)?c.payload.standoffProperties:[]) {
   if(++properties>10000)throw Error('Annotation budget exceeded');
   if(!raw||typeof raw!=='object'){facts.diagnostics.push('Malformed annotation');continue;}
   let owner;try{owner=linkedDefinitionOwner(state,raw,c.key);}catch{facts.diagnostics.push('Ambiguous linked definition');continue;}
   if(raw.annotationId&&(!owner||owner.key!==root.key)){facts.diagnostics.push('Foreign/unresolved linked definition');continue;}
   const a=resolveLinkedProperty(state,raw,c.key);
   if(a.isDeleted||a.clientOnly)continue;
   if(c.inlineKind!=='standoff'||typeof raw.id!=='string'||!raw.id||typeof a.type!=='string'||!a.type||typeof a.start!=='number'||typeof a.end!=='number'||!Number.isInteger(a.start)||!Number.isInteger(a.end)||a.start<0||a.end<a.start||a.end>=c.inlineContent.length){facts.diagnostics.push('Unsupported annotation identity/range');continue;}
   const segmentId=JSON.stringify([resource.resourceId,blockId,raw.id]);
   const logicalId=JSON.stringify([resource.resourceId,raw.annotationId?'linked':blockId,raw.annotationId??raw.id]);
   if(localIds.has(segmentId)){bad.add(logicalId);groups.delete(logicalId);facts.diagnostics.push('Duplicate segment identity');continue;}localIds.add(segmentId);
   const definition=raw.annotationId?{resourceId:resource.resourceId,blockId:String(owner!.payload.id),annotationId:String(raw.annotationId)}:undefined;
   facts.annotations.push({id:segmentId,logicalId,blockId,type:a.type,start:a.start,end:a.end+1,value:structuredClone(a.value),definition});
   if(!['codex/block-reference','codex/entity-reference'].includes(a.type))continue;
   if(typeof a.value!=='string'||!a.value){facts.diagnostics.push('Unsupported reference value');continue;}
   const kind=a.type==='codex/block-reference'?'document':'entity',docId=(a.metadata as any)?.documentId;
   if(kind==='document'&&docId!==undefined&&typeof docId!=='string'){facts.diagnostics.push('Unsupported target resource identity');continue;}
   if(bad.has(logicalId))continue;
   let mention=groups.get(logicalId);
   if(mention&&(mention.kind!==kind||mention.targetId!==a.value||mention.targetResourceId!==(kind==='document'?docId:undefined))){groups.delete(logicalId);bad.add(logicalId);facts.diagnostics.push('Conflicting linked mention');continue;}
   const text=c.inlineContent.slice(a.start,a.end+1).map(key=>{const cell=state.contents[state.placements[key].contentKey];return cell.viewType==='text-cell'?String(cell.payload.text):'[inline object]';}).join('');
   if(!mention){mention={id:logicalId,kind,targetId:a.value,targetResourceId:kind==='document'?docId:undefined,ranges:[],text:'',annotationIds:[],definition};groups.set(logicalId,mention);}
   mention.ranges.push({blockId,start:a.start,end:a.end+1});mention.annotationIds.push(segmentId);mention.text+=(mention.text?'\n':'')+text;
  }
  queue.push(...[...c.children,...Object.entries(c.ownedRelations).sort(([a],[b])=>a.localeCompare(b)).map(([,v])=>v)].reverse());
 }
 facts.annotations=facts.annotations.filter(a=>!bad.has(a.logicalId));facts.mentions=[...groups.values()];facts.diagnostics=[...new Set(facts.diagnostics)];signal?.throwIfAborted();return facts;
}
