import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import Database from 'better-sqlite3';
import {openSqliteFoundation} from './client.mjs';
import {createSavedIndexer,NativeVaultStore,ManagedPair} from '../../dist/server/sqlite-saved-indexer.js';
import {hash} from './schema.mjs';

const document=(id='r',text='Raven words')=>({id:`${id}-root`,type:'main-list-block',metadata:{documentId:id,title:'Title',tags:['tag']},children:[{id:`${id}-text`,type:'standoff-editor-block',text}]});
async function fixture(t){
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'sqlite-p2-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const client=await openSqliteFoundation({vault:root,initialize:true});t.after(()=>client.close());
 const store=new NativeVaultStore({root});const write=(name,value)=>fs.writeFile(path.join(root,name),typeof value==='string'?value:JSON.stringify(value));
 const index=options=>createSavedIndexer(client,{root,store,...options});return {root,client,store,write,index};
}
const body=p=>({blocks:p.blocks,tags:p.tags,resource:{...p.resource,indexedUtc:null,indexStatus:null}});

test('authoritative legacy reconcile, changed-one-Block diff, external edit, identity-preserving move and restart',async t=>{
 const f=await fixture(t);await f.write('a.json',document());const before=await fs.readFile(path.join(f.root,'a.json'));
 const first=await f.index().refresh({mode:'full'});assert.equal(first.complete,true,JSON.stringify(first));assert.equal(first.reconciled[0].changedBlocks,2);
 assert.deepEqual(await fs.readFile(path.join(f.root,'a.json')),before);assert.equal((await f.index().refresh()).reconciled[0].changedBlocks,0);
 await f.write('a.json',document('r','External changed words'));const diff=await f.index().refresh();assert.equal(diff.reconciled[0].changedBlocks,1);
 const incremental=await f.client.resourceProjection('r');await f.index().refresh({mode:'full'});assert.deepEqual(body(await f.client.resourceProjection('r')),body(incremental));
 const replacement=document();replacement.children=[{id:'new-block',type:'text-block',text:'Replacement'}];await f.write('a.json',replacement);
 const structural=await f.index().refresh();assert.equal(structural.reconciled[0].removedBlocks,1);assert.equal(structural.reconciled[0].changedBlocks,2);
 const replaced=await f.client.resourceProjection('r');await f.index().refresh({mode:'full'});assert.deepEqual(body(await f.client.resourceProjection('r')),body(replaced));
 await fs.rename(path.join(f.root,'a.json'),path.join(f.root,'renamed.json'));assert.equal((await f.index().refresh()).complete,true);assert.equal((await f.client.inventory())[0].path,'renamed.json');
 await f.client.close();const reopened=await openSqliteFoundation({vault:f.root});try{assert.equal((await reopened.inventory())[0].guid,'r');assert.equal((await reopened.verify()).mutable.fts,'ok');}finally{await reopened.close();}
});

test('confirmed deletion removes only derived source rows; canonical knowledge and other incoming assertions survive',async t=>{
 const f=await fixture(t);await f.write('a.json',document());const other=document('other');other.children[0].standoffProperties=[{id:'reference',type:'codex/block-reference',value:'r-root',metadata:{documentId:'r'},start:0,end:4}];await f.write('b.json',other);
 assert.equal((await f.index().refresh()).complete,true);
 const db=new Database(path.join(f.root,'.mutable/mutable.db'));try{db.exec("INSERT INTO Entity(guid,name,nameKey) VALUES('entity','Poe','poe'),('other','Other','other'); INSERT INTO EntityAlias(guid,entityGuid,alias,aliasKey,origin) VALUES('alias','entity','Edgar','edgar','curated'); INSERT INTO Relationship(guid,sourceEntityGuid,typename,targetEntityGuid) VALUES('rel','entity','knows','other')");}finally{db.close();}
 await fs.unlink(path.join(f.root,'a.json'));const result=await f.index().refresh();assert.deepEqual(result.removed,['r']);assert.equal(await f.client.resourceProjection('r'),null);
 assert.equal((await f.client.resourceProjection('other')).blocks.flatMap(b=>b.segments)[0].targetResourceGuid,'r');const info=await f.client.inspect();assert.equal(info.mutable.counts.Entity,2);assert.equal(info.mutable.counts.EntityAlias,1);assert.equal(info.mutable.counts.Relationship,1);
});

