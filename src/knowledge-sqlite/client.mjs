import { Worker } from 'node:worker_threads';
import { writerLock } from './paths.mjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/** One vault-owned worker, independent of editor occurrences. No raw SQL transport. */
export async function openSqliteFoundation(options) {
  const { timeoutMs = 30000, ...configuration } = options;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300000) throw Error('Invalid worker timeout');
  const worker = new Worker(path.join(path.dirname(fileURLToPath(import.meta.url)), 'worker.mjs'), { workerData: configuration });
  const pending = new Map(); let next = 0, pendingBytes = 0, dead = false, closing = false, startup, unlock;
  let readyResolve, readyReject;
  const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
  const exited = new Promise(resolve => worker.once('exit', resolve));
  function fail(error) {
    if (dead) return; dead = true; clearTimeout(startup); readyReject(error);
    for (const item of pending.values()) { clearTimeout(item.timer); item.reject(error); } pending.clear(); pendingBytes = 0;
  }
  const terminate = async () => { fail(Error('SQLite worker terminated; in-flight mutation outcome may be unknown')); await worker.terminate(); };
  startup = setTimeout(() => { fail(Error('SQLite worker startup timed out')); void worker.terminate(); }, timeoutMs);
  worker.on('error', fail);
  worker.on('exit', code => { unlock?.(); fail(Error(`SQLite worker exited (${code}); no automatic replay`)); });
  worker.on('message', message => {
    if (message.leaseRequest) {
      if (dead) return;
      try { if (unlock) throw Error('Duplicate writer lease request'); unlock = writerLock(message.home); worker.postMessage({ leaseGranted: true }); }
      catch (e) { worker.postMessage({ leaseError: e.message }); }
      return;
    }
    if (message.ready) { clearTimeout(startup); readyResolve(message); return; }
    if (message.startupError) { fail(Error(message.startupError)); return; }
    const task = pending.get(message.id); if (!task) return;
    pending.delete(message.id); pendingBytes -= task.byteSize; clearTimeout(task.timer);
    if (message.error) task.reject(Error(message.error)); else task.resolve(message.value);
  });
  try { await ready; } catch (e) { await worker.terminate(); throw e; }
  const request = (operation, directory, payload) => {
    if (dead || closing) return Promise.reject(Error('SQLite worker is closed'));
    if (pending.size >= 32) return Promise.reject(Error('SQLite worker queue is full'));
    const byteSize=payload?.bytes?.byteLength??0;
    if(byteSize>20*1024*1024||pendingBytes+byteSize>40*1024*1024)return Promise.reject(Error('Saved indexing byte budget exceeded'));
    return new Promise((resolve, reject) => {
      const id = ++next, timer = setTimeout(() => { fail(Error('SQLite operation timed out; outcome may be unknown, inspect before retrying')); void worker.terminate(); }, timeoutMs);
      pendingBytes+=byteSize;pending.set(id, { resolve, reject, timer, byteSize });
      try {worker.postMessage({ id, operation, directory, payload });}
      catch(e){pending.delete(id);pendingBytes-=byteSize;clearTimeout(timer);reject(e);}
    });
  };
  return {
    // Internal host capabilities; not exposed through a browser/request route.
    inventory:()=>request('inventory'),resourceProjection:resourceId=>request('resource-projection',undefined,{resourceId}),
    inspectSaved:payload=>request('inspect-saved',undefined,payload),stageSaved:payload=>request('stage-saved',undefined,payload),
    commitSaved:token=>request('commit-saved',undefined,{token}),discardSaved:token=>request('discard-saved',undefined,{token}),
    deletionBaseline:resourceId=>request('deletion-baseline',undefined,{resourceId}),removeConfirmed:(resourceId,expected)=>request('remove-confirmed',undefined,{resourceId,expected}),
    indexIssue:(path,reason)=>request('index-issue',undefined,{path,reason}),
    finishReconciliation:()=>request('finish-reconciliation'),
    inspect: () => request('inspect'), verify: () => request('verify'),
    rebuildFts: () => request('rebuild-fts'), clearDerived: () => request('clear-derived'),
    backup: directory => request('backup', directory), terminate,
    async close() { if (dead) { await exited; return; } if (closing) { await exited; return; } const done = request('close'); closing = true; try { await done; } finally { await exited; } },
  };
}
