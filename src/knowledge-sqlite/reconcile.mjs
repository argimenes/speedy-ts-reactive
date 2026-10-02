/** SQL-only transaction engine. Inputs are complete, private projections produced by the saved codec. */
const children={properties:['BlockProperty','blockGuid'],relations:['BlockRelation','sourceBlockGuid'],definitions:['AnnotationDefinition','ownerBlockGuid'],segments:['StandoffProperty','sourceBlockGuid'],runs:['BlockTextRun','blockGuid']};
const stable=v=>JSON.stringify(v,(_k,value)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.keys(value).sort().map(k=>[k,value[k]])):value);
const withoutId=row=>Object.fromEntries(Object.entries(row).filter(([k])=>k!=='id'));
const insert=(db,table,row)=>db.prepare(`INSERT INTO ${table}(${Object.keys(row).join(',')}) VALUES(${Object.keys(row).map(()=>'?').join(',')})`).run(...Object.values(row));
export function inventory(db){return db.prepare('SELECT guid,path,contentHash,saveGeneration,extractionProfile,indexStatus FROM Resource ORDER BY guid').all();}
export function baseline(db,id){const r=db.prepare('SELECT * FROM Resource WHERE guid=?').get(id);return r?stable(r):null;}
export function readProjection(db,id,check=()=>{}){
  const resource=db.prepare('SELECT * FROM Resource WHERE guid=?').get(id);if(!resource)return null;
  const blocks=db.prepare('SELECT * FROM Block WHERE resourceGuid=? ORDER BY guid').all(id).map(raw=>{
    check();const out={block:withoutId(raw)};
    for(const [key,[table,column]]of Object.entries(children))out[key]=db.prepare(`SELECT * FROM ${table} WHERE ${column}=? ORDER BY ${key==='runs'?'ordinal':'guid'}`).all(raw.guid).map(withoutId);
    return out;
  });
  return {resource:withoutId(resource),tags:db.prepare('SELECT tag FROM ResourceTag WHERE resourceGuid=? ORDER BY tag').all(id).map(r=>r.tag),blocks};
}
const ordered=b=>({...b,...Object.fromEntries(Object.keys(children).map(k=>[k,[...b[k]].sort((a,b)=>k==='runs'?a.ordinal-b.ordinal:a.guid.localeCompare(b.guid))]))});

