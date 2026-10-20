// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { render } from 'solid-js/web';
import { createRoot, createEffect } from 'solid-js';
import { WorkspaceSession } from './workspace-session';
import { WorkspacePresentationView } from './workspace-presentation-view';
import { materializeLocalWorkspace, createWorkspaceSaveBundle } from '../reactive-editor/workspace-manifest';
import { desktopOf, validateManagedContainer } from '../persistence/managed-desktop';
import { entries, LayoutSolver } from '../runtime/window-layout';

const cleanup:Array<()=>void>=[];
afterEach(()=>{cleanup.splice(0).reverse().forEach(stop=>stop());document.body.replaceChildren();vi.restoreAllMocks();});
const tick=async()=>{await Promise.resolve();await Promise.resolve();};
function mount(value:any={id:'workspace',type:'workspace-block',children:[
  {id:'a',type:'window-block',metadata:{title:'A',size:{w:350,h:400}},children:[{id:'text-a',type:'plain-text-block',text:'Editable A'}]},
  {id:'b',type:'window-block',metadata:{title:'B',size:{w:350,h:400}},children:[{id:'text-b',type:'plain-text-block',text:'Editable B'}]},
]},enabled=true){
 const session=new WorkspaceSession(materializeLocalWorkspace(value),{features:{mutableWindowManager:enabled,entityReferences:false}});
 const host=document.body.appendChild(document.createElement('main'));host.dataset.windowWorkArea='';host.className='workspace-demo';
 cleanup.push(()=>session.dispose());cleanup.push(render(()=><WorkspacePresentationView session={session}/>,host));
 const node=(id:string)=>Object.values(session.projection.state.nodes).find(n=>n.payload.id===id)!;
 const input=(id:string)=>session.editor.mounts.get(node('text-'+id).key)!.focusElement as HTMLTextAreaElement;
 return {session,manager:session.windowManager!,layout:session.windowManager?.layout!,editor:session.editor,node,input,host};
}
it('retains exact mounted sessions, native selections and owned tools across split, tabs and floating',async()=>{
 const f=mount(),a=f.node('a').key,b=f.node('b').key,input=f.input('a'),mountHandle=f.editor.mounts.get(f.node('text-a').key);
 const stop=f.editor.panels.register({type:'c-tool',view:()=><input aria-label="C tool"/>});cleanup.push(stop);
 f.editor.overlays.open({ownerKey:f.node('text-a').key,viewType:'c-tool',anchor:{x:1,y:1}});await tick();
 const tool=document.querySelector<HTMLInputElement>('[aria-label="C tool"]')!;tool.value='retained query';
 input.focus();input.setSelectionRange(2,7,'backward');const revision=f.editor.repository.state.revision;
 f.manager.lifecycle.minimize(a);f.manager.lifecycle.reveal(a);
 const afterRestore=f.editor.repository.state.revision;
 expect(f.layout.tile(b,a,'right')).toBe(true);expect(f.layout.solution().dividers).toHaveLength(1);
 expect(f.layout.tile(b,a,'tab')).toBe(true);await tick();
 expect(f.manager.groups.get(a)!.hidden).toBe(true);expect(f.manager.registry.windows[a]).toMatchObject({mounted:true,visible:false,active:false});
 expect(tool.isConnected).toBe(true);expect(tool.closest<HTMLElement>('.mwm-surface')!.hidden).toBe(true);
 f.manager.lifecycle.reveal(a);await tick();expect(document.activeElement).toBe(input);expect([input.selectionStart,input.selectionEnd,input.selectionDirection]).toEqual([2,7,'backward']);
 expect(f.layout.float(a)).toBe(true);await tick();expect(f.editor.mounts.get(f.node('text-a').key)).toBe(mountHandle);expect(tool.value).toBe('retained query');
 expect(f.editor.repository.state.revision).toBe(afterRestore);expect(f.session.dirty()).toBe(true);
});
it('previews and cancels divider changes atomically, commits once, and supports independent layout undo/redo',()=>{
 const f=mount(),a=f.node('a').key,b=f.node('b').key;
 expect(f.layout.tile(b,a,'right')).toBe(true);const tree=f.layout.tree(),revision=f.layout.revision(),repo=f.editor.repository.state.revision;
 const id=f.layout.solution().dividers[0].id;expect(f.layout.beginDivider(id)).toBe(true);f.layout.divider(id,.65);
 expect(f.layout.tree()).toBe(tree);expect(f.layout.solution().dividers[0].ratio).toBeCloseTo(.65,2);
 expect(()=>f.editor.persistence.captureWorkspace({upgrade:true})).toThrow(/Finish or cancel/);
 f.layout.cancel();expect(f.layout.solution().dividers[0].ratio).toBe(.5);expect(f.layout.revision()).toBe(revision);
 f.layout.beginDivider(id);f.layout.commitDivider();expect(f.layout.dividerActive()).toBe(false);expect(f.layout.revision()).toBe(revision);
 f.layout.beginDivider(id);f.layout.divider(id,.65);f.layout.commitDivider();expect(f.layout.revision()).toBe(revision+1);expect(f.layout.tree()).not.toBe(tree);
 expect(f.layout.undo()).toBe(true);expect(f.layout.tree()).toBe(tree);expect(f.layout.redo()).toBe(true);expect(f.layout.solution().dividers[0].ratio).toBeCloseTo(.65,2);
 expect(f.editor.repository.state.revision).toBe(repo);
});
it('rejects unsatisfiable new splits without changing membership, geometry or resources',()=>{
 const f=mount(),a=f.node('a').key,b=f.node('b').key;
 cleanup.push(f.layout.register(a,{minimum:()=>({width:900,height:400}),mode:()=> 'normal',pinned:()=>false,viewport:false}));
 expect(f.layout.tile(b,a,'right')).toBe(false);expect(f.layout.tree()).toBeUndefined();expect(f.layout.notice()).toMatch(/shell tab/);
 expect(f.layout.tile(b,a,'tab')).toBe(true);
});
it('keeps minimized and maximized slots, collapses only accepted closes, and restores surviving focus',async()=>{
 const f=mount(),a=f.node('a').key,b=f.node('b').key;
 f.layout.tile(b,a,'right');const tree=f.layout.tree();f.manager.lifecycle.minimize(b);expect(f.layout.tree()).toBe(tree);expect(f.layout.solution().rectangles[f.node('a').placementKey].width).toBe(f.manager.geometry.bounds().width);
 f.manager.lifecycle.reveal(b);expect(f.layout.solution().dividers).toHaveLength(1);
 f.manager.maximize(b);expect(f.layout.tree()).toBe(tree);expect(f.layout.covered()).toBe(true);
 f.manager.lifecycle.activate(a);expect(f.layout.covered()).toBe(false);
 f.manager.lifecycle.activate(b);expect(f.layout.covered()).toBe(true);f.manager.maximize(b);
 const guard=f.manager.lifecycle.guard(b,()=>false);await f.editor.closeView(b);expect(f.layout.tree()).toBe(tree);guard();
 await f.editor.closeView(b);await tick();expect(entries(f.layout.tree())).toEqual([f.node('a').placementKey]);expect(f.input('a').isConnected).toBe(true);
});
it('blocks transitions during owner/workspace modal, IME composition and pending close; cancellation leaves the tree unchanged',async()=>{
 const f=mount(),a=f.node('a').key,b=f.node('b').key;f.layout.tile(b,a,'right');const tree=f.layout.tree();
 const modal=f.manager.groups.get(a)!.appendChild(document.createElement('input'));let release=f.manager.lifecycle.modal(modal,a);
 expect(f.layout.tile(b,a,'tab')).toBe(false);release();release=f.manager.lifecycle.modal(modal);expect(f.layout.float(a)).toBe(false);release();modal.remove();
 const input=f.input('a');input.focus();input.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));expect(f.layout.tile(b,a,'tab')).toBe(false);input.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true}));
 let finish!:(value:boolean)=>void;release=f.manager.lifecycle.guard(a,()=>new Promise<boolean>(resolve=>finish=resolve));const closing=f.editor.closeView(a);
 expect(f.layout.tile(b,a,'tab')).toBe(false);f.manager.lifecycle.cancel(a);finish(true);await closing;release();expect(f.layout.tree()).toBe(tree);
 f.layout.tile(b,a,'tab');f.manager.lifecycle.reveal(a);
 const dialog=f.manager.groups.get(a)!.appendChild(document.createElement('input'));release=f.manager.lifecycle.modal(dialog,a);
 const revision=f.editor.repository.state.revision;f.manager.lifecycle.reveal(b);
 expect(f.layout.hidden(b)).toBe(true);expect(f.editor.repository.state.revision).toBe(revision);release();dialog.remove();
});
it('detaches pinned windows and rejoins a valid nearby slot on unpin without replacing the body',()=>{
 const f=mount(),a=f.node('a').key,b=f.node('b').key,input=f.input('b');f.layout.tile(b,a,'tab');
 f.editor.commands.setPayloadField(b,'metadata',{title:'B',pinned:true});expect(f.layout.isTiled(b)).toBe(false);expect(f.manager.registry.windows[b].pinned).toBe(true);
 f.editor.commands.setPayloadField(b,'metadata',{title:'B',pinned:false});expect(f.layout.isTiled(b)).toBe(true);expect(f.manager.registry.windows[b].pinned).toBe(false);expect(f.input('b')).toBe(input);
});
it('does no layout solve, snapshot, ownership lookup or persistence during ordinary typing in a tiled window',async()=>{
 const f=mount();f.layout.tile(f.node('b').key,f.node('a').key,'right');await tick();
 const solve=vi.spyOn(LayoutSolver.prototype,'solve'),snapshot=vi.spyOn(f.editor.repository,'snapshot'),ownership=vi.spyOn(f.manager,'ownerForNode');
 f.editor.commands.setPayloadField(f.node('text-a').key,'text','Edited once');await tick();expect(solve).not.toHaveBeenCalled();expect(snapshot).not.toHaveBeenCalled();expect(ownership).not.toHaveBeenCalled();
});
it('round trips the C tree in the existing local JSON container with stable D0 identities and fresh runtime IDs',()=>{
 const f=mount();const d0=f.editor.persistence.captureWorkspace({upgrade:true});f.editor.persistence.acknowledgeWorkspaceSave(d0);
 const original=desktopOf(d0.document)!;f.layout.tile(f.node('b').key,f.node('a').key,'tab');
 const capture=f.editor.persistence.captureWorkspace(),value=capture.localValue as any,desktop=desktopOf(capture.document)!;
 expect(value.schemaVersion).toBe(2);expect(desktop.version).toBe(3);expect(desktop.windows.map(w=>w.restoreKey)).toEqual(original.windows.map(w=>w.restoreKey));expect(desktop.views).toEqual(original.views);
 expect(()=>validateManagedContainer(value)).not.toThrow();const fresh=mount(value);expect(fresh.layout.solution().tabs).toHaveLength(1);expect(desktopOf(fresh.editor.persistence.captureWorkspace().document)!.layout).toEqual(desktop.layout);
 expect(fresh.node('a').key).not.toBe(f.node('a').key);expect(fresh.session.dirty()).toBe(false);
});
it('refuses lossy legacy saves, keeps stale captures dirty and omits only non-restorable draft slots from detached saves',()=>{
 const f=mount(),a=f.node('a').key,b=f.node('b').key;f.layout.tile(b,a,'right');expect(()=>f.editor.persistence.captureWorkspace()).toThrow(/Upgrade/);
 const before=f.layout.tree();cleanup.push(f.layout.persistable(b,()=>false));const capture=f.editor.persistence.captureWorkspace({upgrade:true});
 expect(entries(desktopOf(capture.document)!.layout.tree)).toHaveLength(1);expect(f.layout.tree()).toBe(before);expect(f.layout.notice()).toMatch(/drafts/);
 f.layout.tile(b,a,'tab');f.editor.persistence.acknowledgeWorkspaceSave(capture);expect(f.session.dirty()).toBe(true);
 const saved=f.editor.persistence.captureWorkspace();f.editor.persistence.acknowledgeWorkspaceSave(saved);expect(f.session.dirty()).toBe(false);
});
it('keeps server manifests external and rejects malformed/future layout data before mounting',async()=>{
 const f=mount();f.layout.tile(f.node('b').key,f.node('a').key,'right');const capture=f.editor.persistence.captureWorkspace({upgrade:true});
 const bundle=await createWorkspaceSaveBundle(capture.repository,[],'workspace-id',undefined,{root:capture.document});expect(bundle.documents).toEqual([]);expect((bundle.manifest as any).schemaVersion).toBe(2);expect(desktopOf((bundle.manifest as any).root)!.version).toBe(3);
 for(const mutate of [(d:any)=>d.version=99,(d:any)=>d.layout.version=99,(d:any)=>d.layout.tree.ratio=0,(d:any)=>d.layout.floating.push(d.windows[0].restoreKey),(d:any)=>d.layout.tree.first.entries=['missing']]){
  const bad=structuredClone(capture.localValue) as any;mutate(bad.root.metadata.workspacePresentation.presentations.desktop);expect(()=>materializeLocalWorkspace(bad)).toThrow();
 }
 expect(f.input('a').isConnected).toBe(true);
});
it('preserves exclusive legacy fallback and gates shell layout outside desktop presentation',()=>{
 const legacy=mount(undefined,false);expect(legacy.manager).toBeUndefined();expect(legacy.host.querySelector('.mwm-layout-chrome')).toBeNull();
 const f=mount();f.layout.setEnabled(false);expect(f.layout.snap(f.node('a').key,'left')).toBe(false);expect(f.host.querySelector<HTMLElement>('.mwm-layout-chrome')!.hidden).toBe(true);
});
it('reverses snap normalization of maximized/minimized modes together with layout membership',()=>{
 const f=mount(),a=f.node('a').key;f.manager.maximize(a);const input=f.input('a');
 expect(f.layout.snap(a,'left')).toBe(true);expect((f.node('a').payload.metadata as any).state).toBe('normal');expect(f.layout.isTiled(a)).toBe(true);
 expect(f.layout.undo()).toBe(true);expect((f.node('a').payload.metadata as any).state).toBe('maximized');expect(f.layout.isTiled(a)).toBe(false);
 expect(f.layout.redo()).toBe(true);expect((f.node('a').payload.metadata as any).state).toBe('normal');expect(f.input('a')).toBe(input);
});
it('layout undo restores focus when it hides the active tab and does not override a newer focus request',async()=>{
 const f=mount(),a=f.node('a').key,b=f.node('b').key;
 f.input('b').focus();f.input('a').focus();
 f.layout.tile(b,a,'tab');f.manager.lifecycle.reveal(a);await tick();expect(document.activeElement).toBe(f.input('a'));
 f.layout.undo();await tick();expect(f.manager.registry.windows[b].visible).toBe(true);expect(document.activeElement).toBe(f.input('b'));
});
it('refuses to serialize a missing layout descriptor instead of silently dropping a window',()=>{
 const f=mount();f.layout.tile(f.node('b').key,f.node('a').key,'right');
 expect(()=>f.layout.capture(new Map([[f.node('a').placementKey,'window-a']]))).toThrow(/no durable descriptor/);
 expect(entries(f.layout.tree())).toHaveLength(2);
});
it('preserves the local C file on cancellation, partial write, and attempted D0 downgrade',async()=>{
 const {saveJsonFile}=await import('../demo/browser-json-file');const f=mount();f.layout.tile(f.node('b').key,f.node('a').key,'tab');
 const capture=f.editor.persistence.captureWorkspace({upgrade:true}),value=capture.localValue;let contents=JSON.stringify(value),pending='';
 const abort=vi.fn(async()=>{}),write=vi.fn(async(v:any)=>{pending=String(v);}),close=vi.fn(async()=>{contents=pending;});
 const handle={name:'C.json',getFile:async()=>({text:async()=>contents} as File),createWritable:vi.fn(async()=>({write,close,abort}))};
 const d0=structuredClone(value) as any,desktop=d0.root.metadata.workspacePresentation.presentations.desktop;desktop.version=2;desktop.layout={kind:'floating',normalOrder:desktop.layout.normalOrder,pinnedOrder:desktop.layout.pinnedOrder};
 await expect(saveJsonFile(d0,{suggestedName:'C.json',handle,workspace:{expected:value}})).rejects.toThrow(/older Desktop/);expect(handle.createWritable).not.toHaveBeenCalled();
 write.mockRejectedValueOnce(Error('partial write'));await expect(saveJsonFile(value,{suggestedName:'C.json',handle,workspace:{expected:value}})).rejects.toThrow(/partial write/);expect(abort).toHaveBeenCalledOnce();expect(close).not.toHaveBeenCalled();expect(JSON.parse(contents)).toEqual(value);expect(f.session.dirty()).toBe(true);
 (window as any).showSaveFilePicker=async()=>{throw new DOMException('cancel','AbortError');};try{expect(await saveJsonFile(value,{suggestedName:'New.json',saveAs:true,workspace:{createOnly:true}})).toBeUndefined();expect(f.session.dirty()).toBe(true);}finally{delete (window as any).showSaveFilePicker;}
});
it('does not notify an unchanged frame when a sibling subtree divider moves',()=>{
 const f=mount(),a=f.node('a').key,b=f.node('b').key;
 const placement=f.editor.commands.insert({id:'c',type:'window-block',metadata:{title:'C'},children:[{type:'plain-text-block',text:'C'}]},{kind:'at',parentKey:f.session.projection.state.rootKey,index:0});
 const c=f.session.projection.nodeForPlacement(placement)!.key;f.layout.tile(b,a,'right');f.layout.tile(c,b,'bottom');
 let notifications=0;createRoot(dispose=>{cleanup.push(dispose);createEffect(()=>{f.manager.geometry.controllers.get(a)!.rectangle();notifications++;});});
 const initial=notifications,divider=f.layout.solution().dividers.find(d=>d.axis==='vertical')!;
 f.layout.beginDivider(divider.id);f.layout.divider(divider.id,.6);f.layout.commitDivider();expect(notifications).toBe(initial);
});
it('refreshes a Document minimum only when its minimap visibility changes, not when typing or updating markers',async()=>{
 vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(null);
 const f=mount({id:'workspace',type:'workspace-block',children:[
  {id:'a',type:'document-window-block',children:[{id:'doc',type:'document-block',children:[{id:'page',type:'page-block',children:[{id:'text-a',type:'plain-text-block',text:'A'}]}]}]},
  {id:'b',type:'window-block',children:[{id:'text-b',type:'plain-text-block',text:'B'}]},
 ]});
 const frames=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
 f.layout.tile(f.node('b').key,f.node('a').key,'right');await frames();
 const width=()=>f.layout.solution().rectangles[f.node('a').placementKey].width;expect(width()).toBe(560);
 const markers=[{id:'mark',anchor:{kind:'ratio' as const,top:.25}}];f.editor.minimap.attach('test',{pageKey:f.node('page').key,markers});await frames();expect(width()).toBe(602);
 const invalidate=vi.spyOn(f.layout,'invalidateMinimum'),solve=vi.spyOn(LayoutSolver.prototype,'solve');
 f.editor.commands.setPayloadField(f.node('text-a').key,'text','A edit');f.editor.minimap.attach('test',{pageKey:f.node('page').key,markers:[{...markers[0],label:'Updated label'}]});await frames();
 expect(invalidate).not.toHaveBeenCalled();expect(solve).not.toHaveBeenCalled();
 f.editor.minimap.setLayerVisible('test',false);await frames();expect(width()).toBe(560);
});
