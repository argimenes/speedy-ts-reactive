import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {migrate} from './schema.mjs';
import {extractPackageData,sqlValue} from './package-data.mjs';
const fixture=()=>{const db=new Database(':memory:');migrate(db,'mutable',{fresh:true});db.exec(`
 INSERT INTO Entity(id,guid,name,nameKey,attributes,createdByActorGuid) VALUES(9007199254740993,'a','Abbey','abbey',' { "nested": [1,null,{"original":"yes"}] } ','private-actor');
 INSERT INTO Entity(guid,name,nameKey) VALUES('b','Rome','rome'),('c','Concept','concept'),('private','Private unrelated','private');
 INSERT INTO EntityAlias(guid,entityGuid,alias,aliasKey,origin) VALUES('alias','a','House','house','curated'),('observed','a','secret phrase','secret phrase','observed');
 INSERT INTO Relationship(guid,sourceEntityGuid,typename,targetEntityGuid) VALUES('r','a','in','b'),('private-r','b','near','private');
 INSERT INTO Claim(guid,expression,typename) VALUES('claim','A trait claim','Trait'),('private-claim','Private','Other');
 INSERT INTO ClaimParticipant(guid,claimGuid,entityGuid,role,ordinal) VALUES('cp1','claim','a','Subject',0),('cp2','claim','c','Value',1),('private-cp','private-claim','b','Subject',0);
 INSERT INTO ClaimQualifier(guid,claimGuid,entityGuid,role,ordinal) VALUES('cq','claim','b','Place',0);
 INSERT INTO ClaimEvidence(guid,claimGuid,resourceGuid,blockGuid,sourceContentHash,startIndex,endIndex,coordinate,evidenceKind,excerpt) VALUES('evidence','claim','old-doc','old-block','old-hash',0,2,'cell','quotation','private excerpt');
 `);return db;};
