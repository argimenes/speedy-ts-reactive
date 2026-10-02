/** SQL-only transaction engine. Inputs are complete, private projections produced by the saved codec. */
const children={properties:['BlockProperty','blockGuid'],relations:['BlockRelation','sourceBlockGuid'],definitions:['AnnotationDefinition','ownerBlockGuid'],segments:['StandoffProperty','sourceBlockGuid'],runs:['BlockTextRun','blockGuid']};
const stable=v=>JSON.stringify(v,(_k,value)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.keys(value).sort().map(k=>[k,value[k]])):value);
const withoutId=row=>Object.fromEntries(Object.entries(row).filter(([k])=>k!=='id'));
const insert=(db,table,row)=>db.prepare(`INSERT INTO ${table}(${Object.keys(row).join(',')}) VALUES(${Object.keys(row).map(()=>'?').join(',')})`).run(...Object.values(row));
export function inventory(db){return db.prepare('SELECT guid,path,contentHash,saveGeneration,extractionProfile,indexStatus FROM Resource ORDER BY guid').all();}
export function baseline(db,id){const r=db.prepare('SELECT * FROM Resource WHERE guid=?').get(id);return r?stable(r):null;}
export function readProjection(db,id){
  const resource=db.prepare('SELECT * FROM Resource WHERE guid=?').get(id);if(!resource)return null;
  const blocks=db.prepare('SELECT * FROM Block WHERE resourceGuid=? ORDER BY guid').all(id).map(raw=>{
    const out={block:withoutId(raw)};
    for(const [key,[table,column]]of Object.entries(children))out[key]=db.prepare(`SELECT * FROM ${table} WHERE ${column}=? ORDER BY ${key==='runs'?'ordinal':'guid'}`).all(raw.guid).map(withoutId);
    return out;
  });
  return {resource:withoutId(resource),tags:db.prepare('SELECT tag FROM ResourceTag WHERE resourceGuid=? ORDER BY tag').all(id).map(r=>r.tag),blocks};
}
const ordered=b=>({...b,...Object.fromEntries(Object.keys(children).map(k=>[k,[...b[k]].sort((a,b)=>k==='runs'?a.ordinal-b.ordinal:a.guid.localeCompare(b.guid))]))});

/** Full replacement is the correctness oracle. Incremental mode diffs the SAME complete projection,
 * never trusts a caller-supplied changed-Block list or a live/unsaved mutation delta. */
export function reconcile(db,projection,evidence,expected,{mode='full',beforeCommit,timings}={}) {
  if(!['full','incremental'].includes(mode))throw Error('Unknown reconciliation mode');
  const started=performance.now();let mutationDone;
  const result=db.transaction(()=>{
    if(baseline(db,projection.resourceId)!==expected)throw Error('Stale SQL reconciliation baseline');
    if(evidence.contentHash!==projection.contentHash)throw Error('Saved byte evidence mismatch');
    const readStart=performance.now();
    const prior=readProjection(db,projection.resourceId),old=new Map((prior?.blocks??[]).map(b=>[b.block.guid,b]));
    const compared=performance.now();if(timings)timings.previousReadMs=compared-readStart;
    const row={guid:projection.resourceId,path:evidence.path,typename:projection.blocks.find(b=>b.block.guid===projection.rootBlockId).block.typename,
      format:projection.format,formatVersion:projection.formatVersion,rootBlockGuid:projection.rootBlockId,rootPlacementId:projection.rootPlacementId,
      title:projection.title,fileModifiedUtc:evidence.fileModifiedUtc??null,fileSize:evidence.fileSize??null,contentHash:projection.contentHash,
      saveGeneration:evidence.saveGeneration??null,indexedUtc:new Date().toISOString(),extractionProfile:projection.profile,indexStatus:projection.diagnostics.length?'incomplete':'complete',diagnostics:JSON.stringify(projection.diagnostics)};
    const next=new Map(projection.blocks.map(b=>[b.block.guid,ordered(b)]));
    const changed=[...next.keys()].filter(id=>mode==='full'||!old.has(id)||stable(old.get(id))!==stable(next.get(id)));
    const removed=[...old.keys()].filter(id=>!next.has(id));
    // A Block already claimed by another saved Resource is ambiguity, never ownership transfer.
    for(const id of next.keys()){const owner=db.prepare('SELECT resourceGuid FROM Block WHERE guid=?').get(id);if(owner&&owner.resourceGuid!==projection.resourceId)throw Error(`Block identity already claimed by ${owner.resourceGuid}`);}
    const mutationStart=performance.now();if(timings)timings.comparisonMs=mutationStart-compared;
    if(prior){db.prepare(`UPDATE Resource SET ${Object.keys(row).filter(k=>k!=='guid').map(k=>`${k}=?`).join(',')} WHERE guid=?`).run(...Object.entries(row).filter(([k])=>k!=='guid').map(([,v])=>v),row.guid);}
    else insert(db,'Resource',row);
    for(const id of [...removed,...changed])db.prepare('DELETE FROM Block WHERE guid=? AND resourceGuid=?').run(id,projection.resourceId);
    for(const id of changed){const b=next.get(id);insert(db,'Block',b.block);for(const [key,[table]]of Object.entries(children))for(const row of b[key])insert(db,table,row);}
    if(stable(prior?.tags??[])!==stable(projection.tags)){db.prepare('DELETE FROM ResourceTag WHERE resourceGuid=?').run(projection.resourceId);for(const tag of projection.tags)insert(db,'ResourceTag',{resourceGuid:projection.resourceId,tag});}
    db.prepare('DELETE FROM IndexIssue WHERE path=?').run(evidence.path);
    mutationDone=performance.now();if(timings)timings.mutationAndFtsMs=mutationDone-mutationStart;
    beforeCommit?.(); // Internal fault-injection oracle; never transported from a caller.
    return {resourceId:projection.resourceId,contentHash:projection.contentHash,mode,changedBlocks:changed.length,removedBlocks:removed.length,unchangedBlocks:next.size-changed.length,diagnostics:projection.diagnostics};
  }).immediate();
  if(timings){timings.commitMs=performance.now()-mutationDone;timings.sqlTotalMs=performance.now()-started;}
  return result;
}
export function removeConfirmed(db,id,expected){return db.transaction(()=>{if(expected===null||baseline(db,id)!==expected)throw Error('Stale deletion baseline');db.prepare('DELETE FROM Resource WHERE guid=?').run(id);return {removed:id};}).immediate();}
export function recordIssue(db,path,reason){db.transaction(()=>{
  db.prepare('INSERT INTO IndexIssue(path,reason,observedUtc) VALUES(?,?,?) ON CONFLICT(path) DO UPDATE SET reason=excluded.reason,observedUtc=excluded.observedUtc').run(path,reason,new Date().toISOString());
  db.prepare("UPDATE Resource SET indexStatus='stale' WHERE path=?").run(path);
})();return {incomplete:true,path,reason};}
