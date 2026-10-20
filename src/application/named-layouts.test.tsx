// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { render } from 'solid-js/web';
import { WorkspaceSession } from './workspace-session';
import { WorkspacePresentationView } from './workspace-presentation-view';
import { materializeLocalWorkspace, materializeWorkspace, createWorkspaceSaveBundle } from '../reactive-editor/workspace-manifest';
import { desktopOf, validateManagedContainer } from '../persistence/managed-desktop';
import { PersistenceService } from '../reactive-editor/persistence';
import { saveJsonFile } from '../demo/browser-json-file';
const stops:Array<()=>void>=[];
afterEach(()=>{stops.reverse().splice(0).forEach(f=>f());document.body.replaceChildren();vi.restoreAllMocks();vi.unstubAllGlobals();});
const tick=async()=>{await Promise.resolve();await Promise.resolve();};
const legacy=()=>({id:'workspace',type:'workspace-block',children:['a','b'].map(id=>({id,type:'document-window-block',metadata:{title:id,position:{x:20,y:30},size:{w:600,h:400}},children:[{id:'doc-'+id,type:'document-block',metadata:{documentId:'doc-'+id},children:[{id:'text-'+id,type:'plain-text-block',text:'Initial '+id}]}]}))});
function mount(value:any=legacy(),loaded=false){
 const session=new WorkspaceSession(loaded?value:materializeLocalWorkspace(value),{features:{entityReferences:false}});
 const host=document.body.appendChild(document.createElement('main'));host.dataset.windowWorkArea='';
 stops.push(()=>session.dispose());stops.push(render(()=><WorkspacePresentationView session={session}/>,host));
 const node=(id:string)=>Object.values(session.projection.state.nodes).find(n=>n.payload.id===id)!;
 return {session,editor:session.editor,m:session.windowManager!,node};
}
function d1(){const f=mount();f.m.named.save('Floating');f.m.layout.tile(f.node('b').key,f.node('a').key,'tab');f.m.named.save('Tabbed');return {...f,capture:f.editor.persistence.captureWorkspace({upgrade:true})};}
it('switches arrangement geometry, shell tabs and pinning without changing mounted sessions, selections or tool state',async()=>{
 const f=mount(),a=f.node('a').key,b=f.node('b').key,body=f.editor.mounts.get(f.node('text-a').key)!;
 const input=body.focusElement as HTMLTextAreaElement;input.focus();input.setSelectionRange(1,4,'backward');
 const first=f.m.named.save('Floating');f.m.layout.tile(b,a,'tab');const second=f.m.named.save('Tabbed');
 expect(f.m.named.select(first)).toBe(true);await tick();expect(f.m.layout.isTiled(a)).toBe(false);expect(f.editor.mounts.get(f.node('text-a').key)).toBe(body);
 expect(document.activeElement).toBe(input);expect([input.selectionStart,input.selectionEnd]).toEqual([1,4]);
 expect(f.m.named.select(second)).toBe(true);await tick();expect(f.m.layout.solution().tabs).toHaveLength(1);expect(body.root.isConnected).toBe(true);
 f.m.named.rename(second,'Research');expect(f.m.named.arrangements().map(a=>a.name)).toEqual(['Floating','Research']);expect(()=>f.m.named.save('research')).toThrow(/already/);
 f.m.named.delete(second);expect(f.m.named.active()).toBeUndefined();expect(body.root.isConnected).toBe(true);
});
it('retains later-launched sessions hidden/inert when selecting an earlier arrangement; Reveal adds them back',async()=>{
 const f=mount(),id=f.m.named.save('Before');f.editor.commands.insert({id:'later',type:'window-block',children:[{type:'plain-text-block',text:'Local state'}]},{kind:'at',parentKey:f.editor.repository.state.rootPlacementKey,index:2});await tick();
 const later=f.node('later').key,group=f.m.groups.get(later)!;
 expect(f.m.named.select(id)).toBe(true);await tick();expect(group.isConnected&&group.hidden&&group.inert).toBe(true);expect(f.m.registry.windows[later].mounted).toBe(true);
 f.m.lifecycle.reveal(later);await tick();expect(group.hidden).toBe(false);
});
it('blocks layout selection during modal, pending close and composition before changing geometry',async()=>{
 const f=d1(),id=f.m.named.arrangements()[0].id,tree=f.m.layout.tree();
 const modal=document.createElement('input');f.m.groups.get(f.node('a').key)!.append(modal);const release=f.m.lifecycle.modal(modal,f.node('a').key);
 expect(f.m.named.select(id)).toBe(false);expect(f.m.layout.tree()).toBe(tree);release();
 let done!:(ok:boolean)=>void;const guard=f.m.lifecycle.guard(f.node('a').key,()=>new Promise<boolean>(r=>done=r));const closing=f.editor.closeView(f.node('a').key);
 expect(f.m.named.select(id)).toBe(false);f.m.lifecycle.cancel(f.node('a').key);done(true);await closing;guard();expect(f.m.layout.tree()).toBe(tree);
});
it('requires explicit D1 Save As, round trips arrangements with stable identities and never serializes runtime keys',()=>{
 const f=mount();const old=f.editor.persistence.captureWorkspace({upgrade:true});f.editor.persistence.acknowledgeWorkspaceSave(old);f.m.named.save('Desk');
 expect(()=>f.editor.persistence.captureWorkspace()).toThrow(/Upgrade/);
 const capture=f.editor.persistence.captureWorkspace({upgrade:true}),d=desktopOf(capture.document)!;expect(d.version).toBe(4);expect(d.windows.map(w=>w.restoreKey)).toEqual(desktopOf(old.document)!.windows.map(w=>w.restoreKey));
 expect(JSON.stringify(capture.localValue)).not.toContain(f.node('a').placementKey);
 f.editor.persistence.acknowledgeWorkspaceSave(capture);expect(f.session.dirty()).toBe(false);
 const fresh=mount(capture.localValue);expect(fresh.m.named.arrangements()[0].name).toBe('Desk');const next=fresh.editor.persistence.captureWorkspace();expect(desktopOf(next.document)!.layouts).toEqual(d.layouts);expect(fresh.session.dirty()).toBe(false);
});
it('keeps later arrangement changes dirty after an older save completes, and omits draft slots without touching the live tree',()=>{
 const f=d1();const release=f.m.layout.persistable(f.node('b').key,()=>false);stops.push(release);
 const tree=f.m.layout.tree(),capture=f.editor.persistence.captureWorkspace({upgrade:true}),d=desktopOf(capture.document)!;
 expect(d.layouts![1].windows).toHaveLength(1);expect(f.m.layout.tree()).toBe(tree);
 f.m.named.rename(f.m.named.arrangements()[0].id,'Later');f.editor.persistence.acknowledgeWorkspaceSave(capture);expect(f.session.dirty()).toBe(true);
});
it.each([
 ['duplicate name',(d:any)=>d.layouts[1].name=d.layouts[0].name],
 ['unknown member',(d:any)=>d.layouts[0].windows[0].restoreKey='unknown'],
 ['invalid tree',(d:any)=>d.layouts[1].layout.tree.active='unknown'],
 ['bad bounds',(d:any)=>d.layouts[0].windows[0].bounds.width=0],
 ['unknown selected',(d:any)=>d.activeLayout='missing'],
 ['future format',(d:any)=>d.version=5],
 ['pending operation',(d:any)=>d.layouts[0].pendingReceipt={}],
])('rejects %s before load without mutating the original',(_label,mutate)=>{const f=d1(),value=structuredClone(f.capture.localValue!);mutate(value.root.metadata.workspacePresentation.presentations.desktop);const before=structuredClone(value);expect(()=>materializeLocalWorkspace(value)).toThrow();expect(value).toEqual(before);});
it('preserves unsupported applications and descriptor extensions through placeholder rendering and Save',()=>{
 const f=d1(),value=structuredClone(f.capture.localValue!),d=value.root.metadata.workspacePresentation.presentations.desktop;
 d.views[0].appId='future-app';d.views[0].descriptorVersion=17;d.views[0].resources=[{kind:'future-resource',identifier:'opaque'}];d.views[0].custom={future:true};
 const fresh=mount(value);expect(document.querySelector('[aria-label="Unavailable window"]')?.textContent).toContain('Unsupported');
 expect(desktopOf(fresh.editor.persistence.captureWorkspace().document)!.views[0]).toEqual(d.views[0]);
 fresh.m.named.remove(fresh.node('a').key);const removed=desktopOf(fresh.editor.persistence.captureWorkspace().document)!;expect(removed.views).toHaveLength(1);expect(removed.layouts!.every(a=>a.windows.length===1)).toBe(true);
});
it('loads all-missing server resources as placeholders, preserves references on server Save and rejects a false self-contained local Save',async()=>{
 const f=d1(),refs=['a','b'].map(id=>({documentId:'doc-'+id,source:{kind:'document-store' as const,folder:'.',filename:id+'.json'}}));
 const bundle=await createWorkspaceSaveBundle(f.capture.repository,refs,'workspace',undefined,{root:f.capture.document});
 const loaded=materializeWorkspace(bundle.manifest,new Map());const fresh=mount(loaded,true);expect(document.querySelectorAll('.workspace-document-reference')).toHaveLength(2);
 expect(()=>fresh.editor.persistence.captureWorkspace()).toThrow(/self-contained/);
 const cap=fresh.editor.persistence.captureWorkspace({server:true});const saved=await createWorkspaceSaveBundle(cap.repository,loaded.references,'workspace',undefined,{root:cap.document});
 expect(saved.documents).toEqual([]);expect(Object.values(saved.manifest.documents).every(r=>r.unavailable===true)).toBe(true);expect(validateManagedContainer(saved.manifest)).toBeTruthy();
});
it('rejects anonymous/wrong-identity relinks and cancels stale results after removal or disposal',async()=>{
 const f=d1(),refs=['a','b'].map(id=>({documentId:'doc-'+id,source:{kind:'document-store' as const,folder:'.',filename:id+'.json'}}));
 const bundle=await createWorkspaceSaveBundle(f.capture.repository,refs,'workspace',undefined,{root:f.capture.document});const fresh=mount(materializeWorkspace(bundle.manifest,new Map()),true);
 const response=(document:any)=>new Response(JSON.stringify({Success:true,Data:{document}}));
 vi.stubGlobal('fetch',vi.fn(async()=>response({type:'document-block'})));expect(await fresh.editor.persistence.resolveWorkspaceDocument('doc-a')).toBe(false);
 vi.stubGlobal('fetch',vi.fn(async()=>response({...legacy().children[0].children[0],metadata:{documentId:'wrong'}})));expect(await fresh.editor.persistence.resolveWorkspaceDocument('doc-a')).toBe(false);
 let finish!:(r:Response)=>void;vi.stubGlobal('fetch',vi.fn(()=>new Promise<Response>(r=>finish=r)));const pending=fresh.editor.persistence.resolveWorkspaceDocument('doc-a');fresh.m.named.remove(fresh.node('a').key);finish(response(legacy().children[0].children[0]));expect(await pending).toBe(false);
 vi.stubGlobal('fetch',vi.fn(async()=>response(legacy().children[1].children[0])));expect(await fresh.editor.persistence.resolveWorkspaceDocument('doc-b')).toBe(true);expect(fresh.node('text-b')).toBeTruthy();
});
it('does not acknowledge canceled or failed local writes and refuses in-place D0 to D1 upgrades',async()=>{
 const f=d1(),value=f.capture.localValue;let contents=JSON.stringify(value),pending='';const abort=vi.fn();
 const handle={name:'Desk.json',getFile:async()=>({text:async()=>contents} as File),createWritable:vi.fn(async()=>({write:async(v:any)=>{pending=v;throw Error('disk full');},close:async()=>{contents=pending;},abort:async()=>{abort();}}))};
 await expect(saveJsonFile(value,{suggestedName:'Desk.json',handle,workspace:{expected:value}})).rejects.toThrow('disk full');expect(abort).toHaveBeenCalledOnce();expect(JSON.parse(contents)).toEqual(value);expect(f.session.dirty()).toBe(true);
 const old=mount().editor.persistence.captureWorkspace({upgrade:true}).localValue;contents=JSON.stringify(old);handle.createWritable.mockClear();await expect(saveJsonFile(value,{suggestedName:'Desk.json',handle,workspace:{expected:old}})).rejects.toThrow();expect(handle.createWritable).not.toHaveBeenCalled();
});
it('restores pinned order, normal bounds and minimized/maximized intent with one eligible focus choice',async()=>{
 const f=mount(),a=f.node('a').key,b=f.node('b').key;
 f.editor.commands.setPayloadField(a,'metadata',{title:'a',pinned:true,position:{x:77,y:88},size:{w:650,h:410},state:'minimized'});
 f.editor.commands.setPayloadField(b,'metadata',{title:'b',position:{x:44,y:55},size:{w:640,h:430},state:'maximized'});
 const saved=f.m.named.save('Modes');
 f.editor.commands.setPayloadField(a,'metadata',{title:'a',pinned:false,state:'normal'});f.editor.commands.setPayloadField(b,'metadata',{title:'b',state:'normal'});
 expect(f.m.named.select(saved)).toBe(true);await tick();expect(f.m.registry.windows[a].pinned).toBe(true);expect(f.node('a').payload.metadata).toMatchObject({state:'minimized',position:{x:77,y:88},size:{w:650,h:410}});expect(f.node('b').payload.metadata).toMatchObject({state:'maximized'});expect(f.m.registry.activeWindowId).toBe(b);expect(f.m.registry.windows[a].rank).toBeGreaterThan(f.m.registry.windows[b].rank);
});
it('does no snapshot, restore lookup or layout solving when typing with named arrangements',async()=>{
 const f=d1();await tick();const snapshot=vi.spyOn(f.editor.repository,'snapshot'),lookup=vi.spyOn(f.m.named,'descriptor'),capture=vi.spyOn(f.m.named,'captureInto');
 f.editor.commands.setPayloadField(f.node('text-a').key,'text','Changed');await tick();expect(snapshot).not.toHaveBeenCalled();expect(lookup).not.toHaveBeenCalled();expect(capture).not.toHaveBeenCalled();
});
it('keeps changes made during pending server Save dirty and does not acknowledge cancellation or failed writes',async()=>{
 const f=d1();f.editor.persistence.acknowledgeWorkspaceSave(f.capture);
 for(const id of ['a','b'])f.editor.persistence.registerWorkspaceDocument(f.node('doc-'+id).contentKey,'doc-'+id,'.',id+'.json');
 let finish!:(r:Response)=>void;vi.stubGlobal('fetch',vi.fn(()=>new Promise<Response>(r=>finish=r)));
 const save=f.editor.persistence.saveWorkspace('D1.json',{createOnly:true});await new Promise(r=>setTimeout(r,0));
 f.m.named.rename(f.m.named.arrangements()[0].id,'Newer name');finish(new Response(JSON.stringify({Success:true,Data:{contentHash:'new'}})));expect(await save).toBe(true);expect(f.session.dirty()).toBe(true);
 const abort=new AbortController();const pending=f.editor.persistence.saveWorkspace('D1.json',{signal:abort.signal});await new Promise(r=>setTimeout(r,0));abort.abort();finish(new Response(JSON.stringify({Success:true,Data:{contentHash:'lost'}})));expect(await pending).toBe(false);expect(f.session.dirty()).toBe(true);
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({Success:false,Error:'permission denied'}),{status:403})));expect(await f.editor.persistence.saveWorkspace('D1.json')).toBe(false);expect(f.session.dirty()).toBe(true);
});
it('finishes resolving later resources after an early identity mismatch in a bounded load batch',async()=>{
 const f=d1(),refs=['a','b'].map(id=>({documentId:'doc-'+id,source:{kind:'document-store' as const,folder:'.',filename:id+'.json'}}));
 const bundle=await createWorkspaceSaveBundle(f.capture.repository,refs,'workspace',undefined,{root:f.capture.document});
 const response=(Data:any)=>new Response(JSON.stringify({Success:true,Data}));
 vi.stubGlobal('fetch',vi.fn(async(url:any)=>String(url).includes('loadWorkspace')?response({workspace:bundle.manifest}):String(url).includes('a.json')?response({document:{type:'document-block'}}):response({document:legacy().children[1].children[0]})));
 const loaded=await PersistenceService.loadWorkspace('D1.json');expect(loaded.issues.some(i=>i.documentId==='doc-a'&&i.kind==='identity-mismatch')).toBe(true);expect(loaded.references.find(r=>r.documentId==='doc-b')?.contentKey).toBeTruthy();
});
it('restores a known Ink descriptor from its exact table identity when the presentation reference is missing',async()=>{
 const f=d1(),refs=['a','b'].map(id=>({documentId:'doc-'+id,source:{kind:'document-store' as const,folder:'.',filename:id+'.json'}}));
 const bundle=await createWorkspaceSaveBundle(f.capture.repository,refs,'workspace',undefined,{root:f.capture.document});bundle.manifest.root.children![0].children=[];
 const missing=mount(materializeWorkspace(bundle.manifest,new Map()),true);expect(document.querySelectorAll('.workspace-document-reference')).toHaveLength(2);
 const resolved=mount(materializeWorkspace(bundle.manifest,new Map([['doc-a',legacy().children[0].children[0]]])),true);expect(resolved.node('text-a')).toBeTruthy();
 expect(Object.values(resolved.editor.repository.state.contents).filter(c=>c.viewType==='document-block'&&(c.payload.metadata as any)?.documentId==='doc-a')).toHaveLength(1);
});
it('keeps an explicit latest-format upgrade after Save even before the first named arrangement is created',()=>{
 const f=mount();f.m.layout.tile(f.node('b').key,f.node('a').key,'tab');
 const cap=f.editor.persistence.captureWorkspace({upgrade:true,managedVersion:4});expect(desktopOf(cap.document)!.version).toBe(4);f.editor.persistence.acknowledgeWorkspaceSave(cap);
 expect(desktopOf(f.editor.persistence.captureWorkspace().document)!.version).toBe(4);
});
