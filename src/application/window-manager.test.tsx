// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { render } from "solid-js/web";
import { WorkspaceSession } from "./workspace-session";
import { WorkspacePresentationView } from "./workspace-presentation-view";
import { materializeLocalWorkspace } from "../reactive-editor/workspace-manifest";
import { workspaceOpen } from "./workspace-open";
import type { ExistingBlockDto } from "../block-tree/types";

const cleanups: (() => void)[] = [];
afterEach(() => { cleanups.splice(0).reverse().forEach(stop => stop()); document.body.replaceChildren(); vi.restoreAllMocks(); });
function mount(enabled = true, entities = true, inline = false) {
  const dto: ExistingBlockDto = { id: "workspace", type: "workspace-block", children: [
    { id: "background", type: "canvas-background-block", children: [
      { id: "ink", type: "document-window-block", metadata: { title: "Ink", state: "maximized", zIndex: 99999999 }, children: [
        { id: "doc", type: "document-block", metadata: { documentId: "doc" }, children: [{ id: "text", type: inline ? "standoff-editor-block" : "plain-text-block", text: "Selected text" }, ...(inline ? [{id:"second-text",type:"standoff-editor-block",text:"Second paragraph"}] : [])] },
      ] },
      { id: "other", type: "window-block", metadata: { title: "Other", zIndex: 2 }, children: [{ type: "plain-text-block", text: "Other text" }] },
    ] },
  ] };
  const session = new WorkspaceSession(materializeLocalWorkspace(dto), { features: { mutableWindowManager: enabled, entityReferences: entities } });
  const host = document.body.appendChild(document.createElement("main")); host.className = "workspace-demo"; host.dataset.windowWorkArea = "";
  cleanups.push(() => session.dispose());
  cleanups.push(render(() => <WorkspacePresentationView session={session} />, host));
  const node = (id: string) => Object.values(session.projection.state.nodes).find(n => n.payload.id === id)!;
  return { session, editor: session.editor, host, node, manager: session.windowManager };
}
const tick = async () => { await Promise.resolve(); await Promise.resolve(); };

it("adopts imports independently of mount order, raises without resource/history changes, and cleans up", async () => {
  const f = mount(), registry = f.manager!.registry, ink = f.node("ink"), other = f.node("other");
  expect(Object.keys(registry.windows)).toHaveLength(2);
  expect(registry.windows[ink.key].rank).toBe(2);
  const before = f.editor.encodeWorkspace(), revision = f.editor.repository.state.revision;
  f.manager!.raisePlacement(other.placementKey);
  expect(registry.windows[other.key].rank).toBe(2);
  expect(f.editor.encodeWorkspace()).toEqual(before);
  expect(f.editor.repository.state.revision).toBe(revision);
  expect(f.host.querySelectorAll(".mwm-window-group")).toHaveLength(2);
  f.editor.closeView(other.key); await tick();
  expect(registry.windows[other.key]).toBeUndefined();
  expect(f.host.querySelectorAll(".mwm-window-group")).toHaveLength(1);
});

it("owns portalled panels by source occurrence and keeps them with the window group", async () => {
  const f = mount(), registry = f.manager!.registry;
  const stop = f.editor.panels.register({ type: "a0-tool", view: () => <input aria-label="A0 tool" /> });
  cleanups.push(stop);
  const key = f.editor.overlays.open({ ownerKey: f.node("text").key, viewType: "a0-tool", anchor: { x: 1, y: 1 } });
  await tick();
  const input = document.querySelector<HTMLInputElement>('[aria-label="A0 tool"]')!;
  expect(input.closest<HTMLElement>("[data-mwm-window]")!.dataset.mwmWindow).toBe(f.node("ink").key);
  expect(registry.surfaces[key]).toMatchObject({ ownerWindowId: f.node("ink").key, sourceViewId: f.session.projection.viewId });
  input.focus(); expect(registry.windows[f.node("ink").key].active).toBe(true);
  f.manager!.raisePlacement(f.node("other").placementKey);
  expect(registry.windows[f.node("other").key].rank).toBeGreaterThan(registry.windows[f.node("ink").key].rank);
  expect(document.querySelector('[aria-label="A0 tool"]')).toBe(input);
  f.editor.closeView(f.node("ink").key); await tick();
  expect(registry.surfaces[key]).toBeUndefined();
  expect(document.querySelector('[aria-label="A0 tool"]')).toBeNull();
});

