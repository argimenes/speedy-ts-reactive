// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { render } from 'solid-js/web';
import { ReactiveEditor } from '../reactive-editor/editor';
import { registerCoreViews } from './register-core-views';
import { ReactiveTreeView } from './reactive-tree-view';
import { createAutocompleteFeature } from '../features/autocomplete';
import type { CompletionSession } from '../features/autocomplete/session';
import type { ExistingBlockDto } from '../block-tree/types';
import { parseTabCommand, tabCommandCandidates } from '../runtime/tab-commands';
const cleanup:(()=>void)[]=[];
beforeEach(()=>{Range.prototype.getBoundingClientRect=()=>new DOMRect(10,10,1,20);Range.prototype.getClientRects=()=>[new DOMRect(10,10,1,20)] as unknown as DOMRectList;});
afterEach(()=>{cleanup.splice(0).reverse().forEach(f=>f());document.body.replaceChildren();vi.restoreAllMocks();});
const tick=async()=>{await Promise.resolve();await Promise.resolve();};
const p=(id:string,text='Alpha  Beta'):ExistingBlockDto=>({id,type:'standoff-editor-block',text,standoffProperties:[{id:id+'-bold',type:'style/bold',start:0,end:4}],relation:{leftMargin:{id:id+'-margin',type:'left-margin-block',children:[{id:id+'-note',type:'standoff-editor-block',text:'Note'}]}}});
const row=(id='row',orientation='horizontal'):ExistingBlockDto=>({id,type:'tab-row-block',metadata:{orientation,custom:'retained'},children:[{id:id+'-a',type:'tab-block',metadata:{name:'First',active:true},children:[p('a')]},{id:id+'-b',type:'tab-block',metadata:{name:'Second'},children:[p('b')]}]});
function setup(children:ExistingBlockDto[]=[p('a')],extra=0,enabled=true){
 const editor=new ReactiveEditor({id:'workspace',type:'workspace-block',children:[{id:'doc',type:'document-block',metadata:{documentId:'doc'},children},...Array.from({length:extra},(_,i)=>({id:'other-'+i,type:'document-block',children:[p('other-text-'+i)]}))]},{features:{verticalTabs:enabled}});
 registerCoreViews(editor);const view=editor.createView('tab-commands'),host=document.body.appendChild(document.createElement('div'));
 cleanup.push(()=>editor.dispose());cleanup.push(render(()=><ReactiveTreeView editor={editor} projection={view}/>,host));cleanup.push(editor.installGateway(document));editor.featureHost.activate(createAutocompleteFeature(editor));
 const node=(id:string)=>Object.values(view.state.nodes).find(n=>n.payload.id===id)!;
 const focus=(id:string,at=6)=>{const m=editor.mounts.get(node(id).key)!;m.focus();m.restoreInlineSelection?.({anchor:at,head:at});};
 const session=()=> (editor.overlays.overlays.find(o=>o.viewType==='autocomplete')?.data as {session:CompletionSession}|undefined)?.session;
 const type=async(text:string)=>{for(const data of text){document.activeElement!.dispatchEvent(new InputEvent('beforeinput',{inputType:'insertText',data,bubbles:true,cancelable:true}));await tick();}};
 const tree=()=>{const dto=editor.encodeDocumentAt(node('doc').placementKey);if(dto.metadata){delete (dto.metadata as any).focus;}return dto;};
 return {editor,view,host,node,focus,session,type,tree};
}
it.each(['horizontal','vertical'])('creates /tabs create %s atomically and preserves source identities and caret',async orientation=>{
 const f=setup();f.focus('a');const n=f.node('a'),mount=f.editor.mounts.get(n.key)!,root=mount.root,placement=n.placementKey,content=n.contentKey;
 await f.type('/tabs create '+orientation);const literal=f.tree(),s=f.session()!;expect(s.state.selected).toBe('tabs.create.'+orientation);
 const snapshot=vi.spyOn(f.editor.repository,'snapshot'),build=vi.spyOn(f.view as any,'build');await s.choose();await tick();
 expect(s.state.error).toBe('');expect(snapshot).not.toHaveBeenCalled();expect(build).not.toHaveBeenCalled();
 expect(f.node('a').placementKey).toBe(placement);expect(f.node('a').contentKey).toBe(content);expect(f.editor.mounts.get(f.node('a').key)!.root).toBe(root);
 expect(f.editor.mounts.get(f.node('a').key)!.captureInlineSelection!()).toEqual({anchor:6,head:6});
 expect(f.tree().children![0].metadata).toEqual({orientation});expect(f.tree().children![0].children![0].children![0].text).toBe('Alpha  Beta');
 f.editor.repository.undo();await tick();expect(f.tree()).toEqual(literal);f.editor.repository.redo();await tick();expect(f.tree().children![0].type).toBe('tab-row-block');
});
it.each([false,true])('changes orientation and Unicode names without rebuilding children (shared=%s)',async shared=>{
 const f=setup([row()]);if(shared)f.editor.commands.transclude(f.node('row').key,{kind:'at',parentKey:f.node('doc').key,index:1});
 for(const command of ['tabs orientation vertical','tab rename Études : First Name']){
  f.focus('a');await f.type('/'+command);const literal=f.tree(),s=f.session()!,root=f.editor.mounts.get(f.node('a').key)!.root;
  const snapshot=vi.spyOn(f.editor.repository,'snapshot'),build=vi.spyOn(f.view as any,'build'),structural=vi.spyOn(f.view as any,'updateStructural');
  await s.choose();await tick();expect(s.state.error).toBe('');expect(snapshot).not.toHaveBeenCalled();expect(build).not.toHaveBeenCalled();expect(structural).not.toHaveBeenCalled();
  expect(f.editor.mounts.get(f.node('a').key)!.root).toBe(root);expect(f.node('a').payload.standoffProperties).toEqual(p('a').standoffProperties);
  if(command.startsWith('tab rename'))expect((f.node('row-a').payload.metadata as any).name).toBe('Études : First Name');else expect((f.node('row').payload.metadata as any).orientation).toBe('vertical');
  f.editor.repository.undo();await tick();snapshot.mockRestore();expect(f.tree()).toEqual(literal);f.editor.repository.redo();await tick();
 }
});
it.each(['tab add','tab move after','tab delete'])('executes /%s with exact literal Undo',async command=>{
 const f=setup([row('row','vertical')]);f.focus('a');await f.type('/'+command);const literal=f.tree(),s=f.session()!;
 expect(s.state.selected).toBe(parseTabCommand(command)!.id);const snapshot=vi.spyOn(f.editor.repository,'snapshot');await s.choose();await tick();expect(s.state.error).toBe('');expect(snapshot).not.toHaveBeenCalled();snapshot.mockRestore();
 const applied=f.tree(),result=applied.children![0];expect(result.metadata).toEqual({orientation:'vertical',custom:'retained'});
 if(command==='tab add'){expect(result.children).toHaveLength(3);expect(result.children![2].children![0].text).toBe('');}
 if(command==='tab move after')expect(result.children!.map(n=>n.id)).toEqual(['row-b','row-a']);
 if(command==='tab delete')expect(result.children!.map(n=>n.id)).toEqual(['row-b']);
 f.editor.repository.undo();await tick();expect(f.tree()).toEqual(literal);f.editor.repository.redo();await tick();expect(f.tree()).toEqual(applied);
});
it('deletes the final Tab into an editable paragraph and keeps it undoable',async()=>{
 const dto=row();dto.children!.splice(1);const f=setup([dto]);f.focus('a');await f.type('/tab delete');const before=f.tree();await f.session()!.choose();await tick();expect(f.tree().children![0]).toMatchObject({type:'standoff-editor-block',text:''});f.editor.repository.undo();await tick();expect(f.tree()).toEqual(before);
});
it('creates a nested row explicitly without changing the containing row',async()=>{
 const f=setup([row('row','vertical')]);f.focus('a');await f.type('/tabs create horizontal');await f.session()!.choose();await tick();expect(f.tree().children![0].metadata).toMatchObject({orientation:'vertical'});expect(f.tree().children![0].children![0].children![0]).toMatchObject({type:'tab-row-block',metadata:{orientation:'horizontal'}});
});
it('keeps incomplete, unavailable and feature-disabled commands literal',async()=>{
 const f=setup([row()]);f.focus('a');await f.type('/tab rename');const before=f.tree(),s=f.session()!;expect(s.state.rows[0].disabled).toBe(true);await s.choose();expect(f.tree()).toEqual(before);s.close();
 expect(tabCommandCandidates(f.editor,f.node('a').key,'tab move before')[0].disabled).toBe(true);
 const off=setup([row()],0,false);expect(tabCommandCandidates(off.editor,off.node('a').key,'tabs')).toEqual([]);expect(off.editor.commandRegistry.canExecute('tab.add',{targetKey:off.node('a').key,args:undefined})).toBe(false);
});
it('rejects stale invocations before any metadata mutation',()=>{
 const f=setup([row()]),n=f.node('a'),invocation=f.editor.textRanges.snapshot(n.key,0,3);f.editor.commands.replaceInlineRange(n.key,0,0,'changed');
 expect(()=>f.editor.commandRegistry.execute('tabs.orientation.vertical',{targetKey:n.key,args:{invocation}})).toThrow();expect((f.node('row').payload.metadata as any).orientation).toBe('horizontal');
});
it('keeps command discovery and eligible creation bounded with 40 unrelated Documents',async()=>{
 const f=setup([p('a')],40);f.focus('a');const snapshot=vi.spyOn(f.editor.repository,'snapshot'),build=vi.spyOn(f.view as any,'build');
 const read=vi.spyOn(f.editor.repository.readState().contents[f.node('other-text-0').contentKey],'payload','get');
 for(const query of ['','t','ta','tab','tabs','tabs create','tabs create vertical'])tabCommandCandidates(f.editor,f.node('a').key,query);
 await f.type('/tabs create vertical');await f.session()!.choose();await tick();expect(snapshot).not.toHaveBeenCalled();expect(build).not.toHaveBeenCalled();expect(read).not.toHaveBeenCalled();
});
it('does not cross the Document boundary into application Tabs',()=>{
 const f=setup([p('a')]);expect(tabCommandCandidates(f.editor,f.node('a').key,'tab delete')[0].disabled).toBe(true);
 const hosted=row('host');hosted.children![0].metadata={documentTarget:{version:1,documentId:'resource'},name:'Document'};
 f.editor.commands.insert(hosted,{kind:'at',parentKey:f.node('doc').key,index:1});
 expect(f.editor.commandRegistry.canExecute('tab.delete',{targetKey:f.node('host').key,args:undefined})).toBe(false);
 expect(f.editor.commandRegistry.canExecute('tabs.orientation.vertical',{targetKey:f.node('host').key,args:undefined})).toBe(true);
});

