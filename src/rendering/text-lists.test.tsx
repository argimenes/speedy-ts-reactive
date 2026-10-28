import { afterEach, expect, it, vi } from 'vitest';
import { render } from 'solid-js/web';
import { ReactiveEditor } from '../reactive-editor/editor';
import { registerCoreViews } from './register-core-views';
import { ReactiveTreeView } from './reactive-tree-view';
import { keyboard } from '../input/bindings';
import type { ExistingBlockDto } from '../block-tree/types';

const cleanup: (() => void)[] = [];
afterEach(() => { cleanup.splice(0).reverse().forEach(f => f()); document.body.replaceChildren(); localStorage.clear(); vi.restoreAllMocks(); });
const tick = async () => { await Promise.resolve(); await Promise.resolve(); };
const text = (id: string, children: ExistingBlockDto[] = []): ExistingBlockDto => ({ id, type: 'standoff-editor-block', text: id, children });
const list = (id: string, children: ExistingBlockDto[]): ExistingBlockDto => ({ id, type: 'indented-list-block', children });
function setup(children: ExistingBlockDto[]) {
  const editor = new ReactiveEditor({ type: 'document-block', children }); registerCoreViews(editor);
  const projection = editor.createView('text-lists'), host = document.body.appendChild(document.createElement('div'));
  const dispose = render(() => <ReactiveTreeView editor={editor} projection={projection} />, host); editor.installGateway(document);
  cleanup.push(() => { dispose(); editor.dispose(); });
  const node = (id: string) => Object.values(projection.state.nodes).find(n => n.payload.id === id)!;
  const focus = (id: string, selection = { anchor: 1, head: 1 }) => {
    const mount = editor.mounts.get(node(id).key)!; mount.focus(); mount.restoreInlineSelection!(selection);
  };
  const key = (extra: KeyboardEventInit = {}) => {
    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true, ...extra });
    document.activeElement!.dispatchEvent(event); return event;
  };
  const blocks = () => editor.encodeDocument().children!;
  return { editor, projection, host, node, focus, key, blocks };
}

it('converts even the first TextBlock to a list, preserving content, identity, selection and one-step history', async () => {
  const original = { ...text('source'), text: 'one 😀 two', standoffProperties: [{ id: 'mark', type: 'style/bold', start: 0, end: 2 }], relation: { leftMargin: { type: 'left-margin-block', children: [text('note')] } } };
  const f = setup([original, text('after')]); f.focus('source', { anchor: 5, head: 2 });
  const before = f.blocks(); expect(f.key().defaultPrevented).toBe(true); await tick();
  expect(f.blocks()[0]).toMatchObject({ type: 'indented-list-block', children: [before[0]] });
  expect(f.blocks()[1]).toEqual(before[1]); expect(f.host.querySelector('.reactive-imported-list-marker')?.textContent).toBe('•');
  expect(f.editor.mounts.get(f.node('source').key)!.captureInlineSelection!()).toEqual({ anchor: 5, head: 2 });
  f.editor.repository.undo(); expect(f.blocks()).toEqual(before);
  f.editor.repository.redo(); expect(f.blocks()[0].type).toBe('indented-list-block');
  const saved = f.editor.encodeDocument(), loaded = new ReactiveEditor(saved); expect(loaded.encodeDocument()).toEqual(saved); loaded.dispose();
});

it('indents under the preceding item, reuses its nested list and moves an existing subtree intact', async () => {
  const f = setup([list('outer', [text('first', [list('nested', [text('child')])]), text('second', [list('subtree', [text('grandchild')])]), text('third')])]);
  const before = f.blocks(); f.focus('second'); f.key(); await tick();
  const outer = f.blocks()[0]; expect(outer.children!.map(b => b.id)).toEqual(['first', 'third']);
  expect(outer.children![0].children![0].children!.map(b => b.id)).toEqual(['child', 'second']);
  expect(outer.children![0].children![0].children![1]).toEqual(before[0].children![1]);
  expect(document.activeElement).toBe(f.editor.mounts.get(f.node('second').key)!.focusElement);
  f.editor.repository.undo(); expect(f.blocks()).toEqual(before);
});

it('outdents a nested item and preserves reading order and descendants', async () => {
  const f = setup([list('outer', [text('first', [list('nested', [text('child'), text('second'), text('third')])]), text('last')])]);
  f.focus('second'); const before = f.blocks(); f.key({ shiftKey: true }); await tick();
  const children = f.blocks()[0].children!; expect(children.map(b => b.id)).toEqual(['first', 'second', 'last']);
  expect(children[0].children![0].children!.map(b => b.id)).toEqual(['child']);
  expect(children[1].children![0].children!.map(b => b.id)).toEqual(['third']);
  f.editor.repository.undo(); expect(f.blocks()).toEqual(before);
});