it("launches new workspace windows above historical z values through central registration", () => {
  const f = mount();
  const placement = workspaceOpen(f.session).newDocument();
  const added = f.session.projection.nodeForPlacement(placement)!;
  expect(f.manager!.registry.windows[added.key].rank).toBeGreaterThan(f.manager!.registry.windows[f.node("ink").key].rank);
  expect(f.host.querySelectorAll(".mwm-window-group")).toHaveLength(3);
});

it("does no registry ordering, registration, snapshots or owner lookup on ordinary text edits", async () => {
  const f = mount(), registry = f.manager!.registry;
  await tick();
  const registration = vi.spyOn(registry, "registerWindow"), raise = vi.spyOn(registry, "raise"), ownership = vi.spyOn(f.manager!, "ownerForNode");
  const snapshot = vi.spyOn(f.editor.repository, "snapshot"), revision = registry.revision();
  f.editor.commands.setPayloadField(f.node("text").key, "text", "Changed text");
  await tick();
  expect(registry.revision()).toBe(revision);
  expect(registration).not.toHaveBeenCalled(); expect(raise).not.toHaveBeenCalled();
  expect(ownership).not.toHaveBeenCalled(); expect(snapshot).not.toHaveBeenCalled();
});

it("keeps the exclusive legacy path when disabled", () => {
  const f = mount(false);
  expect(f.manager).toBeUndefined(); expect(f.editor.windowManager).toBeUndefined();
  expect(f.host.querySelector(".mwm-window-plane")).toBeNull();
  const ink = f.host.querySelector<HTMLElement>('[data-block-id="ink"]')!;
  expect(ink.style.zIndex).toBe("99999999");
});

it("restores native selection through MRU activation without persistence writes", async () => {
  const f=mount(), manager=f.manager!, a=f.node('ink').key,b=f.node('other').key;
  const input=f.editor.mounts.get(f.node('text').key)!.focusElement as HTMLTextAreaElement;
  input.focus();input.setSelectionRange(2,7,'backward');
  const before=f.editor.encodeWorkspace(),revision=f.editor.repository.state.revision;
  manager.lifecycle.activate(b);manager.lifecycle.activate(a);
  expect(document.activeElement).toBe(input);expect([input.selectionStart,input.selectionEnd,input.selectionDirection]).toEqual([2,7,'backward']);
  expect(manager.registry.mru.slice(0,2)).toEqual([a,b]);
  expect(f.editor.encodeWorkspace()).toEqual(before);expect(f.editor.repository.state.revision).toBe(revision);
});

it("preserves a newly clicked caret and invalidates queued overlay focus returns", async()=>{
  const f=mount(),a=f.node('ink').key,b=f.node('other').key;
  const input=f.editor.mounts.get(f.node('text').key)!.focusElement as HTMLTextAreaElement;
  input.focus();input.setSelectionRange(2,7);
  const key=f.editor.overlays.open({ownerKey:f.node('text').key,viewType:'unknown-tool',anchor:{x:0,y:0}});await tick();
  f.editor.overlays.close(key);f.manager!.lifecycle.activate(b);await tick();
  expect(f.manager!.registry.activeWindowId).toBe(b);
  input.dispatchEvent(new MouseEvent('pointerdown',{bubbles:true,cancelable:true}));input.focus();input.setSelectionRange(9,9);await tick();
  expect(f.manager!.registry.activeWindowId).toBe(a);expect(input.selectionStart).toBe(9);
});

