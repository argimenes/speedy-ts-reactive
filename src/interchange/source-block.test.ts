import { expect, it } from 'vitest';
import { sourceFragment, editSource, textareaText } from './source-block';
import { compileSourcePreview, boundedCss } from './source-preview';
import { materializeFragment } from './materialize';
import { serializeSelection } from './serializer';
import { exportFragment } from './export-plan';
import { decodeBlockTree } from '../block-tree/codecs';
import { sourcePayload, sourceType } from './source-block';
import { collectFacts } from '../knowledge/collect-facts';
import { captureNative, nativeText, decodeNative } from '../persistence/native-resource';
import { resourceToRepository } from '../history/durable-core';
import { projectSaved } from '../knowledge-sqlite/saved-projection';
it('preserves mixed line endings, UTF16 and repeated newline edits',()=>{
 const original='😀a\r\nb\nc\rd\r\n';
 expect(editSource(original,textareaText(original))).toBe(original);
 expect(editSource(original,'😀a!\nb\nc\nd\n',{start:3,end:3})).toBe('😀a!\r\nb\nc\rd\r\n');
 expect(editSource(original,'😀a\nb\nNEW\nc\nd\n',{start:6,end:6})).toBe('😀a\r\nb\nNEW\r\nc\rd\r\n');
 expect(editSource('\r\n\n\r','\n\n',{start:1,end:2})).toBe('\r\n\r');
 expect(editSource('\r\n\n\r','\n\n',{start:2,end:2,inputType:'deleteContentBackward'})).toBe('\r\n\r');
 expect(editSource('\r\n\n\r','\n\n',{start:1,end:1,inputType:'deleteContentForward'})).toBe('\r\n\r');
 expect(editSource('\r\n\n\r','\n\n\n\n',{start:1,end:1})).toBe('\r\n\r\n\n\r');
});
it('compiles Markdown with the existing dialect and treats raw HTML literally',()=>{
 const p=compileSourcePreview('# Title\n\n**bold** *em* `x`\n\n| A | B |\n|---|---|\n|1|2|\n\n<script>alert(1)</script>','markdown');
 expect(p.body).toContain('<h1>Title</h1>');expect(p.body).toContain('<strong>bold</strong>');expect(p.body).toContain('<code>x</code>');expect(p.body).toContain('<table>');expect(p.body).toContain('&lt;script&gt;');expect(p.body).not.toContain('<script>');
});
it('sanitizes active markup, external resources, CSS, links and forged carriers without DOM',()=>{
 const p=compileSourcePreview('<!doctype html><html><head><base href="https://probe.invalid"><meta http-equiv="refresh" content="0;url=https://probe.invalid"><style>@import "https://probe.invalid";</style></head><body><script>alert(1)</script><iframe src="https://probe.invalid"></iframe><svg onload="evil()"><text>bad</text></svg><form><input autofocus></form><p onclick="evil()" style="color:purple;position:fixed;background-image:url(https://probe.invalid);padding:99999px;font-size:20px">Safe<img src="https://probe.invalid/a" srcset="https://probe.invalid/b 2x" alt="x"></p><a href="https://example.org">link</a><a href="javascript:evil()">bad</a><span data-mutable-fragment="a">A</span><span data-mutable-fragment="b">B</span></body></html>','html');
 expect(p.body).toContain('Safe');expect(p.body).toContain('color:purple;font-size:20px');expect(p.body).not.toMatch(/script|iframe|svg|form|input|href|src=|srcset|onclick|url\(|fixed|99999/);expect(p.links).toEqual(['https://example.org']);expect(p.resources).toEqual(['https://probe.invalid/a']);expect(p.srcdoc).toContain("script-src 'none'");
 for(const css of ['color:var(--x)','color:expression(alert(1))','font-size:100000px','font-family:url(x)','filter:blur(2px)','padding:calc(1px)','color:r\\65 d','margin:-20px','animation:x 1s','border-style:solid!important'])expect(boundedCss(css)).toBe('');
 expect(boundedCss('color:#abc;padding:2px 4px;border-width:2px')).toBe('color:#abc;padding:2px 4px;border-width:2px');
});
it('keeps source text and inactive annotations through fresh-identity native copy',()=>{
 const f=sourceFragment('html','<p>A\r\nB</p>');f.blocks[0].data.standoffProperties=[{id:'old',type:'future/opaque',annotationId:'unresolved-foreign-definition',start:200,end:400,data:{authored:true}}];
 const one=materializeFragment(f),copied=serializeSelection(one.state,[{placementKey:one.roots[0]}]),two=materializeFragment(copied);
 const a=one.state.contents[one.state.placements[one.roots[0]].contentKey],b=two.state.contents[two.state.placements[two.roots[0]].contentKey];
 expect(a.inlineKind).toBeUndefined();expect(a.inlineContent).toEqual([]);expect(b.payload.text).toBe(a.payload.text);expect(b.payload.standoffProperties).toBeUndefined();expect(b.payload.inactiveSourceAnnotations).toEqual({version:1,properties:f.blocks[0].data.standoffProperties});expect(b.payload.id).not.toBe(a.payload.id);
 const doc=decodeBlockTree({id:'wrapped',type:'document-block',metadata:{documentId:'wrapped'},children:[b.payload as any]}).state;expect(()=>nativeText(captureNative(doc,'wrapped'))).not.toThrow();
 const invalid=sourceFragment('html','safe');(invalid.blocks[0].data.sourceFormat as any).version=9;expect(Object.values(materializeFragment(invalid).state.contents)[0].viewType).toBe('mutable/opaque-block');
});
it('recompiles source for semantic export without active markup or source mutations',()=>{
 const f=sourceFragment('markdown','# Heading\n\n**bold**'),before=JSON.stringify(f);expect(exportFragment(f,'html').text).toContain('<strong>bold</strong>');expect(exportFragment(f,'text').text.trim()).toBe('Heading\nbold');expect(JSON.stringify(f)).toBe(before);
 const html=sourceFragment('html','<p onclick="x()">a<script>x()</script><img src="https://probe.invalid"></p>');expect(exportFragment(html,'html').text).not.toMatch(/script|onclick|src=/);
});
it('round trips exact native source and indexes it literally without inferred entities, including SQL',async()=>{
 const source='<b>Rome</b>\r\nsecond\nthird\rfourth';
 const state=decodeBlockTree({id:'doc',type:'document-block',metadata:{documentId:'doc'},children:[{id:'source',type:sourceType('html'),...sourcePayload('html',source),standoffProperties:[{id:'inactive',type:'codex/entity-reference',value:'entity',start:500,end:999}]}]}).state;
 const facts=await collectFacts(state,'doc');expect(facts.blocks.find(b=>b.id==='source')?.text).toEqual({coordinate:'utf16',runs:[{text:source}]});expect(facts.mentions).toEqual([]);expect(facts.annotations).toEqual([]);
 const bytes=new TextEncoder().encode(nativeText(captureNative(state,'doc'))),restored=resourceToRepository(decodeNative(bytes));expect(Object.values(restored.contents).find(c=>c.payload.id==='source')?.payload.text).toBe(source);
 const sql=await projectSaved(bytes,'vault');expect(sql.blocks.find(b=>b.block.guid==='source').block.text).toBe(source);expect(sql.blocks.find(b=>b.block.guid==='source').segments).toEqual([]);
});
