import { afterEach, expect, it, vi } from 'vitest';
import { render } from 'solid-js/web';
import { ReactiveEditor } from '../reactive-editor/editor';
import { registerCoreViews } from './register-core-views';
import { ReactiveTreeView } from './reactive-tree-view';
import { createAutocompleteFeature } from '../features/autocomplete';
import { convertTypedListPrefix } from '../runtime/text-lists';
import type { ExistingBlockDto } from '../block-tree/types';

const cleanup: (() => void)[] = [];
afterEach(() => { cleanup.splice(0).reverse().forEach(f => f()); document.body.replaceChildren(); localStorage.clear(); vi.restoreAllMocks(); });
const tick = async () => { await Promise.resolve(); await Promise.resolve(); };
const paragraph = (id = 'source', text = '-'): ExistingBlockDto => ({ id, type: 'standoff-editor-block', text });
const prefixes = ['-', '*', '1.', '3.', '123456789.', '9007199254740991.', '0003.'];
const metadataFor = (prefix: string) => prefix.endsWith('.') ? { ordered: true, start: Number(prefix.slice(0, -1)) } : { ordered: false };
const list = (children: ExistingBlockDto[]): ExistingBlockDto => ({ type: 'indented-list-block', children });
const table = (family: string, children: ExistingBlockDto[]): ExistingBlockDto => ({ id: 'table', type: `${family}-block`, children: [
  { type: `${family}-row-block`, children: [
    { id: 'cell', type: `${family}-cell-block`, children },
    { id: 'neighbour', type: `${family}-cell-block`, children: [paragraph('other', 'untouched')] },
  ] },
] });
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

it.each(prefixes)('converts %s, retains identity and recovers the empty-item caret', async prefix => {
  const f = setup([paragraph('source', prefix), paragraph('other', 'untouched')]); const identity = { content: f.node().contentKey, placement: f.node().placementKey };
  await f.input(' ');
  expect(f.blocks()[0]).toMatchObject({ type: 'indented-list-block', metadata: { htmlList: metadataFor(prefix) }, children: [{ id: 'source', text: '' }] });
  expect(f.node().contentKey).toBe(identity.content); expect(f.node().placementKey).toBe(identity.placement);
  expect(document.activeElement).toBe(f.mount().focusElement); expect(f.mount().captureInlineSelection!()).toEqual({ anchor: 0, head: 0 });
  expect(f.host.querySelector('.reactive-imported-list-marker')?.textContent).toBe(prefix.endsWith('.') ? `${Number(prefix.slice(0, -1))}.` : '•');
  await f.input('item'); expect(f.text()).toBe('item');
});

it.each(['table', 'grid'].flatMap(family => ['-', '1.'].flatMap(prefix => [false, true].map(inList => ({ family, prefix, inList })))))
('converts $prefix inside a $family cell (outer list=$inList) without changing surrounding structure', async ({ family, prefix, inList }) => {
  const layout = table(family, [paragraph('source', '')]);
  const f = setup(inList ? [list([{ type: 'container-block', metadata: { htmlListItem: {} }, children: [layout] }])] : [layout]);
  const source = f.node(), root = f.mount().root, cell = f.node('cell'), neighbour = f.node('other');
  for (const ch of prefix) await f.input(ch);
  const snapshot = vi.spyOn(f.editor.repository, 'snapshot'), build = vi.spyOn(f.projection as any, 'build');
  const indexes = vi.spyOn(f.editor.repository as any, 'rebuildReferences');
  await f.input(' ');
  const wrapper = f.projection.parentOf(source.key)!;
  expect(wrapper.viewType).toBe('indented-list-block');
  expect(wrapper.payload.metadata).toMatchObject({ htmlList: metadataFor(prefix) });
  expect(f.projection.parentOf(wrapper.key)?.placementKey).toBe(cell.placementKey);
  expect(f.node().placementKey).toBe(source.placementKey); expect(f.mount().root).toBe(root);
  expect(f.mount().captureInlineSelection!()).toEqual({ anchor: 0, head: 0 });
  expect(f.node('other').placementKey).toBe(neighbour.placementKey);
  f.editor.repository.undo(); await tick(); expect(f.text()).toBe(prefix+' ');
  expect(f.projection.parentOf(source.key)?.placementKey).toBe(cell.placementKey);
  f.editor.repository.redo(); await tick(); expect(f.projection.parentOf(source.key)?.placementKey).toBe(wrapper.placementKey);
  expect(snapshot).not.toHaveBeenCalled(); expect(build).not.toHaveBeenCalled(); expect(indexes).not.toHaveBeenCalled();
  f.focus(0); await f.input('first'); await f.enter(); await f.input('second');
  expect(f.editor.node(wrapper.key)?.children).toHaveLength(2);
  await f.enter(); await f.enter();
  expect(f.projection.parentOf(f.editor.focus.state.focusedKey!)?.placementKey).toBe(cell.placementKey);
});

