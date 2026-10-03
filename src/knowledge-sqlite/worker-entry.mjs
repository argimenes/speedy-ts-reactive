import { parentPort, workerData } from 'node:worker_threads';
import { openFoundation, restoreSnapshot } from './foundation.mjs';
import { prepareHome } from './paths.mjs';
import { projectSaved } from './saved-projection.ts';
import { sqlKnowledgeRead } from './query-services.ts';
import { randomUUID } from 'node:crypto';
let store;
try {
  if (workerData.restoreFrom && workerData.readOnly) throw Error('Read-only mode cannot restore databases');
  const restored = workerData.restoreFrom ? restoreSnapshot(workerData.restoreFrom, workerData.vault, workerData.scopeValidated) : undefined;
  const { home } = prepareHome(workerData);
  if (!workerData.readOnly) await new Promise((resolve, reject) => {
    parentPort.once('message', message => message.leaseGranted ? resolve() : reject(Error(message.leaseError || 'Writer lease unavailable')));
    parentPort.postMessage({ leaseRequest: true, home });
  });
  store = openFoundation(workerData, { hostLeaseHeld: !workerData.readOnly, scopeValidated:workerData.scopeValidated });
  parentPort.postMessage({ ready: true, restored });
} catch (e) { parentPort.postMessage({ startupError: e.message }); parentPort.close(); }
if (store) {
  let queue = Promise.resolve();
  let staged;
  parentPort.on('message', ({ id, operation, directory, payload }) => {
    queue = queue.then(async () => {
      try {
        let value;
        const check=()=>{if(payload?.cancellation&&Atomics.load(payload.cancellation,0))throw Error('Saved indexing canceled');};
        check();
        if(['inspect-saved','stage-saved'].includes(operation)&&payload.vaultGuid!==store.vaultGuid)throw Error('Saved indexing vault identity mismatch');
        switch (operation) {
          case 'entities': { const {cancellation,...input}=payload; value=store.entities(input,check);break; }
          case 'knowledge-revision': value=store.knowledgeRevision();break;
          case 'knowledge-read': value=await store.readKnowledge(db=>sqlKnowledgeRead(db,payload,check));break;
          case 'finish-reconciliation': value=store.finishReconciliation();break;
          case 'inventory': value=store.inventory(); break;
          case 'index-status': value=store.indexStatus(); break;
          case 'resource-projection': value=store.resourceProjection(payload.resourceId); break;
          case 'inspect-saved': {const p=await projectSaved(payload.bytes,payload.vaultGuid,payload.policy,undefined,check);check();value={resourceId:p.resourceId,rootBlockId:p.rootBlockId,contentHash:p.contentHash,format:p.format,blockIds:p.blocks.map(b=>b.block.guid)};break;}
          case 'stage-saved': {
            staged=undefined;
            const timings={},projection=await projectSaved(payload.bytes,payload.vaultGuid,payload.policy,timings,check),token=randomUUID();
            check();const prepared=store.prepareReconciliation(projection,payload.evidence,store.indexingBaseline(projection.resourceId),{mode:payload.mode,timings,check});
            staged={token,prepared,timings};
            value={token,resourceId:projection.resourceId,contentHash:projection.contentHash,timings};break;
          }
          case 'commit-saved': {
            if(!staged||staged.token!==payload.token)throw Error('Expired saved indexing token');
            const job=staged;staged=undefined;const timings={...job.timings};value={...store.commitReconciliation(job.prepared,{timings,check}),timings};break;
          }
          case 'discard-saved': if(staged?.token===payload.token)staged=undefined;value={discarded:true};break;
          case 'deletion-baseline': value=store.indexingBaseline(payload.resourceId);break;
          case 'remove-confirmed': value=store.removeConfirmed(payload.resourceId,payload.expected);break;
          case 'index-issue': value=store.recordIssue(payload.path,payload.reason);break;
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
