// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { render } from 'solid-js/web';
import { ReactiveEditor } from '../reactive-editor/editor';
import { registerCoreViews } from './register-core-views';
import { ReactiveTreeView } from './reactive-tree-view';
import { createEntityReferencesFeature } from '../features/entity-references';
import { annotationCapabilities } from '../application/annotation-capabilities';
const cleanup: (()=>void)[]=[];
afterEach(()=>{cleanup.splice(0).reverse().forEach(f=>f());vi.restoreAllMocks();document.body.replaceChildren();});
const tick=()=>new Promise(resolve=>setTimeout(resolve,40));
function setup(enabled=true){
 const rects=vi.fn(()=>[{x:0,y:0,left:0,top:0,right:60,bottom:20,width:60,height:20}]);
 const descriptor=Object.getOwnPropertyDescriptor(Range.prototype,'getClientRects');
 Object.defineProperty(Range.prototype,'getClientRects',{configurable:true,value:rects});
 cleanup.push(()=>{if(descriptor)Object.defineProperty(Range.prototype,'getClientRects',descriptor);else Reflect.deleteProperty(Range.prototype,'getClientRects');});
 const editor=new ReactiveEditor({type:'document-block',children:[{id:'text',type:'standoff-editor-block',text:'0123456789',standoffProperties:[
  {id:'outer',type:'codex/entity-reference',value:'entity',start:1,end:5},
  {id:'inner',type:'codex/entity-reference',value:'other',start:2,end:3},
 ]}]},{features:{annotationRangeEvents:enabled}});
 registerCoreViews(editor);const events=vi.fn();
 const release=editor.featureHost.activate(createEntityReferencesFeature(scope=>{const api=annotationCapabilities(editor,scope);api.register.annotationEvent(events);return api;}));
 const view=editor.createView('events'), key=view.node(view.state.rootKey)!.children[0];
 const host=document.body.appendChild(document.createElement('div'));
 const dispose=render(()=><ReactiveTreeView editor={editor} projection={view}/>,host);const stop=editor.installGateway(document);
 cleanup.push(()=>{stop();dispose();editor.dispose();});
 const mount=editor.mounts.get(key)!;
 const caret=(index:number,end=index)=>{mount.focusElement.focus();mount.restoreInlineSelection!({anchor:index,head:end});document.dispatchEvent(new Event('selectionchange'));};
 const paths=()=>[...host.querySelectorAll<SVGPathElement>('path[data-property-type="codex/entity-reference"]')];
 return {editor,events,release,view,key,host,mount,caret,paths,rects};
}
it('changes only opacity on caret transitions, with no geometry reads, new paths or repository changes',async()=>{
 const f=setup();await tick();const paths=f.paths();expect(paths).toHaveLength(2);expect(paths.map(p=>p.getAttribute('opacity'))).toEqual(['0.5','0.5']);
 const revision=f.editor.repository.state.revision, snapshot=vi.spyOn(f.editor.repository,'snapshot'),bounds=vi.spyOn(Element.prototype,'getBoundingClientRect');
 const ranges=vi.spyOn(f.editor.annotationEvents,'setRanges');f.rects.mockClear();
 f.caret(2);await tick();expect(paths.map(p=>p.getAttribute('opacity'))).toEqual(['1','1']);
 f.caret(3);await tick();expect(f.events).toHaveBeenCalledTimes(2);
 f.caret(4);await tick();expect(paths.map(p=>p.getAttribute('opacity'))).toEqual(['1','0.5']);
 f.caret(6);await tick();expect(paths.map(p=>p.getAttribute('opacity'))).toEqual(['0.5','0.5']);
 expect(f.paths()).toEqual(paths);expect(f.rects).not.toHaveBeenCalled();expect(bounds).not.toHaveBeenCalled();expect(ranges).not.toHaveBeenCalled();expect(snapshot).not.toHaveBeenCalled();expect(f.editor.repository.state.revision).toBe(revision);
});
it('clears on selection/blur, refreshes after range edits and undo, and disposes feature listeners',async()=>{
 const f=setup();await tick();f.caret(2);expect(f.paths().every(p=>p.getAttribute('opacity')==='1')).toBe(true);
 f.caret(2,4);expect(f.paths().every(p=>p.getAttribute('opacity')==='0.5')).toBe(true);
 f.caret(2);const button=document.body.appendChild(document.createElement('button'));button.focus();expect(f.paths().every(p=>p.getAttribute('opacity')==='0.5')).toBe(true);
 f.caret(2);f.editor.commands.setPayloadField(f.key,'standoffProperties',[]);await tick();expect(f.paths()).toHaveLength(0);
 f.editor.repository.undo();await tick();expect(f.paths().every(p=>p.getAttribute('opacity')==='1')).toBe(true);
 window.dispatchEvent(new Event('blur'));expect(f.paths().every(p=>p.getAttribute('opacity')==='0.5')).toBe(true);
 window.dispatchEvent(new Event('focus'));expect(f.paths().every(p=>p.getAttribute('opacity')==='1')).toBe(true);
 f.release();await tick();const count=f.events.mock.calls.length;f.caret(2);expect(f.events).toHaveBeenCalledTimes(count);expect(f.paths()).toHaveLength(0);
});
it('keeps legacy full-opacity underlines and emits no events when disabled',async()=>{
 const f=setup(false);await tick();f.caret(2);await tick();expect(f.paths()).toHaveLength(2);expect(f.paths().every(p=>!p.hasAttribute('opacity'))).toBe(true);expect(f.events).not.toHaveBeenCalled();
});

it('emphasizes every line fragment only in the focused occurrence of shared content',async()=>{
 const f=setup();f.rects.mockReturnValue([
  {x:0,y:0,left:0,top:0,right:60,bottom:20,width:60,height:20},
  {x:0,y:25,left:0,top:25,right:40,bottom:45,width:40,height:20},
 ]);
 const other=f.editor.createView('other'), host=document.body.appendChild(document.createElement('div'));
 const dispose=render(()=><ReactiveTreeView editor={f.editor} projection={other}/>,host);cleanup.push(dispose);
 await tick();expect(f.paths()).toHaveLength(4);
 const paths=[...host.querySelectorAll('path[data-property-type="codex/entity-reference"]')];expect(paths).toHaveLength(4);
 f.caret(2);expect(f.paths().every(p=>p.getAttribute('opacity')==='1')).toBe(true);expect(paths.every(p=>p.getAttribute('opacity')==='0.5')).toBe(true);
 const key=other.node(other.state.rootKey)!.children[0], mount=f.editor.mounts.get(key)!;
 mount.focusElement.focus();mount.restoreInlineSelection!({anchor:2,head:2});
 expect(paths.every(p=>p.getAttribute('opacity')==='1')).toBe(true);expect(f.paths().every(p=>p.getAttribute('opacity')==='0.5')).toBe(true);
 const active=f.events.mock.calls.map(([e])=>e).filter(e=>e.nodeKey===key&&e.type==='caret-in-range');
 expect(active).toHaveLength(2);dispose();for(const event of active)expect(f.editor.annotationEvents.isActive(key,event.annotation.key)).toBe(false);
});
