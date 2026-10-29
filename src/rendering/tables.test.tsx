import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { render } from 'solid-js/web';
import { ReactiveEditor } from '../reactive-editor/editor';
import { registerCoreViews } from './register-core-views';
import { ReactiveTreeView } from './reactive-tree-view';
import type { ExistingBlockDto } from '../block-tree/types';
import type { TableRequest } from '../runtime/tables';
import type { HistoryChanges } from '../block-tree/compact-changes';
import { applyHistoryChanges } from '../history/replay';
import { captureNative, nativeText, admitNative } from '../persistence/native-resource';

const cleanup: (() => void)[] = [];
// jsdom has no layout; browser qualification supplies real paint/geometry evidence.
beforeEach(() => { Range.prototype.getBoundingClientRect = () => new DOMRect(30, 30, 1, 20); Range.prototype.getClientRects = () => [new DOMRect(30, 30, 1, 20)] as unknown as DOMRectList; });
afterEach(() => { cleanup.splice(0).reverse().forEach(f => f()); document.body.replaceChildren(); vi.restoreAllMocks(); });
const tick = async () => { await Promise.resolve(); await Promise.resolve(); };
const p = (id: string, text = id, extra: Record<string, unknown> = {}): ExistingBlockDto => ({ id, type: 'standoff-editor-block', text, ...extra });
const table = (family = 'table', contents: ExistingBlockDto[][][] = [[[p('a')], [p('b')]], [[p('c')], [p('d')]]]): ExistingBlockDto => ({
  id: 'table', type: `${family}-block`, children: contents.map((cells, r) => ({ id: `row${r}`, type: `${family}-row-block`, children: cells.map((children, c) => ({ id: `cell${r}${c}`, type: `${family}-cell-block`, children })) })),
});
function setup(children: ExistingBlockDto[] = [p('a'), p('b'), p('c')], features = {}) {
  const editor = new ReactiveEditor({ id: 'doc', type: 'document-block', children }, { features });
  registerCoreViews(editor); const view = editor.createView('table-test'), host = document.body.appendChild(document.createElement('div'));
  const dispose = render(() => <ReactiveTreeView editor={editor} projection={view} />, host); editor.installGateway(document);
  cleanup.push(() => { dispose(); editor.dispose(); });
  const node = (id: string) => Object.values(view.state.nodes).find(n => n.payload.id === id)!;
  const key = (id: string) => node(id).key;
  const focus = (id: string, start = 0, end = start) => { const m = editor.mounts.get(key(id))!; m.focus(); m.restoreInlineSelection?.({ anchor: start, head: end }); };
  const run = (request: TableRequest) => editor.tables.run(request);
  // Focus is transient session state updated by the existing focus service.
  // Compare authored document content; assert actual caret positions separately.
  const tree = () => { const result = editor.encodeDocument(); if (result.metadata) { delete (result.metadata as Record<string, unknown>).focus; if (!Object.keys(result.metadata).length) delete result.metadata; } return result; };
  const cellIds = () => tree().children!.find(b => b.id === 'table')!.children!.map(r => r.children!.map(c => c.id));
  return { editor, view, host, node, key, focus, run, tree, cellIds };
}

it.each([1, 3, 5])('distributes %s original Blocks without copying their subtrees', async count => {
  const children = Array.from({ length: count }, (_, i) => p(`p${i}`, `Text ${i}`, { standoffProperties: [{ id: `ann${i}`, type: 'codex/entity-reference', value: 'entity', start: 0, end: 3 }] }));
  const f = setup([p('before'), ...children, p('after')]), before = f.tree();
  const identity = children.map(n => ({ key: f.node(n.id!).contentKey, placement: f.node(n.id!).placementKey, root: f.editor.mounts.get(f.key(n.id!))!.root }));
  f.focus('p0', 2);
  const snapshots = vi.spyOn(f.editor.repository, 'snapshot');
  const plan = f.editor.tables.prepare({ kind: 'create', targets: children.map(n => f.key(n.id!)), columns: 3 });
  expect(snapshots).not.toHaveBeenCalled(); f.editor.tables.execute(plan); await tick();
  expect(snapshots).not.toHaveBeenCalled();
  const layout = f.tree().children![1]; expect(layout.type).toBe('table-block'); expect(layout.children).toHaveLength(Math.ceil(count / 3));
  const contents = layout.children!.flatMap(r => r.children!.map(c => c.children![0]));
  expect(contents.slice(0, count)).toEqual(children.map(n => before.children!.find(c => c.id === n.id)));
  expect(contents.slice(count).every(n => n.type === 'standoff-editor-block' && n.text === '')).toBe(true);
  children.forEach((n, i) => { expect(f.node(n.id!).contentKey).toBe(identity[i].key); expect(f.node(n.id!).placementKey).toBe(identity[i].placement); expect(f.editor.mounts.get(f.key(n.id!))!.root).toBe(identity[i].root); });
  expect(f.editor.mounts.get(f.key('p0'))!.captureInlineSelection!()).toEqual({ anchor: 2, head: 2 });
  const after = f.tree(); f.editor.repository.undo(); await tick(); expect(f.tree()).toEqual(before);
  f.editor.repository.redo(); await tick(); expect(f.tree()).toEqual(after);
});

