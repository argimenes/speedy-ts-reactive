import {promises as fs} from 'node:fs';import os from 'node:os';import path from 'node:path';
import {NativeKnowledgeJobs} from '../../../server/native-knowledge-jobs';
// @ts-expect-error Existing JavaScript managed-store adapter; qualification only.
import {NativeVaultStore} from '../../../server/native-vault-store.mjs';
import {fixtureText} from './fixture';import {decodeFacts} from '../../knowledge/transport';
const out='artifacts/native-knowledge-p2';await fs.mkdir(out,{recursive:true});const root=await fs.mkdtemp(path.join(os.tmpdir(),'native-p2-large-'));
const workerURL=new URL('file://'+path.join(process.cwd(),'dist/server/native-knowledge-worker.js')),jobs=new NativeKnowledgeJobs({workerURL});
const v=JSON.parse(fixtureText(0,3)),doc=v.document.blocks.find((b:any)=>b.id==='resource-0-root');doc.children=[];v.document.blocks=[doc];delete doc.properties.linkedAnnotations;
for(let i=0;i<10001;i++){v.document.blocks.push({id:`plain-${i}`,type:'plain-text-block',properties:{text:'bounded'}});doc.children.push({placementId:`p-${i}`,kind:'owned',target:{kind:'local',blockId:`plain-${i}`}});}
const bytes=new TextEncoder().encode(JSON.stringify(v));const rows:any[]=[];
const measure=async(label:string,fn:()=>Promise<unknown>)=>{const delays:number[]=[];let prev=performance.now();const timer=setInterval(()=>{const now=performance.now();delays.push(Math.max(0,now-prev-5));prev=now;},5);await new Promise(r=>setTimeout(r,10));const start=performance.now(),result=await fn();const ms=performance.now()-start;await new Promise(r=>setTimeout(r,10));clearInterval(timer);rows.push({label,ms,maxHeartbeatDelay:Math.max(...delays),result});};
try{
 await fs.writeFile(path.join(root,'large.mutable.json'),bytes);
 for(const worker of [false,true])for(let run=0;run<3;run++)await measure(`${worker?'worker':'legacy'} discovery ${run}`,async()=>{
  const store=new NativeVaultStore({root,nativeDiscoveryWorker:worker,...(worker?{inspect:async(data:Uint8Array,signal?:AbortSignal)=>jobs.run('inspect',data,{signal})}:{})}),scan=await store.discover('.');
  if(!scan.complete||scan.documents.length!==1)throw Error('Large discovery must be ready');return {complete:scan.complete,resourceId:scan.documents[0].resourceId};
 });
 await measure('worker large Facts incl transport + server decode',async()=>{const r=await jobs.run('facts',bytes,{policy:{version:1,opaqueTypes:[]}}),start=performance.now(),facts=decodeFacts(r.wire!);const publicationMs=performance.now()-start;await fs.writeFile(path.join(out,'large-facts.json'),r.wire!);return {blocks:facts.blocks.length,diagnostics:facts.diagnostics,timings:r.timings,publicationMs,wireBytes:Buffer.byteLength(r.wire!),workerHeap:r.memory};});
 await measure('abort synchronous large inspection + worker recreation',async()=>{const c=new AbortController(),start=performance.now(),pending=jobs.run('inspect',bytes,{signal:c.signal});const aborted=pending.then(()=>{throw Error('Unexpected completion');},e=>({error:e.message,abortObservedMs:performance.now()-start}));setTimeout(()=>c.abort(),10);const result=await aborted;const ready=await jobs.run('inspect',new TextEncoder().encode(fixtureText(1,3)));return {...result,recreated:ready.inspection.resourceId};});
 const report={method:'10,001 plain-text Blocks plus root; three discovery repetitions; 5ms server timer; source bytes constant; complete ready discovery required. Large Facts remains explicitly partial at its unchanged 10,000-Block budget.',bytes:bytes.length,rows,memory:process.memoryUsage()};await fs.writeFile(path.join(out,'scheduling.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await jobs.close();await fs.rm(root,{recursive:true,force:true});}
