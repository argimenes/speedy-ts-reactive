import { describe, expect, it, vi } from 'vitest';
import { ReactiveEditor } from '../reactive-editor/editor';
import type { ExistingBlockDto } from '../block-tree/types';
import { serializeSelection, plainFragment, fragmentText } from './serializer';
import { validateFragment } from './fragment';
import { materializeFragment } from './materialize';
import { exportClipboard, importClipboard, NATIVE_MIME } from './transport';
import { observeLive } from '../knowledge/live-observer';
import { lightweightFacts } from '../knowledge/saved-reader';
import { DEFAULT_POLICY } from '../knowledge/policy';
import { captureNative, nativeEnvelope } from '../persistence/native-resource';

const text = (value: string, extras: ExistingBlockDto = {}) => ({ type: 'standoff-editor-block', text: value, ...extras });
function setup(children: ExistingBlockDto[]) {
  const editor = new ReactiveEditor({ id: 'doc', type: 'document-block', children });
  const view = editor.createView('clipboard');
  const nodes = () => view.node(view.state.rootKey)!.children.map(k => view.node(k)!);
  const state = () => editor.repository.readState();
  const capture = (index: number, start?: number, end?: number) => serializeSelection(state(), [{ placementKey: nodes()[index].placementKey, ...(start !== undefined ? { start, end } : {}) }], { cavernId: 'a', resourceId: 'doc' });
  const paste = (f: ReturnType<typeof plainFragment>, index = 0, start = 0, end = start) => editor.commands.insertMutableText([{ segments: [{ placementKey: nodes()[index].placementKey, start, end }], fragment: materializeFragment(f, { cavernId: 'a', resourceId: 'doc' }), slices: f.roots }]);
  const texts = () => nodes().map(n => n.inlineContent.map(k => String(view.node(k)?.payload.text ?? '\uFFFC')).join(''));
  return { editor, view, nodes, state, capture, paste, texts };
}