it.each(['first', 'middle', 'last'])('outdents the %s outermost item without reordering the surrounding text', async id => {
  const f = setup([text('before'), list('outer', [text('first'), text('middle'), text('last')]), text('after')]);
  f.focus(id); const before = f.blocks(); f.key({ shiftKey: true }); await tick();
  const blocks = f.blocks(); expect(blocks.find(b => b.id === id)?.type).toBe('standoff-editor-block');
  expect(blocks.flatMap(b => b.type === 'indented-list-block' ? b.children!.map(c => c.id) : [b.id])).toEqual(['before', 'first', 'middle', 'last', 'after']);
  expect(blocks.filter(b => b.type === 'indented-list-block').every(b => b.children!.length)).toBe(true);
  f.editor.repository.undo(); expect(f.blocks()).toEqual(before);
});

it('removes an emptied wrapper and leaves Shift Tab outside lists native', async () => {
  const f = setup([text('source')]); f.focus('source'); expect(f.key({ shiftKey: true }).defaultPrevented).toBe(false);
  f.key(); await tick(); const before = f.blocks();
  expect(f.key().defaultPrevented).toBe(true); expect(f.blocks()).toEqual(before); // first item cannot indent
  f.key({ shiftKey: true }); await tick(); expect(f.blocks()).toEqual([text('source')]);
});

it('moves imported list-item containers together and unwraps them when leaving the list', async () => {
  const item = (id: string, children: ExistingBlockDto[]): ExistingBlockDto => ({ id, type: 'container-block', metadata: { htmlListItem: {} }, children });
  const f = setup([{ ...list('outer', [item('a', [text('first')]), item('b', [text('second'), text('paragraph')])]), metadata: { htmlList: { ordered: true, start: 3 } } }]);
  f.focus('second'); f.key(); await tick();
  expect(f.blocks()[0].children![0].children![1].children![0].id).toBe('b');
  f.key({ shiftKey: true }); await tick(); expect(f.blocks()[0].children!.map(b => b.id)).toEqual(['a', 'b']);
  f.key({ shiftKey: true }); await tick(); expect(f.blocks().map(b => b.id)).toEqual(['outer', 'second', 'paragraph']);
});

it('honours rebinding and keeps native controls, composition, repeats and modified Tab untouched', async () => {
  const f = setup([text('source')]); f.focus('source');
  for (const extra of [{ isComposing: true }, { repeat: true }, { ctrlKey: true }, { metaKey: true }, { altKey: true }]) {
    f.key(extra); expect(f.blocks()[0].id).toBe('source');
  }
  const input = f.host.appendChild(document.createElement('input')); input.focus();
  expect(f.key().defaultPrevented).toBe(false);
  f.editor.bindings.assign('list.indent', [keyboard('F8')]); f.focus('source');
  expect(f.key().defaultPrevented).toBe(false); expect(f.key({ key: 'F8' }).defaultPrevented).toBe(true); await tick();
  expect(f.blocks()[0].type).toBe('indented-list-block');
});

it('typing in a list does not run structural planning or take a document snapshot', async () => {
  const f = setup([list('outer', [text('source'), ...Array.from({ length: 50 }, (_, i) => text('unrelated' + i))])]); f.focus('source'); await tick();
  const snapshot = vi.spyOn(f.editor.repository, 'snapshot'), ancestor = vi.spyOn(f.projection, 'parentOf');
  const move = vi.spyOn(f.editor.commands, 'move'), insert = vi.spyOn(f.editor.commands, 'insert');
  document.activeElement!.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertText', data: 'x', bubbles: true, cancelable: true }));
  expect(snapshot).not.toHaveBeenCalled(); expect(move).not.toHaveBeenCalled(); expect(insert).not.toHaveBeenCalled();
  expect(ancestor.mock.calls.length).toBeLessThan(10);
  expect(f.blocks()[0].children![0].text).toBe('sxource');
});

