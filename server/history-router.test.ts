// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import express from 'express';
import { mkdtemp, writeFile, rm, access, mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { createHistoryService } from './history-router';
import { createDocumentStoreRouter } from './document-store';
import { decodeDocument } from '../src/block-tree/codecs';
import { CanonicalRepository } from '../src/block-tree/repository';
import { TreeCommands } from '../src/block-tree/commands';
import { WholeDocumentCapture, encodeDurableWire, encodeHistoryDocument, projectWholeDocument, replayDurablePath, decodeDurableWire } from '../src/history/durable-core';
import type { ResourceSnapshot, ResourceTransition } from '../src/history/stage-c-gates/resource';
const sha = (value: string) => createHash('sha256').update(value).digest('hex');
const cleanups: (() => Promise<unknown>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); const fs = await import(pathToFileURL(path.resolve('scripts/stage-c-gates/filesystem.mjs')).href); await fs.closeFilesystemWorkers(); });
describe('persistent history HTTP enrollment/read/save seams', () => {
  it('verifies append, exact retry and older save; restarts with the same bounded history and immutable enrollment', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'history-service-')); cleanups.push(() => rm(root, { recursive: true, force: true }));
    const workerFile = path.join(root, 'validation-worker.mjs'); await build({ entryPoints: ['server/history-validation-worker.ts'], outfile: workerFile, bundle: true, platform: 'node', format: 'esm', target: 'node22' });
    const raw = { id: 'doc', type: 'document-block', children: [{ id: 'p', type: 'standoff-editor-block', text: 'hello' }] }; await writeFile(path.join(root, 'doc.json'), JSON.stringify(raw));
    const state = decodeDocument(raw).state, repository = new CanonicalRepository(state, { enforceBlockIdentity: true }), commands = new TreeCommands(repository, key => key);
    const baseline = projectWholeDocument(state, 'doc'), capture = new WholeDocumentCapture(baseline, state.revision), events: ResourceTransition[] = [];
    repository.subscribeHistoryChanges(changes => events.push(capture.capture(changes) as ResourceTransition), error => { throw error; });
    const paragraph = state.contents[state.placements[state.rootPlacementKey].contentKey].children[0];
    for (let index = 0; index < 13; index++) commands.replaceInlineRange(paragraph, 0, 1, index % 2 ? 'X' : 'Y');
    let service = createHistoryService({ root, validatorWorkerUrl: pathToFileURL(workerFile) }); cleanups.push(() => service.dispose());
    const app = express(); app.use(express.json({ limit: '2mb' })); app.use('/history', (req, res, next) => service.router(req, res, next));
    app.use('/documents', createDocumentStoreRouter({ root, history: { validatePortable: document => service.validatePortable(document),
      saveDocument: (...args) => service.saveDocument(...args) } }));
    const server = app.listen(0, '127.0.0.1');
    await new Promise<void>(resolve => server.once('listening', resolve)); cleanups.push(() => new Promise<void>(resolve => server.close(() => resolve())));
    const port = (server.address() as any).port, location: any = { folder: '.', filename: 'doc.json', resourceId: 'doc' };
    async function call(action: string, value: any = {}, success = true) {
      const response = await fetch(`http://127.0.0.1:${port}/history/${action}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ location, ...value }) });
      const body = await response.json() as any; expect(body.Success, body.Error).toBe(success); return body.Data ?? body.Error;
    }
    async function saveFile(document: unknown, filename = 'doc.json', historyProof?: unknown) {
      const response = await fetch(`http://127.0.0.1:${port}/documents/saveDocumentJson`, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ folder: '.', filename, document, ...(historyProof ? { historyProof } : {}) }) });
      return response.json() as Promise<any>;
    }
    const ordinary = encodeHistoryDocument(baseline, 'unavailable-memoir');
    const ordinaryResponse = await saveFile(ordinary, 'ordinary.json');
    expect(ordinaryResponse.Success).toBe(true); expect(ordinaryResponse.Warning).toContain('History association is unavailable');
    expect(ordinaryResponse.Data?.receipt).toBeUndefined();
    const ordinaryBytes = JSON.parse(await readFile(path.join(root, 'ordinary.json'), 'utf8'));
    expect(ordinaryBytes).toEqual(ordinary); expect(ordinaryBytes.saved).toBeUndefined();
    await expect(access(path.join(root, '.memory'))).rejects.toThrow();
    const loaded = await (await fetch(`http://127.0.0.1:${port}/documents/loadDocumentJson?folder=.&filename=ordinary.json`)).json() as any;
    expect(loaded.Success).toBe(true); expect(loaded.Data.document).toEqual(ordinary);
    const inventedReceipt = await saveFile({ ...ordinary, saved: { segmentId: 'invented', revisionId: 'unverified' } }, 'ordinary.json');
    expect(inventedReceipt.Success).toBe(false); expect(inventedReceipt.Error).toContain('requires its verified proof');
    expect(JSON.parse(await readFile(path.join(root, 'ordinary.json'), 'utf8'))).toEqual(ordinary);
    expect((await call('open', { ownerId: 'reader', writable: false })).available).toBe(false);
    await expect(access(path.join(root, '.memory'))).rejects.toThrow();
    const opened = await call('open', { ownerId: 'browser-a', writable: true }); location.memoirId = opened.memoirId; let epoch = opened.epoch;
    await call('open', { ownerId: 'browser-b', writable: true }, false);
    const enrollment = { resourceId: 'doc', memoirId: opened.memoirId, segmentId: 'segment', enrollmentId: 'enrollment', writerEpoch: epoch };
    const wire = encodeDurableWire(baseline), bytes = Buffer.from(wire), descriptor = { hash: sha(wire), byteLength: bytes.length, chunks: [{ hash: sha(wire), byteLength: bytes.length }] };
    await call('chunkPut', { epoch, hash: sha(wire), dataBase64: bytes.toString('base64') });
    await call('begin', { epoch, segmentId: 'segment', revisionId: 'baseline:0', baseline: descriptor, metadata: { enrollment, sourceRevision: state.revision } });
    const packet = (index: number) => { const wire = encodeDurableWire(events[index]); return { enrollment, sequence: index + 1, recordId: events[index].commitId, wire, sha256: sha(wire) }; };
    for (let i = 0; i < 13; i++) {
      if (i === 0 || i === 12) {
        const wire = encodeDurableWire({ ...events[i], sourceCounters: { before: 99, after: 100 } });
        expect(await call('append', { epoch, packet: { ...packet(i), wire, sha256: sha(wire) } }, false)).toContain('source counter differs');
        expect((await call('describe')).segments[0].headSequence).toBe(i);
      }
      expect((await call('append', { epoch, packet: packet(i) })).verifiedThrough).toBe(i + 1);
    }
    expect(await call('append', { epoch, packet: packet(12) })).toEqual({ ...packet(12), wire: undefined, verifiedThrough: 13 });
    await call('append', { epoch, packet: { ...packet(12), wire: 'corrupt' } }, false);
    const savedState = replayDurablePath(baseline, [events[0]]), saved = encodeHistoryDocument(savedState, opened.memoirId, { segmentId: 'segment', revisionId: events[0].commitId });
    const proof = { location, epoch, segmentId: 'segment', revisionId: events[0].commitId, sequence: 1 };
    const verifiedSave = await saveFile(saved, 'doc.json', proof); expect(verifiedSave.Success).toBe(true);
    const receipt = verifiedSave.Data.receipt; expect(receipt.sequence).toBe(1);
    expect((await call('describe')).receipt.hash).toBe((receipt as any).hash);
    await writeFile(path.join(root, 'copied.json'), JSON.stringify(saved));
    await call('open', { location: { ...location, filename: 'copied.json', memoirId: undefined }, ownerId: 'copy', writable: true }, false);
    await service.dispose(); service = createHistoryService({ root, validatorWorkerUrl: pathToFileURL(workerFile) });
    const restarted = await call('open', { ownerId: 'browser-after-restart', writable: true }); epoch = restarted.epoch;
    expect(epoch).not.toBe(enrollment.writerEpoch); expect(restarted.receipt.revisionId).toBe(events[0].commitId); expect(restarted.segments[0].headSequence).toBe(13);
    expect((await call('append', { epoch, packet: packet(12) })).enrollment).toEqual(enrollment);
    const pathResult = await call('path', { segmentId: 'segment', sequence: 13 }); expect(pathResult.checkpointSequence).toBe(12); expect(pathResult.records).toHaveLength(1);
    const checkpointChunks = await Promise.all(pathResult.checkpoint.chunks.map(async (chunk: any) => Buffer.from((await call('chunk', { hash: chunk.hash })).dataBase64, 'base64')));
    const checkpoint = decodeDurableWire(Buffer.concat(checkpointChunks).toString()) as ResourceSnapshot;
    expect(replayDurablePath(checkpoint, pathResult.records.map(decodeDurableWire))).toEqual(projectWholeDocument(repository.readState(), 'doc', 13));
    const timeline = await call('timeline', { segmentId: 'segment', afterSequence: 0, limit: 2 }); expect(timeline.records).toHaveLength(2); expect(timeline.next).toBe(2); expect(timeline.records[0].record.wire).toBeUndefined();
    // Simulate a confined-filesystem publication failure only after the ordinary
    // document has been written: a conflicting filesystem object occupies the
    // immutable receipt name, so no artifact-to-origin association can publish.
    const savedAfterRestart = encodeHistoryDocument(projectWholeDocument(repository.readState(), 'doc', 13), opened.memoirId, { segmentId: 'segment', revisionId: events[12].commitId });
    const artifactHash = sha(JSON.stringify(savedAfterRestart));
    const expectedReceipt = { version: 1, resourceId: 'doc', filename: 'doc.json', artifactHash, segmentId: 'segment', revisionId: events[12].commitId, sequence: 13 };
    const receiptPath = path.join(root, '.memory', `document-${sha('doc.json').slice(0, 32)}`, `receipt-${sha(JSON.stringify(expectedReceipt))}.json`);
    await expect(service.saveDocument(location, { location, epoch, segmentId: 'segment', revisionId: events[12].commitId, sequence: 13 }, savedAfterRestart, async () => {
      throw new Error('Injected Document publication failure');
    })).rejects.toThrow('Injected Document publication failure');
    await mkdir(receiptPath);
    const incomplete = await saveFile(savedAfterRestart, 'doc.json', { location, epoch, segmentId: 'segment', revisionId: events[12].commitId, sequence: 13 });
    expect(incomplete.Success).toBe(true); expect(incomplete.Warning).toContain('history association could not be finalized');
    expect(incomplete.Data?.receipt).toBeUndefined();
    expect(JSON.parse(await readFile(path.join(root, 'doc.json'), 'utf8'))).toEqual(savedAfterRestart);
    expect((await call('describe')).receipt).toBeNull();
    await call('release', { epoch }); await call('heartbeat', { epoch }, false);
  }, 20_000);
});
