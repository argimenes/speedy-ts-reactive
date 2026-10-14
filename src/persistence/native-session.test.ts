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
import * as markdown from './markdown';
const cleanup:Array<()=>any>=[];afterEach(async()=>{for(const dispose of cleanup.splice(0).reverse())await dispose();vi.unstubAllGlobals();vi.restoreAllMocks();});
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
 const f=await host(true),{editor,service}=f.make(),id=await service.open({folder:'.',filename:'rich.mutable.json'});
 const c=Object.values(editor.repository.readState().contents).find(c=>c.viewType==='standoff-editor-block')!;
 const p=Object.values(editor.repository.readState().placements).find(p=>p.contentKey===c.key)!;
 editor.commands.replaceInlineRange(p.key,0,0,'Still editable');expect(service.isDirty(id)).toBe(true);
 const result=await service.save(id);expect(result?.phase).toBe('failed');expect(result?.generation).toBeUndefined();expect(service.status(id)).toContain('read-only');
 expect(service.isDirty(id)).toBe(true);
});
it('a rejected first destination can be corrected without changing the candidate identity',async()=>{
 const f=await host(),{service}=f.make(),id=await service.open({folder:'.',filename:'import.md'},true);
 const failed=await service.save(id,{folder:'.',filename:'rich.mutable.json'});expect(failed?.phase).toBe('failed');
 // A pre-publication identity collision is a rejection, not an uncertain write.
 const retried=await service.save(id,{folder:'.',filename:'fresh.mutable.json'});expect(retried?.phase).toBe('saved');expect(service.location(id)?.filename).toBe('fresh.mutable.json');
});

it('opens a native resource without taking a workspace snapshot to rebuild its binding membership',async()=>{
 const f=await host(),{editor,service}=f.make(),snapshot=vi.spyOn(editor.repository,'snapshot');
 const id=await service.open({folder:'.',filename:'rich.mutable.json'});
 expect(snapshot).not.toHaveBeenCalled();snapshot.mockRestore();
 const c=Object.values(editor.repository.readState().contents).find(c=>c.viewType==='standoff-editor-block')!;
 const p=Object.values(editor.repository.readState().placements).find(p=>p.contentKey===c.key)!;
 editor.commands.replaceInlineRange(p.key,0,0,'Unsaved ');
 expect(service.status(id)).toContain('Save required');
 expect((await service.save(id))?.phase).toBe('saved');
 expect((await fs.readFile(path.join(f.root,'rich.mutable.json'),'utf8'))).toContain('Unsaved ');
});

it.each(['letter.ink','letter.phosphor','letter.mutable.json'])('saves only Mutable JSON to the opened filename %s, with cheap dirty tracking and no background save',async filename=>{
 const f=await host(),{editor,service}=f.make(),location={folder:'.',filename};
 await fs.copyFile(path.join(f.root,'rich.mutable.json'),path.join(f.root,filename));
 const id=await service.open(location),before=await fs.readFile(path.join(f.root,filename),'utf8');
 expect(service.isDirty(id)).toBe(false);
 const projection=vi.spyOn(markdown,'exportMarkdown'),snapshot=vi.spyOn(editor.repository,'snapshot');
 const c=Object.values(editor.repository.readState().contents).find(c=>c.viewType==='standoff-editor-block')!;
 const p=Object.values(editor.repository.readState().placements).find(p=>p.contentKey===c.key)!;
 for(let i=0;i<3;i++){editor.commands.replaceInlineRange(p.key,0,0,'Unsaved ');expect(service.isDirty(id)).toBe(true);await Promise.resolve();}
 expect(snapshot).not.toHaveBeenCalled();snapshot.mockRestore();
 expect(await fs.readFile(path.join(f.root,filename),'utf8')).toBe(before);
 expect(await service.save(id,{folder:'.',filename:'Unwanted.mutable.json'})).toMatchObject({phase:'saved',dirty:false});
 expect(service.isDirty(id)).toBe(false);expect(service.location(id)).toEqual(location);
 expect(JSON.parse(await fs.readFile(path.join(f.root,filename),'utf8')).format).toBe('mutable-document');
 expect((await fs.readdir(f.root)).filter(name=>name.endsWith('.md'))).toEqual(['import.md']);
 expect(await fs.stat(path.join(f.root,'Unwanted.mutable.json')).catch(()=>null)).toBeNull();
 expect(projection).not.toHaveBeenCalled();
});

it('keeps newer edits dirty when an earlier explicit save completes',async()=>{
 const f=await host(),{editor,service}=f.make(),id=await service.open({folder:'.',filename:'rich.mutable.json'});
 const c=Object.values(editor.repository.readState().contents).find(c=>c.viewType==='standoff-editor-block')!;
 const p=Object.values(editor.repository.readState().placements).find(p=>p.contentKey===c.key)!;
 const fetch=globalThis.fetch;let arrived!:()=>void,resume!:()=>void;
 const received=new Promise<void>(resolve=>arrived=resolve),held=new Promise<void>(resolve=>resume=resolve);
 vi.stubGlobal('fetch',async(input:any,options:any)=>{const response=await fetch(input,options);if(String(input).endsWith('/save')){arrived();await held;}return response;});
 editor.commands.replaceInlineRange(p.key,0,0,'First edit ');
 const saving=service.save(id);await received;
 editor.commands.replaceInlineRange(p.key,0,0,'Later edit ');resume();
 expect(await saving).toMatchObject({phase:'saved',dirty:true});expect(service.isDirty(id)).toBe(true);
 expect(await fs.readFile(path.join(f.root,'rich.mutable.json'),'utf8')).not.toContain('Later edit');
 expect(await service.save(id)).toMatchObject({phase:'saved',dirty:false});expect(service.isDirty(id)).toBe(false);
});
