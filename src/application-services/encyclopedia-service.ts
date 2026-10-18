import {wikipediaInput,validQid,type WikiSnapshot,type ArticleProjection,type WikidataProjection} from '../interchange/encyclopedia';
import type {EncyclopediaCapabilities,EncyclopediaOperations,EncyclopediaProjection} from './encyclopedia-contracts';
import {object,jobId} from './validation';
/** Bounded, Vault-owned jobs; document insertion is owned by the caller. */
export class EncyclopediaService {
 private tail:Promise<unknown>=Promise.resolve();private count=0;private controllers=new Set<AbortController>();private closed=false;
 constructor(private p:EncyclopediaCapabilities){}
 async call<K extends keyof EncyclopediaOperations>(op:K,input:EncyclopediaOperations[K]['input'],signal?:AbortSignal):Promise<EncyclopediaOperations[K]['output']>{
  if(this.closed)throw Error('Encyclopedia service closed');signal?.throwIfAborted();const v=input as any;
  if(op==='encyclopedia.review'){
   object(v,['operationId','snapshotId','statementId','decision']);jobId(v.operationId);jobId(v.snapshotId);
   if(typeof v.statementId!=='string'||v.statementId.length>200||!['accepted','rejected'].includes(v.decision))throw Error('Invalid review');
   return this.schedule(async s=>{
    const {snapshot}=await this.p.knowledge({op:'wiki-snapshot',snapshotId:v.snapshotId},s);if(snapshot.kind!=='wikidata')throw Error('Not a Wikidata snapshot');
    const projection=await this.projection(snapshot,s) as WikidataProjection,statement=projection.statements.find(x=>x.id===v.statementId);
    if(!statement||v.decision==='accepted'&&!statement.supported)throw Error('Statement cannot be accepted');
    return this.p.knowledge({op:'wiki-review',operationId:v.operationId,snapshotId:v.snapshotId,decision:v.decision,statement:v.decision==='rejected'?{id:statement.id,supported:statement.supported}:statement},s);
   },signal) as any;
  }
  object(v,op==='encyclopedia.import'?['id','source']:op==='encyclopedia.enrich'?['id','snapshotId']:['id']);jobId(v.id);
  if(op==='encyclopedia.import'){
   if(!wikipediaInput(v.source))throw Error('Provide a Wikipedia article URL');
   await this.p.jobs.create(v.id,{kind:'encyclopedia',source:v.source});
  }else if(op==='encyclopedia.enrich'){
   jobId(v.snapshotId);const {snapshot}=await this.p.knowledge({op:'wiki-snapshot',snapshotId:v.snapshotId},signal);
   if(snapshot.kind!=='article'||!validQid(snapshot.qid))throw Error('No declared Wikidata subject');
   await this.p.jobs.create(v.id,{kind:'encyclopedia',source:snapshot.qid});
  }else if(!['encyclopedia.inspect','encyclopedia.resume'].includes(op))throw Error('Unknown encyclopedia operation');
  if(op==='encyclopedia.inspect'){
   let r=await this.p.jobs.load(v.id);if(r.preparation.kind!=='encyclopedia')throw Error('Wrong job kind');
   if(r.summary.state==='running'){let lease;try{lease=await this.p.jobs.acquire(v.id);}catch(e){if((e as Error).message!=='Job is executing in another host')throw e;}
    if(lease)try{r=await this.p.jobs.load(v.id);if(r.summary.state==='running')r=await this.p.jobs.checkpoint({...r,summary:{...r.summary,state:'interrupted'}},r.summary.revision);}finally{await lease.close();}}
   return {job:r.summary,source:(r.preparation as any).source} as any;
  }
  return this.schedule(s=>this.run(v.id,s),signal) as any;
 }
 private async schedule<T>(fn:(s:AbortSignal)=>Promise<T>,signal?:AbortSignal){
  if(this.count>=16)throw Error('Encyclopedia queue full');this.count++;
  const task=this.tail.then(async()=>{if(this.closed)throw Error('Service closed');signal?.throwIfAborted();const c=new AbortController(),abort=()=>c.abort();this.controllers.add(c);signal?.addEventListener('abort',abort,{once:true});const timer=setTimeout(abort,60000);try{return await fn(c.signal);}finally{clearTimeout(timer);this.controllers.delete(c);signal?.removeEventListener('abort',abort);}});
  this.tail=task.catch(()=>{});try{return await task;}finally{this.count--;}
 }
 private async projection(snapshot:WikiSnapshot,signal:AbortSignal):Promise<EncyclopediaProjection>{
  const responses=[];for(const asset of snapshot.assets){if(asset.cavernId!==this.p.cavernId)throw Error('Wrong Vault capture');responses.push(await this.p.original(asset,signal));}
  return await this.p.executor.run({kind:'encyclopedia-normalize',source:snapshot.kind==='article'?{site:snapshot.site!,oldid:snapshot.revision,sourceUrl:snapshot.endpoint}:snapshot.qid!,responses},signal) as EncyclopediaProjection;
 }
 private async result(snapshot:WikiSnapshot,signal:AbortSignal){
  const projection=await this.projection(snapshot,signal);
  return snapshot.kind==='article'?{snapshot,projection}:{snapshot,projection,...await this.p.knowledge({op:'wiki-context',snapshotId:snapshot.snapshotId},signal)};
 }
 private async run(id:string,signal:AbortSignal){
  const lease=await this.p.jobs.acquire(id);let r:import('./capabilities').JobRecord;
  try{r=await this.p.jobs.load(id);}catch(error){await lease.close();throw error;}
  const checkpoint=async(state:typeof r.summary.state,result=r.result,error?:string)=>r=await this.p.jobs.checkpoint({...r,result,summary:{...r.summary,state,error}},r.summary.revision);
  try{
   if(r.preparation.kind!=='encyclopedia')throw Error('Wrong job kind');
   let saved=r.result?JSON.parse(new TextDecoder().decode(await this.p.jobs.readResult(id,r.result))):undefined;
   if(r.summary.state==='completed')return this.result(saved.snapshot,signal);
   await checkpoint('running');
   if(!saved?.request){
    const source=validQid(r.preparation.source)?r.preparation.source:wikipediaInput(r.preparation.source)!;
    const acquired=await this.p.acquire(source,signal);
    const projection=await this.p.executor.run({kind:'encyclopedia-normalize',source,responses:acquired.responses},signal) as EncyclopediaProjection;
    const assets=[];for(const bytes of acquired.responses){signal.throwIfAborted();assets.push(await this.p.retain(bytes,signal));}
    const article=typeof source!=='string',p=projection as ArticleProjection & WikidataProjection;
    const snapshot:WikiSnapshot={version:1,kind:article?'article':'wikidata',entityId:this.p.uuid(),resourceId:this.p.uuid(),identityId:this.p.uuid(),snapshotId:this.p.uuid(),revision:p.revision,title:article?p.title:p.label,retrievedAt:this.p.now(),endpoint:acquired.endpoint,assets,...(p.qid?{qid:p.qid}:{}),...(article?{site:p.site,pageId:p.pageId,association:'current-page-properties' as const}:{})};
    saved={request:{op:'wiki-commit',operationId:id,snapshot}};
    await checkpoint('running',await this.p.jobs.putResult(id,new TextEncoder().encode(JSON.stringify(saved))));
   }
   // Verify immutable bytes on recovery before canonical publication.
   await this.projection(saved.request.snapshot,signal);signal.throwIfAborted();
   const result=await this.p.knowledge(saved.request,signal);
   await checkpoint('completed',await this.p.jobs.putResult(id,new TextEncoder().encode(JSON.stringify(result))));
   return this.result(result.snapshot,signal);
  }catch(e){if(r.summary.state!=='completed')await checkpoint(signal.aborted?'cancelled':'failed',r.result,String((e as Error).message).slice(0,500));throw Error(`${(e as Error).message}. Encyclopedia job ${id} can be inspected/resumed; retained knowledge is independent of insertion.`);}
  finally{await lease.close();}
 }
 async close(){this.closed=true;for(const c of this.controllers)c.abort();await this.tail;}
}
