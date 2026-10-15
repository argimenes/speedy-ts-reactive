import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'solid-js/web';
import { ReactiveEditor } from '../reactive-editor/editor';
import { registerCoreViews } from './register-core-views';
import { ReactiveTreeView } from './reactive-tree-view';
import { exportClipboard, NATIVE_MIME } from '../interchange/transport';
import { plainFragment } from '../interchange/serializer';
import { captureNative, decodeNative, nativeEnvelope } from '../persistence/native-resource';
const cleanup: Array<() => void> = [];
afterEach(() => { cleanup.splice(0).reverse().forEach(f => f()); vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.replaceChildren(); });
const tick = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
function setup(enabled = true) {
  const editor = new ReactiveEditor({ type: 'document-block', id: 'doc', children: [
    { type: 'standoff-editor-block', id: 'a', text: 'Rome abc', standoffProperties: [{ id: 'p', type: 'codex/entity-reference', value: 'rome', start: 0, end: 3 }] },
    { type: 'standoff-editor-block', id: 'b', text: 'target' },
  ] }, { features: { mutableClipboard: enabled } });
  editor.clipboard.setContext(() => ({ cavernId: 'cavern', session: 'session' })); registerCoreViews(editor);
  const projection = editor.createView('clipboard-ui'), host = document.body.appendChild(document.createElement('div'));
  const dispose = render(() => <ReactiveTreeView editor={editor} projection={projection} />, host); editor.installGateway(document);
  cleanup.push(() => { editor.dispose(); dispose(); });
  const node = (id: string) => Object.values(projection.state.nodes).find(n => n.payload.id === id)!;
  const select = (id: string, start: number, end = start) => {
    const n = node(id), m = editor.mounts.get(n.key)!; m.focus(); m.restoreInlineSelection!({ anchor: start, head: end }); editor.selections.setPrimary(n.key, n.contentKey, n.viewId, start, end); return m.focusElement;
  };
  const dispatch = (type: string, target: Element, initial: Record<string, string> = {}, fail = false) => {
    const values = { ...initial }; const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: { types: Object.keys(values), getData: (type: string) => values[type] ?? '', setData: (type: string, value: string) => { if (fail) throw Error('Clipboard write failed'); values[type] = value; } } }); target.dispatchEvent(event); return { values, event };
  };
  return { editor, projection, host, node, select, dispatch, texts: () => editor.encodeDocument().children!.map(c => c.text) };
}