describe('Mutable native fragments', () => {
  it('round trips scalar ranges, overlaps, points and entity meaning with fresh identities', () => {
    const s = setup([text('xA😀By', { id: 'source', standoffProperties: [
      { id: 'bold', type: 'style/bold', start: 0, end: 3 },
      { id: 'entity', type: 'codex/entity-reference', value: 'rome', start: 1, end: 3 },
      { id: 'point', type: 'future/bookmark', start: 4, end: 4, isZeroWidth: true, affinity: 'before', label: 'end' },
    ] }), text('ab')]);
    const before = s.editor.repository.snapshot(); const f = s.capture(0, 1, 4);
    expect(fragmentText(f)).toBe('A😀B'); expect(f.blocks[0].inline!.properties.map(p => [p.startIndex, p.endIndex])).toEqual([[0, 3], [0, 3], [3, 3]]);
    expect(s.editor.repository.snapshot()).toEqual(before);
    s.paste(f, 1, 1); expect(s.texts()).toEqual(['xA😀By', 'aA😀Bb']);
    const p = s.nodes()[1].payload.standoffProperties as any[];
    expect(p[0]).toMatchObject({ type: 'style/bold', start: 1, end: 3 });
    expect(p[1]).toMatchObject({ type: 'codex/entity-reference', value: 'rome', start: 1, end: 3 });
    expect(p[2]).toMatchObject({ type: 'mutable/opaque-property', start: 4, end: 4, isZeroWidth: true, original: { type: 'future/bookmark', data: { label: 'end' } } });
    expect(p.every(x => !['bold', 'entity', 'point'].includes(x.id))).toBe(true);
    const ids = p.map(p => p.id); s.editor.repository.undo(); expect(s.texts()).toEqual(['xA😀By', 'ab']); expect(s.nodes()[1].payload.standoffProperties).toBeUndefined();
    s.editor.repository.redo(); expect((s.nodes()[1].payload.standoffProperties as any[]).map(p => p.id)).toEqual(ids);
    s.editor.dispose();
  });

  it('preserves unknown data inertly and never binds a foreign entity by coincident ID', () => {
    const s = setup([text('Rome', { standoffProperties: [{ type: 'codex/entity-reference', value: 'same-guid', start: 0, end: 3, metadata: { label: 'Rome' } }] }), { type: 'iframe-block', metadata: { url: 'https://example.com' }, secretMeaning: { x: 1 } }]);
    const f = s.capture(0), materialized = materializeFragment(f, { cavernId: 'b' });
    const p = materialized.state.contents[materialized.state.placements[materialized.roots[0]].contentKey].payload.standoffProperties as any[];
    expect(p[0]).toMatchObject({ type: 'mutable/opaque-property', original: { type: 'codex/entity-reference', target: { id: 'same-guid', source: { cavernId: 'a' } } } }); expect(p[0].value).toBeUndefined();
    const opaque = materializeFragment(s.capture(1), { cavernId: 'a' });
    const c = opaque.state.contents[opaque.state.placements[opaque.roots[0]].contentKey];
    expect(c.viewType).toBe('mutable/opaque-block'); expect(c.payload.original).toMatchObject({ type: 'iframe-block', data: { secretMeaning: { x: 1 }, metadata: { url: 'https://example.com' } } });
    s.editor.dispose();
  });
  it('excludes unresolved foreign references from both live and saved knowledge facts', async () => {
    const source = setup([text('Rome', { id: 'source', standoffProperties: [{ id: 'mention', type: 'codex/entity-reference', value: 'same-guid', start: 0, end: 3 }] })]);
    const f = source.capture(0, 0, 4), destination = setup([text('', { id: 'destination' })]);
    destination.editor.commands.insertMutableText([{ segments: [{ placementKey: destination.nodes()[0].placementKey, start: 0, end: 0 }], fragment: materializeFragment(f, { cavernId: 'foreign', resourceId: 'doc' }), slices: f.roots }]);
    const live = await observeLive(destination.editor.repository, 'doc', DEFAULT_POLICY, { yieldControl: async () => {} });
    const bytes = new TextEncoder().encode(JSON.stringify(nativeEnvelope(captureNative(destination.state(), 'doc'))));
    const saved = await lightweightFacts(bytes);
    expect(live.facts.mentions).toEqual([]); expect(saved.facts.mentions).toEqual([]); expect(new TextDecoder().decode(bytes)).toContain('same-guid');
    source.editor.dispose(); destination.editor.dispose();
  });

  it('remaps anchors only after allocating all copied Block identities', () => {
    const s = setup([text('note', { id: 'a', metadata: { anchor: { version: 1, blockId: 'b', offset: { x: 10, y: 2 } } } }), text('target', { id: 'b' })]);
    const f = serializeSelection(s.state(), s.nodes().map(n => ({ placementKey: n.placementKey })), { cavernId: 'a', resourceId: 'doc' });
    const m = materializeFragment(f, { cavernId: 'a' }); const contents = m.roots.map(k => m.state.contents[m.state.placements[k].contentKey]);
    expect((contents[0].payload.metadata as any).anchor.blockId).toBe(contents[1].payload.id); expect(contents[1].payload.id).not.toBe('b');
    const outside = materializeFragment(s.capture(0), { cavernId: 'b' });
    expect(outside.state.contents[outside.state.placements[outside.roots[0]].contentKey].payload.mutableUnresolvedLinks).toMatchObject([{ target: { kind: 'external', id: 'b' } }]);
    s.editor.dispose();
  });

  it('clips zero-width boundaries by affinity and includes points in whole empty Blocks', () => {
    const s = setup([text('abc', { standoffProperties: ['before', 'after'].flatMap(affinity => [0, 1, 3].map(start => ({ type: 'point', start, end: start, isZeroWidth: true, affinity }))) }), text('', { standoffProperties: [{ type: 'point', start: 0, end: 0, isZeroWidth: true }] })]);
    expect(s.capture(0, 0, 1).blocks[0].inline!.properties.map(p => [p.startIndex, p.affinity])).toEqual([[1, 'before'], [0, 'after']]);
    expect(s.capture(1).blocks[0].inline!.properties).toHaveLength(1); s.editor.dispose();
  });

  it('reuses only a verified same-Cavern image and preserves unavailable image descriptors', () => {
    const s = setup([text('abc')]);
    s.editor.commands.insertInlineImage(s.nodes()[0].key, 1, { src: '/uploads/map.png', assetId: 'map', alt: 'Map', width: 100, height: 50, status: 'ready' });
    const f = s.capture(0, 0, 3); expect(f.assets).toHaveLength(1);
    const known = new Map([['map', '/uploads/map.png']]);
    const local = materializeFragment(f, { cavernId: 'a' }, known), foreign = materializeFragment(f, { cavernId: 'b' }, known);
    const image = (m: typeof local) => Object.values(m.state.contents).find(c => c.viewType === 'image-cell')!.payload;
    expect(image(local)).toMatchObject({ src: '/uploads/map.png', assetId: 'map', width: 100 });
    expect(image(foreign)).toMatchObject({ src: '', status: 'failed', original: { data: { src: '/uploads/map.png', alt: 'Map' } } }); s.editor.dispose();
  });

  it('retains an eligible unselected anchor target only in its verified source resource', () => {
    const s = setup([text('note', { id: 'a', metadata: { anchor: { version: 1, blockId: 'b', offset: { x: 1, y: 2 } } } }), text('target', { id: 'b' })]);
    const f = s.capture(0), available = new Map([['b', false]]);
    const m = materializeFragment(f, { cavernId: 'a', resourceId: 'doc' }, new Map(), available);
    expect((m.state.contents[m.state.placements[m.roots[0]].contentKey].payload.metadata as any).anchor.blockId).toBe('b'); s.editor.dispose();
  });

  it('maps points consistently for ordinary typing and splits', () => {
    const s = setup([text('abc', { standoffProperties: ['before', 'after'].map(affinity => ({ type: 'point', start: 1, end: 1, isZeroWidth: true, affinity })) })]);
    s.editor.commands.replaceInlineRange(s.nodes()[0].key, 1, 1, 'X');
    expect((s.nodes()[0].payload.standoffProperties as any[]).map(p => p.start)).toEqual([1, 2]);
    s.editor.repository.undo(); s.editor.commands.splitStandoff(s.nodes()[0].key, 1);
    expect((s.nodes()[0].payload.standoffProperties as any[])[0]).toMatchObject({ start: 1, end: 1, affinity: 'before' });
    expect((s.nodes()[1].payload.standoffProperties as any[])[0]).toMatchObject({ start: 0, end: 0, affinity: 'after' }); s.editor.dispose();
  });

  it('preserves destination formatting and performs one bounded commit for a large paste', () => {
    const s = setup([text('abcd', { standoffProperties: [{ id: 'old', type: 'style/italics', start: 0, end: 3 }] })]);
    const snapshots = vi.spyOn(s.editor.repository, 'snapshot'); const commits = vi.spyOn(s.editor.repository, 'commit');
    s.paste(plainFragment('X'.repeat(12000)), 0, 2);
    expect(commits).toHaveBeenCalledTimes(1); expect(snapshots).not.toHaveBeenCalled();
    expect(s.nodes()[0].payload.standoffProperties).toMatchObject([{ id: 'old', start: 0, end: 12003 }]);
    s.editor.repository.undo(); expect(s.texts()).toEqual(['abcd']); s.editor.dispose();
  });

  it('replaces cross-block selections with rich multiple paragraphs in one undo step', () => {
    const s = setup([text('abcd'), text('efgh'), text('ij')]);
    const f = plainFragment('one\ntwo'); f.blocks[1].inline!.properties.push({ localId: 'p', type: 'style/bold', startIndex: 0, endIndex: 3, isZeroWidth: false, attributes: {} });
    const before = s.texts(); s.editor.commands.insertMutableText([{ segments: [{ placementKey: s.nodes()[0].placementKey, start: 2, end: 4 }, { placementKey: s.nodes()[1].placementKey, start: 0, end: 2 }], fragment: materializeFragment(f), slices: f.roots }]);
    expect(s.texts()).toEqual(['abone', 'twogh', 'ij']); expect(s.nodes()[1].payload.standoffProperties).toMatchObject([{ type: 'style/bold', start: 0, end: 2 }]);
    s.editor.repository.undo(); expect(s.texts()).toEqual(before); s.editor.dispose();
  });

  it('keeps whole-Block roots independent when pasted into text', () => {
    const s = setup([text('copy', { id: 'source' }), text('abcd')]); const f = s.capture(0);
    s.paste(f, 1, 2); expect(s.texts()).toEqual(['copy', 'ab', 'copy', 'cd']); expect(s.nodes()[2].payload.id).not.toBe('source');
    s.editor.repository.undo(); expect(s.texts()).toEqual(['copy', 'abcd']); s.editor.dispose();
  });

  it('preserves opaque relationships and keeps an empty anchored destination when splitting', () => {
    const s = setup([text('copy', { relation: { future: { label: 'retained' } } }), text('', { metadata: { anchor: { version: 1, blockId: 'target', offset: { x: 1, y: 2 } } } }), text('target', { id: 'target' })]);
    const f = s.capture(0), m = materializeFragment(f);
    expect(m.state.contents[m.state.placements[m.roots[0]].contentKey].opaqueRelations).toEqual({ future: { label: 'retained' } });
    s.paste(f, 1, 0); expect(s.texts()).toEqual(['copy', '', 'copy', 'target']);
    expect((s.nodes()[1].payload.metadata as any).anchor.blockId).toBe('target');
    expect(s.editor.encodeDocument().children![2].relation).toEqual({ future: { label: 'retained' } }); s.editor.dispose();
  });

  it('preserves an unsupported occurrence’s shared definition inside inert data', () => {
    const f = plainFragment('x');
    f.definitions.push({ localId: 'definition', type: 'style/bold', attributes: { authored: 'retained' } });
    f.blocks[0].inline!.properties.push({ localId: 'occurrence', type: 'future/style', attributes: {}, startIndex: 0, endIndex: 1, isZeroWidth: false, target: { kind: 'local', object: 'definition', id: 'definition' } });
    const m = materializeFragment(f), root = m.state.contents[m.state.placements[m.roots[0]].contentKey];
    expect(root.payload.standoffProperties).toMatchObject([{ type: 'mutable/opaque-property', original: { type: 'future/style', data: { mutableLinkedDefinition: { type: 'style/bold', attributes: { authored: 'retained' } } } } }]);
    expect((root.payload.standoffProperties as any[])[0].annotationId).toBeUndefined();
  });

  it('preserves linked definitions with new shared definition identity', () => {
    const editor = new ReactiveEditor({ type: 'document-block', id: 'doc', linkedAnnotations: { shared: { id: 'shared', type: 'codex/entity-reference', value: 'entity' } }, children: [text('abc', { standoffProperties: [0, 1].map(start => ({ id: `p${start}`, type: 'codex/entity-reference', annotationId: 'shared', start, end: start })) })] });
    const view = editor.createView('linked'), n = view.node(view.node(view.state.rootKey)!.children[0])!;
    const f = serializeSelection(editor.repository.readState(), [{ placementKey: n.placementKey }], { cavernId: 'a' }); expect(f.definitions).toHaveLength(1);
    const m = materializeFragment(f, { cavernId: 'a' }); const p = m.state.contents[m.state.placements[m.roots[0]].contentKey].payload.standoffProperties as any[];
    expect(p[0].annotationId).toBe(p[1].annotationId); expect(p[0].annotationId).not.toBe('shared'); expect(m.linkedAnnotations![p[0].annotationId]).toMatchObject({ value: 'entity' }); editor.dispose();
  });

  it('rejects malicious, malformed and cyclic graphs before mutating a destination', () => {
    const f = plainFragment('abc'); const bad = structuredClone(f); bad.blocks[0].inline!.properties.push({ localId: 'p', type: 'style/bold', startIndex: 0, endIndex: 99, isZeroWidth: false, attributes: {} });
    expect(() => validateFragment(bad)).toThrow();
    const cycle = structuredClone(f); cycle.blocks[0].children.push(cycle.roots[0].placement); expect(() => validateFragment(cycle)).toThrow();
    expect(() => validateFragment(JSON.parse('{"__proto__":{"x":1}}'))).toThrow('Unsafe');
    const version = { ...f, version: 99 }; expect(() => validateFragment(version)).toThrow('version');
  });
  it('rejects unrepresentable authored values and malformed ranges instead of losing data on copy', () => {
    for (const value of [NaN, new Map([['key', 'value']]), { nested: undefined }]) {
      const s = setup([text('abc', { metadata: { value } })]);
      expect(() => s.capture(0)).toThrow('Invalid clipboard value'); s.editor.dispose();
    }
    const s = setup([text('abc', { standoffProperties: [{ type: 'future/property', start: 0, end: 30 }] })]);
    expect(() => s.capture(0)).toThrow('invalid annotation range'); s.editor.dispose();
  });

  it('keeps unsupported embeds and mismatched semantic targets inactive', () => {
    const s = setup([text('abc')]);
    s.editor.commands.insertInlineImage(s.nodes()[0].key, 1, { src: '/uploads/map.png', assetId: 'map', alt: 'Map', status: 'ready' });
    const f = s.capture(0); f.embeds[0].type = 'future/interactive-object';
    f.blocks[0].inline!.properties.push({ localId: 'wrong-target', type: 'codex/entity-reference', startIndex: 0, endIndex: 1, isZeroWidth: false, attributes: {}, target: { kind: 'url', url: 'https://example.com' } });
    const m = materializeFragment(f, { cavernId: 'a' }, new Map([['map', '/uploads/map.png']]));
    expect(Object.values(m.state.contents).find(c => c.viewType === 'image-cell')!.payload).toMatchObject({ src: '', original: { type: 'future/interactive-object' } });
    const root = m.state.contents[m.state.placements[m.roots[0]].contentKey];
    expect(root.payload.standoffProperties).toMatchObject([{ type: 'mutable/opaque-property', original: { type: 'codex/entity-reference' } }]); s.editor.dispose();
  });

  it('exports native HTML carrier, detects external edits, and respects plain paste', () => {
    const f = plainFragment('😀<hello>\nsecond'); f.blocks[0].inline!.properties.push({ localId: 'p', type: 'style/bold', startIndex: 1, endIndex: 3, isZeroWidth: false, attributes: {} });
    const data = exportClipboard(f);
    expect(importClipboard(data).fragment).toEqual(f);
    delete data[NATIVE_MIME]; expect(importClipboard(data).fragment).toEqual(f);
    expect(importClipboard(data, true).fragment!.blocks[0].inline!.properties).toEqual([]);
    const changed = { 'text/html': data['text/html'].replace('&lt;hello&gt;', 'changed'), 'text/plain': '😀changed\nsecond' };
    expect(fragmentText(importClipboard(changed).fragment!)).toBe('😀changed\nsecond'); expect(importClipboard(changed).notice).toContain('carrier');
    expect(fragmentText(importClipboard({ 'text/html': '<script>bad()</script><p>safe<img src="https://evil.test/x"></p>' }).fragment!)).toBe('safe\n');
    expect(importClipboard({ 'text/plain': '' }).fragment).toBeUndefined();
  });
});
