// @vitest-environment jsdom
import {afterEach,describe,it,expect,vi} from 'vitest';
import {render} from 'solid-js/web';
import {WorkspaceSession} from './workspace-session';
import {WorkspacePresentationView} from './workspace-presentation-view';
import {materializeLocalWorkspace} from '../reactive-editor/workspace-manifest';
const stops:Array<()=>void>=[];
afterEach(()=>{stops.splice(0).reverse().forEach(fn=>fn());vi.restoreAllMocks();vi.unstubAllGlobals();document.body.replaceChildren();});
const tick=async()=>{await Promise.resolve();await Promise.resolve();};
async function setup(){
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({Success:false,Error:'isolated fixture'}),{status:503})));
 const s=new WorkspaceSession(materializeLocalWorkspace({id:'w',type:'workspace-block',children:[{id:'win',type:'document-window-block',children:[{id:'doc',type:'document-block',metadata:{documentId:'doc'},children:[{id:'text',type:'standoff-editor-block',text:'Annotation source',standoffProperties:[{id:'a',type:'style/bold',start:0,end:3,value:'original'}]}]}]}]}));
 stops.push(()=>s.dispose());const root=document.body.appendChild(document.createElement('div'));stops.push(render(()=><WorkspacePresentationView session={s}/>,root));await tick();
 const editor=s.editor,key=Object.values(s.projection.state.nodes).find(n=>n.payload.id==='text')!.key,win=Object.values(s.projection.state.nodes).find(n=>n.payload.id==='win')!.key;
 editor.overlays.open({ownerKey:key,viewType:'annotation-panel',annotationIndexes:[0],anchor:{x:10,y:10}});await tick();
 const panel=document.querySelector<HTMLElement>('[aria-label="Annotations at caret"]')!;
 const draft=panel.querySelector<HTMLTextAreaElement>('textarea')!;draft.value='{"draft":true}';draft.dispatchEvent(new InputEvent('input',{bubbles:true}));
 return {s,editor,key,win,panel,draft};
}
describe('Phase E existing application surfaces',()=>{
 it('retains inspector DOM and pending fields across unrelated launch/geometry and owner hide/restore',async()=>{
  const f=await setup();f.editor.commands.insert({id:'other',type:'window-block',children:[{type:'plain-text-block',text:'Other app'}]},{kind:'at',parentKey:f.s.projection.state.rootKey,index:1});await tick();
  expect(f.panel.isConnected).toBe(true);expect(f.draft.value).toBe('{"draft":true}');
  f.editor.commands.setPayloadField(f.win,'metadata',{position:{x:180,y:120}});await tick();expect(f.panel.isConnected).toBe(true);
  f.s.windowManager!.lifecycle.minimize(f.win);await tick();expect(f.panel.closest('[hidden]')).toBeTruthy();
  f.s.windowManager!.lifecycle.reveal(f.win);await tick();expect(f.panel.closest('[hidden]')).toBeNull();expect(f.draft.value).toBe('{"draft":true}');
  f.panel.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await tick();
  expect(f.panel.isConnected).toBe(false);expect((f.editor.node(f.key)!.payload.standoffProperties as any[])[0].metadata).toEqual({draft:true});
  f.editor.repository.undo();expect((f.editor.node(f.key)!.payload.standoffProperties as any[])[0].metadata).toBeUndefined();
 });
 it('dismisses stale inspected ranges on source edit and releases its surface on owner close',async()=>{
  const f=await setup();f.editor.commands.replaceInlineRange(f.key,0,0,'Changed ');await tick();expect(f.panel.isConnected).toBe(false);
  f.editor.overlays.open({ownerKey:f.key,viewType:'annotation-panel',annotationIndexes:[0],anchor:{x:10,y:10}});await tick();
  await f.editor.closeView(f.win);await tick();expect(document.querySelector('[aria-label="Annotations at caret"]')).toBeNull();expect(Object.values(f.s.windowManager!.registry.surfaces).some(r=>r.ownerWindowId===f.win)).toBe(false);
 });
 it('unrelated text editing does no inspector geometry reads or repository snapshots',async()=>{
  const f=await setup();f.editor.commands.insert({id:'unrelated',type:'standoff-editor-block',text:'Elsewhere'},{kind:'at',parentKey:f.s.projection.state.rootKey,index:1});await new Promise(r=>setTimeout(r,35));
  const other=Object.values(f.s.projection.state.nodes).find(n=>n.payload.id==='unrelated')!;
  const read=vi.spyOn(f.panel,'getBoundingClientRect'),snapshot=vi.spyOn(f.editor.repository,'snapshot');
  f.editor.commands.replaceInlineRange(other.key,0,0,'Typing ');await new Promise(r=>setTimeout(r,35));expect(read).not.toHaveBeenCalled();expect(snapshot).not.toHaveBeenCalled();expect(f.draft.value).toBe('{"draft":true}');
 });
});
