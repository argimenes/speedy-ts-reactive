/** Isolate the lifetime of the legacy admission helper's weakly keyed input cache. */
import { promises as fs } from 'node:fs';
import { CanonicalRepository } from '../../block-tree/repository';
import { liveState } from './live-fixture';
const count=30,mode=process.argv[2],qualified=mode==='qualified';
global.gc?.();const initialHeap=process.memoryUsage().heapUsed;
let input=liveState(count).state;
for(const p of Object.values(input.placements))if(p.resourceRegistration){delete p.resourceRegistration;p.kind='owned';}
const records=Object.keys(input.contents).length,inputRef=new WeakRef(input);
const started=performance.now(),repository=new CanonicalRepository(input,{resourceBoundaryEvidence:qualified}),constructionMs=performance.now()-started;
global.gc?.();const withInput=process.memoryUsage().heapUsed;
input=undefined!;
await new Promise(r=>setTimeout(r,0));global.gc?.();
const withoutInput=process.memoryUsage().heapUsed,collected=inputRef.deref()===undefined;
const row={mode,count,records,constructionMs,initialHeap,withInput,withoutInput,retainedWithInput:withInput-initialHeap,retainedWithoutInput:withoutInput-initialHeap,inputCollected:collected};
if(!collected)throw Error('Constructor input is still retained; memory comparison invalid');
if(qualified&&repository.readCanonicalResourceBoundary('resource-0').status!=='ready')throw Error('Boundary unavailable');
await fs.mkdir('artifacts/resource-boundary-p1/legacy',{recursive:true});await fs.writeFile(`artifacts/resource-boundary-p1/legacy/memory-${mode}.json`,JSON.stringify(row,null,2)+'\n');console.log(row);
