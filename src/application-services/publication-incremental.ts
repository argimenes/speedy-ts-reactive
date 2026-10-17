import type {PublicationPorts,PublicationRecord} from './publication-ports';
import type {DirectoryEntry,DirectoryProjectionContext} from '../publication/directory';
import type {Projection} from '../publication/projection';
import {canonical,projectionPolicy} from '../publication/incremental';
const bytes=(s:string)=>new TextEncoder().encode(s);
export interface ProjectionReceipt {fingerprint:string;hash:string}
/** One prior completed job, leased while copying. New jobs never depend on its lifetime. */
export async function projectionReuse(p:PublicationPorts,r:PublicationRecord,signal:AbortSignal){
 let source:PublicationRecord|undefined,lease:Awaited<ReturnType<PublicationPorts['storage']['acquire']>>|undefined;
 if(r.job.buildMode!=='full'&&r.site.active){
  const ids=Object.entries(r.site.committedJobs??{}).filter(([,release])=>release===r.site.active).map(([id])=>id).reverse();
  for(const id of ids){try{lease=await p.storage.acquire(id);const candidate=await p.storage.load(id);if(candidate.job.state==='completed'&&candidate.site.id===r.site.id){source=candidate;break;}}catch{/* Missing, busy or incompatible cache: prepare afresh. */}await lease?.close();lease=undefined;}
 }
 const entries:Array<{resourceId:string}>=source?.directory?.documents??(source&&!source.site.directory?[{resourceId:source.site.resourceId}]:[]);
 const keys=new Map(entries.map((e,i)=>[e.resourceId,`doc-${String(i).padStart(4,'0')}`] as const));
 let reused=0,prepared=0;
 const key=(entry:DirectoryEntry,directory?:DirectoryProjectionContext)=>p.hash(bytes(canonical({native:entry.hash,resource:entry.resourceId,namespace:r.site.id,vault:p.cavernId,policy:projectionPolicy({...r.site.profile,title:entry.title,route:entry.route}),directory,research:r.research})));
 return {
  key,
  async project(entry:DirectoryEntry,native:Uint8Array,unit:string,directory?:DirectoryProjectionContext){
   signal.throwIfAborted();
   const profile={...r.site.profile,title:entry.title,route:entry.route};
   const fingerprint=key(entry,directory);
   let projection:Projection|undefined,copied:string|undefined;const prior=keys.get(entry.resourceId);
   if(source&&prior){const hit=await p.storage.reuseProjection(source.job.id,prior,r.job.id,unit,fingerprint);if(hit)try{projection=JSON.parse(new TextDecoder().decode(hit.bytes));copied=hit.hash;}catch{/* Invalid cache data falls back to preparation. */}}
   if(projection)reused++;else{projection=await p.executor.run({kind:'publication-project',native,profile,cavernId:p.cavernId,namespace:r.site.id,research:r.research,...directory?{directory}:{}},signal) as Projection;prepared++;}
   const receipt={fingerprint,hash:copied??await p.storage.put(r.job.id,bytes(JSON.stringify(projection)),unit)};
   return {projection,receipt};
  },
  stats:()=>({reused,prepared}),
  async close(){await lease?.close();}
 };
}
