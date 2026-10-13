import {afterEach,expect,it,vi} from 'vitest';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import Database from 'better-sqlite3';
import {SqliteKnowledgeHost} from './sqlite-knowledge-host';
import {openSqliteFoundation} from '../dist/server/knowledge-sqlite/client.mjs';

const cleanup:Array<()=>any>=[];
afterEach(async()=>{for(const f of cleanup.splice(0).reverse())await f();vi.restoreAllMocks();});
async function fixture(){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'entity-lookup-')),vault=path.join(root,'vault');
 cleanup.push(()=>fs.rm(root,{recursive:true,force:true}));await fs.mkdir(vault);
 const writer=await openSqliteFoundation({vault,initialize:true});cleanup.push(()=>writer.close());
 const id=randomUUID();await writer.entities({op:'create',id,operationId:randomUUID(),name:'Rome'});
 const open=vi.fn(()=>{throw Error('Lookup must not open the indexing/writer worker');});
 const host=new SqliteKnowledgeHost({root,open,debounceMs:60000});cleanup.push(()=>host.close());
 const lookup=(query='Rome',extra:any={})=>host.entityLookup({vault:'vault',request:{op:'search',query,stream:'name',match:'partial',...extra}});
 return {root,vault,writer,id,host,lookup,open};
}
it('reads and caches names without opening the writer, scanning files, or requiring any source Document',async()=>{
 const f=await fixture();
 for(const method of ['discover','readScopeFence','read'])vi.spyOn(f.host.store,method).mockImplementation(()=>{throw Error('No Document processing permitted');});
 const first=await f.lookup();expect(first).toMatchObject({cached:false,complete:true,matches:[{id:f.id,name:'Rome'}]});
 expect(await f.lookup('ROME')).toMatchObject({cached:true,matches:first.matches});
 expect(await f.lookup('Rome',{refresh:true})).toMatchObject({cached:false});
 expect(f.open).not.toHaveBeenCalled();expect(f.host.metrics.sweeps).toBe(0);
 expect((await f.host.entityLookup({vault:'vault',request:{op:'get',id:f.id}})).entity.name).toBe('Rome');
});
it('invalidates cached names and aliases on commits from another SQLite connection',async()=>{
 const f=await fixture();await f.lookup();expect((await f.lookup()).cached).toBe(true);
 await f.writer.entities({op:'rename',id:f.id,name:'Roma',expected:0,operationId:randomUUID()});
 expect(await f.lookup()).toMatchObject({cached:false,matches:[]});
 expect((await f.lookup('Roma')).matches[0].name).toBe('Roma');
 await f.lookup('Rome',{stream:'alias'});
 await f.writer.entities({op:'alias-add',id:randomUUID(),entityId:f.id,name:'Rome',operationId:randomUUID()});
 expect(await f.lookup('Rome',{stream:'alias'})).toMatchObject({cached:false,matches:[{id:f.id,kind:'alias'}]});
});
it('reads the committed snapshot while a writer transaction remains open',async()=>{
 const f=await fixture(),db=new Database(path.join(f.vault,'.mutable/mutable.db'));
 try{
  db.exec('BEGIN IMMEDIATE');db.prepare('UPDATE Entity SET name=?,nameKey=? WHERE guid=?').run('Uncommitted','uncommitted',f.id);
  // A read queued behind the writer could not finish until rollback. WAL readers can.
  expect((await f.lookup()).matches[0].name).toBe('Rome');
 }finally{db.exec('ROLLBACK');db.close();}
});
it('bounds the cache and preserves exact matching, literal wildcard characters and Vault isolation',async()=>{
 const f=await fixture();
 expect((await f.lookup('Rom',{match:'exact'})).matches).toEqual([]);
 expect((await f.lookup('%')).matches).toEqual([]);expect((await f.lookup('_')).matches).toEqual([]);
 await f.lookup();for(let i=0;i<129;i++)await f.lookup('absent-'+i);
 expect((await f.lookup()).cached).toBe(false);
 await expect(f.host.entityLookup({vault:'../outside',request:{op:'search'}})).rejects.toThrow();
 await fs.mkdir(path.join(f.root,'empty'));
 await expect(f.host.entityLookup({vault:'empty',request:{op:'search',query:'Rome',stream:'name',match:'partial'}})).rejects.toThrow();
 await expect(fs.stat(path.join(f.root,'empty/.mutable'))).rejects.toThrow();
 await expect(f.host.entityLookup({vault:'vault',request:{op:'create',name:'No write'}})).rejects.toThrow();
 const disabled=new SqliteKnowledgeHost({root:f.root,entitiesEnabled:false});
 try{await expect(disabled.entityLookup({vault:'vault',request:{op:'get',id:f.id}})).rejects.toThrow(/unavailable/);}finally{await disabled.close();}
});
