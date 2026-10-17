import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'solid-js/web';
import { ReactiveEditor } from '../reactive-editor/editor';
import { registerCoreViews } from './register-core-views';
import { ReactiveTreeView } from './reactive-tree-view';
import { exportClipboard, NATIVE_MIME } from '../interchange/transport';
import { plainFragment } from '../interchange/serializer';
import { captureNative, decodeNative, nativeEnvelope } from '../persistence/native-resource';
import { blockMenuItems } from '../runtime/block-menu-actions';
const cleanup: Array<() => void> = [];
afterEach(() => { cleanup.splice(0).reverse().forEach(f => f()); vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.replaceChildren(); });
const tick = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
function setup(enabled = true, externalHtml = true, directDomCharacterCells = true, markdownClipboard = true, managedAssetClipboard = false) {
  const editor = new ReactiveEditor({ type: 'document-block', id: 'doc', children: [
    { type: 'standoff-editor-block', id: 'a', text: 'Rome abc', standoffProperties: [{ id: 'p', type: 'codex/entity-reference', value: 'rome', start: 0, end: 3 }] },
    { type: 'standoff-editor-block', id: 'b', text: 'target' },
  ] }, { features: { mutableClipboard: enabled, externalHtmlClipboard: externalHtml, directDomCharacterCells, markdownClipboard, managedAssetClipboard } });
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
  const clipboardRead = (read: () => Promise<unknown>) => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { read } });
    cleanup.push(() => { delete (navigator as any).clipboard; });
  };
  const markdownItems = (value: string) => [{ types: ['text/plain'], getType: async () => ({ size: value.length, text: async () => value }) }];
  it('exposes explicit Markdown in the existing menu, restores its selection, and commits once', async () => {
    clipboardRead(async () => markdownItems('**bold**'));
    const s = setup(); s.select('b', 0, 6); const commits = vi.spyOn(s.editor.repository, 'commit');
    const key = s.node('b').key;
    s.editor.overlays.open({ ownerKey: key, viewType: 'context-menu', anchor: { x: 0, y: 0 } });
    await tick();
    blockMenuItems(s.editor, key).find(i => i.label === 'Paste as Markdown')!.run!();
    await vi.waitFor(() => expect(s.texts()).toEqual(['Rome abc', 'bold']));
    const inserted = s.editor.encodeDocument().children![1];
    expect(commits).toHaveBeenCalledTimes(1); expect(inserted.standoffProperties).toMatchObject([{ type: 'style/bold' }]);
    expect(s.editor.overlays.overlays).toHaveLength(0);
    expect(document.activeElement).toBe(s.editor.mounts.get(s.node(inserted.id!).key)!.focusElement);
    s.editor.repository.undo(); expect(s.texts()).toEqual(['Rome abc', 'target']);
    s.editor.repository.redo(); expect(s.texts()).toEqual(['Rome abc', 'bold']);
  });
  it('uses supplied Markdown MIME via preparation and never guesses ordinary plain text', async () => {
    const s = setup(); s.dispatch('paste', s.select('b', 0, 6), { 'text/markdown': '**typed**' });
    await vi.waitFor(() => expect(s.texts()[1]).toBe('typed'));
    expect(s.editor.encodeDocument().children![1].standoffProperties).toMatchObject([{ type: 'style/bold' }]);
    s.editor.repository.undo(); s.dispatch('paste', s.select('b', 0, 6), { 'text/plain': '**literal**' });
    expect(s.texts()[1]).toBe('**literal**'); expect(s.node('b').payload.standoffProperties).toEqual([]);
  });
  it('keeps Markdown behind both the shared flag and its importer preference', () => {
    for (const s of [setup(false), setup(true, true, true, false)]) {
      expect(blockMenuItems(s.editor, s.node('b').key).some(i => i.label === 'Paste as Markdown')).toBe(false);
      const commit = vi.spyOn(s.editor.repository, 'commit'); s.editor.clipboard.pasteMarkdown(s.node('b').key);
      expect(commit).not.toHaveBeenCalled();
    }
    const s = setup(true, true, true, false); s.dispatch('paste', s.select('b', 0, 6), { 'text/markdown': '**literal**' });
    expect(s.texts()[1]).toBe('**literal**');
  });
  it('offers a one-shot native-event fallback when asynchronous clipboard reading is denied', async () => {
    clipboardRead(async () => { throw Error('denied'); });
    const s = setup(), target = s.select('b', 0, 6); s.editor.clipboard.pasteMarkdown(s.node('b').key);
    await vi.waitFor(() => expect(s.editor.clipboard.message()).toContain('Press Command/Control-V'));
    expect(s.texts()[1]).toBe('target');
    s.dispatch('paste', target, { 'text/plain': '**bold**' });
    await vi.waitFor(() => expect(s.texts()[1]).toBe('bold'));
    s.editor.repository.undo(); s.dispatch('paste', s.select('b', 0, 6), { 'text/plain': '**literal**' });
    expect(s.texts()[1]).toBe('**literal**');
  });
  it.each(['typing', 'selection', 'cavern', 'cancel', 'dispose'])('rejects asynchronous Markdown completion after %s changes', async change => {
    let resolve!: (items: unknown) => void;
    clipboardRead(() => new Promise(r => { resolve = r; }));
    const s = setup(); s.select('b', 0, 6); s.editor.clipboard.pasteMarkdown(s.node('b').key);
    if (change === 'typing') s.editor.commands.replaceInlineRange(s.node('b').key, 0, 0, '!');
    if (change === 'selection') s.select('b', 2);
    if (change === 'cavern') s.editor.clipboard.setContext(() => ({ cavernId: 'other', session: 'other' }));
    if (change === 'cancel') [...document.querySelectorAll<HTMLButtonElement>('[data-mutable-clipboard-status] button')].find(b => b.textContent === 'Cancel paste')!.click();
    if (change === 'dispose') s.editor.clipboard.dispose();
    const commit = vi.spyOn(s.editor.repository, 'commit'); resolve(markdownItems('**stale**')); await tick();
    expect(commit).not.toHaveBeenCalled(); expect(s.texts()[1]).toBe(change === 'typing' ? '!target' : 'target');
  });
  it.each([true, false])('offers explicit remote consent with no automatic fetch (direct=%s)', async direct => {
    const s = setup(true, true, direct, true, true), fetch = vi.spyOn(globalThis, 'fetch');
    s.dispatch('paste', s.select('b', 0, 6), { 'text/html': '<p>A<img src="https://clipboard-probe.invalid/map.png" alt="map">B</p>' });
    await vi.waitFor(() => expect(s.editor.clipboard.imagePrompt()?.urls).toEqual(['https://clipboard-probe.invalid/map.png']));
    expect(fetch).not.toHaveBeenCalled(); expect(s.texts()[1]).toBe('target');
    const button = [...document.querySelectorAll<HTMLButtonElement>('[data-mutable-image-consent] button')].find(b => b.textContent === 'Keep placeholders')!;
    button.focus();
    button.click();
    expect(document.activeElement, 'focus after consent').toBe(s.editor.mounts.get(s.node('b').key)!.focusElement);
    await vi.waitFor(() => expect(s.host.querySelector('.reactive-inline-image img'), s.editor.clipboard.message()).not.toBeNull());
    expect(s.host.querySelector('.reactive-inline-image img')!.hasAttribute('src')).toBe(false);expect(fetch).not.toHaveBeenCalled();
    s.editor.repository.undo();expect(s.texts()).toEqual(['Rome abc', 'target']);
  });
  it('cancels consent without changing the document', async () => {
    const s = setup(true, true, true, true, true), commits = vi.spyOn(s.editor.repository, 'commit');
    s.dispatch('paste', s.select('b', 0, 6), { 'text/html': '<img src="https://example.com/a">' });
    await vi.waitFor(() => expect(s.editor.clipboard.imagePrompt()).toBeDefined());s.editor.clipboard.cancel();await tick();expect(commits).not.toHaveBeenCalled();expect(s.texts()[1]).toBe('target');
  });
  it.each(['keyboard', 'paste'])('establishes an empty focused paragraph caret for image %s without a prior browser selection', async route => {
    const s=setup(true,true,true,true,true);
    s.editor.commands.replaceInlineRange(s.node('b').key,0,6,'');
    const target=s.select('b',0), mount=s.editor.mounts.get(s.node('b').key)!;
    document.getSelection()!.removeAllRanges();s.editor.selections.clearExcept();
    const commit=vi.spyOn(s.editor.repository,'commit');
    if(route==='keyboard') {
      target.dispatchEvent(new KeyboardEvent('keydown',{key:'v',metaKey:true,bubbles:true,cancelable:true}));
      expect(mount.captureInlineSelection!()).toEqual({anchor:0,head:0});expect(commit).not.toHaveBeenCalled();
    }
    s.dispatch('paste',target,{'text/html':'<img src="https://example.com/map.png">'});
    await vi.waitFor(()=>expect(s.editor.clipboard.imagePrompt()?.urls).toEqual(['https://example.com/map.png']));
    const keep=[...document.querySelectorAll<HTMLButtonElement>('[data-mutable-image-consent] button')].find(b=>b.textContent==='Keep placeholders')!;
    keep.focus();keep.click();
    await vi.waitFor(()=>expect(s.host.querySelector('.reactive-inline-image')).not.toBeNull());
    expect(commit).toHaveBeenCalledTimes(1);s.editor.repository.undo();expect(s.texts()).toEqual(['Rome abc','']);
    s.editor.repository.redo();expect(s.host.querySelector('.reactive-inline-image')).not.toBeNull();
  });
  it('does not invent a caret in populated or composing blocks or replace another block selection', () => {
    const s=setup(),target=s.select('b',0),mount=s.editor.mounts.get(s.node('b').key)!;
    const pasteKey=()=>target.dispatchEvent(new KeyboardEvent('keydown',{key:'v',metaKey:true,bubbles:true,cancelable:true}));
    document.getSelection()!.removeAllRanges();s.editor.selections.clearExcept();pasteKey();
    expect(mount.captureInlineSelection!()).toBeUndefined();
    s.editor.commands.replaceInlineRange(s.node('b').key,0,6,'');mount.composing=true;pasteKey();
    expect(mount.captureInlineSelection!()).toBeUndefined();mount.composing=false;
    mount.focus();s.editor.mounts.get(s.node('a').key)!.restoreInlineSelection!({anchor:0,head:4});
    expect(document.getSelection()!.isCollapsed).toBe(false);pasteKey();
    expect(document.getSelection()!.toString()).toBe('Rome');expect(mount.captureInlineSelection!()).toBeUndefined();
  });
  it('admits carrier-only managed images through the same verified import path', async () => {
    const s = setup(true, true, true, true, true);
    const ref = {kind:'managed',cavernId:'cavern',assetId:'sha256:'+'a'.repeat(64)};
    const fragment = plainFragment('');
    fragment.embeds.push({localId:'image',type:'image-cell',data:{asset:ref,alt:'original'}});
    fragment.blocks[0].inline!.atoms.push({kind:'embed',embed:'image'});
    const verify = vi.spyOn(s.editor.clipboard.assets,'verify').mockResolvedValue({...ref,kind:'managed',mediaType:'image/png',byteLength:10,width:3,height:2});
    vi.spyOn(s.editor.clipboard.assets,'bind').mockImplementation(()=>()=>{});
    const carrier = exportClipboard(fragment);
    s.dispatch('paste',s.select('b',0,6),{'text/html':carrier['text/html'],'text/plain':carrier['text/plain']});
    await vi.waitFor(()=>expect(Object.values(s.editor.repository.readState().contents).find(c=>c.viewType==='image-cell')?.payload.asset).toEqual(ref));
    expect(verify).toHaveBeenCalledTimes(1);
    s.editor.repository.undo();expect(s.texts()[1]).toBe('target');
  });
  it.each(['success','failure','stale'])('handles consented remote acquisition and %s completion', async outcome => {
    const s = setup(true,true,true,true,true), assets=s.editor.clipboard.assets;
    const lease={id:'op',token:'token',cavernId:'cavern'};
    const manifest={kind:'managed' as const,cavernId:'cavern',assetId:'sha256:'+'b'.repeat(64),mediaType:'image/png',byteLength:10,width:3,height:2};
    vi.spyOn(assets,'begin').mockResolvedValue(lease);
    vi.spyOn(assets,'bind').mockImplementation(()=>()=>{});
    const action=vi.spyOn(assets,'action').mockResolvedValue({});
    const remote=vi.spyOn(assets,'remote').mockImplementation(async()=>{
      if(outcome==='failure')throw Error('Download rejected');
      if(outcome==='stale')s.editor.commands.replaceInlineRange(s.node('b').key,0,0,'!');
      return manifest;
    });
    s.dispatch('paste',s.select('b',0,6),{'text/html':'<IMG src="https://example.com/image.png">'});
    await vi.waitFor(()=>expect(s.editor.clipboard.imagePrompt()).toBeDefined());
    expect(remote).not.toHaveBeenCalled();
    const checkbox=document.querySelector<HTMLInputElement>('[data-mutable-image-consent] input')!;
    checkbox.checked=true;checkbox.dispatchEvent(new Event('change',{bubbles:true}));
    const download=[...document.querySelectorAll<HTMLButtonElement>('[data-mutable-image-consent] button')].find(b=>b.textContent==='Download selected images')!;
    download.focus();download.click();
    if(outcome==='failure'){
      await vi.waitFor(()=>expect(s.editor.clipboard.imagePrompt()?.error).toContain('Download rejected'));
      s.editor.clipboard.chooseImages([]);
    }
    await vi.waitFor(()=>expect(s.editor.clipboard.message()).not.toBe('Preparing paste…'));
    await vi.waitFor(()=>expect(action).toHaveBeenCalledWith(lease,outcome==='success'?'finish':'abort'));
    const image=Object.values(s.editor.repository.readState().contents).find(c=>c.viewType==='image-cell');
    if(outcome==='success')expect(image?.payload.asset).toMatchObject({assetId:manifest.assetId});
    if(outcome==='failure')expect(image?.payload.status).toBe('failed');
    if(outcome==='stale'){expect(image).toBeUndefined();expect(s.texts()[1]).toBe('!target');}
  });
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
  it('pastes external semantic HTML through the shared gateway, with a separate rich-off preference', () => {
    const data = { 'text/html': '<b>rich😀</b>', 'text/plain': 'plain' };
    const on = setup(); on.dispatch('paste', on.select('b', 0, 6), data);
    expect(on.texts()[1]).toBe('rich😀'); expect(on.node('b').payload.standoffProperties).toMatchObject([{ type: 'style/bold', start: 0, end: 4 }]);
    on.editor.repository.undo(); expect(on.texts()[1]).toBe('target');
    const off = setup(true, false); off.dispatch('paste', off.select('b', 0, 6), data);
    expect(off.texts()[1]).toBe('plain'); expect(off.node('b').payload.standoffProperties).toEqual([]);
    expect(off.dispatch('copy', off.select('a', 0, 4)).values[NATIVE_MIME]).toBeTruthy();
  });
  it('renders native list markers and table headers, restores an editable caret, and undoes the whole import', async () => {
    const s = setup(), commits = vi.spyOn(s.editor.repository, 'commit');
    s.dispatch('paste', s.select('b', 0, 6), { 'text/html': '<ol start="3"><li>three</li><li value="7">seven<ul><li>nested</li></ul></li></ol><table><tr><th>Header</th><td>Cell</td></tr></table>' });
    await tick();
    expect(commits).toHaveBeenCalledTimes(1);
    expect([...s.host.querySelectorAll('.reactive-imported-list-marker')].map(n => n.textContent)).toEqual(['3.', '7.', '•']);
    expect(s.host.querySelector('[role="columnheader"]')?.textContent).toContain('Header');
    const active = document.activeElement!;
    active.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertText', data: 'after', bubbles: true, cancelable: true }));
    expect(s.editor.encodeDocument().children!.at(-1)!.text).toBe('after');
    s.editor.repository.undo(); s.editor.repository.undo(); expect(s.texts()).toEqual(['Rome abc', 'target']);
  });
  it('does not rebuild list markers or capture repository snapshots while typing inside an imported item', async () => {
    const s = setup(); s.dispatch('paste', s.select('b', 0, 6), { 'text/html': '<ul><li>first</li><li>second</li></ul>' }); await tick();
    const markers = [...s.host.querySelectorAll('.reactive-imported-list-marker')];
    const list = s.editor.encodeDocument().children![1], itemText = list.children![0].children![0];
    const target = s.select(itemText.id!, 1), snapshots = vi.spyOn(s.editor.repository, 'snapshot');
    const mutations: MutationRecord[] = [], observer = new MutationObserver(records => mutations.push(...records));
    markers.forEach(marker => observer.observe(marker, { childList: true, subtree: true, characterData: true }));
    target.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertText', data: 'X', bubbles: true, cancelable: true })); await tick(); observer.disconnect();
    expect([...s.host.querySelectorAll('.reactive-imported-list-marker')]).toEqual(markers); expect(mutations).toEqual([]); expect(snapshots).not.toHaveBeenCalled();
  });
  it.each([true, false])('keeps inert images out of network and history in the direct renderer=%s', async direct => {
    const s = setup(true, true, direct), commits = vi.spyOn(s.editor.repository, 'commit');
    s.dispatch('paste', s.select('b', 0, 6), { 'text/html': '<p>A<img src="https://clipboard-probe.invalid/map.png" alt="map">B</p>' }); await tick();
    const image = s.host.querySelector('.reactive-inline-image img')!;
    expect(image.hasAttribute('src')).toBe(false);
    image.dispatchEvent(new Event('error')); image.dispatchEvent(new Event('load')); await tick();
    expect(commits).toHaveBeenCalledTimes(1);
    s.editor.repository.undo(); expect(s.texts()).toEqual(['Rome abc', 'target']);
  });
});
