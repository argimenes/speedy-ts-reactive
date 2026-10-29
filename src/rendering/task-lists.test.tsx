import { afterEach, expect, it, vi } from 'vitest';
import { render } from 'solid-js/web';
import { ReactiveEditor } from '../reactive-editor/editor';
import { registerCoreViews } from './register-core-views';
import { ReactiveTreeView } from './reactive-tree-view';
import { taskOwner, toggleTask } from '../runtime/tasks';
import { DocumentCounts } from '../runtime/document-counts';
import { createAutocompleteFeature } from '../features/autocomplete';
import type { ExistingBlockDto } from '../block-tree/types';
const cleanup: (() => void)[] = [];
afterEach(() => { cleanup.splice(0).reverse().forEach(f => f()); document.body.replaceChildren(); localStorage.clear(); vi.restoreAllMocks(); });
const tick = async () => { await Promise.resolve(); await Promise.resolve(); };
const p = (id: string, text = '', checked?: boolean): ExistingBlockDto => ({ id, type: 'standoff-editor-block', text, ...(checked === undefined ? {} : { checked }) });
const list = (children: ExistingBlockDto[]): ExistingBlockDto => ({ type: 'indented-list-block', children });
function setup(children = [p('source', '-')], enabled = true) {
  const editor = new ReactiveEditor({ type: 'document-block', children }, { features: { taskLists: enabled } }); registerCoreViews(editor);
  const projection = editor.createView('tasks'), host = document.body.appendChild(document.createElement('div'));
  const dispose = render(() => <ReactiveTreeView editor={editor} projection={projection} />, host); editor.installGateway(document);
  cleanup.push(() => { dispose(); editor.dispose(); });
  const node = (id = 'source') => Object.values(projection.state.nodes).find(n => n.payload.id === id)!;
  const mount = () => editor.mounts.get(node().key)!;
  const focus = (at = node().inlineContent.length) => { mount().focus(); mount().restoreInlineSelection!({ anchor: at, head: at }); };
  const input = async (data: string, options: InputEventInit = {}) => { document.activeElement!.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data, ...options })); await tick(); };
  const key = async (key: string, extra: KeyboardEventInit = {}) => { document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...extra })); await tick(); };
  const blocks = () => editor.encodeDocument().children!;
  focus(); return { editor, projection, host, node, mount, focus, input, key, blocks };
}

it.each(['[ ] ', '[x] ', '[X] '])('converts a fresh task %s with exact literal Undo and identity', async suffix => {
  const f = setup([{ ...p('source', '-'), standoffProperties: [{ id: 'mark', type: 'style/bold', start: 0, end: 0 }], relation: { leftMargin: { type: 'left-margin-block', children: [p('note', 'Note')] } } }]);
  f.editor.featureHost.activate(createAutocompleteFeature(f.editor));
  const placement = f.node().placementKey, content = f.node().contentKey;
  const snapshots = vi.spyOn(f.editor.repository, 'snapshot');
  await f.input(' '); for (const c of suffix) await f.input(c);
  expect(snapshots).not.toHaveBeenCalled();
  expect(f.blocks()[0]).toMatchObject({ type: 'indented-list-block', children: [{ id: 'source', text: '', checked: suffix[1] !== ' ' }] });
  expect(f.node().placementKey).toBe(placement); expect(f.node().contentKey).toBe(content);
  expect(f.mount().captureInlineSelection!()).toEqual({ anchor: 0, head: 0 });
  f.editor.repository.undo(); await tick();
  expect(f.blocks()[0]).toMatchObject({ id: 'source', text: '- ' + suffix, standoffProperties: [{ id: 'mark', start: 0, end: 0 }] });
  f.editor.repository.redo(); await tick(); expect(f.node().payload.checked).toBe(suffix[1] !== ' ');
  const saved = f.editor.encodeDocument(), reloaded = new ReactiveEditor(saved); cleanup.push(() => reloaded.dispose()); expect(reloaded.encodeDocument()).toEqual(saved);
});

