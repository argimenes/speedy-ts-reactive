/** Application workflow implementation. All authority and execution are injected;
 * no Express, Node filesystem, browser state or live editor repository. */
import type {ApplicationServices,Operation,OperationMap,PreparationResult,JobState} from './contracts';
import type {ServiceCapabilities,JobRecord,Inventory} from './capabilities';
import {object,preparation,nativeRead,packageRequest,assetId,jobId} from './validation';
export class ApplicationService implements ApplicationServices {
 private running=new Map<string,{controller:AbortController;done:Promise<unknown>}>();private closed=false;
 constructor(private ports:ServiceCapabilities){}
 async call<K extends Operation>(operation:K,input:OperationMap[K]['input'],signal?:AbortSignal):Promise<OperationMap[K]['output']>{
  if(this.closed)throw Error('Application services closed');signal?.throwIfAborted();
  const v=input as any;let output:unknown;
  switch(operation){
   case 'native.read':nativeRead(v);output=await this.ports.readNative(v,signal);break;
   case 'assets.original':object(v,['assetId']);assetId(v.assetId);output=await this.ports.originalAsset(v.assetId,signal);break;
   case 'knowledge.packageData':packageRequest(v);output=await this.ports.packageData(v,signal);break;
   case 'jobs.create':object(v,['id','preparation']);jobId(v.id);preparation(v.preparation);output=(await this.ports.jobs.create(v.id,v.preparation)).summary;break;
   case 'jobs.inspect':object(v,['id']);jobId(v.id);output=(await this.inspect(v.id)).summary;break;
   case 'jobs.list':object(v,['after']);if(v.after!==undefined)jobId(v.after);output=await this.ports.jobs.list(v.after);break;
   case 'jobs.run':object(v,['id','expectedRevision']);jobId(v.id);if(!Number.isSafeInteger(v.expectedRevision)||v.expectedRevision<0)throw Error('Expected job revision required');output=await this.run(v.id,v.expectedRevision,signal);break;
   case 'jobs.cancel':object(v,['id']);jobId(v.id);output=await this.cancel(v.id);break;
   case 'jobs.result':{
    object(v,['id']);jobId(v.id);const r=await this.ports.jobs.load(v.id);if(r.summary.state!=='completed'||!r.result)throw Error('No completed result');
    const bytes=await this.ports.jobs.readResult(v.id,r.result);output=r.preparation.kind==='package'?{kind:'package',mediaType:'application/zip',bytes}:JSON.parse(new TextDecoder().decode(bytes));break;
   }
   default:throw Error('Unsupported application operation');
  }
  signal?.throwIfAborted();return output as OperationMap[K]['output'];
 }
 private async transition(r:JobRecord,state:JobState,error?:string){
  return this.ports.jobs.checkpoint({...r,summary:{...r.summary,state,error}},r.summary.revision);
 }
 private async inspect(id:string){
  const r=await this.ports.jobs.load(id);if(r.summary.state!=='running'||this.running.has(id))return r;
  let lease;try{lease=await this.ports.jobs.acquire(id);}catch(e){if((e as Error).message==='Job is executing in another host')return r;throw e;}
  try{const current=await this.ports.jobs.load(id);return current.summary.state==='running'?await this.transition(current,'interrupted','Host stopped before outcome was recorded; explicit resume required'):current;}finally{await lease.close();}
 }
 private run(id:string,expectedRevision:number,signal?:AbortSignal){
  if(this.running.has(id))return Promise.reject(Error('Job is already running'));
  if(this.running.size>=1)return Promise.reject(Error('Application job capacity reached'));
  const controller=new AbortController(),cancel=()=>controller.abort();signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel();
  const done=this.execute(id,expectedRevision,controller.signal).finally(()=>{signal?.removeEventListener('abort',cancel);this.running.delete(id);});
  this.running.set(id,{controller,done});return done;
 }
 private async execute(id:string,expectedRevision:number,signal:AbortSignal){
  const lease=await this.ports.jobs.acquire(id);
  try{
   let r=await this.ports.jobs.load(id);if(r.summary.revision!==expectedRevision)throw Error('Job revision changed; inspect before running');
   if(!['ready','interrupted','failed'].includes(r.summary.state))throw Error('Job is not resumable');
   signal.throwIfAborted();r=await this.transition(r,'running');
   try{
    const p=r.preparation;let result:PreparationResult;
    if(p.kind==='iiif')throw Error('Use iiif.resume for IIIF jobs');
    if(p.kind==='encyclopedia')throw Error('Use encyclopedia.resume for encyclopedia jobs');
    if(p.kind==='academic')throw Error('Use academic.resume for scholarly jobs');
    if(p.kind==='convert')result=await this.ports.executor.run(p,signal) as PreparationResult;
    else{
     const document=await this.ports.readNative(p.document,signal),native=new TextEncoder().encode(document.native);
     if(native.length>8*1024*1024)throw Error('Native resource exceeds package limit');
     const inventory=await this.ports.executor.run({kind:'inventory',native},signal) as Inventory;
     if(inventory.assets.length>20)throw Error('Package asset count exceeded');
     const context=await this.ports.packageData({...p.knowledge,entities:inventory.entities,claimsById:inventory.claims,documentHash:document.sha256},signal);
     const assets=[];let size=0;
     for(const ref of inventory.assets){signal.throwIfAborted();if(ref.cavernId!==this.ports.cavernId)throw Error('Package asset belongs to another Cavern');const a=await this.ports.originalAsset(ref.assetId,signal);size+=a.bytes.length;if(size>40*1024*1024||assets.length>=20)throw Error('Package asset budget exceeded');assets.push({reference:ref,bytes:a.bytes,mediaType:a.mediaType});}
     result=await this.ports.executor.run({kind:'package',native,source:{cavernId:this.ports.cavernId,resourceId:document.resourceId},context,assets},signal) as PreparationResult;
     // A reviewed saved document cannot silently change during preparation.
     await this.ports.readNative(p.document,signal);
    }
    signal.throwIfAborted();const bytes=result.kind==='package'?result.bytes:new TextEncoder().encode(JSON.stringify(result));
    const stored=await this.ports.jobs.putResult(id,bytes);signal.throwIfAborted();
    r=await this.ports.jobs.checkpoint({...r,result:stored,summary:{...r.summary,state:'completed',resultBytes:bytes.length}},r.summary.revision);
   }catch(error){
    // A lost completion acknowledgement may already have published its checkpoint.
    const observed=await this.ports.jobs.load(id);if(observed.summary.state==='completed')return observed.summary;
    r=await this.transition(observed,signal.aborted?'cancelled':'failed',String(error instanceof Error?error.message:error).slice(0,500));
   }
   return r.summary;
  }finally{await lease.close();}
 }
 private async cancel(id:string){
  const live=this.running.get(id);if(live){live.controller.abort();await live.done.catch(()=>{});return (await this.ports.jobs.load(id)).summary;}
  const lease=await this.ports.jobs.acquire(id);try{const r=await this.ports.jobs.load(id);return ['completed','cancelled'].includes(r.summary.state)?r.summary:(await this.transition(r,'cancelled')).summary;}finally{await lease.close();}
 }
 async close(){this.closed=true;for(const r of this.running.values())r.controller.abort();await Promise.allSettled([...this.running.values()].map(r=>r.done));await this.ports.executor.close();await this.ports.jobs.close();}
}
