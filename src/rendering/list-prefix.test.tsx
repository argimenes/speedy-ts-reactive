import { afterEach, expect, it, vi } from 'vitest';
import { render } from 'solid-js/web';
import { ReactiveEditor } from '../reactive-editor/editor';
import { registerCoreViews } from './register-core-views';
import { ReactiveTreeView } from './reactive-tree-view';
import { createAutocompleteFeature } from '../features/autocomplete';
import type { ExistingBlockDto } from '../block-tree/types';

const cleanup: (() => void)[] = [];
afterEach(() => { cleanup.splice(0).reverse().forEach(f => f()); document.body.replaceChildren(); localStorage.clear(); vi.restoreAllMocks(); });
const tick = async () => { await Promise.resolve(); await Promise.resolve(); };
const paragraph = (id = 'source', text = '-'): ExistingBlockDto => ({ id, type: 'standoff-editor-block', text });
const list = (children: ExistingBlockDto[]): ExistingBlockDto => ({ type: 'indented-list-block', children });
function setup(children = [paragraph(), paragraph('other', 'untouched')]) {
  const editor = new ReactiveEditor({ type: 'document-block', children }); registerCoreViews(editor);
  const projection = editor.createView('prefix'), host = document.body.appendChild(document.createElement('div'));
  const dispose = render(() => <ReactiveTreeView editor={editor} projection={projection} />, host); editor.installGateway(document);
  cleanup.push(() => { dispose(); editor.dispose(); });
  const node = (id = 'source') => Object.values(projection.state.nodes).find(n => n.payload.id === id)!;
  const mount = () => editor.mounts.get(node().key)!;
  const focus = (anchor = node().inlineContent.length, head = anchor) => { mount().focus(); mount().restoreInlineSelection!({ anchor, head }); };
  const input = async (data: string, options: InputEventInit = {}) => {
    document.activeElement!.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data, ...options })); await tick();
  };
  const enter = async () => { document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); await tick(); };
  const blocks = () => editor.encodeDocument().children!;
  const text = () => node().inlineContent.map(k => editor.node(k)!.payload.text).join('');
  focus(); return { editor, projection, host, node, mount, focus, input, enter, blocks, text };
}

it('converts the typed space, retains Block/placement identity and recovers the empty-item caret', async () => {
  const f = setup(); const identity = { content: f.node().contentKey, placement: f.node().placementKey };
  await f.input(' ');
  expect(f.blocks()[0]).toMatchObject({ type: 'indented-list-block', metadata: { htmlList: { ordered: false } }, children: [{ id: 'source', text: '' }] });
  expect(f.node().contentKey).toBe(identity.content); expect(f.node().placementKey).toBe(identity.placement);
  expect(document.activeElement).toBe(f.mount().focusElement); expect(f.mount().captureInlineSelection!()).toEqual({ anchor: 0, head: 0 });
  await f.input('item'); expect(f.text()).toBe('item');
});

it('one Undo restores the complete literal marker and Redo restores the same list', async () => {
  const f = setup(); await f.input(' '); const converted = f.blocks();
  f.editor.repository.undo(); await tick(); expect(f.blocks()[0]).toMatchObject({ id: 'source', type: 'standoff-editor-block', text: '- ' });
  expect(f.blocks()).toHaveLength(2);
  f.editor.repository.redo(); await tick(); expect(f.blocks()).toEqual(converted);
  f.focus(0); expect(document.activeElement).toBe(f.mount().focusElement);
  f.editor.repository.undo(); f.editor.repository.undo(); expect(f.text()).toBe('-');
});

it('uses native annotation remapping and preserves owned relations and child content', async () => {
  const source = { ...paragraph(), standoffProperties: [{ id: 'range', type: 'style/bold', start: 0, end: 0 }, { id: 'point', type: 'note', start: 0, end: 0, isZeroWidth: true, affinity: 'before' }], relation: { leftMargin: { type: 'left-margin-block', children: [paragraph('note', 'note')] } }, children: [paragraph('attachment', 'attached')] };
  const f = setup([source]); const baseline = new ReactiveEditor({ type: 'document-block', children: [source] }); cleanup.push(() => baseline.dispose());
  const view = baseline.createView(), original = Object.values(view.state.nodes).find(n => n.payload.id === 'source')!;
  baseline.commands.replaceInlineRange(original.key, 1, 1, ' '); const literal = baseline.encodeDocument().children![0];
  baseline.commands.replaceInlineRange(original.key, 0, 2, '');
  await f.input(' '); expect(f.node().payload.standoffProperties).toEqual(original.payload.standoffProperties);
  expect(f.blocks()[0].children![0].relation).toEqual(literal.relation); expect(f.blocks()[0].children![0].children).toEqual(literal.children);
  f.editor.repository.undo(); expect(f.blocks()[0]).toEqual(literal);
});

