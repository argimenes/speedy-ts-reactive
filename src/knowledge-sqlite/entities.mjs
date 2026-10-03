import { sqlRevision } from './reconcile.mjs';
const key = s => s.normalize('NFKC').toLowerCase();
const string = (v, max = 1000) => { if (typeof v !== 'string' || !v.trim() || v.length > max) throw Error('Invalid Entity value'); return v; };
const guid = v => { string(v, 512); if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)) throw Error('Supply a stable UUID'); return v; };
const expected = v => { if (!Number.isSafeInteger(v) || v < 0) throw Error('Expected revision required'); return v; };
const entity = (db, id) => { const row = db.prepare('SELECT guid AS id,name,revision,description FROM Entity WHERE guid=?').get(string(id,512)); if (!row) return; return {...row, aliases: db.prepare("SELECT guid AS id,alias AS name,origin,revision FROM EntityAlias WHERE entityGuid=? AND origin IN ('curated','imported') ORDER BY aliasKey,guid LIMIT 201").all(id)}; };
export const entityMutation = op => ['create','rename','alias-add','alias-update','alias-remove','relationship-create','relationship-update'].includes(op);
/** Canonical database operations only. Never creates aliases/relationships from mentions. */
export function canonicalEntities(db, request, check = () => {}) {
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
      const relationships=db.prepare(`SELECT guid AS id,sourceEntityGuid AS source,typename AS type,targetEntityGuid AS target,revision FROM Relationship WHERE ${request.direction==='out'?'sourceEntityGuid':'targetEntityGuid'}=? ORDER BY guid LIMIT 101`).all(request.id); result={relationships:relationships.slice(0,100),complete:relationships.length<=100};
    } else throw Error('Unsupported canonical Entity operation');
    check(); return {...result,revision};
  }).deferred();
  return db.transaction(() => {
    check(); const operationId=guid(request.operationId), serialized=JSON.stringify(request);
    const receipt=db.prepare('SELECT payload FROM PendingAuditMutation WHERE guid=?').get(operationId);
    if(receipt){const prior=JSON.parse(receipt.payload);if(prior.request!==serialized)throw Error('Mutation retry differs from original');return {...prior.result,revision:sqlRevision(db)};}
    // P4 owns delivery. Never silently discard canonical audit events or grow without bound.
    const budget=db.prepare('SELECT count(*) AS count,coalesce(sum(length(CAST(payload AS BLOB))),0) AS bytes FROM PendingAuditMutation').get();
    if(budget.count>=10000||budget.bytes>=16*1024*1024)throw Error('Canonical audit outbox full; no mutation committed');
    const now=new Date().toISOString();let result;
    if(op==='create') {
      const id=guid(request.id),name=string(request.name),old=entity(db,id);
      if(old&&old.name!==name)throw Error('Entity GUID already exists with different data');
      if(!old)db.prepare('INSERT INTO Entity(guid,name,nameKey,createdUtc,modifiedUtc) VALUES(?,?,?,?,?)').run(id,name,key(name),now,now);
      result={entity:entity(db,id)};
    } else if(op==='rename') {
      const name=string(request.name);if(!db.prepare('UPDATE Entity SET name=?,nameKey=?,revision=revision+1,modifiedUtc=? WHERE guid=? AND revision=?').run(name,key(name),now,string(request.id,512),expected(request.expected)).changes)throw Error('Entity revision changed or missing');
      result={entity:entity(db,request.id)};
    } else if(op==='alias-add') {
      const id=guid(request.id),name=string(request.name);if(!entity(db,request.entityId))throw Error('Entity missing');
      if(db.prepare('SELECT count(*) AS n FROM EntityAlias WHERE entityGuid=?').get(request.entityId).n>=200)throw Error('Entity alias budget exceeded');
      db.prepare("INSERT INTO EntityAlias(guid,entityGuid,alias,aliasKey,origin,createdUtc,modifiedUtc) VALUES(?,?,?,?,'curated',?,?)").run(id,request.entityId,name,key(name),now,now);result={entity:entity(db,request.entityId)};
    } else if(op==='alias-update'||op==='alias-remove') {
      const args=[string(request.id,512),string(request.entityId,512),expected(request.expected)];
      const changed=op==='alias-remove'?db.prepare("DELETE FROM EntityAlias WHERE guid=? AND entityGuid=? AND revision=? AND origin IN ('curated','imported')").run(...args):db.prepare("UPDATE EntityAlias SET alias=?,aliasKey=?,modifiedUtc=?,revision=revision+1 WHERE guid=? AND entityGuid=? AND revision=? AND origin IN ('curated','imported')").run(string(request.name),key(request.name),now,...args);
      if(!changed.changes)throw Error('Alias revision changed or missing');result={entity:entity(db,request.entityId)};
    } else {
      const id=guid(request.id);if(!entity(db,request.source)||!entity(db,request.target))throw Error('Relationship endpoint missing');
      if(op==='relationship-update'){if(!db.prepare('UPDATE Relationship SET sourceEntityGuid=?,typename=?,targetEntityGuid=?,revision=revision+1,modifiedUtc=? WHERE guid=? AND revision=?').run(request.source,string(request.type,256),request.target,now,id,expected(request.expected)).changes)throw Error('Relationship revision changed or missing');}
      else db.prepare('INSERT INTO Relationship(guid,sourceEntityGuid,typename,targetEntityGuid,createdUtc,modifiedUtc) VALUES(?,?,?,?,?,?)').run(id,request.source,string(request.type,256),request.target,now,now);result={id};
    }
    check(); const payload=JSON.stringify({kind:'canonical-entity',request:serialized,result});
    if(budget.bytes+Buffer.byteLength(payload)>16*1024*1024)throw Error('Canonical audit outbox full; no mutation committed');
    db.prepare('INSERT INTO PendingAuditMutation VALUES(?,?,?)').run(operationId,now,payload);
    return {...result,revision:sqlRevision(db)};
  }).immediate();
}