for(const fault of ['malformed','duplicate','duplicate-block','symlink','inspection-failure'])test(`${fault} discovery is incomplete, never deletion authority`,async t=>{
 const f=await fixture(t);await f.write('a.json',document());assert.equal((await f.index().refresh()).complete,true);
 await fs.unlink(path.join(f.root,'a.json'));
 if(fault==='malformed')await f.write('bad.json','{broken');
 if(fault==='duplicate'){await f.write('b.json',document());await f.write('c.json',document());}
 if(fault==='duplicate-block'){await f.write('b.json',document('b'));const c=document('c');c.children[0].id='b-text';await f.write('c.json',c);}
 if(fault==='symlink')await fs.symlink('/outside-unknown',path.join(f.root,'bad.json'));
 if(fault==='inspection-failure'){await f.write('b.json',document('b'));f.client.inspectSaved=async()=>{throw Error('worker inspection unavailable');};}
 const result=await f.index().refresh();assert.equal(result.complete,false);assert.deepEqual(result.removed,[]);assert.ok(await f.client.resourceProjection('r'));
});

for(const change of ['edit','new-duplicate','cancel'])test(`${change} between staging and commit cannot publish stale or partial rows`,async t=>{
 const f=await fixture(t);await f.write('a.json',document());await f.index().refresh();const before=await f.client.resourceProjection('r');await f.write('a.json',document('r','Next saved text'));
 const controller=new AbortController();const index=f.index({checkpoint:async phase=>{if(phase!=='staged')return;if(change==='edit')await f.write('a.json',document('r','A later edit'));if(change==='new-duplicate')await f.write('duplicate.json',document());if(change==='cancel')controller.abort();}});
 if(change==='cancel')await assert.rejects(index.refresh({signal:controller.signal}));else assert.equal((await index.refresh()).complete,false);
 assert.deepEqual(body(await f.client.resourceProjection('r')),body(before));
});

test('file reappearance during confirmed deletion prevents removal',async t=>{
 const f=await fixture(t);await f.write('a.json',document());await f.index().refresh();await fs.unlink(path.join(f.root,'a.json'));
 const result=await f.index({checkpoint:async phase=>{if(phase==='deleting')await f.write('a.json',document());}}).refresh();assert.equal(result.complete,false);assert.ok(await f.client.resourceProjection('r'));
});

test('worker stage tokens expire on supersession and do not replay across a changed SQL baseline',async t=>{
 const f=await fixture(t),vaultGuid=(await f.client.inspect()).mutable.vaultGuid;
 const payload={bytes:Buffer.from(JSON.stringify(document())),vaultGuid,evidence:{path:'a.json',contentHash:hash(JSON.stringify(document()))},mode:'full'};
 await assert.rejects(f.client.stageSaved({...payload,vaultGuid:randomUUID()}),/vault identity/);
 await assert.rejects(f.client.stageSaved({...payload,bytes:new Uint8Array(20*1024*1024+1)}),/byte budget/);
 const one=await f.client.stageSaved(payload),two=await f.client.stageSaved(payload);await assert.rejects(f.client.commitSaved(one.token),/Expired/);await f.client.commitSaved(two.token);
 const three=await f.client.stageSaved(payload);await f.client.indexIssue('a.json','changed evidence');await assert.rejects(f.client.commitSaved(three.token),/Stale SQL/);
});

test('rebuild CLI uses authoritative files and clears old issues only after successful reconciliation',async t=>{
 const f=await fixture(t);await f.write('a.json',document());await f.write('invalid.json','broken');assert.equal((await f.index().refresh()).complete,false);
 await fs.unlink(path.join(f.root,'invalid.json'));assert.equal((await f.index().refresh()).complete,true);assert.equal((await f.client.inspect()).mutable.counts.IndexIssue,0);
 const file=await fs.readFile(path.join(f.root,'a.json'));await f.client.close();
 const rebuilt=spawnSync(process.execPath,['scripts/sqlite-foundation.mjs','rebuild-derived','--vault',f.root],{encoding:'utf8'});assert.equal(rebuilt.status,0,rebuilt.stderr);assert.equal(JSON.parse(rebuilt.stdout).complete,true);assert.deepEqual(await fs.readFile(path.join(f.root,'a.json')),file);
});

