/** Byte-in / read-only evidence-out worker. No filesystem or host capabilities. */
import {parentPort} from 'node:worker_threads';
import {createHash} from 'node:crypto';
import {prepareLightweightFacts} from '../src/knowledge/saved-reader';
import {normalizePolicy,policyKey} from '../src/knowledge/policy';
import {encodeFacts} from '../src/knowledge/transport';
parentPort!.on('message',async request=>{
 const started=performance.now();
 try {
  if(!Number.isSafeInteger(request.id)||!['inspect','facts'].includes(request.kind)||!(request.bytes instanceof Uint8Array)||request.bytes.byteLength>20*1024*1024)throw Error('Invalid native inspection request');
  if(request.kind==='facts'&&!request.policy)throw Error('Explicit Facts extraction policy required');
  const policy=normalizePolicy(request.policy),hashStart=performance.now(),byteHash=createHash('sha256').update(request.bytes).digest('hex'),hashMs=performance.now()-hashStart;
  const prepared=prepareLightweightFacts(request.bytes);
  let wire:string|undefined,factsMs=0,encodeMs=0;
  if(request.kind==='facts'){
   const result=await prepared.materialize(undefined,{extraction:policy});factsMs=result.timings.factsMs;
   const start=performance.now();wire=encodeFacts(result.facts);encodeMs=performance.now()-start;
   if(Buffer.byteLength(wire)>32*1024*1024)throw Error('Facts transport budget exceeded');
  }
  parentPort!.postMessage({id:request.id,kind:request.kind,ok:true,inspection:prepared.inspection,byteHash,policy:policyKey(policy),wire,
   timings:{hashMs,validationMs:prepared.validationMs,factsMs,encodeMs,workerMs:performance.now()-started},memory:process.memoryUsage().heapUsed});
 }catch(error){parentPort!.postMessage({id:request.id,ok:false,error:error instanceof Error?error.message:String(error)});}
});