it("vetoes and cancels asynchronous owner closes before changing membership", async()=>{
  const f=mount(),key=f.node('ink').key;let finish!:(ok:boolean)=>void;let signal!:AbortSignal;
  const release=f.manager!.lifecycle.guard(key,s=>{signal=s;return new Promise<boolean>(resolve=>finish=resolve);});
  const first=f.editor.closeView(key);expect(f.manager!.registry.windows[key]).toBeDefined();
  finish(false);await first;expect(f.manager!.registry.windows[key]).toBeDefined();
  const second=f.editor.closeView(key);f.manager!.lifecycle.cancel(key);expect(signal.aborted).toBe(true);finish(true);await second;
  expect(f.manager!.registry.windows[key]).toBeDefined();release();await f.editor.closeView(key);expect(f.manager!.registry.windows[key]).toBeUndefined();
});

it("checks owned guards before app guards and leaves related windows alive", async()=>{
  const f=mount(),key=f.node('ink').key,app=vi.fn(()=>true),tool=vi.fn(()=>false);
  f.editor.viewCloseGuards.set(key,app);const stop=f.manager!.lifecycle.guard(key,tool);
  await f.editor.closeView(key);expect(app).not.toHaveBeenCalled();expect(f.manager!.registry.windows[key]).toBeDefined();
  stop();await f.editor.closeView(key);expect(app).toHaveBeenCalledOnce();expect(f.manager!.registry.windows[f.node('other').key]).toBeDefined();
});

it("defers activation until composition ends and cancels a stale readiness lease", async()=>{
  const f=mount(),a=f.node('ink').key,b=f.node('other').key;
  const input=f.editor.mounts.get(f.node('text').key)!.focusElement;input.focus();
  const valid=f.manager!.lifecycle.readyTicket(a);
  input.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));
  f.manager!.lifecycle.activate(b);expect(f.manager!.registry.activeWindowId).toBe(a);
  input.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true}));await tick();
  expect(f.manager!.registry.activeWindowId).toBe(b);expect(valid()).toBe(false);
});

it("minimizes to the MRU successor, restores its caret, and blocks destructive guarded minimization", async()=>{
  const f=mount(),a=f.node('ink').key,b=f.node('other').key;
  const input=f.editor.mounts.get(f.node('text').key)!.focusElement as HTMLTextAreaElement;
  f.manager!.lifecycle.activate(b);input.focus();input.setSelectionRange(3,6);
  const group=f.manager!.groups.get(a)!;
  group.querySelector<HTMLButtonElement>('[aria-label="Minimize window"]')!.click();await tick();
  expect(f.manager!.registry.activeWindowId).toBe(b);expect(f.manager!.registry.windows[a].mounted).toBe(false);
  group.querySelector<HTMLButtonElement>('[data-window-icon]')!.click();await tick();
  const restored=f.editor.mounts.get(f.node('text').key)!.focusElement as HTMLTextAreaElement;
  expect(document.activeElement).toBe(restored);expect([restored.selectionStart,restored.selectionEnd]).toEqual([3,6]);
  f.editor.viewCloseGuards.set(a,()=>true);group.querySelector<HTMLButtonElement>('[aria-label="Minimize window"]')!.click();
  expect(f.manager!.registry.windows[a].mounted).toBe(true);
});

it("enforces owner and workspace modal focus and command scopes", async()=>{
  const f=mount(),a=f.node('ink').key,b=f.node('other').key;
  const root=f.manager!.groups.get(a)!.appendChild(document.createElement('section')),button=root.appendChild(document.createElement('button'));
  const release=f.manager!.lifecycle.modal(root,a);button.focus();
  f.manager!.lifecycle.activate(a);expect(document.activeElement).toBe(button);
  f.manager!.lifecycle.activate(b);expect(f.manager!.registry.activeWindowId).toBe(b);
  const workspace=document.body.appendChild(document.createElement('section')),control=workspace.appendChild(document.createElement('input'));
  const stop=f.manager!.lifecycle.modal(workspace);control.focus();
  expect(f.manager!.lifecycle.activate(b)).toBe(false);expect(document.activeElement).toBe(control);
  expect(f.editor.commandRegistry.canExecute('thesis.open',{targetKey:f.node('ink').key,args:undefined})).toBe(false);
  stop();release();await tick();root.remove();workspace.remove();
});