it('removes only a mid-paragraph invocation, restores exact history and caret, and replays the durable journal', async () => {
  const f = setup([p('source', 'Alpha /c2 Beta', { standoffProperties: [{ id: 'entity', type: 'codex/entity-reference', value: 'E', start: 0, end: 4 }, { id: 'point', type: 'note', start: 7, end: 7, isZeroWidth: true }], relation: { leftMargin: { id: 'margin', type: 'left-margin-block', children: [p('note')] } } })]);
  f.focus('source', 9);
  const before = f.tree(), base = f.editor.repository.snapshot(), events: HistoryChanges[] = [];
  const stop = f.editor.repository.subscribeHistoryChanges(e => events.push(e as HistoryChanges), error => { throw error; });
  const range = f.editor.textRanges.snapshot(f.key('source'), 6, 9);
  f.editor.tables.run({ kind: 'create', targets: [f.key('source')], columns: 2 }, range); await tick();
  expect(f.tree().children![0].children![0].children![0].children![0].text).toBe('Alpha  Beta');
  const m = () => f.editor.mounts.get(f.key('source'))!;
  expect(m().captureInlineSelection!()).toEqual({ anchor: 6, head: 6 }); const after = f.tree();
  for (let i = 0; i < 2; i++) {
    f.editor.repository.undo(); await tick(); expect(f.tree()).toEqual(before); expect(m().captureInlineSelection!()).toEqual({ anchor: 9, head: 9 });
    f.editor.repository.redo(); await tick(); expect(f.tree()).toEqual(after); expect(m().captureInlineSelection!()).toEqual({ anchor: 6, head: 6 });
  }
  stop(); expect(events.reduce((state, event) => applyHistoryChanges(state, event), base)).toEqual(f.editor.repository.snapshot());
});

it('supports different vertically flowing Block counts in adjacent cells, including ordinary Enter and Tab', async () => {
  const f = setup([table('table', [[[p('a', 'Alpha'), p('b', 'Beta'), { id: 'container', type: 'container-block', children: [p('nested')] }], [p('c', 'Other'), p('d', 'Second paragraph')]]])]);
  f.focus('b', 2); document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); await tick();
  const cells = f.tree().children![0].children![0].children!;
  expect(cells[0].children!.map(n => n.text ?? n.id)).toEqual(['Alpha', 'Be', 'ta', 'container']); expect(cells[1].children!.map(n => n.text)).toEqual(['Other', 'Second paragraph']);
  f.focus('a', 3); document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })); await tick();
  expect(f.tree().children![0].children![0].children![0].children![0].type).toBe('indented-list-block');
});

it.each(['table', 'grid'])('swaps %s cells and rows without moving column widths or changing content', async family => {
  const f = setup([{ ...table(family), metadata: { tableColumns: { version: 1, weights: [30, 70] } } }]);
  const before = f.tree(), original = f.node('a').placementKey;
  f.focus('a', 1); f.run({ kind: 'swap-cell', target: f.key('a'), direction: 'right' }); await tick();
  expect(f.cellIds()).toEqual([['cell01', 'cell00'], ['cell10', 'cell11']]); expect(f.node('a').placementKey).toBe(original);
  expect(f.tree().children![0].metadata).toEqual(before.children![0].metadata);
  f.editor.repository.undo(); await tick(); expect(f.tree()).toEqual(before);
  f.run({ kind: 'swap-cell', target: f.key('a'), direction: 'down' }); await tick(); expect(f.cellIds()).toEqual([['cell10', 'cell01'], ['cell00', 'cell11']]);
  f.editor.repository.undo(); f.run({ kind: 'move-row', target: f.key('a'), direction: 'down' }); await tick(); expect(f.cellIds()).toEqual([['cell10', 'cell11'], ['cell00', 'cell01']]);
  f.editor.repository.undo(); expect(f.tree()).toEqual(before);
  expect(() => f.run({ kind: 'swap-cell', target: f.key('a'), direction: 'left' })).toThrow(/adjacent/); expect(f.tree()).toEqual(before);
});

