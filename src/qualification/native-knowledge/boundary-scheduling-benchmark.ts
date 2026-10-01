/** P1 heavy-resource scheduling control; no editor/projection or user files. */
import { promises as fs } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { CanonicalRepository } from '../../block-tree/repository';
import { decodeDocument } from '../../block-tree/codecs';
import type { CanonicalResourceBoundaryResult } from '../../block-tree/resource-boundary';
const evidence=(r:CanonicalResourceBoundaryResult)=>r.status==='ready'?{...r,token:{revision:r.token.revision}}:r;
const output:any[]=[];
for(const profile of ['25000-cells','10001-blocks'] as const){
 const state=decodeDocument({id:'root',type:'document-block',metadata:{documentId:'A'},children:profile==='25000-cells'?[{id:'p',type:'standoff-editor-block',text:'x'.repeat(25000)}]:Array.from({length:10001},(_,i)=>({id:`p${i}`,type:'plain-text-block',text:'x'}))}).state;
 const started=performance.now(),repository=new CanonicalRepository(state),constructionMs=performance.now()-started;
 global.gc?.();const before=process.memoryUsage().heapUsed;
 for(let round=0;round<3;round++){
  const syncStart=performance.now(),sync=repository.readCanonicalResourceBoundary('A'),syncMs=performance.now()-syncStart;
  if(sync.status!=='ready')throw Error(JSON.stringify(sync));
  let slices=0,maxSliceMs=0,ticks=0,maxHeartbeatGapMs=0,lastBeat=performance.now(),sliceStart=lastBeat;
  const heartbeat=setInterval(()=>{const now=performance.now();maxHeartbeatGapMs=Math.max(maxHeartbeatGapMs,now-lastBeat);lastBeat=now;ticks++;},1);
  const coopStart=performance.now();
  const cooperative=await repository.readCanonicalResourceBoundaryCooperative('A',{yieldControl:()=>{
   maxSliceMs=Math.max(maxSliceMs,performance.now()-sliceStart);slices++;
   return new Promise(resolve=>setTimeout(()=>{sliceStart=performance.now();resolve();},0));
  }});
  maxSliceMs=Math.max(maxSliceMs,performance.now()-sliceStart);clearInterval(heartbeat);
  const cooperativeMs=performance.now()-coopStart;
  if(!isDeepStrictEqual(evidence(sync),evidence(cooperative)))throw Error('Sync/cooperative evidence mismatch');
  output.push({profile,round,constructionMs,syncMs,cooperativeMs,slices,maxSliceMs,ticks,maxHeartbeatGapMs,status:cooperative.status});
 }
 global.gc?.();output.push({profile,phase:'released-audit-scratch',retainedHeapDelta:process.memoryUsage().heapUsed-before});
}
await fs.mkdir('artifacts/resource-boundary-p1',{recursive:true});await fs.writeFile('artifacts/resource-boundary-p1/scheduling.json',JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify(output,null,2));
