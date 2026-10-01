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
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'flint-c1b-'));disposers.push(()=>fs.rm(root,{recursive:true,force:true}));await fs.mkdir(path.join(root,'vault/nested'),{recursive:true});await fs.writeFile(path.join(root,'vault/input.md'),'# Imported\n\n**Bold** text');
 const app=express();app.use('/api/native',createNativeDocumentStoreRouter({root,...options}));const server:any=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});disposers.push(()=>new Promise(r=>server.close(r)));
 vi.stubGlobal('fetch',(input:any,init:any)=>actualFetch(typeof input==='string'&&input.startsWith('/')?`http://127.0.0.1:${server.address().port}${input}`:input,init));
 function make() {
  const editor=new ReactiveEditor(materializeLocalWorkspace({id:crypto.randomUUID(),type:'workspace-block',children:[]}),{features:{compactEditorChrome:false,nativeKnowledge:process.env.P4_FACTS==='1'}});registerApplicationViews(editor);const projection=editor.createView('workspace');disposers.push(()=>editor.dispose());
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
it('searches unmounted native text/title, reports unopened coverage, and navigates with no canonical or History changes',async()=>{
 const f=await fixture(),a=f.windows()[0];await open(a);const one=await documentWithText(f,a,'one.mutable.json','Compass','A 🧭 needle here.');click(a,'Close tab');
 await fs.copyFile('artifacts/flint-b1.2/rich.mutable.json',path.join(f.root,'vault/unopened.mutable.json'));
 expect(f.editor.projections.has(one.view.viewId)).toBe(false);const before=f.editor.repository.snapshot(),history=vi.fn(),views=f.editor.projections.size;
 disposers.push(f.editor.repository.subscribeHistoryChanges(history, error => { throw error; }));await search(a,'🧭');expect(a.textContent).toContain('Incomplete coverage');expect(a.textContent).toContain('unopened');expect(f.editor.projections.size).toBe(views);
 const hits=a.querySelectorAll<HTMLButtonElement>('.flint-search-hit');expect(hits).toHaveLength(1);expect(hits[0].dataset.searchDocument).toBe(one.id);hits[0].click();await wait(()=>expect(idOf(a)).toBe(one.id));await wait(()=>expect(f.editor.focus.state.focusedKey).not.toBe(one.node.key));
 const n=f.editor.node(f.editor.focus.state.focusedKey!)!;expect(n.contentKey).toBe(one.node.contentKey);await wait(()=>expect(f.editor.mounts.get(n.key)?.captureInlineSelection?.()).toEqual({anchor:2,head:3}));expect(f.editor.repository.snapshot()).toEqual(before);expect(history).not.toHaveBeenCalled();
 await search(a,'Compass');expect(a.querySelectorAll('.flint-search-hit')).toHaveLength(1);expect(a.querySelector('.flint-search-hit')?.textContent).toContain('title');
},15000);
it('uses the invoking Window occurrence; simultaneous occurrences never duplicate matches or steal the other selection',async()=>{
 const f=await fixture(),a=f.windows()[0];await open(a);const doc=await documentWithText(f,a,'one.mutable.json','One','needle passage');f.launch();const b=f.windows().find(w=>w!==a)!;await open(b);
 const aNode=doc.node;f.editor.focus.request(aNode.key);f.editor.mounts.get(aNode.key)!.restoreInlineSelection!({anchor:8,head:10});f.editor.selections.setPrimary(aNode.key,aNode.contentKey,aNode.viewId,8,10);
 await search(b,'needle');expect(b.querySelectorAll('.flint-search-hit')).toHaveLength(1);b.querySelector<HTMLButtonElement>('.flint-search-hit')!.click();await wait(()=>expect(idOf(b)).toBe(doc.id));await wait(()=>expect(f.editor.node(f.editor.focus.state.focusedKey!)?.viewId).not.toBe(aNode.viewId));
 const focused=f.editor.node(f.editor.focus.state.focusedKey!)!;expect(b.contains(f.editor.mounts.get(focused.key)!.root)).toBe(true);expect(a.contains(f.editor.mounts.get(aNode.key)!.root)).toBe(true);expect(f.editor.selections.sets[aNode.key].items[0].anchor.boundary.index).toBe(8);
 await search(a,'needle');expect(a.querySelectorAll('.flint-search-hit')).toHaveLength(1);
},15000);
it('uses cell-correct Unicode ranges and never joins text across inline images',async()=>{
 const f=await fixture(),a=f.windows()[0];await open(a);const doc=await documentWithText(f,a,'one.mutable.json','One','A🧭e\u0301 leftRIGHT');
 f.editor.commands.insertInlineImage(doc.node.key,9,{assetId:'inline',src:'image.png',alt:'Picture',status:'ready'});click(a,'Save Document');await wait(()=>expect(a.textContent).toContain('Saved native Document and Markdown'));await wait(()=>expect(button(a,'Refresh').disabled).toBe(false));
 await search(a,'e\u0301');a.querySelector<HTMLButtonElement>('.flint-search-hit')!.click();await wait(()=>expect(f.editor.mounts.get(doc.node.key)!.captureInlineSelection!()).toEqual({anchor:2,head:4}));
 await search(a,'leftRIGHT');expect(a.querySelectorAll('.flint-search-hit')).toHaveLength(0);await search(a,'RIGHT');expect(a.querySelectorAll('.flint-search-hit')).toHaveLength(1);
},15000);
it('creates, follows and removes native references with Undo/Redo; target titles and paths are not identity',async()=>{
 const f=await fixture(),a=f.windows()[0];await open(a);const target=await documentWithText(f,a,'target.mutable.json','Target','Destination');const source=await documentWithText(f,a,'source.mutable.json','Source','Visit the target.');
 f.editor.focus.request(source.node.key);f.editor.mounts.get(source.node.key)!.restoreInlineSelection!({anchor:0,head:5});f.editor.selections.setPrimary(source.node.key,source.node.contentKey,source.node.viewId,0,5);
 click(a,'Link selected text');await wait(()=>expect(a.querySelector('[role="dialog"]')).toBeTruthy());click(a,'Targetvault/target.mutable.json · '+target.id);await wait(()=>expect(a.textContent).toContain('reference created'));
 const property=()=>f.editor.repository.readState().contents[source.node.contentKey].payload.standoffProperties as any[];expect(property()[0]).toMatchObject({type:'codex/block-reference',value:target.id,metadata:{documentId:target.id},start:0,end:4});f.editor.repository.undo();expect(property()??[]).toHaveLength(0);f.editor.repository.redo();expect(property()).toHaveLength(1);
 click(a,'References in this Document');await wait(()=>expect(a.querySelector('.flint-reference')).toBeTruthy());click(a,'Follow reference');await wait(()=>expect(idOf(a)).toBe(target.id));await wait(()=>expect(button(a,'References in this Document').disabled).toBe(false));field(a,'Document title','Renamed target');click(a,'Apply properties');click(a,'Save Document');await wait(()=>expect(a.textContent).toContain('Saved native Document and Markdown'));await wait(()=>expect(button(a,'Refresh').disabled).toBe(false));
 a.querySelector<HTMLButtonElement>('[aria-label="Open vault/target.mutable.json"]')!.click();await wait(()=>expect(button(a,'Refresh').disabled).toBe(false));field(a,'Move destination name','moved.mutable.json');click(a,'Apply rename / move');await wait(()=>expect(f.service.location(target.id)?.filename).toBe('moved.mutable.json'));await wait(()=>expect(button(a,'Refresh').disabled).toBe(false));
 click(a,'Source');click(a,'References in this Document');await wait(()=>expect(a.querySelector('.flint-reference')?.textContent).toContain('Renamed target'));click(a,'Follow reference');await wait(()=>expect(idOf(a)).toBe(target.id));await wait(()=>expect(button(a,'References in this Document').disabled).toBe(false));click(a,'Source');click(a,'References in this Document');await wait(()=>expect(button(a,'Remove reference').disabled).toBe(false));click(a,'Remove reference');expect(property()[0].isDeleted).toBe(true);f.editor.repository.undo();expect(property()[0].isDeleted).not.toBe(true);f.editor.repository.redo();expect(property()[0].isDeleted).toBe(true);
},20000);
it('revalidates a displayed result after filesystem removal without mounting or changing bindings',async()=>{
 const f=await fixture(),a=f.windows()[0];await open(a);const doc=await documentWithText(f,a,'one.mutable.json','One','needle');click(a,'Close tab');await search(a,'needle');const size=f.editor.projections.size;
 await fs.rename(path.join(f.root,'vault/one.mutable.json'),path.join(f.root,'outside.mutable.json'));a.querySelector<HTMLButtonElement>('.flint-search-hit')!.click();await wait(()=>expect(a.textContent).toContain('stale'));expect(f.editor.projections.size).toBe(size);expect(f.service.location(doc.id)?.filename).toBe('one.mutable.json');await search(a,'needle');expect(a.textContent).toContain('missing loaded binding');expect(a.querySelectorAll('.flint-search-hit')).toHaveLength(0);
},15000);
it('cancels delayed queries on edits, Undo branches and query replacement without creating projections',async()=>{
 const f=await fixture(),a=f.windows()[0];await open(a);const doc=await documentWithText(f,a,'one.mutable.json','One','needle');const vaults=createDocumentVaults(f.service),v=await vaults.acquire('vault');disposers.push(()=>{v.release();vaults.dispose();});
 const releases:Array<()=>void>=[];const runner=vi.fn((sources:any,q:string,opts:any)=>new Promise<any>(resolve=>releases.push(()=>resolve(matchSources(sources,q,opts)))));
 const k=new VaultKnowledge(f.editor,f.service,{vault:()=>v,guard:()=>{},active:()=>({documentId:doc.id,projection:doc.view}),navigate:async()=>{}},runner);disposers.push(()=>k.dispose());
 const first=k.search('needle');const failed=expect(first).rejects.toThrow();await wait(()=>expect(releases).toHaveLength(1));f.editor.commands.replaceInlineRange(doc.node.key,0,1,'N');f.editor.repository.undo();f.editor.commands.replaceInlineRange(doc.node.key,0,1,'Z');releases.shift()!();await failed;
 const second=k.search('Z');const cancelled=expect(second).rejects.toThrow();await wait(()=>expect(releases).toHaveLength(1));const third=k.search('nope');await wait(()=>expect(releases).toHaveLength(2));releases.shift()!();releases.shift()!();await cancelled;expect((await third).hits).toHaveLength(0);
 const fourth=k.search('Z');await wait(()=>expect(releases).toHaveLength(1));const cancelledAgain=expect(fourth).rejects.toThrow();k.cancel();releases.shift()!();await cancelledAgain;
},15000);
it('rejects changed locations during a query and reports duplicate discovery without silently rebinding',async()=>{
 const f=await fixture(),a=f.windows()[0];await open(a);const doc=await documentWithText(f,a,'one.mutable.json','One','needle');const vaults=createDocumentVaults(f.service),v=await vaults.acquire('vault');disposers.push(()=>{v.release();vaults.dispose();});let release!:()=>void;
 const k=new VaultKnowledge(f.editor,f.service,{vault:()=>v,guard:()=>{},active:()=>({documentId:doc.id,projection:doc.view}),navigate:async()=>{}},(sources,q,opts)=>new Promise(resolve=>{release=()=>resolve(matchSources(sources,q,opts));}));disposers.push(()=>k.dispose());
 const query=k.search('needle');await wait(()=>expect(release).toBeTypeOf('function'));await fs.rename(path.join(f.root,'vault/one.mutable.json'),path.join(f.root,'vault/elsewhere.mutable.json'));release();const result=await query;expect(result.hits).toHaveLength(1);await expect(k.activate(result.hits[0].id)).rejects.toThrow(/stale/);expect(f.service.location(doc.id)?.filename).toBe('one.mutable.json');
 await fs.copyFile(path.join(f.root,'vault/elsewhere.mutable.json'),path.join(f.root,'vault/duplicate.mutable.json'));await search(a,'needle');expect(a.querySelectorAll('.flint-search-hit')).toHaveLength(0);expect(a.textContent).toContain('Incomplete coverage');
},15000);
it('cancels a picker and rejects source disappearance without changing the target',async()=>{
 const f=await fixture(),a=f.windows()[0];await open(a);const target=await documentWithText(f,a,'target.mutable.json','Target','Target');const source=await documentWithText(f,a,'source.mutable.json','Source','Source');
 const vaults=createDocumentVaults(f.service),v=await vaults.acquire('vault');disposers.push(()=>{v.release();vaults.dispose();});const k=new VaultKnowledge(f.editor,f.service,{vault:()=>v,guard:()=>{},active:()=>({documentId:source.id,projection:source.view}),navigate:async()=>{}});disposers.push(()=>k.dispose());
 const select=()=>{f.editor.focus.request(source.node.key);f.editor.mounts.get(source.node.key)!.restoreInlineSelection!({anchor:0,head:3});return k.selection();};
 let token=select(),choice=(await k.picker(token)).targets.find(t=>t.documentId===target.id)!;k.cancelPicker();await expect(k.createReference(token,choice)).rejects.toThrow(/expired/);token=select();const before=captureNative(f.editor.repository.snapshot(),target.id);f.editor.commands.remove(source.view.state.rootKey);await expect(k.createReference(token,choice)).rejects.toThrow(/stale/);expect(captureNative(f.editor.repository.snapshot(),target.id)).toEqual(before);
},15000);
it('round-trips linked multi-Block references through native Save/Open and removes a mention with ordinary Undo',async()=>{
 const f=await fixture(),a=f.windows()[0];await open(a);const target=await documentWithText(f,a,'target.mutable.json','Target','Destination');f.editor.commands.setPayloadField(target.view.state.rootKey,'id','distinct-target-root');click(a,'Save Document');await wait(()=>expect(a.textContent).toContain('Saved native Document and Markdown'));await wait(()=>expect(button(a,'Refresh').disabled).toBe(false));const source=await documentWithText(f,a,'source.mutable.json','Source','First passage');
 f.editor.commands.insert({id:'second',type:'standoff-editor-block',text:'Second passage'},{kind:'at',parentKey:source.view.state.rootKey,index:1});const second=Object.values(source.view.state.nodes).find(n=>n.payload.id==='second')!;
 f.editor.focus.request(source.node.key);f.editor.crossText.enable(true);f.editor.crossText.set(f.editor.crossText.position(source.node.key,0),f.editor.crossText.position(second.key,6));click(a,'Link selected text');await wait(()=>expect(a.querySelector('[role="dialog"]')).toBeTruthy());click(a,'Targetvault/target.mutable.json · '+target.id);await wait(()=>expect(a.textContent).toContain('reference created'));f.editor.crossText.clear();
 const root=f.editor.repository.readState().contents[source.view.state.nodes[source.view.state.rootKey].contentKey];expect(JSON.stringify(root.payload)).toContain('distinct-target-root');expect(JSON.stringify(root.payload)).toContain(target.id);
 click(a,'References in this Document');await wait(()=>expect(a.querySelectorAll('.flint-reference')).toHaveLength(1));click(a,'Save Document');await wait(()=>expect(a.textContent).toContain('Saved native Document and Markdown'));await wait(()=>expect(button(a,'Refresh').disabled).toBe(false));
 const fresh=f.make(),b=fresh.windows()[0];await open(b);await fresh.service.open({folder:'vault',filename:'target.mutable.json'});b.querySelector<HTMLButtonElement>('[aria-label="Open vault/source.mutable.json"]')!.click();await wait(()=>expect(idOf(b)).toBe(source.id));click(b,'References in this Document');await wait(()=>expect(b.querySelectorAll('.flint-reference')).toHaveLength(1));expect(b.querySelector('.flint-reference')?.textContent).toContain('Target');click(b,'Remove reference');await wait(()=>expect(button(b,'References in this Document').disabled).toBe(false));fresh.editor.repository.undo();click(b,'References in this Document');await wait(()=>expect(button(b,'Follow reference').disabled).toBe(false));click(b,'Follow reference');await wait(()=>expect(idOf(b)).toBe(target.id));
},15000);
it('excludes outside-vault resources and diagnoses nested resources and unsupported hosted text',async()=>{
 const f=await fixture(),a=f.windows()[0];await open(a);const doc=await documentWithText(f,a,'one.mutable.json','One','needle');
 f.editor.commands.insert({id:'opaque',type:'unsupported-widget-block',text:'secret'},{kind:'at',parentKey:doc.view.state.rootKey,index:1});
 await search(a,'secret');expect(a.querySelectorAll('.flint-search-hit')).toHaveLength(0);expect(a.textContent).toContain('unsupported hosted text');
 await fs.mkdir(path.join(f.root,'outside'));await open(a,'outside');await search(a,'needle');expect(a.querySelectorAll('.flint-search-hit')).toHaveLength(0);expect(a.textContent).toContain('0/0 Documents');
 await open(a);
 f.editor.commands.insert({id:'nested-resource',type:'document-block',metadata:{documentId:'nested-resource'},children:[{type:'standoff-editor-block',text:'foreign secret'}]},{kind:'at',parentKey:doc.view.state.rootKey,index:2});
 await search(a,'foreign');expect(a.querySelectorAll('.flint-search-hit')).toHaveLength(0);expect(a.textContent).toContain('separate Document/reference body omitted');
},15000);
it('does not rebuild canonical snapshots or run query matching during ordinary typing after a search',async()=>{
 const f=await fixture(),a=f.windows()[0];await open(a);const doc=await documentWithText(f,a,'one.mutable.json','One','needle');await search(a,'needle');
 const snapshot=vi.spyOn(f.editor.repository,'snapshot');f.editor.commands.replaceInlineRange(doc.node.key,0,0,'new ');expect(snapshot).not.toHaveBeenCalled();expect(a.querySelector<HTMLButtonElement>('.flint-search-hit')!.disabled).toBe(true);snapshot.mockRestore();
},15000);
it('reveals plain UTF-16 text in an inactive nested tab without authoring navigation',async()=>{
 const f=await fixture(),a=f.windows()[0];await open(a);const doc=await documentWithText(f,a,'one.mutable.json','One','ordinary');
 f.editor.commands.insert({id:'inner-tabs',type:'tab-row-block',children:[{id:'inner-first',type:'tab-block',children:[{type:'plain-text-block',text:'first'}]},{id:'inner-second',type:'tab-block',children:[{id:'plain-target',type:'plain-text-block',text:'A 🧭 plain passage'}]}]},{kind:'at',parentKey:doc.view.state.rootKey,index:1});
 await search(a,'plain passage');expect(a.querySelectorAll('.flint-search-hit')).toHaveLength(1);const before=f.editor.repository.snapshot();a.querySelector<HTMLButtonElement>('.flint-search-hit')!.click();await wait(()=>expect(f.editor.node(f.editor.focus.state.focusedKey!)?.payload.id).toBe('plain-target'));const mount=f.editor.mounts.get(f.editor.focus.state.focusedKey!)!;await wait(()=>expect(mount.captureSelection?.()).toMatchObject({start:5,end:18}));expect(f.editor.repository.snapshot()).toEqual(before);
},15000);
