// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Blob as NodeBlob } from 'node:buffer';
import { webcrypto } from 'node:crypto';
import { decodeSource, readSelectedFile } from './file-input';
import { convertSource, documentFragment, joinFragments, prepareFiles } from './document-import';
import { exportFragment } from './export-plan';
import { fragmentText, plainFragment, serializeSelection } from './serializer';
import { materializeFragment } from './materialize';
import { conversionSource } from './conversion';
import { ReactiveEditor } from '../reactive-editor/editor';
import { nativeDocumentSession } from '../persistence/native-session';
import { writeAsyncClipboard, writeEventClipboard, NATIVE_MIME } from './transport';
const editors:ReactiveEditor[]=[];afterEach(()=>{editors.splice(0).forEach(e=>e.dispose());vi.restoreAllMocks();vi.unstubAllGlobals();});
function editor(text='L **bold** R',properties:any[]=[]){const e=new ReactiveEditor({id:'doc',type:'document-block',children:[{id:'text',type:'standoff-editor-block',text,standoffProperties:properties}]});editors.push(e);const v=e.createView('test'),node=()=>Object.values(v.state.nodes).find(n=>n.payload.id==='text')!;return {e,v,node};}
const file=(name:string,value:string|Uint8Array,type='')=>({name,blob:new NodeBlob([value],{type}) as unknown as Blob});
const crypto=()=>vi.stubGlobal('crypto',webcrypto);
it('strictly decodes BOMs, astral/combining text and preserves literal TXT lines',async()=>{
 crypto();const value='😀e\u0301\t \r\n\r\n';const r=await prepareFiles([file('source.txt',new Uint8Array([239,187,191,...new TextEncoder().encode(value)]))]);
 expect(fragmentText(r[0].fragment)).toBe('😀e\u0301\t \n\n');expect(r[0].provenance).toMatchObject({encoding:'utf-8',bom:true});expect(r[0].diagnostics[0].code).toBe('normalized-newlines');
 expect(decodeSource(new Uint8Array([255,254,65,0])).source).toBe('A');expect(decodeSource(new Uint8Array([254,255,0,65])).source).toBe('A');
 expect(()=>decodeSource(new Uint8Array([195,40]))).toThrow('Invalid');expect(()=>decodeSource(new Uint8Array([0]))).toThrow('Binary');
 expect(fragmentText((await prepareFiles([file('source.txt','**literal**')]))[0].fragment)).toBe('**literal**');
});
it('rejects native open/import confusion, binary mismatches and unsupported extensions',async()=>{
 crypto();await expect(readSelectedFile(file('native.ink','{}'))).rejects.toThrow('Open existing');await expect(readSelectedFile(file('photo.jpg','text'))).rejects.toThrow('contents');
 await expect(readSelectedFile(file('source.xyz','text'))).rejects.toThrow('Unsupported');expect((await readSelectedFile(file('source.xyz','text'),'text')).source).toBe('text');
 await expect(readSelectedFile(file('source.md','<!doctype html><p>x'))).rejects.toThrow('HTML');
 await expect(readSelectedFile(file('source.md','text','text/html'))).rejects.toThrow('disagree');
});
it('imports full HTML body without active content, native carriers or adjacent resource reads',async()=>{
 crypto();const fetch=vi.spyOn(globalThis,'fetch');const [{fragment,title,filename}]=await prepareFiles([file('safe.html','<!doctype html><html><head><title>Different</title><script>alert(1)</script></head><body><h2>Heading</h2><p data-mutable-fragment="evil"><b>Bold</b><img src="relative.png" alt="Kept"></p><iframe src="https://evil.test"></iframe></body></html>')]);
 expect(title).toBe('safe');expect(filename).toBe('safe.ink');expect(fragmentText(fragment)).toContain('Heading');expect(JSON.stringify(fragment)).not.toContain('alert(1)');expect(fragment.assets[0].source).toMatchObject({kind:'unresolved'});expect(fetch).not.toHaveBeenCalled();
});
it('combines files with unique local identities in supplied order and fresh native identities',()=>{
 const a=convertSource('# First','markdown').fragment,b=plainFragment('Second\n');const joined=joinFragments([a,b]);expect(fragmentText(joined)).toBe('First\nSecond\n');
 const wrapped=documentFragment(joined,'Copy','Copy.ink'),one=materializeFragment(wrapped,{}),two=materializeFragment(wrapped,{});
 expect(one.state.contents[one.state.placements[one.roots[0]].contentKey].payload.id).not.toBe(two.state.contents[two.state.placements[two.roots[0]].contentKey].payload.id);
 expect(joined.roots.every(r=>!r.openStart&&!r.openEnd)).toBe(true);
});
it('emits escaped, network-inert semantic HTML, lists and tables',()=>{
 const f=convertSource('<h2>A &amp; B</h2><ol start="3"><li>One</li><li>Two</li></ol><table><tr><th>H</th></tr><tr><td><b>C</b></td></tr></table><p><img src="https://evil.test/x.png" alt="x"></p>','html').fragment;
 const out=exportFragment(f,'html','<Title>',true);const dom=new DOMParser().parseFromString(out.text,'text/html');
 expect(dom.title).toBe('<Title>');expect(dom.querySelector('h2')?.textContent).toBe('A & B');expect(dom.querySelector('ol')?.getAttribute('start')).toBe('3');expect(dom.querySelector('th')?.textContent).toBe('H');expect(dom.querySelector('td strong')?.textContent).toBe('C');expect(dom.querySelector('img,script')).toBeNull();expect(out.text).not.toContain('https://evil.test');expect(out.diagnostics.some(d=>d.code==='image-reference')).toBe(true);
});
it('segments crossing formatting and overlapping links without nested anchors',()=>{
 const {e,node}=editor('abcdef',[{id:'bold',type:'style/bold',start:0,end:3},{id:'italic',type:'style/italics',start:2,end:5},{id:'a',type:'reference/url',value:'https://a.test',start:0,end:5},{id:'b',type:'reference/url',value:'https://b.test',start:2,end:3}]);
 const f=serializeSelection(e.repository.readState(),[{placementKey:node().placementKey}],{}),html=exportFragment(f,'html'),dom=new DOMParser().parseFromString(html.text,'text/html');
 expect(dom.body.textContent).toBe('abcdef');expect(dom.querySelector('a a')).toBeNull();expect(html.diagnostics.some(d=>d.code==='overlapping-links')).toBe(true);expect(exportFragment(f,'markdown').diagnostics.some(d=>d.code==='markdown-overlap')).toBe(true);
});
it('escapes authored HTML ids and labels and reports unknown and point annotations',()=>{
 const f=plainFragment('<script>');f.blocks[0].inline!.properties.push({localId:'point"',type:'future/point',attributes:{},startIndex:0,endIndex:0,isZeroWidth:true});
 const result=exportFragment(f,'html');expect(result.text).toContain('&lt;script&gt;');expect(result.text).toContain('point&quot;');expect(result.diagnostics[0].code).toBe('point-annotation');expect(exportFragment(f,'text').text).toBe('<script>');
});
it('exports Markdown code fences, headings, tables and plain text final lines',()=>{
 const f=convertSource('# Head\n\n```js\nconst x = `hi`;\n```\n\n| A | B |\n| --- | --- |\n| x | y |','markdown').fragment;
 const out=exportFragment(f,'markdown');expect(out.text).toContain('# Head');expect(out.text).toContain('```js\nconst x = `hi`;');expect(out.text).toContain('| --- | --- |');
 expect(fragmentText(convertSource(out.text,'markdown').fragment)).toContain('const x = `hi`;');expect(exportFragment(plainFragment('a\n\n'),'text').text).toBe('a\n\n');
});
it('conversion removes consumed annotations, splits spanning ones and exactly undoes/redoes',()=>{
 const props=[{id:'span',type:'style/underline',start:0,end:11},{id:'inside',type:'codex/entity-reference',value:'entity',start:2,end:9},{id:'point',type:'future/point',start:4,end:4,isZeroWidth:true}];
 const {e,node}=editor('L **bold** R',props),before=e.encodeDocument(),segments=[{placementKey:node().placementKey,start:2,end:10}],f=convertSource('**bold**','markdown').fragment;f.roots[0].openStart=f.roots[0].openEnd=true;
 expect(conversionSource(e.repository.readState(),segments).diagnostics[0].detail).toContain('3 annotation');
 e.commands.insertMutableText([{segments,fragment:materializeFragment(f,{}),slices:f.roots}],false,'convert');
 const after=e.encodeDocument(),p=node().payload.standoffProperties as any[];expect(after.children?.[0].text).toBe('L bold R');expect(p.filter(x=>x.type==='style/underline').map(x=>[x.start,x.end])).toEqual([[0,1],[6,7]]);expect(p.find(x=>x.id==='inside')).toBeUndefined();expect(p.filter(x=>x.type==='style/underline')[0].id).toBe('span');expect(new Set(p.map(x=>x.id)).size).toBe(p.length);
 e.repository.undo();expect(e.encodeDocument()).toEqual(before);e.repository.redo();expect(e.encodeDocument()).toEqual(after);
});
it('conversion rejects selections with inline objects or shared/attached content',()=>{
 const {e,node}=editor('source');e.commands.setPayloadField(node().key,'standoffProperties',[]);
 const s=e.repository.snapshot(),c=s.contents[node().contentKey];c.inlineContent[0]&& (s.contents[s.placements[c.inlineContent[0]].contentKey].viewType='image-cell');
 expect(()=>conversionSource(s,[{placementKey:node().placementKey,start:0,end:6}])).toThrow('literal');
});
it('imports independent dirty candidates without filesystem writes and retains per-file failures',async()=>{
 crypto();const e=new ReactiveEditor({id:'workspace',type:'workspace-block',children:[{id:'bank',type:'workspace-object-bank-block',children:[]}]});editors.push(e);const ids:string[]=[],fetch=vi.spyOn(globalThis,'fetch');
 await e.interchange.importNew([file('one.txt','one'),file('bad.jpg','bad'),file('two.md','**two**')],{current:()=>true,open:id=>{ids.push(id);}});
 expect(ids).toHaveLength(2);expect(new Set(ids).size).toBe(2);expect(e.interchange.message()).toContain('bad.jpg: File contents');const native=nativeDocumentSession(e);for(const id of ids){expect(native.isCandidate(id)).toBe(true);expect(native.isDirty(id)).toBe(true);expect(native.location(id)).toBeUndefined();}expect(fetch).not.toHaveBeenCalled();
});
it('cancels stale new import and honours the single feature flag',async()=>{
 crypto();const e=new ReactiveEditor({id:'w',type:'workspace-block',children:[{id:'bank',type:'workspace-object-bank-block'}]},{features:{documentInterchange:false}});editors.push(e);const before=e.repository.state.revision;
 await e.interchange.importNew([file('one.txt','one')],{current:()=>true,open:()=>{throw Error('unexpected');}});expect(e.repository.state.revision).toBe(before);
 const on=new ReactiveEditor({id:'w2',type:'workspace-block',children:[{id:'bank2',type:'workspace-object-bank-block'}]});editors.push(on);await on.interchange.importNew([file('one.txt','one')],{current:()=>false,open:()=>{throw Error('unexpected');}});expect(on.interchange.message()).toContain('changed');expect(Object.values(on.repository.state.contents).some(c=>c.viewType==='document-block')).toBe(false);
});
it('projection clipboard writers omit native carriers and support Markdown plus plain fallback',async()=>{
 const values:Record<string,string>={};writeEventClipboard({setData:(key:string,value:string)=>{values[key]=value;}} as DataTransfer,{'text/plain':'**x**','text/markdown':'**x**'});expect(values).toEqual({'text/plain':'**x**','text/markdown':'**x**'});expect(values[NATIVE_MIME]).toBeUndefined();
 const write=vi.fn().mockResolvedValue(undefined);vi.stubGlobal('navigator',{clipboard:{write}});vi.stubGlobal('ClipboardItem',class {static supports=()=>true;constructor(readonly data:unknown){}});await writeAsyncClipboard(values);expect(Object.keys(write.mock.calls[0][0][0].data)).toEqual(['text/plain','web text/markdown']);
});
it('adds no interchange preparation, snapshot or geometry work to ordinary typing',()=>{
 const {e,node}=editor('abc'),snapshot=vi.spyOn(e.repository,'snapshot'),layout=vi.spyOn(Element.prototype,'getBoundingClientRect');
 for(let i=0;i<20;i++)e.commands.replaceInlineRange(node().key,i,i,'x');expect(snapshot).not.toHaveBeenCalled();expect(layout).not.toHaveBeenCalled();expect(e.interchange.busy()).toBe(false);expect(e.interchange.message()).toBe('');
});
it('converts contiguous sibling source paragraphs with exact structural undo',()=>{
 const e=new ReactiveEditor({id:'doc',type:'document-block',children:[{id:'a',type:'standoff-editor-block',text:'L **bo',standoffProperties:[{id:'left',type:'style/underline',start:0,end:5}]},{id:'b',type:'standoff-editor-block',text:'ld** R',standoffProperties:[{id:'right',type:'style/underline',start:0,end:5}]}]});editors.push(e);const v=e.createView('cross'),nodes=v.node(v.state.rootKey)!.children.map(k=>v.node(k)!);
 const before=e.encodeDocument(),segments=[{placementKey:nodes[0].placementKey,start:2,end:6},{placementKey:nodes[1].placementKey,start:0,end:4}];const f=convertSource(fragmentText(serializeSelection(e.repository.readState(),segments,{})),'markdown').fragment;f.roots[0].openStart=f.roots[0].openEnd=true;
 e.commands.insertMutableText([{segments,fragment:materializeFragment(f,{}),slices:f.roots}],false,'convert');const after=e.encodeDocument();expect(after.children).toHaveLength(1);expect(after.children![0].text).toBe('L bo ld R');expect((after.children![0].standoffProperties as any[]).filter(p=>p.type==='style/underline').map(p=>[p.id,p.start,p.end])).toEqual([['left',0,1],['right',7,8]]);e.repository.undo();expect(e.encodeDocument()).toEqual(before);e.repository.redo();expect(e.encodeDocument()).toEqual(after);
});
it('uses source order to break equally specific overlapping link ties',()=>{
 const f=plainFragment('abc');f.blocks[0].inline!.properties=[{localId:'z',type:'reference/url',startIndex:0,endIndex:3,isZeroWidth:false,attributes:{},target:{kind:'url',url:'https://first.test'}},{localId:'a',type:'reference/url',startIndex:0,endIndex:3,isZeroWidth:false,attributes:{},target:{kind:'url',url:'https://second.test'}}];const result=exportFragment(f,'html');expect(result.text).toContain('https://first.test');expect(result.text).not.toContain('https://second.test');expect(result.diagnostics.some(d=>d.code==='overlapping-links')).toBe(true);
});