it.each(['table', 'grid'])('transfers selected %s contents by appending, preserving both cells and standalone tasks', async family => {
  const f = setup([table(family, [[[p('a'), p('task', 'Task', { checked: true, children: [{ id: 'list', type: 'indented-list-block', children: [p('child')] }] })], [p('b')]]])]);
  const before = f.tree(), cellA = f.node('cell00').placementKey, cellB = f.node('cell01').placementKey;
  f.focus('task', 2); f.run({ kind: 'transfer', targets: [f.key('a'), f.key('task')], destination: f.key('cell01') }); await tick();
  expect(f.node('cell00').placementKey).toBe(cellA); expect(f.node('cell01').placementKey).toBe(cellB);
  const cells = f.tree().children![0].children![0].children!;
  expect(cells[0].children).toHaveLength(1); expect(cells[0].children![0].text).toBe(''); expect(cells[1].children!.map(n => n.id)).toEqual(['b', 'a', 'task']);
  expect(cells[1].children![2]).toEqual(before.children![0].children![0].children![0].children![1]);
  expect(f.editor.mounts.get(f.key('task'))!.captureInlineSelection!()).toEqual({ anchor: 2, head: 2 });
  f.editor.repository.undo(); await tick(); expect(f.tree()).toEqual(before);
});

it.each(['table', 'grid'])('inserts/removes %s rows and columns atomically and preserves future width metadata through native reload', async family => {
  const f = setup([{ ...table(family), metadata: { tableColumns: { version: 1, weights: [30, 70] }, future: 'preserve' } }]);
  const before = f.tree(); f.run({ kind: 'insert-column', target: f.key('a') }); await tick();
  expect(f.tree().children![0].metadata).toEqual({ tableColumns: { version: 1, weights: [30, 50, 70] }, future: 'preserve' });
  const added = f.tree().children![0].children![0].children![1].id!;
  f.run({ kind: 'remove-column', target: f.key(added) }); await tick(); expect(f.tree().children![0].children!.map(r => r.children!.map(c => c.id))).toEqual([['cell00', 'cell01'], ['cell10', 'cell11']]);
  expect(f.tree().children![0].metadata).toEqual(before.children![0].metadata);
  f.run({ kind: 'insert-row', target: f.key('a') }); await tick(); const row = f.tree().children![0].children![1];
  expect(row.type).toBe(`${family}-row-block`); expect(row.children).toHaveLength(2); f.run({ kind: 'remove-row', target: f.key(row.id!) }); await tick();
  const bytes = new TextEncoder().encode(nativeText(captureNative(f.editor.repository.readState(), 'doc')));
  const loaded = new ReactiveEditor({ id: 'bank', type: 'workspace-object-bank-block', children: [] }); cleanup.push(() => loaded.dispose());
  const state = loaded.repository.readState(), result = admitNative(loaded.repository, bytes, state.placements[state.rootPlacementKey].contentKey);
  const view = loaded.createView('loaded', result.placementKey); expect(Object.values(view.state.nodes).find(n => n.payload.id === 'table')!.payload.metadata).toEqual(before.children![0].metadata);
});

it('requires extraction for nonempty removals and preserves deterministic extraction order', async () => {
  const f = setup([table(), p('after')]); const before = f.tree();
  expect(() => f.run({ kind: 'remove-column', target: f.key('a') })).toThrow(/Review extraction/); expect(f.tree()).toEqual(before);
  const plan = f.editor.tables.prepare({ kind: 'remove-column', target: f.key('a'), extract: true }); expect(plan.extractedBlocks).toBe(2);
  f.editor.tables.execute(plan); await tick(); expect(f.tree().children!.map(n => n.id)).toEqual(['table', 'a', 'c', 'after']); expect(f.cellIds()).toEqual([['cell01'], ['cell11']]);
  f.editor.repository.undo(); await tick(); expect(f.tree()).toEqual(before);
});

it('dissolves only direct shells, retaining nested tables, lists, containers and both surface faces in row-major order', async () => {
  const surface: ExistingBlockDto = { id: 'surface', type: 'surface-block', metadata: { reversible: true }, children: [{ id: 'front', type: 'side-block', children: [p('a')] }, { id: 'back', type: 'side-block', children: [p('secret')] }] };
  const nested: ExistingBlockDto = { id: 'inner', type: 'table-block', children: [{ id: 'ir', type: 'table-row-block', children: [{ id: 'ic', type: 'table-cell-block', children: [p('innerText')] }] }] };
  const f = setup([p('before'), table('table', [[[surface, { id: 'group', type: 'container-block', children: [p('groupText')] }], [nested]], [[{ id: 'list', type: 'indented-list-block', children: [p('item')] }], [p('last')]]]), p('after')]);
  const before = f.tree(), root = f.editor.mounts.get(f.key('a'))!.root; f.focus('a', 1);
  f.run({ kind: 'dissolve', target: f.key('table') }); await tick();
  expect(f.tree().children!.map(n => n.id)).toEqual(['before', 'surface', 'group', 'inner', 'list', 'last', 'after']);
  expect(f.tree().children![3]).toEqual(nested); expect(f.editor.mounts.get(f.key('a'))!.root).toBe(root); expect(f.node('secret')).toBeDefined();
  const after = f.tree(); f.editor.repository.undo(); await tick(); expect(f.tree()).toEqual(before); f.editor.repository.redo(); await tick(); expect(f.tree()).toEqual(after);
});

