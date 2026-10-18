import {randomUUID} from 'node:crypto';
import {guid} from './canonical-ledger.mjs';
import {canonicalSemantics} from './semantics.mjs';
import {encodeAuthoredValue} from '../history/preplan-spike/authored-values.mjs';
const mapping=(db,namespace,key)=>db.prepare('SELECT * FROM ExternalIdentity WHERE namespace=? AND externalKey=?').get(namespace,key);
const capture=(db,id)=>{const r=db.prepare('SELECT attributes FROM SourceSnapshot WHERE guid=?').get(guid(id));if(!r)throw Error('Source snapshot missing');return JSON.parse(r.attributes);};
export function encyclopedia(db,r,ledger,check=()=>{}){
 check();
 if(r.op==='wiki-snapshot')return {snapshot:capture(db,r.snapshotId)};
 if(r.op==='wiki-context'){
  const s=capture(db,r.snapshotId);
  return {reviews:db.prepare('SELECT statementId,decision,claimGuid FROM SourceClaimReview WHERE snapshotGuid=? ORDER BY statementId LIMIT 51').all(s.snapshotId),existingClaims:db.prepare('SELECT c.guid,substr(c.expression,1,2000) AS expression,c.typename FROM Claim c JOIN ClaimParticipant p ON p.claimGuid=c.guid WHERE p.entityGuid=? ORDER BY c.guid LIMIT 101').all(s.entityId).map(c=>({...c,attributes:null}))};
 }
 if(r.op==='wiki-commit')return ledger.mutate(r,ctx=>{
  const s=r.snapshot;if(s?.version!==1||!['article','wikidata'].includes(s.kind)||!Number.isSafeInteger(s.revision)||s.revision<1||!Array.isArray(s.assets)||!s.assets.length||s.assets.length>2||s.assets.some(a=>!/^sha256:[a-f0-9]{64}$/.test(a.assetId)))throw Error('Invalid encyclopedia capture');
  if(s.qid!==undefined&&!/^Q[1-9]\d{0,14}$/.test(s.qid))throw Error('Invalid QID');
  const namespace=s.kind==='article'?'wikipedia':'wikidata',key=s.kind==='article'?`${s.site}:${s.pageId}`:s.qid;
  if(s.kind==='article'&&(!/^[a-z][a-z0-9-]{0,30}\.wikipedia\.org$/.test(s.site)||!Number.isSafeInteger(s.pageId)||s.pageId<1))throw Error('Invalid article identity');
  if(!key)throw Error('Missing resource identity');
  const establish=(ns,key,name,type)=>{
   const old=mapping(db,ns,key);if(old)return old;
   const id=randomUUID(),entityGuid=randomUUID(),resourceGuid=randomUUID();
   ctx.change('Entity',entityGuid,()=>db.prepare('INSERT INTO Entity(guid,typename,name,nameKey,attributes,createdUtc,modifiedUtc) VALUES(?,?,?,?,?,?,?)').run(entityGuid,type,name,name.normalize('NFKC').toLowerCase(),JSON.stringify({origin:'source-imported'}),ctx.now,ctx.now));
   ctx.change('ExternalIdentity',id,()=>db.prepare('INSERT INTO ExternalIdentity(guid,entityGuid,resourceGuid,namespace,externalKey,attributes) VALUES(?,?,?,?,?,?)').run(id,entityGuid,resourceGuid,ns,key,JSON.stringify({origin:'declared-provider-identity'})));
   return {guid:id,entityGuid,resourceGuid};
  };
  const identity=establish(namespace,key,s.kind==='article'?s.title:s.qid,s.kind==='article'?'WikipediaArticle':'KnowledgeObject');
  const prior=db.prepare('SELECT attributes FROM SourceSnapshot WHERE identityGuid=? AND captureKey=?').get(identity.guid,String(s.revision));if(prior)return {snapshot:JSON.parse(prior.attributes)};
  const subject=s.kind==='article'&&s.qid?establish('wikidata',s.qid,s.qid,'KnowledgeObject'):undefined;
  const snapshot={...s,identityId:identity.guid,entityId:identity.entityGuid,resourceId:identity.resourceGuid,...(subject?{subjectId:subject.entityGuid}:{} )};
  guid(s.snapshotId);ctx.change('SourceSnapshot',s.snapshotId,()=>db.prepare('INSERT INTO SourceSnapshot(guid,identityGuid,attributes,captureKey) VALUES(?,?,?,?)').run(s.snapshotId,identity.guid,JSON.stringify(snapshot),String(s.revision)));
  check();return {snapshot};
 },check);
 if(r.op==='wiki-review')return ledger.mutate(r,ctx=>{
  const s=capture(db,r.snapshotId),statement=r.statement;
  if(s.kind!=='wikidata'||!statement?.id?.toUpperCase().startsWith(s.qid+'$')||!['accepted','rejected'].includes(r.decision)||r.decision==='accepted'&&!statement.supported)throw Error('Invalid reviewed statement');
  const old=db.prepare('SELECT statementId,decision,claimGuid FROM SourceClaimReview WHERE snapshotGuid=? AND statementId=?').get(s.snapshotId,statement.id);
  if(old){if(old.decision!==r.decision)throw Error('Statement already reviewed differently; prior decision preserved');return old;}
  let claimGuid=null;
  if(r.decision==='accepted'){
   claimGuid=randomUUID();const attributes=encodeAuthoredValue({version:1,origin:'source-imported',reviewStatus:'accepted',sourceSnapshotId:s.snapshotId,sourceResourceId:s.resourceId,provider:'wikidata',qid:s.qid,revision:s.revision,statementId:statement.id,property:statement.property,rank:statement.rank,value:statement.value,qualifiers:statement.qualifiers,qualifierOrder:statement.qualifierOrder,references:statement.references});
   canonicalSemantics(db,{mutate:(_request,perform)=>perform(ctx)},{op:'create',recordType:'Claim',operationId:r.operationId,guid:claimGuid,expression:`${statement.label}: ${statement.summary}`,typename:'wikidata:'+statement.property,attributes,participants:[{guid:randomUUID(),entityGuid:s.entityId,role:'subject',ordinal:0}]},check);
  }
  const id=randomUUID();ctx.change('SourceClaimReview',id,()=>db.prepare('INSERT INTO SourceClaimReview(guid,snapshotGuid,statementId,decision,claimGuid,attributes) VALUES(?,?,?,?,?,?)').run(id,s.snapshotId,statement.id,r.decision,claimGuid,JSON.stringify({reviewedAt:ctx.now,origin:'explicit-user-review'})));
  return {statementId:statement.id,decision:r.decision,claimGuid};
 },check);
 throw Error('Unknown encyclopedia knowledge operation');
}
