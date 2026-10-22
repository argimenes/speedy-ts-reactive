import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';import {randomUUID as uuid} from 'node:crypto';
import {openSqliteFoundation} from './client.mjs';
test('reviewed identity import, aliases, cross-session reconciliation, conflicts and receipts use existing tables',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'autocomplete-authority-')),vault=path.join(dir,'vault');let c;
 try {
  await mkdir(vault);c=await openSqliteFoundation({vault,initialize:true});
  const record={provider:'wikidata',id:'Q762',name:'Leonardo da Vinci',description:'Italian polymath',aliases:['Leonardo','Leonardo'],url:'https://www.wikidata.org/wiki/Q762',retrievedAt:'2026-10-22T00:00:00Z',revision:123};
  const request={op:'authority-import',id:uuid(),operationId:uuid(),record};
  const first=await c.entities(request);assert.equal(first.entity.name,record.name);assert.equal(first.entity.aliases.length,1);
  assert.equal((await c.entities(request)).entity.id,first.entity.id);
  assert.equal((await c.entities({...request,id:uuid(),operationId:uuid()})).entity.id,first.entity.id);
  const local=await c.entities({op:'create',id:uuid(),operationId:uuid(),name:'Local curated name'});
  await assert.rejects(c.entities({...request,id:uuid(),operationId:uuid(),targetId:local.entity.id,expected:0}),/another Entity/);
  const other={...record,id:'Q123',url:'https://www.wikidata.org/wiki/Q123'};
  const linked=await c.entities({...request,id:uuid(),operationId:uuid(),record:other,targetId:local.entity.id,expected:0});
  assert.equal(linked.entity.id,local.entity.id);assert.equal(linked.entity.name,'Local curated name');assert.equal(linked.entity.aliases.length,0);
  const third={...record,id:'Q124',url:'https://www.wikidata.org/wiki/Q124'};
  assert.equal((await c.entities({...request,id:uuid(),operationId:uuid(),record:third,targetId:local.entity.id,expected:0})).entity.id,local.entity.id);
  await assert.rejects(c.entities({...request,id:uuid(),operationId:uuid(),record:{...record,provider:'gnd',id:'118640445'}}),/namespace/);
  await c.close();c=await openSqliteFoundation({vault,readOnly:true,entityReader:true});
  assert.equal((await c.entityLookup({op:'authority-lookup',record})).entity.id,first.entity.id);
  assert.equal((await c.entityLookup({op:'authority-lookup',record:third})).entity.id,local.entity.id);
 } finally {await c?.close();await rm(dir,{recursive:true,force:true});}
});
