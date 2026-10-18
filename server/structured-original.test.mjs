import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import express from 'express';
import {createManagedAssetService} from './managed-assets-router.mjs';
import {validateStructuredOriginal} from './structured-original.mjs';
import {closeFilesystemWorkers} from '../scripts/stage-c-gates/filesystem.mjs';
test('bounded original text admission preserves arbitrary syntax and rejects binary/encoding/size abuse',()=>{
 for(const s of ['', '{broken', '<script>unsafe()</script>', 'id,formula\n001,=1+1'])assert.deepEqual(validateStructuredOriginal(Buffer.from(s)),{mediaType:'text/plain'});
 for(const b of [Buffer.from([0,1,2]),Buffer.from([0xff]),Buffer.alloc(2*1024*1024+1),Buffer.from('x'.repeat(200001))])assert.throws(()=>validateStructuredOriginal(b));
 assert.deepEqual(validateStructuredOriginal(Buffer.from([255,254,65,0,13,0,10,0])),{mediaType:'text/plain'});
});
test('originals route uses scoped leases, exact text bytes, deduplication and independent feature flag',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'structured-assets-')),assets=createManagedAssetService({root,cavernId:'fixture',session:'fixture',structuredEnabled:true}),app=express();app.use(express.json());app.use('/api/assets',assets.router);const server=await new Promise(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s));});
 const url=`http://127.0.0.1:${server.address().port}/api/assets`,post=async(p,body,lease)=>{const r=await fetch(url+'/'+p,{method:'POST',headers:{'X-Mutable-Cavern':'fixture',...(lease?{'X-Mutable-Asset-Lease':lease.token}:{}),...(body instanceof FormData?{}:{'Content-Type':'application/json'})},body:body instanceof FormData?body:JSON.stringify(body)});const value=await r.json();if(!r.ok)throw Error(value.Error);return value.Data;};
 try{await assets.recover();const original=new Uint8Array([255,254,65,0,13,0,10,0]);let id;
 for(let i=0;i<2;i++){const lease=await post('begin',{remoteConsent:[]}),form=new FormData();form.append('asset',new Blob([original],{type:'text/plain'}),'source.cs');const m=await post(lease.id+'/originals/stage',form,lease);if(id)assert.equal(m.assetId,id);id=m.assetId;await post(lease.id+'/publish',{},lease);await post(lease.id+'/finish',{},lease);}
 assert.deepEqual(new Uint8Array((await assets.store.get(id,'fixture')).bytes),original);await assert.rejects(assets.store.get(id,'other'));
 const empty=await assets.store.begin(),m=await assets.store.stage(empty,Buffer.alloc(0),{mediaType:'text/plain'});await assets.store.publish(empty);await assets.store.finish(empty);assert.equal((await assets.store.get(m.assetId,'fixture')).bytes.length,0);
 const lease=await post('begin',{remoteConsent:[]}),binary=new FormData();binary.append('asset',new Blob([new Uint8Array([0,1,2])],{type:'text/plain'}),'binary.ts');await assert.rejects(post(lease.id+'/originals/stage',binary,lease));await assets.store.abort(lease);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));await assets.close();await closeFilesystemWorkers();await rm(root,{recursive:true,force:true});}
});
