/** Bounded P2 evidence in disposable stores; never writes an authoritative source. */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {openSqliteFoundation} from '../dist/server/knowledge-sqlite/client.mjs';
import {createSavedIndexer} from '../dist/server/sqlite-saved-indexer.js';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'sqlite-p2-qualification-')));
let client;
try {
 client=await openSqliteFoundation({vault:root,initialize:true});
 const results=[],vaultGuid=(await client.inspect()).mutable.vaultGuid;
 // Representative real legacy files, evaluated independently rather than silently merging duplicate IDs.
 for(const file of ['20240830.json','20240902.json','20240914.json','Israfel.json','TLS.json','animation.json','blur.json','bullet-tabs.json']) {
  const source=path.resolve('data',file);let bytes;try{bytes=await fs.readFile(source);}catch(e){if(e.code==='ENOENT'){results.push({file,status:'not-present'});continue;}throw e;}
  const start=performance.now(),contentHash=hash(bytes);
  try {
   await client.clearDerived();
   const inspection=await client.inspectSaved({bytes,vaultGuid});
   const staged=await client.stageSaved({bytes,vaultGuid,evidence:{path:file,contentHash,fileSize:bytes.byteLength},mode:'full'});
   const saved=await client.commitSaved(staged.token),p=await client.resourceProjection(inspection.resourceId);
   results.push({file,status:'reconciled',bytes:bytes.byteLength,contentHash,blocks:p.blocks.length,properties:p.blocks.reduce((n,b)=>n+b.properties.length,0),segments:p.blocks.reduce((n,b)=>n+b.segments.length,0),diagnostics:saved.diagnostics,elapsedMs:performance.now()-start});
  }catch(e){results.push({file,status:'unavailable',bytes:bytes.byteLength,contentHash,reason:e.message});}
  if(hash(await fs.readFile(source))!==contentHash)throw Error('Source file changed during qualification');
 }
 await client.clearDerived();
 const dto={id:'control',type:'main-list-block',metadata:{documentId:'control'},children:Array.from({length:100},(_,i)=>({id:`b-${i}`,type:'standoff-editor-block',text:`Paragraph ${i}: Unicode 😀 café 漢. `.repeat(4)}))};
 const file=path.join(root,'control.json');await fs.writeFile(file,JSON.stringify(dto));const index=createSavedIndexer(client,{root});
 let start=performance.now();const full=await index.refresh({mode:'full'}),fullMs=performance.now()-start;
 if(!full.complete)throw Error(JSON.stringify(full));dto.children[50].text+=' Changed.';await fs.writeFile(file,JSON.stringify(dto));
 start=performance.now();const incremental=await index.refresh({mode:'incremental'}),incrementalMs=performance.now()-start;
 if(!incremental.complete||incremental.reconciled[0].changedBlocks!==1)throw Error('Changed-one-Block gate failed');
 const before=await client.resourceProjection('control');await index.refresh({mode:'full'});const after=await client.resourceProjection('control');
 before.resource.indexedUtc=null;after.resource.indexedUtc=null;if(JSON.stringify(before)!==JSON.stringify(after))throw Error('Full/incremental differential failed');
 console.log(JSON.stringify({qualification:'P2 bounded saved indexing, not P6 performance',recordedUtc:new Date().toISOString(),node:process.version,cpu:os.cpus()[0].model,memoryBytes:os.totalmem(),legacy:results,
  control:{blocks:101,fullMs,incrementalMs,changedBlocks:incremental.reconciled[0].changedBlocks,unchangedBlocks:incremental.reconciled[0].unchangedBlocks,differential:'equal',decoding:'entire Resource in both modes'},integrity:await client.verify()},null,2));
} finally {await client?.close();await fs.rm(root,{recursive:true,force:true});}