it("keeps Entity lookup on unrelated Thesis launches, reuses its occurrence, and invalidates only its source", async()=>{
  const f=mount(true,false), text=f.node('text');
  let api!:import('../feature-api').AnnotationCapabilities;
  const {annotationCapabilities}=await import('./annotation-capabilities');
  const {createEntityReferencesFeature}=await import('../features/entity-references');
  const {openEntitySearch,chooseEntity}=await import('../features/entity-references/entity-search');
  f.editor.featureHost.activate(createEntityReferencesFeature(scope=>{
    api=annotationCapabilities(f.editor,scope);api.entities=()=>{throw Error('Qualification has no backend');};return api;
  }));
  const first=openEntitySearch(api,[],text.key);await tick();
  const tool=document.querySelector('[aria-label="Link Entity Reference"]');expect(tool).not.toBeNull();
  const reads=vi.spyOn(api,'text'),snapshot=vi.spyOn(f.editor.repository,'snapshot');
  await f.editor.commandRegistry.execute('thesis.open',{targetKey:f.session.projection.state.rootKey,args:undefined});await tick();
  expect(document.querySelector('[aria-label="Link Entity Reference"]')).toBe(tool);
  expect(tool!.getAttribute('aria-modal')).toBe('false');expect(reads).not.toHaveBeenCalled();expect(snapshot).not.toHaveBeenCalled();
  expect(openEntitySearch(api,[],text.key).key).toBe(first.key);
  const changes:{valid:boolean;revision:number}[]=[];
  const stop=api.watchTarget!(text.key,[],c=>changes.push(c));
  f.editor.commands.setPayloadField(f.node('other').key,'metadata',{title:'Unrelated'});
  expect(changes.at(-1)?.valid).toBe(true);
  f.editor.commands.setPayloadField(text.key,'text','Changed source');
  expect(changes.at(-1)?.valid).toBe(false);expect(tool!.textContent).toContain('original target changed');
  expect(()=>chooseEntity(api,first.data as any,{id:'entity',name:'Entity'})).toThrow(/changed/);
  stop();first.close();await tick();expect(document.querySelector('[aria-label="Link Entity Reference"]')).toBeNull();
});

it("rejects a readiness lease after the same occurrence is closed and remounted", async()=>{
  const f=mount(),key=f.node('other').key,placement=f.node('other').placementKey;
  const valid=f.manager!.lifecycle.readyTicket(key);
  await f.editor.closeView(key);f.editor.viewVisibility.set(placement,false);await tick();
  expect(f.manager!.registry.windows[key]).toBeDefined();expect(valid()).toBe(false);
});

it("cancels a pending close on new input and emits one cancellation before a later close", async()=>{
  const f=mount(),key=f.node('ink').key;let finish!:(ok:boolean)=>void;
  const events:string[]=[];const stop=f.manager!.lifecycle.subscribe(event=>events.push(event.type));
  const guard=f.manager!.lifecycle.guard(key,()=>new Promise<boolean>(resolve=>finish=resolve));
  const pending=f.editor.closeView(key);
  f.editor.mounts.get(f.node('text').key)!.focusElement.dispatchEvent(new InputEvent('beforeinput',{inputType:'insertText',data:'x',bubbles:true,cancelable:true}));
  finish(true);await pending;expect(f.manager!.registry.windows[key]).toBeDefined();
  guard();await f.editor.closeView(key);
  expect(events.filter(type=>type.startsWith('close'))).toEqual(['closeRequested','closeCancelled','closeRequested','closed']);stop();
});

it("restores occurrence-local cross-Block selection when activating its window",()=>{
  const f=mount(true,false,true),a=f.node('ink').key,b=f.node('other').key;
  const first=f.node('text'),second=f.node('second-text');
  f.editor.crossText.enable(true);f.editor.mounts.get(second.key)!.focus();
  const anchor=f.editor.crossText.position(first.key,2),head=f.editor.crossText.position(second.key,5);
  f.editor.crossText.set(anchor,head);f.manager!.lifecycle.activate(b);f.editor.crossText.clear();
  f.manager!.lifecycle.activate(a);
  expect(f.editor.crossText.range()).toMatchObject({anchor,head,viewId:first.viewId});
  f.manager!.lifecycle.activate(b);f.editor.commands.replaceInlineRange(first.key,0,0,'changed');f.manager!.lifecycle.activate(a);
  expect(f.editor.crossText.range()).toBeUndefined();
});

