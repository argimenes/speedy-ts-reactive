/** Bounded saved-state reads; never a canonical Entity mutation or live-state service. */
import {sqlSavedFacts,type SqlFactsRequest} from './saved-facts';
import {sqlRevision} from './reconcile.mjs';
import {encodeAuthoredValue,decodeAuthoredValue} from '../history/preplan-spike/wire';
export type SqlKnowledgeRequest = {revision:string} & (
 | {kind:'facts';source:SqlFactsRequest}
 | {kind:'entity-mentions';source:SqlFactsRequest;entityId:string;limit:number;offset?:number}
 | {kind:'relationships';entityId:string;direction:'incoming'|'outgoing'|'both';limit:number;after?:string}
);
export async function sqlKnowledgeRead(db:any,request:SqlKnowledgeRequest,check:()=>void=()=>{}){
 const started=performance.now();
 const current=()=>{check();if(typeof request.revision!=='string'||sqlRevision(db)!==request.revision)throw Error('SQL read snapshot expired');};current();
 let value:any;
 if(request.kind==='facts'||request.kind==='entity-mentions'){
  const r=await sqlSavedFacts(db,request.source,check);current();
  if(request.kind==='facts')value={wire:r.wire,resourceId:r.facts.id,byteHash:r.resource.contentHash,rootBlockId:r.facts.rootBlockId,timings:{...r.timings,workerMs:performance.now()-started},memory:process.memoryUsage().heapUsed,diagnostics:r.facts.diagnostics};
  else{
   bounded(request.entityId,request.limit);const offset=request.offset??0;if(!Number.isInteger(offset)||offset<0||offset>10000)throw Error('Invalid mention offset');
   const all=r.facts.mentions.filter(m=>m.kind==='entity'&&m.targetId===request.entityId),items=all.slice(offset,offset+request.limit),truncated=offset+items.length<all.length;
   value={items,truncated,nextOffset:truncated?offset+items.length:undefined,canonicalEntityPresent:!!db.prepare('SELECT guid FROM Entity WHERE guid=?').get(request.entityId),provenance:'saved-native-assertions',coverage:{scope:'requested-native-resource',complete:!truncated&&!r.facts.diagnostics.length,diagnostics:r.facts.diagnostics}};
  }
 }else if(request.kind==='relationships'){
  bounded(request.entityId,request.limit);if(!['incoming','outgoing','both'].includes(request.direction)||request.after!==undefined&&(typeof request.after!=='string'||request.after.length>512))throw Error('Invalid relationship query');
  value=db.transaction(()=>{
   current();const predicate=request.direction==='incoming'?'targetEntityGuid=?':request.direction==='outgoing'?'sourceEntityGuid=?':'(sourceEntityGuid=? OR targetEntityGuid=?)';
   const rows=db.prepare(`SELECT guid,sourceEntityGuid,typename,targetEntityGuid,attributes,revision FROM Relationship WHERE ${predicate} AND guid>? ORDER BY guid LIMIT ?`).all(...(request.direction==='both'?[request.entityId,request.entityId]:[request.entityId]),request.after??'',request.limit+1);
   const truncated=rows.length>request.limit,items=rows.slice(0,request.limit).map((r:any)=>({...r,attributes:r.attributes===null?null:encodeAuthoredValue(decodeAuthoredValue(JSON.parse(r.attributes)))}));
   return {items,truncated,nextAfter:truncated?items.at(-1)?.guid:undefined,provenance:'canonical-sqlite-relationships',coverage:{scope:'canonical-relationship-records',complete:!truncated,diagnostics:[]}};
  }).deferred();
 }else throw Error('Unsupported SQL knowledge read');
 current();if(Buffer.byteLength(JSON.stringify(value))>2*1024*1024)throw Error('SQL query response budget exceeded');return {...value,revision:request.revision};
}
function bounded(id:string,limit:number){if(typeof id!=='string'||!id||id.length>512||!Number.isInteger(limit)||limit<1||limit>100)throw Error('Invalid bounded query');}
