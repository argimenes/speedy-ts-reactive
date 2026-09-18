/** Background acceleration only. It can never acknowledge a durable write. */
import { parentPort } from 'node:worker_threads';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { DerivedMaintenance } from '../src/history/selective/maintenance';
import { reconstruct, checkedEvent } from './history-verification';
let engine: DerivedMaintenance | undefined, directory: string | undefined, generation: string | undefined;
parentPort!.on('message', async ({ id, method, request }) => {
  const started = performance.now();
  try {
    let result;
    if (method === 'initialize') {
      if (directory) await rm(directory, { recursive: true, force: true });
      directory = request.directory; generation = request.generation; await mkdir(directory, { recursive: true });
      const owned = directory;
      engine = new DerivedMaintenance({
        digest: async bytes => createHash('sha256').update(bytes).digest('hex'),
        get: async hash => { if (!/^[a-f0-9]{64}$/.test(hash)) throw Error('Invalid derived hash'); return new Uint8Array(await readFile(path.join(owned, hash))); },
        put: async (hash, bytes) => {
          if (!/^[a-f0-9]{64}$/.test(hash)) throw Error('Invalid derived hash');
          try { await writeFile(path.join(owned, hash), bytes, { flag: 'wx' }); }
          catch (error: any) { if (error.code !== 'EEXIST' || !Buffer.from(await readFile(path.join(owned, hash))).equals(Buffer.from(bytes))) throw error; }
        },
      });
      const verifyStart = performance.now(), bindings = request.bindings ?? [request.binding];
      if (bindings.length !== request.path.records.length + 1 || JSON.stringify(bindings.at(-1)) !== JSON.stringify(request.binding)) throw Error('Derived rebuild receipt window mismatch');
      const verified = reconstruct({ ...request.path, records: [] });
      const verificationMs = performance.now() - verifyStart;
      const revisions = [await engine.initialize(verified.state, bindings[0], verified.byteLength)];
      Object.assign(revisions[0].stats, { rebuildVerificationMs: verificationMs });
      let sourceRevision: number | undefined;
      for (let at = 0; at < request.path.records.length; at++) {
        const wire = request.path.records[at], event = checkedEvent(wire, request.binding.resourceId);
        if (sourceRevision !== undefined && event.sourceCounters.before !== sourceRevision) throw Error('Derived rebuild source counter mismatch');
        sourceRevision = event.sourceCounters.after;
        revisions.push(await engine.accept(wire, bindings[at + 1]));
      }
      result = { ...revisions[0], additional: revisions.slice(1) };
    } else {
      if (!engine || generation !== request.generation) throw Error('Derived generation expired');
      result = await engine.accept(request.wire, request.binding, request.stateBytes);
    }
    Object.assign(result.stats, { workerMs: performance.now() - started });
    parentPort!.postMessage({ id, ok: true, result });
  } catch (error) { engine = undefined; parentPort!.postMessage({ id, ok: false, error: String(error) }); }
});
