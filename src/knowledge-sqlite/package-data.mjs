/** Read-only archival extraction. Never uses the presentation service's lossy wire projection. */
export const PACKAGE_TABLES = ['Actor','Entity','EntityAlias','Relationship','Time','Claim','ClaimParticipant','ClaimQualifier','ClaimEvidence','DataSet','DataPoint','DataPointDimension','DataSetMembership'];
const quote = name => '"'+name.replaceAll('"','""')+'"';
export function sqlValue(value) {
  if(value===null)return ['null'];
  if(typeof value==='bigint')return ['integer',String(value)];
  if(typeof value==='number'){const bytes=Buffer.alloc(8);bytes.writeDoubleBE(value);return ['real',bytes.toString('hex')];}
  if(typeof value==='string')return ['text',value];
  if(Buffer.isBuffer(value)||value instanceof Uint8Array)return ['blob',Buffer.from(value).toString('base64')];
  throw Error('Unsupported SQLite storage class');
}
export function extractPackageData(db, request, check=()=>{}) {
  const seeds=request?.entities,claimSeeds=request?.claimsById??[];
  if(!Array.isArray(seeds)||!Array.isArray(claimSeeds)||seeds.length+claimSeeds.length>500||[...seeds,...claimSeeds].some(x=>typeof x!=='string'||!x||x.length>1024))throw Error('Package entity seeds must contain at most 500 identifiers');
  const options={relationships:request.relationships===true,claims:request.claims===true,evidence:request.evidence===true,actors:request.actors===true,observedAliases:request.observedAliases===true};
  if(options.evidence&&!options.claims&&!claimSeeds.length)throw Error('Evidence requires explicit claim inclusion');
  return db.transaction(()=>{
    const tables=new Map(PACKAGE_TABLES.map(name=>[name,new Map()])),unresolved=[],excluded=[];
    let count=0,bytes=0,queries=0;
    const select=(table,column,value,where='')=>{
      check();queries++;
      const rows=db.prepare(`SELECT * FROM ${quote(table)} WHERE ${quote(column)} = ? ${where} LIMIT 5001`).safeIntegers().all(value);
      if(rows.length>5000)throw Error('Package row limit exceeded; narrow the export boundary');
      for(const row of rows){check();
        const key=String(row.id),target=tables.get(table);if(target.has(key))continue;
        // Invalid UTF-8 TEXT cannot round-trip through JSON strings; reject instead of replacing bytes.
        for(const [column,v] of Object.entries(row))if(typeof v==='string'){
          const raw=db.prepare(`SELECT CAST(${quote(column)} AS BLOB) AS raw FROM ${quote(table)} WHERE id=?`).get(row.id).raw;queries++;
          if(!Buffer.from(v,'utf8').equals(raw))throw Error(`Non-UTF-8 text in ${table}.${column} cannot be archived in v1`);
        }
        if(++count>5000)throw Error('Package row limit exceeded');
        bytes+=Buffer.byteLength(JSON.stringify(Object.values(row).map(sqlValue)));if(bytes>8*1024*1024)throw Error('Package data exceeds 8 MiB');
        target.set(key,row);
      }
      return rows;
    };
    const resolvedEntities=new Set();
    const entity=guid=>{if(resolvedEntities.has(guid))return;resolvedEntities.add(guid);if(!select('Entity','guid',guid).length)unresolved.push({table:'Entity',column:'guid',value:guid,reason:'Referenced entity is absent'});};
    const unique=[...new Set(seeds)];unique.forEach(entity);
    // Expand only the original seeds. Closure endpoints never become new graph roots.
    for(const guid of unique){
      if(options.relationships){select('Relationship','sourceEntityGuid',guid);select('Relationship','targetEntityGuid',guid);}
      if(options.claims){select('ClaimParticipant','entityGuid',guid);select('ClaimQualifier','entityGuid',guid);}
    }
    const claims=new Set([...claimSeeds,...[...tables.get('ClaimParticipant').values(),...tables.get('ClaimQualifier').values()].map(r=>r.claimGuid)]);
    for(const guid of claims){if(!select('Claim','guid',guid).length)unresolved.push({table:'Claim',column:'guid',value:guid,reason:'Referenced claim is absent'});select('ClaimParticipant','claimGuid',guid);select('ClaimQualifier','claimGuid',guid);if(options.evidence)select('ClaimEvidence','claimGuid',guid);}
    for(const r of tables.get('Relationship').values()){entity(r.sourceEntityGuid);entity(r.targetEntityGuid);}
    for(const table of ['ClaimParticipant','ClaimQualifier'])for(const r of tables.get(table).values())entity(r.entityGuid);
    for(const r of tables.get('Entity').values()){select('Time','entityGuid',r.guid);select('EntityAlias','entityGuid',r.guid,options.observedAliases?'':"AND origin IN ('curated','imported')");}
    const actors=new Set();
    for(const rows of tables.values())for(const r of rows.values())for(const field of ['createdByActorGuid','lastUpdatedByActorGuid'])if(r[field])actors.add(r[field]);
    for(const guid of actors){if(options.actors){if(!select('Actor','guid',guid).length)unresolved.push({table:'Actor',column:'guid',value:guid,reason:'Missing actor'});}else excluded.push({table:'Actor',column:'guid',value:guid,reason:'Actor records require explicit inclusion'});}
    for(const r of tables.get('ClaimEvidence').values())unresolved.push({table:'Resource',column:'guid',value:r.resourceGuid,reason:'Historical evidence source is not exported or verified; sourceContentHash is retained'});
    const schemaTables=PACKAGE_TABLES.map(name=>({name,sql:db.prepare("SELECT sql FROM sqlite_schema WHERE type='table' AND name=?").get(name).sql,columns:db.prepare(`PRAGMA table_xinfo(${quote(name)})`).all(),foreignKeys:db.prepare(`PRAGMA foreign_key_list(${quote(name)})`).all(),indexes:db.prepare("SELECT name,sql FROM sqlite_schema WHERE type='index' AND tbl_name=? ORDER BY name").all(name)}));
    const keyIndexes=new Map();
    for(const table of schemaTables)for(const fk of table.foreignKeys){
      const key=fk.table+'\0'+fk.to;let index=keyIndexes.get(key);
      if(!index){index=new Set([...tables.get(fk.table)?.values()??[]].map(r=>JSON.stringify(sqlValue(r[fk.to]))));keyIndexes.set(key,index);}
      for(const row of tables.get(table.name).values())if(row[fk.from]!==null&&!index.has(JSON.stringify(sqlValue(row[fk.from]))))unresolved.push({table:table.name,column:fk.from,rowId:String(row.id),targetTable:fk.table,targetColumn:fk.to,value:sqlValue(row[fk.from]),reason:'Foreign-key target is outside the selected rows'});
    }
    const schema={kind:'mutable-knowledge-schema',version:1,sqliteVersion:db.prepare('SELECT sqlite_version() AS version').get().version,encoding:db.pragma('encoding',{simple:true}),applicationId:db.pragma('application_id',{simple:true}),userVersion:db.pragma('user_version',{simple:true}),schemaInfo:db.prepare('SELECT * FROM SchemaInfo ORDER BY key').all(),tables:schemaTables};
    const data={kind:'mutable-package-data',version:1,readOnly:true,encoding:'sqlite-storage-class-v1',provenance:{exportedUtc:new Date().toISOString(),documentHash:request.documentHash??null},selection:{entitySeeds:unique,claimSeeds:[...new Set(claimSeeds)],options,rule:'Direct Entity/Time/Claim seeds; optional one-hop relationships and claims from authored Entity seeds only; endpoint entities, Time and selected aliases; no recursive graph expansion'},tables:schemaTables.map(t=>({name:t.name,classification:t.name==='EntityAlias'?'canonical-with-origin':'canonical',columns:t.columns.map(c=>c.name),rows:[...tables.get(t.name).values()].map(r=>t.columns.map(c=>sqlValue(r[c.name])))})),unresolved,excluded:[...excluded,{reason:'No Trait table/service exists. Attributes and typed claims are retained without reinterpretation.'},{reason:'DataPoint/Dimension discovery from entities is excluded: no entity-first dimension index; no arbitrary-role scan.'},{reason:'Derived Resource/Block/index facts, FTS, backlinks, audit/outbox, unrelated documents and schemaless attribute references are not followed.'},...Object.entries(options).filter(([,yes])=>!yes).map(([name])=>({reason:`Optional ${name==='claims'?'adjacent-claim discovery':name} excluded`}))],metrics:{rows:count,encodedValueBytes:bytes,queries}};
    check();return {data,schema};
  }).deferred();
}
