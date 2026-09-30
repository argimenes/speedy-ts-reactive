/** Qualification-only rebuild; same discovery/read/hash and contribution rules as the oracle. */
import {discover,readNative,type FileEvidence} from './files';
import {KnowledgeIndex} from './index';
import {prepareLightweightFacts} from './lightweight';
export async function rebuildLight(root:string,signal?:AbortSignal,onProgress?:(n:number)=>void){
 const start=performance.now(),scan=await discover(root,signal),discoveryMs=performance.now()-start;
 const index=new KnowledgeIndex(),diagnostics=[...scan.diagnostics],evidence:FileEvidence[]=[],times={readHashMs:0,validationMs:0,factsMs:0,insertMs:0};
 const identities=new Map<string,string>();let nativeBytes=0,peakHeap=process.memoryUsage().heapUsed;
 for(const file of scan.files){signal?.throwIfAborted();if(scan.collision.has(file.path))continue;
  try{let t=performance.now();const read=await readNative(scan.base,file.path);nativeBytes+=read.bytes.length;times.readHashMs+=performance.now()-t;
   const prepared=prepareLightweightFacts(read.bytes,signal),resource={resourceId:prepared.resourceId};times.validationMs+=prepared.validationMs;
   evidence.push({...file,size:read.size,mtimeMs:read.mtimeMs,hash:read.hash,resourceId:resource.resourceId});
   if(identities.has(resource.resourceId)){index.rejectIdentity(resource.resourceId);diagnostics.push(`Duplicate resource identity ${resource.resourceId}: ${identities.get(resource.resourceId)}, ${file.path}`);continue;}identities.set(resource.resourceId,file.path);
   const result=await prepared.materialize(file.path,read.hash,signal),facts=result.facts;times.factsMs+=result.timings.factsMs;
   t=performance.now();index.putSaved(facts);times.insertMs+=performance.now()-t;
  }catch(error){signal?.throwIfAborted();diagnostics.push(`${file.path}: ${String(error)}`);}
  peakHeap=Math.max(peakHeap,process.memoryUsage().heapUsed);onProgress?.(evidence.length);
 }
 return {index,evidence,diagnostics,metrics:{discoveryMs,...times,totalMs:performance.now()-start,nativeBytes,peakHeap,files:scan.files.length}};
}
