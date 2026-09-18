/** Directory-local bounded history slice. Immutable publications are the commit point;
 * staged/orphan files remain evidence. Readers never acquire a writer capability. */
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const filesystem = () => import(pathToFileURL(path.resolve('scripts/stage-c-gates/filesystem.mjs')).href);
const LIMIT = { chunk: 1024 * 1024, checkpoint: 20 * 1024 * 1024, record: 128 * 1024, metadata: 8192, segments: 128, records: 4096, page: 25 };
const ZERO = '0'.repeat(64);
const digest = (data: Buffer | string) => createHash('sha256').update(data).digest('hex');
const json = (value: unknown) => Buffer.from(JSON.stringify(value));
const fail = (message: string): never => { throw Object.assign(new Error(message), { status: 409 }); };
const check = (condition: unknown, message: string) => { if (!condition) fail(message); };
const missing = (error: any) => error?.code === 'ENOENT';
const id = (value: unknown) => { check(typeof value === 'string' && /^[A-Za-z0-9_:-]{1,128}$/.test(value), 'Invalid history identity.'); return value as string; };
const hash = (value: unknown) => { check(typeof value === 'string' && /^[a-f0-9]{64}$/.test(value), 'Invalid history checksum.'); return value as string; };
const integer = (value: unknown, max: number) => { check(Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= max, 'History bound exceeded.'); return Number(value); };
const metadata = (value: unknown) => { check(value && typeof value === 'object' && !Array.isArray(value) && json(value).length <= LIMIT.metadata, 'Invalid history metadata.'); return value; };
export type HistoryCheckpoint = { hash: string; byteLength: number; chunks: { hash: string; byteLength: number }[] };
export type HistorySegment = { segmentId: string; revisionId: string; baseline: HistoryCheckpoint; originReceipt?: string; metadata: any };
export type HistoryRecord = { segmentId: string; sequence: number; recordId: string; revisionId: string; stateParent: string; wire: any; metadata: any; checkpoint?: HistoryCheckpoint };
export type HistoryLocation = { folder: string; filename: string; resourceId: string; memoirId?: string };