it("keeps independent selections for two mounted occurrences of the same canonical Document",async()=>{
  const dto:ExistingBlockDto={id:'workspace',type:'workspace-block',children:['one','two'].map(id=>({id,type:'document-window-block',children:[{id:'shared',type:'document-block',metadata:{documentId:'shared'},children:[{id:'same-text',type:'plain-text-block',text:'One shared text'}]}]}))};
  const session=new WorkspaceSession(materializeLocalWorkspace(dto));cleanups.push(()=>session.dispose());
  const host=document.body.appendChild(document.createElement('main'));cleanups.push(render(()=><WorkspacePresentationView session={session}/>,host));
  const windows=Object.values(session.windowManager!.registry.windows),inputs=Array.from(host.querySelectorAll<HTMLTextAreaElement>('textarea'));
  expect(inputs).toHaveLength(2);inputs[0].focus();inputs[0].setSelectionRange(1,4);inputs[1].focus();inputs[1].setSelectionRange(6,9);
  const first=inputs[0].closest<HTMLElement>('[data-mwm-window]')!.dataset.mwmWindow!,second=windows.find(w=>w.id!==first)!.id;
  session.windowManager!.lifecycle.activate(first);expect([inputs[0].selectionStart,inputs[0].selectionEnd]).toEqual([1,4]);
  session.windowManager!.lifecycle.activate(second);expect([inputs[1].selectionStart,inputs[1].selectionEnd]).toEqual([6,9]);
});

it("activates a window from its non-focusable title without losing its editor selection",()=>{
  const f=mount(),a=f.node('ink').key,b=f.node('other').key,input=f.editor.mounts.get(f.node('text').key)!.focusElement as HTMLTextAreaElement;
  input.focus();input.setSelectionRange(2,4);f.manager!.lifecycle.activate(b);
  f.manager!.groups.get(a)!.querySelector('header span')!.dispatchEvent(new MouseEvent('pointerdown',{bubbles:true,cancelable:true}));
  expect(document.activeElement).toBe(input);expect([input.selectionStart,input.selectionEnd]).toEqual([2,4]);
});

it("allows explicit window cycling out of an owner modal but never out of a workspace modal",()=>{
  const f=mount(),a=f.node('ink').key,b=f.node('other').key,root=f.manager!.groups.get(a)!.appendChild(document.createElement('section')),input=root.appendChild(document.createElement('input'));
  const release=f.manager!.lifecycle.modal(root,a);input.focus();
  expect(f.editor.commandRegistry.canExecute('window.next',{targetKey:a,args:undefined})).toBe(true);
  f.editor.commandRegistry.execute('window.next',{targetKey:a,args:undefined});expect(f.manager!.registry.activeWindowId).toBe(b);
  const shell=document.body.appendChild(document.createElement('section')),field=shell.appendChild(document.createElement('input')),stop=f.manager!.lifecycle.modal(shell);field.focus();
  expect(f.editor.commandRegistry.canExecute('window.next',{targetKey:b,args:undefined})).toBe(false);stop();release();
});

it("does not let a cancelled guard response cancel a newer close request",async()=>{
  const f=mount(),key=f.node('ink').key,responses:((ok:boolean)=>void)[]=[],signals:AbortSignal[]=[];
  f.manager!.lifecycle.guard(key,signal=>{signals.push(signal);return new Promise<boolean>(resolve=>responses.push(resolve));});
  const old=f.editor.closeView(key);f.manager!.lifecycle.cancel(key);const current=f.editor.closeView(key);
  responses[0](false);await old;expect(signals[1].aborted).toBe(false);expect(f.manager!.registry.windows[key]).toBeDefined();
  responses[1](true);await current;expect(f.manager!.registry.windows[key]).toBeUndefined();
});
