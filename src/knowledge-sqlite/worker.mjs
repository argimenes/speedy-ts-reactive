import { parentPort, workerData } from 'node:worker_threads';
import { openFoundation, restoreSnapshot } from './foundation.mjs';
import { prepareHome } from './paths.mjs';
let store;
try {
  if (workerData.restoreFrom && workerData.readOnly) throw Error('Read-only mode cannot restore databases');
  const restored = workerData.restoreFrom ? restoreSnapshot(workerData.restoreFrom, workerData.vault) : undefined;
  const { home } = prepareHome(workerData);
  if (!workerData.readOnly) await new Promise((resolve, reject) => {
    parentPort.once('message', message => message.leaseGranted ? resolve() : reject(Error(message.leaseError || 'Writer lease unavailable')));
    parentPort.postMessage({ leaseRequest: true, home });
  });
  store = openFoundation(workerData, { hostLeaseHeld: !workerData.readOnly });
  parentPort.postMessage({ ready: true, restored });
} catch (e) { parentPort.postMessage({ startupError: e.message }); parentPort.close(); }
if (store) {
  let queue = Promise.resolve();
  parentPort.on('message', ({ id, operation, directory }) => {
    queue = queue.then(async () => {
      try {
        let value;
        switch (operation) {
          case 'inspect': value = store.inspect(); break;
          case 'verify': value = store.verify(); break;
          case 'rebuild-fts': value = store.rebuildFts(); break;
          case 'clear-derived': value = store.clearDerived(); break;
          case 'backup': value = await store.backup(directory); break;
          case 'close': store.close(); parentPort.postMessage({ id, value: { closed: true } }); parentPort.close(); return;
          default: throw Error('Unsupported SQLite foundation operation');
        }
        parentPort.postMessage({ id, value });
      } catch (e) { parentPort.postMessage({ id, error: e.message }); }
    });
  });
}