it('moves before in horizontal and vertical layouts using the same command',async()=>{
 for(const orientation of ['horizontal','vertical']){
  const f=setup([row('row',orientation)]);f.editor.setViewChild(f.node('row').key,f.node('row-b').key);await tick();f.focus('b');await f.type('/tab move before');const before=f.tree(),root=f.editor.mounts.get(f.node('b').key)!.root;await f.session()!.choose();await tick();expect(f.editor.mounts.get(f.node('b').key)!.root).toBe(root);expect(f.tree().children![0].children!.map(n=>n.id)).toEqual(['row-b','row-a']);f.editor.repository.undo();await tick();expect(f.tree()).toEqual(before);
 }
});

it('rejects ambiguous live reparenting without consuming the invocation',async()=>{
 const f=setup([row()]);f.editor.commands.transclude(f.node('row').key,{kind:'at',parentKey:f.node('doc').key,index:1});f.focus('a');await f.type('/tab move after');const before=f.tree(),s=f.session()!;await s.choose();expect(s.state.error).toContain('multiple occurrences');expect(f.tree()).toEqual(before);
});

function nestedRows(outerOrientation='vertical',innerOrientation='horizontal',after=false):ExistingBlockDto {
 const inner=row('inner',innerOrientation);
 const v1:ExistingBlockDto={id:'v1',type:'tab-block',metadata:{name:'v1',active:true},children:[inner]};
 const peer:ExistingBlockDto={id:'v2',type:'tab-block',metadata:{name:'v2'},children:[p('peer')]};
 return {id:'outer',type:'tab-row-block',metadata:{orientation:outerOrientation},children:after?[peer,v1]:[v1,peer]};
}
it.each(['tab add','tab rename Renamed v1','tab delete','tab move after','tab move before'])('targets the containing vertical Tab from h1: /%s --in vertical',async command=>{
 const f=setup([nestedRows('vertical','horizontal',command==='tab move before')]);f.focus('a');await f.type('/'+command+' --in vertical');const literal=f.tree(),s=f.session()!,innerPlacement=f.node('inner').placementKey;
 expect(parseTabCommand(command+' --in vertical')?.args?.in).toBe('vertical');expect(s.state.selected).toBe(parseTabCommand(command)!.id);
 const snapshots=vi.spyOn(f.editor.repository,'snapshot'),build=vi.spyOn(f.view as any,'build');await s.choose();await tick();expect(s.state.error).toBe('');expect(snapshots).not.toHaveBeenCalled();expect(build).not.toHaveBeenCalled();snapshots.mockRestore();
 const applied=f.tree(),outer=applied.children![0];
 if(command==='tab add'){expect(outer.children).toHaveLength(3);expect(f.node('inner').children).toHaveLength(2);}
 if(command.startsWith('tab rename')){expect((f.node('v1').payload.metadata as any).name).toBe('Renamed v1');expect((f.node('inner-a').payload.metadata as any).name).toBe('First');}
 if(command==='tab delete')expect(outer.children!.map(n=>n.id)).toEqual(['v2']);
 if(command==='tab move after')expect(outer.children!.map(n=>n.id)).toEqual(['v2','v1']);
 if(command==='tab move before')expect(outer.children!.map(n=>n.id)).toEqual(['v1','v2']);
 if(command!=='tab delete')expect(f.node('inner').placementKey).toBe(innerPlacement);
 f.editor.repository.undo();await tick();expect(f.tree()).toEqual(literal);f.editor.repository.redo();await tick();expect(f.tree()).toEqual(applied);
});
it('supports horizontal ancestor targeting and preserves unqualified nearest-row behavior',async()=>{
 const f=setup([nestedRows('horizontal','vertical')]);f.focus('a');await f.type('/tab add --in horizontal');await f.session()!.choose();await tick();expect(f.node('outer').children).toHaveLength(3);expect(f.node('inner').children).toHaveLength(2);
 f.editor.repository.undo();await tick();f.session()?.close();f.editor.commandRegistry.execute('tab.add',{targetKey:f.node('a').key,args:undefined});expect(f.node('outer').children).toHaveLength(2);expect(f.node('inner').children).toHaveLength(3);
});
it.each(['tab rename Name --in','tab rename Name --in v','tab rename Name --in sideways','tab add --in vertical --in horizontal'])('never executes an incomplete or invalid target as a nearest-row command: %s',query=>{
 const f=setup([nestedRows()]);expect(parseTabCommand(query)).toBeUndefined();expect(tabCommandCandidates(f.editor,f.node('a').key,query).every(c=>c.disabled)).toBe(true);
});
it('rejects a missing matching ancestor without consuming the command',async()=>{
 const f=setup([row()]);f.focus('a');await f.type('/tab delete --in vertical');const literal=f.tree(),s=f.session()!;expect(s.state.rows[0].disabled).toBe(true);await s.choose();expect(f.tree()).toEqual(literal);
});
it('resolves ancestor targets without snapshots, unrelated payload reads or workspace enumeration',()=>{
 const f=setup([nestedRows()],40),snapshot=vi.spyOn(f.editor.repository,'snapshot'),read=vi.spyOn(f.editor.repository.readState().contents[f.node('other-text-0').contentKey],'payload','get');
 const key=f.node('a').key,values=vi.spyOn(Object,'values');
 for(let i=0;i<10;i++)tabCommandCandidates(f.editor,key,'tab rename Outer --in vertical');
 const enumerations=values.mock.calls.length;values.mockRestore();
 expect(snapshot).not.toHaveBeenCalled();expect(read).not.toHaveBeenCalled();expect(enumerations).toBe(0);
});
