import {canonicalEntities} from './entities.mjs';
import {guid, expected, canonicalTables} from './canonical-ledger.mjs';
import {decodeAuthoredValue, encodeAuthoredValue} from '../history/preplan-spike/authored-values.mjs';
const type = 'mutable/proposition-block';
export const propositionMutation = op => ['create','update','archive','restore'].includes(op);
const insert = (db, table, row) => db.prepare(`INSERT INTO ${table}(${Object.keys(row).join(',')}) VALUES(${Object.keys(row).map(()=>'?').join(',')})`).run(...Object.values(row));
const get = (db,id) => {
 const row=db.prepare(`SELECT b.guid AS blockId,b.text,b.attributes,e.guid AS id,e.name,e.revision,e.modifiedUtc FROM Block b JOIN Entity e ON e.guid=b.entityGuid WHERE b.resourceGuid IS NULL AND b.typename=? AND e.guid=?`).get(type,guid(id));
 if(!row)throw Error('Proposition unavailable');
 const attributes=JSON.parse(row.attributes),order=new Map((attributes.thesis?.annotationOrder??[]).map((id,index)=>[id,index]));
 const annotations=db.prepare('SELECT guid AS id,startIndex AS start,endIndex AS end,attributes AS property FROM StandoffProperty WHERE sourceBlockGuid=? ORDER BY guid').all(row.blockId).map(p=>({...p,property:JSON.parse(p.property)}));
 annotations.sort((a,b)=>(order.get(a.id)??Infinity)-(order.get(b.id)??Infinity));
 return {...row,attributes,annotations};
};
function annotations(input,text) {
 if(!Array.isArray(input)||input.length>100)throw Error('Supply the complete annotation set (at most 100)');
 const boundaries=[0];for(const c of text)boundaries.push(boundaries.at(-1)+c.length);
 const ids=new Set();return input.map(a=>{
  guid(a.id);if(ids.has(a.id))throw Error('Duplicate annotation identity');ids.add(a.id);
  const p=decodeAuthoredValue(a.property);
  if(!p||typeof p!=='object'||p.id!==a.id||typeof p.type!=='string'||!p.type||p.annotationId!=null||p.externalDefinition!=null)throw Error('Only direct authored annotations are supported');
  const start=boundaries[p.start],end=p.isZeroWidth?start:boundaries[p.end+1];
  if(!Number.isInteger(p.start)||!Number.isInteger(p.end)||p.isZeroWidth!==undefined&&typeof p.isZeroWidth!=='boolean'||!Number.isSafeInteger(a.start)||!Number.isSafeInteger(a.end)||a.start<0||a.end<a.start||a.end>text.length||start!==a.start||end!==a.end||p.isZeroWidth&&p.end!==p.start||!p.isZeroWidth&&a.end===a.start)throw Error('Annotation range does not match final text');
  if(p.type==='codex/entity-reference'&&(typeof p.value!=='string'||!p.value))throw Error('Entity reference requires its target');
  return {guid:a.id,authoredId:a.id,identityKind:'authored',logicalGuid:a.id,typename:p.type,startIndex:a.start,endIndex:a.end,coordinate:'utf16',text:text.slice(a.start,a.end),value:typeof p.value==='string'?p.value:null,valueJson:JSON.stringify(encodeAuthoredValue(p.value)),targetEntityGuid:p.type==='codex/entity-reference'?p.value:null,resolution:'direct',isDeleted:p.isDeleted?1:0,attributes:JSON.stringify(a.property)};
 });
}
function source(value,vaultGuid) {
 if(value==null)return undefined;
 if(value.version!==1||value.vaultGuid!==vaultGuid||typeof value.vault!=='string'||!value.vault||typeof value.capturedUtc!=='string'||!Number.isFinite(Date.parse(value.capturedUtc))||!Number.isSafeInteger(value.sourceRevision)||value.sourceRevision<0||typeof value.text!=='string'||typeof value.blockHash!=='string'||!/^[a-f0-9]{64}$/.test(value.blockHash)||!Number.isInteger(value.start)||!Number.isInteger(value.end)||value.start<0||value.end<=value.start||value.coordinate!=='cell'||[...value.text].length!==value.end-value.start)throw Error('Invalid source provenance');
 for(const id of [value.resourceGuid,value.blockGuid])if(typeof id!=='string'||!id||id.length>512)throw Error('Invalid source identity');
 return value;
}
/** One canonical aggregate, one revision, one operation receipt. No source-file writes. */
export function canonicalPropositions(db,ledger,request,check=()=>{}) {
 check();if(!request||Buffer.byteLength(JSON.stringify(request))>32768)throw Error('Proposition request budget exceeded (32 KiB)');
 const {op}=request;
 if(op==='context')return {vaultGuid:db.prepare("SELECT value FROM SchemaInfo WHERE key='vaultGuid'").get().value};
 if(op==='entities'){if(!['names','search','get','resolve','db-mentions'].includes(request.request?.op))throw Error('Thesis Entity lookup is read-only');return canonicalEntities(db,request.request,check,ledger);}
 if(op==='get')return {proposition:get(db,request.id)};
 if(op==='source') {
  const p=get(db,request.id),s=p.attributes.thesis?.source;if(!s)return {status:'absent'};
  const r=db.prepare('SELECT path,contentHash,indexStatus FROM Resource WHERE guid=?').get(s.resourceGuid);
  return r?{status:r.indexStatus==='complete'?'available':'unverified',...r,source:s}:{status:'missing',source:s};
 }
 if(op==='list') {
  const limit=request.limit??30,after=request.after??'',query=request.query??'';
  if(!Number.isInteger(limit)||limit<1||limit>100||typeof after!=='string'||typeof query!=='string'||query.length>300)throw Error('Invalid proposition page');
  const tokens=query.trim().split(/\s+/).filter(Boolean),fts=tokens.map(t=>'"'+t.replaceAll('"','""')+'"*').join(' AND ');
  const match=fts?`WITH labels AS (SELECT rowid FROM EntitySearch WHERE EntitySearch MATCH @label), passages AS (SELECT r.blockGuid FROM BlockSearch JOIN BlockTextRun r ON r.id=BlockSearch.rowid WHERE BlockSearch MATCH @query)` : '';
  const rows=db.prepare(`${match} SELECT e.guid AS id,e.name,e.revision,e.modifiedUtc,b.guid AS blockId,substr(b.text,1,240) AS preview,
   json_extract(b.attributes,'$.thesis.archived') AS archived,json_extract(b.attributes,'$.thesis.source.resourceGuid') AS sourceResourceGuid,
   (SELECT count(*) FROM StandoffProperty s WHERE s.sourceBlockGuid=b.guid AND s.targetEntityGuid IS NOT NULL AND s.isDeleted=0) AS referenceCount,
   ${fts?'e.id IN (SELECT rowid FROM labels)':'0'} AS labelMatch,${fts?'b.guid IN (SELECT blockGuid FROM passages)':'0'} AS textMatch
   FROM Block b JOIN Entity e ON e.guid=b.entityGuid WHERE b.resourceGuid IS NULL AND b.typename=@type AND e.guid>@after
   AND coalesce(json_extract(b.attributes,'$.thesis.archived'),0)=@archived ${fts?'AND (labelMatch OR textMatch)':''}
   ORDER BY e.guid LIMIT @limit`).all({type,after,archived:request.archived===true?1:0,limit:limit+1,...(fts?{query:fts,label:'name : ('+fts+')'}:{})});
  check();return {rows:rows.slice(0,limit),next:rows.length>limit?rows[limit-1].id:null};
 }
 if(!propositionMutation(op))throw Error('Unsupported Proposition operation');
 return ledger.mutate(request,ctx=>{
  const id=guid(request.id),old=op==='create'?undefined:get(db,id);
  if(old&&old.revision!==expected(request.expectedRevision))throw Error('Proposition revision conflict; reload before saving');
  const stamp={lastUpdatedByActorGuid:ctx.actorGuid,modifiedUtc:ctx.now};
  if(op==='archive'||op==='restore') {
   const attrs={...old.attributes,thesis:{...old.attributes.thesis,archived:op==='archive'}};
   ctx.change('Block',old.blockId,()=>db.prepare('UPDATE Block SET attributes=?,modifiedUtc=?,lastUpdatedByActorGuid=? WHERE guid=?').run(JSON.stringify(attrs),ctx.now,ctx.actorGuid,old.blockId));
   ctx.change('Entity',id,()=>db.prepare('UPDATE Entity SET revision=revision+1,modifiedUtc=?,lastUpdatedByActorGuid=? WHERE guid=?').run(ctx.now,ctx.actorGuid,id));
  }else{
   if(typeof request.text!=='string'||!request.text.isWellFormed()||typeof request.name!=='string'||request.name.length>240)throw Error('Invalid Proposition text/label');
   const rows=annotations(request.annotations,request.text),name=request.name.trim()||[...request.text.trim().split('\n')[0]].slice(0,120).join('')||'Untitled proposition';
   const blockId=old?.blockId??guid(request.blockId);if(blockId===id)throw Error('Block and Entity identities must be independent');
   const vaultGuid=db.prepare("SELECT value FROM SchemaInfo WHERE key='vaultGuid'").get().value;
   const attrs=old?.attributes??{thesis:{version:1,archived:false,...(request.source?{source:source(request.source,vaultGuid)}:{})}};
   attrs.thesis={...attrs.thesis,annotationOrder:rows.map(row=>row.guid)};
   if(old){
    ctx.change('Entity',id,()=>db.prepare('UPDATE Entity SET name=?,nameKey=?,revision=revision+1,modifiedUtc=?,lastUpdatedByActorGuid=? WHERE guid=?').run(name,name.normalize('NFKC').toLowerCase(),ctx.now,ctx.actorGuid,id));
    ctx.change('Block',blockId,()=>db.prepare('UPDATE Block SET text=?,cellCount=?,attributes=?,modifiedUtc=?,lastUpdatedByActorGuid=? WHERE guid=?').run(request.text,[...request.text].length,JSON.stringify(attrs),ctx.now,ctx.actorGuid,blockId));
   }else{
    for(const table of canonicalTables)if(table!=='Time'&&db.prepare(`SELECT 1 FROM ${table} WHERE guid=?`).get(id))throw Error('Canonical GUID already exists');
    ctx.change('Entity',id,()=>insert(db,'Entity',{guid:id,typename:'Proposition',name,nameKey:name.normalize('NFKC').toLowerCase(),createdUtc:ctx.now,createdByActorGuid:ctx.actorGuid,...stamp}));
    ctx.change('Block',blockId,()=>insert(db,'Block',{guid:blockId,entityGuid:id,resourceGuid:null,typename:type,authoredType:type,text:request.text,coordinate:'cell',cellCount:[...request.text].length,attributes:JSON.stringify(attrs),createdUtc:ctx.now,createdByActorGuid:ctx.actorGuid,...stamp}));
   }
   const prior=new Map(db.prepare('SELECT guid,createdUtc,createdByActorGuid FROM StandoffProperty WHERE sourceBlockGuid=?').all(blockId).map(p=>[p.guid,p]));
   const incoming=new Set(rows.map(r=>r.guid));
   for(const p of prior.values())if(!incoming.has(p.guid))ctx.change('StandoffProperty',p.guid,()=>db.prepare('DELETE FROM StandoffProperty WHERE guid=?').run(p.guid));
   for(const row of rows)ctx.change('StandoffProperty',row.guid,()=>{
    const before=prior.get(row.guid);
    if(before)db.prepare('DELETE FROM StandoffProperty WHERE guid=? AND sourceBlockGuid=?').run(row.guid,blockId);
    insert(db,'StandoffProperty',{...row,resourceGuid:null,sourceBlockGuid:blockId,createdUtc:before?.createdUtc??ctx.now,createdByActorGuid:before?.createdByActorGuid??ctx.actorGuid,...stamp});
   });
   // Derived text-search materialization belongs to the canonical Block lifecycle.
   db.prepare('INSERT INTO BlockTextRun(blockGuid,ordinal,text) VALUES(?,0,?) ON CONFLICT(blockGuid,ordinal) DO UPDATE SET text=excluded.text').run(blockId,request.text);
  }
  check();return {proposition:get(db,id)};
 },check);
}