it('rejects unsafe selections and individual list/task items without changing history or structure', () => {
  const f = setup([p('a'), p('b'), { id: 'list', type: 'indented-list-block', metadata: { htmlList: { ordered: true, start: 3 } }, children: [p('item', 'Task', { checked: true })] }]);
  const before = f.tree(), revision = f.editor.repository.state.revision;
  for (const targets of [[f.key('a'), f.key('list')], [f.key('a'), f.key('item')], [f.key('item')]]) expect(() => f.run({ kind: 'create', targets, columns: 2 })).toThrow();
  expect(f.tree()).toEqual(before); expect(f.editor.repository.state.revision).toBe(revision); expect(f.editor.repository.canUndo()).toBe(false);
  f.run({ kind: 'create', targets: [f.key('list')], columns: 2 }); expect(f.tree().children![2].children![0].children![0].children![0]).toEqual(before.children![2]);
});

it('requires explicit nested creation and refuses partial or malformed table operations', () => {
  const f = setup([table()]); const before = f.tree();
  expect(() => f.run({ kind: 'create', targets: [f.key('a')], columns: 2 })).toThrow(/nested/);
  expect(() => f.run({ kind: 'transfer', targets: [f.key('a')], destination: f.key('cell00') })).toThrow(); expect(f.tree()).toEqual(before);
  f.run({ kind: 'create', targets: [f.key('a')], columns: 2, nested: true }); expect(f.tree().children![0].children![0].children![0].children![0].type).toBe('table-block');
});

it.each(['span', 'ragged', 'relation', 'reference', 'metadata'])('rejects unsafe %s shells before invocation cleanup', kind => {
  const value = table();
  if (kind === 'span') value.children![0].children![0].metadata = { htmlTableCell: { colSpan: 2 } };
  if (kind === 'ragged') value.children![0].children!.pop();
  if (kind === 'relation') value.children![0].children![0].relation = { note: p('shellNote') };
  if (kind === 'metadata') value.children![0].metadata = { authored: 'must not disappear' };
  const f = setup([value, p('ref', 'Reference', kind === 'reference' ? { standoffProperties: [{ type: 'codex/block-reference', value: 'cell00', start: 0, end: 1 }] } : {})]);
  const before = f.tree(); expect(() => f.run({ kind: 'dissolve', target: f.key('a') })).toThrow(); expect(f.tree()).toEqual(before);
});

it('rejects stale, forged and consumed plans; a failed transaction rolls back its inline edit and structure', () => {
  const f = setup([p('a', '/c2 text'), p('b')]);
  const plan = f.editor.tables.prepare({ kind: 'create', targets: [f.key('a')], columns: 2 });
  f.editor.commands.replaceInlineRange(f.key('b'), 0, 0, 'new'); const current = f.tree();
  expect(() => f.editor.tables.execute(plan)).toThrow(/stale/); expect(() => f.editor.tables.execute({ ...plan })).toThrow(/stale/); expect(f.tree()).toEqual(current);
  const range = f.editor.textRanges.snapshot(f.key('a'), 0, 3), move = vi.spyOn(f.editor.commands, 'move').mockImplementation(() => { throw Error('Injected failure'); });
  expect(() => f.editor.tables.run({ kind: 'create', targets: [f.key('a')], columns: 2 }, range)).toThrow(/Injected/); expect(f.tree()).toEqual(current); move.mockRestore();
  const valid = f.editor.tables.prepare({ kind: 'create', targets: [f.key('a')], columns: 2 }); f.editor.tables.execute(valid); expect(() => f.editor.tables.execute(valid)).toThrow(/stale/);
});

it('rechecks IME, permissions and Scry before executing a prepared action', () => {
  const f = setup(); const before = f.tree();
  const plan = f.editor.tables.prepare({ kind: 'create', targets: [f.key('a')], columns: 2 });
  const mount = f.editor.mounts.get(f.key('a'))!; mount.composing = true; expect(() => f.editor.tables.execute(plan)).toThrow(/composition/); mount.composing = false;
  f.editor.commandRegistry.permit = () => false; expect(() => f.editor.tables.execute(plan)).toThrow(/permitted/); f.editor.commandRegistry.permit = undefined;
  f.editor.completionInput = { beforeSave: () => false } as any; expect(() => f.editor.tables.execute(plan)).toThrow(/Scry/); expect(f.tree()).toEqual(before);
});

