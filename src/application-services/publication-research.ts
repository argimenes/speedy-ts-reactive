import type {PublicationPorts} from './publication-ports';
import type {PublicationSite} from './publication-contracts';
import type {ResearchSource} from '../publication/reader';
import {validateResearchSource} from '../publication/reader';
import {candidate,contextValues,publicSemantics,type ResearchInspection,type ResearchSources,type ResearchPlan,type ResearchBinding} from '../publication/research';
import {PackageDataReader} from '../interchange/package/data';
const bytes=(v:unknown)=>new TextEncoder().encode(JSON.stringify(v));
async function inputs(p:PublicationPorts,site:PublicationSite,signal?:AbortSignal){
 if(!site.directory){const doc=await p.native({location:site.location},signal);if(doc.resourceId!==site.resourceId)throw Error('Saved identity changed; review required');return [{resourceId:doc.resourceId,location:site.location,hash:doc.sha256}];}
 if(!p.inventory)throw Error('Directory unavailable');const inventory=await p.inventory(site.directory.scope,signal);
 if(inventory.documents.length!==site.directory.pages.length||inventory.documents.some(d=>!site.directory!.pages.some(e=>e.resourceId===d.resourceId)))throw Error('Directory membership changed; review required');return inventory.documents;
}
export async function researchSources(p:PublicationPorts,site:PublicationSite,signal?:AbortSignal):Promise<ResearchSources>{
 const documents=[];for(const entry of await inputs(p,site,signal)){signal?.throwIfAborted();const doc=await p.native({location:entry.location,expectedHash:entry.hash},signal),r=await p.executor.run({kind:'publication-inspect',native:new TextEncoder().encode(doc.native),profile:site.profile,cavernId:p.cavernId},signal) as ResearchInspection;documents.push({resourceId:entry.resourceId,contexts:r.contexts});}if(bytes(documents).length>512*1024)throw Error('Frozen context inventory exceeds 512 KiB; narrow scope');return {documents};
}
/** Explicit review operation; it never writes documents or acquires linked resources. */
export async function researchPlan(p:PublicationPorts,site:PublicationSite,source:ResearchSource,signal?:AbortSignal):Promise<{plan:ResearchPlan;bindings:ResearchBinding[]}>{
 validateResearchSource(source);const documents=await inputs(p,site,signal),targets:Array<{resourceId:string;inspection:ResearchInspection;context:string}>=[],contextHashes:Array<[string,string]>=[],candidates=new Map(),bindings:ResearchBinding[]=[],diagnostics:string[]=[];let contextBytes=0,targetCount=0;const admittedSeeds=new Set<string>();
 const addContext=(key:string,data:NonNullable<ResearchInspection['data']>)=>{const values=contextValues(data),encoded=bytes(values);contextBytes+=encoded.length;if(contextBytes>16*1024*1024)throw Error('Semantic context budget exceeds 16 MiB');contextHashes.push([key,p.hash(encoded)]);return new PackageDataReader(data);};
 const readers=new Map<string,PackageDataReader>();
 if(source.kind==='frozen'&&source.blocks.some(b=>!documents.some(d=>d.resourceId===b.resourceId)))throw Error('Frozen context is outside selected publication scope');
 for(const entry of documents){signal?.throwIfAborted();const blockId=source.kind==='frozen'?source.blocks.find(b=>b.resourceId===entry.resourceId)?.blockId:undefined;
  const doc=await p.native({location:entry.location,expectedHash:entry.hash},signal),inspection=await p.executor.run({kind:'publication-inspect',native:new TextEncoder().encode(doc.native),profile:site.profile,cavernId:p.cavernId,blockId},signal) as ResearchInspection;
  const unique=new Map(inspection.targets.map(t=>[t.kind+'\0'+t.id,t]));inspection.targets=[...unique.values()];
  targetCount+=inspection.targets.length;if(targetCount>20000)throw Error('Semantic document-target limit exceeded');
  if(!inspection.targets.length)continue;
  if(source.kind==='frozen'&&!blockId)throw Error('Select a frozen PackageDataBlock for every document with semantic references');
  if(source.kind==='live'&&inspection.targets.some(t=>t.sourceVault&&t.sourceVault!==p.cavernId))throw Error('Foreign semantic identities require their frozen context; no live identity merge');
  const context=source.kind==='live'?'live:'+p.cavernId:`frozen:${entry.resourceId}:${blockId}`;
  for(const t of inspection.targets){admittedSeeds.add(context+'\0'+(t.kind==='claim'?'claim':'entity')+'\0'+t.id);if(admittedSeeds.size>500)throw Error('Research requires at most 500 combined semantic seeds; narrow scope or use Reading');}
  if(inspection.data)readers.set(context,addContext(context,inspection.data));targets.push({resourceId:entry.resourceId,inspection:{...inspection,data:undefined},context});
 }
 const seeds=new Map(targets.flatMap(d=>d.inspection.targets.map(t=>[d.context+'\0'+(t.kind==='claim'?'claim':'entity')+'\0'+t.id,t] as const)));
 if(seeds.size>500)throw Error('Research requires at most 500 combined semantic seeds; narrow scope or use Reading');
 if(source.kind==='live'&&seeds.size){if(!p.packageData)throw Error('PackageData extraction unavailable');const values=[...seeds.values()],result=await p.packageData({entities:[...new Set(values.filter(t=>t.kind!=='claim').map(t=>t.id))].sort(),claimsById:values.filter(t=>t.kind==='claim').map(t=>t.id).sort(),relationships:false,claims:false,evidence:false,actors:false,observedAliases:false},signal);readers.set('live:'+p.cavernId,addContext('live:'+p.cavernId,result.data));}
 for(const d of targets){const reader=readers.get(d.context);if(!reader)continue;for(const target of d.inspection.targets){const key='e-'+p.hash(bytes([site.id,d.context,target.kind,target.id])).slice(0,32),c=candidate(reader,target,key);if(!c){diagnostics.push(`Unresolved ${target.kind} in chosen context; no enrichment or public detail.`);continue;}const old=bindings.find(b=>b.key===key);if(old&&(old.kind!==target.kind||old.id!==target.id))throw Error('Semantic alias collision');candidates.set(key,c);if(candidates.size>500)throw Error('Research candidate limit; narrow scope');bindings.push({resourceId:d.resourceId,kind:target.kind,id:target.id,key});}}
 const list=[...candidates.values()].sort((a,b)=>a.key<b.key?-1:a.key>b.key?1:0);if(bytes(list).length>512*1024)throw Error('Semantic review exceeds 512 KiB; narrow scope');
 const fingerprint=p.hash(bytes({source,inputs:documents.map(d=>[d.resourceId,d.hash]),margins:site.profile.includeMargins,contexts:contextHashes.sort(),candidates:list}));
 return {plan:{source,fingerprint,candidates:list,diagnostics:[...new Set(diagnostics),'Only reviewed names, kind labels and selected optional fields are eligible. Relationships, participants, evidence, actors and archival rows are excluded.']},bindings};
}
export async function approvedResearch(p:PublicationPorts,site:PublicationSite,signal?:AbortSignal){
 const options=site.profile.reader?.research;if(site.profile.reader?.preset!=='research'||!options)return;
 const {plan,bindings}=await researchPlan(p,site,options.source,signal);if(plan.fingerprint!==options.fingerprint)throw Error('Semantic context or saved inputs changed; review required');return publicSemantics(plan,bindings,options.selections);
}
