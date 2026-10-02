/** P3b verified SQL read scopes; storage remains NativeVaultStore's authority. */
import path from 'node:path';
import {Router} from 'express';
import {NativeSavedScopes} from './native-saved-scope.mjs';
import {policyKey} from '../src/knowledge/policy';
import {decodeFacts} from '../src/knowledge/transport';
import type {SqliteKnowledgeHost} from './sqlite-knowledge-host';
export class SqliteSavedScopes {
 private proofs=new Map<string,any>();private native:any;
 constructor(private host:SqliteKnowledgeHost){
  this.native=new NativeSavedScopes(host.store,{readFacts:async({scope,row,signal,policy}:any)=>{
   const p=this.proofs.get(scope);if(!p)throw Error('SQL scope released');
   const result=await host.readKnowledge(p.lease,p.evidence,{kind:'facts',source:{resourceId:row.resourceId,path:path.posix.join(row.location.folder,row.location.filename),byteHash:row.baseline.nativeHash,policy}},signal);
   return {...result,inspection:{resourceId:result.resourceId,rootBlockId:result.rootBlockId},policy:policyKey(policy),memory:result.memory,timings:{...result.timings,validationMs:0}};
  }});
 }
 private prune(){this.native.prune();for(const key of this.proofs.keys())if(!this.native.scopes.has(key))this.proofs.delete(key);}
 async begin(body:any,signal?:AbortSignal){
  this.prune();const evidence=await this.host.knowledgeEvidence(body.lease,signal);
  if(body.vault!==evidence.vault||policyKey(body.policy)!==evidence.policy)throw Error('SQL vault/policy evidence mismatch');
  const opened=await this.native.begin(body,signal);
  try{const now=await this.host.knowledgeEvidence(body.lease,signal);if(JSON.stringify(now)!==JSON.stringify(evidence))throw Error('SQL read scope superseded');
   this.proofs.set(opened.scope,{lease:body.lease,evidence});return {...opened,evidence:{...evidence,scope:opened.scope},coverage:{...evidence.coverage,scope:'native-documents',resources:opened.resources,hostResources:evidence.coverage.resources}};
  }catch(e){this.native.release(opened);throw e;}
 }
 private async verify(scope:string,signal?:AbortSignal){
  this.prune();const p=this.proofs.get(scope);if(!p)throw Error('SQL scope missing or expired');
  const current=await this.host.knowledgeEvidence(p.lease,signal);if(JSON.stringify(current)!==JSON.stringify(p.evidence))throw Error('SQL scope evidence expired');return p;
 }
 async current(body:any,signal?:AbortSignal){const p=await this.verify(body.scope,signal);return {scope:body.scope,evidence:{...p.evidence,scope:body.scope},coverage:{...p.evidence.coverage,scope:'native-documents',resources:this.native.scopes.get(body.scope).rows.size,hostResources:p.evidence.coverage.resources}};}
 async batch(body:any,signal?:AbortSignal){
  try{const p=await this.verify(body.scope,signal),result=await this.native.batch(body,signal);await this.verify(body.scope,signal);
   const incomplete=result.items.some((i:any)=>i.error||decodeFacts(i.wire).diagnostics.length);
   return {...result,evidence:{...p.evidence,scope:body.scope},coverage:{scope:'requested-native-resources',complete:p.evidence.coverage.complete&&!incomplete,state:incomplete?'incomplete':p.evidence.coverage.state,diagnostics:result.items.filter((i:any)=>i.error).map((i:any)=>i.error)}};
  }catch(e){this.release(body);throw e;}
 }
 async mentions(body:any,signal?:AbortSignal){
  if(typeof body.entityId!=='string'||!body.entityId||body.entityId.length>512||!Number.isInteger(body.limit)||body.limit<1||body.limit>100)throw Error('Invalid bounded mentions query');
  // Reuse exactly the verified Facts semantics, scoped to at most 32 requested Resources.
  const result=await this.batch({scope:body.scope,ids:body.ids},signal),items:any[]=[],diagnostics=[...result.coverage.diagnostics];let truncated=false;
  for(const item of result.items){if(item.error)continue;const facts=decodeFacts(item.wire);diagnostics.push(...facts.diagnostics);for(const mention of facts.mentions)if(mention.kind==='entity'&&mention.targetId===body.entityId){if(items.length>=body.limit)truncated=true;else items.push({resourceId:item.resourceId,mention,evidence:item.evidence});}}
  const response={items,truncated,evidence:result.evidence,provenance:'saved-native-assertions',coverage:{scope:'requested-native-resources',complete:result.coverage.complete&&!truncated,diagnostics:[...new Set(diagnostics)]}};
  if(Buffer.byteLength(JSON.stringify(response))>2*1024*1024)throw Error('SQL mentions response budget exceeded');return response;
 }
 async relationships(body:any,signal?:AbortSignal){
  try{const p=await this.verify(body.scope,signal),result=await this.host.readKnowledge(p.lease,p.evidence,{kind:'relationships',entityId:body.entityId,direction:body.direction,limit:body.limit,after:body.after},signal);await this.verify(body.scope,signal);
   return {...result,evidence:{...p.evidence,scope:body.scope}};
  }catch(e){this.release(body);throw e;}
 }
 release({scope}:any,_signal?:AbortSignal){this.proofs.delete(scope);return this.native.release({scope});}
 close(){for(const scope of this.proofs.keys())this.release({scope});}
 router(){const router=Router();for(const name of ['begin','batch','current','mentions','relationships','release'] as const)router.post('/'+name,async(req,res)=>{
  const controller=new AbortController();const cancel=()=>{if(!res.writableEnded)controller.abort(Error('SQL read disconnected'));};req.on('aborted',cancel);res.on('close',cancel);
  try{const data=await this[name](req.body??{},controller.signal);if(!controller.signal.aborted)res.json({Success:true,Data:data});}
  catch(error){if(!controller.signal.aborted)res.status(409).json({Success:false,Error:String(error),coverage:{state:'unknown',complete:false}});}
  finally{req.off('aborted',cancel);res.off('close',cancel);}
 });return router;}
}
