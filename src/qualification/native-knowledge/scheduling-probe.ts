/** Scheduling proof only. No application worker/protocol is installed. */
import {Worker,isMainThread,parentPort,workerData} from 'node:worker_threads';
import {promises as fs} from 'node:fs';
import {fixtureText} from './fixture';import {decode,extract} from './extract';import {lightweightFacts} from './lightweight';
const bytes=(v:unknown)=>new TextEncoder().encode(typeof v==='string'?v:JSON.stringify(v));
if(!isMainThread){
 const result=await lightweightFacts(workerData,'probe','hash');parentPort!.postMessage({blocks:result.facts.blocks.length,diagnostics:result.facts.diagnostics,timings:result.timings});
}else{
 const ordinary=bytes(fixtureText(0,3)),wire=JSON.parse(fixtureText(0,3)),root=wire.document.blocks.find((b:any)=>b.id==='resource-0-root');root.children=[];wire.document.blocks=[root];delete root.properties.linkedAnnotations;
 for(let i=0;i<10001;i++){wire.document.blocks.push({id:`plain-${i}`,type:'plain-text-block',properties:{text:'bounded'}});root.children.push({placementId:`p-${i}`,kind:'owned',target:{kind:'local',blockId:`plain-${i}`}});}
 const heavy=bytes(wire),results:Array<Record<string,unknown>>=[];
 const probe=async(label:string,fn:()=>Promise<unknown>)=>{
  const delays:number[]=[];let previous=performance.now();const timer=setInterval(()=>{const now=performance.now();delays.push(Math.max(0,now-previous-5));previous=now;},5);
  await new Promise(r=>setTimeout(r,10));const start=performance.now();const result=await fn(),elapsedMs=performance.now()-start;
  await new Promise(r=>setTimeout(r,10));clearInterval(timer);delays.sort((a,b)=>a-b);
  results.push({label,elapsedMs,timerSamples:delays.length,p95DelayMs:delays[Math.floor(delays.length*.95)],maxDelayMs:Math.max(...delays),result});
 };
 await probe('full decoder: ordinary note',async()=>({blocks:(await extract(decode(ordinary),'probe','hash')).blocks.length}));
 await probe('light reader: ordinary note',async()=>({blocks:(await lightweightFacts(ordinary,'probe','hash')).facts.blocks.length}));
 await probe('light reader: 10,001 Block input on caller thread',async()=>{const r=await lightweightFacts(heavy,'probe','hash');return {blocks:r.facts.blocks.length,diagnostics:r.facts.diagnostics};});
 await probe('light reader: same input in disposable Node worker',()=>new Promise((resolve,reject)=>{
  const worker=new Worker(new URL(import.meta.url),{workerData:heavy});worker.once('message',resolve);worker.once('error',reject);worker.once('exit',code=>{if(code)reject(Error(`Worker exit ${code}`));});
 }));
 await fs.mkdir('artifacts/native-facts',{recursive:true});await fs.writeFile('artifacts/native-facts/scheduling-results.json',JSON.stringify({method:'5ms timer; one sample per case; Node event-loop surrogate, not browser input latency. Worker timing includes startup and input transfer; return is a small summary, not the full facts payload.',ordinaryBytes:ordinary.length,heavyBytes:heavy.length,results},null,2)+'\n');
}
