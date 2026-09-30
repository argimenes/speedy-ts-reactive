/** Sequential real-repository qualification. Setup excluded; no views/editors mounted. */
import {promises as fs} from 'node:fs';import {isDeepStrictEqual} from 'node:util';
import {liveFixture} from './live-fixture';import {LiveFactsObserver} from './live-adapter';import {observedOverlay} from './live-facts-overlay';import {KnowledgeIndex} from './index';
import {captureNative} from '../../persistence/native-resource';import {extract} from './extract';import {fixtureText} from './fixture';
const samples:any[]=[];
const inlineEdit=(f:ReturnType<typeof liveFixture>,id:string)=>{
 const c=Object.values(f.repository.readState().contents).find(c=>c.payload.id===id+'-p0')!,key=crypto.randomUUID(),pk=crypto.randomUUID();
 // Same certified leaf-Cell insertion shape as an ordinary typing command.
 f.repository.commit('Typing',[{kind:'put-content',record:{...f.repository.readState().contents[f.repository.readState().placements[c.inlineContent[0]].contentKey],key,payload:{text:'x'}}},{kind:'put-placement',record:{key:pk,contentKey:key,kind:'inline'}},{kind:'put-content',record:{...c,inlineContent:[...c.inlineContent,pk]}}]);
};
for(const count of [1,10,100]){
 const f=liveFixture(count);for(let warmup=0;warmup<3;warmup++)await extract(captureNative(f.repository.readState(),f.id),'warmup','warmup');const index=new KnowledgeIndex(),observer=new LiveFactsObserver(f.repository,f.scope),rows:any[]=[];
 const run=async(phase:string)=>{let t=performance.now();const r=await observer.observe(f.id,'same'),observeMs=performance.now()-t;t=performance.now();index.overlay(f.id,r.facts);const replacementMs=performance.now()-t;rows.push({phase,proofReused:r.proofReused,...r.timings,replacementMs,refreshMs:observeMs+replacementMs});return r;};
 for(let i=0;i<3;i++){
  if(i){const root=Object.values(f.repository.readState().contents).find(c=>c.payload.id===f.id+'-root')!;f.repository.commit('Metadata',[{kind:'put-content',record:{...root,payload:{...root.payload,benchmark:i}}}]);}
  await run('cold');await run('warm');inlineEdit(f,f.id);const live=await run('after-inline');
  let t=performance.now();const captured=captureNative(f.repository.readState(),f.id),captureMs=performance.now()-t;t=performance.now();const facts=await extract(captured,live.facts.location,'same',undefined,undefined,{opaque:f.scope.opaque}),factsMs=performance.now()-t;
  if(!isDeepStrictEqual(live.facts,facts))throw Error('Live/reference mismatch');rows.push({phase:'reference',captureMs,factsMs,refreshMs:captureMs+factsMs});
  if(count>1){inlineEdit(f,'resource-1');await run('after-unrelated-inline');}
 }
 const overlay=observedOverlay(index,f.repository,f.scope,f.id,60000);await overlay.flush();let invalidationMs=0;const populatedStart=performance.now();overlay.invalidate();const populatedInvalidationMs=performance.now()-populatedStart;
 // Isolate synchronous invalidation callback; excludes existing editor commit cost.
 for(let i=0;i<1000;i++){const t=performance.now();overlay.invalidate();invalidationMs+=performance.now()-t;}
 overlay.dispose();observer.dispose();samples.push({loadedResources:count,contents:Object.keys(f.repository.readState().contents).length,rows,populatedInvalidationMs,invalidationMeanMs:invalidationMs/1000});console.log(`Observer ${count} resources complete`);
}
const v=JSON.parse(fixtureText(0,1)),root=v.document.blocks.find((b:any)=>b.id==='resource-0-root');root.children=[];delete root.properties.linkedAnnotations;v.document.blocks=[root];
for(let i=0;i<10001;i++){v.document.blocks.push({id:`plain-${i}`,type:'plain-text-block',properties:{text:'bounded'}});root.children.push({placementId:`p-${i}`,kind:'owned',target:{kind:'local',blockId:`plain-${i}`}});}
const f=liveFixture(1,new TextEncoder().encode(JSON.stringify(v))),observer=new LiveFactsObserver(f.repository,f.scope),heavy:any[]=[];
for(const phase of ['cold','warm']){
 let last=performance.now(),maxGapMs=0,ticks=0;const timer=setInterval(()=>{const now=performance.now();maxGapMs=Math.max(maxGapMs,now-last);last=now;ticks++;},1);
 const r=await observer.observe(f.id,'same');maxGapMs=Math.max(maxGapMs,performance.now()-last);clearInterval(timer);heavy.push({phase,...r.timings,maxGapMs,ticks,blocks:r.facts.blocks.length,diagnostics:r.facts.diagnostics});
 const reference=await extract(captureNative(f.repository.readState(),f.id),r.facts.location,'same',undefined,undefined,{opaque:f.scope.opaque});if(!isDeepStrictEqual(r.facts,reference))throw Error('Heavy facts mismatch');
}
observer.dispose();await fs.mkdir('artifacts/live-facts',{recursive:true});await fs.writeFile('artifacts/live-facts/benchmark.json',JSON.stringify({method:'Three sequential samples per real CanonicalRepository; three untimed reference warmups per size, setup and commits excluded, certified inline insertions between samples; heavy 10001 child Blocks, full Facts compared in every reference trial.',samples,heavy},null,2)+'\n');console.log('Heavy resource complete');
