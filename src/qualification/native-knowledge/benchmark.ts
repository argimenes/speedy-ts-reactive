import {promises as fs} from 'node:fs';import path from 'node:path';import os from 'node:os';
import {rebuild,readNative} from './files';import {decode,extract,PROFILE} from './extract';import {fixtureText,fixtureStats} from './fixture';
import {matchSources} from '../../runtime/search-matching';
const size=Number(process.argv[2]??100);if(![100,1000,10000].includes(size))throw Error('Choose 100, 1000 or 10000');
const out=process.env.KNOWLEDGE_ARTIFACTS??'artifacts/native-knowledge';await fs.mkdir(out,{recursive:true});
const root=await fs.mkdtemp(path.join(os.tmpdir(),'mutable-knowledge-fixtures-'));
const round=(n:number)=>Math.round(n*1000)/1000;
const stats=(values:number[])=>{const a=values.sort((a,b)=>a-b);return{medianMs:round(a[Math.floor(a.length/2)]),p95Ms:round(a[Math.min(a.length-1,Math.floor(a.length*.95))]),maxMs:round(a.at(-1)!),samples:a.length};};
try{
 const generationStart=performance.now();
 for(let i=0;i<size;i++){const folder=path.join(root,`topic-${i%20}`,`batch-${Math.floor(i/200)}`);await fs.mkdir(folder,{recursive:true});const ext=i%5===0?'ink':'mutable.json';await fs.writeFile(path.join(folder,`note-${i}.${ext}`),fixtureText(i,size));await fs.writeFile(path.join(folder,`note-${i}.md`),'This projection deliberately does not contain the native facts.');}
 const fixtureMs=performance.now()-generationStart;global.gc?.();const memoryBefore=process.memoryUsage();let last=0;
 const built=await rebuild(root,undefined,n=>{if(n-last>=Math.max(100,size/10)){last=n;console.log(`Index ${size}: ${n} decoded`);}});
 global.gc?.();const retained=process.memoryUsage(),{index}=built;
 if(index.effective.size!==size||built.diagnostics.length)throw Error(JSON.stringify({count:index.effective.size,diagnostics:built.diagnostics}));
 const totals={resources:index.effective.size,blocks:0,annotations:0,mentions:0,documentReferences:0,entityMentions:0,characters:0};
 for(const f of index.effective.values()){totals.blocks+=f.blocks.length;totals.annotations+=f.annotations.length;totals.mentions+=f.mentions.length;totals.documentReferences+=f.mentions.filter(m=>m.kind==='document').length;totals.entityMentions+=f.mentions.filter(m=>m.kind==='entity').length;totals.characters+=f.blocks.reduce((n,b)=>n+(b.text?.runs.reduce((n,r)=>n+[...r.text].length,0)??0),0);}
 const measure=(fn:()=>unknown)=>{for(let i=0;i<100;i++)fn();const a=[];for(let i=0;i<1000;i++){const t=performance.now();fn();a.push(performance.now()-t);}return stats(a);};
 const queries={backlinks:measure(()=>index.backlinks('resource-0')),entityMentions:measure(()=>index.entityMentions('entity-0')),entitySources:measure(()=>index.entitySources('entity-0')),tag:measure(()=>[...(index.tags.get('topic-0')??[])]),traversal:measure(()=>index.traverse('resource-0',3,250,1000))};
 const example=index.effective.get('resource-0')!;const overlap=()=>example.annotations.filter(a=>a.type==='style/bold').flatMap(a=>example.annotations.filter(b=>b.type==='style/italics'&&a.blockId===b.blockId&&a.start<b.end&&b.start<a.end).map(b=>({blockId:a.blockId,start:Math.max(a.start,b.start),end:Math.min(a.end,b.end)})));
 const ranges={...measure(overlap),example:overlap()};
 // Whole-vault exact matcher: 1,000 per source and existing 50,000 candidate guard.
 // A budget rejection is a measured result, not a reason to lose rebuild measurements.
 const sources=[...index.effective.values()].flatMap(f=>f.blocks.filter(b=>b.text).map(b=>({contentKey:JSON.stringify([f.id,b.id]),version:0,...b.text!})));
 const searchStart=performance.now();let fullText;
 try{const search=matchSources(sources,'connected research',{},1000);fullText={ms:round(performance.now()-searchStart),sources:sources.length,returned:search.reduce((n,r)=>n+r.matches.length,0),truncated:search.some(r=>r.truncated)};}
 catch(error){fullText={ms:round(performance.now()-searchStart),sources:sources.length,error:String(error)};}
 const changed=fixtureText(0,size).replace('Research resource-0','Changed research title');const file=path.join(root,example.location);await fs.writeFile(file,changed);
 const incremental=[];for(let i=0;i<5;i++){const t=performance.now(),read=await readNative(root,example.location),facts=await extract(decode(read.bytes),example.location,read.hash);index.putSaved(facts);incremental.push(performance.now()-t);}
 if(index.effective.get('resource-0')?.title!=='Changed research title'||index.backlinks('resource-0').length!==4)throw Error('Incremental/query mismatch');
 const result={profile:PROFILE,size,environment:{node:process.version,platform:process.platform,arch:process.arch,cpu:os.cpus()[0]?.model,logicalCpus:os.cpus().length,systemMemoryBytes:os.totalmem()},method:'Fresh process; generated files already in OS cache; sequential safe reads; qualified full native decoder; explicit GC retained-heap samples; no mounted editors or resource admission',fixture:fixtureStats,fixtureGenerationMs:round(fixtureMs),metrics:Object.fromEntries(Object.entries(built.metrics).map(([k,v])=>[k,round(v)])),totals,memory:{baselineHeap:memoryBefore.heapUsed,retainedHeap:retained.heapUsed,retainedHeapDelta:retained.heapUsed-memoryBefore.heapUsed,baselineRss:memoryBefore.rss,retainedRss:retained.rss,processPeakRssKiB:process.resourceUsage().maxRSS},queries,ranges,fullText,incremental:stats(incremental),examples:{resource:example.id,root:example.rootBlockId,tagCount:index.tags.get('topic-0')?.size,backlinkCount:index.backlinks('resource-0').length,entityMentionCount:index.entityMentions('entity-0').length,entitySourceCount:index.entitySources('entity-0').length,traversal:index.traverse('resource-0',3,250,1000)},diagnostics:built.diagnostics};
 await fs.writeFile(path.join(out,`benchmark-${size}.json`),JSON.stringify(result,null,2)+'\n');if(size===100){await fs.writeFile(path.join(out,'sample.ink'),fixtureText(0,size));await fs.writeFile(path.join(out,'sample.mutable.json'),fixtureText(1,size));}
 console.log(JSON.stringify({size,totalMs:result.metrics.totalMs,decodeMs:result.metrics.decodeMs,extractMs:result.metrics.extractMs,heapMiB:round(result.memory.retainedHeapDelta/1024/1024),incremental:result.incremental}));
}finally{await fs.rm(root,{recursive:true,force:true,maxRetries:3});}
