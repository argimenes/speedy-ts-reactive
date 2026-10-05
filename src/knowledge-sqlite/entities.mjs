import { sqlRevision } from './reconcile.mjs';
import {canonicalLedger,canonicalTables} from './canonical-ledger.mjs';
import {decodeAuthoredValue} from '../history/preplan-spike/authored-values.mjs';
const key = s => s.normalize('NFKC').toLowerCase();
const string = (v, max = 1000) => { if (typeof v !== 'string' || !v.trim() || v.length > max) throw Error('Invalid Entity value'); return v; };
const guid = v => { string(v, 512); if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)) throw Error('Supply a stable UUID'); return v; };
const expected = v => { if (!Number.isSafeInteger(v) || v < 0) throw Error('Expected revision required'); return v; };
const entity = (db, id) => { const row = db.prepare('SELECT guid AS id,name,revision,description,typename,attributes FROM Entity WHERE guid=?').get(string(id,512)); if (!row) return; return {...row,attributes:row.attributes===null?null:JSON.parse(row.attributes), aliases: db.prepare("SELECT guid AS id,alias AS name,origin,revision FROM EntityAlias WHERE entityGuid=? AND origin IN ('curated','imported') ORDER BY aliasKey,guid LIMIT 201").all(id)}; };
export const entityMutation = op => ['create','rename','update','alias-add','alias-update','alias-remove','relationship-create','relationship-update'].includes(op);
/** Typed semantic dispatch keeps the existing Entity/Relationship operation names. */
export function entityCommand(request){
 const {recordType,...input}=request;
 const relationship=['relationship-create','relationship-update','relationships'].includes(input.op);
 if(!['Entity','Relationship'].includes(recordType)||relationship!==(recordType==='Relationship'))throw Error('Canonical record type and operation differ');
 return input;
}
/** Canonical database operations only. Never creates aliases/relationships from mentions. */
export function canonicalEntities(db, request, check = () => {}, ledger = canonicalLedger(db)) {
  check();
  if (!request || typeof request !== 'object' || Buffer.byteLength(JSON.stringify(request)) > 32768) throw Error('Entity request budget exceeded');
  const {op}=request;
  if (!entityMutation(op)) return db.transaction(() => {
    const revision = sqlRevision(db); let result;
    if (op === 'current') result = {};
    else if (op === 'get') result = {entity: entity(db,request.id)};
    else if (op === 'resolve') {
      if (!Array.isArray(request.ids) || request.ids.length > 100) throw Error('Resolve at most 100 Entities');
      result = {entities: [...new Set(request.ids)].map(id => entity(db,id)).filter(Boolean)};
    } else if (op === 'search') {
      if (!['all','name','alias'].includes(request.stream) || !['partial','exact'].includes(request.match) || typeof request.query !== 'string' || request.query.length > 1000) throw Error('Invalid Entity search');
      const query=key(request.query), pattern=request.match==='exact'?query:'%'+query.replace(/[\\%_]/g,'\\$&')+'%';
      const comparator=request.match==='exact'?'= ?':"LIKE ? ESCAPE '\\'";
      const rows=[];
      if (query.trim() && request.stream!=='alias') for(const r of db.prepare(`SELECT guid AS id,name FROM Entity WHERE nameKey ${comparator} ORDER BY nameKey,guid LIMIT 101`).all(pattern)) rows.push({...r,kind:'name',text:r.name});
      if (query.trim() && request.stream!=='name') for(const r of db.prepare(`SELECT e.guid AS id,e.name,a.alias AS text FROM EntityAlias a JOIN Entity e ON e.guid=a.entityGuid WHERE a.origin IN ('curated','imported') AND a.aliasKey ${comparator} ORDER BY e.nameKey,e.guid,a.aliasKey LIMIT 101`).all(pattern)) rows.push({...r,kind:'alias'});
      result={matches:rows.slice(0,100),complete:rows.length<=100};
    } else if (op==='relationships') {
      string(request.id,512); if(!['out','in'].includes(request.direction))throw Error('Invalid relationship direction');
      const relationships=db.prepare(`SELECT guid AS id,sourceEntityGuid AS source,typename AS type,targetEntityGuid AS target,revision,attributes FROM Relationship WHERE ${request.direction==='out'?'sourceEntityGuid':'targetEntityGuid'}=? ORDER BY guid LIMIT 101`).all(request.id); result={relationships:relationships.slice(0,100).map(r=>({...r,attributes:r.attributes===null?null:JSON.parse(r.attributes)})),complete:relationships.length<=100};
    } else throw Error('Unsupported canonical Entity operation');
    check(); return {...result,revision};
  }).deferred();
  return ledger.mutate(request,ctx=>{
    const {now,actorGuid}=ctx;let result;
    const table=op.startsWith('alias-')?'EntityAlias':op.startsWith('relationship-')?'Relationship':'Entity';
    const id=guid(request.id);
    const attributes=v=>{decodeAuthoredValue(v);return JSON.stringify(v);};
    const nullable=(v,max=100000)=>{if(v!==null&&(typeof v!=='string'||v.length>max))throw Error('Invalid nullable Entity field');return v;};
    const collision=()=>{for(const t of canonicalTables)if(t!=='Time'&&db.prepare(`SELECT 1 FROM ${t} WHERE guid=?`).get(id))throw Error('Canonical GUID already exists');};
    ctx.change(table,id,()=>{
      if(op==='create'){
        const name=string(request.name),old=entity(db,id),typename=request.typename===undefined?null:nullable(request.typename,256),description=request.description===undefined?null:nullable(request.description),attrs=request.attributes===undefined?null:attributes(request.attributes);
        if(old){if(old.name!==name||request.typename!==undefined&&old.typename!==typename||request.description!==undefined&&old.description!==description||request.attributes!==undefined&&JSON.stringify(old.attributes)!==attrs)throw Error('Entity GUID already exists with different data');result={entity:old,outcome:'already-equivalent'};return;}
        collision();db.prepare('INSERT INTO Entity(guid,name,nameKey,typename,description,attributes,createdByActorGuid,createdUtc,lastUpdatedByActorGuid,modifiedUtc) VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,name,key(name),typename,description,attrs,actorGuid,now,actorGuid,now);result={entity:entity(db,id)};
      }else if(op==='rename'||op==='update'){
        const old=entity(db,id);if(!old||old.revision!==expected(request.expected))throw Error('Entity revision changed or missing');
        const name=request.name===undefined?old.name:string(request.name),typename=request.typename===undefined?old.typename:nullable(request.typename,256);
        if(typename!=='Time'&&db.prepare("SELECT 1 FROM sqlite_schema WHERE name='Time'").get()&&db.prepare('SELECT 1 FROM Time WHERE entityGuid=?').get(id))throw Error('Time extension requires Entity typename Time');
        if(typename!=='Concept'&&db.prepare("SELECT 1 FROM sqlite_schema WHERE name='ClaimQualifier'").get()&&db.prepare("SELECT 1 FROM ClaimQualifier WHERE entityGuid=? AND role='type-of'").get(id))throw Error('Existing type-of Claim qualifications require Concept Entity');
        db.prepare('UPDATE Entity SET name=?,nameKey=?,typename=?,description=?,attributes=?,revision=revision+1,lastUpdatedByActorGuid=?,modifiedUtc=? WHERE guid=? AND revision=?').run(name,key(name),typename,request.description===undefined?old.description:nullable(request.description),request.attributes===undefined?(old.attributes===null?null:JSON.stringify(old.attributes)):attributes(request.attributes),actorGuid,now,id,request.expected);result={entity:entity(db,id)};
      }else if(op==='alias-add'){
        const name=string(request.name);if(!entity(db,request.entityId))throw Error('Entity missing');collision();
        if(db.prepare('SELECT count(*) AS n FROM EntityAlias WHERE entityGuid=?').get(request.entityId).n>=200)throw Error('Entity alias budget exceeded');
        const origin=request.origin??'curated';if(!['curated','imported'].includes(origin))throw Error('Invalid authored alias origin');
        db.prepare('INSERT INTO EntityAlias(guid,entityGuid,alias,aliasKey,origin,createdByActorGuid,createdUtc,lastUpdatedByActorGuid,modifiedUtc) VALUES(?,?,?,?,?,?,?,?,?)').run(id,request.entityId,name,key(name),origin,actorGuid,now,actorGuid,now);result={entity:entity(db,request.entityId)};
      }else if(op==='alias-update'||op==='alias-remove'){
        const args=[id,string(request.entityId,512),expected(request.expected)];
        const changed=op==='alias-remove'?db.prepare("DELETE FROM EntityAlias WHERE guid=? AND entityGuid=? AND revision=? AND origin IN ('curated','imported')").run(...args):db.prepare("UPDATE EntityAlias SET alias=?,aliasKey=?,modifiedUtc=?,lastUpdatedByActorGuid=?,revision=revision+1 WHERE guid=? AND entityGuid=? AND revision=? AND origin IN ('curated','imported')").run(string(request.name),key(request.name),now,actorGuid,...args);
        if(!changed.changes)throw Error('Alias revision changed or missing');result={entity:entity(db,request.entityId)};
      }else{
        if(!entity(db,request.source)||!entity(db,request.target))throw Error('Relationship endpoint missing');
        const old=db.prepare('SELECT * FROM Relationship WHERE guid=?').get(id),attrs=request.attributes===undefined?(old?.attributes??null):attributes(request.attributes);
        if(op==='relationship-update'){
          if(!db.prepare('UPDATE Relationship SET sourceEntityGuid=?,typename=?,targetEntityGuid=?,attributes=?,revision=revision+1,lastUpdatedByActorGuid=?,modifiedUtc=? WHERE guid=? AND revision=?').run(request.source,string(request.type,256),request.target,attrs,actorGuid,now,id,expected(request.expected)).changes)throw Error('Relationship revision changed or missing');
        }else{collision();db.prepare('INSERT INTO Relationship(guid,sourceEntityGuid,typename,targetEntityGuid,attributes,createdByActorGuid,createdUtc,lastUpdatedByActorGuid,modifiedUtc) VALUES(?,?,?,?,?,?,?,?,?)').run(id,request.source,string(request.type,256),request.target,attrs,actorGuid,now,actorGuid,now);}
        result={id};
      }
    });return result;
  },check);
}