it('collapses only child lists, retains nested collapse state and restores saved state on reload', async () => {
  const f = setup([list('outer', [text('first', [list('nested', [text('child', [list('deep', [text('grandchild')])])])]), text('last')])]);
  const marker = (id: string) => f.host.querySelector<HTMLButtonElement>(`[data-list-item="${f.node(id).key}"] > button`)!;
  const childList = (id: string) => f.editor.mounts.get(f.node(id).key)!.root as HTMLElement;
  const leaf = f.editor.mounts.get(f.node('last').key)!.focusElement;
  expect(f.host.querySelectorAll('.reactive-imported-list-marker')).toHaveLength(4);
  marker('child').click(); expect(childList('deep').hidden).toBe(true);
  marker('first').click(); expect(childList('nested').hidden).toBe(true); expect(marker('first').getAttribute('aria-expanded')).toBe('false');
  expect(f.editor.mounts.get(f.node('last').key)!.focusElement).toBe(leaf);
  marker('first').click(); expect(childList('nested').hidden).toBe(false); expect(childList('deep').hidden).toBe(true);
  f.editor.repository.undo(); expect(childList('nested').hidden).toBe(true);
  const saved = f.blocks(); const reloaded = setup(saved);
  expect((reloaded.editor.mounts.get(reloaded.node('nested').key)!.root as HTMLElement).hidden).toBe(true);
  expect((reloaded.editor.mounts.get(reloaded.node('deep').key)!.root as HTMLElement).hidden).toBe(true);
  expect(reloaded.blocks()).toEqual(saved);
  f.editor.repository.redo(); expect(childList('nested').hidden).toBe(false);
});

it('moves focus out of a collapsed branch and skips its text during boundary navigation', () => {
  const f = setup([list('outer', [text('first', [list('nested', [text('child')])]), text('last')])]);
  f.focus('child'); f.host.querySelector<HTMLButtonElement>('[aria-label="Collapse child list"]')!.click();
  expect(document.activeElement).toBe(f.editor.mounts.get(f.node('first').key)!.focusElement);
  expect(f.editor.adjacentEditable(f.node('first').key, 1)?.key).toBe(f.node('last').key);
  const selection = f.editor.mounts.get(f.node('first').key)!.captureInlineSelection!();
  f.host.querySelector<HTMLButtonElement>('[aria-label="Expand child list"]')!.click();
  expect(f.editor.mounts.get(f.node('first').key)!.captureInlineSelection!()).toEqual(selection);
});

it('toggles from the focused bullet with Enter and Space without repeating or moving focus', () => {
  const f = setup([list('outer', [text('first', [list('nested', [text('child')])])])]);
  const button = f.host.querySelector<HTMLButtonElement>('[aria-label="Collapse child list"]')!; button.focus();
  f.key({ key: 'Enter' }); expect(button.getAttribute('aria-expanded')).toBe('false');
  f.key({ key: 'Enter', repeat: true }); expect(button.getAttribute('aria-expanded')).toBe('false');
  f.key({ key: ' ' }); expect(button.getAttribute('aria-expanded')).toBe('true'); expect(document.activeElement).toBe(button);
});

it('collapses imported list children without hiding other paragraphs in the same item', () => {
  const f = setup([list('outer', [{ id: 'item', type: 'container-block', metadata: { htmlListItem: { value: 4 }, custom: 'keep' }, children: [text('first'), text('paragraph'), list('nested', [text('child')])] }])]);
  f.host.querySelector<HTMLButtonElement>('[aria-label="Collapse child list"]')!.click();
  expect((f.editor.mounts.get(f.node('nested').key)!.root as HTMLElement).hidden).toBe(true);
  expect(f.editor.mounts.get(f.node('paragraph').key)!.root.closest('[hidden]')).toBeNull();
  expect(f.node('item').payload.metadata).toEqual({ htmlListItem: { value: 4 }, custom: 'keep', listCollapsed: true });
});

it('supports legacy lists with sibling-nested lists and expands a collapsed parent when indenting', async () => {
  const f = setup([list('outer', [text('first'), list('nested', [text('child')]), text('last')])]);
  f.host.querySelector<HTMLButtonElement>('[aria-label="Collapse child list"]')!.click();
  expect((f.editor.mounts.get(f.node('nested').key)!.root as HTMLElement).hidden).toBe(true);
  f.focus('last'); f.key(); await tick();
  expect((f.editor.mounts.get(f.node('nested').key)!.root as HTMLElement).hidden).toBe(false);
  expect(f.editor.mounts.get(f.node('last').key)!.root.closest('[hidden]')).toBeNull();
  f.editor.repository.undo(); expect((f.editor.mounts.get(f.node('nested').key)!.root as HTMLElement).hidden).toBe(true);
});