it.each(['table', 'grid'])('preserves existing-list and literal exclusions within %s cells', async family => {
  const existing = setup([table(family, [list([paragraph()])])]);
  await existing.input(' '); expect(existing.text()).toBe('- ');
  expect(existing.projection.parentOf(existing.node().key)?.viewType).toBe('indented-list-block');
  const literal = setup([{ type: 'container-block', metadata: { htmlPreformatted: true }, children: [table(family, [paragraph()])] }]);
  await literal.input(' '); expect(literal.text()).toBe('- ');
  expect(literal.projection.parentOf(literal.node().key)?.viewType).toBe(`${family}-cell-block`);
});

it.each(prefixes)('one Undo restores literal %s and Redo restores the same list', async prefix => {
  const f = setup([paragraph('source', prefix), paragraph('other', 'untouched')]); await f.input(' '); const converted = f.blocks();
  f.editor.repository.undo(); await tick(); expect(f.blocks()[0]).toMatchObject({ id: 'source', type: 'standoff-editor-block', text: prefix + ' ' });
  expect(f.blocks()).toHaveLength(2);
  f.editor.repository.redo(); await tick(); expect(f.blocks()).toEqual(converted);
  f.focus(0); expect(document.activeElement).toBe(f.mount().focusElement);
  f.editor.repository.undo(); f.editor.repository.undo(); expect(f.text()).toBe(prefix);
});

