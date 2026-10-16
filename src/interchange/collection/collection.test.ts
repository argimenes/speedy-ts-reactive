import {Blob as NodeBlob} from 'node:buffer';
const blob=(parts:string[])=>new NodeBlob(parts) as unknown as Blob;
// @vitest-environment jsdom
import {describe,it,expect} from 'vitest';
import {allocate,classify,resolvePath,relativePath,relativeLink,validateInventory,type Entry} from './plan';
import {hash,bytes,packZip,unpackZip} from '../package/archive';
import {prepareCollectionDocument,collectionNative,collectionMarkdown} from './content';
import {collectionOperation,collectionArchivePolicy,inspectCollectionNative} from './operations';
const entry=(path:string,kind:Entry['kind']='markdown'):Entry=>({path,kind,size:1,hash:'a'});
const options={cavernId:'c',vault:'.',destination:'Imports',mode:'native' as const};
describe('collection inventory and relationship allocation',()=>{
 it('preserves nested paths, cycles and deterministic collision suffixes without basename guessing',()=>{
  const entries=[entry('a.md'),entry('sub/b.md'),entry('sub/a.md')],plan=allocate(entries,[{path:'Imports/a.ink',directory:false}],options);
  expect(plan.documents.map(d=>d.path)).toEqual(['Imports/a (2).ink','Imports/sub/a.ink','Imports/sub/b.ink']);
  expect(resolvePath('a.md','sub/b',entries).entry?.path).toBe('sub/b.md');expect(resolvePath('sub/b.md','../a',entries).entry?.path).toBe('a.md');
  expect(resolvePath('sub/b.md','/a',entries,true).entry?.path).toBe('a.md');expect(resolvePath('a.md','b',entries).entry).toBeUndefined();
  expect(relativeLink('sub/b.md','a (2).md')).toBe('../a%20(2).md');
 });
 it('accounts for file/directory conflicts and existing case-folded directory spelling',()=>{
  const plan=allocate([entry('dir/a.md')],[{path:'imports',directory:true},{path:'imports/dir',directory:false}],options);expect(plan.documents[0].path).toBe('imports/dir (2)/a.ink');
  expect(allocate([entry('a.md')],[{path:'Imports',directory:false}],options).documents[0].path).toBe('Imports (2)/a.ink');
 });
 it('rejects unsafe paths and aliases and reports missing/ambiguous/fragment targets',()=>{
  for(const p of ['/outside','../outside','a/../../x','C:/data','x\\y','a/.','x\0z','a/CON.md'])expect(()=>relativePath(p)).toThrow();
  expect(()=>validateInventory([entry('a.md'),entry('A.md')])).toThrow(/ambiguity/);
  expect(()=>validateInventory([entry('Folder/a.md'),entry('folder/b.md')])).toThrow(/ambiguity/);
  expect(()=>validateInventory([entry('a.md'),entry('a.md/nested.md')])).toThrow(/ambiguity/);
  expect(()=>allocate([entry('a.md')],[],{...options,destination:'.mutable'})).toThrow(/hidden/);
  expect(()=>validateInventory([entry('café.md'),entry('cafe\u0301.md')])).toThrow(/ambiguity/);
  expect(resolvePath('a.md','../out.md',[]).reason).toMatch(/escapes/);
  expect(resolvePath('a.md','b#heading',[]).reason).toMatch(/Heading/);
  expect(resolvePath('a.md','b%23name.md',[entry('b#name.md')]).entry?.path).toBe('b#name.md');
  expect(resolvePath('a.md','b',[entry('b.md'),entry('b.markdown')]).reason).toMatch(/Ambiguous/);
  expect(classify('.obsidian/config.json',1).kind).toBe('skip');
  expect(()=>validateInventory(Array.from({length:1001},(_,i)=>entry(`${i}.md`)))).toThrow(/1,000/);
 });
 it('supports skip and abort without overwriting',()=>{const existing=[{path:'Imports/a.ink',directory:false}];expect(allocate([entry('a.md')],existing,options,'skip').documents[0].status).toBe('skipped');expect(()=>allocate([entry('a.md')],existing,options,'abort')).toThrow(/collision/);});
});
async function prepared(source:string,path='a.md',extra:Entry[]=[],mode:'source'|'native'='native'){
 const file=blob([source]),e={...entry(path),size:file.size,hash:await hash(bytes(source))},plan=allocate([e,...extra],[],{...options,mode}),doc=plan.documents.find(d=>d.source===path)!;
 return {plan,doc,prepared:await prepareCollectionDocument(file,e,plan)};
}
describe('shared semantic import and native export',()=>{
 it('resolves wiki/conventional links and image positions, preserves unsupported syntax, leaves code alone',async()=>{
  const result=await prepared('Start [[sub/b|Book]] and [regular](sub/b.md). ![[photo.png]]\n\n`[[sub/b]]` [[missing]] ![[sub/b]] [[sub/b#heading]]','a.md',[entry('sub/b.md'),entry('photo.png','image')]);
  expect(result.prepared.bindings.filter(b=>!b.image)).toHaveLength(2);expect(result.prepared.bindings.filter(b=>b.image)).toHaveLength(1);
  expect(result.prepared.diagnostics.join(' ')).toMatch(/Missing/);expect(result.prepared.diagnostics.join(' ')).toMatch(/transclusion/);
  const asset={kind:'managed' as const,cavernId:'c',assetId:'sha256:'+'a'.repeat(64),mediaType:'image/png',byteLength:1,width:1,height:1};
  const native=collectionNative(result.prepared,result.plan,result.doc,{'photo.png':asset}),info=inspectCollectionNative(native,'c');
  const references=info.fragment.blocks.flatMap(b=>b.inline?.properties??[]).filter(p=>p.type==='codex/block-reference');expect(references).toHaveLength(2);expect((references[0].attributes.metadata as any).documentId).toBe(result.plan.documents.find(d=>d.source==='sub/b.md')!.id);expect(info.assets[0].assetId).toBe(asset.assetId);
  const projected=await collectionOperation({action:'project',native,cavernId:'c',path:'a.md',paths:Object.fromEntries(result.plan.documents.map(d=>[d.id,d.source])),assetPaths:{[`c/${asset.assetId}`]:'_assets/a.png'}});expect(projected.text).toContain('sub/b.md');expect(projected.text).toContain('_assets/a.png');expect(projected.text).toContain('missing');
 });
 it('source mode keeps exact authored text and rewrites only semantic links during export',async()=>{
  const source='# A\r\n\r\n[[sub/b|Book]] `[[sub/b]]`\r\n![Photo](photo.png)\r\n';
  const r=await prepared(source,'a.md',[entry('sub/b.md'),entry('photo.png','image')],'source');
  const asset={kind:'managed' as const,cavernId:'c',assetId:'sha256:'+'b'.repeat(64),mediaType:'image/png',byteLength:1};
  const native=collectionNative(r.prepared,r.plan,r.doc,{'photo.png':asset}),info=inspectCollectionNative(native,'c');expect(info.source?.data.text).toBe(source);
  const projected=await collectionOperation({action:'project',native,cavernId:'c',path:'a.md',paths:{[r.plan.documents.find(d=>d.source==='sub/b.md')!.id]:'sub/b (2).md'},assetPaths:{[`c/${asset.assetId}`]:'_assets/b.png'}});
  expect(projected.text).toContain('[Book](<sub/b%20(2).md>)');expect(projected.text).toContain('`[[sub/b]]`');expect(projected.text).toContain('\r\n');expect(projected.text).toContain('_assets/b.png');
 });
 it('rejects changed source bytes before conversion and retains escaped wiki syntax',async()=>{const r=await prepared('original');await expect(prepareCollectionDocument(blob(['changed']),r.plan.entries[0],r.plan)).rejects.toThrow(/changed/);const x=collectionMarkdown('\\[\\[b\\]\\] `[[b]]`','a.md',[entry('b.md')],allocate([entry('b.md')],[],options).documents);expect(x.bindings).toHaveLength(0);});
 it('round-trips exported links without original identities and packages assets once with unchanged package defaults',async()=>{
  const r=await prepared('[B](sub/b.md)','a.md',[entry('sub/b.md')]);const native=collectionNative(r.prepared,r.plan,r.doc,{}),projected=await collectionOperation({action:'project',native,cavernId:'c',path:'a.md',paths:{[r.plan.documents.find(d=>d.source==='sub/b.md')!.id]:'sub/b.md'},assetPaths:{}});
  const again=await prepared(projected.text,'a.md',[entry('sub/b.md')]);expect(again.prepared.bindings[0].id).not.toBe(r.prepared.bindings[0].id);
  const zip=packZip({'a.md':bytes(projected.text),'sub/b.md':bytes('B'),'_assets/image.png':new Uint8Array([1,2,3])},collectionArchivePolicy);expect(unpackZip(zip,collectionArchivePolicy).get('_assets/image.png')).toEqual(new Uint8Array([1,2,3]));
  const many=Object.fromEntries(Array.from({length:257},(_,i)=>[`${i}.md`,bytes('x')]));expect(()=>packZip(many)).toThrow(/limit/i);expect(unpackZip(packZip(many,collectionArchivePolicy),collectionArchivePolicy).size).toBe(257);
 });
});
it('diagnoses conflicting relative and Vault-root wiki targets and never activates one on source export',async()=>{
 const r=await prepared('[[a]] [[/a|root]]','sub/current.md',[entry('a.md'),entry('sub/a.md')],'source');
 expect(r.prepared.diagnostics.join(' ')).toMatch(/Ambiguous/);expect(r.prepared.bindings).toHaveLength(1);
 const native=collectionNative(r.prepared,r.plan,r.doc,{}),projected=await collectionOperation({action:'project',native,cavernId:'c',path:'sub/current.md',paths:{[r.prepared.bindings[0].id!]:'a.md'},assetPaths:{}});
 expect(projected.text).toContain('[[a]]');expect(projected.text).toContain('[root](<../a.md>)');
});
it('retains HTML authoritative source and reconciles local resources without interpreting scripts',async()=>{
 const source='<p><a href="b.md">B</a><img src="photo.jpg" alt="Photo"></p><script>fetch("https://evil.invalid")</script>',blobValue=blob([source]);
 const e={...entry('a.html','html'),size:blobValue.size,hash:await hash(bytes(source))},plan=allocate([e,entry('b.md'),entry('photo.jpg','image')],[],{...options,mode:'source'}),doc=plan.documents.find(d=>d.source==='a.html')!;
 const imported=await prepareCollectionDocument(blobValue,e,plan);expect(imported.fragment.blocks[0].data.text).toBe(source);
 const asset={kind:'managed' as const,cavernId:'c',assetId:'sha256:'+'c'.repeat(64),mediaType:'image/jpeg',byteLength:1};
 const native=collectionNative(imported,plan,doc,{'photo.jpg':asset}),projected=await collectionOperation({action:'project',native,cavernId:'c',path:'a.html',paths:{[plan.documents.find(d=>d.source==='b.md')!.id]:'renamed.md'},assetPaths:{[`c/${asset.assetId}`]:'_assets/c.jpg'}});
 expect(projected.text).toContain('href="renamed.md"');expect(projected.text).toContain('src="_assets/c.jpg"');expect(projected.text).toContain("default-src 'none'");
});
it('enforces aggregate inventory and output limits before allocating a giant content buffer',()=>{
 expect(()=>validateInventory([{...entry('large.md'),size:513*1024*1024}])).toThrow(/512 MiB/);
 expect(()=>validateInventory(Array.from({length:5001},(_,i)=>entry(`${i}.png`,'image')))).toThrow(/5,000/);
 expect(classify('large.png',11*1024*1024)).toMatchObject({kind:'skip'});
 expect(()=>packZip({'bounded.md':bytes('123456')},{...collectionArchivePolicy,expanded:5})).toThrow(/limits/);
});
it('exports document references carried by shared linked definitions',async()=>{
 const r=await prepared('[B](b.md)','a.md',[entry('b.md')]);
 const {decodeNative,nativeText}=await import('../../persistence/native-resource');
 const snapshot=structuredClone(decodeNative(bytes(collectionNative(r.prepared,r.plan,r.doc,{}))));
 const root=Object.values(snapshot.contents).find(c=>c.viewType==='document-block')!;
 const paragraph=Object.values(snapshot.contents).find(c=>c.viewType==='standoff-editor-block')!;
 const p=(paragraph.payload.standoffProperties as any[])[0];const annotationId=crypto.randomUUID();root.payload.linkedAnnotations={[annotationId]:{id:annotationId,type:p.type,value:p.value,metadata:p.metadata}};
 paragraph.payload.standoffProperties=[{id:p.id,annotationId,start:p.start,end:p.end}];
 const target=r.plan.documents.find(d=>d.source==='b.md')!;
 const projected=await collectionOperation({action:'project',native:nativeText(snapshot),cavernId:'c',path:'a.md',paths:{[target.id]:'b.md'},assetPaths:{}});
 expect(projected.text).toContain('[B](<b.md>)');
});
it('keeps unsupported wiki embed parameters literal and retains supported image metadata',async()=>{
 const entries=[entry('photo.png','image')];const r=await prepared('![[photo.png|200x100]] ![Alt](photo.png "Title")','a.md',entries);expect(r.prepared.bindings).toHaveLength(1);expect(r.prepared.diagnostics.join(' ')).toMatch(/Unsupported wiki/);
 expect(r.prepared.fragment.embeds[0].data).toMatchObject({alt:'Alt',title:'Title'});
});
it('retains the shared per-document image-count bound for remote placeholders as well as local assets',async()=>{
 await expect(prepared(Array.from({length:21},(_,i)=>`![image](https://example.invalid/${i}.png)`).join('\n'))).rejects.toThrow(/20 image/);
});
it('diagnoses source-bound attachments at the unchanged single-document package/projection boundary',async()=>{
 const r=await prepared('![[photo.png]]','a.md',[entry('photo.png','image')],'source');
 const asset={kind:'managed' as const,cavernId:'c',assetId:'sha256:'+'d'.repeat(64),mediaType:'image/png',byteLength:1};const native=collectionNative(r.prepared,r.plan,r.doc,{'photo.png':asset});
 const {nativeInventory}=await import('../package/format');const {exportFragment}=await import('../export-plan');const {snapshot,fragment}=inspectCollectionNative(native,'c');
 expect(nativeInventory(snapshot).unresolvedAssets[0].reason).toMatch(/Export collection/);expect(exportFragment(fragment,'markdown').diagnostics.some(d=>d.code==='collection-source-assets')).toBe(true);
});
