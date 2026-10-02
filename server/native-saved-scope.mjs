/** Ephemeral, bounded read scopes. NativeVaultStore remains the authority for
 * uniqueness, pair state, confinement and operations. Nothing here writes files. */
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {hash} from '../src/persistence/managed-pair.mjs';
import {normalizePolicy,policyKey} from '../src/knowledge/policy';
import {nativeKnowledgeJobs} from './native-knowledge-jobs';
const fail=message=>{throw Object.assign(Error(message),{status:409});};
export class NativeSavedScopes {
 constructor(store,{jobs=nativeKnowledgeJobs,readFacts,maxScopes=8,ttlMs=600000,batchSize=32,maxBytes=3*1024*1024}={}){this.store=store;this.jobs=jobs;this.readFacts=readFacts;this.options={maxScopes,ttlMs,batchSize,maxBytes};this.scopes=new Map();this.pending=0;}
 prune(){for(const [id,s]of this.scopes)if(s.expires<Date.now())this.release({scope:id});}
 async begin({vault,signature,policy},signal){
  this.prune();if(this.scopes.size+this.pending>=this.options.maxScopes)fail('Knowledge saved scope budget exceeded');
  this.pending++;try{
  if(typeof signature!=='string'||! /^[a-f0-9]{64}$/.test(signature))fail('Expected discovery signature');
  if(!policy)fail('Explicit Facts extraction policy required');policy=normalizePolicy(policy);const started=performance.now(),before=await this.store.readScopeFence(vault,signal);
  const scan=await this.store.discover(vault,{signal});
  if(!scan.complete||scan.operations.some(o=>o.phase==='pending')||hash(JSON.stringify(scan))!==signature)fail('Saved discovery is incomplete or changed; Refresh required');
  if(await this.store.readScopeFence(vault,signal)!==before)fail('Discovery scope changed during verification');
  const rows=new Map();for(const row of scan.documents){if(rows.has(row.resourceId))fail('Ambiguous saved identity');rows.set(row.resourceId,row);}
  this.prune();if(this.scopes.size>=this.options.maxScopes)fail('Knowledge saved scope budget exceeded');
  signal?.throwIfAborted();const id=randomUUID();const timer=setTimeout(()=>this.release({scope:id}),this.options.ttlMs);timer.unref?.();this.scopes.set(id,{vault,rows,fence:before,policy,expires:Date.now()+this.options.ttlMs,busy:false,timer});
  return {scope:id,signature,policy:policyKey(policy),resources:rows.size,discoveryMs:performance.now()-started};
  }finally{this.pending--;}
 }
 async current(s,signal){signal?.throwIfAborted();if(s.expires<Date.now()||await this.store.readScopeFence(s.vault,signal)!==s.fence)fail('Saved scope evidence expired or changed; Refresh required');}
 async verify({scope},signal){this.prune();const s=this.scopes.get(scope);if(!s)fail('Saved scope missing or expired');await this.current(s,signal);if(this.scopes.get(scope)!==s)fail('Saved scope released');return {scope};}
 async batch({scope,ids},signal){
  this.prune();const s=this.scopes.get(scope);if(!s||s.busy)fail('Saved scope missing, expired or busy');
  if(!Array.isArray(ids)||!ids.length||ids.length>this.options.batchSize||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'||!s.rows.has(id)))fail('Invalid bounded saved request');
  s.busy=true;const started=performance.now(),items=[],timings={fenceMs:0,readHashMs:0,workerHeapPeak:0,serverHeapPeak:process.memoryUsage().heapUsed};let size=0;
  try {
   let measured=performance.now();await this.current(s,signal);timings.fenceMs+=performance.now()-measured;
   for(const id of ids){
    signal?.throwIfAborted();const row=s.rows.get(id),location=row.location,p=path.posix.join(location.folder,location.filename);
    try {
     if(!['paired','unenrolled'].includes(row.state)||!row.baseline?.nativeHash)fail('Saved resource unavailable: '+row.state);
     let readStart=performance.now();const stamp=await this.store.stamp(p),bytes=await this.store.read(p);
     if(hash(bytes)!==row.baseline.nativeHash)fail('Saved bytes changed before extraction');timings.readHashMs+=performance.now()-readStart;
     const result=this.readFacts?await this.readFacts({scope,row,bytes,signal,policy:s.policy}):await this.jobs.run('facts',bytes,{signal,policy:s.policy});signal?.throwIfAborted();timings.workerHeapPeak=Math.max(timings.workerHeapPeak,result.memory??0);readStart=performance.now();
     if(result.byteHash!==row.baseline.nativeHash||result.inspection.resourceId!==id||await this.store.stamp(p)!==stamp||hash(await this.store.read(p))!==row.baseline.nativeHash)fail('Saved extraction evidence changed');timings.readHashMs+=performance.now()-readStart;
     const bytesOut=Buffer.byteLength(JSON.stringify(result.wire));
     if(bytesOut>2*1024*1024||size+bytesOut>this.options.maxBytes){items.push({resourceId:id,error:'Saved response budget exceeded'});continue;}
     size+=bytesOut;items.push({resourceId:id,wire:result.wire,evidence:{resourceId:id,location,byteHash:result.byteHash,policy:result.policy},timings:result.timings});
    }catch(e){signal?.throwIfAborted();items.push({resourceId:id,error:String(e)});}
   }
   measured=performance.now();await this.current(s,signal);timings.fenceMs+=performance.now()-measured;timings.serverHeapPeak=Math.max(timings.serverHeapPeak,process.memoryUsage().heapUsed);if(this.scopes.get(scope)!==s)fail('Saved scope released');
   return {scope,items,bytes:size,timings,elapsedMs:performance.now()-started};
  }catch(e){this.release({scope});throw e;}finally{s.busy=false;}
 }
 release({scope}){clearTimeout(this.scopes.get(scope)?.timer);this.scopes.delete(scope);return {released:true};}
}