it('rejects shared placements and unsupported live-media movement', () => {
  const f = setup(); f.editor.commands.transclude(f.key('a'), { kind: 'after', anchorKey: f.key('b') }); const before = f.tree();
  expect(() => f.run({ kind: 'create', targets: [f.key('a')], columns: 2 })).toThrow(/Shared/); expect(f.tree()).toEqual(before);
  const g = setup([p('media')]); g.editor.mounts.get(g.key('media'))!.root.appendChild(document.createElement('video'));
  expect(() => g.run({ kind: 'create', targets: [g.key('media')], columns: 2 })).toThrow(/live media/);
});

it('keeps later ordinary typing snapshot-free and does not rebuild projections or capture exact records for caret bookmarks', async () => {
  const f = setup();
  const capture = vi.spyOn(f.editor.repository, 'subscribeCommits'), history = vi.spyOn(f.editor.repository, 'subscribeHistoryChanges');
  f.focus('a', 1); f.run({ kind: 'create', targets: [f.key('a')], columns: 2 }); await tick();
  const holdMedia = vi.spyOn(f.editor.tables as any, 'holdMedia');
  const snapshot = vi.spyOn(f.editor.repository, 'snapshot'), build = vi.spyOn(f.view as any, 'build');
  f.editor.commands.replaceInlineRange(f.key('a'), 1, 1, 'Typing'); f.editor.repository.undo(); f.editor.repository.redo(); await tick();
  expect(holdMedia).not.toHaveBeenCalled(); expect(snapshot).not.toHaveBeenCalled(); expect(build).not.toHaveBeenCalled(); expect(capture).not.toHaveBeenCalled(); expect(history).not.toHaveBeenCalled();
});

it('keeps existing tables readable with table operations disabled', () => {
  const f = setup([table()], { tableLayouts: false }); expect(f.host.querySelectorAll('[role="cell"]')).toHaveLength(4);
  expect(() => f.run({ kind: 'dissolve', target: f.key('a') })).toThrow(/disabled/);
});

it('keeps both surface faces when an invocation in its text creates a table', async () => {
  const f = setup([{ id: 'surface', type: 'surface-block', metadata: { reversible: true }, children: [
    { id: 'front', type: 'side-block', children: [p('a', '/c2 Text')] },
    { id: 'back', type: 'side-block', children: [p('secret')] },
  ] }]);
  f.focus('a', 3); const before = f.tree();
  f.editor.tables.run({ kind: 'create', targets: [f.key('a')], columns: 2 }, f.editor.textRanges.snapshot(f.key('a'), 0, 3)); await tick();
  expect(f.tree().children![0].children![0].children![0].children![0].id).toBe('surface');
  expect(f.node('secret')).toBeDefined(); expect(f.editor.mounts.get(f.key('a'))!.captureText!()).toBe(' Text');
  f.editor.repository.undo(); await tick(); expect(f.tree()).toEqual(before);
});

it('requires extraction for a referenced empty TextBlock instead of silently removing its placement', async () => {
  const f = setup([table('table', [[[p('empty', '')], [p('b')]]]), p('ref', 'Link', { standoffProperties: [{ type: 'codex/block-reference', value: 'empty', start: 0, end: 3 }] })]);
  const before = f.tree(); expect(() => f.run({ kind: 'remove-column', target: f.key('empty') })).toThrow(/referenced/); expect(f.tree()).toEqual(before);
  f.run({ kind: 'remove-column', target: f.key('empty'), extract: true }); await tick();
  expect(f.tree().children![1].id).toBe('empty');
});

it('rejects partial text and multiple carets, and rechecks selection before publication', () => {
  const f = setup(); f.focus('a', 0);
  const request = { kind: 'create', targets: [f.key('a')], columns: 2 } as const;
  const plan = f.editor.tables.prepare({ ...request, targets: [...request.targets] });
  f.focus('a', 0, 1); expect(() => f.editor.tables.execute(plan)).toThrow(/text selection/);
  f.focus('a', 0); const n = f.node('a');
  f.editor.selections.addCaret(n.key, n.contentKey, n.viewId, 1);
  expect(() => f.run({ ...request, targets: [...request.targets] })).toThrow(/single caret/);
  expect(f.editor.repository.canUndo()).toBe(false);
});

