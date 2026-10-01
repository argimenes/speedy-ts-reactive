import {resolveLinkedProperty, linkedDefinitionOwner} from '../block-tree/linked-annotations';
import {canonicalSearchSource} from '../runtime/canonical-search-source';
import type {SearchSource} from '../runtime/search-matching';
import type {RepositoryState} from '../block-tree/types';
import type {Facts,BlockFact,Mention,AnnotationFact} from './facts';
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
 const facts:Facts={id:resourceId,rootBlockId:String(root.payload.id),title:metadata?.title==null?'':String(metadata.title),hasTitle:metadata?.title!=null,tags:[],blocks:[],annotations:[],mentions:[],diagnostics:[],referenceDiagnostics:[]};
 const warn=(message:string,reference=true)=>{facts.diagnostics.push(message);if(reference)facts.referenceDiagnostics!.push(message);};
 if(metadata?.tags!==undefined) {
  if(Array.isArray(metadata.tags)){const tags=new Set<string>();let valid=true;for(const tag of metadata.tags){await policy?.step?.();if(typeof tag!=='string'){valid=false;break;}tags.add(tag);}if(valid)facts.tags=[...tags];else facts.diagnostics.push('Unsupported tags payload');}
  else facts.diagnostics.push('Unsupported tags payload');
 }
 const seen=new Set<string>(),queue=[state.rootPlacementKey],groups=new Map<string,Mention>(),bad=new Set<string>(),localIds=new Set<string>();
 let visits=0,properties=0;
 while(queue.length) {
  await policy?.step?.();
  if(++visits>10000){warn('Block budget reached');break;}
  if(!policy?.step&&visits%64===0){await new Promise(r=>setTimeout(r,0));signal?.throwIfAborted();policy?.check?.();}
  const p=state.placements[queue.pop()!];if(!p){warn('Missing placement');continue;}
  if(p.externalReference||p.resolvedReference){warn('External resource body not expanded');continue;}
  if(p.kind==='reference'){warn('External resource body not expanded');continue;} // inspect canonical owned content once, never occurrence multiplicity
  const c=state.contents[p.contentKey];if(!c||seen.has(c.key))continue;seen.add(c.key);
  const blockId=String(c.payload.id),block:BlockFact={id:blockId,type:c.viewType,ordinal:visits,cellCount:0};facts.blocks.push(block);
  if(opaqueType(c.viewType,extraction)||c.inlineKind!=='standoff'&&!['plain-text-block','text-block'].includes(c.viewType)&&typeof c.payload.text==='string'&&!!c.payload.text){warn(`Unsupported hosted content (${c.viewType}) omitted.`);continue;}
  block.cellCount=c.inlineContent.length;
  let inline:InlineFacts|undefined;const textStart=performance.now();
  if(c.inlineKind==='standoff') {
   if(inlineReader){inline=await inlineReader(blockId,signal);block.text=inline.text;block.cellCount=inline.length;}
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
   if(!raw||typeof raw!=='object'){warn('Malformed annotation');continue;}
   let owner,a;try{owner=linkedDefinitionOwner(state,raw,c.key);a=resolveLinkedProperty(state,raw,c.key);}catch{warn('Ambiguous linked definition');continue;}
   if(a.isDeleted||a.clientOnly)continue;
   const documentIssue=!a.type||a.type==='codex/block-reference';
   if(raw.annotationId&&(!owner||owner.key!==root.key)){warn('Foreign/unresolved linked definition',documentIssue);continue;}
   if(c.inlineKind!=='standoff'||typeof raw.id!=='string'||!raw.id||typeof a.type!=='string'||!a.type||typeof a.start!=='number'||typeof a.end!=='number'||!Number.isInteger(a.start)||!Number.isInteger(a.end)||a.start<0||a.end<a.start||a.end>=(inline?.length??c.inlineContent.length)){warn('Unsupported annotation identity/range',documentIssue);continue;}
   const segmentId=JSON.stringify([resourceId,blockId,raw.id]);
   const logicalId=JSON.stringify([resourceId,raw.annotationId?'linked':blockId,raw.annotationId??raw.id]);
   if(localIds.has(segmentId)){bad.add(logicalId);groups.delete(logicalId);warn('Duplicate segment identity',documentIssue);continue;}localIds.add(segmentId);
   const definition=raw.annotationId?{resourceId:resourceId,blockId:String(owner!.payload.id),annotationId:String(raw.annotationId)}:undefined;
   const annotation:AnnotationFact={id:segmentId,logicalId,blockId,type:a.type,start:a.start,end:a.end+1,value:policy?.cloneValue?await policy.cloneValue(a.value):structuredClone(a.value),definition};
   facts.annotations.push(annotation);
   if(!['codex/block-reference','codex/entity-reference'].includes(a.type))continue;
   if(typeof a.value!=='string'||!a.value){warn('Unsupported reference value',documentIssue);continue;}
   const kind=a.type==='codex/block-reference'?'document':'entity',docId=(a.metadata as any)?.documentId;
   if(kind==='document'&&docId!==undefined&&typeof docId!=='string'){warn('Unsupported target resource identity');continue;}
   if(bad.has(logicalId))continue;
   let mention=groups.get(logicalId);
   if(mention&&(mention.kind!==kind||mention.targetId!==a.value||mention.targetResourceId!==(kind==='document'?docId:undefined))){groups.delete(logicalId);bad.add(logicalId);warn('Conflicting linked mention');continue;}
   if(kind==='document'){const from=Math.max(0,a.start-20),to=Math.min(inline?.length??c.inlineContent.length,a.end+1+35,a.start+120);annotation.contextCells=to-from;annotation.context=inline?await inline.snippet(from,to):c.inlineContent.slice(from,to).map(key=>state.contents[state.placements[key]?.contentKey]?.payload.text??'[inline object]').join('');}
   const text=inline?await inline.snippet(a.start,a.end+1):c.inlineContent.slice(a.start,a.end+1).map(key=>{const cell=state.contents[state.placements[key].contentKey];return cell.viewType==='text-cell'?String(cell.payload.text):'[inline object]';}).join('');
   if(!mention){mention={id:logicalId,kind,targetId:a.value,targetResourceId:kind==='document'?docId:undefined,ranges:[],text:'',annotationIds:[],definition};groups.set(logicalId,mention);}
   mention.ranges.push({blockId,start:a.start,end:a.end+1});mention.annotationIds.push(segmentId);mention.text+=(mention.text?'\n':'')+text;
  }
  if(policy?.timings)policy.timings.annotationsMs+=performance.now()-annotationStart;
  const relations=Object.keys(c.ownedRelations).sort((a,b)=>a.localeCompare(b));
  for(let i=relations.length-1;i>=0;i--){await policy?.step?.();queue.push(c.ownedRelations[relations[i]]);}
  for(let i=c.children.length-1;i>=0;i--){await policy?.step?.();queue.push(c.children[i]);}
 }
 facts.annotations=facts.annotations.filter(a=>!bad.has(a.logicalId));facts.mentions=[...groups.values()];facts.diagnostics=[...new Set(facts.diagnostics)];facts.referenceDiagnostics=[...new Set(facts.referenceDiagnostics)];signal?.throwIfAborted();policy?.check?.();return facts;
}
