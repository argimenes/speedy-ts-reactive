// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import express from 'express';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ReactiveEditor } from '../reactive-editor/editor';
import { nativeDocumentSession } from './native-session';
import { captureNative, nativeText } from './native-resource';
import { createNativeDocumentStoreRouter } from '../../server/native-document-store.mjs';
const cleanup:Array<()=>any>=[];afterEach(async()=>{for(const dispose of cleanup.splice(0).reverse())await dispose();vi.unstubAllGlobals();});
async function host(readOnly=false) {
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'native-client-'));cleanup.push(()=>fs.rm(root,{recursive:true,force:true}));
 await fs.copyFile('artifacts/flint-b1.2/rich.mutable.json',path.join(root,'rich.mutable.json'));
 await fs.writeFile(path.join(root,'import.md'),'# Heading\n\n**Bold**');
 const app=express();app.use('/api/native',createNativeDocumentStoreRouter({root,readOnly}));
 const server:any=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});cleanup.push(()=>new Promise(r=>server.close(r)));
 const actual=globalThis.fetch;vi.stubGlobal('fetch',(input:any,options:any)=>actual(typeof input==='string'&&input.startsWith('/')?`http://127.0.0.1:${server.address().port}${input}`:input,options));
 const make=()=>{const editor=new ReactiveEditor({id:crypto.randomUUID(),type:'workspace-block',children:[{id:crypto.randomUUID(),type:'workspace-object-bank-block',children:[]}]});cleanup.push(()=>editor.dispose());return {editor,service:nativeDocumentSession(editor)}};
 return {root,make};
}
it('opens canonically without an occurrence, saves/reopens, and blocks tree/extended/Workspace bypasses',async()=>{
 const f=await host(),{editor,service}=f.make(),location={folder:'.',filename:'rich.mutable.json'};
 const id=await service.open(location);expect(editor.projections.size).toBe(0);expect(await service.save(id)).toMatchObject({phase:'saved',dirty:false});
 expect(()=>editor.encodeWorkspace()).toThrow('native Documents');expect(()=>editor.encodeDocument()).toThrow('native Documents');expect(await editor.persistence.saveExtendedRepository('copy.json')).toBe(false);
 const fresh=f.make();expect(await fresh.service.open(location)).toBe(id);expect(nativeText(captureNative(fresh.editor.repository.snapshot(),id))).toBe(nativeText(captureNative(editor.repository.snapshot(),id)));
});
it('does not refresh a stale client baseline after a rejected Save or Open',async()=>{
 const f=await host(),one=f.make(),two=f.make(),location={folder:'.',filename:'rich.mutable.json'};
 const id=await one.service.open(location);await one.service.save(id);await two.service.open(location);
 const resource=Object.values(one.editor.repository.state.contents).find(c=>c.viewType==='document-block')!;
 const p=Object.values(one.editor.repository.state.placements).find(p=>p.contentKey===resource.key)!;
 one.editor.commands.setPayloadField(p.key,'metadata',{...resource.payload.metadata as any,title:'New title'});
 await one.service.save(id);expect(await two.service.save(id)).toMatchObject({phase:'failed',conflict:true});
 await expect(two.service.open(location)).rejects.toThrow('server file changed');expect(await two.service.save(id)).toMatchObject({phase:'failed',conflict:true});
});
it('imports Markdown into a new native identity, preserves the source, and keeps locations out of identity',async()=>{
 const f=await host(),{editor,service}=f.make();
 await expect(service.open({folder:'.',filename:'import.md'})).rejects.toThrow('Import Markdown');
 const a=await service.open({folder:'.',filename:'import.md'},true),b=await service.open({folder:'.',filename:'import.md'},true);expect(a).not.toBe(b);
 expect(await service.save(a,{folder:'.',filename:'chosen.mutable.json'})).toMatchObject({phase:'saved'});
 expect((await fs.readFile(path.join(f.root,'import.md'),'utf8'))).toBe('# Heading\n\n**Bold**');
 expect(captureNative(editor.repository.snapshot(),a).resourceId).toBe(a);
});
it('read-only rejection has no pending publication and does not cancel ordinary editing',async()=>{
 const f=await host(true),{service}=f.make(),id=await service.open({folder:'.',filename:'rich.mutable.json'});
 const result=await service.save(id);expect(result?.phase).toBe('failed');expect(result?.generation).toBeUndefined();expect(service.status(id)).toContain('read-only');
});
it('a rejected first destination can be corrected without changing the candidate identity',async()=>{
 const f=await host(),{service}=f.make(),id=await service.open({folder:'.',filename:'import.md'},true);
 const failed=await service.save(id,{folder:'.',filename:'rich.mutable.json'});expect(failed?.phase).toBe('failed');
 // A pre-publication identity collision is a rejection, not an uncertain write.
 const retried=await service.save(id,{folder:'.',filename:'fresh.mutable.json'});expect(retried?.phase).toBe('saved');expect(service.location(id)?.filename).toBe('fresh.mutable.json');
});