export function createHistoryStore(options: { root: string }) {
  async function open(location: HistoryLocation) {
    check(typeof location.resourceId === 'string' && Buffer.byteLength(location.resourceId) <= 512 && location.resourceId.length > 0, 'Invalid history resource identity.');
    check(typeof location.folder === 'string' && !path.isAbsolute(location.folder) && !/[\\\0]/.test(location.folder), 'Invalid history folder.');
    const parts = location.folder === '.' || location.folder === '' ? [] : location.folder.split('/');
    check(parts.every(p => p && p !== '.' && p !== '..'), 'Invalid history folder.');
    check(typeof location.filename === 'string' && !/[\\/\0]/.test(location.filename) && !location.filename.startsWith('.') && /\.json$/i.test(location.filename), 'Invalid history filename.');
    const fs = await filesystem();
    let directory = await fs.pinDirectory(path.resolve(options.root));
    for (const component of parts) {
      const stat = await fs.atDirectory(directory, { kind: 'stat', name: component });
      check(stat.directory, 'History folder is not a directory.');
      directory = { path: path.join(directory.path, component), identity: stat.identity };
    }
    const document = await fs.atDirectory(directory, { kind: 'stat', name: location.filename });
    check(document.file, 'History requires a saved Document.');
    const memoirName = `document-${digest(location.filename).slice(0, 32)}`;
    const expectedBinding = { version: 1, resourceId: location.resourceId, filename: location.filename, directoryIdentity: directory.identity };
    let memoir: any, memory: any;
    const loadMemory = async () => {
      const info = await fs.atDirectory(directory, { kind: 'stat', name: '.memory' });
      check(info.directory, 'History memory path is not a directory.');
      if (memory) check(JSON.stringify(memory.identity) === JSON.stringify(info.identity), 'History memory directory identity changed.');
      memory = { path: path.join(directory.path, '.memory'), identity: info.identity }; return memory;
    };
    const loadMemoir = async () => {
      const info = await fs.atDirectory(await loadMemory(), { kind: 'stat', name: memoirName });
      check(info.directory, 'History memoir is not a directory.');
      if (memoir) check(JSON.stringify(memoir.identity) === JSON.stringify(info.identity), 'History directory identity changed.');
      memoir = { path: path.join(memory.path, memoirName), identity: info.identity };
      return memoir;
    };
    const readBytes = async (name: string, maxBytes: number) => (await fs.atDirectory(await loadMemoir(), { kind: 'read', name, maxBytes })).data as Buffer;
    const readJson = async (name: string, maxBytes = LIMIT.record) => JSON.parse((await readBytes(name, maxBytes)).toString());
    const verifyBinding = async () => {
      const binding = await readJson('binding.json');
      check(Object.entries(expectedBinding).every(([key, value]) => JSON.stringify(binding[key]) === JSON.stringify(value)) &&
        JSON.stringify(binding.memoirDirectoryIdentity) === JSON.stringify(memoir.identity) &&
        (!location.memoirId || location.memoirId === binding.memoirId), 'History location or identity conflict; copied/relocated Documents require explicit admission.');
      id(binding.memoirId);
      return binding;
    };
    const has = async (name: string) => {
      try { await fs.atDirectory(await loadMemoir(), { kind: 'stat', name }); return true; }
      catch (e) { if (missing(e)) return false; throw e; }
    };
    const lastIndex = async (prefix: string, max: number) => {
      let lo = 0, hi = max;
      while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (await has(`${prefix}${mid}.json`)) lo = mid; else hi = mid - 1; }
      return lo;
    };
    const segmentData = async (segmentId: string): Promise<HistorySegment> => readJson(`segment-${id(segmentId)}.json`);
    const envelopeAt = async (segmentId: string, sequence: number) => {
      const result = await readJson(`record-${id(segmentId)}-${integer(sequence, LIMIT.records)}.json`, LIMIT.record + 1024);
      check(result.hash === digest(json({ previous: result.previous, record: result.record })), 'History record checksum mismatch.');
      check(result.record.segmentId === segmentId && result.record.sequence === sequence, 'History record identity mismatch.');
      return result;
    };
    const head = (segmentId: string) => lastIndex(`record-${id(segmentId)}-`, LIMIT.records);
    const reader = Object.freeze({
      async describe() {
        try { await verifyBinding(); }
        catch (e) { if (missing(e) && !location.memoirId) return { available: false, limits: LIMIT }; throw e; }
        const binding = await verifyBinding();
        return { available: true, binding, memoirId: binding.memoirId as string, segmentCount: await lastIndex('segment-index-', LIMIT.segments), limits: LIMIT };
      },
      async listSegments({ offset = 0, limit = LIMIT.page } = {}) {
        integer(offset, LIMIT.segments); integer(limit, LIMIT.page); check(limit > 0, 'Empty history page.'); await verifyBinding();
        const count = await lastIndex('segment-index-', LIMIT.segments), segments: HistorySegment[] = [];
        for (let index = offset + 1; index <= Math.min(count, offset + limit); index++) segments.push(await segmentData((await readJson(`segment-index-${index}.json`)).segmentId));
        return { segments, next: offset + segments.length < count ? offset + segments.length : null };
      },
      async segment(segmentId: string) {
        await verifyBinding(); const segment = await segmentData(segmentId), sequence = await head(segmentId);
        return { ...segment, headSequence: sequence, headRevisionId: sequence ? (await envelopeAt(segmentId, sequence)).record.revisionId : segment.revisionId };
      },
      async records(segmentId: string, { afterSequence = 0, limit = LIMIT.page } = {}) {
        integer(afterSequence, LIMIT.records); integer(limit, LIMIT.page); check(limit > 0, 'Empty history page.'); await verifyBinding(); await segmentData(segmentId);
        const count = await head(segmentId), records: any[] = [];
        let previous = afterSequence ? (await envelopeAt(segmentId, afterSequence)).hash : ZERO;
        for (let seq = afterSequence + 1; seq <= Math.min(count, afterSequence + limit); seq++) {
          const envelope = await envelopeAt(segmentId, seq); check(envelope.previous === previous, 'History chain mismatch.'); previous = envelope.hash; records.push(envelope);
        }
        return { records, headSequence: count, next: afterSequence + records.length < count ? afterSequence + records.length : null };
      },
      async checkpoint(segmentId: string, sequence: number) {
        integer(sequence, LIMIT.records); await verifyBinding(); const segment = await segmentData(segmentId);
        check(sequence <= await head(segmentId), 'Historical revision is unavailable.');
        const checkpointSequence = Math.floor(sequence / 12) * 12;
        return { sequence: checkpointSequence, revisionId: checkpointSequence ? (await envelopeAt(segmentId, checkpointSequence)).record.revisionId : segment.revisionId,
          descriptor: checkpointSequence ? (await envelopeAt(segmentId, checkpointSequence)).record.checkpoint : segment.baseline };
      },
      async chunk(checksum: string) { await verifyBinding(); const bytes = await readBytes(`chunk-${hash(checksum)}`, LIMIT.chunk); check(digest(bytes) === checksum, 'History chunk checksum mismatch.'); return bytes; },
      async receiptForArtifact(artifactHash: string) { await verifyBinding(); try { const ref = await readJson(`artifact-${hash(artifactHash)}.json`); return { ...(await reader.receipt(ref.hash)), hash: ref.hash }; } catch (e) { if (missing(e)) return null; throw e; } },
      async readDocument(maxBytes = 20 * 1024 * 1024) { const bytes = (await fs.atDirectory(directory, { kind: 'read', name: location.filename, maxBytes })).data as Buffer; return { document: JSON.parse(bytes.toString()), artifactHash: digest(bytes) }; },
      async receipt(checksum: string) { await verifyBinding(); const bytes = await readBytes(`receipt-${hash(checksum)}.json`, LIMIT.metadata); check(digest(bytes) === checksum, 'History receipt checksum mismatch.'); return JSON.parse(bytes.toString()); },
    });
    async function acquireWriter() {
      try { await loadMemory(); } catch (e) { if (!missing(e)) throw e; try { memory = await fs.createDirectory(directory, '.memory'); } catch (other: any) { if (other.code !== 'EEXIST') throw other; await loadMemory(); } }
      try { await loadMemoir(); } catch (e) { if (!missing(e)) throw e; try { memoir = await fs.createDirectory(memory, memoirName); } catch (other: any) { if (other.code !== 'EEXIST') throw other; await loadMemoir(); } }
      try { await fs.atDirectory(memoir, { kind: 'create', name: 'writer.lock', data: Buffer.alloc(0), maxBytes: 0 }); } catch (e: any) { if (e.code !== 'EEXIST') throw e; }
      const lockInfo = await fs.atDirectory(memoir, { kind: 'stat', name: 'writer.lock' });
      const lock = await fs.lockFile(memoir, 'writer.lock', lockInfo.identity), epoch = randomUUID();
      let closed = false, queue = Promise.resolve();
      const serial = <T>(operation: () => Promise<T>): Promise<T> => {
        if (closed) return Promise.reject(new Error('History writer is closed.'));
        const result = queue.then(operation); queue = result.then(() => undefined, () => undefined); return result;
      };
      const publish = async (name: string, data: Buffer, maxBytes: number) => {
        check(data.length <= maxBytes, 'History publication exceeds its byte bound.');
        const stage = `staged-${randomUUID()}`, staged = await fs.atDirectory(memoir, { kind: 'create', name: stage, data, maxBytes }, lock.fd);
        try { await fs.atDirectory(memoir, { kind: 'publish', source: stage, name, expectedIdentity: staged.identity }, lock.fd); }
        catch (e: any) { if (e.code !== 'EEXIST' || !(await readBytes(name, maxBytes)).equals(data)) throw e; }
      };
      const verifyCheckpoint = async (descriptor: HistoryCheckpoint) => {
        hash(descriptor?.hash); integer(descriptor.byteLength, LIMIT.checkpoint); check(descriptor.byteLength > 0 && Array.isArray(descriptor.chunks) && descriptor.chunks.length > 0 && descriptor.chunks.length <= 64, 'Invalid checkpoint descriptor.');
        const checksum = createHash('sha256'); let bytes = 0;
        for (const chunk of descriptor.chunks) { hash(chunk.hash); integer(chunk.byteLength, LIMIT.chunk); check(chunk.byteLength > 0, 'Empty checkpoint chunk.'); const content = await readBytes(`chunk-${chunk.hash}`, LIMIT.chunk); check(content.length === chunk.byteLength && digest(content) === chunk.hash, 'Checkpoint prerequisite mismatch.'); bytes += content.length; checksum.update(content); }
        check(bytes === descriptor.byteLength && checksum.digest('hex') === descriptor.hash, 'Checkpoint checksum mismatch.');
      };
      try {
        if (!(await has('binding.json'))) {
          check(!location.memoirId, 'The referenced history memoir is missing.');
          await publish('binding.json', json({ ...expectedBinding, memoirId: randomUUID(), memoirDirectoryIdentity: memoir.identity }), LIMIT.metadata);
        }
        await verifyBinding();
      }
      catch (e) { await lock.close(); throw e; }
      return Object.freeze({
        epoch,
        putChunk({ hash: checksum, dataBase64 }: { hash: string; dataBase64: string }) { return serial(async () => {
          hash(checksum); check(typeof dataBase64 === 'string' && dataBase64.length <= Math.ceil(LIMIT.chunk / 3) * 4, 'History chunk byte bound.');
          const bytes = Buffer.from(dataBase64, 'base64'); check(bytes.length > 0 && bytes.length <= LIMIT.chunk && bytes.toString('base64') === dataBase64 && digest(bytes) === checksum, 'History chunk checksum mismatch.');
          await publish(`chunk-${checksum}`, bytes, LIMIT.chunk); return { hash: checksum, byteLength: bytes.length };
        }); },
        beginSegment(segment: HistorySegment) { return serial(async () => {
          id(segment.segmentId); id(segment.revisionId); metadata(segment.metadata); await verifyCheckpoint(segment.baseline);
          if (segment.originReceipt) await reader.receipt(segment.originReceipt);
          const count = await lastIndex('segment-index-', LIMIT.segments);
          for (let i = 1; i <= count; i++) if ((await readJson(`segment-index-${i}.json`)).segmentId === segment.segmentId) {
            check(JSON.stringify(await segmentData(segment.segmentId)) === JSON.stringify(segment), 'Conflicting segment retry.'); return { segmentId: segment.segmentId, epoch };
          }
          check(count < LIMIT.segments, 'History segment admission limit reached.');
          await publish(`segment-${segment.segmentId}.json`, json(segment), LIMIT.metadata);
          await publish(`segment-index-${count + 1}.json`, json({ segmentId: segment.segmentId }), LIMIT.metadata);
          return { segmentId: segment.segmentId, epoch };
        }); },
        append(record: HistoryRecord) { return serial(async () => {
          id(record.segmentId); id(record.recordId); id(record.revisionId); id(record.stateParent);
          check(typeof record.wire === 'string' && record.wire.length > 0, 'History transition wire must be an immutable encoded string.');
          integer(record.sequence, LIMIT.records); check(record.sequence > 0 && json(record).length <= LIMIT.record, 'History record byte bound.'); metadata(record.metadata);
          const segment = await segmentData(record.segmentId), sequence = await head(record.segmentId);
          if (record.sequence <= sequence) { const existing = await envelopeAt(record.segmentId, record.sequence); check(JSON.stringify(existing.record) === JSON.stringify(record), 'Conflicting record retry.'); return { sequence: record.sequence, recordId: record.recordId, hash: existing.hash, epoch }; }
          check(record.sequence === sequence + 1, 'History sequence gap.'); const previous = sequence ? await envelopeAt(record.segmentId, sequence) : null;
          check(record.stateParent === (previous?.record.revisionId ?? segment.revisionId), 'History state parent mismatch.');
          check(record.sequence % 12 !== 0 || record.checkpoint, 'Required checkpoint is absent.'); if (record.checkpoint) await verifyCheckpoint(record.checkpoint);
          // Identity reservation precedes the commit publication. An interrupted reservation
          // remains evidence and only an exact retry can complete that sequence.
          await publish(`identity-${record.segmentId}-${digest(record.recordId)}.json`, json({ sequence: record.sequence, revisionId: record.revisionId, recordHash: digest(json(record)) }), LIMIT.metadata);
          await publish(`revision-${record.segmentId}-${digest(record.revisionId)}.json`, json({ sequence: record.sequence, recordId: record.recordId }), LIMIT.metadata);
          const payload = { previous: previous?.hash ?? ZERO, record }, envelope = { ...payload, hash: digest(json(payload)) };
          await publish(`record-${record.segmentId}-${record.sequence}.json`, json(envelope), LIMIT.record + 1024);
          return { sequence: record.sequence, recordId: record.recordId, hash: envelope.hash, epoch };
        }); },
        saveReceipt({ segmentId, revisionId, sequence, artifactHash }: { segmentId: string; revisionId: string; sequence?: number; artifactHash: string }) { return serial(async () => {
          hash(artifactHash); const segment = await reader.segment(segmentId);
          const savedSequence = sequence === undefined ? segment.headSequence : integer(sequence, LIMIT.records);
          check(savedSequence <= segment.headSequence && revisionId === (savedSequence ? (await envelopeAt(segmentId, savedSequence)).record.revisionId : segment.revisionId), 'Save receipt must name an acknowledged revision.');
          const stat = await fs.atDirectory(directory, { kind: 'stat', name: location.filename }); check(stat.file, 'Saved Document is unavailable.');
          const checksum = createHash('sha256');
          for (let offset = 0; offset < stat.size; offset += LIMIT.chunk) checksum.update((await fs.atDirectory(directory, { kind: 'read', name: location.filename, expectedIdentity: stat.identity, maxBytes: LIMIT.chunk, offset, length: Math.min(LIMIT.chunk, stat.size - offset) })).data);
          check(checksum.digest('hex') === artifactHash, 'Saved Document artifact changed.');
          const receipt = { version: 1, resourceId: location.resourceId, filename: location.filename, artifactHash, segmentId, revisionId, sequence: savedSequence }, bytes = json(receipt), receiptHash = digest(bytes);
          await publish(`receipt-${receiptHash}.json`, bytes, LIMIT.metadata);
          await publish(`artifact-${artifactHash}.json`, json({ hash: receiptHash }), LIMIT.metadata); return { ...receipt, hash: receiptHash };
        }); },
        async close() { closed = true; await queue; await lock.close(); },
      });
    }
    return Object.freeze({ reader, acquireWriter });
  }
  return Object.freeze({ open });
}
