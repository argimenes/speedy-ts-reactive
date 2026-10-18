import {doiInput,type ScholarlyCitation} from '../interchange/scholarly';
import type {JobStorage,Executor,JobRecord} from './capabilities';
import type {AcademicCapture,AcademicCommit,AcademicKnowledge,AcademicNormalized,AcademicOperations} from './academic-contracts';
import {object,jobId} from './validation';
export interface AcademicCapabilities {
 cavernId:string;jobs:JobStorage;executor:Executor;knowledge:AcademicKnowledge;
 acquire(doi:string,signal:AbortSignal):Promise<AcademicCapture>;
 retain(bytes:Uint8Array,signal:AbortSignal):Promise<ScholarlyCitation['asset']>;
 verify(asset:ScholarlyCitation['asset'],signal:AbortSignal):Promise<void>;
 uuid():string;now():string;
}
/** Explicit, bounded host workflow. Durable receipts never own a browser insertion. */
export class AcademicService {
 private active?:AbortController;private tail:Promise<unknown>=Promise.resolve();private queued=0;private closed=false;
 constructor(private p:AcademicCapabilities){}
 async call<K extends keyof AcademicOperations>(op:K,input:AcademicOperations[K]['input'],signal?:AbortSignal):Promise<AcademicOperations[K]['output']>{
  if(this.closed)throw Error('Academic services closed');signal?.throwIfAborted();const v=input as any;
  if(op==='academic.backlinks'){object(v,['entityId']);jobId(v.entityId);return await this.p.knowledge({op:'scholarly-backlinks',entityId:v.entityId},signal) as any;}
  object(v,op==='academic.import'?['id','source']:['id']);jobId(v.id);
  if(op==='academic.import'){
   if(!doiInput(v.source))throw Error('Provide a DOI or doi.org URL');
   await this.p.jobs.create(v.id,{kind:'academic',source:v.source});
  }
  if(op==='academic.inspect'){
   let r=await this.p.jobs.load(v.id);if(r.preparation.kind!=='academic')throw Error('Not an academic job');
   if(r.summary.state==='running'){let lease;try{lease=await this.p.jobs.acquire(v.id);}catch(e){if((e as Error).message!=='Job is executing in another host')throw e;}
    if(lease)try{r=await this.p.jobs.load(v.id);if(r.summary.state==='running')r=await this.p.jobs.checkpoint({...r,summary:{...r.summary,state:'interrupted',error:'Execution stopped; explicit resume required'}},r.summary.revision);}finally{await lease.close();}
   }return {job:r.summary,source:(r.preparation as {kind:'academic';source:string}).source} as any;
  }
  if(!['academic.import','academic.resume'].includes(op))throw Error('Unknown academic operation');
  if(this.queued>=16)throw Error('Academic queue is full; retry later');this.queued++;
  const task=this.tail.then(()=>this.run(v.id,signal));this.tail=task.catch(()=>{});
  try{return await task as any;}finally{this.queued--;}
 }
 private async run(id:string,signal?:AbortSignal){
  if(this.closed)throw Error('Academic services closed');signal?.throwIfAborted();
  const c=this.active=new AbortController(),abort=()=>c.abort();signal?.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(abort,60000);let lease:Awaited<ReturnType<JobStorage['acquire']>>|undefined;
  try{
   lease=await this.p.jobs.acquire(id);let r=await this.p.jobs.load(id);
   if(r.preparation.kind!=='academic')throw Error('Not an academic job');
   const doi=doiInput(r.preparation.source)!.doi;
   const checkpoint=async(state:JobRecord['summary']['state'],result=r.result,error?:string)=>r=await this.p.jobs.checkpoint({...r,result,summary:{...r.summary,state,error}},r.summary.revision);
   const prepared=r.result?JSON.parse(new TextDecoder().decode(await this.p.jobs.readResult(id,r.result))):undefined;
   if(r.summary.state==='completed')return {citation:prepared.citation as ScholarlyCitation,jobId:id};
   await checkpoint('running');
   try{
    let request:AcademicCommit|undefined=prepared?.request;
    if(!request){
     const local=await this.p.knowledge({op:'scholarly-lookup',doi},c.signal);
     if(local.citation){
      const result=await this.p.jobs.putResult(id,new TextEncoder().encode(JSON.stringify({citation:local.citation})));
      await checkpoint('completed',result);return {citation:local.citation,jobId:id};
     }
     const source=await this.p.acquire(doi,c.signal);c.signal.throwIfAborted();
     const normalized=await this.p.executor.run({kind:'academic-normalize',doi,provider:source.provider,bytes:source.bytes},c.signal) as AcademicNormalized;
     if(new TextEncoder().encode(JSON.stringify(normalized.metadata)).length>24000)throw Error('Citation metadata exceeds canonical request budget; original not imported');
     const asset=await this.p.retain(source.bytes,c.signal);c.signal.throwIfAborted();
     request={op:'scholarly-commit',doi,operationId:id,identityId:this.p.uuid(),citation:{version:1,entityId:this.p.uuid(),resourceId:this.p.uuid(),snapshotId:this.p.uuid(),provider:source.provider,endpoint:source.endpoint,retrievedAt:this.p.now(),asset,metadata:normalized.metadata}};
     const result=await this.p.jobs.putResult(id,new TextEncoder().encode(JSON.stringify({request})));
     await checkpoint('running',result); // publish exact retry evidence before canonical dispatch
    }
    c.signal.throwIfAborted();await this.p.verify(request.citation.asset,c.signal);
    const {citation}=await this.p.knowledge(request,c.signal);
    const result=await this.p.jobs.putResult(id,new TextEncoder().encode(JSON.stringify({citation})));
    await checkpoint('completed',result);return {citation,jobId:id};
   }catch(e){
    const observed=await this.p.jobs.load(id);
    if(observed.summary.state!=='completed'){r=observed;await checkpoint(c.signal.aborted?'cancelled':'failed',r.result,String((e as Error).message).slice(0,500));}
    throw Error(`${(e as Error).message} Academic job ${id} can be inspected/resumed; published knowledge may be retained.`);
   }
  }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);this.active=undefined;await lease?.close();}
 }
 async close(){this.closed=true;this.active?.abort();await this.tail;}
}
