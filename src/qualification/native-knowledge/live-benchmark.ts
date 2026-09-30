/** Live evaluation only: retain captureNative authority; do not create a faster ownership model. */
import {promises as fs} from 'node:fs';
import {decodeDocument} from '../../block-tree/codecs';
import {resourceToRepository} from '../../history/durable-core';
import {captureNative,decodeNative,nativeBytes} from '../../persistence/native-resource';
import {fixtureText} from './fixture';import {extract} from './extract';import {lightweightFacts} from './lightweight';
const samples=[];
for(const count of [1,10,100]){
 const state=decodeDocument({id:'workspace',type:'workspace-block',children:[{id:'bank',type:'workspace-object-bank-block',children:[]}]}).state;
 const bank=Object.values(state.contents).find(c=>c.payload.id==='bank')!;
 for(let i=0;i<count;i++){
  const r=resourceToRepository(decodeNative(new TextEncoder().encode(fixtureText(i,count))));
  Object.assign(state.contents,r.contents);Object.assign(state.placements,r.placements);
  const root=state.placements[r.rootPlacementKey];root.kind='reference';root.resourceRegistration=true;bank.children.push(root.key);
 }
 const rows=[];
 for(let i=0;i<3;i++){
  let t=performance.now();const captured=captureNative(state,'resource-0'),captureMs=performance.now()-t;
  t=performance.now();const ordinary=await extract(captured,'live','same'),factsMs=performance.now()-t;
  t=performance.now();const bytes=nativeBytes(captured),encodeMs=performance.now()-t;
  t=performance.now();const fast=await lightweightFacts(bytes,'live','same'),lightweightMs=performance.now()-t;
  if(JSON.stringify(ordinary)!==JSON.stringify(fast.facts))throw Error('Live facts differ');
  rows.push({captureMs,factsMs,encodeMs,lightweightMs});
 }
 samples.push({loadedResources:count,contentRecords:Object.keys(state.contents).length,placementRecords:Object.keys(state.placements).length,rows});
 console.log(`Live ${count} resources complete`);
}
await fs.mkdir('artifacts/native-facts',{recursive:true});await fs.writeFile('artifacts/native-facts/live-results.json',JSON.stringify({method:'Three sequential captures per fixture; fixture construction excluded. Same read-only canonical shared state. No proposed production round-trip through native bytes.',samples},null,2)+'\n');
