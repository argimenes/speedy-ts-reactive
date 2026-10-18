import type {PdfCapabilities,PdfOperations} from './pdf-contracts';
import type {PdfCapture,PdfInspection} from '../pdf/model';
import {object,jobId,assetId} from './validation';
import {httpsUrl} from '../iiif/model';
/** Scoped durable acquisition. Canonical commit follows immutable publication;
 * retries use the retained receipt and never retarget an existing occurrence. */
export class PdfService {
 private active=new Set<AbortController>();private closed=false;
 constructor(private p:PdfCapabilities){}
 async call<K extends keyof PdfOperations>(op:K,input:PdfOperations[K]['input'],signal?:AbortSignal):Promise<PdfOperations[K]['output']>{
  if(this.closed||this.active.size>=2)throw Error('PDF service unavailable or busy');signal?.throwIfAborted();
  const c=new AbortController(),abort=()=>c.abort();this.active.add(c);signal?.addEventListener('abort',abort,{once:true});const timer=setTimeout(abort,60000),s=c.signal,v=input as any;
  try{
   if(op==='resources.original'){object(v,['assetId']);assetId(v.assetId);return await this.p.originalResource(v.assetId,s) as any;}
   if(op==='resource.context'||op==='resource.review'){object(v,op==='resource.context'?['snapshotId']:['operationId','snapshotId','targetId','relation','note','decision']);jobId(v.snapshotId);if(op==='resource.review'){jobId(v.operationId);jobId(v.targetId);}return await this.p.knowledge({...v,op:op==='resource.context'?'resource-context':'resource-review'},s);}
   if(op==='pdf.read'){object(v,['snapshotId']);jobId(v.snapshotId);const {snapshot}=await this.p.knowledge({op:'pdf-snapshot',snapshotId:v.snapshotId},s);if(snapshot.kind!=='pdf')throw Error('Not a PDF snapshot');return {snapshot,bytes:await this.p.original(snapshot.asset,s)} as any;}
   object(v,op==='pdf.import'?['id','source']:['id']);jobId(v.id);
   if(op==='pdf.import')await this.p.jobs.create(v.id,{kind:'pdf',source:httpsUrl(v.source)});
   const lease=await this.p.jobs.acquire(v.id);try{let r=await this.p.jobs.load(v.id);if(r.preparation.kind!=='pdf')throw Error('Wrong job kind');
    const checkpoint=async(state:typeof r.summary.state,result=r.result,error?:string)=>r=await this.p.jobs.checkpoint({...r,result,summary:{...r.summary,state,error}},r.summary.revision);
    if(op==='pdf.inspect'){if(r.summary.state==='running')await checkpoint('interrupted');return {job:r.summary} as any;}
    try{
     let snapshot:PdfCapture|undefined=r.result?JSON.parse(new TextDecoder().decode(await this.p.jobs.readResult(v.id,r.result))).snapshot:undefined;
     if(r.summary.state==='completed'&&snapshot){await this.p.original(snapshot.asset,s);return {snapshot} as any;}
     await checkpoint('running');
     if(!snapshot){const acquired=await this.p.acquire(r.preparation.source,s),inspection=await this.p.executor.run({kind:'pdf-inspect',bytes:acquired.bytes},s) as PdfInspection;
      const asset=await this.p.retain(acquired.bytes,s);snapshot={version:1,kind:'pdf',snapshotId:this.p.uuid(),identityId:this.p.uuid(),entityId:this.p.uuid(),resourceId:this.p.uuid(),asset,inspection,sourceUrl:r.preparation.source,endpoint:acquired.endpoint,retrievedAt:this.p.now()};
      await checkpoint('running',await this.p.jobs.putResult(v.id,new TextEncoder().encode(JSON.stringify({snapshot}))));
     }else await this.p.original(snapshot.asset,s);
     s.throwIfAborted();const result=await this.p.knowledge({op:'pdf-commit',operationId:v.id,snapshot},s);await checkpoint('completed',await this.p.jobs.putResult(v.id,new TextEncoder().encode(JSON.stringify(result))));return result;
    }catch(e){if(r.summary.state!=='completed')await checkpoint(s.aborted?'cancelled':'failed',r.result,String(e).slice(0,500));throw Error(`${String(e)}. PDF job ${v.id} can be resumed.`);}
   }finally{await lease.close();}
  }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);this.active.delete(c);}
 }
 async close(){this.closed=true;for(const c of this.active)c.abort();while(this.active.size)await new Promise(r=>setTimeout(r,10));}
}
