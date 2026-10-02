/** Small physical-foundation/build smoke. Not a P6 vault/performance benchmark. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { createRequire } from 'node:module';
import { openSqliteFoundation } from '../dist/server/knowledge-sqlite/client.mjs';
const require=createRequire(import.meta.url);
const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'sqlite-p1-built-'));
const samples=[];
let engine, pragmas, counts, size;
async function time(fn) { const start=performance.now(); const result=await fn(); return {result,ms:performance.now()-start}; }
try {
  for(let i=0;i<5;i++) {
    const vault=path.join(root,`vault-${i}`); fs.mkdirSync(vault);
    const initialized=await time(()=>openSqliteFoundation({vault,initialize:true})); const client=initialized.result;
    try {
      const inspected=await time(()=>client.inspect()); engine=inspected.result.mutable.sqlite; pragmas=inspected.result.mutable.pragmas; counts=inspected.result.mutable.counts;
      const verified=await time(()=>client.verify()); if(!verified.result.ok || !verified.result.audit.ok) throw Error('Built verification failed');
      const snapshot=path.join(root,`backup-${i}`), backed=await time(()=>client.backup(snapshot));
      const destination=path.join(root,`restored-${i}`); fs.mkdirSync(destination);
      const restored=await time(()=>openSqliteFoundation({vault:destination,restoreFrom:snapshot}));
      try {if((await restored.result.inspect()).mutable.vaultGuid!==inspected.result.mutable.vaultGuid) throw Error('Built restore identity mismatch');}
      finally {await restored.result.close();}
      size=Object.fromEntries(['mutable.db','audit.db'].map(name=>[name,fs.statSync(path.join(snapshot,name)).size]));
      samples.push({initializeWorkerMs:initialized.ms,inspectTransportMs:inspected.ms,verifyMs:verified.ms,backupMs:backed.ms,restoreWorkerMs:restored.ms});
    } finally {await client.close();}
  }
  console.log(JSON.stringify({qualification:'P1 built-artifact empty-schema smoke; not P6 startup or throughput',
    recordedUtc:new Date().toISOString(),node:process.version,platform:process.platform,arch:process.arch,os:os.release(),cpu:os.cpus()[0]?.model,memoryBytes:os.totalmem(),
    driver:require('better-sqlite3/package.json').version,sqlite:engine,pragmas,emptyTableCounts:counts,snapshotBytes:size,samples},null,2));
} finally {fs.rmSync(root,{recursive:true,force:true});}
