/** Finite G2 storage/lifecycle candidate. Never imported by production routes.
 * Bounds are gate workload bounds, not the Stage C release capacity table. */
import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { pinDirectory, atDirectory, createDirectory, lockFile } from './filesystem.mjs';

export const hash = data => createHash('sha256').update(data).digest('hex');
const json = value => Buffer.from(JSON.stringify(value));
const genesis = '0'.repeat(64);
const maxJournal = 32 * 1024 * 1024, maxBlob = 32 * 1024 * 1024, maxPacket = 256 * 1024;
const missing = error => error.code === 'ENOENT';
const read = (directory, name, maxBytes = maxJournal) => atDirectory(directory, { kind: 'read', name, maxBytes });
const create = (directory, name, data, lockFd) => atDirectory(directory, { kind: 'create', name, data, maxBytes: maxPacket }, lockFd);
async function publishSmall(directory, name, data, lockFd) {
  const stage = `staging-${randomUUID()}`;
  const staged = await create(directory, stage, data, lockFd);
  try { await atDirectory(directory, { kind: 'publish', source: stage, name, expectedIdentity: staged.identity }, lockFd); }
  catch (error) {
    if (error.code !== 'EEXIST' || !(await read(directory, name, maxPacket)).data.equals(data)) throw error;
  }
}
async function verifiedBlob(directory, descriptor, materialize = false) {
  const info = await atDirectory(directory, { kind: 'stat', name: descriptor.hash });
  if (!info.file || info.size !== descriptor.bytes || info.size > maxBlob) throw new Error('checkpoint size mismatch');
  const checksum = createHash('sha256'), output = materialize ? Buffer.alloc(info.size) : undefined;
  for (let offset = 0; offset < info.size; offset += maxPacket) {
    const result = await atDirectory(directory, { kind: 'read', name: descriptor.hash, expectedIdentity: info.identity,
      maxBytes: maxPacket, offset, length: Math.min(maxPacket, info.size - offset) });
    checksum.update(result.data); if (output) result.data.copy(output, offset);
  }
  if (checksum.digest('hex') !== descriptor.hash) throw new Error('checkpoint integrity failure');
  return output;
}
async function publishBlob(directory, bytes, lockFd, failAfterChunks) {
  if (bytes.length > maxBlob) throw new Error('gate blob capacity');
  const name = hash(bytes), stage = `${name}.stage-${randomUUID()}`;
  let result = await create(directory, stage, Buffer.alloc(0), lockFd);
  for (let offset = 0, chunks = 0; offset < bytes.length; offset += maxPacket) {
    result = await atDirectory(directory, { kind: 'append', name: stage, data: bytes.subarray(offset, offset + maxPacket), maxBytes: maxPacket,
      expectedSize: offset, expectedIdentity: result.identity }, lockFd);
    if (++chunks === failAfterChunks) throw new Error('injected blob crash');
  }
  try { await atDirectory(directory, { kind: 'publish', source: stage, name, expectedIdentity: result.identity }, lockFd); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  const descriptor = { hash: name, bytes: bytes.length };
  await verifiedBlob(directory, descriptor);
  return descriptor;
}
const envelope = (sequence, previous, body) => {
  const payload = JSON.stringify(body), checksum = hash(json([sequence, previous, payload]));
  return { sequence, previous, payload, checksum };
};
export function scanFrames(bytes) {
  const frames = []; let position = 0, previous = genesis;
  while (position < bytes.length) {
    const end = bytes.indexOf(10, position);
    if (end < 0) return { frames, incompleteTail: true };
    const frame = JSON.parse(bytes.subarray(position, end).toString('utf8'));
    const expected = envelope(frames.length + 1, previous, JSON.parse(frame.payload));
    if (bytes.subarray(position, end).toString('utf8') !== JSON.stringify(expected)) throw new Error('journal integrity failure');
    frames.push(frame); previous = frame.checksum; position = end + 1;
  }
  return { frames, incompleteTail: false };
}

/** A durable administrative intent authorizes completion of exactly these
 * bytes. A merely matching torn prefix never authorizes guessing a record. */
async function appendIntent(directory, name, body, lockFd, failAt, prefix) {
  let journal = await read(directory, 'journal.jsonl'), intent;
  try { intent = JSON.parse((await read(directory, name, maxPacket)).data); }
  catch (error) {
    if (!missing(error)) throw error;
    const parsed = scanFrames(journal.data);
    if (parsed.incompleteTail) throw new Error('no durable intent for incomplete tail');
    const data = JSON.stringify(envelope(parsed.frames.length + 1, parsed.frames.at(-1)?.checksum ?? genesis, body)) + '\n';
    intent = { format: 'codex-handoff-intent-gate', version: 1, offset: journal.size, previousHash: hash(journal.data), data };
    await publishSmall(directory, name, json(intent), lockFd);
  }
  if (intent.format !== 'codex-handoff-intent-gate' || intent.version !== 1 || !Number.isSafeInteger(intent.offset) || intent.offset < 0 || intent.offset > journal.size || typeof intent.data !== 'string') throw new Error('invalid durable intent');
  const prior = journal.data.subarray(0, intent.offset), parsed = scanFrames(prior);
  const expected = JSON.stringify(envelope(parsed.frames.length + 1, parsed.frames.at(-1)?.checksum ?? genesis, body)) + '\n';
  if (parsed.incompleteTail || hash(prior) !== intent.previousHash || expected !== intent.data) throw new Error('conflicting durable intent');
  if (failAt === `${prefix}-intent`) throw new Error(`injected handoff ${prefix}-intent`);
  const bytes = Buffer.from(intent.data), tail = journal.data.subarray(intent.offset);
  if (!tail.subarray(0, bytes.length).equals(bytes.subarray(0, Math.min(bytes.length, tail.length)))) throw new Error('intent preimage mismatch');
  if (tail.length < bytes.length) {
    const remainder = bytes.subarray(tail.length), data = failAt === `${prefix}-torn` ? remainder.subarray(0, Math.max(1, Math.floor(remainder.length / 2))) : remainder;
    await atDirectory(directory, { kind: 'append', name: 'journal.jsonl', data, maxBytes: maxPacket,
      expectedSize: journal.size, expectedIdentity: journal.identity }, lockFd);
    if (failAt === `${prefix}-torn`) throw new Error(`injected handoff ${prefix}-torn`);
  }
}

async function pendingHandoff(directory, frames, storeId) {
  const page = await atDirectory(directory, { kind: 'list', offset: 0, limit: 100 });
  if (page.next !== undefined) throw new Error('gate administration scan capacity');
  for (const entry of page.entries) {
    if (!/^handoff-source-[a-f0-9]{64}\.json$/.test(entry.name) || entry.symlink) continue;
    const intent = JSON.parse((await read(directory, entry.name, maxPacket)).data), planned = JSON.parse(intent.data), body = JSON.parse(planned.payload);
    const reactivated = frames.some(f => f.sequence > planned.sequence && JSON.parse(f.payload).kind === 'handoff-activated' && JSON.parse(f.payload).destinationStoreId === storeId);
    if (!reactivated && body.sourceStoreId === storeId && frames.length < planned.sequence) return true;
  }
  return false;
}

async function existingDirectory(parent, name) {
  const result = await atDirectory(parent, { kind: 'stat', name });
  if (!result.directory) throw new Error('directory collision');
  return { path: join(parent.path, name), identity: result.identity };
}

export async function openStore(parentPath, initialize = false) {
  const parent = await pinDirectory(parentPath); let directory;
  try { directory = await existingDirectory(parent, '.memory'); }
  catch (error) {
    if (!missing(error) || !initialize) throw error;
    directory = await createDirectory(parent, '.memory');
    // A crash between mkdir and marker is an unrecognized store, not auto-adopted.
    await create(directory, 'store.json', json({ format: 'codex-memory-gate', version: 1, storeId: randomUUID() }));
    await createDirectory(directory, 'resources');
  }
  let marker;
  try { marker = JSON.parse((await read(directory, 'store.json', maxPacket)).data); }
  catch (error) { throw new Error(`unrecognized .memory: ${error.message}`); }
  if (marker.format !== 'codex-memory-gate' || marker.version !== 1 || typeof marker.storeId !== 'string') throw new Error('unrecognized .memory version');
  const resources = await existingDirectory(directory, 'resources');
  return { parent, directory, resources, storeId: marker.storeId };
}

export async function admitMemoir(store, identity, documentName, handoff) {
  if (!identity.resourceId || !identity.memoirId || !identity.enrollmentId) throw new Error('missing semantic identity');
  let resource;
  try { resource = await createDirectory(store.resources, hash(identity.resourceId)); }
  catch (error) { if (error.code !== 'EEXIST') throw error; resource = await existingDirectory(store.resources, hash(identity.resourceId)); }
  const directory = await createDirectory(resource, hash(identity.memoirId));
  const artifact = await read(store.parent, documentName, maxBlob);
  const lock = await create(directory, 'owner.lock', Buffer.alloc(0));
  const manifest = { format: 'codex-memoir-gate', version: 1, ...identity, storeId: store.storeId,
    directoryIdentity: directory.identity, storeDirectoryIdentity: store.directory.identity, lockIdentity: lock.identity,
    document: { name: documentName, identity: artifact.identity, hash: hash(artifact.data) }, ...(handoff ? { handoff } : {}) };
  await create(directory, 'manifest.json', json(manifest));
  await create(directory, 'journal.jsonl', Buffer.alloc(0));
  await createDirectory(directory, 'checkpoints');
  await createDirectory(directory, 'segments');
  return { directory, manifest, store };
}

export async function readMemoir(store, resourceId, memoirId) {
  const resource = await existingDirectory(store.resources, hash(resourceId));
  const directory = await existingDirectory(resource, hash(memoirId));
  const manifest = JSON.parse((await read(directory, 'manifest.json', maxPacket)).data);
  if (manifest.format !== 'codex-memoir-gate' || manifest.version !== 1 || manifest.resourceId !== resourceId || manifest.memoirId !== memoirId || manifest.storeId !== store.storeId) throw new Error('memoir identity/version mismatch');
  return { directory, manifest, store };
}

const locationFenced = (records, storeId) => {
  let fenced = false;
  for (const record of records) {
    if (record.kind === 'handoff-fenced' && record.sourceStoreId === storeId) fenced = true;
    if (record.kind === 'handoff-activated' && record.destinationStoreId === storeId) fenced = false;
  }
  return fenced;
};
async function locationReceipt(memoir) {
  const journal = scanFrames((await read(memoir.directory, 'journal.jsonl')).data);
  return journal.frames.map(f => JSON.parse(f.payload)).findLast(r => r.kind === 'handoff-activated' && r.destinationStoreId === memoir.manifest.storeId) ?? memoir.manifest;
}
const documentReceipt = async memoir => (await locationReceipt(memoir)).document;
async function proveLocation(memoir) {
  const receipt = await locationReceipt(memoir), lock = await atDirectory(memoir.directory, { kind: 'stat', name: 'owner.lock' });
  const equalIdentity = (a, b) => a && b && a.dev === b.dev && a.ino === b.ino;
  if (!equalIdentity(receipt.directoryIdentity, memoir.directory.identity) || !equalIdentity(receipt.storeDirectoryIdentity, memoir.store.directory.identity) || !equalIdentity(receipt.lockIdentity, lock.identity)) throw new Error('unproved physical writer location');
  return lock;
}
export async function association(store, memoir, documentName, enrollmentId) {
  const artifact = await read(store.parent, documentName, maxBlob), expected = await documentReceipt(memoir);
  if (enrollmentId !== memoir.manifest.enrollmentId) return 'unproved-enrollment';
  if (artifact.identity.dev !== expected.identity.dev || artifact.identity.ino !== expected.identity.ino) return 'copy-or-replacement';
  if (hash(artifact.data) !== expected.hash) return 'changed-artifact';
  return 'associated'; // same-dir rename is identified without a filename authority
}

export async function discover(store, resourceId, offset = 0, limit = 25) {
  let resource;
  try { resource = await existingDirectory(store.resources, hash(resourceId)); }
  catch (error) { if (missing(error)) return { candidates: [] }; throw error; }
  const page = await atDirectory(resource, { kind: 'list', offset, limit });
  const candidates = [];
  for (const entry of page.entries) {
    if (!entry.directory || entry.symlink) continue;
    try {
      const directory = await existingDirectory(resource, entry.name);
      const manifest = JSON.parse((await read(directory, 'manifest.json', maxPacket)).data);
      if (manifest.format === 'codex-memoir-gate' && manifest.version === 1 && manifest.resourceId === resourceId && hash(manifest.memoirId) === entry.name) candidates.push(manifest);
    } catch { /* A damaged candidate is not guessed into a writable association. */ }
  }
  return { candidates, next: page.next };
}

export async function openWriter(memoir, grant) {
  if (!memoir.store) throw new Error('missing admitted store capability');
  if (!grant?.enrollmentId) throw new Error('missing enrollment grant');
  const receipt = await documentReceipt(memoir);
  if (await association(memoir.store, memoir, grant.documentName ?? receipt.name, grant.enrollmentId) !== 'associated') throw new Error('unproved writable association');
  const lockInfo = await proveLocation(memoir);
  const lock = await lockFile(memoir.directory, 'owner.lock', lockInfo.identity);
  try {
    const journal = await read(memoir.directory, 'journal.jsonl'), recovered = scanFrames(journal.data);
    if (recovered.incompleteTail) throw new Error('incomplete tail requires explicit recovery');
    const records = recovered.frames.map(f => JSON.parse(f.payload));
    if (await pendingHandoff(memoir.directory, recovered.frames, memoir.manifest.storeId)) throw new Error('pending handoff fences source');
    if (locationFenced(records, memoir.manifest.storeId)) throw new Error('source location is fenced');
    if (memoir.manifest.handoff && !records.some(r => r.kind === 'handoff-activated' && r.id === memoir.manifest.handoff.id && r.destinationStoreId === memoir.manifest.storeId)) throw new Error('handoff destination is staged');
    const checkpoints = await existingDirectory(memoir.directory, 'checkpoints');
    for (const record of records) if (record.kind === 'baseline') await verifiedBlob(checkpoints, record.checkpoint);
    let frames = recovered.frames, size = journal.size, queue = Promise.resolve(), closed = false, closing = false;
    const enqueue = work => {
      if (closing || closed) return Promise.reject(new Error('writer closed'));
      const result = queue.then(work); queue = result.catch(() => {}); return result;
    };
    const token = randomUUID();
    const appendRaw = async bodies => {
      let previous = frames.at(-1)?.checksum ?? genesis;
      const next = bodies.map((body, i) => { const f = envelope(frames.length + i + 1, previous, body); previous = f.checksum; return f; });
      const data = Buffer.from(next.map(f => JSON.stringify(f) + '\n').join(''));
      if (size + data.length > maxJournal) throw new Error('gate journal capacity');
      await atDirectory(memoir.directory, { kind: 'append', name: 'journal.jsonl', data, maxBytes: maxPacket, expectedSize: size, expectedIdentity: journal.identity }, lock.fd);
      frames.push(...next); size += data.length;
    };
    await appendRaw([{ kind: 'epoch', id: randomUUID(), token }]);
    return {
      token, get head() { return frames.length; }, get frames() { return structuredClone(frames); },
      publishCheckpoint(bytes, failAfterChunks) { return enqueue(async () => {
        if (locationFenced(frames.map(f => JSON.parse(f.payload)), memoir.manifest.storeId)) throw new Error('source location is fenced');
        return publishBlob(checkpoints, bytes, lock.fd, failAfterChunks);
      }); },
      append(writerToken, expectedHead, bodies) {
        return enqueue(async () => {
          if (closed) throw new Error('writer closed');
          if (!bodies.length || bodies.length > 128 || Buffer.byteLength(JSON.stringify(bodies)) > 128 * 1024) throw new Error('batch admission limit');
          const prior = new Map(frames.map(f => [JSON.parse(f.payload).id, f])), fresh = [];
          let duplicateHead;
          for (const body of bodies) {
            if (typeof body.id !== 'string' || !body.id) throw new Error('missing record ID');
            const duplicate = prior.get(body.id);
            if (duplicate) {
              if (fresh.length || duplicate.payload !== JSON.stringify(body)) throw new Error('conflicting duplicate ID');
              duplicateHead = duplicate.sequence;
            } else { fresh.push(body); prior.set(body.id, { payload: JSON.stringify(body) }); }
          }
          if (!fresh.length) return { duplicate: true, accepted: bodies.map(b => b.id) };
          if (locationFenced(frames.map(f => JSON.parse(f.payload)), memoir.manifest.storeId)) throw new Error('source location is fenced');
          if (writerToken !== token) throw new Error('fenced writer epoch');
          if ((duplicateHead ?? expectedHead) !== frames.length) throw new Error('stale expected head');
          const parents = new Set(frames.map(f => JSON.parse(f.payload)).filter(b => ['baseline', 'revision'].includes(b.kind)).map(b => b.id));
          for (const body of fresh) {
            if (body.kind === 'baseline') {
              await verifiedBlob(checkpoints, body.checkpoint);
            }
            if (body.kind === 'revision' && !parents.has(body.stateParent)) throw new Error('missing state ancestry');
            if (['baseline', 'revision'].includes(body.kind)) parents.add(body.id);
          }
          await appendRaw(fresh);
          return { duplicate: false, accepted: bodies.map(b => b.id), head: frames.length, checksum: frames.at(-1).checksum };
        });
      },
      async close() { if (closing) return; closing = true; await queue; closed = true; await lock.close(); },
    };
  } catch (error) { await lock.close(); throw error; }
}

export async function readCheckpoint(memoir, descriptor) {
  const directory = await existingDirectory(memoir.directory, 'checkpoints');
  return verifiedBlob(directory, descriptor, true);
}

/** Administrative local handoff: source fencing is durable before a destination
 * can be activated. Copying bytes does not activate a memoir. Old source data is
 * retained. The same function resumes a matching interrupted handoff idempotently.
 * Caller has paused/flushed the source producer and closed its writer first. */
export async function handoffMemoir(source, destinationStore, documentName, handoffId, failAt) {
  const sourceInfo = await proveLocation(source);
  const sourceLock = await lockFile(source.directory, 'owner.lock', sourceInfo.identity);
  let targetLock;
  const fault = phase => { if (phase === failAt) throw new Error(`injected handoff ${phase}`); };
  try {
    let journal = await read(source.directory, 'journal.jsonl'), parsed = scanFrames(journal.data);
    const sourceRecords = parsed.frames.map(f => JSON.parse(f.payload));
    let fence = locationFenced(sourceRecords, source.manifest.storeId) ? sourceRecords.findLast(r => r.kind === 'handoff-fenced' && r.sourceStoreId === source.manifest.storeId) : undefined;
    if (fence && (fence.id !== handoffId || fence.destinationStoreId !== destinationStore.storeId)) throw new Error('conflicting handoff');
    fence ??= { kind: 'handoff-fenced', id: handoffId, sourceStoreId: source.manifest.storeId, destinationStoreId: destinationStore.storeId };
    await appendIntent(source.directory, `handoff-source-${hash(handoffId)}.json`, fence, sourceLock.fd, failAt, 'source');
    journal = await read(source.directory, 'journal.jsonl'); parsed = scanFrames(journal.data);
    if (parsed.incompleteTail) throw new Error('source journal incomplete');
    fault('source-fenced');
    const sourcePrefixHash = hash(journal.data), handoff = { id: handoffId, sourceStoreId: source.manifest.storeId, sourcePrefixHash };
    let target;
    try { target = await readMemoir(destinationStore, source.manifest.resourceId, source.manifest.memoirId); }
    catch (error) {
      if (!missing(error)) throw error;
      target = await admitMemoir(destinationStore, { resourceId: source.manifest.resourceId, memoirId: source.manifest.memoirId, enrollmentId: source.manifest.enrollmentId }, documentName, handoff);
    }
    // Returning to an old location is allowed only when its complete journal is
    // an exact prefix of the fenced source (or an already activated retry).
    // A matching ID/hash or another divergent archive is insufficient.
    const artifact = await read(destinationStore.parent, documentName, maxBlob), sourceReceipt = await documentReceipt(source);
    if (hash(artifact.data) !== sourceReceipt.hash) throw new Error('destination artifact changed');
    const arrivalDocument = { name: documentName, identity: artifact.identity, hash: hash(artifact.data) };
    const targetInfo = await atDirectory(target.directory, { kind: 'stat', name: 'owner.lock' });
    targetLock = await lockFile(target.directory, 'owner.lock', targetInfo.identity);
    const targetJournal = await read(target.directory, 'journal.jsonl');
    if (!targetJournal.size && JSON.stringify(target.manifest.handoff) !== JSON.stringify(handoff)) throw new Error('destination collision');
    if (targetJournal.size && !targetJournal.data.subarray(0, Math.min(targetJournal.size, journal.size)).equals(journal.data.subarray(0, Math.min(targetJournal.size, journal.size)))) throw new Error('destination prefix conflict');
    fault('destination-staged');
    const checkpoints = await existingDirectory(target.directory, 'checkpoints');
    for (const frame of parsed.frames) {
      const record = JSON.parse(frame.payload);
      if (record.kind === 'baseline') await publishBlob(checkpoints, await readCheckpoint(source, record.checkpoint), targetLock.fd);
    }
    fault('blobs-copied');
    let destination = await read(target.directory, 'journal.jsonl');
    if (destination.size <= journal.size) {
      if (!destination.data.equals(journal.data.subarray(0, destination.size))) throw new Error('destination prefix conflict');
      for (let offset = destination.size; offset < journal.size; offset += maxPacket) {
        await atDirectory(target.directory, { kind: 'append', name: 'journal.jsonl', data: journal.data.subarray(offset, offset + maxPacket), maxBytes: maxPacket,
          expectedSize: offset, expectedIdentity: destination.identity }, targetLock.fd);
      }
      destination = await read(target.directory, 'journal.jsonl');
      if (!destination.data.equals(journal.data)) throw new Error('copied journal mismatch');
    } else if (!destination.data.subarray(0, journal.size).equals(journal.data)) throw new Error('destination prefix conflict');
    fault('journal-copied');
    const destinationFrames = scanFrames(destination.data);
    const activation = { kind: 'handoff-activated', id: handoffId, destinationStoreId: destinationStore.storeId, sourcePrefixHash, document: arrivalDocument,
      directoryIdentity: target.directory.identity, storeDirectoryIdentity: destinationStore.directory.identity, lockIdentity: targetInfo.identity };
    const existing = destinationFrames.frames.map(f => JSON.parse(f.payload)).find(r => r.kind === 'handoff-activated' && r.id === handoffId);
    if (existing && JSON.stringify(existing) !== JSON.stringify(activation)) throw new Error('activation conflict');
    if (destinationFrames.frames.length > parsed.frames.length && !existing) throw new Error('unexpected destination suffix');
    await appendIntent(target.directory, `handoff-activate-${hash(handoffId)}.json`, activation, targetLock.fd, failAt, 'activation');
    fault('destination-activated');
    return target;
  } finally { await targetLock?.close(); await sourceLock.close(); }
}
