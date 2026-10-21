// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createComponent, createRoot, getOwner, onCleanup } from "solid-js";
import { ApplicationSurfacePortal, useManagedWindowOwner } from "../rendering/window-manager";
import { render } from "solid-js/web";
import { WorkspaceSession } from "./workspace-session";
import { WorkspacePresentationView } from "./workspace-presentation-view";
import { materializeLocalWorkspace } from "../reactive-editor/workspace-manifest";
import { identityCoordinates } from "../runtime/local-coordinates";
import { nativeDocumentSession } from "../persistence/native-session";

const cleanup: Array<() => void> = [];
afterEach(() => { cleanup.splice(0).reverse().forEach(stop => stop()); document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); });
const tick = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
const fixture = () => ({ id: "workspace", type: "workspace-block", children: [
  { id: "bank", type: "workspace-object-bank-block", children: ["a", "b"].map(id => ({
    id: `doc-${id}`, type: "document-block", metadata: { documentId: `resource-${id}`, title: `Document ${id}`, folder: ".", filename: `${id}.json` },
    children: [{ id: `text-${id}`, type: "standoff-editor-block", text: `Original ${id} text` }],
  })) },
] });
async function setup(retained = true, manager = true, transferEnabled = true, productEnabled = true) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ Success: false, Error: "isolated fixture" }), { status: 503 })));
  const session = new WorkspaceSession(materializeLocalWorkspace(fixture()), { features: {
    retainedDocumentSessions: retained, mutableWindowManager: manager, documentSessionHostTransfer: transferEnabled, documentDetachment: productEnabled, entityReferences: false,
    flintLogo: false, flintMaterialChrome: false, flintSpatialGraph: false, nativeKnowledge: false,
  } });
  cleanup.push(() => session.dispose());
  const editor = session.editor, records: Array<{ key: string; owner: unknown; host?: ReturnType<typeof useManagedWindowOwner>; disposed: number }> = [];
  const registration = editor.registry.resolve("standoff-editor-block")!, original = registration.view;
  registration.view = props => {
    const record = { key: props.nodeKey, owner: getOwner(), host: useManagedWindowOwner(), disposed: 0 }; records.push(record);
    onCleanup(() => record.disposed++); return createComponent(original, props);
  };
  const host = document.body.appendChild(document.createElement("div"));
  cleanup.push(render(() => <WorkspacePresentationView session={session}/>, host));
  cleanup.push(editor.installGateway(document));
  await editor.commandRegistry.execute("flint.open", { targetKey: session.projection.state.rootKey, args: undefined });
  await tick();
  const tabs = () => [...host.querySelectorAll<HTMLButtonElement>('.flint-document-tab [role="tab"]')];
  const app = Object.values(session.projection.state.nodes).find(n => n.viewType === "flint-application-block")!;
  const window = editor.blockQueries.ancestors(app.key).find(n => n.viewType === "window-block")!;
  const view = (id: string) => [...editor.projections.values()].find(p => p !== session.projection && Object.values(p.state.nodes).some(n => n.payload.id === `doc-${id}`))!;
  const text = (id: string) => Object.values(view(id).state.nodes).find(n => n.payload.id === `text-${id}`)!;
  return { session, editor, host, records, tabs, app, window, view, text };
}


