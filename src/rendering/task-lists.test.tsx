import { afterEach, expect, it, vi } from 'vitest';
import { render } from 'solid-js/web';
import { ReactiveEditor } from '../reactive-editor/editor';
import { registerCoreViews } from './register-core-views';
import { ReactiveTreeView } from './reactive-tree-view';
import { taskOwner, toggleTask } from '../runtime/tasks';
import { DocumentCounts } from '../runtime/document-counts';
import { createAutocompleteFeature } from '../features/autocomplete';
import { continueTaskPrefix } from '../runtime/text-lists';
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

it('keeps disabled feature and interrupted candidates literal', async () => {
  for (const make of [() => setup([list([p('source')])], false), () => setup([p('source', '-')], false)]) {
    const f = make(); if (f.blocks()[0].type !== 'indented-list-block') await f.input(' ');
    for (const c of '[x] ') await f.input(c);
    expect(f.node().payload.checked).toBeUndefined();
  }
  for (const interrupt of ['ArrowLeft', 'pointer', 'mutation', 'composition', 'paste']) {
    const f = setup(); await f.input(' '); await f.input('[');
    if (interrupt === 'pointer') f.mount().root.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    else if (interrupt === 'mutation') f.editor.commands.setPayloadField(f.node().key, 'metadata', { other: true });
    else if (interrupt === 'composition') await f.input('[', { isComposing: true });
    else if (interrupt === 'paste') await f.input('[', { inputType: 'insertFromPaste' });
    else await f.key(interrupt);
    for (const c of '[x] ') await f.input(c);
    expect(f.node().payload.checked).toBeUndefined();
  }
});

it.each(['[ ] ', '[x] ', '[X] ', '- [ ] '].flatMap(prefix => ['bullet', 'ordered', 'compound', 'table'].map(context => ({ prefix, context }))))
('converts $prefix in an existing $context item without wrapping or rebuilding', async ({ prefix, context }) => {
  const source = { ...p('source', 'Task'), standoffProperties: [{ id: 'bold', type: 'style/bold', start: 0, end: 3 }],
    relation: { leftMargin: { type: 'left-margin-block', children: [p('note', 'Note')] } } };
  const item = context === 'compound' ? { type: 'container-block', metadata: { htmlListItem: {} }, children: [source, p('extra', 'More')] } : source;
  const wrapper = { ...list([item, p('neighbour', 'Unchanged')]), metadata: { htmlList: { ordered: context === 'ordered', start: 3 } } };
  const f = setup([context === 'table' ? { type: 'table-block', children: [{ type: 'table-row-block', children: [{ type: 'table-cell-block', children: [wrapper] }] }] } : wrapper]);
  f.editor.featureHost.activate(createAutocompleteFeature(f.editor));
  f.focus(0);
  const node = f.node(), mount = f.mount(), parent = f.projection.parentOf(node.key)!, original = f.blocks();
  const other = f.editor.createView('second');
  const snapshots = vi.spyOn(f.editor.repository, 'snapshot'), indexes = vi.spyOn(f.editor.repository as any, 'rebuildReferences');
  const builds = [f.projection, other].map(v => vi.spyOn(v as any, 'build'));
  const wrap = vi.spyOn(f.editor.commands, 'wrapTextBlockInList');
  for (const ch of prefix) await f.input(ch);
  const owner = context === 'compound' ? parent : f.node();
  expect(owner.payload.checked).toBe(prefix.includes('x') || prefix.includes('X'));
  expect(f.projection.parentOf(node.key)?.key).toBe(parent.key);
  expect(f.node().placementKey).toBe(node.placementKey); expect(f.mount().root).toBe(mount.root);
  expect(f.mount().captureText!()).toBe('Task');
  expect(f.node().payload.standoffProperties).toEqual(source.standoffProperties);
  expect(f.mount().captureInlineSelection!()).toEqual({ anchor: 0, head: 0 });
  expect(f.host.querySelector('.reactive-task-checkbox')).not.toBeNull();
  f.editor.repository.undo(); await tick();
  expect(f.mount().captureText!()).toBe(prefix + 'Task'); expect(owner.payload.checked).toBeUndefined();
  f.editor.repository.redo(); await tick(); expect(f.mount().captureText!()).toBe('Task');
  expect(owner.payload.checked).toBe(prefix.includes('x') || prefix.includes('X'));
  expect(snapshots).not.toHaveBeenCalled(); expect(indexes).not.toHaveBeenCalled(); expect(wrap).not.toHaveBeenCalled();
  builds.forEach(build => expect(build).not.toHaveBeenCalled());
  const saved = f.blocks();
  const beforeItem = context === 'table' ? original[0].children![0].children![0].children![0] : original[0];
  const afterItem = context === 'table' ? saved[0].children![0].children![0].children![0] : saved[0];
  expect(afterItem.metadata).toEqual(beforeItem.metadata);
  expect(afterItem.children![1]).toEqual(beforeItem.children![1]);
  const savedSource = context === 'compound' ? afterItem.children![0].children![0] : afterItem.children![0];
  expect(savedSource.relation).toEqual(source.relation);
});

