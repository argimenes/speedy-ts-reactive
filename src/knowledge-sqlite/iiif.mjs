import {randomUUID} from 'node:crypto';
import {guid} from './canonical-ledger.mjs';
const associated=(db,r)=>db.prepare("SELECT attributes FROM SourceSnapshot WHERE json_extract(attributes,'$.parentSnapshotId')=? AND json_extract(attributes,'$.canvasId')=? AND json_extract(attributes,'$.kind')=? ORDER BY id LIMIT 257").all(guid(r.snapshotId),r.canvasId,r.kind).map(r=>JSON.parse(r.attributes));
export function iiif(db,r,ledger,check=()=>{}){
 check();
 if(r.op==='iiif-snapshot'){const row=db.prepare('SELECT attributes FROM SourceSnapshot WHERE guid=?').get(guid(r.snapshotId));if(!row)throw Error('IIIF snapshot unavailable');return {snapshot:JSON.parse(row.attributes)};}
 if(r.op==='iiif-associated'){if(!['iiif-canvas','iiif-retained'].includes(r.kind)||typeof r.canvasId!=='string'||r.canvasId.length>4096)throw Error('Invalid IIIF association');return {snapshots:associated(db,r)};}
 if(r.op!=='iiif-commit')throw Error('Unknown IIIF operation');
 return ledger.mutate(r,ctx=>{
  const s=r.snapshot;
  if(s?.version!==1||!['iiif-manifest','iiif-image','iiif-canvas','iiif-retained'].includes(s.kind)||!/^sha256:[a-f0-9]{64}$/.test(s.asset?.assetId)||s.asset?.kind!=='managed'||typeof s.label!=='string'||s.label.length>4000)throw Error('Invalid IIIF capture');
  const url=new URL(s.resourceUrl);if(!['https:','http:'].includes(url.protocol)||url.username||url.password||s.resourceUrl.length>4096)throw Error('Invalid IIIF identity');guid(s.snapshotId);
  if(s.parentSnapshotId){guid(s.parentSnapshotId);const parent=db.prepare('SELECT attributes FROM SourceSnapshot WHERE guid=?').get(s.parentSnapshotId);if(!parent||!JSON.parse(parent.attributes).kind.startsWith('iiif-'))throw Error('Missing IIIF parent');if(typeof s.canvasId!=='string'||s.canvasId.length>4096)throw Error('Invalid canvas');
   const old=associated(db,{snapshotId:s.parentSnapshotId,canvasId:s.canvasId,kind:s.kind});
   if(s.kind==='iiif-canvas'&&old.length)return {snapshot:old[0]};
   if(s.kind==='iiif-retained'){if(!/^\d+\/\d+\/\d+$/.test(s.tileKey??''))throw Error('Invalid retained tile');const prior=old.find(x=>x.tileKey===s.tileKey);if(prior)return {snapshot:prior};if(old.length>=256)throw Error('Retained tile count for canvas reached 256');}
  }else if(['iiif-canvas','iiif-retained'].includes(s.kind))throw Error('Missing parent snapshot');
  let identity=db.prepare("SELECT * FROM ExternalIdentity WHERE namespace='iiif' AND externalKey=?").get(s.resourceUrl);
  if(!identity){identity={guid:randomUUID(),entityGuid:randomUUID(),resourceGuid:randomUUID()};
   ctx.change('Entity',identity.entityGuid,()=>db.prepare('INSERT INTO Entity(guid,typename,name,nameKey,attributes,createdUtc,modifiedUtc) VALUES(?,?,?,?,?,?,?)').run(identity.entityGuid,'IIIFResource',s.label,s.label.normalize('NFKC').toLowerCase(),JSON.stringify({origin:'source-imported'}),ctx.now,ctx.now));
   ctx.change('ExternalIdentity',identity.guid,()=>db.prepare('INSERT INTO ExternalIdentity(guid,entityGuid,resourceGuid,namespace,externalKey,attributes) VALUES(?,?,?,?,?,?)').run(identity.guid,identity.entityGuid,identity.resourceGuid,'iiif',s.resourceUrl,JSON.stringify({origin:'declared-resource-identity'})));
  }
  const key=[s.kind,s.asset.assetId,s.parentSnapshotId??'',s.canvasId??'',s.tileKey??''].join('\n'),prior=db.prepare('SELECT attributes FROM SourceSnapshot WHERE identityGuid=? AND captureKey=?').get(identity.guid,key);if(prior)return {snapshot:JSON.parse(prior.attributes)};
  const snapshot={...s,identityId:identity.guid,entityId:identity.entityGuid,resourceId:identity.resourceGuid};
  ctx.change('SourceSnapshot',s.snapshotId,()=>db.prepare('INSERT INTO SourceSnapshot(guid,identityGuid,attributes,captureKey) VALUES(?,?,?,?)').run(s.snapshotId,identity.guid,JSON.stringify(snapshot),key));check();return {snapshot};
 },check);
}