// Increment 2: the same semantic operations through actual completion and controls.
import { createAutocompleteFeature } from '../features/autocomplete';
import { parseTableCommand, tableCommandCandidates } from '../runtime/table-commands';
import { tableMenuItems } from '../runtime/table-menu';
import type { CompletionSession } from '../features/autocomplete/session';
function completion(f: ReturnType<typeof setup>) { return (f.editor.overlays.overlays.find(o => o.viewType === 'autocomplete')?.data as { session: CompletionSession } | undefined)?.session; }
async function type(f: ReturnType<typeof setup>, value: string, inputType = 'insertText') {
  for (const data of value) { document.activeElement!.dispatchEvent(new InputEvent('beforeinput', { inputType, data, bubbles: true, cancelable: true })); await tick(); }
}
it.each(['c', 'c2', 'c3', 'c4'])('accepts /%s anywhere, with atomic literal Undo and an unchanged live mount', async alias => {
  const f = setup([p('a', 'Alpha  Beta')]); f.editor.featureHost.activate(createAutocompleteFeature(f.editor)); f.focus('a', 6);
  const root = f.editor.mounts.get(f.key('a'))!.root, id = f.node('a').placementKey;
  await type(f, '/'+alias); const literal = f.tree(), session = completion(f)!;
  expect(session.state.rows.find(r => r.id === session.state.selected)?.exact).toBe(true);
  const snapshots = vi.spyOn(f.editor.repository, 'snapshot'), build = vi.spyOn(f.view as any, 'build');
  await session.choose(); await tick();
  expect(snapshots).not.toHaveBeenCalled(); expect(build).not.toHaveBeenCalled();
  expect(f.tree().children![0].children![0].children).toHaveLength(alias === 'c' ? 2 : Number(alias[1]));
  expect(f.editor.mounts.get(f.key('a'))!.root).toBe(root); expect(f.node('a').placementKey).toBe(id);
  expect(f.node('a').inlineContent.map(k => f.editor.node(k)!.payload.text).join('')).toBe('Alpha  Beta');
  expect(f.editor.mounts.get(f.key('a'))!.captureInlineSelection!()).toEqual({ anchor: 6, head: 6 });
  f.editor.repository.undo(); await tick(); expect(f.tree()).toEqual(literal);
  f.editor.repository.redo(); await tick(); expect(f.tree().children![0].type).toBe('table-block');
});
it.each(['row', 'col', 'mc r', 'mr d', 'move-cell right', 'move-row down', 'unc'])('runs contextual /%s with exact literal Undo', async alias => {
  const f = setup([table()]); f.editor.featureHost.activate(createAutocompleteFeature(f.editor)); f.focus('a', 1);
  await type(f, ' /'+alias); const literal = f.tree(), session = completion(f)!;
  expect(session.state.selected).toBe(parseTableCommand(alias)!.id);
  await session.choose(); await tick(); expect(session.state.error).toBe(''); expect(f.tree()).not.toEqual(literal);
  f.editor.repository.undo(); await tick(); expect(f.tree()).toEqual(literal);
});
it('keeps unknown, cancelled, pasted, code and composing invocations literal', async () => {
  const f = setup([p('a', '')]); f.editor.featureHost.activate(createAutocompleteFeature(f.editor)); f.focus('a');
  await type(f, '/c99'); expect(completion(f)!.state.rows).toHaveLength(0); const before = f.tree(); await completion(f)!.choose(); expect(f.tree()).toEqual(before);
  document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); expect(completion(f)).toBeUndefined(); expect(f.tree()).toEqual(before);
  await type(f, ' /c2', 'insertFromPaste'); expect(completion(f)).toBeUndefined(); expect(f.tree().children![0].type).toBe('standoff-editor-block');
  const m = f.editor.mounts.get(f.key('a'))!; m.composing = true; f.editor.completionInput!.edited(f.key('a'), f.node('a').inlineContent.length, 'insertText'); expect(completion(f)).toBeUndefined(); m.composing = false;
  f.editor.commands.setPayloadField(f.key('a'), 'standoffProperties', [{ type: 'style/code', start: 0, end: 100 }]);
  await type(f, ' /c2'); expect(completion(f)).toBeUndefined();
});
it('does not interpret Entity query punctuation as table arguments', async () => {
  const f = setup([p('a', '')]); f.editor.featureHost.activate(createAutocompleteFeature(f.editor)); f.focus('a');
  await type(f, '/c2 : c3');
  expect(completion(f)!.state.rows).toEqual([]);
  const before = f.tree(); await completion(f)!.choose(); expect(f.tree()).toEqual(before);
});
it('keeps an unavailable exact /c literal instead of selecting /col or container', async () => {
  const f = setup([table()]); f.editor.featureHost.activate(createAutocompleteFeature(f.editor)); f.focus('a', 1);
  await type(f, ' /c'); const session = completion(f)!;
  expect(session.state.selected).toBe(''); expect(session.state.rows.every(r => r.disabled)).toBe(true);
  const before = f.tree(); await session.choose(); expect(f.tree()).toEqual(before);
});
it('does not build plans, snapshots or read unrelated Blocks while suggesting commands', () => {
  const f = setup([p('a', ''), ...Array.from({ length: 100 }, (_, i) => p('unrelated'+i))]);
  const prepare = vi.spyOn(f.editor.tables, 'prepare'), snapshot = vi.spyOn(f.editor.repository, 'snapshot'), node = vi.spyOn(f.editor, 'node'), build = vi.spyOn(f.view as any, 'build');
  for (const query of ['', 'c', 'c2', 'col', 'mc ', 'mc x', 'unknown']) tableCommandCandidates(f.editor, f.key('a'), query);
  expect(prepare).not.toHaveBeenCalled(); expect(snapshot).not.toHaveBeenCalled(); expect(build).not.toHaveBeenCalled();
  expect(node.mock.calls.every(([key]) => !String(f.view.state.nodes[key]?.payload.id).startsWith('unrelated'))).toBe(true);
  expect(parseTableCommand('mc 2')).toBeUndefined(); expect(parseTableCommand('c2 extra')).toBeUndefined(); expect(parseTableCommand('col')?.id).toBe('table.insert-column');
});
it('refuses a stale source without removing its literal invocation', async () => {
  const f = setup([p('a', '')]); f.editor.featureHost.activate(createAutocompleteFeature(f.editor)); f.focus('a'); await type(f, '/c2');
  const session = completion(f)!; f.editor.commands.replaceInlineRange(f.key('a'), 0, 0, 'Changed '); const before = f.tree();
  await session.choose(); await tick(); expect(f.tree()).toEqual(before);
});
it('rejects multiple selections without opening table commands', async () => {
  const f = setup([p('a', '/c2')]); f.editor.featureHost.activate(createAutocompleteFeature(f.editor)); f.focus('a', 3);
  f.editor.selections.setPrimary(f.key('a'), f.node('a').contentKey, f.node('a').viewId, 1, 1);
  f.editor.selections.addCaret(f.key('a'), f.node('a').contentKey, f.node('a').viewId, 2);
  f.editor.completionInput!.edited(f.key('a'), 3, 'insertText'); expect(completion(f)).toBeUndefined();
});
it('provides out-of-document commands for selected whole Blocks, preserving source contents', async () => {
  const f = setup(); f.editor.blockSelection.select(f.key('a')); f.editor.blockSelection.select(f.key('b'), 'toggle');
  const menu = tableMenuItems(f.editor, f.key('a')), before = f.tree();
  expect(menu[0].input!.suggestions!('/c2')[0].value).toBe('/c');
  menu[0].input!.submit('/c2'); await tick(); expect(f.tree().children![0].children![0].children!.map(c => c.children![0].id)).toEqual(['a', 'b']);
  f.editor.repository.undo(); await tick(); expect(f.tree()).toEqual(before);
});
it('uses explicit cell controls for transfer, previews extraction and preserves caret without legacy menu focus', async () => {
  const f = setup([table()]); f.focus('a', 1); f.editor.blockSelection.select(f.key('a'));
  const button = f.host.querySelector<HTMLButtonElement>('[aria-label="Row 1, column 1 controls"]')!; button.click(); await tick();
  const menuButton = (label: string) => [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(b => b.textContent?.replace(/[›‹]/g, '').trim() === label)!;
  menuButton('Move selected Blocks to cell…').click(); await tick();
  const focus = vi.spyOn(f.editor.focus, 'request'); menuButton('Row 1, column 2 (append)').click(); await tick();
  expect(document.querySelector('.reactive-block-menu [role=alert]')?.textContent).toBeUndefined();
  expect(f.node('cell01').children.map(k => f.editor.node(k)!.payload.id)).toEqual(['b', 'a']);
  expect(focus.mock.calls.filter(([, options]) => options?.reason === 'closed-panel')).toHaveLength(0);
  expect(f.editor.mounts.get(f.key('a'))!.captureInlineSelection!()).toEqual({ anchor: 1, head: 1 });
  const items = tableMenuItems(f.editor, f.key('a')), before = f.tree();
  const preview = items.find(i => i.label === 'Remove column…')!.loadChildren!(); expect(f.tree()).toEqual(before);
  expect(preview[0].label).toMatch(/Extract 3 Blocks/); preview[0].run!(); await tick(); expect(f.tree().children!.slice(1).map(n => n.id)).toEqual(['b', 'a', 'd']);
  f.editor.repository.undo(); await tick(); expect(f.tree()).toEqual(before);
});
it('rejects stale control selection and keeps guides per view without canonical changes', async () => {
  const f = setup([table()]), other = f.editor.createView('other-view'), before = f.editor.repository.state.revision;
  f.editor.tables.toggleGuides(f.view.viewId); expect(f.editor.tables.guides(f.view.viewId)).toBe(false); expect(f.editor.tables.guides(other.viewId)).toBe(true); expect(f.editor.repository.state.revision).toBe(before);
  const items = tableMenuItems(f.editor, f.key('a')); f.editor.blockSelection.select(f.key('b'));
  expect(() => items.find(i => i.label === 'Insert column right')!.run!()).toThrow(/selection changed/);
  expect(f.cellIds()).toEqual([['cell00', 'cell01'], ['cell10', 'cell11']]);
});

it('focuses a chosen cell without a transaction or new keyboard binding', async () => {
  const f = setup([table()]), before = f.editor.repository.state.revision;
  const transaction = vi.spyOn(f.editor.commands, 'structuralTransaction'), prepare = vi.spyOn(f.editor.tables, 'prepare');
  tableMenuItems(f.editor, f.key('cell00')).find(i => i.label === 'Go to cell…')!.loadChildren!()[3].run!();
  await tick();
  expect(document.activeElement).toBe(f.editor.mounts.get(f.key('d'))!.focusElement);
  expect(f.editor.repository.state.revision).toBe(before); expect(transaction).not.toHaveBeenCalled(); expect(prepare).not.toHaveBeenCalled();
  const button = f.host.querySelector<HTMLButtonElement>('[aria-label="Row 1, column 1 controls"]')!;
  button.focus();
  for (const key of ['Enter', ' ', 'Tab', 'ArrowDown']) {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }); button.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  }
  expect(f.editor.repository.state.revision).toBe(before);
});