const values=t=>t.rows.map(r=>Object.fromEntries(t.columns.map((c,i)=>[c,r[i]])));
test('bounded one-hop slice preserves raw storage, excludes private graph expansion and defaults',()=>{const db=fixture();try{
 const before=db.prepare('SELECT total_changes() AS n').get().n;
 const basic=extractPackageData(db,{entities:['a','missing']});
 assert.equal(basic.data.tables.find(t=>t.name==='Entity').rows.length,1);assert.equal(basic.data.tables.find(t=>t.name==='Claim').rows.length,0);assert.equal(basic.data.tables.find(t=>t.name==='EntityAlias').rows.length,1);
 assert.ok(basic.data.unresolved.some(v=>v.value==='missing'));assert.ok(basic.data.excluded.some(v=>v.value==='private-actor'));
 const full=extractPackageData(db,{entities:['a'],relationships:true,claims:true,evidence:true});
 assert.deepEqual(values(full.data.tables.find(t=>t.name==='Entity')).map(r=>r.guid[1]).sort(),['a','b','c']);
 assert.equal(full.data.tables.find(t=>t.name==='Relationship').rows.length,1);assert.equal(full.data.tables.find(t=>t.name==='Claim').rows.length,1);
 const a=values(full.data.tables.find(t=>t.name==='Entity')).find(r=>r.guid[1]==='a');assert.deepEqual(a.id,['integer','9007199254740993']);assert.equal(a.attributes[1],' { "nested": [1,null,{"original":"yes"}] } ');
 assert.equal(db.prepare('SELECT total_changes() AS n').get().n,before);
 for(const [table,column]of [['Entity','guid'],['EntityAlias','entityGuid'],['Relationship','sourceEntityGuid'],['Relationship','targetEntityGuid'],['ClaimParticipant','entityGuid'],['ClaimQualifier','entityGuid'],['ClaimParticipant','claimGuid'],['ClaimQualifier','claimGuid'],['ClaimEvidence','claimGuid'],['Time','entityGuid']])assert.match(db.prepare(`EXPLAIN QUERY PLAN SELECT * FROM ${table} WHERE ${column}=? LIMIT 5001`).all('a').map(r=>r.detail).join(' '),/SEARCH .*INDEX/);
 const queries=full.data.metrics.queries;db.exec("INSERT INTO Entity(guid,name,nameKey) VALUES('more','Unrelated','unrelated')");assert.equal(extractPackageData(db,{entities:['a'],relationships:true,claims:true,evidence:true}).data.metrics.queries,queries);
 assert.throws(()=>extractPackageData(db,{entities:['a']},()=>{throw Error('cancelled')}),/cancelled/);
}finally{db.close();}});
test('independent JSON-to-SQLite reconstruction preserves logical rows and relational constraints',()=>{const source=fixture(),restored=new Database(':memory:');try{
 const archive=JSON.parse(JSON.stringify(extractPackageData(source,{entities:['a'],relationships:true,claims:true,evidence:true})));
 // Independent decoder, intentionally not using production sqlValue or the viewer adapter.
 const decode=v=>v[0]==='null'?null:v[0]==='integer'?BigInt(v[1]):v[0]==='real'?Buffer.from(v[1],'hex').readDoubleBE():v[0]==='blob'?Buffer.from(v[1],'base64'):v[1];
 restored.pragma('foreign_keys=OFF');for(const table of archive.schema.tables)restored.exec(table.sql);
 for(const table of archive.data.tables){const q=s=>'"'+s.replaceAll('"','""')+'"';const insert=restored.prepare(`INSERT INTO ${q(table.name)} (${table.columns.map(q)}) VALUES (${table.columns.map(()=>'?')})`);
  for(const row of table.rows)insert.run(...row.map(decode));
  const actual=restored.prepare(`SELECT * FROM ${q(table.name)} ORDER BY id`).safeIntegers().all();
  for(const row of actual)assert.deepEqual(row,source.prepare(`SELECT * FROM ${q(table.name)} WHERE id=?`).safeIntegers().get(row.id));
  assert.equal(actual.length,table.rows.length);
 }
 restored.pragma('foreign_keys=ON');assert.deepEqual(restored.pragma('foreign_key_check'),[]);
 // Generic encoding is also lossless for SQL types not currently authored by this schema.
 for(const value of [null,-9223372036854775808n,9223372036854775807n,-0,Math.PI,Buffer.from([0,255,17]),'\0😃'])assert.deepEqual(decode(JSON.parse(JSON.stringify(sqlValue(value)))),value);
}finally{source.close();restored.close();}});
test('real read-only worker accepts package extraction without document discovery or write authority',async()=>{
 const {mkdtemp,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path'),{openSqliteFoundation}=await import('./client.mjs'),{randomUUID}=await import('node:crypto');
 const vault=await mkdtemp(join(tmpdir(),'package-reader-'));let client;
 try{client=await openSqliteFoundation({vault,initialize:true});const id=randomUUID();await client.entities({op:'create',id,name:'Read-only archive',operationId:randomUUID()});await client.close();client=await openSqliteFoundation({vault,readOnly:true,entityReader:true});const archive=await client.packageData({entities:[id]});assert.equal(archive.data.tables.find(t=>t.name==='Entity').rows.length,1);await assert.rejects(client.entities({op:'get',id}),/only accepts lookups/);}finally{await client?.close();await rm(vault,{recursive:true,force:true});}
});
test('direct Claim references seed the required relational closure without enabling adjacent-claim discovery',()=>{const db=fixture();try{const result=extractPackageData(db,{entities:[],claimsById:['claim','missing-claim']});assert.equal(result.data.tables.find(t=>t.name==='Claim').rows.length,1);assert.equal(result.data.tables.find(t=>t.name==='ClaimParticipant').rows.length,2);assert.equal(result.data.tables.find(t=>t.name==='Entity').rows.length,3);assert.equal(result.data.tables.find(t=>t.name==='ClaimEvidence').rows.length,0);assert.ok(result.data.unresolved.some(r=>r.table==='Claim'&&r.value==='missing-claim'));}finally{db.close();}});
test('rejects over-budget seeds and high-fan-out rows without partial export or writes',()=>{const db=fixture();try{
 assert.throws(()=>extractPackageData(db,{entities:Array.from({length:501},(_,i)=>String(i))}),/500/);
 db.exec("WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<5001) INSERT INTO EntityAlias(guid,entityGuid,alias,aliasKey,origin) SELECT 'fanout-'||x,'a','alias-'||x,'alias-'||x,'curated' FROM n");
 const before=db.prepare('SELECT total_changes() AS n').get().n;assert.throws(()=>extractPackageData(db,{entities:['a']}),/row limit/);assert.equal(db.prepare('SELECT total_changes() AS n').get().n,before);assert.equal(db.inTransaction,false);
}finally{db.close();}});