test('read-only mode rejects indexing and preserves database bytes',async t=>{
 const f=await fixture(t);await f.write('a.json',document());await f.client.close();const file=path.join(f.root,'.mutable/mutable.db'),before=hash(await fs.readFile(file));
 const readonly=await openSqliteFoundation({vault:f.root,readOnly:true});try{await assert.rejects(createSavedIndexer(readonly,{root:f.root,store:f.store}).refresh(),/read-only/);}finally{await readonly.close();}
 assert.equal(hash(await fs.readFile(file)),before);
});

async function pair(f){
 await fs.mkdir(path.join(f.root,'notes'));await fs.mkdir(path.join(f.root,'other'));
 const native=await fs.readFile('artifacts/flint-b1.2/rich.mutable.json','utf8'),resourceId=JSON.parse(native).resourceId;
 const generation={resourceId,generation:randomUUID(),native,markdown:'# A paired projection',profile:'p2-test',targets:[]};
 const pair=new ManagedPair({root:path.join(f.root,'notes'),resourceId,nativeName:'paper.mutable.json',markdownName:'paper.md'});assert.equal((await pair.save(generation)).phase,'saved');return {pair,generation,resourceId};
}
test('managed native pair relocation changes only SQL location; native, Markdown and receipt generations stay unchanged',async t=>{
 const f=await fixture(t),p=await pair(f);const initial=await f.index().refresh();assert.equal(initial.complete,true,JSON.stringify(initial));
 const before=await f.client.resourceProjection(p.resourceId),scan=await f.store.discover('.');
 const moved=await f.store.relocate({operationId:randomUUID(),vault:'.',kind:'pair',source:'notes/paper.mutable.json',destination:'other/renamed.mutable.json',baselines:scan.documents.map(d=>({resourceId:d.resourceId,baseline:d.baseline}))});assert.equal(moved.phase,'relocated');
 const result=await f.index().refresh();assert.equal(result.complete,true,JSON.stringify(result));assert.equal(result.reconciled[0].changedBlocks,0);const after=await f.client.resourceProjection(p.resourceId);assert.deepEqual(after.blocks,before.blocks);assert.equal(after.resource.path,'other/renamed.mutable.json');assert.equal(after.resource.saveGeneration,p.generation.generation);
 assert.equal(await fs.readFile(path.join(f.root,'other/renamed.mutable.json'),'utf8'),p.generation.native);assert.equal(await fs.readFile(path.join(f.root,'other/renamed.md'),'utf8'),p.generation.markdown);
});

test('external native move is not silently rebound; pair pending is not index publication evidence',async t=>{
 const f=await fixture(t),p=await pair(f);assert.equal((await f.index().refresh()).complete,true);
 await fs.rename(path.join(f.root,'notes/paper.mutable.json'),path.join(f.root,'other/external.mutable.json'));
 const result=await f.index().refresh();assert.equal(result.complete,false);assert.equal((await f.client.resourceProjection(p.resourceId)).resource.path,'notes/paper.mutable.json');
});

test('pending native/Markdown publication preserves the previous projection until recovery',async t=>{
 const f=await fixture(t),p=await pair(f);await f.index().refresh();const before=await f.client.resourceProjection(p.resourceId);
 // Leave a durable pending pair with the existing qualified interruption seam.
 p.pair.fault=async stage=>{if(stage==='after-native')throw Error('interrupted');};
 const wire=JSON.parse(p.generation.native);const root=wire.document.blocks.find(b=>b.id===wire.document.root.target.blockId);root.properties.metadata={...root.properties.metadata,title:'Next title'};
 const next={...p.generation,generation:randomUUID(),native:JSON.stringify(wire),markdown:'# next'};await p.pair.save(next).catch(()=>{});
 const pending=await p.pair.pending();assert.ok(pending,'fault must leave a durable pending publication');
 assert.equal((await f.index().refresh()).complete,false);assert.deepEqual(body(await f.client.resourceProjection(p.resourceId)),body(before));
 p.pair.fault=async()=>{};await p.pair.recover();assert.equal((await f.index().refresh()).complete,true);
});
