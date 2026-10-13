import { afterEach, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { NativeVaultStore } from './native-vault-store.mjs';
import { VaultListingCache } from './vault-listing-cache.mjs';
import { decodeDocument } from '../src/block-tree/codecs';
import { captureNative, nativeText, decodeNative } from '../src/persistence/native-resource';
import { hash } from '../src/persistence/managed-pair.mjs';
const cleanup=[];afterEach(async()=>{for(const root of cleanup.splice(0))await fs.rm(root,{recursive:true,force:true});});
const document=(id,title=id)=>nativeText(captureNative(decodeDocument({id,type:'document-block',metadata:{title},children:[{id:id+'-text',type:'standoff-editor-block',text:'A small document.'}]}).state,id));
async function fixture() {
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'vault-listing-'));cleanup.push(root);
 await fs.mkdir(path.join(root,'.mutable'));await fs.mkdir(path.join(root,'notes'));
 const inspect=vi.fn(async bytes=>{const r=decodeNative(bytes);return {byteHash:hash(bytes),inspection:{resourceId:r.resourceId,rootBlockId:r.resourceId,title:r.contents[r.placements[r.rootPlacementKey].target.contentKey].payload.metadata.title}};});
 const store=new NativeVaultStore({root,inspect}),cache=new VaultListingCache(store);
 const write=(p,text)=>fs.writeFile(path.join(root,p),text);
 await write('notes/a.ink',document('a'));await write('notes/b.ink',document('b'));
 return {root,store,cache,inspect,write,file:path.join(root,'.mutable/discovery-cache.json')};
}
it('persists a listing across server instances; warm startup reads only the cache',async()=>{
 const f=await fixture(),cold=await f.cache.browse('.');expect(cold.complete).toBe(true);expect(cold.cached).toBe(false);expect(f.inspect).toHaveBeenCalledTimes(2);
 const store=new NativeVaultStore({root:f.root,inspect:f.inspect}),read=vi.spyOn(store,'read');
 const warm=await new VaultListingCache(store).browse('.');expect(warm.cached).toBe(true);expect(warm.documents).toEqual(cold.documents);expect(warm.documents.every(d=>!d.baseline)).toBe(true);expect(f.inspect).toHaveBeenCalledTimes(2);
 expect(read.mock.calls.map(([p])=>p)).toEqual(['.mutable/discovery-cache.json']);
});
it('unchanged reconciliation reads no native bodies; timestamp-only changes reuse checksum inspection',async()=>{
 const f=await fixture();await f.cache.browse('.');const read=vi.spyOn(f.store,'read');
 await f.cache.browse('.',{mode:'reconcile'});expect(read.mock.calls.filter(([p])=>p.endsWith('.ink'))).toEqual([]);expect(f.inspect).toHaveBeenCalledTimes(2);
 await fs.utimes(path.join(f.root,'notes/a.ink'),new Date(),new Date(Date.now()+10000));
 await f.cache.browse('.',{mode:'reconcile'});expect(f.inspect).toHaveBeenCalledTimes(2);expect(read.mock.calls.some(([p])=>p==='notes/a.ink')).toBe(true);
});
it('detects added, changed, renamed and deleted files without inspecting unchanged documents',async()=>{
 const f=await fixture();await f.cache.browse('.');
 await f.write('notes/a.ink',document('a','New title'));await fs.unlink(path.join(f.root,'notes/b.ink'));await fs.mkdir(path.join(f.root,'empty'));await f.write('notes/c.ink',document('c'));
 const s=await f.cache.browse('.',{mode:'reconcile'});expect(s.complete).toBe(true);expect(s.documents.map(d=>d.title)).toEqual(['New title','c']);expect(s.folders).toContain('empty');expect(f.inspect).toHaveBeenCalledTimes(4);
 await fs.rename(path.join(f.root,'notes/a.ink'),path.join(f.root,'empty/a.ink'));const renamed=await f.cache.browse('.',{mode:'reconcile'});expect(renamed.documents.find(d=>d.resourceId==='a').location.folder).toBe('empty');expect(renamed.documents).toHaveLength(2);expect(f.inspect).toHaveBeenCalledTimes(4);
});
it('detects same-size rewrites even if modification time is restored',async()=>{
 const f=await fixture();await f.cache.browse('.');const file=path.join(f.root,'notes/a.ink'),before=await fs.stat(file);
 await f.write('notes/a.ink',document('a','z'));await fs.utimes(file,before.atime,before.mtime);
 const s=await f.cache.browse('.',{mode:'reconcile'});expect(s.documents.find(d=>d.resourceId==='a').title).toBe('z');expect(f.inspect).toHaveBeenCalledTimes(3);
});
it('full verification reads every native file while reusing matching inspected checksums',async()=>{
 const f=await fixture();await f.cache.browse('.');const read=vi.spyOn(f.store,'read');await f.cache.browse('.',{mode:'verify'});
 for(const p of ['notes/a.ink','notes/b.ink'])expect(read.mock.calls.some(([file])=>file===p)).toBe(true);expect(f.inspect).toHaveBeenCalledTimes(2);
});
it('corrupt, obsolete and relocated cache files rebuild safely',async()=>{
 const f=await fixture();await f.cache.browse('.');const original=JSON.parse(await fs.readFile(f.file,'utf8'));
 for(const value of ['bad JSON',JSON.stringify({...original,version:999}),JSON.stringify({...original,identity:'another-vault'})]){await fs.writeFile(f.file,value);expect((await f.cache.browse('.')).cached).toBe(false);}
 expect(f.inspect).toHaveBeenCalledTimes(8);
});
it('reports duplicates and does not publish them as a successful persistent listing',async()=>{
 const f=await fixture();await f.cache.browse('.');const prior=await fs.readFile(f.file,'utf8');await fs.copyFile(path.join(f.root,'notes/a.ink'),path.join(f.root,'duplicate.ink'));
 const s=await f.cache.browse('.',{mode:'reconcile'});expect(s.complete).toBe(false);expect(s.documents.filter(d=>d.resourceId==='a').every(d=>d.state==='ambiguous')).toBe(true);expect(await fs.readFile(f.file,'utf8')).toBe(prior);
});
it('failed inspection retains the previous displayed row and preserves the last complete disk cache',async()=>{
 const f=await fixture();await f.cache.browse('.');const prior=await fs.readFile(f.file,'utf8');await f.write('notes/a.ink','broken document');
 const s=await f.cache.browse('.',{mode:'reconcile'});expect(s.complete).toBe(false);expect(s.documents.find(d=>d.resourceId==='a').state).toBe('unavailable');expect(await fs.readFile(f.file,'utf8')).toBe(prior);
});
it('read-only mode never writes a cache and follows current read-only policy on cached reads',async()=>{
 const f=await fixture();await f.cache.browse('.');const prior=await fs.readFile(f.file,'utf8');const store=new NativeVaultStore({root:f.root,readOnly:true,inspect:f.inspect}),cache=new VaultListingCache(store);
 expect((await cache.browse('.')).readOnly).toBe(true);await f.write('notes/c.ink',document('c'));expect((await cache.browse('.',{mode:'reconcile'})).documents).toHaveLength(3);expect(await fs.readFile(f.file,'utf8')).toBe(prior);
});
it('cancels reconciliation without replacing the cache, including cancellation during inspection',async()=>{
 const f=await fixture();await f.cache.browse('.');const prior=await fs.readFile(f.file,'utf8');await f.write('notes/c.ink',document('c'));const c=new AbortController();f.inspect.mockImplementationOnce(async()=>{c.abort();throw c.signal.reason;});
 await expect(f.cache.browse('.',{mode:'reconcile',signal:c.signal})).rejects.toMatchObject({name:'AbortError'});expect(await fs.readFile(f.file,'utf8')).toBe(prior);
});
it('does not follow symlinks or accept escaping paths',async()=>{
 const f=await fixture();await fs.symlink(path.join(f.root,'notes/a.ink'),path.join(f.root,'linked.ink'));expect((await f.cache.browse('.')).complete).toBe(false);
 await expect(f.cache.browse('../elsewhere')).rejects.toThrow('Invalid');await fs.rm(path.join(f.root,'.mutable'),{recursive:true});const external=await fs.mkdtemp(path.join(os.tmpdir(),'listing-outside-'));cleanup.push(external);await fs.symlink(external,path.join(f.root,'.mutable'));await fs.unlink(path.join(f.root,'linked.ink'));expect((await f.cache.browse('.')).documents).toHaveLength(2);expect(await fs.readdir(external)).toEqual([]);
});
it('rechecks files after inspection and never caches a mixed generation',async()=>{
 const f=await fixture(),original=f.inspect.getMockImplementation();f.inspect.mockImplementation(async bytes=>{const result=await original(bytes);if(result.inspection.resourceId==='b')await f.write('notes/a.ink',document('a','changed concurrently'));return result;});
 const s=await f.cache.browse('.');expect(s.complete).toBe(false);expect(s.diagnostics.some(d=>d.message.includes('changed before discovery'))).toBe(true);await expect(fs.stat(f.file)).rejects.toMatchObject({code:'ENOENT'});
});