it('hides commands and controls when the flag is off while rendering existing tables', () => {
  const f = setup([table()], { tableLayouts: false });
  expect(f.host.querySelector('[role=table]')).not.toBeNull();
  expect(f.host.querySelector('[data-table-controls]')).toBeNull();
  expect(tableCommandCandidates(f.editor, f.key('a'), '')).toEqual([]);
  expect(tableMenuItems(f.editor, f.key('a'))).toEqual([]);
});

it('keeps typing local with contextual controls mounted', async () => {
  const f = setup([table(), ...Array.from({ length: 80 }, (_, i) => p('unrelated-'+i, 'Annotated prose', { standoffProperties: [{ type: 'style/bold', start: 0, end: 4 }] }))]);
  f.editor.featureHost.activate(createAutocompleteFeature(f.editor)); f.focus('a', 1);
  await new Promise(resolve => setTimeout(resolve, 40)); // flush the focus-only reveal
  const snapshot = vi.spyOn(f.editor.repository, 'snapshot'), build = vi.spyOn(f.view as any, 'build');
  const prepare = vi.spyOn(f.editor.tables, 'prepare'), transaction = vi.spyOn(f.editor.commands, 'structuralTransaction');
  const cellReads = [...f.host.querySelectorAll('.reactive-table-cell, .reactive-table-scroll')].map(element => vi.spyOn(element, 'getBoundingClientRect'));
  const unrelated = f.editor.repository.readState().contents[f.node('unrelated-79').contentKey];
  const payload = vi.spyOn(unrelated, 'payload', 'get');
  const controls = f.host.querySelector('.table-cell-controls')!, mutations: MutationRecord[] = [];
  const observer = new MutationObserver(records => mutations.push(...records)); observer.observe(controls, { subtree: true, attributes: true, childList: true, characterData: true });
  await type(f, ' ordinary typing'); await new Promise(resolve => setTimeout(resolve, 40)); observer.disconnect();
  expect(snapshot).not.toHaveBeenCalled(); expect(build).not.toHaveBeenCalled(); expect(prepare).not.toHaveBeenCalled(); expect(transaction).not.toHaveBeenCalled();
  expect(payload).not.toHaveBeenCalled(); expect(mutations).toEqual([]); cellReads.forEach(read => expect(read).not.toHaveBeenCalled());
});

