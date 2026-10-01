/** Real managed-store verification + worker cancellation/recreation through P3. */
import {promises as fs} from 'node:fs';import os from 'node:os';import path from 'node:path';import {pathToFileURL} from 'node:url';
import {NativeKnowledgeJobs} from '../../../server/native-knowledge-jobs';import {NativeVaultStore} from '../../../server/native-vault-store.mjs';import {readSavedFacts} from '../../../server/native-knowledge-routes.mjs';
import {NativeKnowledgeHost} from '../../knowledge/session';import {decodeFacts} from '../../knowledge/transport';import {DEFAULT_POLICY} from '../../knowledge/policy';import {CanonicalRepository} from '../../block-tree/repository';import {liveState} from './live-fixture';import {fixtureText} from './fixture';
const root=await fs.mkdtemp(path.join(os.tmpdir(),'p3-worker-')),jobs=new NativeKnowledgeJobs({workerURL:pathToFileURL(path.resolve('dist/server/native-knowledge-worker.js'))}),workerRecords:any[]=[],samples:any[]=[];let cancelNext=false,notify=()=>{};
const run=jobs.run.bind(jobs);jobs.run=(kind,bytes,options={})=>{const promise=run(kind,bytes,options);if(kind==='facts'&&cancelNext){cancelNext=false;queueMicrotask(notify);}return promise.then(result=>{workerRecords.push({kind,timings:result.timings,workerHeap:result.memory});return result;});};
const repository=new CanonicalRepository(liveState(0).state),host=new NativeKnowledgeHost(repository,{debounceMs:60000});
try{
 await fs.mkdir(path.join(root,'vault'));await fs.writeFile(path.join(root,'vault/a.mutable.json'),fixtureText(0,1));const store=new NativeVaultStore({root,inspect:(bytes:Uint8Array,signal:AbortSignal)=>jobs.run('inspect',bytes,{signal})}),scan=await store.discover('vault'),row=scan.documents[0];
 const lease=host.acquire({root:'vault',snapshot:()=>scan,native:()=>({closed:false,admitting:false,pending:false}),policy:()=>DEFAULT_POLICY,subscribe(l){notify=l;return()=>{notify=()=>{};};},async verifySaved(row,policy,signal){const r=await readSavedFacts(store,{vault:'vault',location:row.location,resourceId:row.resourceId,byteHash:row.baseline!.nativeHash,policy},{signal,jobs});return {...r.evidence,facts:decodeFacts(r.wire)};}});
 lease.requestSaved(row.resourceId);await host.flush();
 for(let i=0;i<6;i++){
  cancelNext=true;notify();const t=performance.now();await host.flush();const failed=lease.coverage();if((await lease.prepare()).facts.length)throw Error('Cancelled verification revealed saved Facts');
  await host.flush();const ready=lease.coverage();if(ready.resources[0].state!=='saved-ready')throw Error('Worker recreation did not restore verified saved Facts');(globalThis as any).gc?.();samples.push({iteration:i,cancelState:failed.resources[0].state,recovered:ready.resources[0].state,elapsedMs:performance.now()-t,serverMemory:process.memoryUsage(),factsBytes:host.index.retainedBytes});
 }
 lease.release();await host.flush();await jobs.close();(globalThis as any).gc?.();await fs.writeFile('artifacts/native-knowledge-p3/worker-lifecycle.json',JSON.stringify({samples,workerRecords,hostMetrics:host.metrics,releasedFactsBytes:host.index.retainedBytes,finalMemory:process.memoryUsage()},null,2));console.log('P3 managed-store worker lifecycle complete');
}finally{await host.dispose();await jobs.close();await fs.rm(root,{recursive:true,force:true});}
