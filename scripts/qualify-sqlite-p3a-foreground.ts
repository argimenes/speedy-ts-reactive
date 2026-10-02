/** Disposable P3a contention controls; no production query/persistence API. */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {randomUUID,createHash} from 'node:crypto';
import {SqliteKnowledgeHost} from '../server/sqlite-knowledge-host';
import {createSavedIndexer,ManagedPair} from '../server/sqlite-saved-indexer';
import {decodeBlockTree} from '../src/block-tree/codecs';
import {captureNative,nativeText} from '../src/persistence/native-resource';
import {exportMarkdown} from '../src/persistence/markdown';
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'p3a-foreground-')));
const result:any={utc:new Date().toISOString(),node:process.version,cpu:os.cpus()[0].model,memoryBytes:os.totalmem(),controls:[],notes:['Single diagnostic samples; not p95 guarantees.','Foreground wait excludes the foreground save itself. Existing native pair validation/encoding is not optimized.','Cancellation-to-stage-settled is observed by the host and may include main-thread foreground validation time.','Critical-section durations exclude lock acquisition; foreground wait includes release/acquisition coordination.']};
try{
 for(const count of [100,1000,10000]){
  const dir=path.join(root,String(count));await fs.mkdir(dir);
  const state=decodeBlockTree({id:'doc',type:'document-block',metadata:{documentId:'resource',title:'Seed'},children:Array.from({length:count},(_,i)=>({id:'b'+i,type:'plain-text-block',text:`Paragraph ${i}`}))}).state;
  const resource:any=structuredClone(captureNative(state,'resource')),doc=resource.contents[resource.placements[resource.rootPlacementKey].target.contentKey],text=Object.values<any>(resource.contents).find(c=>c.payload.id==='b1');
  const generation=(title:string)=>{text.payload.text=title;const native=nativeText(resource),md=exportMarkdown(resource);return {resourceId:'resource',generation:randomUUID(),native,markdown:md.text,profile:md.profile,targets:[]};};
  const pair=new ManagedPair({root:dir,resourceId:'resource',nativeName:'study.mutable.json',markdownName:'study.md'});
  let baseline:any={nativeHash:null,markdownHash:null,generation:null};
  const save=async(g:any)=>{const t=performance.now(),r=await pair.save(g,undefined,baseline);if(r.phase!=='saved')throw Error(JSON.stringify(r));baseline={nativeHash:hash(g.native),markdownHash:hash(g.markdown),generation:g.generation};return performance.now()-t;};
  await save(generation('Seed'));
  let index:any,client:any,lastResult:any,armed=false,reach:()=>void,stageSettled=0;const reached=new Promise<void>(r=>reach=r),committed:string[]=[];
  let publishArmed=false,publishReach:()=>void;const publicationReady=new Promise<void>(r=>publishReach=r);
  const host=new SqliteKnowledgeHost({root:dir,debounceMs:60000,indexer:(c:any,o:any)=>{
   client=c;const stage=c.stageSaved,commit=c.commitSaved;
   c.stageSaved=(p:any,signal?:AbortSignal)=>{const racing=armed;if(racing){armed=false;reach();}const work=stage(p,signal);return racing?work.finally(()=>stageSettled=performance.now()):work;};
   c.commitSaved=async(...args:any[])=>{const publishing=publishArmed;publishArmed=false;const work=commit(...args);if(publishing)publishReach();const r=await work;committed.push(r.contentHash);return r;};
   index=createSavedIndexer(c,o);const refresh=index.refresh.bind(index);index.refresh=async(...args:any[])=>lastResult=await refresh(...args);return index;
  }});
  try{
   const lease=await host.acquire('.');await host.flush();
   await save(generation('One Block changed'));await host.refresh(lease.lease);
   const uncontented=structuredClone(index.lastTimings);
   // Capture a successful prepared read's detailed phase timings through the same indexer.
   const full=lastResult;if(!full.complete)throw Error(JSON.stringify(full));
   const next=generation('Background candidate'),foreground=generation('Foreground saved');await save(next);
   armed=true;const race=host.refresh(lease.lease);await reached;const raceTimings=index.lastTimings;
   await new Promise(r=>setTimeout(r,Math.min(50,count/20)));
   const canceledAt=performance.now(),priorWait=host.metrics.foregroundWaitMs;
   const foregroundSaveMs=await host.foreground(()=>host.store.lock(()=>save(foreground)));
   await race;const backgroundDrainMs=performance.now()-canceledAt;
   if(committed.includes(hash(next.native)))throw Error('Stale background candidate was committed');
   await host.flush();const projection=await client.resourceProjection('resource');
   if(projection.blocks.find((b:any)=>b.block.guid==='b1').block.text!=='Foreground saved')throw Error('Latest saved bytes not reconciled');
   const recovery=structuredClone(index.lastTimings),firstWait=host.metrics.foregroundWaitMs-priorWait;
   await save(generation('Publication candidate'));const publicationForeground=generation('Publication foreground');
   publishArmed=true;const publishing=host.refresh(lease.lease);await publicationReady;const publicationTimings=index.lastTimings;
   const priorPublicationWait=host.metrics.foregroundWaitMs;
   const publicationSaveMs=await host.foreground(()=>host.store.lock(()=>save(publicationForeground)));
   await publishing;const publicationWaitMs=host.metrics.foregroundWaitMs-priorPublicationWait;await host.flush();
   const final=await client.resourceProjection('resource');
   if(final.blocks.find((b:any)=>b.block.guid==='b1').block.text!=='Publication foreground')throw Error('Publication race did not recover');
   result.controls.push({blocks:count,uncontented,preparedPhases:full.reconciled[0],race:structuredClone(raceTimings),foregroundWaitMs:firstWait,foregroundSaveMs,cancellationToStageSettledMs:stageSettled-canceledAt,backgroundDrainMs,recovery,staleCandidateCommitted:false,latestSavedPublished:true,publicationRace:{foregroundWaitMs:publicationWaitMs,foregroundSaveMs:publicationSaveMs,timings:structuredClone(publicationTimings),latestSavedPublished:true},integrity:await client.verify()});
  }finally{await host.close();}
 }
 console.log(JSON.stringify(result,null,2));
}finally{await fs.rm(root,{recursive:true,force:true});}
