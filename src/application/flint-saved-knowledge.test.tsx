import {webcrypto} from 'node:crypto';
import {fixtureText} from '../qualification/native-knowledge/fixture';
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
import { VaultKnowledge } from './vault-knowledge';
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
 vi.stubGlobal('crypto',webcrypto);
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'flint-c1b-'));disposers.push(()=>fs.rm(root,{recursive:true,force:true}));await fs.mkdir(path.join(root,'vault/nested'),{recursive:true});await fs.writeFile(path.join(root,'vault/input.md'),'# Imported\n\n**Bold** text');
 const app=express();app.use('/api/native',createNativeDocumentStoreRouter({root,...options}));const server:any=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});disposers.push(()=>new Promise(r=>server.close(r)));
 vi.stubGlobal('fetch',(input:any,init:any)=>actualFetch(typeof input==='string'&&input.startsWith('/')?`http://127.0.0.1:${server.address().port}${input}`:input,init));
 function make() {
  const editor=new ReactiveEditor(materializeLocalWorkspace({id:crypto.randomUUID(),type:'workspace-block',children:[]}),{features:{compactEditorChrome:false,nativeKnowledgeSaved:true}});registerApplicationViews(editor);const projection=editor.createView('workspace');disposers.push(()=>editor.dispose());
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
async function savedFixture(options:Parameters<typeof fixture>[0]={}){const f=await fixture(options);for(let i=0;i<3;i++)await fs.writeFile(path.join(f.root,`vault/${i}.mutable.json`),fixtureText(i,3));return f;}
async function readySearch(host:HTMLElement,q='Leonardo') {await wait(async()=>{await search(host,q);expect(host.querySelector('.flint-search-hit')).toBeTruthy();expect(host.textContent).toContain('3/3 Documents available');});}
const canonicalIds=(f:Awaited<ReturnType<typeof fixture>>)=>Object.values(f.editor.repository.state.contents).filter(c=>c.viewType==='document-block').map(c=>(c.payload.metadata as any)?.documentId).filter(id=>id?.startsWith('resource-'));
it('progressively searches saved resources without admission, then opens only the selected source in the invoking Window',async()=>{
 const f=await savedFixture(),a=f.windows()[0];await open(a);const history=vi.fn();disposers.push(f.editor.repository.subscribeHistoryChanges(history,()=>{}));
 await readySearch(a,'Leonardo');expect(a.textContent).toContain('3/3 Documents available');expect(canonicalIds(f)).toEqual([]);expect(history).not.toHaveBeenCalled();expect(f.service.knowledgeBindings()).toHaveLength(0);
 const prior=idOf(a);f.launch();const b=f.windows().find(w=>w!==a)!;await open(b);await readySearch(b,'Leonardo');const hit=b.querySelector<HTMLButtonElement>('[data-search-document="resource-1"]')!;expect(hit).toBeTruthy();hit.click();
 await wait(()=>expect(idOf(b)).toBe('resource-1'));await wait(()=>expect(f.editor.focus.state.focusedKey).toBeTruthy());
 expect(canonicalIds(f)).toEqual(['resource-1']);expect(f.service.knowledgeBindings().map(b=>b.resourceId)).toEqual(['resource-1']);expect(idOf(a)).toBe(prior);
 await wait(()=>{const focused=f.editor.node(f.editor.focus.state.focusedKey!)!;expect(focused.payload.id).toBe('resource-1-p0');expect(b.contains(f.editor.mounts.get(focused.key)!.root)).toBe(true);expect(f.editor.mounts.get(focused.key)!.captureInlineSelection?.()).toEqual({anchor:0,head:8});});
 await readySearch(a,'Leonardo');expect(a.querySelectorAll('[data-search-document="resource-1"]')).toHaveLength(12);
},30000);
it('saved backlinks open and revalidate the logical mention rather than returning an unopened-source error',async()=>{
 const f=await savedFixture(),a=f.windows()[0];await open(a);a.querySelector<HTMLButtonElement>('[aria-label="Open vault/0.mutable.json"]')!.click();await wait(()=>expect(idOf(a)).toBe('resource-0'));click(a,'Backlinks');
 await wait(()=>expect(a.querySelector('.flint-backlink[data-backlink-source="resource-2"]')).toBeTruthy());expect(canonicalIds(f)).toEqual(['resource-0']);
 a.querySelector<HTMLButtonElement>('.flint-backlink[data-backlink-source="resource-2"]')!.click();await wait(()=>expect(idOf(a)).toBe('resource-2'));await wait(()=>expect(f.editor.mounts.get(f.editor.focus.state.focusedKey!)?.captureInlineSelection?.()).toEqual({anchor:9,head:16}));
 expect(canonicalIds(f).sort()).toEqual(['resource-0','resource-2']);
},30000);
it.each(['changed bytes','duplicate','external move','removed'])('rejects a saved result after %s without admission or binding',async change=>{
 const f=await savedFixture(),a=f.windows()[0];await open(a);await readySearch(a);const hit=a.querySelector<HTMLButtonElement>('[data-search-document="resource-1"]')!;
 const file=path.join(f.root,'vault/1.mutable.json');if(change==='changed bytes')await fs.writeFile(file,fixtureText(1,3).replace('Leonardo','Modified'));if(change==='duplicate')await fs.copyFile(file,path.join(f.root,'vault/copy.mutable.json'));if(change==='external move')await fs.rename(file,path.join(f.root,'vault/moved.mutable.json'));if(change==='removed')await fs.unlink(file);
 hit.click();await wait(()=>expect(a.querySelector('.flint-knowledge')?.textContent).toMatch(/stale|changed|incomplete|missing/i));expect(canonicalIds(f)).toEqual([]);expect(f.service.knowledgeBindings()).toHaveLength(0);
},30000);
it('checks bytes returned by Open before admission and preserves a read-only source',async()=>{
 let root='',change=false;const f=await savedFixture({readOnly:true,fault:async stage=>{if(change&&stage==='open-native-read'){change=false;await fs.writeFile(path.join(root,'vault/1.mutable.json'),fixtureText(1,3).replace('Leonardo','Modified'));}}});root=f.root;
 const a=f.windows()[0];await open(a);await readySearch(a);change=true;a.querySelector<HTMLButtonElement>('[data-search-document="resource-1"]')!.click();await wait(()=>expect(a.textContent).toMatch(/changed while opening|Selected native.*changed/));expect(canonicalIds(f)).toEqual([]);expect(f.service.knowledgeBindings()).toHaveLength(0);
},30000);
it('read-only saved activation succeeds and subsequent dirty live semantics suppress the saved generation',async()=>{
 const f=await savedFixture({readOnly:true}),a=f.windows()[0];await open(a);await readySearch(a);a.querySelector<HTMLButtonElement>('[data-search-document="resource-0"]')!.click();await wait(()=>expect(idOf(a)).toBe('resource-0'));await wait(()=>expect(a.textContent).toContain('read-only'));
 const view=[...f.editor.projections.values()].find(p=>p!==f.projection&&(p.state.nodes[p.state.rootKey].payload.metadata as any)?.documentId==='resource-0')!,node=Object.values(view.state.nodes).find(n=>n.payload.id==='resource-0-p0')!;
 f.editor.commands.replaceInlineRange(node.key,0,8,'LIVE ONLY');await readySearch(a,'LIVE ONLY');expect(a.querySelectorAll('[data-search-document="resource-0"]')).toHaveLength(1);
 expect(await fs.readFile(path.join(f.root,'vault/0.mutable.json'),'utf8')).not.toContain('LIVE ONLY');
},30000);
it('a duplicate introduced while native Open is awaiting its response cannot be admitted',async()=>{
 let root='',change=false;const f=await savedFixture({fault:async stage=>{if(change&&stage==='open-native-read'){change=false;await fs.copyFile(path.join(root,'vault/1.mutable.json'),path.join(root,'vault/copy.mutable.json'));}}});root=f.root;const a=f.windows()[0];await open(a);await readySearch(a);change=true;a.querySelector<HTMLButtonElement>('[data-search-document="resource-1"]')!.click();await wait(()=>expect(a.textContent).toMatch(/activation is stale|incomplete/i));expect(canonicalIds(f)).toEqual([]);expect(f.service.knowledgeBindings()).toHaveLength(0);
},30000);
it('an unrelated edit while selected Open is in flight cannot receive a fresh navigation ticket',async()=>{
 let entered!:()=>void,release!:()=>void,hold=false;const start=new Promise<void>(r=>entered=r),gate=new Promise<void>(r=>release=r);
 const f=await savedFixture({fault:async stage=>{if(hold&&stage==='open-native-read'){hold=false;entered();await gate;}}}),a=f.windows()[0];await open(a);await readySearch(a);hold=true;
 a.querySelector<HTMLButtonElement>('[data-search-document="resource-1"]')!.click();await start;
 const view=[...f.editor.projections.values()].find(p=>p!==f.projection&&Object.values(p.state.nodes).some(n=>n.viewType==='standoff-editor-block'))!,node=Object.values(view.state.nodes).find(n=>n.viewType==='standoff-editor-block')!;f.editor.commands.replaceInlineRange(node.key,0,0,'local edit');release();
 await wait(()=>expect(a.textContent).toContain('Selected activation is stale'));expect(canonicalIds(f)).toEqual([]);expect(f.service.knowledgeBindings()).toHaveLength(0);
},30000);
it('selected Open retains the existing owned-external dependency/ownership admission guard',async()=>{
 const f=await fixture(),a=f.windows()[0];const owner=JSON.parse(await fs.readFile('artifacts/flint-b1.2/a.mutable.json','utf8')),conflict=JSON.parse(await fs.readFile('artifacts/flint-b1.2/c.mutable.json','utf8'));
 conflict.document.version=2;const edge=owner.document.blocks.find((b:any)=>b.id==='a').children.find((p:any)=>p.kind==='owned'&&p.target.kind==='external');conflict.document.blocks.find((b:any)=>b.id==='c').children.push({...edge,placementId:'c-also-owns-b'});
 await fs.writeFile(path.join(f.root,'vault/a.mutable.json'),JSON.stringify(owner));await fs.writeFile(path.join(f.root,'vault/c.mutable.json'),JSON.stringify(conflict));await open(a);
 const prior=idOf(a);await f.service.open({folder:'vault',filename:'a.mutable.json'});
 await wait(async()=>{await search(a,'Document c');expect(a.querySelector('[data-search-document="resource-c"]')).toBeTruthy();});const before=f.editor.repository.snapshot();
 a.querySelector<HTMLButtonElement>('[data-search-document="resource-c"]')!.click();await wait(()=>expect(a.textContent).toMatch(/multiple semantic owners/i));expect(f.editor.repository.snapshot()).toEqual(before);expect(f.service.location('resource-c')).toBeUndefined();expect(idOf(a)).toBe(prior);
},30000);
