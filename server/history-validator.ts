import { Worker } from 'node:worker_threads';

export interface ValidationPath { checkpointWire: string; records: string[] }
export interface AppendValidation extends ValidationPath { wire: string; resourceId: string; expectedSourceRevision: number }
export interface ValidatedAppend {
  stateBytes: number;
  revisionId: string;
  metadata: { timestamp: string; label: string; cause: string; affectedBlockIds: string[]; sourceRevision: number };
  checkpointWire?: string;
}
export interface ArtifactValidation extends ValidationPath {
  document: unknown; memoirId: string; segmentId: string; revisionId: string;
}

/** One isolated verifier, bounded waiting callers, no persistent mutable state. */
export function createHistoryValidator(options: { workerUrl?: URL; maxPending?: number } = {}) {
  const maxPending = options.maxPending ?? 8;
  if (!Number.isSafeInteger(maxPending) || maxPending < 1 || maxPending > 64) throw new Error('Invalid verification queue limit');
  const worker = new Worker(options.workerUrl ?? new URL('./history-validation-worker.js', import.meta.url));
  type Job = { id: number; method: string; request: unknown; resolve(value: any): void; reject(error: Error): void };
  const queue: Job[] = [];
  let active: Job | undefined, counter = 0, disposed = false, failure: Error | undefined;
  const fail = (error: Error) => { failure = error; active?.reject(error); active = undefined; for (const job of queue.splice(0)) job.reject(error); };
  const next = () => {
    if (active || disposed || failure) return;
    active = queue.shift();
    if (active) worker.postMessage({ id: active.id, method: active.method, request: active.request });
  };
  worker.on('message', message => {
    if (!active || message.id !== active.id) { fail(new Error('Mismatched verification acknowledgement')); return; }
    const job = active; active = undefined;
    if (message.ok) job.resolve(message.result);
    else job.reject(Object.assign(new Error(message.error), { status: 409 }));
    next();
  });
  worker.on('error', fail);
  worker.on('exit', code => { if (!disposed) fail(new Error(`History verifier exited (${code})`)); });
  function call<T>(method: string, request: unknown): Promise<T> {
    if (disposed || failure) return Promise.reject(failure ?? new Error('History verifier disposed'));
    if (queue.length + (active ? 1 : 0) >= maxPending) return Promise.reject(Object.assign(new Error('History verification queue is full; retry retained records'), { status: 503 }));
    return new Promise((resolve, reject) => { queue.push({ id: ++counter, method, request, resolve, reject }); next(); });
  }
  return Object.freeze({
    validateBaseline: (wire: string, resourceId: string) => call<void>('baseline', { wire, resourceId }),
    validateAppend: (request: AppendValidation) => call<ValidatedAppend>('append', request),
    validateArtifact: (request: ArtifactValidation) => call<void>('artifact', request),
    validatePortable: (document: unknown) => call<void>('portable', { document }),
    async dispose() { if (disposed) return; disposed = true; fail(new Error('History verifier disposed')); await worker.terminate(); },
  });
}
