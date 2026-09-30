// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { render } from 'solid-js/web';
import express from 'express';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createNativeDocumentStoreRouter } from '../../server/native-document-store.mjs';
import { ReactiveEditor } from '../reactive-editor/editor';
import { materializeLocalWorkspace } from '../reactive-editor/workspace-manifest';
import { registerApplicationViews } from './features';
import { ReactiveTreeView } from '../rendering/reactive-tree-view';
import { nativeDocumentSession } from '../persistence/native-session';
import { captureNative, nativeText } from '../persistence/native-resource';
execFileSync(process.execPath,['scripts/build-relocation-helper.mjs']);
const disposers:Array<()=>any>=[], actualFetch=globalThis.fetch;
afterEach(async()=>{for(const f of disposers.splice(0).reverse())await f();document.body.replaceChildren();localStorage.clear();vi.unstubAllGlobals();});
const wait=(f:()=>void)=>vi.waitFor(f,{timeout:6000,interval:20});
const button=(host:ParentNode,label:string)=>{const b=[...host.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent===label);expect(b,`button ${label}`).toBeTruthy();return b!;};
const click=(host:ParentNode,label:string)=>{const b=button(host,label);expect(b.disabled,`${label} enabled`).toBe(false);b.click();};
const field=(host:ParentNode,label:string,value:string)=>{const input=host.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)!;expect(input,label).toBeTruthy();input.value=value;input.dispatchEvent(new Event(input.tagName==='SELECT'?'change':'input',{bubbles:true}));};
async function fixture(options:{readOnly?:boolean;fault?:(stage:string)=>Promise<void>}={}) {
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'flint-c1b-'));disposers.push(()=>fs.rm(root,{recursive:true,force:true}));await fs.mkdir(path.join(root,'vault/nested'),{recursive:true});await fs.writeFile(path.join(root,'vault/input.md'),'# Imported\n\n**Bold** text');
 const app=express();app.use('/api/native',createNativeDocumentStoreRouter({root,...options}));const server:any=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});disposers.push(()=>new Promise(r=>server.close(r)));
 vi.stubGlobal('fetch',(input:any,init:any)=>actualFetch(typeof input==='string'&&input.startsWith('/')?`http://127.0.0.1:${server.address().port}${input}`:input,init));
 function make() {
  const editor=new ReactiveEditor(materializeLocalWorkspace({id:crypto.randomUUID(),type:'workspace-block',children:[]}),{features:{compactEditorChrome:false}});registerApplicationViews(editor);const projection=editor.createView('workspace');disposers.push(()=>editor.dispose());
  const launch=()=>editor.commandRegistry.execute('flint.open',{targetKey:projection.state.rootKey,args:undefined});launch();
  const host=document.body.appendChild(document.createElement('div'));disposers.push(render(()=><ReactiveTreeView editor={editor} projection={projection}/>,host));
  const windows=()=>[...host.querySelectorAll<HTMLElement>('.flint-application')];
  return {editor,projection,host,windows,launch,service:nativeDocumentSession(editor)};
 }
 const f=make();return {...f,root,make};
}
async function open(host:ParentNode,root='vault') {field(host,'Vault directory',root);click(host,'Open Vault');await wait(()=>expect(host.querySelector('[aria-label="Selected folder"]')?.textContent).toBe(root));await wait(()=>expect(button(host,'Open Vault').disabled).toBe(false));}
async function create(host:ParentNode,name='note.mutable.json',title='A title') {field(host,'New Document filename',name);field(host,'New Document title',title);click(host,'New Document');await wait(()=>expect(host.textContent).toContain('Saved native Document and Markdown'));await wait(()=>expect(host.querySelector(`[aria-label="Open vault/${name}"]`)).toBeTruthy());await wait(()=>expect(button(host,'New Document').disabled).toBe(false));}
const idOf=(host:ParentNode)=>host.querySelector('[data-flint-property="id"]')!.textContent!;
it('uses the real tree in two Windows, shared native properties and independent occurrences; title never renames files',async()=>{
 const f=await fixture(),a=f.windows()[0];await open(a);f.launch();const b=f.windows().find(w=>w!==a)!;await open(b);
 await create(a);const id=idOf(a);expect(b.querySelector('[aria-label="Open vault/note.mutable.json"]')).toBeTruthy();
 b.querySelector<HTMLButtonElement>('[aria-label="Open vault/note.mutable.json"]')!.click();await wait(()=>expect(idOf(b)).toBe(id));
 const views=()=>[...f.editor.projections.values()].filter(p=>p!==f.projection&&p.state.nodes[p.state.rootKey]?.payload.id===id);expect(views()).toHaveLength(2);
 const keys=views().map(v=>v.state.rootKey);
 const row=a.querySelector('[aria-label="Open vault/note.mutable.json"]'), snapshot=vi.spyOn(f.editor.repository,'snapshot');
 const text=Object.values(views()[0].state.nodes).find(n=>n.viewType==='standoff-editor-block')!;
 f.editor.commands.replaceInlineRange(text.key,0,0,'Ordinary typing');expect(snapshot).not.toHaveBeenCalled();snapshot.mockRestore();expect(a.querySelector('[aria-label="Open vault/note.mutable.json"]')).toBe(row);
 field(a,'Document title','Authored title');field(a,'Document tags','poetry\nnight\npoetry');click(a,'Apply properties');
 expect((b.querySelector('[aria-label="Document title"]') as HTMLInputElement).value).toBe('Authored title');expect(nativeText(captureNative(f.editor.repository.snapshot(),id))).toContain('night');
 f.editor.repository.undo();expect((a.querySelector('[aria-label="Document title"]') as HTMLInputElement).value).toBe('A title');f.editor.repository.redo();
 click(a,'Save Document');await wait(()=>expect(a.textContent).toContain('Saved native Document and Markdown'));
 expect(await fs.readdir(path.join(f.root,'vault'))).toContain('note.mutable.json');expect(await fs.readFile(path.join(f.root,'vault/note.mutable.json'),'utf8')).toContain('Authored title');
 field(a,'Tag filter','night');expect(a.querySelector('[aria-label="Open vault/note.mutable.json"]')).toBeTruthy();expect(views().map(v=>v.state.rootKey)).toEqual(keys);
 expect(Object.values(f.editor.repository.state.contents).some(c=>(c.payload.metadata as any)?.members)).toBe(false);
 expect(()=>f.editor.persistence.captureWorkspace()).toThrow(/native/i);
 click(a,'Close tab');expect(views()).toHaveLength(1);expect(idOf(b)).toBe(id);
},15000);
it('moves pairs and directories without changing authored data or generations, and Save uses the new location',async()=>{
 const f=await fixture(),a=f.windows()[0];await open(a);await create(a);const id=idOf(a),before=await fs.readFile(path.join(f.root,'vault/note.mutable.json'),'utf8');
 a.querySelector<HTMLButtonElement>('[aria-label="Open vault/note.mutable.json"]')!.click();await wait(()=>expect((a.querySelector('[aria-label="Move destination name"]') as HTMLInputElement).value).toBe('note.mutable.json'));
 await wait(()=>expect(button(a,'Apply rename / move').disabled).toBe(false));field(a,'Move destination folder','vault/nested');field(a,'Move destination name','renamed.mutable.json');click(a,'Apply rename / move');await wait(()=>expect(f.service.location(id)).toEqual({folder:'vault/nested',filename:'renamed.mutable.json'}));
 expect(await fs.readFile(path.join(f.root,'vault/nested/renamed.mutable.json'),'utf8')).toBe(before);expect((a.querySelector('[aria-label="Document title"]') as HTMLInputElement).value).toBe('A title');
 await wait(()=>expect(button(a,'Apply rename / move').disabled).toBe(false));click(a,'nested');field(a,'Move destination folder','vault');field(a,'Move destination name','archive');click(a,'Apply rename / move');await wait(()=>expect(f.service.location(id)?.folder).toBe('vault/archive'));
 await wait(()=>expect(button(a,'Apply rename / move').disabled).toBe(false));field(a,'Document title','New title');click(a,'Apply properties');click(a,'Save Document');await wait(()=>expect(a.textContent).toContain('Saved native Document and Markdown'));expect(await fs.readFile(path.join(f.root,'vault/archive/renamed.mutable.json'),'utf8')).toContain('New title');
 const fresh=f.make(),b=fresh.windows()[0];await open(b);b.querySelector<HTMLButtonElement>('[aria-label="Open vault/archive/renamed.mutable.json"]')!.click();await wait(()=>expect(idOf(b)).toBe(id));expect((b.querySelector('[aria-label="Document title"]') as HTMLInputElement).value).toBe('New title');
},15000);
it('keeps typing and resource-owned relocation alive after both initiating occurrences close',async()=>{
 let enter!:()=>void,resume!:()=>void;const entered=new Promise<void>(r=>enter=r),held=new Promise<void>(r=>resume=r);
 const f=await fixture({fault:async stage=>{if(stage==='relocation-after-0'){enter();await held;}}}),a=f.windows()[0];await open(a);await create(a);const id=idOf(a),before=await fs.readFile(path.join(f.root,'vault/note.mutable.json'),'utf8');
 a.querySelector<HTMLButtonElement>('[aria-label="Open vault/note.mutable.json"]')!.click();field(a,'Move destination name','moved.mutable.json');await wait(()=>expect(button(a,'Apply rename / move').disabled).toBe(false));click(a,'Apply rename / move');await entered;
 const view=[...f.editor.projections.values()].find(p=>p!==f.projection&&p.state.nodes[p.state.rootKey]?.payload.id===id)!;const text=Object.values(view.state.nodes).find(n=>n.viewType==='standoff-editor-block')!;f.editor.commands.replaceInlineRange(text.key,0,0,'During move');
 for(const n of Object.values(f.projection.state.nodes).filter(n=>n.viewType==='window-block'))f.editor.commands.remove(n.key);resume();await wait(()=>expect(f.service.location(id)?.filename).toBe('moved.mutable.json'));
 expect(await fs.readFile(path.join(f.root,'vault/moved.mutable.json'),'utf8')).toBe(before);expect(f.service.status(id)).toContain('unsaved');await f.service.save(id);expect(await fs.readFile(path.join(f.root,'vault/moved.mutable.json'),'utf8')).toContain('During move');
},15000);
it('imports explicitly, preserves source, and exposes collisions as unsaved candidates rather than files',async()=>{
 const f=await fixture(),a=f.windows()[0];await open(a);field(a,'Markdown source','vault/input.md');field(a,'New Document filename','input.mutable.json');click(a,'Import into new native Document');await wait(()=>expect(a.textContent).toContain('preserve the imported Markdown source'));
 field(a,'New Document filename','imported.mutable.json');click(a,'Import into new native Document');await wait(()=>expect(a.querySelector('[aria-label="Open vault/imported.mutable.json"]')).toBeTruthy());const id=idOf(a);expect(await fs.readFile(path.join(f.root,'vault/input.md'),'utf8')).toContain('**Bold**');
 click(a,'Import into new native Document');await wait(()=>expect(idOf(a)).not.toBe(id));await wait(()=>expect(a.textContent).toContain('Save blocked'));expect(a.textContent).toContain('Unsaved native candidate');expect(a.querySelectorAll('[aria-label="Open vault/imported.mutable.json"]')).toHaveLength(1);
},15000);
it('exposes read-only storage, preserves ordinary editing, and cannot bypass it through Files',async()=>{
 const f=await fixture({readOnly:true});await fs.copyFile('artifacts/flint-b1.2/rich.mutable.json',path.join(f.root,'vault/rich.mutable.json'));const a=f.windows()[0];await open(a);expect(button(a,'New Document').disabled).toBe(true);expect(button(a,'Create directory').disabled).toBe(true);expect(button(a,'Save Document').disabled).toBe(true);
 a.querySelector<HTMLButtonElement>('[aria-label="Open vault/rich.mutable.json"]')!.click();await wait(()=>expect(idOf(a)).toBe('resource'));field(a,'Document title','Local only');click(a,'Apply properties');expect(nativeText(captureNative(f.editor.repository.snapshot(),'resource'))).toContain('Local only');expect(await fs.readFile(path.join(f.root,'vault/rich.mutable.json'),'utf8')).not.toContain('Local only');
},15000);
it('refresh discovers external changes without rebinding or replacing loaded dirty content; ambiguous identities stay unavailable',async()=>{
 const f=await fixture(),a=f.windows()[0];await open(a);await create(a);const id=idOf(a);field(a,'Document title','Unsaved title');click(a,'Apply properties');
 await fs.mkdir(path.join(f.root,'vault/external'));await fs.copyFile(path.join(f.root,'vault/note.mutable.json'),path.join(f.root,'vault/external/copied.mutable.json'));click(a,'Refresh');await wait(()=>expect(a.textContent).toContain('Duplicate canonical identity'));
 expect(a.querySelector<HTMLButtonElement>('[aria-label="Open vault/external/copied.mutable.json"]')!.disabled).toBe(true);expect(f.service.location(id)).toEqual({folder:'vault',filename:'note.mutable.json'});expect((a.querySelector('[aria-label="Document title"]') as HTMLInputElement).value).toBe('Unsaved title');
},15000);
it('preserves unknown authored payloads and incompatible tags, and reports missing owned-resource dependencies',async()=>{
 const f=await fixture();await fs.copyFile('artifacts/flint-b1.2/a.mutable.json',path.join(f.root,'vault/a.mutable.json'));const a=f.windows()[0];await open(a);a.querySelector<HTMLButtonElement>('[aria-label="Open vault/a.mutable.json"]')!.click();await wait(()=>expect(idOf(a)).toBe('resource-a'));
 click(a,'Save Document');await wait(()=>expect(a.textContent).toContain('Save blocked'));expect(await fs.stat(path.join(f.root,'vault/a.md')).catch(()=>null)).toBeNull();
 const doc=Object.values(f.editor.repository.state.contents).find(c=>(c.payload.metadata as any)?.documentId==='resource-a')!;const placement=Object.values(f.editor.repository.state.placements).find(p=>p.contentKey===doc.key)!;
 f.editor.commands.setPayloadField(placement.key,'metadata',{...doc.payload.metadata as any,tags:{future:true},futureFeature:{data:[1,2]}});expect(button(a,'Apply properties').disabled).toBe(true);expect(nativeText(captureNative(f.editor.repository.snapshot(),'resource-a'))).toContain('futureFeature');expect(a.textContent).toContain('preserved');
},15000);
it('retains the selected vault across minimize/restore, with no serialized membership or root path',async()=>{
 const f=await fixture(),a=f.windows()[0];await open(a);click(a,'Create directory');await wait(()=>expect(a.textContent).toContain('New folder'));
 f.host.querySelector<HTMLButtonElement>('[aria-label="Minimize window"]')!.click();await wait(()=>expect(f.windows()).toHaveLength(0));f.host.querySelector<HTMLButtonElement>('[data-window-icon]')!.click();await wait(()=>expect(f.windows()[0]?.querySelector('[aria-label="Selected folder"]')?.textContent).toBe('vault'));
 const app=Object.values(f.editor.repository.state.contents).find(c=>c.viewType==='flint-application-block')!;expect(app.payload.metadata).toEqual({});
},15000);
it('keeps a lost completion recoverable in the UI even when the durable journal already says relocated',async()=>{
 const f=await fixture(),a=f.windows()[0];await open(a);await create(a);const id=idOf(a),fetchOriginal=globalThis.fetch;let lose=true;
 vi.stubGlobal('fetch',async(input:any,init:any)=>{const reply=await fetchOriginal(input,init);if(lose&&String(input).endsWith('/vault/relocate')){lose=false;await reply.text();throw Error('lost completion');}return reply;});
 a.querySelector<HTMLButtonElement>('[aria-label="Open vault/note.mutable.json"]')!.click();await wait(()=>expect(button(a,'Refresh').disabled).toBe(false));field(a,'Move destination name','recovered.mutable.json');click(a,'Apply rename / move');await wait(()=>expect(a.textContent).toContain('lost completion'));await wait(()=>expect(button(a,'Recover relocation').disabled).toBe(false));
 expect(f.service.location(id)?.filename).toBe('note.mutable.json');click(a,'Recover relocation');await wait(()=>expect(f.service.location(id)?.filename).toBe('recovered.mutable.json'));expect(await fs.stat(path.join(f.root,'vault/recovered.mutable.json'))).toBeTruthy();
},15000);
it('preserves nested unknown native properties through property editing, Save and fresh Open',async()=>{
 const f=await fixture(),a=f.windows()[0];await open(a);await create(a);const id=idOf(a);
 const doc=Object.values(f.editor.repository.readState().contents).find(c=>(c.payload.metadata as any)?.documentId===id)!,p=Object.values(f.editor.repository.state.placements).find(p=>p.contentKey===doc.key)!;
 f.editor.commands.setPayloadField(p.key,'metadata',{...doc.payload.metadata as any,futureFeature:{values:['opaque',{x:17}]}});
 field(a,'Document title','Preserved');field(a,'Document tags','tag');click(a,'Apply properties');click(a,'Save Document');await wait(()=>expect(a.textContent).toContain('Saved native Document and Markdown'));await wait(()=>expect(button(a,'Refresh').disabled).toBe(false));
 const fresh=f.make(),b=fresh.windows()[0];await open(b);b.querySelector<HTMLButtonElement>('[aria-label="Open vault/note.mutable.json"]')!.click();await wait(()=>expect(idOf(b)).toBe(id));
 const reopened=Object.values(fresh.editor.repository.readState().contents).find(c=>(c.payload.metadata as any)?.documentId===id)!;expect(reopened.payload.metadata).toMatchObject({title:'Preserved',tags:['tag'],futureFeature:{values:['opaque',{x:17}]},documentFormat:{format:'page'}});
},15000);
it('allows an unsaved collision candidate to choose a fresh first-save destination without relocating the existing resource',async()=>{
 const f=await fixture(),a=f.windows()[0];await open(a);await create(a);const original=await fs.readFile(path.join(f.root,'vault/note.mutable.json'),'utf8');
 click(a,'New Document');await wait(()=>expect(a.textContent).toContain('Save blocked'));await wait(()=>expect(button(a,'Refresh').disabled).toBe(false));const candidate=idOf(a);expect(f.service.isCandidate(candidate)).toBe(true);
 click(a,'Files');field(a,'Native filename','retry.mutable.json');click(a,'Save Document');await wait(()=>expect(a.textContent).toContain('Saved native Document and Markdown'));expect(f.service.location(candidate)?.filename).toBe('retry.mutable.json');expect(f.service.isCandidate(candidate)).toBe(false);expect(await fs.readFile(path.join(f.root,'vault/note.mutable.json'),'utf8')).toBe(original);
},15000);
it('relocates a Document containing a native external reference without rewriting its target or saved generation',async()=>{
 const f=await fixture();await fs.copyFile('artifacts/flint-b1.2/c.mutable.json',path.join(f.root,'vault/c.mutable.json'));const a=f.windows()[0];await open(a);a.querySelector<HTMLButtonElement>('[aria-label="Open vault/c.mutable.json"]')!.click();await wait(()=>expect(idOf(a)).toBe('resource-c'));await wait(()=>expect(button(a,'Refresh').disabled).toBe(false));click(a,'Save Document');await wait(()=>expect(a.textContent).toContain('Saved native Document and Markdown'));await wait(()=>expect(button(a,'Refresh').disabled).toBe(false));
 const before=await fs.readFile(path.join(f.root,'vault/c.mutable.json'),'utf8');expect(before).toContain('resource-b');field(a,'Move destination name','reference.mutable.json');click(a,'Apply rename / move');await wait(()=>expect(f.service.location('resource-c')?.filename).toBe('reference.mutable.json'));expect(await fs.readFile(path.join(f.root,'vault/reference.mutable.json'),'utf8')).toBe(before);expect(nativeText(captureNative(f.editor.repository.snapshot(),'resource-c'))).toBe(before);
},15000);
it('reports a vanished location without discarding the live Document or adopting an external same-ID move',async()=>{
 const f=await fixture(),a=f.windows()[0];await open(a);await create(a);const id=idOf(a);field(a,'Document title','Still here');click(a,'Apply properties');
 await fs.rename(path.join(f.root,'vault/note.mutable.json'),path.join(f.root,'externally-moved.mutable.json'));click(a,'Refresh');await wait(()=>expect(a.querySelector('.flint-properties')?.textContent).toContain('Location missing or moved'));
 expect(f.service.location(id)?.filename).toBe('note.mutable.json');expect((a.querySelector('[aria-label="Document title"]') as HTMLInputElement).value).toBe('Still here');expect(a.querySelector('[contenteditable="true"]')).toBeTruthy();expect(nativeText(captureNative(f.editor.repository.snapshot(),id))).toContain('Still here');
 await wait(()=>expect(button(a,'Refresh').disabled).toBe(false));await fs.rename(path.join(f.root,'externally-moved.mutable.json'),path.join(f.root,'vault/externally-moved.mutable.json'));click(a,'Refresh');await wait(()=>expect(a.querySelector('.flint-properties')?.textContent).toContain('Location unverified'));expect(f.service.location(id)?.filename).toBe('note.mutable.json');
},15000);
