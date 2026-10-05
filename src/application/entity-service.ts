import type {ReactiveEditor} from '../reactive-editor/editor';
import type {DocumentVaultLease} from './document-vault';
import type {FactsQueryProvider} from './facts-query-provider';
import type {EntityService,EntityCandidate,EntityEvidence,CanonicalEntity} from '../feature-api/entities';
import {nativeDocumentSession} from '../persistence/native-session';
import {WorkSlice} from '../knowledge/scheduler';
import {observeLive} from '../knowledge/live-observer';
import {encodeAuthoredValue,decodeAuthoredValue} from '../history/preplan-spike/wire';
type Context={accepts(key:string):boolean;vault():DocumentVaultLease;facts?:FactsQueryProvider};
const contexts=new WeakMap<ReactiveEditor,Set<Context>>();
export function registerEntityContext(editor:ReactiveEditor,context:Context){let set=contexts.get(editor);if(!set)contexts.set(editor,set=new Set());set.add(context);return()=>set!.delete(context);}
const fold=(s:string)=>s.normalize('NFKC').toLowerCase();
async function request(action:string,body:unknown,signal?:AbortSignal){
 const response=await fetch('/api/sqlite/knowledge/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal});
 if(!response.body)throw Error('Entity service unavailable');const reader=response.body.getReader(),parts:Uint8Array[]=[];let length=0;
 try{for(;;){signal?.throwIfAborted();const c=await reader.read();if(c.done)break;if((length+=c.value.length)>1024*1024)throw Error('Entity response budget exceeded');parts.push(c.value);}}finally{await reader.cancel();}
 const bytes=new Uint8Array(length);let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.length;}const result=JSON.parse(new TextDecoder().decode(bytes));
 if(!response.ok||!result.Success)throw Object.assign(new Error(result.Error??'Entity operation unavailable'),result.entityCreationOutcome==='not-created'?{entityCreationOutcome:'not-created'}:{});return result.Data;
}
/** A resolver belongs to the invoking occurrence. Vault selection is never global focus. */
export function entityService(editor:ReactiveEditor,owner:string):EntityService {
 let alive=true,lease:string|undefined,opening:Promise<void>|undefined;
 const native=nativeDocumentSession(editor),policy=()=>({version:1 as const,opaqueTypes:editor.registry.typesWithCapability('opaque-widget')});
 const matches=[...(contexts.get(editor)??[])].filter(c=>c.accepts(owner));
 const context=matches.length===1?matches[0]:undefined;
 const root=editor.blockQueries.ancestorPath(owner).filter(n=>n.viewType==='document-block').at(-1);
 const id=String((root?.payload.metadata as any)?.documentId??root?.payload.id??'');
 const vault=context?.vault();
 const check=()=>{
  if(!alive||!editor.features.sqliteEntities||!context||!vault||context.vault()!==vault||!context.accepts(owner)||!vault.isAlive())throw Error('Open this Document in one verified Mutable Vault to resolve Entities.');
  const b=editor.repository.readCanonicalResourceBoundary(id);if(b.status!=='ready')throw Error('Entity source is missing or ambiguous');
  const proof=native.knowledgeEvidence(id);
  if(proof.pending)throw Error('Finish or recover this Document’s pending Save/relocation before resolving Entities.');
  if(!proof.location||!proof.byteHash)throw Error('Save this Document into the selected Mutable Vault first. Selecting a Vault does not save an unsaved tab.');
  if(!native.compatibleSource(id)){const row=vault.requireFile(proof.location);if(row.resourceId!==id||row.baseline?.nativeHash!==proof.byteHash)throw Error('Entity source location changed; Refresh first');}
  return {resourceId:id,location:proof.location,byteHash:proof.byteHash};
 };
 const call=async(input:any,signal?:AbortSignal,onDispatch?:()=>void)=>{
  const source=check();signal?.throwIfAborted();
  if(!lease){opening??=request('open',{vault:vault!.root,policy:policy()}).then(async result=>{if(!alive){await request('release',{lease:result.lease});throw Error('Entity resolver closed');}lease=result.lease;}).finally(()=>opening=undefined);await opening;}
  check();signal?.throwIfAborted();onDispatch?.();
  const wireInput=Object.hasOwn(input,'attributes')?{...input,attributes:encodeAuthoredValue(input.attributes)}:input;
  const result=await request('entities',{lease,source,request:wireInput},signal);
  for(const entity of [result.entity,...(result.entities??[])])if(entity&&entity.attributes!==undefined)entity.attributes=decodeAuthoredValue(entity.attributes);
  return result;
 };
 return {
  async get(id,signal){const result=await call({op:'get',id},signal);check();return result.entity;},
  async summaries(ids,signal){
   const revision=editor.repository.state.revision,signature=vault?.signature();
   const current=()=>{signal?.throwIfAborted();check();if(editor.repository.state.revision!==revision||vault!.signature()!==signature)throw Error('Entity summary source changed');};
   const result=await call({op:'resolve',ids},signal);current();
   const diagnostics:string[]=[],counts=new Map<string,number>();
   try{
    if(!context?.facts)throw Error('Vault mention coverage unavailable');
    const scope=await context.facts.prepare(vault!,signal),work=new WorkSlice(()=>{current();scope.current();});
    diagnostics.push(...scope.diagnostics);const wanted=new Set(ids);let examined=0;
    outer:for(const source of scope.sources){diagnostics.push(...source.facts.diagnostics);for(const mention of source.facts.mentions){
     await work.step();if(++examined>20000){diagnostics.push('Vault count budget exceeded');break outer;}
     if(mention.kind==='entity'&&wanted.has(mention.targetId))counts.set(mention.targetId,(counts.get(mention.targetId)??0)+1);
    }}
    await scope.validate();
   }catch(error){diagnostics.push(String(error));}
   current();if((await call({op:'current'},signal)).revision!==result.revision)throw Error('Canonical Entity summaries changed');current();
   if(result.entities.length!==new Set(ids).size)diagnostics.push('Some Entity identities are unresolved in this vault');
   const complete=!diagnostics.length;
   return {rows:result.entities.map((e:CanonicalEntity)=>({id:e.id,name:e.name,...(complete?{mentions:counts.get(e.id)??0}:{})})),complete,diagnostics:[...new Set(diagnostics)].slice(0,32)};
  },
  async create(input,signal){let dispatched=false;try{return (await call({op:'create',...input},signal,()=>{dispatched=true;})).entity;}catch(error){if(!dispatched)throw Object.assign(new Error(String(error)),{entityCreationOutcome:'not-created'});throw error;}},
  async rename(input){return (await call({op:'rename',...input})).entity;},
  async update(input,signal){return (await call({op:'update',...input},signal)).entity;},
  async alias(input){return (await call(input)).entity;},
  async search(query,signal){
   check();const revision=editor.repository.state.revision,signature=vault!.signature();
   const current=()=>{signal.throwIfAborted();check();if(editor.repository.state.revision!==revision||vault!.signature()!==signature)throw Error('Entity resolution evidence changed');};
   const local=await observeLive(editor.repository,id,policy(),{check:current}),diagnostics=[...local.facts.diagnostics];
   let sources=[local.facts],validate=async()=>current();
   if(query.scope==='vault'&&(query.stream==='all'||query.stream==='mention')){
    if(context!.facts){const scope=await context!.facts.prepare(vault!,signal);sources=[local.facts,...scope.sources.map(s=>s.facts).filter(f=>f.id!==local.facts.id)];diagnostics.push(...scope.diagnostics,...sources.flatMap(f=>f.diagnostics));validate=async()=>{await scope.validate();current();};}
    else diagnostics.push('Vault mention coverage unavailable; current Document only.');
   }
   const locals=new Map<string,number>();for(const m of local.facts.mentions)if(m.kind==='entity')locals.set(m.targetId,(locals.get(m.targetId)??0)+1);
   const candidates=new Map<string,EntityCandidate>(),entities=new Map<string,CanonicalEntity>();let sqlRevision:string|undefined;
   const verified=async(input:any)=>{const r=await call(input,signal);current();if(sqlRevision&&sqlRevision!==r.revision)throw Error('Canonical Entity knowledge changed; retry');sqlRevision=r.revision;return r;};
   const add=(entity:{id:string;name:string},evidence:EntityEvidence)=>{if(query.scope==='document'&&!locals.has(entity.id))return;let row=candidates.get(entity.id);if(!row){if(candidates.size===100){diagnostics.push('Candidate limit reached; refine the query.');return;}candidates.set(entity.id,row={...entity,evidence:[],localMentions:locals.get(entity.id)??0});}if(row.evidence.length<50)row.evidence.push(evidence);else diagnostics.push('Mention evidence truncated.');};
   const matches=(s:string)=>query.match==='exact'?fold(s)===fold(query.query):fold(s).includes(fold(query.query));
   const resolve=async(ids:string[])=>{if(ids.length>500){diagnostics.push('Entity resolution limited to 500 identities.');ids=ids.slice(0,500);}for(let i=0;i<ids.length;i+=100){const r=await verified({op:'resolve',ids:ids.slice(i,i+100)});for(const e of r.entities)entities.set(e.id,e);}};
   if(query.scope==='vault'&&query.stream!=='mention'){
    const result=await verified({op:'search',query:query.query,stream:query.stream,match:query.match});if(!result.complete)diagnostics.push('Canonical matches truncated; refine the query.');for(const m of result.matches)add(m,{kind:m.kind,text:m.text});
   }
   const mentions:Array<{resourceId:string;mention:typeof local.facts.mentions[number]}>=[];
   outer:for(const f of sources)for(const m of f.mentions){if(m.kind==='entity')mentions.push({resourceId:f.id,mention:m});if(mentions.length>2000)break outer;}
   if(mentions.length>2000){mentions.length=2000;diagnostics.push('Mention search limited to 2,000 assertions.');}
   const matching=mentions.filter(({mention:m})=>matches(m.text));
   await resolve([...new Set([...locals.keys(),...((query.stream==='all'||query.stream==='mention')?matching.map(m=>m.mention.targetId):[])])]);
   if(query.scope==='document'&&query.stream!=='mention')for(const e of entities.values())if(locals.has(e.id)){
    if(query.stream!=='alias'&&matches(e.name))add(e,{kind:'name',text:e.name});
    if(query.stream!=='name')for(const a of e.aliases)if(matches(a.name))add(e,{kind:'alias',text:a.name});
   }
   if(query.stream==='all'||query.stream==='mention')for(const {resourceId,mention:m} of matching){const e=entities.get(m.targetId);if(e)add(e,{kind:'mention',text:m.text,resourceId,mentionId:m.id,ranges:m.ranges});else diagnostics.push('Mention target is unresolved in this vault.');}
   if(query.stream==='all'&&!candidates.size)for(const [entityId,count]of locals){const e=entities.get(entityId);if(e)add(e,{kind:'local',text:`Already mentioned in this Document (${count})`});}
   await verified({op:'current'});await validate();current();
   return {candidates:[...candidates.values()].sort((a,b)=>b.localMentions-a.localMentions||a.name.localeCompare(b.name)||a.id.localeCompare(b.id)),complete:!diagnostics.length,diagnostics:[...new Set(diagnostics)].slice(0,32),current};
  },
  dispose(){alive=false;if(lease){void request('release',{lease}).catch(()=>{});lease=undefined;}},
 };
}
