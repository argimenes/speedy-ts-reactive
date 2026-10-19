// Explicit opt-in live provider check; uses an isolated Vault, never the user's knowledge DB.
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import path from 'node:path';import {randomUUID,createHash} from 'node:crypto';import assert from 'node:assert/strict';
import {createApplicationServiceHost} from '../dist/server/application-services/host.js';
import {ManagedAssetStore} from '../server/managed-assets.mjs';
import {closeFilesystemWorkers} from './stage-c-gates/filesystem.mjs';
const root=await mkdtemp(path.join(tmpdir(),'deterministic-live-')),cavernId=randomUUID(),assets=new ManagedAssetStore({root,cavernId,session:'qualification'});
const host=createApplicationServiceHost({root,cavernId,nativeEnabled:true,deterministicEnabled:true,assets:()=>assets,knowledge:async()=>{throw Error('No implicit canonical operation permitted');}});
try{for(const source of process.argv.slice(2).length?process.argv.slice(2):['0000-0002-1825-0097','arxiv:2301.00001v1','PMID:31452104','PMC10009416','ISBN:9780140328721']){
 const start=Date.now(),result=await host.service.call('deterministic.import',{id:randomUUID(),source});const original=await assets.get(result.capture.asset.assetId,cavernId);assert.equal(result.capture.asset.assetId,'sha256:'+createHash('sha256').update(original.bytes).digest('hex'));assert.equal((await host.service.call('deterministic.resume',{id:result.jobId})).capture.snapshotId,result.capture.snapshotId);console.log(JSON.stringify({source,title:result.capture.projection.title,bytes:original.bytes.length,related:result.capture.assets.length,elapsedMs:Date.now()-start,hash:result.capture.asset.assetId}));
}}finally{await host.close();await assets.close();await closeFilesystemWorkers();await rm(root,{recursive:true,force:true});}