it('Enter continues the list and Enter on its empty next item exits it in one undoable operation', async () => {
  const f = setup(); await f.input(' '); await f.input('first'); await f.enter();
  expect(f.blocks()[0].children!.map(b => b.text)).toEqual(['first', '']);
  await f.enter(); expect(f.blocks().map(b => b.type)).toEqual(['indented-list-block', 'standoff-editor-block', 'standoff-editor-block']);
  const focused = f.editor.node(f.editor.focus.state.focusedKey!)!;
  expect(focused.inlineContent).toHaveLength(0); expect(f.projection.parentOf(focused.key)?.viewType).toBe('document-block');
  f.editor.repository.undo(); expect(f.blocks()[0].children!.map(b => b.text)).toEqual(['first', '']);
});

it('beforeinput Enter on a sole empty item removes the empty list wrapper', async () => {
  const f = setup(); await f.input(' '); await f.input('', { inputType: 'insertParagraph' });
  expect(f.blocks()[0]).toMatchObject({ id: 'source', type: 'standoff-editor-block', text: '' });
  expect(f.mount().captureInlineSelection!()).toEqual({ anchor: 0, head: 0 });
});

it('empty nested items exit one level, while prefix text already inside lists stays literal', async () => {
  const f = setup([list([{ ...paragraph('parent', 'parent'), children: [list([paragraph()])] }])]);
  await f.input(' '); expect(f.text()).toBe('- '); expect(f.projection.parentOf(f.node().key)?.viewType).toBe('indented-list-block');
  f.editor.commands.replaceInlineRange(f.node().key, 0, 2, ''); f.focus(0); await f.enter();
  expect(f.blocks()[0].children!.map(b => b.id)).toEqual(['parent', 'source']);
  expect(f.blocks()[0].children![0].children).toEqual([]);
});

it('keeps imported compound-item prefix and empty-paragraph Enter behaviour unchanged', async () => {
  const f = setup([list([{ type: 'container-block', metadata: { htmlListItem: {} }, children: [paragraph()] }])]);
  await f.input(' '); expect(f.text()).toBe('- ');
  f.editor.commands.replaceInlineRange(f.node().key, 0, 2, ''); f.focus(0); await f.enter();
  expect(f.blocks()[0].children![0].type).toBe('container-block'); expect(f.blocks()[0].children![0].children).toHaveLength(2);
});

it.each(['', 'text', '--', '*', '1.', '- suffix'])('does not convert unmatched text %j or start structural work', async text => {
  const f = setup([paragraph('source', text)]);
  const transaction = vi.spyOn(f.editor.commands, 'transaction'), snapshot = vi.spyOn(f.editor.repository, 'snapshot');
  await f.input(' '); expect(transaction).not.toHaveBeenCalled(); expect(snapshot).not.toHaveBeenCalled();
  expect(f.text()).toBe(text + ' ');
});

it.each([{ inputType: 'insertFromPaste' }, { inputType: 'insertCompositionText' }, { isComposing: true }])('does not convert paste/composition input %j', async options => {
  const f = setup(); const transaction = vi.spyOn(f.editor.commands, 'transaction'); await f.input(' ', options);
  expect(transaction).not.toHaveBeenCalled(); expect(f.blocks()[0].type).toBe('standoff-editor-block');
});

it.each(['style/code', 'text/literal', 'code', 'text/superposition'])('leaves %s annotation contexts literal', async type => {
  const f = setup([{ ...paragraph(), standoffProperties: [{ type, start: 0, end: 0 }] }]);
  await f.input(' '); expect(f.text()).toBe('- '); expect(f.blocks()[0].type).toBe('standoff-editor-block');
});

it('leaves preformatted Blocks and noncollapsed selections literal', async () => {
  const f = setup([{ ...paragraph(), metadata: { htmlPreformatted: true } }]); await f.input(' '); expect(f.text()).toBe('- ');
  const g = setup(); g.focus(0, 1); await g.input(' '); expect(g.text()).toBe(' '); expect(g.blocks()[0].type).toBe('standoff-editor-block');
});

it('does not convert multiple carets or cross-Block replacement', async () => {
  const f = setup(); const source = f.node(); f.editor.selections.setPrimary(source.key, source.contentKey, source.viewId, 1);
  f.editor.selections.addCaret(source.key, source.contentKey, source.viewId, 0); await f.input(' ');
  expect(f.blocks()[0].type).toBe('standoff-editor-block');
  const g = setup(); g.editor.crossText.enable(true);
  g.editor.crossText.set(g.editor.crossText.position(g.node().key, 1), g.editor.crossText.position(g.node('other').key, 0));
  await g.input(' '); expect(g.blocks().every(b => b.type !== 'indented-list-block')).toBe(true);
});

it('lets Scry own provisional source edits and does not convert the phrase on cancellation', async () => {
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', { configurable: true, value: () => new DOMRect(0, 0, 10, 20) });
  cleanup.push(() => { delete (Range.prototype as any).getBoundingClientRect; });
  const f = setup([paragraph('source', '')]); f.editor.featureHost.activate(createAutocompleteFeature(f.editor));
  await f.input('(('); await f.input('-'); await f.input(' ');
  expect(f.text()).toBe(''); expect(f.blocks()[0].type).toBe('standoff-editor-block');
  f.editor.completionInput!.cancel(); await tick(); expect(f.text()).toBe('- '); expect(f.blocks()[0].type).toBe('standoff-editor-block');
});
