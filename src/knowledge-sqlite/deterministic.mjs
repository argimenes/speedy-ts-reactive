import { randomUUID } from 'node:crypto';
import { guid } from './canonical-ledger.mjs';
/** Reached only from a verified retained job, following explicit user review. */
export function deterministicReview(db, r, ledger, check = () => {}) {
  if (r.op !== 'deterministic-review') throw Error('Unknown academic review');
  return ledger.mutate(
    r,
    (ctx) => {
      const s = r.snapshot;
      if (
        s?.version !== 1 ||
        s.kind !== 'deterministic' ||
        !['orcid', 'arxiv', 'pmid', 'pmcid', 'isbn'].includes(s.identity?.family) ||
        typeof s.identity.key !== 'string' ||
        s.identity.key.length > 100 ||
        !/^sha256:[a-f0-9]{64}$/.test(s.asset?.assetId) ||
        typeof r.note !== 'string' ||
        !r.note.trim() ||
        r.note.length > 4000
      )
        throw Error('Invalid academic review');
      guid(s.snapshotId);
      const namespace = s.identity.family,
        key = s.identity.key;
      let identity = db
        .prepare('SELECT * FROM ExternalIdentity WHERE namespace=? AND externalKey=?')
        .get(namespace, key);
      let target;
      if (r.targetId) {
        guid(r.targetId);
        target = db.prepare('SELECT guid,typename FROM Entity WHERE guid=?').get(r.targetId);
        if (!target) throw Error('Selected entity no longer exists');
        if (namespace === 'orcid' && target.typename !== 'Person')
          throw Error('ORCID requires a Person entity');
        if (identity && identity.entityGuid !== target.guid)
          throw Error(
            'External identity already belongs to a different entity; no merge performed'
          );
      } else if (identity) target = { guid: identity.entityGuid };
      else {
        if (typeof r.name !== 'string' || !r.name.trim() || r.name.length > 1000)
          throw Error('Supply the reviewed entity name');
        target = { guid: randomUUID() };
        ctx.change('Entity', target.guid, () =>
          db
            .prepare(
              'INSERT INTO Entity(guid,typename,name,nameKey,attributes,createdUtc,modifiedUtc) VALUES(?,?,?,?,?,?,?)'
            )
            .run(
              target.guid,
              namespace === 'orcid'
                ? 'Person'
                : namespace === 'isbn'
                  ? 'BookEdition'
                  : 'ScholarlyWork',
              r.name,
              r.name.normalize('NFKC').toLowerCase(),
              JSON.stringify({ origin: 'explicit-reviewed-import' }),
              ctx.now,
              ctx.now
            )
        );
      }
      if (!identity) {
        identity = { guid: randomUUID(), resourceGuid: randomUUID(), entityGuid: target.guid };
        ctx.change('ExternalIdentity', identity.guid, () =>
          db
            .prepare(
              'INSERT INTO ExternalIdentity(guid,entityGuid,resourceGuid,namespace,externalKey,attributes) VALUES(?,?,?,?,?,?)'
            )
            .run(
              identity.guid,
              target.guid,
              identity.resourceGuid,
              namespace,
              key,
              JSON.stringify({
                origin: 'explicit-user-review',
                note: r.note,
                sourceSnapshotId: s.snapshotId,
              })
            )
        );
      }
      const prior = db
        .prepare('SELECT identityGuid FROM SourceSnapshot WHERE guid=?')
        .get(s.snapshotId);
      if (prior && prior.identityGuid !== identity.guid) throw Error('Source identity conflict');
      if (!prior)
        ctx.change('SourceSnapshot', s.snapshotId, () =>
          db
            .prepare('INSERT INTO SourceSnapshot(guid,identityGuid,attributes) VALUES(?,?,?)')
            .run(
              s.snapshotId,
              identity.guid,
              JSON.stringify({
                ...s,
                entityId: target.guid,
                resourceId: identity.resourceGuid,
                review: { note: r.note, reviewedAt: ctx.now },
              })
            )
        );
      check();
      return { entityId: target.guid, identityId: identity.guid, snapshotId: s.snapshotId };
    },
    check
  );
}
