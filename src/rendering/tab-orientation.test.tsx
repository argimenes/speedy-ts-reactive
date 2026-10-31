// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { render } from 'solid-js/web';
import { unwrap } from 'solid-js/store';
import { ReactiveEditor } from '../reactive-editor/editor';
import { registerCoreViews } from './register-core-views';
import { ReactiveTreeView } from './reactive-tree-view';
import { blockMenuItems } from '../runtime/block-menu-actions';
import type { ExistingBlockDto } from '../block-tree/types';
import { clone } from '../block-tree/clone';
import { applyHistoryChanges } from '../history/replay';

const cleanup: (() => void)[] = [];
afterEach(() => { cleanup.splice(0).reverse().forEach(stop => stop()); document.body.replaceChildren(); vi.restoreAllMocks(); });
const text = (id: string): ExistingBlockDto => ({ id, type: 'standoff-editor-block', text: 'Annotated text with a caret.', standoffProperties: [{ id: 'annotation-'+id, type: 'style/bold', start: 0, end: 8 }], relation: { leftMargin: { id: 'margin-'+id, type: 'left-margin-block', children: [{ id: 'note-'+id, type: 'standoff-editor-block', text: 'Margin note' }] } } });
const row = (id = 'row', orientation?: string): ExistingBlockDto => ({ id, type: 'tab-row-block', metadata: { ...(orientation ? { orientation } : {}), custom: 'keep' }, children: [
  { id: id+'-a', type: 'tab-block', metadata: { name: 'First', active: true }, children: [text(id+'-text')] },
  { id: id+'-b', type: 'tab-block', metadata: { name: 'Second tab with a longer label' }, children: [text(id+'-second')] },
] });
function setup(extra = 0, shared = false, enabled = true, initial?: string) {
  const editor = new ReactiveEditor({ id: 'workspace', type: 'workspace-block', children: [{ id: 'doc', type: 'document-block', metadata: { documentId: 'doc' }, children: [row('row', initial)] }, ...Array.from({length: extra}, (_,i) => ({ id: `other-${i}`, type: 'document-block', children: [text(`unrelated-${i}`)] }))] }, { features: { verticalTabs: enabled } });
  registerCoreViews(editor);
  const view = editor.createView('tabs');
  const node = (id: string) => Object.values(view.state.nodes).find(n => n.payload.id === id)!;
  if (shared) editor.commands.transclude(node('row').key, {kind:'at', parentKey:node('doc').key,index:1});
  const host = document.body.appendChild(document.createElement('div'));
  cleanup.push(() => editor.dispose()); cleanup.push(render(() => <ReactiveTreeView editor={editor} projection={view} />, host));
  const change = (orientation: string) => editor.commandRegistry.execute(`tabs.orientation.${orientation}`, {targetKey:node('row').key,args:undefined});
  return { editor, view, host, node, change };
}
it.each([undefined, 'sideways'])('defaults %s orientation to horizontal; menu changes the existing row canonically', initial => {
  const f = setup(0,false,true,initial);
  expect(f.host.querySelector('[role=tablist]')?.getAttribute('aria-orientation')).toBe('horizontal');
  const menu = blockMenuItems(f.editor,f.node('row').key).find(i=>i.label==='Tab orientation')!;
  expect(menu.children?.map(i=>[i.label,i.disabled])).toEqual([['Horizontal',true],['Vertical',false]]);
  menu.children![1].run!();
  expect(f.host.querySelector('.reactive-tabs')?.getAttribute('data-tab-orientation')).toBe('vertical');
  expect(f.node('row').payload.metadata).toEqual({custom:'keep',orientation:'vertical'});
  const actions = blockMenuItems(f.editor,f.node('row-text').key).find(i=>i.label==='Tabs')!.children!;
  expect(actions.map(i=>i.label)).toContain('Move down');
});
it.each([false,true])('preserves active tab, editors, selections, identity, annotations and history (shared=%s)', shared => {
  const f=setup(0,shared),r=f.editor.repository;
  f.host.querySelectorAll<HTMLButtonElement>('[role=tab]')[1].click();
  const selected=f.host.querySelector('[role=tab][aria-selected=true]')!.textContent;
  const textNode=f.node('row-second'), mount=f.editor.mounts.get(textNode.key)!;
  mount.focus(); mount.restoreInlineSelection!({anchor:2,head:7});
  const keys=Object.keys(f.view.state.nodes), generations=[...Object.values(f.view.state.nodes)].map(n=>[n.key,f.editor.mounts.get(n.key)?.generation]);
  const payload=clone(unwrap(textNode.payload)), flow=mount.focusElement;
  let replay=r.snapshot(); const errors:unknown[]=[]; const stop=r.subscribeHistoryChanges(change=>{replay=applyHistoryChanges(replay,change);}, error=>errors.push(error));cleanup.push(stop);
  const snapshot=vi.spyOn(r,'snapshot'),build=vi.spyOn(f.view as any,'build'),structural=vi.spyOn(f.view as any,'updateStructural');
  f.change('vertical'); r.undo(); r.redo();
  expect(snapshot).not.toHaveBeenCalled();expect(build).not.toHaveBeenCalled();expect(structural).not.toHaveBeenCalled();
  expect(Object.keys(f.view.state.nodes)).toEqual(keys);expect(clone(unwrap(textNode.payload))).toEqual(payload);
  expect(generations).toEqual(Object.values(f.view.state.nodes).map(n=>[n.key,f.editor.mounts.get(n.key)?.generation]));
  expect(f.editor.mounts.get(textNode.key)!.focusElement).toBe(flow);expect(document.activeElement).toBe(flow);
  expect(mount.captureInlineSelection!()).toEqual({anchor:2,head:7});
  expect(f.host.querySelector('[role=tab][aria-selected=true]')!.textContent).toBe(selected);
  expect([...f.host.querySelectorAll('.reactive-tabs')].every(el=>el.getAttribute('data-tab-orientation')==='vertical')).toBe(true);
  expect(errors).toEqual([]);expect(replay).toEqual(clone(unwrap(r.readState())));
});
it.each([0,40])('does bounded work with %i unrelated Documents and multiple projections', extra => {
  const f=setup(extra,true), second=f.editor.createView('second', f.node('doc').placementKey);
  const builds=[f.view,second].map(view=>vi.spyOn(view as any,'build'));
  const snapshot=vi.spyOn(f.editor.repository,'snapshot'),reindex=vi.spyOn(f.editor.repository as any,'rebuildReferences');
  const unrelated=extra ? f.editor.createView('unrelated',f.node('other-0').placementKey) : undefined;
  const publish=unrelated&&vi.spyOn(unrelated as any,'setState');
  const reads=extra&&vi.spyOn(f.editor.repository.readState().contents[f.node('unrelated-0').contentKey],'payload','get');
  for(let i=0;i<4;i++)f.change(i%2?'horizontal':'vertical');
  expect(snapshot).not.toHaveBeenCalled();expect(reindex).not.toHaveBeenCalled();builds.forEach(spy=>expect(spy).not.toHaveBeenCalled());
  if(publish)expect(publish).not.toHaveBeenCalled();if(reads)expect(reads).not.toHaveBeenCalled();
});
it('renders mixed nesting in a table cell without changing the nested orientation',()=>{
  const f=setup();
  f.editor.commands.insert({type:'table-block',children:[{type:'table-row-block',children:[{type:'table-cell-block',children:[{type:'container-block',children:[row('inner','horizontal')]}]}]}]}, {kind:'at',parentKey:f.node('row-a').key,index:1});
  f.change('vertical');
  const inner=f.host.querySelector('[data-block-id="inner"]')!;
  expect(inner.getAttribute('data-tab-orientation')).toBe('horizontal');
  f.editor.commandRegistry.execute('tabs.orientation.vertical',{targetKey:f.node('inner').key,args:undefined});f.change('horizontal');
  expect(inner.getAttribute('data-tab-orientation')).toBe('vertical');
});
it('leaves stored metadata intact with the feature off and offers no orientation actions',()=>{
  const f=setup(0,false,false,'vertical');
  expect(f.host.querySelector('.reactive-tabs')?.getAttribute('data-tab-orientation')).toBe('horizontal');
  expect(blockMenuItems(f.editor,f.node('row').key).some(i=>i.label==='Tab orientation')).toBe(false);
  expect(()=>f.change('horizontal')).toThrow('not available');expect((f.node('row').payload.metadata as any).orientation).toBe('vertical');
});
it('does not use the orientation-only optimisation for other payload or structure changes',()=>{
  const f=setup(); const changes:any[]=[];cleanup.push(f.editor.repository.subscribeChanges(c=>changes.push(c)));
  f.editor.commands.setPayloadField(f.node('row').key,'metadata',{custom:'changed',orientation:'vertical'});
  expect(changes.at(-1).structural?.tabOrientationOwner).toBeUndefined();
  f.editor.commands.insert({type:'tab-block',children:[]},{kind:'at',parentKey:f.node('row').key,index:2});
  expect(changes.at(-1).structural?.tabOrientationOwner).toBeUndefined();
});

it('supports ordinary Document TabRows through the same renderer and commands',()=>{
  const f=setup(), pages=row('pages');pages.type='document-tab-row-block';pages.children!.forEach(child=>child.type='document-tab-block');
  f.editor.commands.insert(pages,{kind:'at',parentKey:f.node('doc').key,index:1});
  blockMenuItems(f.editor,f.node('pages').key).find(i=>i.label==='Tab orientation')!.children![1].run!();
  expect(f.host.querySelector('[data-block-id="pages"]')?.getAttribute('data-tab-orientation')).toBe('vertical');
});
it('rejects the fast-path proof for a compound orientation and content commit',()=>{
  const f=setup(), changes:any[]=[];cleanup.push(f.editor.repository.subscribeChanges(c=>changes.push(c)));
  f.editor.commands.structuralTransaction('Compound edit',()=>{
    f.change('vertical');f.editor.commands.setPayloadField(f.node('row-text').key,'text','Changed content');
  });
  expect(changes).toHaveLength(1);expect(changes[0].structural?.tabOrientationOwner).toBeUndefined();
  expect(f.node('row-text').payload.text).toBe('Changed content');
});
