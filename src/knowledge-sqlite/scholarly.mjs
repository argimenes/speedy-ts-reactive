import {guid,canonicalTables} from './canonical-ledger.mjs';
const lookup=(db,doi)=>{
 const row=db.prepare("SELECT s.attributes FROM ExternalIdentity i JOIN SourceSnapshot s ON s.identityGuid=i.guid WHERE i.namespace='doi' AND i.externalKey=? ORDER BY s.id DESC LIMIT 1").get(doi);
 return row?JSON.parse(row.attributes):null;
};
export function scholarly(db,request,ledger,check=()=>{}){
 check();
 if(request.op==='scholarly-backlinks'){
  guid(request.entityId);
  return {rows:db.prepare("SELECT DISTINCT r.guid AS documentId,r.path,r.title,b.guid AS blockId FROM BlockProperty p JOIN Block b ON b.guid=p.blockGuid JOIN Resource r ON r.guid=b.resourceGuid WHERE p.typename='codex/entity-reference' AND p.isDeleted=0 AND p.value=? AND r.indexStatus IN ('complete','incomplete') ORDER BY r.path,b.guid LIMIT 101").all(request.entityId)};
 }
 if(typeof request.doi!=='string'||request.doi.length>4096||!/^10\.\d{4,9}\/[^\s]+$/.test(request.doi)||/[A-Z]/.test(request.doi))throw Error('Invalid normalized DOI');
 if(request.op==='scholarly-lookup')return {citation:lookup(db,request.doi)};
 if(request.op!=='scholarly-commit')throw Error('Unsupported scholarly operation');
 return ledger.mutate(request,ctx=>{
  const existing=lookup(db,request.doi);if(existing)return {citation:existing,reused:true};
  const c=request.citation;if(new Set([request.identityId,c?.entityId,c?.resourceId,c?.snapshotId]).size!==4)throw Error('Canonical identity collision');for(const id of [request.identityId,c?.entityId,c?.resourceId,c?.snapshotId]){guid(id);for(const t of canonicalTables)if(t!=='Time'&&db.prepare(`SELECT 1 FROM ${t} WHERE guid=?`).get(id))throw Error('Canonical identity collision');}
  if(c?.version!==1||c.metadata?.doi!==request.doi||typeof c.metadata.title!=='string'||!c.metadata.title.trim()||c.metadata.title.length>1000||!['crossref','datacite'].includes(c.provider)||!/^sha256:[a-f0-9]{64}$/.test(c.asset?.assetId))throw Error('Invalid scholarly capture');
  ctx.change('Entity',c.entityId,()=>db.prepare('INSERT INTO Entity(guid,typename,name,nameKey,attributes,createdUtc,modifiedUtc) VALUES(?,?,?,?,?,?,?)').run(c.entityId,c.metadata.type,c.metadata.title,c.metadata.title.normalize('NFKC').toLowerCase(),JSON.stringify({scholarly:{providerType:c.metadata.providerType,origin:'source-imported'}}),ctx.now,ctx.now));
  ctx.change('ExternalIdentity',request.identityId,()=>db.prepare('INSERT INTO ExternalIdentity(guid,entityGuid,resourceGuid,namespace,externalKey,attributes) VALUES(?,?,?,\'doi\',?,?)').run(request.identityId,c.entityId,c.resourceId,request.doi,JSON.stringify({provider:c.provider,endpoint:c.endpoint,retrievedAt:c.retrievedAt})));
  ctx.change('SourceSnapshot',c.snapshotId,()=>db.prepare('INSERT INTO SourceSnapshot(guid,identityGuid,attributes) VALUES(?,?,?)').run(c.snapshotId,request.identityId,JSON.stringify(c)));
  check();return {citation:c,reused:false};
 },check);
}