it('keeps every eligible contextual mutation and its Undo off repository-wide work', async () => {
  const f = setup([table(), ...Array.from({ length: 50 }, (_, i) => p('unrelated-'+i))]);
  const snapshots = vi.spyOn(f.editor.repository, 'snapshot'), builds = vi.spyOn(f.view as any, 'build');
  const indexes = vi.spyOn(f.editor.repository as any, 'rebuildReferences');
  const payload = vi.spyOn(f.editor.repository.readState().contents[f.node('unrelated-49').contentKey], 'payload', 'get');
  const requests: TableRequest[] = [
    { kind: 'swap-cell', target: f.key('a'), direction: 'right' },
    { kind: 'move-row', target: f.key('a'), direction: 'down' },
    { kind: 'insert-row', target: f.key('a') }, { kind: 'insert-column', target: f.key('a') },
    { kind: 'transfer', targets: [f.key('a')], destination: f.key('cell01') },
    { kind: 'remove-row', target: f.key('a'), extract: true },
    { kind: 'remove-column', target: f.key('a'), extract: true }, { kind: 'dissolve', target: f.key('a') },
  ];
  for (const request of requests) {
    const removal = request.kind === 'remove-row' || request.kind === 'remove-column' || request.kind === 'dissolve';
    // Removal deliberately checks loaded standoff references before deleting
    // shells. That conservative preflight is separate from local publication.
    if (removal) payload.mockRestore();
    f.run(request); await tick(); f.editor.repository.undo(); await tick();
    expect(snapshots, request.kind).not.toHaveBeenCalled(); expect(builds, request.kind).not.toHaveBeenCalled();
    expect(indexes, request.kind).not.toHaveBeenCalled(); if (!removal) expect(payload, request.kind).not.toHaveBeenCalled();
  }
});