/** Ephemeral worker-local SQL preparation. No publication or filesystem authority. */
export const sqlRevision=db=>[db.pragma('data_version',{simple:true}),db.prepare('SELECT total_changes() AS n').get().n].join(':');
export function prepareReconciliation(db,projection,evidence,expected,{mode='full',timings,check=()=>{}}={}) {
  if(!['full','incremental'].includes(mode))throw Error('Unknown reconciliation mode');
  return db.transaction(()=>{
    check();
    if(baseline(db,projection.resourceId)!==expected)throw Error('Stale SQL reconciliation baseline');
    if(evidence.contentHash!==projection.contentHash)throw Error('Saved byte evidence mismatch');
    const revision=sqlRevision(db),readStart=performance.now();
    const prior=readProjection(db,projection.resourceId,check),old=new Map((prior?.blocks??[]).map(b=>[b.block.guid,b]));
    const compared=performance.now();if(timings)timings.previousReadMs=compared-readStart;
    const row={guid:projection.resourceId,path:evidence.path,typename:projection.blocks.find(b=>b.block.guid===projection.rootBlockId).block.typename,
      format:projection.format,formatVersion:projection.formatVersion,rootBlockGuid:projection.rootBlockId,rootPlacementId:projection.rootPlacementId,
      title:projection.title,fileModifiedUtc:evidence.fileModifiedUtc??null,fileSize:evidence.fileSize??null,contentHash:projection.contentHash,
      saveGeneration:evidence.saveGeneration??null,indexedUtc:new Date().toISOString(),extractionProfile:projection.profile,indexStatus:projection.diagnostics.length?'incomplete':'complete',diagnostics:JSON.stringify(projection.diagnostics)};
    const next=new Map(projection.blocks.map(b=>{check();return [b.block.guid,ordered(b)];}));
    const changed=[...next.keys()].filter(id=>{check();return mode==='full'||!old.has(id)||stable(old.get(id))!==stable(next.get(id));});
    const removed=[...old.keys()].filter(id=>!next.has(id));
    // Same ownership/identity test as the full oracle. Any subsequent SQL change expires this proof.
    for(const id of next.keys()){check();const owner=db.prepare('SELECT resourceGuid FROM Block WHERE guid=?').get(id);if(owner&&owner.resourceGuid!==projection.resourceId)throw Error(`Block identity already claimed by ${owner.resourceGuid}`);}
    check();if(timings)timings.comparisonMs=performance.now()-compared;
    return {projection,evidence,expected,revision,mode,prior,row,next,changed,removed};
  }).deferred();
}
/** Publication only. Prepared reads/comparison remain outside the managed-store critical section. */
export function commitReconciliation(db,plan,{beforeCommit,timings,check=()=>{}}={}) {
  const started=performance.now();let mutationDone;
  const result=db.transaction(()=>{
    check();const {projection,evidence,expected,revision,mode,prior,row,next,changed,removed}=plan;
    if(baseline(db,projection.resourceId)!==expected||sqlRevision(db)!==revision)throw Error('Stale SQL reconciliation baseline');
    const mutationStart=performance.now();
    if(prior){db.prepare(`UPDATE Resource SET ${Object.keys(row).filter(k=>k!=='guid').map(k=>`${k}=?`).join(',')} WHERE guid=?`).run(...Object.entries(row).filter(([k])=>k!=='guid').map(([,v])=>v),row.guid);}
    else insert(db,'Resource',row);
    for(const id of [...removed,...changed]){check();db.prepare('DELETE FROM Block WHERE guid=? AND resourceGuid=?').run(id,projection.resourceId);}
    for(const id of changed){check();const b=next.get(id);insert(db,'Block',b.block);for(const [key,[table]]of Object.entries(children))for(const row of b[key]){check();insert(db,table,row);}}
    if(stable(prior?.tags??[])!==stable(projection.tags)){db.prepare('DELETE FROM ResourceTag WHERE resourceGuid=?').run(projection.resourceId);for(const tag of projection.tags)insert(db,'ResourceTag',{resourceGuid:projection.resourceId,tag});}
    db.prepare('DELETE FROM IndexIssue WHERE path=?').run(evidence.path);
    mutationDone=performance.now();if(timings)timings.mutationAndFtsMs=mutationDone-mutationStart;
    beforeCommit?.();check(); // Cancellation before commit rolls back Resource + FTS together.
    return {resourceId:projection.resourceId,contentHash:projection.contentHash,mode,changedBlocks:changed.length,removedBlocks:removed.length,unchangedBlocks:next.size-changed.length,diagnostics:projection.diagnostics};
  }).immediate();
  if(timings){timings.commitMs=performance.now()-mutationDone;timings.sqlTotalMs=performance.now()-started;}
  return result;
}
/** Full replacement remains the oracle; both modes derive the same complete projection. */
export function reconcile(db,projection,evidence,expected,options={}) {
  return commitReconciliation(db,prepareReconciliation(db,projection,evidence,expected,options),options);
}
export function removeConfirmed(db,id,expected){return db.transaction(()=>{if(expected===null||baseline(db,id)!==expected)throw Error('Stale deletion baseline');db.prepare('DELETE FROM Resource WHERE guid=?').run(id);return {removed:id};}).immediate();}
export function recordIssue(db,path,reason){db.transaction(()=>{
  db.prepare('INSERT INTO IndexIssue(path,reason,observedUtc) VALUES(?,?,?) ON CONFLICT(path) DO UPDATE SET reason=excluded.reason,observedUtc=excluded.observedUtc').run(path,reason,new Date().toISOString());
  db.prepare("UPDATE Resource SET indexStatus='stale' WHERE path=?").run(path);
})();return {incomplete:true,path,reason};}