it('keeps existing list items, pasted candidates, disabled feature and interrupted candidates literal', async () => {
  for (const make of [() => setup([list([p('source')])]), () => setup([p('source', '-')], false)]) {
    const f = make(); if (f.blocks()[0].type !== 'indented-list-block') await f.input(' ');
    for (const c of '[x] ') await f.input(c);
    expect(f.node().payload.checked).toBeUndefined();
  }
  for (const interrupt of ['ArrowLeft', 'pointer', 'mutation', 'composition', 'paste']) {
    const f = setup(); await f.input(' ');
    if (interrupt === 'pointer') f.mount().root.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    else if (interrupt === 'mutation') f.editor.commands.setPayloadField(f.node().key, 'metadata', { other: true });
    else if (interrupt === 'composition') await f.input('[', { isComposing: true });
    else if (interrupt === 'paste') await f.input('[', { inputType: 'insertFromPaste' });
    else await f.key(interrupt);
    for (const c of '[x] ') await f.input(c);
    expect(f.node().payload.checked).toBeUndefined();
  }
});

it.each(['standoff-editor-block', 'container-block', 'checkbox-block'])('toggles %s locally and isolates text, caret and history', async type => {
  const item = type === 'standoff-editor-block' ? p('source', 'Task', true) : { id: 'task', type, checked: true, children: [p('source', 'Task')] };
  const f = setup([list([item])]), owner = taskOwner(f.editor, f.node().key)!;
  const other = f.editor.createView('unrelated');
  const build = vi.spyOn(f.projection as any, 'build'), otherBuild = vi.spyOn(other as any, 'build'), snapshots = vi.spyOn(f.editor.repository, 'snapshot');
  const counts = new DocumentCounts(f.editor.repository, f.editor.repository.state.rootPlacementKey, async text => ({ words: text ? 1 : 0, characters: text.length, withoutWhitespace: text.length })); cleanup.push(() => counts.dispose());
  await counts.flush(); const schedule = vi.spyOn(counts as any, 'schedule');
  f.mount().focusElement.click(); expect(owner.payload.checked).toBe(true);
  expect(f.host.querySelector('.reactive-imported-list-marker')?.textContent).toBe('');
  const checkbox = f.host.querySelector<HTMLInputElement>('.reactive-task-checkbox')!;
  const selection = f.mount().captureInlineSelection!(); checkbox.click();
  expect(owner.payload.checked).toBe(false); expect(f.mount().captureInlineSelection!()).toEqual(selection);
  expect(build).not.toHaveBeenCalled(); expect(otherBuild).not.toHaveBeenCalled(); expect(snapshots).not.toHaveBeenCalled(); expect(schedule).not.toHaveBeenCalled();
  f.editor.repository.undo(); expect(owner.payload.checked).toBe(true); f.editor.repository.redo(); expect(owner.payload.checked).toBe(false);
  expect(toggleTask(f.editor, f.node().key)).toBe(true); expect(owner.payload.checked).toBe(true);
});

it('creates unchecked next tasks, splits tasks, exits empty tasks and preserves standalone outdent', async () => {
  const f = setup([list([p('source', 'Task', true)])]);
  await f.key('Enter'); expect(f.blocks()[0].children).toMatchObject([{ text: 'Task', checked: true }, { text: '', checked: false }]);
  await f.key('Enter'); expect(f.blocks()[1]).toMatchObject({ text: '', type: 'standoff-editor-block' }); expect(f.blocks()[1].checked).toBeUndefined();
  f.focus(2); await f.key('Enter'); expect(f.blocks()[0].children).toMatchObject([{ text: 'Ta', checked: true }, { text: 'sk', checked: false }]);
  f.focus(2); await f.key('Tab', { shiftKey: true }); expect(f.blocks().find(b => b.id === 'source')).toMatchObject({ type: 'standoff-editor-block', checked: true });
});

