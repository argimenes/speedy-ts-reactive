import { afterEach, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { NativeVaultStore } from './native-vault-store.mjs';
import { ManagedPair, hash } from '../src/persistence/managed-pair.mjs';
import { decodeNative, nativeText } from '../src/persistence/native-resource';
import { exportMarkdown } from '../src/persistence/markdown';
const cleanup=[];afterEach(async()=>{for(const f of cleanup.splice(0).reverse())await f();});
execFileSync(process.execPath,['scripts/build-relocation-helper.mjs']);
async function fixture(options={}) {
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'flint-c1a-'));cleanup.push(()=>fs.rm(root,{recursive:true,force:true}));
 await fs.mkdir(path.join(root,'vault'));await fs.mkdir(path.join(root,'vault','notes'));await fs.mkdir(path.join(root,'vault','other'));
 const native=await fs.readFile('artifacts/flint-b1.2/rich.mutable.json','utf8'),r=decodeNative(new TextEncoder().encode(native)),projection=exportMarkdown(r);
 const generation={resourceId:r.resourceId,generation:crypto.randomUUID(),native,markdown:projection.text,profile:projection.profile,targets:[]};
 const pair=new ManagedPair({root:path.join(root,'vault/notes'),resourceId:r.resourceId,nativeName:'paper.mutable.json',markdownName:'paper.md'});
 expect((await pair.save(generation)).phase).toBe('saved');
 const store=new NativeVaultStore({root,...options});
 const request=async(kind='pair',source='vault/notes/paper.mutable.json',destination='vault/other/renamed.mutable.json')=>{
  const scan=await store.discover('vault');return {operationId:crypto.randomUUID(),vault:'vault',kind,source,destination,baselines:scan.documents.filter(d=>kind==='pair'?`${d.location.folder}/${d.location.filename}`===source:d.location.folder===source||d.location.folder.startsWith(source+'/')).map(d=>({resourceId:d.resourceId,baseline:d.baseline}))};
 };
 return {root,store,pair,generation,request,read:p=>fs.readFile(path.join(root,p),'utf8')};
}
it('discovers real nested/empty directories, confirmed pairs and standalone Markdown without admitting Documents',async()=>{
 const f=await fixture();await fs.mkdir(path.join(f.root,'vault/notes/empty'));await fs.writeFile(path.join(f.root,'vault/loose.md'),'**import**');
 const s=await new NativeVaultStore({root:f.root}).discover('vault');expect(s.complete).toBe(true);expect(s.folders).toContain('vault/notes/empty');expect(s.documents).toHaveLength(1);expect(s.documents[0].resourceId).toBe(f.generation.resourceId);expect(s.markdown).toEqual(['vault/loose.md']);expect(s.other).toEqual([]);
});
it('moves an enrolled pair without changing bytes, identity or save generation; saves at new binding',async()=>{
 const f=await fixture(),q=await f.request(),intentBytes=await f.read(`vault/notes/.mutable-pair-${hash(f.generation.resourceId)}/${f.generation.generation}/intent.json`);
 const result=await f.store.relocate(q);expect(result.phase).toBe('relocated');expect(result.bindings[0].baseline.generation).toBe(f.generation.generation);
 expect(await f.read(q.destination)).toBe(f.generation.native);expect(await f.read('vault/other/renamed.md')).toBe(f.generation.markdown);
 expect(await f.read(`vault/other/.mutable-pair-${hash(f.generation.resourceId)}/${f.generation.generation}/intent.json`)).toBe(intentBytes);
 expect(await f.store.recover(q.operationId)).toEqual(result);expect((await f.store.discover('vault')).documents[0].state).toBe('paired');
 const p=new ManagedPair({root:path.join(f.root,'vault/other'),resourceId:f.generation.resourceId,nativeName:'renamed.mutable.json',markdownName:'renamed.md'});
 expect((await p.recover()).generation).toBe(f.generation.generation);expect((await p.save({...f.generation,generation:crypto.randomUUID()},undefined,result.bindings[0].baseline)).phase).toBe('saved');
});
it('renames a pair in the same directory while retaining every historical generation',async()=>{
 const f=await fixture(),q=await f.request('pair','vault/notes/paper.mutable.json','vault/notes/new.mutable.json');expect((await f.store.relocate(q)).phase).toBe('relocated');expect(await f.read(q.destination)).toBe(f.generation.native);expect((await f.store.discover('vault')).documents[0].state).toBe('paired');
});
it('moves a nonempty directory itself including unrelated files, empty directories and pair archives',async()=>{
 const f=await fixture();await fs.mkdir(path.join(f.root,'vault/notes/empty'));await fs.writeFile(path.join(f.root,'vault/notes/photo.bin'),'opaque');
 const before=await fs.stat(path.join(f.root,'vault/notes')),q=await f.request('directory','vault/notes','vault/moved');expect((await f.store.relocate(q)).phase).toBe('relocated');
 expect((await fs.stat(path.join(f.root,'vault/moved'))).ino).toBe(before.ino);expect(await f.read('vault/moved/photo.bin')).toBe('opaque');expect((await f.store.discover('vault')).folders).toContain('vault/moved/empty');
});
it('creates real directories exclusively and never invents a membership file',async()=>{const f=await fixture();await f.store.mkdir('vault','vault/new');expect((await f.store.discover('vault')).folders).toContain('vault/new');await expect(f.store.mkdir('vault','vault/new')).rejects.toThrow('exists');});
it.each(['relocation-intent','relocation-after-0','relocation-after-1','relocation-after-2','relocation-receipt-displaced','relocation-receipt','relocation-before-complete','relocation-complete'])('recovers after %s without generating new content',async stage=>{
 const f=await fixture(),q=await f.request();f.store.fault=async s=>{if(s===stage)throw Error('interruption');};await f.store.relocate(q).catch(()=>{});
 const resumed=await new NativeVaultStore({root:f.root}).recover(q.operationId);expect(resumed.phase).toBe('relocated');expect(resumed.bindings[0].baseline.generation).toBe(f.generation.generation);expect(await f.read(q.destination)).toBe(f.generation.native);
});
it.each(['native','markdown','archive','directory','case'])('rejects %s collisions before journalling or changing source',async kind=>{
 const f=await fixture(),q=await f.request();const paths={native:q.destination,markdown:'vault/other/renamed.md',archive:`vault/other/.mutable-pair-${hash(f.generation.resourceId)}`,directory:q.destination,case:'vault/other/RENAMED.mutable.json'};
 if(kind==='archive'||kind==='directory')await fs.mkdir(path.join(f.root,paths[kind]));else await fs.writeFile(path.join(f.root,paths[kind]),'outside');
 await expect(f.store.relocate(q)).rejects.toThrow(/exists|archive/);expect(await f.read(q.source)).toBe(f.generation.native);expect(await f.store.records()).toEqual([]);
});
it('rejects ambiguous duplicate IDs and malformed files rather than choosing a source',async()=>{
 const f=await fixture(),q=await f.request();await fs.writeFile(path.join(f.root,'vault/duplicate.mutable.json'),f.generation.native);let s=await f.store.discover('vault');expect(s.complete).toBe(false);expect(s.documents.every(d=>d.state==='ambiguous')).toBe(true);await expect(f.store.relocate(q)).rejects.toThrow('ambiguous');
 await fs.writeFile(path.join(f.root,'vault/bad.mutable.json'),'bad');expect((await f.store.discover('vault')).diagnostics.some(d=>d.path?.includes('bad'))).toBe(true);
});
it('does not adopt externally moved same-ID resources or claim same-stem Markdown',async()=>{
 const f=await fixture();await fs.rename(path.join(f.root,'vault/notes/paper.mutable.json'),path.join(f.root,'vault/other/external.mutable.json'));await fs.writeFile(path.join(f.root,'vault/other/external.md'),'unrelated');
 const d=(await f.store.discover('vault')).documents[0];expect(d.resourceId).toBe(f.generation.resourceId);expect(d.state).toBe('unenrolled');await expect(f.store.relocate(await f.request('pair','vault/other/external.mutable.json','vault/other/next.mutable.json'))).rejects.toThrow('Unenrolled');expect(await f.read('vault/other/external.md')).toBe('unrelated');
});
it.each(['../escape','/tmp/escape','vault/../escape'])('rejects confinement escape %s',async destination=>{const f=await fixture();await expect(f.store.relocate({...await f.request(),destination})).rejects.toThrow();});
it('rejects symlink traversal, source symlinks and directory moves into themselves',async()=>{
 const f=await fixture(),q=await f.request();await fs.symlink('other',path.join(f.root,'vault/link'));expect((await f.store.discover('vault')).complete).toBe(false);await expect(f.store.mkdir('vault','vault/link/child')).rejects.toThrow('Symlink');await expect(f.store.relocate({...q,kind:'directory',source:'vault/notes',destination:'vault/notes/child'})).rejects.toThrow('Invalid');
});
it('read-only discovery remains available but all mutation/recovery actions fail',async()=>{const f=await fixture();const s=new NativeVaultStore({root:f.root,readOnly:true});expect((await s.discover('vault')).readOnly).toBe(true);await expect(s.relocate(await f.request())).rejects.toMatchObject({status:403});await expect(s.mkdir('vault','vault/new')).rejects.toMatchObject({status:403});await expect(s.recover('unknown')).rejects.toMatchObject({status:403});});
it('requires exact caller baselines and blocks partially published pairs',async()=>{const f=await fixture(),q=await f.request();q.baselines[0].baseline.nativeHash='0'.repeat(64);await expect(f.store.relocate(q)).rejects.toThrow('stale');f.pair.fault=async s=>{if(s==='before-receipt')throw Error('hold');};await f.pair.save({...f.generation,generation:crypto.randomUUID()},undefined,(await f.store.discover('vault')).documents[0].baseline);await expect(f.store.relocate(await f.request())).rejects.toThrow(/pending|stale/);});
it('fences stale locations and rename-away-and-back even with identical content hashes',async()=>{
 const f=await fixture(),first=await f.request(),old=first.baselines[0].baseline;await f.store.relocate(first);
 await expect(f.store.guard(f.generation.resourceId,{folder:'vault/notes',filename:'paper.mutable.json'},old)).rejects.toThrow('location changed');
 const second=await f.request('pair',first.destination,first.source);expect((await f.store.relocate(second)).phase).toBe('relocated');await expect(f.store.guard(f.generation.resourceId,{folder:'vault/notes',filename:'paper.mutable.json'},old)).rejects.toThrow('baseline is stale');
});
it.each(['relocation-after-0','relocation-before-complete'])('preserves late native writes through open handles at %s',async stage=>{
 const f=await fixture(),q=await f.request(),h=await fs.open(path.join(f.root,q.source),'r+');cleanup.push(()=>h.close());
 f.store.fault=async s=>{if(s===stage)await h.write('OUTSIDE',0,'utf8');};const r=await f.store.relocate(q);expect(r.phase).toBe('relocation-pending');expect(await f.read(q.destination)).toContain('OUTSIDE');expect((await new NativeVaultStore({root:f.root}).recover(q.operationId)).phase).toBe('relocation-pending');
});
it('does not overwrite an external file created in a destination between pair steps',async()=>{const f=await fixture(),q=await f.request();f.store.fault=async s=>{if(s==='relocation-after-0')await fs.writeFile(path.join(f.root,'vault/other/renamed.md'),'EXTERNAL',{flag:'wx'});};expect((await f.store.relocate(q)).phase).toBe('relocation-pending');expect(await f.read('vault/other/renamed.md')).toBe('EXTERNAL');expect(await f.read('vault/notes/paper.md')).toBe(f.generation.markdown);});
it('rejects modified retry parameters and reports missing native helper without an unsafe fallback',async()=>{const f=await fixture(),q=await f.request();f.store.helper='/missing/native-path-move';expect((await f.store.relocate(q)).phase).toBe('relocation-pending');expect(await f.read(q.source)).toBe(f.generation.native);await expect(f.store.relocate({...q,destination:'vault/other/different.mutable.json'})).rejects.toThrow('differs');});
it('native primitive refuses existing files, empty directories and source parent symlinks',async()=>{const f=await fixture();await fs.mkdir(path.join(f.root,'vault/empty'));await fs.mkdir(path.join(f.root,'vault/target'));await expect(f.store.move('vault/empty','vault/target')).rejects.toThrow('Exclusive');await fs.symlink('notes',path.join(f.root,'vault/link'));await expect(f.store.move('vault/link/paper.md','vault/new.md')).rejects.toThrow('Symlink');expect(await f.read('vault/notes/paper.md')).toBe(f.generation.markdown);});
it('preserves an externally replaced source inode caught after preflight',async()=>{
 const f=await fixture(),q=await f.request();f.store.fault=async s=>{if(s==='relocation-publish-0'){await fs.rename(path.join(f.root,q.source),path.join(f.root,'original-kept'));await fs.writeFile(path.join(f.root,q.source),'NEW INODE');}};
 expect((await f.store.relocate(q)).phase).toBe('relocation-pending');expect(await f.read(q.destination)).toBe('NEW INODE');expect(await f.read('original-kept')).toBe(f.generation.native);
});
it('native syscall refuses a destination introduced after JavaScript preflight',async()=>{
 const f=await fixture(),q=await f.request();f.store.fault=async s=>{if(s==='relocation-publish-0')await fs.writeFile(path.join(f.root,q.destination),'WINNER',{flag:'wx'});};expect((await f.store.relocate(q)).phase).toBe('relocation-pending');expect(await f.read(q.destination)).toBe('WINNER');expect(await f.read(q.source)).toBe(f.generation.native);
});
it('does not follow a destination parent replaced by a symlink after preflight',async()=>{
 const f=await fixture(),q=await f.request();await fs.mkdir(path.join(f.root,'outside'));f.store.fault=async s=>{if(s==='relocation-publish-0'){await fs.rename(path.join(f.root,'vault/other'),path.join(f.root,'parked'));await fs.symlink('../outside',path.join(f.root,'vault/other'));}};expect((await f.store.relocate(q)).phase).toBe('relocation-pending');expect(await fs.readdir(path.join(f.root,'outside'))).toEqual([]);expect(await f.read(q.source)).toBe(f.generation.native);
});
it('external source deletion leaves an explicit pending conflict and never invents replacement content',async()=>{const f=await fixture(),q=await f.request();f.store.fault=async s=>{if(s==='relocation-before-0')await fs.rename(path.join(f.root,q.source),path.join(f.root,'outside-kept'));};expect((await f.store.relocate(q)).phase).toBe('relocation-pending');expect(await fs.stat(path.join(f.root,q.destination)).catch(()=>null)).toBeNull();expect(await f.read('outside-kept')).toBe(f.generation.native);});
it('rejects case-only and Unicode-normalization aliases explicitly',async()=>{const f=await fixture();await expect(f.store.relocate(await f.request('pair','vault/notes/paper.mutable.json','vault/notes/PAPER.mutable.json'))).rejects.toThrow('Case-only');await fs.writeFile(path.join(f.root,'vault/other/é.md'),'outside');await expect(f.store.relocate(await f.request('pair','vault/notes/paper.mutable.json','vault/other/e\u0301.mutable.json'))).rejects.toThrow('alias');});
it('refuses a cross-device rename before touching either location',async()=>{
 const f=await fixture(),source=await fs.realpath(path.join(f.root,'vault/notes/paper.md'));expect((await fs.stat('/dev')).dev).not.toBe((await fs.stat(source)).dev);
 let error;try{execFileSync(f.store.helper,['/',source.slice(1),'dev/flint-c1a-never-created-'+crypto.randomUUID()],{stdio:'pipe'});}catch(e){error=e;}
 expect(error.stderr.toString()).toContain('cross filesystem');expect(await f.read('vault/notes/paper.md')).toBe(f.generation.markdown);
});
it('does not confirm a relocated owner whose required owned resource disappeared',async()=>{
 const f=await fixture();await fs.mkdir(path.join(f.root,'vault/owned'));
 const native=await fs.readFile('artifacts/flint-b1.2/a.mutable.json','utf8'),r=decodeNative(new TextEncoder().encode(native)),projection=exportMarkdown(r),b=path.join(f.root,'vault/b.mutable.json');await fs.copyFile('artifacts/flint-b1.2/b.mutable.json',b);
 const p=new ManagedPair({root:path.join(f.root,'vault/owned'),resourceId:r.resourceId,nativeName:'a.mutable.json',markdownName:'a.md',locations:new Map([['resource-b',b]])});expect((await p.save({resourceId:r.resourceId,generation:crypto.randomUUID(),native,markdown:projection.text,profile:projection.profile})).phase).toBe('saved');
 const q=await f.request('pair','vault/owned/a.mutable.json','vault/other/a.mutable.json');f.store.fault=async s=>{if(s==='relocation-before-complete')await fs.rename(b,path.join(f.root,'b-outside'));};const result=await f.store.relocate(q);expect(result.phase).toBe('relocation-pending');expect(result.error).toContain('Required owned resource unavailable');expect(await fs.stat(path.join(f.root,'vault/b.md')).catch(()=>null)).toBeNull();
});
it('moves an owner and owned resource as independent pairs without altering their generations or Markdown',async()=>{
 const f=await fixture();await fs.mkdir(path.join(f.root,'vault/owned'));const saved=[];
 for(const name of ['b','a']){const native=await fs.readFile(`artifacts/flint-b1.2/${name}.mutable.json`,'utf8'),r=decodeNative(new TextEncoder().encode(native)),projection=exportMarkdown(r),g={resourceId:r.resourceId,generation:crypto.randomUUID(),native,markdown:projection.text,profile:projection.profile};const pair=new ManagedPair({root:path.join(f.root,'vault/owned'),resourceId:r.resourceId,nativeName:name+'.mutable.json',markdownName:name+'.md',locations:new Map([['resource-b',path.join(f.root,'vault/owned/b.mutable.json')]])});expect((await pair.save(g)).phase).toBe('saved');saved.push({name,g});}
 const q=await f.request('directory','vault/owned','vault/relocated');const result=await f.store.relocate(q);expect(result.phase).toBe('relocated');expect(result.bindings).toHaveLength(2);
 for(const {name,g}of saved){expect(await f.read(`vault/relocated/${name}.mutable.json`)).toBe(g.native);expect(await f.read(`vault/relocated/${name}.md`)).toBe(g.markdown);expect(result.bindings.find(b=>b.resourceId===g.resourceId).baseline.generation).toBe(g.generation);}
});
it('discovery reports unavailable directories and oversized native files as incomplete',async()=>{
 const f=await fixture(),p=path.join(f.root,'vault/blocked');await fs.mkdir(p);await fs.chmod(p,0);try{expect((await f.store.discover('vault')).diagnostics.some(d=>d.path==='vault/blocked')).toBe(true);}finally{await fs.chmod(p,0o700);}
 const file=await fs.open(path.join(f.root,'vault/huge.mutable.json'),'w');await file.truncate(20*1024*1024+1);await file.close();expect((await f.store.discover('vault')).diagnostics.some(d=>d.path==='vault/huge.mutable.json')).toBe(true);
});
it('retains multiple immutable save generations through pair rename',async()=>{
 const f=await fixture(),next={...f.generation,generation:crypto.randomUUID()};expect((await f.pair.save(next,undefined,(await f.store.discover('vault')).documents[0].baseline)).phase).toBe('saved');
 const home=`.mutable-pair-${hash(f.generation.resourceId)}`,before=await Promise.all([f.generation,next].map(g=>f.read(`vault/notes/${home}/${g.generation}/intent.json`)));
 const q=await f.request();expect((await f.store.relocate(q)).phase).toBe('relocated');for(let n=0;n<2;n++)expect(await f.read(`vault/other/${home}/${[f.generation,next][n].generation}/intent.json`)).toBe(before[n]);
});
it('cancels a directory query without any storage or authored mutation',async()=>{const f=await fixture(),controller=new AbortController();controller.abort();await expect(f.store.discover('vault',{signal:controller.signal})).rejects.toMatchObject({name:'AbortError'});expect(await f.store.records()).toEqual([]);expect(await f.read('vault/notes/paper.mutable.json')).toBe(f.generation.native);});
it('never substitutes fresh filesystem signatures for the caller reviewed content hashes',async()=>{
 const f=await fixture(),q=await f.request(),changed=structuredClone(decodeNative(new TextEncoder().encode(f.generation.native)));const root=changed.contents[changed.placements[changed.rootPlacementKey].target.contentKey];root.payload.metadata={...root.payload.metadata,title:'External change after discovery'};const outside=nativeText(changed);
 f.store.fault=async stage=>{if(stage==='relocation-captured')await fs.writeFile(path.join(f.root,q.source),outside);};await expect(f.store.relocate(q)).rejects.toThrow('reviewed relocation baseline');expect(await f.read(q.source)).toBe(outside);expect(await fs.stat(path.join(f.root,q.destination)).catch(()=>null)).toBeNull();expect(await f.store.records()).toEqual([]);
});