it('tracks pair metadata changes without re-inspecting unchanged native content',async()=>{
 const f=await fixture();await f.cache.browse('.');const home=path.join(f.root,'notes',`.mutable-pair-${hash('a')}`);await fs.mkdir(home);
 // Receipt content may change independently of the native document.
 await fs.writeFile(path.join(home,'receipt.json'),'{"invalid":true}');const result=await f.cache.browse('.',{mode:'reconcile'});
 expect(result.complete).toBe(false);expect(result.diagnostics.some(d=>d.path==='notes/a.ink')).toBe(true);expect(f.inspect).toHaveBeenCalledTimes(2);
});
it('server flag rolls back to verified discovery and Open ignores cached file contents',async()=>{
 const {default:express}=await import('express');const {createNativeDocumentStoreRouter}=await import('./native-document-store.mjs');const f=await fixture();
 async function requestWith(flag,run){const app=express();app.use('/native',createNativeDocumentStoreRouter({root:f.root,nativeDiscoveryWorker:false,vaultDiscoveryCache:flag}));const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});try{await run(async(action,body)=>{const response=await fetch(`http://127.0.0.1:${server.address().port}/native/${action}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:response.status,...await response.json()};});}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}}
 await requestWith(false,async call=>{const result=await call('vault/browse',{vault:'.'});expect(result.Data.cached).toBeUndefined();expect(result.Data.documents[0].baseline).toBeTruthy();await expect(fs.stat(f.file)).rejects.toMatchObject({code:'ENOENT'});});
 await requestWith(true,async call=>{await call('vault/browse',{vault:'.'});await f.write('notes/a.ink',document('a','Changed since cache'));expect((await call('vault/browse',{vault:'.'})).Data.documents[0].title).toBe('a');const opened=await call('open',{location:{folder:'notes',filename:'a.ink'}});expect(opened.Success).toBe(true);expect(opened.Data.native).toContain('Changed since cache');await fs.unlink(path.join(f.root,'notes/a.ink'));expect((await call('open',{location:{folder:'notes',filename:'a.ink'}})).status).toBe(404);});
});
