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
import { matchSources } from '../runtime/search-matching';
import { CanonicalBacklinks } from './canonical-backlinks';
import { createDocumentVaults } from './document-vault';
import { captureNative } from '../persistence/native-resource';
execFileSync(process.execPath,['scripts/build-relocation-helper.mjs']);
const disposers:Array<()=>any>=[], actualFetch=globalThis.fetch;
afterEach(async()=>{for(const f of disposers.splice(0).reverse())await f();document.body.replaceChildren();localStorage.clear();vi.unstubAllGlobals();});
const wait=(f:()=>void)=>vi.waitFor(f,{timeout:6000,interval:20});
const button=(host:ParentNode,label:string)=>{if(label==='Files'||label==='Close tab'){const menu=host.querySelector<HTMLButtonElement>('[aria-label="Flint application menu"]')!;if(menu.getAttribute('aria-expanded')!=='true')menu.click();}const b=[...host.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent===label);expect(b,`button ${label}`).toBeTruthy();return b!;};
const click=(host:ParentNode,label:string)=>{const b=button(host,label);expect(b.disabled,`${label} enabled`).toBe(false);b.click();};
const field=(host:ParentNode,label:string,value:string)=>{const input=host.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)!;expect(input,label).toBeTruthy();input.value=value;input.dispatchEvent(new Event(input.tagName==='SELECT'?'change':'input',{bubbles:true}));};
async function fixture(options:{readOnly?:boolean;fault?:(stage:string)=>Promise<void>}={}) {
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'flint-c3-'));disposers.push(()=>fs.rm(root,{recursive:true,force:true}));await fs.mkdir(path.join(root,'vault/nested'),{recursive:true});await fs.writeFile(path.join(root,'vault/input.md'),'# Imported\n\n**Bold** text');
 const app=express();app.use('/api/native',createNativeDocumentStoreRouter({root,...options}));const server:any=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});disposers.push(()=>new Promise(r=>server.close(r)));
 vi.stubGlobal('fetch',(input:any,init:any)=>actualFetch(typeof input==='string'&&input.startsWith('/')?`http://127.0.0.1:${server.address().port}${input}`:input,init));
 function make() {
  const editor=new ReactiveEditor(materializeLocalWorkspace({id:crypto.randomUUID(),type:'workspace-block',children:[]}),{features:{compactEditorChrome:false}});registerApplicationViews(editor);const projection=editor.createView('workspace');disposers.push(()=>editor.dispose());
  const launch=()=>editor.commandRegistry.execute('flint.open',{targetKey:projection.state.rootKey,args:undefined});launch();
  const host=document.body.appendChild(document.createElement('div'));disposers.push(render(()=><ReactiveTreeView editor={editor} projection={projection}/>,host));
  const windows=()=>[...host.querySelectorAll<HTMLElement>('.flint-application')];
  return {editor,projection,host,windows,launch,service:nativeDocumentSession(editor)};
 }
 vi.stubGlobal('Worker',class {constructor(url:URL){if(!url.pathname.includes('search.worker'))throw new Error('Only the search worker is simulated in this test');}onmessage?: (e:any)=>void;onerror?:()=>void;live=true;terminate(){this.live=false;}postMessage(data:any){setTimeout(()=>{if(this.live)this.onmessage?.({data:{results:matchSources(data.sources,data.query,data.options)}});},0);}});
 const f=make();return {...f,root,make};
}
async function open(host:ParentNode,root='vault') {field(host,'Vault directory',root);click(host,'Open Vault');await wait(()=>expect(host.querySelector('[aria-label="Selected folder"]')?.textContent).toBe(root));await wait(()=>expect(button(host,'Open Vault').disabled).toBe(false));}
async function create(host:ParentNode,name='note.mutable.json',title='A title') {field(host,'New Document filename',name);field(host,'New Document title',title);click(host,'New Document');await wait(()=>expect(host.textContent).toContain('Saved native Document and Markdown'));await wait(()=>expect(host.querySelector(`[aria-label="Open vault/${name}"]`)).toBeTruthy());await wait(()=>expect(button(host,'New Document').disabled).toBe(false));}
const idOf=(host:ParentNode)=>host.querySelector('[data-flint-property="id"]')!.textContent!;
async function documentWithText(f:Awaited<ReturnType<typeof fixture>>,host:HTMLElement,name:string,title:string,text:string) {
 await create(host,name,title);const id=idOf(host),view=[...f.editor.projections.values()].find(p=>p!==f.projection&&(p.state.nodes[p.state.rootKey].payload.metadata as any)?.documentId===id)!;
 const node=Object.values(view.state.nodes).find(n=>n.viewType==='standoff-editor-block')!;f.editor.commands.replaceInlineRange(node.key,0,0,text);click(host,'Save Document');await wait(()=>expect(host.textContent).toContain('Saved native Document and Markdown'));await wait(()=>expect(button(host,'Refresh').disabled).toBe(false));return {id,view,node};
}
const search=async(host:HTMLElement,q:string)=>{field(host,'Search vault',q);click(host,'Search vault');await wait(()=>expect(host.textContent).toMatch(/results ·/));};
it('follows a live backlink in the invoking Window and refreshes reference removal/Undo without authoring navigation',async()=>{
 const f=await fixture(),a=f.windows()[0];await open(a);const target=await documentWithText(f,a,'target.mutable.json','Target','Destination');const source=await documentWithText(f,a,'source.mutable.json','Source','Read 🧭 here.');
 f.editor.focus.request(source.node.key);f.editor.mounts.get(source.node.key)!.restoreInlineSelection!({anchor:5,head:6});click(a,'Link selected text');await wait(()=>expect(a.querySelector('[role="dialog"]')).toBeTruthy());a.querySelector<HTMLButtonElement>('[aria-label="Reference Target"]')!.click();await wait(()=>expect(a.textContent).toContain('reference created'));
 f.launch();const b=f.windows().find(w=>w!==a)!;await open(b);b.querySelector<HTMLButtonElement>('[aria-label="Open vault/target.mutable.json"]')!.click();await wait(()=>expect(idOf(b)).toBe(target.id));await wait(()=>expect(button(b,'Refresh').disabled).toBe(false));click(b,'Backlinks');await wait(()=>expect(b.querySelectorAll('.flint-backlink')).toHaveLength(1));
 const before=f.editor.repository.snapshot(),history=vi.fn();disposers.push(f.editor.repository.subscribeHistoryChanges(history,()=>{}));
 b.querySelector<HTMLButtonElement>('.flint-backlink')!.click();await wait(()=>expect(idOf(b)).toBe(source.id));await wait(()=>expect(b.contains(f.editor.mounts.get(f.editor.focus.state.focusedKey!)?.root??null)).toBe(true));const focused=f.editor.node(f.editor.focus.state.focusedKey!)!;await wait(()=>expect(f.editor.mounts.get(focused.key)!.captureInlineSelection!()).toEqual({anchor:5,head:6}));expect(f.editor.repository.snapshot()).toEqual(before);expect(history).not.toHaveBeenCalled();expect(idOf(a)).toBe(source.id);
 click(b,'Target');await wait(()=>expect(b.querySelector<HTMLButtonElement>('.flint-backlink')?.disabled).toBe(false));click(a,'References');click(a,'References in this Document');await wait(()=>expect(button(a,'Remove reference').disabled).toBe(false));click(a,'Remove reference');await wait(()=>expect(b.querySelector<HTMLButtonElement>('.flint-backlink')?.disabled??true).toBe(true));await wait(()=>expect(b.querySelectorAll('.flint-backlink')).toHaveLength(0));f.editor.repository.undo();await wait(()=>expect(b.querySelectorAll('.flint-backlink')).toHaveLength(1));f.editor.repository.redo();await wait(()=>expect(b.querySelectorAll('.flint-backlink')).toHaveLength(0));
 click(b,'Properties');expect(b.querySelector('[aria-label="Document backlinks"]')).toBeNull();
},20000);
it('refreshes title and binding labels, preserves no-tab source and reports unopened coverage',async()=>{
 const f=await fixture(),a=f.windows()[0];await open(a);const target=await documentWithText(f,a,'target.mutable.json','Target','Destination');const source=await documentWithText(f,a,'source.mutable.json','Source','Visit target');
 f.editor.linkedAnnotations.createBatch([[f.editor.textRanges.snapshot(source.node.key,0,5)]],'codex/block-reference',target.id,{documentId:target.id},f.editor.repository.state.revision,'Reference');click(a,'Save Document');await wait(()=>expect(a.textContent).toContain('Saved native Document and Markdown'));await wait(()=>expect(button(a,'Refresh').disabled).toBe(false));
 field(a,'Document title','New source title');click(a,'Apply properties');a.querySelector<HTMLButtonElement>('[aria-label="Open vault/source.mutable.json"]')!.click();await wait(()=>expect(button(a,'Refresh').disabled).toBe(false));field(a,'Move destination name','moved.mutable.json');click(a,'Apply rename / move');await wait(()=>expect(f.service.location(source.id)?.filename).toBe('moved.mutable.json'));await wait(()=>expect(button(a,'Refresh').disabled).toBe(false));click(a,'Close tab');click(a,'Target');await fs.copyFile('artifacts/flint-b1.2/rich.mutable.json',path.join(f.root,'vault/unopened.mutable.json'));click(a,'Backlinks');await wait(()=>expect(a.querySelector('.flint-backlink')?.textContent).toContain('New source title'));expect(a.querySelector('.flint-backlink')?.textContent).toContain('vault/moved.mutable.json');expect(a.textContent).toContain('Incomplete coverage');expect(f.editor.projections.has(source.view.viewId)).toBe(false);
 await fs.rename(path.join(f.root,'vault/moved.mutable.json'),path.join(f.root,'outside.mutable.json'));a.querySelector<HTMLButtonElement>('.flint-backlink')!.click();await wait(()=>expect(a.textContent).toContain('stale'));expect(idOf(a)).toBe(target.id);expect(f.service.location(source.id)?.filename).toBe('moved.mutable.json');
},20000);
