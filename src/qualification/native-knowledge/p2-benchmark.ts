/** P2 isolated, raised-total-budget control. Production per-resource limits are unchanged. */
import {promises as fs} from 'node:fs';import path from 'node:path';import os from 'node:os';
import {NativeKnowledgeJobs} from '../../../server/native-knowledge-jobs';
// @ts-expect-error Existing JavaScript managed-store adapter; qualification only.
import {NativeVaultStore} from '../../../server/native-vault-store.mjs';
import {fixtureText} from './fixture';import {lightweightFacts} from '../../knowledge/saved-reader';import {decodeFacts,encodeFacts} from '../../knowledge/transport';
// @ts-expect-error Existing JavaScript managed-pair adapter.
import {hash} from '../../persistence/managed-pair.mjs';
const size=Number(process.argv[2]??100);if(![100,1000,10000].includes(size))throw Error('Expected 100/1000/10000');
const out=process.env.P2_ARTIFACTS??'artifacts/native-knowledge-p2';await fs.mkdir(out,{recursive:true});const root=await fs.mkdtemp(path.join(os.tmpdir(),'native-p2-measure-'));
const j=new NativeKnowledgeJobs({workerURL:new URL('file://'+path.join(process.cwd(),'dist/server/native-knowledge-worker.js'))});
const measure=async(fn:()=>Promise<any>)=>{const delays:number[]=[];let last=performance.now();const timer=setInterval(()=>{const now=performance.now();delays.push(Math.max(0,now-last-5));last=now;},5);await new Promise(r=>setTimeout(r,10));const start=performance.now();const result=await fn();const elapsedMs=performance.now()-start;await new Promise(r=>setTimeout(r,10));clearInterval(timer);delays.sort((a,b)=>a-b);return {elapsedMs,heartbeat:{samples:delays.length,p95:delays[Math.floor(delays.length*.95)],max:delays.at(-1)},result};};
try{
 for(let i=0;i<size;i++)await fs.writeFile(path.join(root,i+'.mutable.json'),fixtureText(i,size));
 global.gc?.();const initial=process.memoryUsage();
 const totals={readHashMs:0,validationMs:0,factsMs:0,encodeMs:0,workerMs:0,roundTripMs:0,publicationMs:0,wireBytes:0,workerHeapPeak:0,serverHeapPeak:0};let saved=new Map();
 const run=await measure(async()=>{
  for(let i=0;i<size;i++){
   const start=performance.now(),input=await fs.readFile(path.join(root,i+'.mutable.json')),digest=hash(input);totals.readHashMs+=performance.now()-start;
   const r=await j.run('facts',input,{policy:{version:1,opaqueTypes:[]}});if(r.byteHash!==digest||r.inspection.resourceId!=='resource-'+i)throw Error('Mismatch');
   for(const k of ['validationMs','factsMs','encodeMs','workerMs','roundTripMs'] as const)totals[k]+=r.timings[k]??0;
   totals.workerHeapPeak=Math.max(totals.workerHeapPeak,r.memory);totals.wireBytes+=Buffer.byteLength(r.wire!);
   const publish=performance.now(),facts=decodeFacts(r.wire!);if(facts.diagnostics.length)throw Error('Unexpected incomplete');saved.set(facts.id,facts);totals.publicationMs+=performance.now()-publish;
   if(i%100===0)totals.serverHeapPeak=Math.max(totals.serverHeapPeak,process.memoryUsage().heapUsed);
   if(i===0&&size===100)await fs.writeFile(path.join(out,'sample-facts.json'),r.wire!);
   if((i+1)%1000===0)console.log(`P2 worker ${i+1}/${size}`);
  }return {resources:saved.size};
 });
 global.gc?.();const retained=process.memoryUsage();saved.clear();saved=new Map();await j.close();global.gc?.();const released=process.memoryUsage();
 // Same new semantic work without worker/transport; separate, not end-to-end comparison.
 const control={validationMs:0,factsMs:0,encodePublishMs:0};const direct=await measure(async()=>{for(let i=0;i<size;i++){const input=await fs.readFile(path.join(root,i+'.mutable.json')),r=await lightweightFacts(input,undefined,{extraction:{version:1,opaqueTypes:[]}});control.validationMs+=r.timings.validationMs;control.factsMs+=r.timings.factsMs;
   if(process.env.P2_MATCHED_CONTROL){const start=performance.now();saved.set(r.facts.id,decodeFacts(encodeFacts(r.facts)));control.encodePublishMs+=performance.now()-start;}
  }return control;});saved.clear();global.gc?.();
 const discovery:any[]=[];
 // Keep production 10,000-entry bound. Measure managed discovery only on 100/1000.
 if(size<10000&&!process.env.P2_SKIP_DISCOVERY)for(const worker of [false,true]){
  const reader=new NativeKnowledgeJobs({workerURL:new URL('file://'+path.join(process.cwd(),'dist/server/native-knowledge-worker.js'))});let readMs=0,inspectMs=0,validationMs=0;
  const store=new NativeVaultStore({root,nativeDiscoveryWorker:worker,...(worker?{inspect:async(bytes:Uint8Array,signal?:AbortSignal)=>{const start=performance.now(),r=await reader.run('inspect',bytes,{signal});inspectMs+=performance.now()-start;validationMs+=r.timings.validationMs;return r;}}:{})});
  const original=store.read.bind(store);store.read=async(...args:any[])=>{const start=performance.now();try{return await original(...args);}finally{readMs+=performance.now()-start;}};
  const hashBefore=(globalThis as any).__p2HashMs??0;
  const result=await measure(async()=>{const scan=await store.discover('.');if(!scan.complete||scan.documents.length!==size)throw Error('Discovery mismatch');return {resources:scan.documents.length,complete:scan.complete};});
  discovery.push({worker,...result,readMs,hashMs:((globalThis as any).__p2HashMs??0)-hashBefore,inspectMs,validationMs});await reader.close();
 }
 const result={size,environment:{node:process.version,cpu:os.cpus()[0]?.model},method:'Fresh process; warm OS files; raised total extraction budget only. One worker, serialized requests. Derived Map publication is a qualification sink, not a product index. Heartbeat is Node scheduling, not browser input.',worker:run,totals,control:direct,discovery,memory:{initial,retained,released,workerHeapPeak:totals.workerHeapPeak,processPeakRssKiB:process.resourceUsage().maxRSS},discoveryNote:size===10000?'Not a managed 10,000-resource startup measurement; production directory budget unchanged.':undefined};
 await fs.writeFile(path.join(out,`benchmark-${size}.json`),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({size,workerMs:run.elapsedMs,controlMs:direct.elapsedMs,validationMs:totals.validationMs,factsMs:totals.factsMs,encodeMs:totals.encodeMs,publicationMs:totals.publicationMs,heapDelta:retained.heapUsed-initial.heapUsed}));
}finally{await j.close();await fs.rm(root,{recursive:true,force:true});}