it.each(['[ ] ', '[x] '])('converts an empty nested item with %s and continues it with Enter', async prefix => {
  const f = setup([list([{ ...p('parent', 'Parent'), children: [list([p('source')])] }])]);
  f.editor.featureHost.activate(createAutocompleteFeature(f.editor));
  const parent = f.projection.parentOf(f.node().key)!;
  for (const ch of prefix) await f.input(ch);
  expect(f.node().payload.checked).toBe(prefix[1] === 'x');
  expect(f.projection.parentOf(f.node().key)?.key).toBe(parent.key);
  await f.input('Task'); await f.key('Enter');
  expect(parent.children).toHaveLength(2);
  expect(f.editor.node(parent.children[1])?.payload.checked).toBe(false);
});

it('preserves code, composition, paste, existing tasks and compound continuation paragraphs', async () => {
  const sources = [
    { ...p('source', '[ ]'), metadata: { htmlPreformatted: true } },
    { ...p('source', '[ ]'), standoffProperties: [{ type: 'code', start: 0, end: 2 }] },
    p('source', '[ ]', false),
  ];
  for (const source of sources) {
    const f = setup([list([source])]); await f.input(' ');
    expect(f.mount().captureText!()).toBe('[ ] '); expect(f.node().payload.checked).toBe(source.checked);
  }
  for (const options of [{ isComposing: true }, { inputType: 'insertFromPaste' }, { inputType: 'insertCompositionText' }]) {
    const f = setup([list([p('source', '[ ]')])]); await f.input(' ', options);
    expect(f.node().payload.checked).toBeUndefined();
  }
  const f = setup([list([{ type: 'container-block', metadata: { htmlListItem: {} }, children: [p('first', 'First'), p('source', '[ ]')] }])]);
  await f.input(' '); expect(f.mount().captureText!()).toBe('[ ] ');
  expect(f.projection.parentOf(f.node().key)?.payload.checked).toBeUndefined();
});

it('keeps ordinary spaces outside candidate offsets free of prefix reads and structural work', () => {
  const f = setup([list([p('source', 'Ordinary text')])]), key = f.node().key;
  const read = vi.spyOn(f.editor, 'node'), transaction = vi.spyOn(f.editor.commands, 'structuralTransaction');
  expect(continueTaskPrefix(f.editor, key, 13, 13, ' ')).toBe(false);
  expect(read).not.toHaveBeenCalled(); expect(transaction).not.toHaveBeenCalled();
});

it('keeps double-bracket Scry available in existing list items', async () => {
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', { configurable: true, value: () => new DOMRect(0, 0, 10, 20) });
  cleanup.push(() => { delete (Range.prototype as any).getBoundingClientRect; });
  const f = setup([list([p('source')])]); f.editor.featureHost.activate(createAutocompleteFeature(f.editor));
  await f.input('['); await f.input('[');
  expect(f.editor.overlays.overlays.length).toBeGreaterThan(0);
  expect(f.node().payload.checked).toBeUndefined();
  f.editor.completionInput!.cancel();
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
