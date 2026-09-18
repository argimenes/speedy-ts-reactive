import { Router, json as jsonBody } from 'express';
import { createHash } from 'node:crypto';
import { createHistoryStore, type HistoryLocation, type HistoryCheckpoint } from './history-store.js';
import { createHistoryValidator } from './history-validator.js';
import type { PendingHistoryRecord, HistoryDurableAcknowledgement } from '../src/history/persistent-outbox.js';

const sha = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const ensure = (condition: unknown, message: string) => { if (!condition) throw Object.assign(new Error(message), { status: 409 }); };
type DocumentHandle = Awaited<ReturnType<ReturnType<typeof createHistoryStore>['open']>>;
type Writer = Awaited<ReturnType<DocumentHandle['acquireWriter']>>;
type Grant = { location: HistoryLocation; ownerId: string; writer: Writer; handle: DocumentHandle; touched: number; queue: Promise<unknown>; pending: number; closed: boolean };
export type HistorySaveProof = { location: HistoryLocation; epoch: string; segmentId: string; revisionId: string; sequence: number };

export function createHistoryService(options: { root: string; validatorWorkerUrl?: URL }) {
  const router = Router(), store = createHistoryStore(options), validator = createHistoryValidator({ workerUrl: options.validatorWorkerUrl }), grants = new Map<string, Grant>();
  router.use(jsonBody({ limit: '2mb' }));
  const key = (location: HistoryLocation) => JSON.stringify([location?.folder || '.', location?.filename]);
  const release = async (grant: Grant) => {
    grant.closed = true;
    if (grants.get(key(grant.location)) === grant) grants.delete(key(grant.location));
    await grant.queue.catch(() => {}); await grant.writer.close();
  };
  const timer = setInterval(() => { for (const grant of grants.values()) if (Date.now() - grant.touched > 15_000) void release(grant).catch(() => {}); }, 1000); timer.unref();
  const locate = async (location: HistoryLocation) => store.open(location);
  const granted = (body: any) => {
    const grant = grants.get(key(body.location));
    ensure(grant && !grant.closed && grant.writer.epoch === body.epoch && grant.location.resourceId === body.location?.resourceId &&
      (!body.location.memoirId || body.location.memoirId === grant.location.memoirId) && Date.now() - grant.touched <= 15_000, 'History writer lease expired or conflicts with this Document.');
    grant.touched = Date.now(); return grant;
  };
  const serial = <T>(grant: Grant, task: () => Promise<T>): Promise<T> => {
    ensure(!grant.closed && grant.pending < 64, 'History writer request queue is full or closed.'); grant.pending++;
    const result = grant.queue.then(task); grant.queue = result.then(() => undefined, () => undefined);
    return result.finally(() => { grant.pending--; grant.touched = Date.now(); });
  };
  const assemble = async (reader: DocumentHandle['reader'], descriptor: HistoryCheckpoint) => {
    ensure(descriptor && descriptor.byteLength > 0 && descriptor.byteLength <= 20 * 1024 * 1024 && descriptor.chunks.length <= 64, 'Checkpoint read bound exceeded.');
    const chunks: Buffer[] = []; let byteLength = 0;
    for (const chunk of descriptor.chunks) { const bytes = await reader.chunk(chunk.hash); ensure(bytes.length === chunk.byteLength, 'Checkpoint chunk length mismatch.'); byteLength += bytes.length; ensure(byteLength <= descriptor.byteLength, 'Checkpoint descriptor byte bound exceeded.'); chunks.push(bytes); }
    const bytes = Buffer.concat(chunks); ensure(bytes.length === descriptor.byteLength && sha(bytes) === descriptor.hash, 'Checkpoint checksum mismatch.'); return bytes.toString('utf8');
  };
  const publishCheckpoint = async (writer: Writer, wire: string): Promise<HistoryCheckpoint> => {
    const bytes = Buffer.from(wire), chunks: HistoryCheckpoint['chunks'] = []; ensure(bytes.length <= 20 * 1024 * 1024, 'Checkpoint byte bound exceeded.');
    for (let offset = 0; offset < bytes.length; offset += 1024 * 1024) { const chunk = bytes.subarray(offset, offset + 1024 * 1024), hash = sha(chunk); await writer.putChunk({ hash, dataBase64: chunk.toString('base64') }); chunks.push({ hash, byteLength: chunk.length }); }
    return { hash: sha(bytes), byteLength: bytes.length, chunks };
  };
  const readPath = async (reader: DocumentHandle['reader'], segmentId: string, sequence: number) => {
    const checkpoint = await reader.checkpoint(segmentId, sequence), distance = sequence - checkpoint.sequence;
    ensure(distance >= 0 && distance <= 12 && checkpoint.descriptor, 'History replay path exceeds its bound.');
    const page = distance ? await reader.records(segmentId, { afterSequence: checkpoint.sequence, limit: distance }) : { records: [] };
    ensure(page.records.length === distance, 'Incomplete history replay path.');
    return { checkpoint: checkpoint.descriptor as HistoryCheckpoint, checkpointSequence: checkpoint.sequence, records: page.records.map(record => record.record.wire as string) };
  };
  const describe = async (handle: DocumentHandle) => {
    const details = await handle.reader.describe(); if (!details.available) return { available: false, segments: [], receipt: null };
    const segments: any[] = []; let offset = 0;
    do { const page = await handle.reader.listSegments({ offset, limit: 25 }); for (const segment of page.segments) segments.push(await handle.reader.segment(segment.segmentId)); if (page.next === null) break; offset = page.next; } while (offset < 128);
    const artifact = await handle.reader.readDocument();
    return { ...details, segments, receipt: await handle.reader.receiptForArtifact(artifact.artifactHash) };
  };
  const ack = (packet: PendingHistoryRecord): HistoryDurableAcknowledgement => ({ enrollment: packet.enrollment, sequence: packet.sequence, recordId: packet.recordId, sha256: packet.sha256, verifiedThrough: packet.sequence });
  const actions: Record<string, (body: any) => Promise<any>> = {
    async open(body) {
      ensure(typeof body.ownerId === 'string' && body.ownerId.length > 0 && body.ownerId.length <= 256, 'A bounded history owner identity is required.');
      const handle = await locate(body.location), artifact = await handle.reader.readDocument(), document = artifact.document;
      ensure(document && (document.format === 'codex-history-document' ? document.resourceId : document.id) === body.location.resourceId, 'Saved Document resource identity does not match enrollment.');
      if (document.format === 'codex-history-document') {
        ensure(!body.location.memoirId || document.memoirId === body.location.memoirId, 'Saved Document memoir identity conflicts.');
        const bound = await handle.reader.describe();
        ensure(bound.available && bound.memoirId === document.memoirId, 'Saved Document history is missing or relocated; explicit admission is required.');
        await validator.validatePortable(document);
      }
      if (!body.writable) return describe(handle);
      let grant = grants.get(key(body.location));
      if (grant && Date.now() - grant.touched > 15_000) { await release(grant); grant = undefined; }
      if (grant) { ensure(grant.ownerId === body.ownerId && grant.location.resourceId === body.location.resourceId && (!body.location.memoirId || body.location.memoirId === grant.location.memoirId), 'Another editor owns this Document history writer.'); grant.touched = Date.now(); }
      else {
        const writer = await handle.acquireWriter(); const details = await handle.reader.describe();
        grant = { location: { ...body.location, memoirId: details.memoirId }, ownerId: body.ownerId, writer, handle, touched: Date.now(), queue: Promise.resolve(), pending: 0, closed: false }; grants.set(key(body.location), grant);
      }
      return { ...(await describe(grant.handle)), epoch: grant.writer.epoch };
    },
    async describe(body) { return describe(await locate(body.location)); },
    async heartbeat(body) { granted(body); return {}; },
    async release(body) { await release(granted(body)); return {}; },
    async chunkPut(body) { const grant = granted(body); return serial(grant, () => grant.writer.putChunk({ hash: body.hash, dataBase64: body.dataBase64 })); },
    async begin(body) { const grant = granted(body); return serial(grant, async () => {
      const enrollment = body.metadata?.enrollment;
      ensure(enrollment && enrollment.resourceId === grant.location.resourceId && enrollment.memoirId === grant.location.memoirId && enrollment.segmentId === body.segmentId &&
        typeof enrollment.enrollmentId === 'string' && enrollment.enrollmentId.length > 0 && typeof enrollment.writerEpoch === 'string' && enrollment.writerEpoch.length > 0, 'Invalid immutable history enrollment.');
      ensure(Number.isSafeInteger(body.metadata.sourceRevision) && body.metadata.sourceRevision >= 0, 'Invalid enrollment source revision.');
      await validator.validateBaseline(await assemble(grant.handle.reader, body.baseline), grant.location.resourceId);
      const segment = { segmentId: body.segmentId, revisionId: body.revisionId, baseline: body.baseline, metadata: body.metadata, ...(body.originReceipt ? { originReceipt: body.originReceipt } : {}) };
      return grant.writer.beginSegment(segment);
    }); },
    async append(body) { const grant = granted(body); return serial(grant, async () => {
      const packet = body.packet as PendingHistoryRecord;
      ensure(packet && typeof packet.wire === 'string' && Buffer.byteLength(packet.wire) <= 128 * 1024 && sha(packet.wire) === packet.sha256, 'History packet checksum or byte bound mismatch.');
      const segment = await grant.handle.reader.segment(packet.enrollment?.segmentId);
      const enrollmentKeys = ['resourceId', 'memoirId', 'segmentId', 'enrollmentId', 'writerEpoch'];
      ensure(enrollmentKeys.every(key => segment.metadata.enrollment?.[key] === (packet.enrollment as any)?.[key]), 'History packet enrollment mismatch.');
      if (packet.sequence <= segment.headSequence) {
        const saved = (await grant.handle.reader.records(segment.segmentId, { afterSequence: packet.sequence - 1, limit: 1 })).records[0]?.record;
        ensure(saved && saved.recordId === packet.recordId && saved.wire === packet.wire && sha(saved.wire) === packet.sha256, 'Conflicting durable packet retry.'); return ack(packet);
      }
      ensure(packet.sequence === segment.headSequence + 1, 'History packet sequence gap.');
      const path = await readPath(grant.handle.reader, segment.segmentId, segment.headSequence);
      const last = segment.headSequence ? (await grant.handle.reader.records(segment.segmentId, { afterSequence: segment.headSequence - 1, limit: 1 })).records[0]?.record : undefined;
      const expectedSourceRevision = last ? last.metadata.sourceRevision : segment.metadata.sourceRevision;
      ensure(Number.isSafeInteger(expectedSourceRevision) && expectedSourceRevision >= 0, 'Verified source-counter evidence is missing.');
      const validated = await validator.validateAppend({ checkpointWire: await assemble(grant.handle.reader, path.checkpoint), records: path.records, wire: packet.wire,
        resourceId: grant.location.resourceId, expectedSourceRevision });
      ensure(validated.revisionId === packet.recordId, 'History commit identity mismatch.');
      const checkpoint = validated.checkpointWire ? await publishCheckpoint(grant.writer, validated.checkpointWire) : undefined;
      await grant.writer.append({ segmentId: segment.segmentId, sequence: packet.sequence, recordId: packet.recordId, revisionId: packet.recordId, stateParent: segment.headRevisionId,
        wire: packet.wire, metadata: validated.metadata, ...(checkpoint ? { checkpoint } : {}) });
      return ack(packet);
    }); },
    async timeline(body) {
      const handle = await locate(body.location), segment = await handle.reader.segment(body.segmentId), page = await handle.reader.records(body.segmentId, { afterSequence: body.afterSequence ?? 0, limit: body.limit ?? 25 });
      return { ...page, headRevisionId: segment.headRevisionId, records: page.records.map(({ record, previous, hash }) => ({ previous, hash, record: { sequence: record.sequence, revisionId: record.revisionId, metadata: record.metadata } })) };
    },
    async path(body) { return readPath((await locate(body.location)).reader, body.segmentId, body.sequence); },
    async chunk(body) { const bytes = await (await locate(body.location)).reader.chunk(body.hash); return { dataBase64: bytes.toString('base64') }; },
  };
  for (const [name, action] of Object.entries(actions)) router.post(`/${name}`, async (req, res) => {
    try { res.json({ Success: true, Data: await action(req.body) }); }
    catch (error: any) { res.status(error.status ?? (error.code === 'ENOENT' ? 404 : 409)).json({ Success: false, Error: error.message ?? 'History request failed.' }); }
  });
  return {
    router,
    validatePortable: (document: unknown) => validator.validatePortable(document),
    async saveDocument(location: { folder: string; filename: string }, proof: HistorySaveProof, document: any, publish: () => Promise<void>) {
      ensure(proof && key(location as HistoryLocation) === key(proof.location), 'Save proof belongs to a different Document path.'); const grant = granted(proof);
      return serial(grant, async () => {
        const segment = await grant.handle.reader.segment(proof.segmentId), path = await readPath(grant.handle.reader, proof.segmentId, proof.sequence);
        const revisionId = proof.sequence === 0 ? segment.revisionId : (await grant.handle.reader.records(proof.segmentId, { afterSequence: proof.sequence - 1, limit: 1 })).records[0]?.record.revisionId;
        ensure(revisionId === proof.revisionId, 'Save proof revision is not durably acknowledged.');
        await validator.validateArtifact({ checkpointWire: await assemble(grant.handle.reader, path.checkpoint), records: path.records, document,
          memoirId: grant.location.memoirId!, segmentId: proof.segmentId, revisionId: proof.revisionId });
        await publish();
        // Publication has already succeeded. Receipt failure must not turn an
        // ordinary Document Save into a reported failure; absence of an origin
        // receipt remains explicit and never asserts history association.
        try {
          return await grant.writer.saveReceipt({ segmentId: proof.segmentId, revisionId: proof.revisionId, sequence: proof.sequence, artifactHash: sha(JSON.stringify(document)) });
        } catch (error) {
          return { warning: `Document saved, but its history association could not be finalized: ${error instanceof Error ? error.message : String(error)}` };
        }
      });
    },
    async dispose() { clearInterval(timer); await Promise.all([...grants.values()].map(release)); await validator.dispose(); },
  };
}