it.each(['-', '*', '3.', '123456789.'])('uses native annotation remapping and preserves relations for %s', async prefix => {
  const source = { ...paragraph('source', prefix), standoffProperties: [{ id: 'range', type: 'style/bold', start: 0, end: 0 }, { id: 'point', type: 'note', start: 0, end: 0, isZeroWidth: true, affinity: 'before' }], relation: { leftMargin: { type: 'left-margin-block', children: [paragraph('note', 'note')] } }, children: [paragraph('attachment', 'attached')] };
  const f = setup([source]); const baseline = new ReactiveEditor({ type: 'document-block', children: [source] }); cleanup.push(() => baseline.dispose());
  const view = baseline.createView(), original = Object.values(view.state.nodes).find(n => n.payload.id === 'source')!;
  baseline.commands.replaceInlineRange(original.key, prefix.length, prefix.length, ' '); const literal = baseline.encodeDocument().children![0];
  baseline.commands.replaceInlineRange(original.key, 0, prefix.length + 1, '');
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

it.each(prefixes)('keeps %s literal inside existing nested lists and exits empty items', async prefix => {
  const f = setup([list([{ ...paragraph('parent', 'parent'), children: [list([paragraph('source', prefix)])] }])]);
  await f.input(' '); expect(f.text()).toBe(prefix + ' '); expect(f.projection.parentOf(f.node().key)?.viewType).toBe('indented-list-block');
  f.editor.commands.replaceInlineRange(f.node().key, 0, prefix.length + 1, ''); f.focus(0); await f.enter();
  expect(f.blocks()[0].children!.map(b => b.id)).toEqual(['parent', 'source']);
  expect(f.blocks()[0].children![0].children).toEqual([]);
});

it('keeps imported compound-item prefix and empty-paragraph Enter behaviour unchanged', async () => {
  const f = setup([list([{ type: 'container-block', metadata: { htmlListItem: {} }, children: [paragraph()] }])]);
  await f.input(' '); expect(f.text()).toBe('- ');
  f.editor.commands.replaceInlineRange(f.node().key, 0, 2, ''); f.focus(0); await f.enter();
  expect(f.blocks()[0].children![0].type).toBe('container-block'); expect(f.blocks()[0].children![0].children).toHaveLength(2);
});

it.each(['', 'text', '--', '**', '0.', '00.', '-1.', '+1.', '1.5.', '1e2.', '1..', 'a.', ' 1.', '1. suffix', '9007199254740992.', '- [ ]', '- [x]', '- suffix'])('does not convert unmatched text %j or start structural work', async text => {
  const f = setup([paragraph('source', text)]);
  const wrap = vi.spyOn(f.editor.commands, 'wrapTextBlockInList'), transaction = vi.spyOn(f.editor.commands, 'transaction'), snapshot = vi.spyOn(f.editor.repository, 'snapshot');
  await f.input(' '); expect(wrap).not.toHaveBeenCalled(); expect(transaction).not.toHaveBeenCalled(); expect(snapshot).not.toHaveBeenCalled();
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

it.each(['-', '*', '1.', '3.', '123456789.'])('lets Scry own %s source input without converting on cancellation', async prefix => {
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', { configurable: true, value: () => new DOMRect(0, 0, 10, 20) });
  cleanup.push(() => { delete (Range.prototype as any).getBoundingClientRect; });
  const f = setup([paragraph('source', '')]); f.editor.featureHost.activate(createAutocompleteFeature(f.editor));
  await f.input('(('); await f.input(prefix); await f.input(' ');
  expect(f.text()).toBe(''); expect(f.blocks()[0].type).toBe('standoff-editor-block');
  f.editor.completionInput!.cancel(); await tick(); expect(f.text()).toBe(prefix + ' '); expect(f.blocks()[0].type).toBe('standoff-editor-block');
});

it.each(['*', '3.'])('preserves the input exclusions for %s', async prefix => {
  for (const options of [{ inputType: 'insertFromPaste' }, { inputType: 'insertCompositionText' }, { isComposing: true }]) {
    const f = setup([paragraph('source', prefix)]); await f.input(' ', options);
    expect(f.blocks()[0].type).toBe('standoff-editor-block');
  }
  for (const type of ['code', 'text/literal', 'text/superposition']) {
    const f = setup([{ ...paragraph('source', prefix), standoffProperties: [{ type, start: 0, end: prefix.length - 1 }] }]);
    await f.input(' '); expect(f.text()).toBe(prefix + ' '); expect(f.blocks()[0].type).toBe('standoff-editor-block');
  }
  const code = setup([{ ...paragraph('source', prefix), metadata: { htmlPreformatted: true } }]);
  await code.input(' '); expect(code.text()).toBe(prefix + ' ');
  const range = setup([paragraph('source', prefix)]); range.focus(0, prefix.length); await range.input(' ');
  expect(range.blocks()[0].type).toBe('standoff-editor-block');
  const multiple = setup([paragraph('source', prefix)]), source = multiple.node();
  multiple.editor.selections.setPrimary(source.key, source.contentKey, source.viewId, prefix.length);
  multiple.editor.selections.addCaret(source.key, source.contentKey, source.viewId, 0); await multiple.input(' ');
  expect(multiple.blocks()[0].type).toBe('standoff-editor-block');
});

it.each(['1.', '3.', '123456789.', '9007199254740991.'])('keeps numbering and start through Enter, indentation and exit for %s', async prefix => {
  const f = setup([paragraph('source', prefix)]), start = BigInt(prefix.slice(0, -1));
  const markers = () => [...f.host.querySelectorAll('.reactive-imported-list-marker')].map(n => n.textContent);
  const tab = async (shiftKey = false) => { document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true })); await tick(); };
  await f.input(' '); await f.input('first'); await f.enter(); await f.input('second');
  expect(markers()).toEqual([`${start}.`, `${start + 1n}.`]);
  await tab(); expect(f.blocks()[0].children![0].children![0].metadata).toMatchObject({ htmlList: metadataFor(prefix) });
  await tab(true); expect(markers()).toEqual([`${start}.`, `${start + 1n}.`]);
  await f.enter(); expect(markers()).toEqual([`${start}.`, `${start + 1n}.`, `${start + 2n}.`]);
  await f.enter(); expect(f.blocks()).toHaveLength(2); expect(markers()).toEqual([`${start}.`, `${start + 1n}.`]);
  expect(f.blocks()[0].metadata).toMatchObject({ htmlList: metadataFor(prefix) });
});


it('rejects long unmatched paragraphs with a constant number of Cell reads', () => {
  const editor = new ReactiveEditor({ type: 'document-block', children: [paragraph('source', 'x'.repeat(10000))] });
  cleanup.push(() => editor.dispose());
  const view = editor.createView(), key = view.state.nodes[view.state.rootKey].children[0];
  const read = vi.spyOn(editor, 'node'), wrap = vi.spyOn(editor.commands, 'wrapTextBlockInList');
  expect(convertTypedListPrefix(editor, key, 10000)).toBe(false);
  expect(read).toHaveBeenCalledTimes(2); expect(wrap).not.toHaveBeenCalled();
});