it.each(['container-block', 'checkbox-block'])('distinguishes paragraph splits and final task boundary in %s', async type => {
  const f = setup([list([{ id: 'task', type, checked: true, metadata: { htmlListItem: {} }, children: [p('first', 'First'), p('source', 'Last')] }])]);
  f.focus(2); await f.key('Enter'); expect(f.blocks()[0].children).toHaveLength(1); expect(f.blocks()[0].children![0].children!.map(n => n.text)).toEqual(['First', 'La', 'st']);
  const focused = f.editor.mounts.get(f.editor.focus.state.focusedKey!)!; focused.restoreInlineSelection!({ anchor: 2, head: 2 }); await f.key('Enter');
  expect(f.blocks()[0].children).toHaveLength(2); expect(f.blocks()[0].children![1].checked).toBe(false);
  f.focus(); await f.key('Tab', { shiftKey: true }); expect(f.blocks().find(b => b.id === 'task')).toMatchObject({ type, checked: true });
});

it('Scry owns input and invalidates fresh task recognition', async () => {
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', { configurable: true, value: () => new DOMRect(0, 0, 10, 20) }); cleanup.push(() => { delete (Range.prototype as any).getBoundingClientRect; });
  const f = setup(); f.editor.featureHost.activate(createAutocompleteFeature(f.editor)); await f.input(' '); await f.input('(('); for (const c of '[x] ') await f.input(c);
  f.editor.completionInput!.cancel(); await tick(); expect(f.node().payload.checked).toBeUndefined();
});

it.each(['container-block','checkbox-block'])('exits a sole empty compound task %s without losing history', async type => {
 const f=setup([list([{id:'task',type,checked:true,metadata:{htmlListItem:{}},children:[p('source')]}])]);
 const before=f.blocks();await f.key('Enter');expect(f.blocks()).toMatchObject([{id:'source',type:'standoff-editor-block',text:''}]);
 expect(f.blocks()[0].checked).toBeUndefined();f.editor.repository.undo();expect(f.blocks()).toEqual(before);
});
it('standalone tasks retain collapsible descendants and saved collapse state', async () => {
 const f=setup([{...p('source','Task',true),children:[list([p('child','Child')])]}]);
 const button=f.host.querySelector<HTMLButtonElement>('.reactive-task-disclosure')!;expect(button).not.toBeNull();button.click();
 expect(f.node().payload.metadata).toMatchObject({listCollapsed:true});expect(f.host.querySelector('.reactive-list')?.hasAttribute('hidden')).toBe(true);expect(f.node().payload.checked).toBe(true);
 const g=setup(f.blocks());expect(g.host.querySelector('.reactive-list')?.hasAttribute('hidden')).toBe(true);
});

it('a second opening bracket transfers the candidate to Scry', async () => {
 Object.defineProperty(Range.prototype, 'getBoundingClientRect', { configurable: true, value: () => new DOMRect(0, 0, 10, 20) }); cleanup.push(() => { delete (Range.prototype as any).getBoundingClientRect; });
 const f=setup();f.editor.featureHost.activate(createAutocompleteFeature(f.editor));await f.input(' ');await f.input('[');await f.input('[');
 expect(f.editor.overlays.overlays.length).toBeGreaterThan(0);expect(f.projection.parentOf(f.node().key)?.viewType).toBe('indented-list-block');await f.input('draft');await f.input(' ');expect(f.node().payload.checked).toBeUndefined();
 f.editor.completionInput!.cancel();await tick();expect(f.node().payload.checked).toBeUndefined();
});
it.each(['container-block','checkbox-block'])('Tab wraps a standalone %s task as one logical item', async type => {
 const f=setup([{id:'task',type,checked:true,children:[p('source','Task'),p('detail','Detail')]}]);const before=f.blocks()[0];
 await f.key('Tab');expect(f.blocks()[0]).toMatchObject({type:'indented-list-block',children:[before]});
 await f.key('Tab',{shiftKey:true});expect(f.blocks()).toEqual([before]);
});

it('direct-task Enter retains the bounded native paragraph path', async () => {
 const f=setup([list([p('source','Task',true)])]);const snapshot=vi.spyOn(f.editor.repository,'snapshot'),build=vi.spyOn(f.projection as any,'build');
 await f.key('Enter');expect(snapshot).not.toHaveBeenCalled();expect(build).not.toHaveBeenCalled();
 f.focus(2);await f.key('Enter');expect(snapshot).not.toHaveBeenCalled();expect(build).not.toHaveBeenCalled();
});
