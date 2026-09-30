// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import express from 'express';
import { promises as fs } from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { ReactiveEditor } from '../reactive-editor/editor';
import { nativeDocumentSession } from './native-session';
import { captureNative, nativeText } from './native-resource';
import { createNativeDocumentStoreRouter } from '../../server/native-document-store.mjs';
execFileSync(process.execPath,['scripts/build-relocation-helper.mjs']);
const cleanup:Array<()=>any>=[];afterEach(async()=>{for(const f of cleanup.splice(0).reverse())await f();vi.unstubAllGlobals();});
async function host(fault: (stage:string)=>Promise<void>=async()=>{}) {
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'c1a-session-'));cleanup.push(()=>fs.rm(root,{recursive:true,force:true}));await fs.copyFile('artifacts/flint-b1.2/rich.mutable.json',path.join(root,'rich.mutable.json'));
 const app=express();app.use('/api/native',createNativeDocumentStoreRouter({root,fault}));const server:any=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});cleanup.push(()=>new Promise(r=>server.close(r)));
 const actual=globalThis.fetch;vi.stubGlobal('fetch',(input:any,options:any)=>actual(typeof input==='string'&&input.startsWith('/')?`http://127.0.0.1:${server.address().port}${input}`:input,options));
 const make=()=>{const editor=new ReactiveEditor({id:crypto.randomUUID(),type:'workspace-block',children:[{id:crypto.randomUUID(),type:'workspace-object-bank-block',children:[]}]});cleanup.push(()=>editor.dispose());return {editor,service:nativeDocumentSession(editor)}};
 const one=make(),id=await one.service.open({folder:'.',filename:'rich.mutable.json'});await one.service.save(id);
 const request=async()=>({operationId:crypto.randomUUID(),vault:'.',kind:'pair' as const,source:'rich.mutable.json',destination:'renamed.mutable.json',baselines:(await one.service.discoverVault('.')).documents.map((d:any)=>({resourceId:d.resourceId,baseline:d.baseline}))});
 return {root,...one,id,make,request};
}
it('changes only the resource binding with zero occurrences and rejects automatic same-ID adoption by another session',async()=>{
 const f=await host(),two=f.make();await two.service.open({folder:'.',filename:'rich.mutable.json'});const before=nativeText(captureNative(f.editor.repository.snapshot(),f.id)),q=await f.request();
 expect(f.editor.projections.size).toBe(0);const result=await f.service.relocateVault(q);expect(result.phase).toBe('relocated');expect(f.service.location(f.id)?.filename).toBe('renamed.mutable.json');expect(nativeText(captureNative(f.editor.repository.snapshot(),f.id))).toBe(before);
 expect(f.editor.persistence.workspaceReference(f.id)?.source.filename).toBe('renamed.mutable.json');await expect(two.service.open({folder:'.',filename:'renamed.mutable.json'})).rejects.toThrow('another location');expect((await two.service.save(f.id))?.phase).toBe('failed');
 const fresh=f.make();expect(await fresh.service.open({folder:'.',filename:'renamed.mutable.json'})).toBe(f.id);
});
it('retains edits and shared identity across two occurrences and their disposal during relocation',async()=>{
 let enter!:()=>void,resume!:()=>void;const entered=new Promise<void>(r=>enter=r),held=new Promise<void>(r=>resume=r);
 const f=await host(async stage=>{if(stage==='relocation-after-0'){enter();await held;}}),q=await f.request();
 const root=Object.values(f.editor.repository.state.contents).find(c=>c.viewType==='document-block')!,p=Object.values(f.editor.repository.state.placements).find(p=>p.contentKey===root.key)!;
 const a=f.editor.createView('one',p.key),b=f.editor.createView('two',p.key),before=await fs.readFile(path.join(f.root,'rich.mutable.json'),'utf8');
 const moving=f.service.relocateVault(q);await entered;f.editor.commands.setPayloadField(p.key,'metadata',{...root.payload.metadata as any,title:'Edited during relocation'});f.editor.disposeView(a);f.editor.disposeView(b);resume();expect((await moving).phase).toBe('relocated');
 expect(await fs.readFile(path.join(f.root,'renamed.mutable.json'),'utf8')).toBe(before);expect(f.service.status(f.id)).toContain('unsaved edits');expect(nativeText(captureNative(f.editor.repository.snapshot(),f.id))).toContain('Edited during relocation');
 expect((await f.service.save(f.id))?.phase).toBe('saved');expect(await fs.readFile(path.join(f.root,'renamed.mutable.json'),'utf8')).toContain('Edited during relocation');
});
it('queues Save behind relocation so it uses the confirmed new binding',async()=>{
 let enter!:()=>void,resume!:()=>void;const entered=new Promise<void>(r=>enter=r),held=new Promise<void>(r=>resume=r);
 const f=await host(async stage=>{if(stage==='relocation-after-0'){enter();await held;}}),moving=f.service.relocateVault(await f.request());await entered;const saved=f.service.save(f.id);resume();expect((await moving).phase).toBe('relocated');expect((await saved)?.phase).toBe('saved');expect(await fs.stat(path.join(f.root,'rich.mutable.json')).catch(()=>null)).toBeNull();
});
it('recovers an uncertain response through the same resource-owned operation',async()=>{
 const f=await host(),original=globalThis.fetch,q=await f.request();let lost=true;
 vi.stubGlobal('fetch',async(input:any,options:any)=>{const response=await original(input,options);if(lost&&String(input).endsWith('/vault/relocate')){lost=false;await response.text();throw Error('connection lost');}return response;});
 await expect(f.service.relocateVault(q)).rejects.toThrow('connection lost');await expect(f.service.save(f.id)).rejects.toThrow('pending relocation');expect((await f.service.recoverRelocation(q.operationId)).phase).toBe('relocated');expect(f.service.location(f.id)?.filename).toBe('renamed.mutable.json');
});
it('a newer discovery result cannot replace a stale live baseline to authorize relocation',async()=>{
 const f=await host(),two=f.make();await two.service.open({folder:'.',filename:'rich.mutable.json'});
 const root=Object.values(f.editor.repository.state.contents).find(c=>c.viewType==='document-block')!,p=Object.values(f.editor.repository.state.placements).find(p=>p.contentKey===root.key)!;f.editor.commands.setPayloadField(p.key,'metadata',{...root.payload.metadata as any,title:'new'});await f.service.save(f.id);
 await expect(two.service.relocateVault(await f.request())).rejects.toThrow('stale editor baseline');
});
it('a fresh session can recover a recorded operation without adopting any live binding',async()=>{
 const f=await host(),q=await f.request();expect((await f.service.relocateVault(q)).phase).toBe('relocated');const fresh=f.make();expect((await fresh.service.recoverRelocation(q.operationId)).phase).toBe('relocated');expect(fresh.service.location(f.id)).toBeUndefined();expect(fresh.editor.projections.size).toBe(0);expect(await fresh.service.open({folder:'.',filename:'renamed.mutable.json'})).toBe(f.id);
});
it('passes query cancellation through the real discovery transport',async()=>{const f=await host(),controller=new AbortController();controller.abort();await expect(f.service.discoverVault('.',controller.signal)).rejects.toMatchObject({name:'AbortError'});expect(f.service.location(f.id)?.filename).toBe('rich.mutable.json');});
it('cannot use relocation to adopt an externally moved same-ID pair with unchanged hashes',async()=>{
 const f=await host();await fs.mkdir(path.join(f.root,'outside-move'));for(const name of await fs.readdir(f.root)){if(name==='rich.mutable.json'||name==='rich.md'||name.startsWith('.mutable-pair-'))await fs.rename(path.join(f.root,name),path.join(f.root,'outside-move',name));}
 const scan=await f.service.discoverVault('outside-move');expect(scan.documents[0].state).toBe('paired');const q={operationId:crypto.randomUUID(),vault:'outside-move',kind:'pair' as const,source:'outside-move/rich.mutable.json',destination:'outside-move/renamed.mutable.json',baselines:scan.documents.map((d:any)=>({resourceId:d.resourceId,baseline:d.baseline}))};
 await expect(f.service.relocateVault(q)).rejects.toThrow('differs from the live binding');expect(f.service.location(f.id)?.filename).toBe('rich.mutable.json');expect(await fs.stat(path.join(f.root,'outside-move/rich.mutable.json'))).toBeTruthy();
});