const button = (label: string, root: ParentNode = document) => [...root.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.trim()===label)!;
async function detachProduct(f: Awaited<ReturnType<typeof setup>>) {
  f.host.querySelector<HTMLButtonElement>('[aria-label="Document actions: Document a"]')!.click(); await tick();
  const detach=button('Detach Document');expect(detach).toBeTruthy();expect(detach.disabled).toBe(false);detach.click();
  await vi.waitFor(()=>expect(f.session.documentSessions!.detachment!.windows()[0]?.state.pending).toBe(false));
  return f.session.documentSessions!.detachment!.windows()[0];
}
describe('E1.3 product Document detachment',()=>{
  it('product controls detach, reference and return the same editor without canonical or projection mutations',async()=>{
    const f=await setup(),store=f.session.documentSessions!,a=store.sessions()[0],mount=f.editor.mounts.get(f.text('a').key)!;
    f.tabs()[1].click();await tick();f.tabs()[0].click();await tick();
    const create=vi.spyOn(f.editor,'createView'),subscribeOriginal=f.editor.repository.subscribeChanges.bind(f.editor.repository);
    const liveSubscriptions=new Set<unknown>();
    const subscribe=vi.spyOn(f.editor.repository,'subscribeChanges').mockImplementation(fn=>{liveSubscriptions.add(fn);const stop=subscribeOriginal(fn);return()=>{liveSubscriptions.delete(fn);stop();};});
    const revision=f.editor.repository.state.revision,owner=f.records[0];
    mount.focus();mount.restoreInlineSelection!({anchor:7,head:3});
    const w=await detachProduct(f);
    expect(a.host.windowId).toBe(w.id);expect(f.editor.mounts.get(f.text('a').key)).toBe(mount);expect(owner.disposed).toBe(0);
    expect(f.host.querySelector('[aria-label="Detached window"]')).toBeTruthy();
    f.tabs()[0].click();await tick();expect(f.session.windowManager!.registry.activeWindowId).toBe(w.id);
    button('Return to Flint').click();await tick();
    expect(store.detachment!.windows()).toHaveLength(0);expect(store.transfers.atOrigin(a)).toBe(true);
    expect(f.editor.mounts.get(f.text('a').key)).toBe(mount);expect(f.editor.repository.state.revision).toBe(revision);
    // Both original tabs were already visited; no editing projection is created.
    expect(create).not.toHaveBeenCalled();expect(liveSubscriptions.size).toBeLessThanOrEqual(1); // Active Flint Entity inventory changes with tab selection; old inventory unsubscribes.
  });
  it('source close leaves editing and Save independent; standalone close is guarded and disposes once',async()=>{
    const f=await setup(),a=f.session.documentSessions!.sessions()[0],w=await detachProduct(f),native=nativeDocumentSession(f.editor);
    await f.editor.closeView(f.window.key);await tick();expect(a.current()).toBe(true);
    expect(button('Return to Flint').disabled).toBe(true);
    vi.spyOn(native,'location').mockReturnValue({folder:'.',filename:'a.mutable.json'});
    const save=vi.spyOn(native,'save').mockResolvedValue({phase:'saved'});
    const mount=f.editor.mounts.get(f.text('a').key)!;mount.focus();
    mount.focusElement.dispatchEvent(new KeyboardEvent('keydown',{key:'s',ctrlKey:true,bubbles:true,cancelable:true}));await tick();
    expect(save).toHaveBeenCalledOnce();expect(save).toHaveBeenCalledWith('resource-a',{folder:'.',filename:'a.mutable.json'});
    const closing=f.editor.closeView(w.id);await tick();expect(button('Keep editing')).toBeTruthy();button('Keep editing').click();await closing;
    expect(a.current()).toBe(true);
    const again=f.editor.closeView(w.id);await tick();button('Close window').click();await again;await tick();
    expect(a.signal.aborted).toBe(true);expect(f.records.find(r=>r.key===(mount.root as HTMLElement).dataset.clientId)?.disposed??f.records[0].disposed).toBe(1);
  });
  it('Save As cancellation writes nothing and first-save uses the canonical native service',async()=>{
    const f=await setup(),w=await detachProduct(f),native=nativeDocumentSession(f.editor),save=vi.spyOn(native,'save').mockResolvedValue({phase:'saved'});
    button('Save As…').click();await tick();button('Cancel Save As').click();await tick();expect(save).not.toHaveBeenCalled();
    button('Save As…').click();await tick();
    const input=document.querySelector<HTMLInputElement>('[aria-label="Document filename"]')!;input.value='chosen.mutable.json';input.dispatchEvent(new Event('input',{bubbles:true}));
    button('Save to destination').click();await tick();expect(save).toHaveBeenCalledWith('resource-a',{folder:'.',filename:'chosen.mutable.json'});
    expect(w.state.saveAs).toBe(false);
  });
  it('rolls back an injected product transfer failure and removes only its provisional shell',async()=>{
    const f=await setup(),s=f.session.documentSessions!.sessions()[0],c=f.session.documentSessions!.detachment!,before=f.session.windowManager!.count();
    await expect(c.detach(s,{alive:()=>true,select:()=>{},departed:()=>{},closed:()=>{}},{checkpoint:stage=>{if(stage==='surfaces')throw Error('injected failure');}})).rejects.toThrow('injected');
    expect(s.current()).toBe(true);expect(c.windows()).toHaveLength(0);expect(f.session.windowManager!.count()).toBe(before);
    expect(f.session.documentSessions!.transfers.atOrigin(s)).toBe(true);expect(c.message()).toContain('injected failure');
  });
  it('disables product Detach for an unqualified iframe with a visible reason',async()=>{
    const f=await setup(),s=f.session.documentSessions!.sessions()[0];s.element.append(document.createElement('iframe'));
    f.host.querySelector<HTMLButtonElement>('[aria-label="Document actions: Document a"]')!.click();await tick();
    expect(button('Detach Document').disabled).toBe(true);expect(document.body.textContent).toContain('unqualified embedded surface');
  });
  it('rejects the live DOM-based Canvas preview even though it contains no canvas element',async()=>{
    const f=await setup(),s=f.session.documentSessions!.sessions()[0];
    f.editor.commands.insert({type:'canvas-block'},{kind:'at',parentKey:s.rootKey,index:1});await tick();
    expect(s.element.querySelector('.reactive-canvas-preview')).toBeTruthy();
    f.host.querySelector<HTMLButtonElement>('[aria-label="Document actions: Document a"]')!.click();await tick();
    expect(button('Detach Document').disabled).toBe(true);expect(document.body.textContent).toContain('unqualified editor or application');
  });
  it('refuses workspace and named-arrangement capture/selection without modifying saved arrangements',async()=>{
    const f=await setup(),named=f.session.windowManager!.named,id=named.save('Original'),before=JSON.stringify(named.arrangements());
    const w=await detachProduct(f);
    expect(()=>f.editor.persistence.captureWorkspace()).toThrow('Return experimental');
    expect(()=>named.save('Detached')).toThrow('Return experimental');expect(named.select(id)).toBe(false);
    expect(JSON.stringify(named.arrangements())).toBe(before);expect(named.notice()).toContain('detached Documents');
    await f.session.documentSessions!.detachment!.returnToFlint(w);expect(()=>named.save('Returned')).not.toThrow();
  });
  it('cancels product preparation through its Cancel control and retains the source',async()=>{
    const f=await setup(),c=f.session.documentSessions!.detachment!,s=f.session.documentSessions!.sessions()[0];let ready!:()=>void;
    const pending=c.detach(s,{alive:()=>true,select:()=>{},departed:()=>{},closed:()=>{}},{prepare:()=>new Promise(resolve=>ready=resolve)});
    await tick();button('Cancel transfer').click();await expect(pending).rejects.toThrow('cancelled');ready?.();await tick();
    expect(c.windows()).toHaveLength(0);expect(s.current()).toBe(true);expect(f.session.documentSessions!.transfers.atOrigin(s)).toBe(true);
  });
  it('Return rollback keeps the same standalone session and allows a fresh retry',async()=>{
    const f=await setup(),c=f.session.documentSessions!.detachment!,w=await detachProduct(f),s=w.session;
    await c.returnToFlint(w,{checkpoint:stage=>{if(stage==='attached')throw Error('Return failed');}});
    expect(s.host.windowId).toBe(w.id);expect(w.state.error).toContain('Return failed');expect(s.current()).toBe(true);
    await c.returnToFlint(w);expect(c.windows()).toHaveLength(0);expect(f.session.documentSessions!.transfers.atOrigin(s)).toBe(true);
  });
  it('cancels Return through the product control without disposing or moving its session',async()=>{
    const f=await setup(),c=f.session.documentSessions!.detachment!,w=await detachProduct(f);let finish!:()=>void;
    const pending=c.returnToFlint(w,{prepare:()=>new Promise(resolve=>finish=resolve)});
    await tick();button('Cancel transfer').click();await pending;finish();await tick();
    expect(w.session.host.windowId).toBe(w.id);expect(w.session.current()).toBe(true);
    expect(w.state.error).toContain('cancelled');expect(f.session.documentSessions!.transfers.diagnostics().reservations).toBe(0);
    await c.returnToFlint(w);expect(c.windows()).toHaveLength(0);
  });
  it('shows exceptional recovery and restores only the exact reconnected source',async()=>{
    const f=await setup(),store=f.session.documentSessions!,c=store.detachment!,s=store.sessions()[0],source=store.transfers.current(s)!;
    const parent=source.port.container.parentNode!;
    await expect(c.detach(s,{alive:()=>true,select:()=>{},departed:()=>{},closed:()=>{}},{checkpoint:stage=>{if(stage==='attached'){source.port.container.remove();throw Error('lost source');}}})).rejects.toThrow('source recovery');
    expect(document.body.textContent).toContain('Document retained for recovery');expect(s.current()).toBe(true);
    button('Retry original host').click();await tick();expect(c.windows()[0].state.error).toContain('still unavailable');
    parent.appendChild(source.port.container);button('Retry original host').click();await tick();
    expect(c.windows()).toHaveLength(0);expect(source.port.container.contains(s.element)).toBe(true);expect(s.current()).toBe(true);
  });
  it('refuses close while Save is pending without cancelling the resource operation',async()=>{
    const f=await setup(),c=f.session.documentSessions!.detachment!,w=await detachProduct(f);let finish!:(value:any)=>void;
    vi.spyOn(c.native,'location').mockReturnValue({folder:'.',filename:'a.mutable.json'});
    const save=vi.spyOn(c.native,'save').mockImplementation(()=>new Promise(resolve=>finish=resolve));
    const pending=c.save(w);await f.editor.closeView(w.id);expect(w.session.current()).toBe(true);expect(w.state.error).toContain('pending Document Save');
    finish({phase:'saved'});await pending;expect(save).toHaveBeenCalledOnce();
  });
  it('keeps two independently detached views of one canonical resource distinct',async()=>{
    const f=await setup(),c=f.session.documentSessions!.detachment!,first=await detachProduct(f);
    const before=new Set(f.session.documentSessions!.sessions());
    await f.editor.commandRegistry.execute('flint.open',{targetKey:f.session.projection.state.rootKey,args:undefined});await tick();
    const second=f.session.documentSessions!.sessions().find(s=>!before.has(s))!;
    const other=await c.detach(second,{alive:()=>true,select:()=>{},departed:()=>{},closed:()=>{}});
    expect(c.windows()).toHaveLength(2);expect(first.session.projection).not.toBe(second.projection);
    expect(c.resource(first.session)).toBe(c.resource(second));expect(first.id).not.toBe(other!.id);
    const a=Object.values(first.session.projection.state.nodes).find(n=>n.payload.id==='text-a')!,b=Object.values(second.projection.state.nodes).find(n=>n.payload.id==='text-a')!;
    expect(a.key).not.toBe(b.key);expect(a.contentKey).toBe(b.contentKey);
    f.editor.commands.replaceInlineRange(a.key,0,0,'Shared ');expect(f.editor.mounts.get(b.key)!.captureText!()).toContain('Shared ');
  });
  it('preserves a passive inline image node and avoids validation or snapshots during typing',async()=>{
    const f=await setup(),node=f.text('a');
    f.editor.commands.insert({type:'image-block',metadata:{url:'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==',alt:'Passive Block'}},{kind:'after',anchorKey:node.key});await tick();
    const blockImage=f.host.querySelector('.reactive-image img')!;expect(blockImage).toBeTruthy();
    f.editor.commands.insertInlineImage(node.key,0,{assetId:'passive',src:'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==',alt:'Passive',status:'ready'});await tick();
    const img=f.host.querySelector('.reactive-inline-image img')!;expect(img).toBeTruthy();
    const w=await detachProduct(f);expect(w.session.element.contains(img)).toBe(true);expect(w.session.element.contains(blockImage)).toBe(true);
    const snapshot=vi.spyOn(f.editor.repository,'snapshot'),eligibility=vi.spyOn(f.session.documentSessions!.transfers,'eligibility');
    const mount=f.editor.mounts.get(node.key)!;mount.focus();mount.restoreInlineSelection!({anchor:1,head:1});
    for(const data of 'Bounded')mount.focusElement.dispatchEvent(new InputEvent('beforeinput',{inputType:'insertText',data,bubbles:true,cancelable:true}));
    expect(snapshot).not.toHaveBeenCalled();expect(eligibility).not.toHaveBeenCalled();expect(w.session.element.contains(img)).toBe(true);
  });

  it('the product rollout flag removes Detach controls while retaining E1.1/E1.2',async()=>{
    const f=await setup(true,true,true,false);
    expect(f.session.documentSessions!.detachment).toBeUndefined();
    expect(f.session.documentSessions!.transfers).toBeDefined();
    expect(f.host.querySelector('[aria-label="Document actions: Document a"]')).toBeNull();
    const a=f.session.documentSessions!.sessions()[0];f.tabs()[1].click();await tick();f.tabs()[0].click();await tick();
    expect(a.current()).toBe(true);expect(f.session.documentSessions!.transfers.atOrigin(a)).toBe(true);
  });

  it('returns from a shared shell-tab group and retires its runtime layout membership',async()=>{
    const f=await setup(),c=f.session.documentSessions!.detachment!,w=await detachProduct(f),layout=f.session.windowManager!.layout;
    expect(layout.tile(w.id,f.window.key,'tab')).toBe(true);await tick();
    await c.returnToFlint(w);await tick();
    expect(c.windows()).toHaveLength(0);expect(f.session.documentSessions!.transfers.atOrigin(w.session)).toBe(true);
    expect(JSON.stringify(layout.tree())).not.toContain(w.id);
  });

});
