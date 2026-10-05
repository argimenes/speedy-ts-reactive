import {isNativeDocumentName} from '../src/persistence/document-file-names.mjs';
/** Single-resource, read-only adapter. Discovery/storage authority stays in NativeVaultStore. */
import path from 'node:path';
import {hash} from '../src/persistence/managed-pair.mjs';
import {nativeKnowledgeJobs} from './native-knowledge-jobs';
import {normalizePolicy} from '../src/knowledge/policy';
import {NativeSavedScopes} from './native-saved-scope.mjs';
const fail=message=>{throw Object.assign(Error(message),{status:409});};
export async function readSavedFacts(store,request,{signal,jobs=nativeKnowledgeJobs}={}) {
 const {vault,location,resourceId,byteHash}=request??{};
 if(!location||typeof location.folder!=='string'||typeof location.filename!=='string'||!isNativeDocumentName(location.filename)||location.filename.includes('/')||typeof resourceId!=='string'||!resourceId||! /^[a-f0-9]{64}$/.test(byteHash))fail('Expected native location, canonical identity and discovery byte evidence');
 if(!request.policy)fail('Explicit Facts extraction policy required');
 const policy=normalizePolicy(request.policy),p=path.posix.join(location.folder,location.filename);
 const same=d=>d.location.folder===location.folder&&d.location.filename===location.filename;
 const eligible=scan=>{
  if(!scan.complete)fail('Discovery incomplete; saved coverage unavailable');
  const rows=scan.documents.filter(d=>d.resourceId===resourceId),row=rows[0];
  if(rows.length!==1||!same(row)||!['paired','unenrolled'].includes(row.state)||row.baseline?.nativeHash!==byteHash)fail('Saved resource identity, location, state or read evidence changed');
  return row;
 };
 signal?.throwIfAborted();const row=eligible(await store.discover(vault,{signal}));
 await store.guardPath(location);const stamp=await store.stamp(p),bytes=await store.read(p);
 if(hash(bytes)!==byteHash)fail('Native bytes changed before extraction');
 const result=await jobs.run('facts',bytes,{signal,policy});signal?.throwIfAborted();
 if(result.byteHash!==byteHash||result.inspection.resourceId!==resourceId)fail('Stale saved Facts evidence');
 if(await store.stamp(p)!==stamp||hash(await store.read(p))!==byteHash)fail('Native file changed during extraction');
 // Recheck uniqueness and operations as well as target bytes. No automatic rebinding.
 const final=eligible(await store.discover(vault,{signal}));
 if(await store.stamp(p)!==stamp||JSON.stringify(row.baseline)!==JSON.stringify(final.baseline))fail('Pair or location evidence changed during extraction');
 signal?.throwIfAborted();
 return {wire:result.wire,evidence:{location,resourceId,byteHash,policy:result.policy},timings:result.timings};
}
export function installNativeKnowledgeRoutes(route,store){
 const scopes=new NativeSavedScopes(store);
 for(const [name,method]of [['begin','begin'],['batch','batch'],['current','verify'],['release','release']])route('post','/vault/facts/'+name,async(req,res)=>{
  const controller=new AbortController(),closed=()=>{if(!res.writableEnded)controller.abort();};res.once('close',closed);
  try{return await scopes[method](req.body,controller.signal);}finally{res.off('close',closed);}
 });
 route('post','/vault/facts',async(req,res)=>{
  const controller=new AbortController(),closed=()=>{if(!res.writableEnded)controller.abort();};res.once('close',closed);
  try{return await readSavedFacts(store,req.body,{signal:controller.signal});}finally{res.off('close',closed);}
 });
}
