import { Worker } from 'node:worker_threads';
import { mkdtemp, readFile, readdir, lstat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Binding, Certificate } from '../src/history/selective/contracts';
import type { MaintenanceStats } from '../src/history/selective/maintenance';
import type { ValidationPath } from './history-validator';

/** One active resource/segment, eight queued compact receipts, sixteen certified
 * read revisions, 128MiB disposable CAS. Loss/eviction only loses acceleration. */
export function createDerivedHistory(options: { workerUrl?: URL } = {}) {
  type Session = { key: string; generation: string; directory: string; queuedThrough: number; certificates: Map<number, Certificate>; stats: Map<number, MaintenanceStats>; failure?: string };
  let session: Session | undefined, worker: Worker | undefined, active: any, disposed = false, counter = 0;
  const jobs: any[] = [];
  // Crash leftovers are disposable, but still count against disk use. Reclaim
  // only this user's cache directories whose owning process has exited.
  const home = (async () => {
    for (const name of await readdir(tmpdir())) {
      const match = /^codex-history-derived-(\d+)-[a-zA-Z0-9]{6}$/.exec(name); if (!match) continue;
      try { process.kill(Number(match[1]), 0); } catch (error: any) {
        if (error.code !== 'ESRCH') continue;
        const target = path.join(tmpdir(), name), stat = await lstat(target);
        if (stat.uid === process.getuid?.()) await rm(target, { recursive: true, force: true });
      }
    }
    return mkdtemp(path.join(tmpdir(), `codex-history-derived-${process.pid}-`));
  })().catch(() => undefined);
  const next = () => {
    if (active || disposed) return;
    active = jobs.shift(); if (!active) return;
    try {
      if (!worker) {
        worker = new Worker(options.workerUrl ?? new URL('./history-derived-worker.js', import.meta.url));
        worker.on('message', message => {
          const job = active; active = undefined;
          if (!job || job.id !== message.id) { if (session) session.failure = 'Derived worker response mismatch'; return; }
          if (session?.generation === job.request.generation) {
            if (message.ok) {
              for (const { certificate, stats } of [message.result, ...message.result.additional ?? []]) {
                session.certificates.set(certificate.binding.sequence, certificate); session.stats.set(certificate.binding.sequence, stats);
              }
              while (session.certificates.size > 16) { const first = session.certificates.keys().next().value!; session.certificates.delete(first); session.stats.delete(first); }
            } else { session.failure = message.error; jobs.length = 0; }
          }
          next();
        });
        const owned = worker;
        const failed = (error: unknown) => { if (worker !== owned) return; worker = undefined; void owned.terminate(); if (session) session.failure = String(error); active = undefined; jobs.length = 0; };
        worker.on('error', failed); worker.on('exit', code => { if (!disposed) failed(`Derived worker exited ${code}`); });
      }
      worker.postMessage(active);
    } catch (error) {
      if (session) session.failure = String(error);
      const failed = worker; worker = undefined; void failed?.terminate(); active = undefined; jobs.length = 0;
    }
  };
  const enqueue = (method: string, request: any) => { jobs.push({ id: ++counter, method, request }); next(); };
  return {
    busy(key: string) { return session?.key === key && !session.failure && !!(active || jobs.length); },
    async initialize(key: string, verifiedPath: ValidationPath, binding: Binding, bindings?: Binding[]) {
      if (disposed) return;
      const root = await home; if (disposed) return; if (!root) throw Error("Derived temporary storage unavailable");
      const generation = randomUUID(), directory = path.join(root, generation);
      session = { key, generation, directory, queuedThrough: binding.sequence, certificates: new Map(), stats: new Map() }; jobs.length = 0;
      enqueue('initialize', { path: verifiedPath, binding, bindings, generation, directory });
    },
    append(key: string, wire: string, binding: Binding, stateBytes: number) {
      if (!session || session.key !== key || session.failure || disposed) return;
      if (session.queuedThrough + 1 !== binding.sequence || jobs.length + (active ? 1 : 0) >= 8) { session.failure = 'Derived queue/gap; archive remains authoritative'; return; }
      session.queuedThrough = binding.sequence;
      enqueue('append', { wire, binding, stateBytes, generation: session.generation });
    },
    certificate(key: string, binding: Binding) {
      const value = session?.key === key ? session.certificates.get(binding.sequence) : undefined;
      return value && JSON.stringify(value.binding) === JSON.stringify(binding) ? { certificate: value, token: session!.generation } : null;
    },
    async blob(key: string, token: string, hash: string) {
      if (session?.key !== key || session.generation !== token || !/^[a-f0-9]{64}$/.test(hash)) throw Error('Derived read capability expired');
      const bytes = await readFile(path.join(session.directory, hash)); if (bytes.length > 1024 * 1024) throw Error('Derived shard limit'); return bytes;
    },
    status(key: string) { return session?.key === key ? { ready: [...session.certificates.keys()], pending: jobs.length + (active ? 1 : 0), failure: session.failure, maintenance: [...session.stats].map(([sequence, stats]) => ({ sequence, ...stats })) } : { ready: [], pending: 0, maintenance: [] }; },
    async dispose() { disposed = true; jobs.length = 0; await worker?.terminate(); const root = await home; if (root) await rm(root, { recursive: true, force: true }); },
  };
}
