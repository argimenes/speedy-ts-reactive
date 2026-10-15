import { describe, expect, it, vi } from 'vitest';
import { parseClipboardHtml } from './html-ast';
import { importSemanticHtml } from './html-import';
import { exportClipboard, importClipboard, NATIVE_MIME } from './transport';
import { fragmentText, plainFragment } from './serializer';
import { materializeFragment } from './materialize';
import { preparePaste } from './prepare';
import { ReactiveEditor } from '../reactive-editor/editor';
import { captureNative, decodeNative, nativeEnvelope } from '../persistence/native-resource';
import type { MutableFragment } from './fragment';

const convert = (html: string) => importSemanticHtml(parseClipboardHtml(html).tree);
const block = (f: MutableFragment, edge: string) => f.blocks.find(b => b.localId === (f.placements.find(p => p.localId === edge)!.target as { id: string }).id)!;
const roots = (f: MutableFragment) => f.roots.map(r => block(f, r.placement));
const inlineText = (b: MutableFragment['blocks'][number]) => b.inline?.atoms.map(a => a.kind === 'text' ? a.text : '\uFFFC').join('');

describe('external semantic HTML', () => {
  it('maps nested formatting by scalar output positions, including combining marks', () => {
    const f = convert(' <strong>A😀<em>é</em>Z</strong> ').fragment!;
    const b = roots(f)[0]; expect(inlineText(b)).toBe('A😀éZ');
    expect(b.inline!.properties.map(p => [p.type, p.startIndex, p.endIndex])).toEqual([['style/bold', 0, 5], ['style/italics', 2, 4]]);
    expect(f.roots[0]).toMatchObject({ openStart: true, openEnd: true });
  });
  it('preserves explicit empty paragraphs and heading meaning without external layout', () => {
    const result = convert('<div><h2 style="margin-left:900px">Title</h2><p></p><p>last</p><h6>six</h6></div>');
    const b = roots(result.fragment!); expect(b.map(inlineText)).toEqual(['Title', '', 'last', 'six']);
    expect(b[0].blockProperties[0].type).toBe('block/font/size/h2');
    expect(b[3]).toMatchObject({ data: { metadata: { htmlHeadingLevel: 6 } }, blockProperties: [{ type: 'block/font/size/h4' }] });
    expect(result.fragment!.roots.every(r => !r.openStart && !r.openEnd)).toBe(true);
    expect(result.notice).toContain('layout'); expect(result.notice).toContain('Heading levels');
  });
  it('collapses only normal HTML whitespace across inline boundaries, retaining NBSP and inline breaks', () => {
    const f = convert('<p>  A \n <b> B </b> C&nbsp; D<br> \tE </p><p> </p>').fragment!;
    expect(roots(f).map(inlineText)).toEqual(['A B C\u00a0 D\nE', '']);
    expect(roots(f)[0].inline!.properties).toMatchObject([{ type: 'style/bold', startIndex: 2, endIndex: 4 }]);
  });
  it('preserves preformatted and code whitespace without activating a code widget', () => {
    const result = convert('<pre> a\r\n  b\t </pre><p>x<code> a  b </code>y</p>');
    expect(roots(result.fragment!).map(inlineText)).toEqual([' a\n  b\t ', 'x a  b y']);
    expect(result.fragment!.blocks.every(b => b.type === 'standoff-editor-block')).toBe(true);
  });
  it('maps semantic tags and a bounded set of office inline CSS', () => {
    const f = convert('<p><u>u</u><del>d</del><mark>m</mark><sup>s</sup><sub>b</sub><span style="font-weight:700;font-style:italic;text-decoration:underline line-through;color:#123456;background-color:rgb(1, 2, 3)">C</span></p>').fragment!;
    expect(roots(f)[0].inline!.properties.map(p => p.type)).toEqual(['style/underline', 'style/strikethrough', 'style/highlight', 'style/superscript', 'style/subscript', 'style/bold', 'style/italics', 'style/underline', 'style/strikethrough', 'text/colour', 'text/background-colour']);
    const reset = convert('<b>a<span style="font-weight:normal">b</span>c</b>').fragment!;
    expect(roots(reset)[0].inline!.properties.map(p => [p.startIndex, p.endIndex])).toEqual([[0, 1], [2, 3]]);
  });
  it('imports safe links and never infers relative-link origins from base tags', () => {
    const result = convert('<base href="https://example.com"><p><a href="https://example.com/a?b=1&amp;c=2">yes</a><a href="/local">relative</a><a href="java&#x73;cript:alert(1)">unsafe</a></p>');
    const props = roots(result.fragment!)[0].inline!.properties;
    expect(props).toHaveLength(1); expect(props[0].target).toEqual({ kind: 'url', url: 'https://example.com/a?b=1&c=2' });
    expect(result.notice).toContain('Unsafe or relative');
  });
  it('uses existing list containers for nesting, ordering, start and item values', () => {
    const f = convert('<ol start="3"><li>first<ul><li>nested</li></ul></li><li value="7"><p>second</p><p>more</p></li></ol>').fragment!;
    const list = roots(f)[0]; expect(list).toMatchObject({ type: 'indented-list-block', data: { metadata: { htmlList: { ordered: true, start: 3 } } } });
    const items = list.children.map(e => block(f, e)); expect(items).toHaveLength(2);
    expect(items[0].children.map(e => block(f, e).type)).toEqual(['standoff-editor-block', 'indented-list-block']);
    expect(items[1]).toMatchObject({ data: { metadata: { htmlListItem: { value: 7 } } } });
    expect(items[1].children.map(e => inlineText(block(f, e)))).toEqual(['second', 'more']);
  });
  it('imports basic tables, headers, captions and empty cells with bounded span degradation', () => {
    const result = convert('<table><caption>Caption</caption><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td colspan="999999">X</td><td></td></tr></tbody></table>');
    const f = result.fragment!, table = roots(f)[1]; expect(inlineText(roots(f)[0])).toBe('Caption');
    expect(table.type).toBe('table-block'); expect(table.children).toHaveLength(2);
    const rows = table.children.map(e => block(f, e)), cells = rows.flatMap(r => r.children.map(e => block(f, e)));
    expect(cells.map(c => inlineText(block(f, c.children[0])))).toEqual(['A', 'B', 'X', '']);
    expect(cells[0].data).toMatchObject({ metadata: { htmlTableCell: { header: true } } });
    expect(result.notice).toContain('Merged table cells'); expect(cells).toHaveLength(4);
  });
  it('keeps mixed image positions, formatting and safe descriptors without usable image sources', () => {
    const f = convert('<p>A<b>😀<img src="https://example.com/a.png" alt="map" title="Map title" width="80" onload="evil()">B</b><img src="data:image/svg+xml,evil" alt="unsafe">C</p>').fragment!;
    expect(inlineText(roots(f)[0])).toBe('A😀\uFFFCB\uFFFCC');
    expect(roots(f)[0].inline!.properties).toMatchObject([{ startIndex: 1, endIndex: 4 }]);
    expect(f.embeds[0].data).toEqual({ src: 'https://example.com/a.png', alt: 'map', title: 'Map title', width: 80 });
    expect(f.embeds[1].data.src).toBe('');
    const m = materializeFragment(f, { cavernId: 'here' });
    const images = Object.values(m.state.contents).filter(c => c.viewType === 'image-cell');
    expect(images.every(c => c.payload.src === '' && c.payload.status === 'failed')).toBe(true);
    expect(images[0].payload.original).toMatchObject({ data: { src: 'https://example.com/a.png', alt: 'map' } });
    const relative = convert('<base href="https://ignored.invalid"><img src="../map.png">').fragment!;
    expect(relative.embeds[0].data).toMatchObject({ src: '', relativeSource: '../map.png' });
  });
  it('never uses DOM parsing or network APIs, and discards active foreign namespaces', () => {
    const fetch = vi.spyOn(globalThis, 'fetch'), dom = vi.spyOn(DOMParser.prototype, 'parseFromString');
    try {
      const result = convert('<title>not document text</title><script>evil()</script><style>@import "https://example.com/a"</style><iframe src="https://example.com"></iframe><svg><image href="https://example.com"></image></svg><form>secret</form><p onclick="evil()" style="background:url(https://example.com/a)">safe<custom-widget> text</custom-widget></p>');
      expect(fragmentText(result.fragment!)).toBe('safe text'); expect(result.notice).toContain('Active HTML');
      expect(JSON.stringify(result.fragment)).not.toMatch(/evil|onclick|https:\/\/example/);
      expect(fetch).not.toHaveBeenCalled(); expect(dom).not.toHaveBeenCalled();
    } finally { fetch.mockRestore(); dom.mockRestore(); }
  });
  it('handles malformed browser HTML deterministically', () => {
    const a = convert('<p><b>bold<i>both</b>italics</i><p>end').fragment!;
    expect(a).toEqual(convert('<p><b>bold<i>both</b>italics</i><p>end').fragment!);
    expect(roots(a).map(inlineText)).toEqual(['boldbothitalics', 'end']);
    expect(roots(a)[0].inline!.properties.every(p => p.endIndex <= 15)).toBe(true);
  });
  it('keeps native/carrier/legacy priority and honors rich-off and explicit plain paste', () => {
    const rich = { 'text/html': '<b>rich</b>', 'text/plain': 'fallback' };
    expect(fragmentText(importClipboard(rich).fragment!)).toBe('rich');
    expect(fragmentText(importClipboard(rich, true).fragment!)).toBe('fallback');
    expect(fragmentText(importClipboard(rich, false, false).fragment!)).toBe('fallback');
    expect(fragmentText(importClipboard({ 'text/html': '<p>A  B</p><p>C</p>' }, true).fragment!)).toBe('A B\nC');
    const native = exportClipboard(plainFragment('native')); expect(fragmentText(importClipboard({ ...rich, [NATIVE_MIME]: native[NATIVE_MIME] }).fragment!)).toBe('native');
    const legacy = JSON.stringify({ source: 'codex', format: 'standoff-inline-v1', data: [[{ kind: 'text', text: 'legacy' }]] });
    expect(fragmentText(importClipboard({ ...rich, 'application/json': legacy }).fragment!)).toBe('legacy');
  });
  it('rejects excessive HTML before conversion and safely falls back without truncation', () => {
    const data = { 'text/html': '<div>'.repeat(70) + 'deep' + '</div>'.repeat(70), 'text/plain': 'fallback' };
    expect(() => parseClipboardHtml(data['text/html'])).toThrow('deeply');
    expect(fragmentText(importClipboard(data).fragment!)).toBe('fallback');
    expect(importClipboard({ 'text/html': '<script>only active</script>' }).fragment).toBeUndefined();
    expect(fragmentText(importClipboard({ 'text/plain': 'a\r\nb\rc' }).fragment!)).toBe('a\nb\nc');
  });
  it('shares worker preparation, one-commit structural insertion, native persistence and stable undo/redo', () => {
    const editor = new ReactiveEditor({ type: 'document-block', id: 'doc', children: [{ type: 'standoff-editor-block', id: 'p', text: 'ab' }] });
    try {
      const state = editor.repository.readState(), root = state.contents[state.placements[state.rootPlacementKey].contentKey];
      const prepared = preparePaste({ data: { 'text/html': '<h1>Title</h1><ul><li>item</li></ul><table><tr><td>cell</td></tr></table>' }, plain: false, semanticHtml: true, scope: {}, assets: [], blocks: [], selections: 1 });
      const commits = vi.spyOn(editor.repository, 'commit'), snapshots = vi.spyOn(editor.repository, 'snapshot');
      const [result] = editor.commands.insertMutableText([{ segments: [{ placementKey: root.children[0], start: 1, end: 2 }], fragment: prepared.natives![0], slices: prepared.fragment!.roots }]);
      expect(commits).toHaveBeenCalledTimes(1); expect(snapshots).not.toHaveBeenCalled();
      const after = editor.repository.readState(), caret = after.contents[after.placements[result.placementKey].contentKey];
      expect(caret.inlineKind).toBe('standoff'); expect(caret.inlineContent).toHaveLength(0);
      const saved = JSON.stringify(nativeEnvelope(captureNative(after, 'doc'))); expect(() => decodeNative(new TextEncoder().encode(saved))).not.toThrow();
      editor.repository.undo(); expect(editor.encodeDocument().children![0].text).toBe('ab');
      editor.repository.redo(); expect(JSON.stringify(nativeEnvelope(captureNative(editor.repository.readState(), 'doc')))).toBe(saved);
    } finally { editor.dispose(); }
  });
});