describe('Mutable clipboard UI routing and lifecycle', () => {
  it('copies and pastes native annotations, with exactly one new handler and one undo entry', () => {
    const s = setup(), copy = s.dispatch('copy', s.select('a', 0, 4));
    expect(copy.values[NATIVE_MIME]).toBeTruthy(); expect(copy.values['application/json']).toBeUndefined();
    const commits = vi.spyOn(s.editor.repository, 'commit'); s.dispatch('paste', s.select('b', 1, 3), copy.values);
    expect(s.texts()).toEqual(['Rome abc', 'tRomeget']); expect(commits).toHaveBeenCalledTimes(1);
    const props = s.node('b').payload.standoffProperties as any[]; expect(props).toMatchObject([{ type: 'codex/entity-reference', value: 'rome', start: 1, end: 4 }]); expect(props[0].id).not.toBe('p');
    s.editor.repository.undo(); expect(s.texts()).toEqual(['Rome abc', 'target']);
  });
  it('restores the legacy route coherently when disabled', () => {
    const s = setup(false), copy = s.dispatch('copy', s.select('a', 0, 4));
    expect(copy.values[NATIVE_MIME]).toBeUndefined(); expect(copy.values['application/json']).toContain('standoff-inline-v1'); expect(document.querySelector('[data-mutable-clipboard-status]')).toBeNull();
  });
  it('replicates one inline slice at multiple carets with fresh properties and restored selections', () => {
    const s = setup(), copy = s.dispatch('copy', s.select('a', 0, 4)).values;
    const target = s.select('b', 1), n = s.node('b'); s.editor.selections.addCaret(n.key, n.contentKey, n.viewId, 4);
    s.dispatch('paste', target, copy); expect(s.texts()[1]).toBe('tRomeargRomeet');
    const properties = s.node('b').payload.standoffProperties as any[];
    expect(new Set(properties.map(p => p.id)).size).toBe(2);
    expect(s.editor.selections.sets[n.key].items.map(i => i.head.boundary.index)).toEqual([5, 12]);
    s.editor.repository.undo(); expect(s.texts()[1]).toBe('target');
  });
  it('does not delete on failed event write and retains an explicit recovery copy on successful cut', () => {
    const s = setup(); s.dispatch('cut', s.select('a', 0, 4), {}, true);
    expect(s.texts()[0]).toBe('Rome abc'); expect(s.editor.clipboard.recovery()).toBeUndefined();
    const copy = s.dispatch('cut', s.select('a', 0, 4));
    expect(copy.values[NATIVE_MIME]).toBeTruthy(); expect(s.texts()[0]).toBe(' abc'); expect(s.editor.clipboard.recovery()).toBeDefined();
    s.editor.repository.undo(); expect(s.texts()[0]).toBe('Rome abc');
  });
  it('rejects identity-bearing roots at multiple carets without partial edits', () => {
    const s = setup(), f = plainFragment('ref');
    f.blocks[0].inline!.properties.push({ localId: 'self', type: 'codex/block-reference', startIndex: 0, endIndex: 3, isZeroWidth: false, attributes: {}, target: { kind: 'local', object: 'block', id: f.blocks[0].localId } });
    const target = s.select('b', 1), n = s.node('b'); s.editor.selections.addCaret(n.key, n.contentKey, n.viewId, 4);
    s.dispatch('paste', target, exportClipboard(f));
    expect(s.texts()).toEqual(['Rome abc', 'target']); expect(s.editor.repository.canUndo()).toBe(false);
    expect(s.editor.clipboard.message()).toContain('single text selection');
  });
  it('preserves the selected text for empty, unsupported and invalid clipboard payloads', () => {
    const s = setup(); const before = s.texts(); const target = s.select('a', 0, 4);
    for (const data of [{ 'text/plain': '' }, { 'image/png': 'blob' }, { [NATIVE_MIME]: '{bad' }] as Record<string, string>[]) s.dispatch('paste', target, data);
    expect(s.texts()).toEqual(before); expect(s.editor.repository.canUndo()).toBe(false);
  });
  it('uses Shift-V as one-use plain intent without suppressing native paste', () => {
    const s = setup(), data = s.dispatch('copy', s.select('a', 0, 4)).values, target = s.select('b', 0);
    const key = new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true }); target.dispatchEvent(key); expect(key.defaultPrevented).toBe(false);
    s.dispatch('paste', target, data); expect(s.node('b').payload.standoffProperties).toEqual([]);
  });
  it('uses system-event Blocks and fresh IDs even after cut; true move behavior is untouched', async () => {
    const s = setup(); s.editor.blockSelection.replaceKeys([s.node('a').key]);
    const handle = s.host.querySelector('[data-block-id="a"] [data-block-selection-handle]')!;
    const cut = s.dispatch('cut', handle); expect(s.texts()).toEqual(['target']);
    s.editor.blockSelection.replaceKeys([s.node('b').key]);
    const target = s.host.querySelector('[data-block-id="b"] [data-block-selection-handle]')!;
    s.dispatch('paste', target, cut.values); expect(s.texts()).toEqual(['target', 'Rome abc']);
    const pasted = s.editor.encodeDocument().children![1]; expect(pasted.id).not.toBe('a');
    s.editor.repository.undo(); s.editor.repository.undo(); expect(s.texts()).toEqual(['Rome abc', 'target']); await tick();
  });
  it('waits for acknowledged async cut and never deletes on rejected or stale writes', async () => {
    let resolve!: () => void, reject!: (error: Error) => void;
    const write = vi.fn(() => new Promise<void>((yes, no) => { resolve = yes; reject = no; }));
    vi.stubGlobal('ClipboardItem', class { static supports() { return false; } constructor(public items: unknown) {} });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { write } }); cleanup.push(() => { delete (navigator as any).clipboard; });
    const s = setup(); s.dispatch('cut', s.select('a', 0, 4)); s.editor.repository.undo();
    s.editor.blockSelection.replaceKeys([s.node('a').key]);
    s.editor.blockClipboard.run('selection.cut'); expect(write).toHaveBeenCalledTimes(1); expect(s.texts()).toHaveLength(2);
    s.editor.clipboard.recoverCopy(); expect(write).toHaveBeenCalledTimes(1); // Recovery cannot race a pending operation.
    reject(Error('Denied')); await tick(); expect(s.texts()).toHaveLength(2); expect(s.editor.repository.canUndo()).toBe(false);
    s.editor.blockClipboard.run('selection.cut'); s.editor.commands.replaceInlineRange(s.node('b').key, 0, 0, '!'); resolve(); await tick();
    expect(s.texts()).toEqual(['Rome abc', '!target']); expect(s.editor.clipboard.message()).toContain('source changed');
    s.editor.blockSelection.replaceKeys([s.node('a').key]); s.editor.blockClipboard.run('selection.cut'); resolve(); await tick(); expect(s.texts()).toEqual(['!target']);
  });
  it('disposes pending operations without deleting data or displaying a stale result', async () => {
    let resolve!: () => void;
    vi.stubGlobal('ClipboardItem', class { static supports() { return false; } });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { write: () => new Promise<void>(r => { resolve = r; }) } }); cleanup.push(() => { delete (navigator as any).clipboard; });
    const s = setup(); s.editor.blockSelection.replaceKeys([s.node('a').key]); s.editor.blockClipboard.run('selection.cut');
    const commit = vi.spyOn(s.editor.repository, 'commit'); s.editor.clipboard.dispose(); resolve(); await tick(); expect(commit).not.toHaveBeenCalled();
  });
  it('retains unknown type data through native persistence and recopy without activation', () => {
    const s = setup(), f = plainFragment('unknown'); f.blocks[0].inline!.properties.push({ localId: 'future', type: 'future/animation', startIndex: 0, endIndex: 7, isZeroWidth: false, attributes: { authored: { nested: 'kept' } } });
    s.dispatch('paste', s.select('b', 0), exportClipboard(f));
    const p = (s.node('b').payload.standoffProperties as any[])[0]; expect(p.original.type).toBe('future/animation');
    const resource = captureNative(s.editor.repository.readState(), 'doc'); const reopened = decodeNative(new TextEncoder().encode(JSON.stringify(nativeEnvelope(resource))));
    expect(JSON.stringify(reopened)).toContain('future/animation');
    const recopy = s.dispatch('copy', s.select('b', 0, 7)); s.dispatch('paste', s.select('a', 8), recopy.values);
    const again = (s.node('a').payload.standoffProperties as any[]).at(-1); expect(again.type).toBe('mutable/opaque-property'); expect(again.original).toEqual(p.original);
  });
  it('ordinary typing does no clipboard serialization, repository snapshot or layout measurement', () => {
    const s = setup(); const target = s.select('b', 2);
    const snapshots = vi.spyOn(s.editor.repository, 'snapshot'), layout = vi.spyOn(Element.prototype, 'getBoundingClientRect');
    target.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertText', data: 'X', bubbles: true, cancelable: true }));
    expect(snapshots).not.toHaveBeenCalled(); expect(layout).not.toHaveBeenCalled(); expect(s.editor.clipboard.message()).toBe(''); expect(s.texts()[1]).toBe('taXrget');
  });
});
