import {it,expect,afterEach} from 'vitest';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {randomUUID as uuid} from 'node:crypto';
import {runLegacyCodexImport,createLegacyImportContext} from './legacy-codex-import';
import {inspectLegacySource,convertLegacyDocument,digest,importGuid} from './legacy-import-source';
import {decodeNative} from '../src/persistence/native-resource';
import {resourceToRepository} from '../src/history/durable-core';
import {encodeDocument} from '../src/block-tree/codecs';
import {buildLegacyGraphPlan} from './legacy-import-mapping';
import {normalizePolicy} from '../src/knowledge/policy';
const cleanups:Array<()=>Promise<unknown>>=[];
afterEach(async()=>{for(const c of cleanups.splice(0).reverse())await c();});
async function fixture(){
 const dir=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'codex-import-test-')));cleanups.push(()=>fs.rm(dir,{recursive:true,force:true}));
 const source=path.join(dir,'source'),destination=path.join(dir,'destination');await fs.mkdir(path.join(source,'data'),{recursive:true});await fs.mkdir(path.join(source,'graph','nodes'),{recursive:true});await fs.mkdir(path.join(source,'graph','edges'),{recursive:true});
 const write=async(file:string,value:any)=>fs.writeFile(path.join(source,file),JSON.stringify(value));
 const ids={person:uuid(),other:uuid(),unknown:uuid(),time:uuid(),concept:uuid(),claim:uuid(),failedClaim:uuid(),point:uuid(),point2:uuid(),set:uuid(),set2:uuid(),document:uuid(),block:uuid(),property:uuid(),evidence:uuid(),evidence2:uuid(),cold:uuid(),hot:uuid(),definition:uuid()};
 await write('graph/nodes/agents.json',[{Guid:ids.person,Name:'A person',AgentType:'Person',Value:null,IsDeleted:false},{Guid:ids.other,Name:'B person',AgentType:'Person',Value:null,IsDeleted:false},{Guid:ids.unknown,Name:null,AgentType:null,Value:'not a proved Name',IsDeleted:false}]);
 await write('graph/nodes/times.json',[{Guid:ids.time,DisplayName:'1475 hour not exported',Year:1475,Month:null,Day:null,Minute:0,Second:null,Season:0,Around:null,Section:null,IsDeleted:false}]);
 await write('graph/nodes/concepts.json',[{Guid:ids.concept,Name:'Person',Code:'person',IsDeleted:false}]);
 await write('graph/nodes/claims.json',[{Guid:ids.claim,Role:'Trait',Name:'goldsmith',IsDeleted:false},{Guid:ids.failedClaim,Role:null,Name:'gated aggregate',IsDeleted:false}]);
 await write('graph/nodes/data-points.json',[{Guid:ids.point,Name:'Observation\t',Value:'1',IsDeleted:false},{Guid:ids.point2,Name:'Observation\t',Value:'1',IsDeleted:false}]);
 await write('graph/nodes/data-sets.json',[{Guid:ids.set,Name:'One',IsDeleted:false},{Guid:ids.set2,Name:'Two',IsDeleted:false}]);
 await write('graph/edges/acted_in_claim.json',[{Agent:{Guid:ids.person},Claim:{Guid:ids.claim},Role:'Subject'},{Agent:{Guid:ids.other},Claim:{Guid:ids.claim},Role:'AccordingTo'},{Agent:{Guid:ids.unknown},Claim:{Guid:ids.failedClaim},Role:'Subject'}]);
 await write('graph/edges/type_of_claim.json',[{Claim:{Guid:ids.claim},Concept:{Guid:ids.concept}}]);await write('graph/edges/claim_at_time.json',[{Claim:{Guid:ids.claim},Time:{Guid:ids.time}}]);
 await write('graph/edges/datapoint_measured_in.json',[{DataPoint:{Guid:ids.point},Concept:{Guid:ids.concept}},{DataPoint:{Guid:ids.point2},Concept:{Guid:ids.concept}}]);
 await write('graph/edges/part_of_dataset.json',[{DataPoint:{Guid:ids.point},DataSet:{Guid:ids.set}},{DataPoint:{Guid:ids.point},DataSet:{Guid:ids.set2}},{DataPoint:{Guid:ids.point2},DataSet:{Guid:ids.set}}]);
 await write('graph/edges/agent_has_property.json',[{Agent:{Guid:ids.concept},Property:{Guid:ids.concept}}]);
 await write('graph/nodes/meta-relations.json',[{Guid:ids.cold,IsDeleted:false},{Guid:ids.hot,IsDeleted:false}]);await write('graph/nodes/meta-relation-types.json',[{Guid:ids.definition,Name:'parent / child',DominantCode:'parent of',SubordinateCode:'child',DominantName:'parent',SubordinateName:'child',IsDeleted:false}]);
 await write('graph/edges/agent_is_related_metarelation.json',[ids.cold,ids.hot].flatMap(id=>[{Agent:{Guid:ids.person},MetaRelation:{Guid:id},Relation:{IsDominant:true}},{Agent:{Guid:ids.other},MetaRelation:{Guid:id},Relation:{IsDominant:false}}]));await write('graph/edges/type_of_metarelation.json',[ids.cold,ids.hot].map(id=>({MetaRelation:{Guid:id},MetaRelationType:{Guid:ids.definition}})));
 const document={id:ids.document,type:'main-list-block',title:'Exact legacy',children:[{id:ids.block,type:'standoff-editor-block',text:'A😀B',metadata:[],standoffProperties:[{id:ids.property,type:'codex/entity-reference',start:0,end:0,value:ids.person,metadata:[]},{id:ids.evidence,type:'codex/trait-reference',start:1,end:1,value:ids.claim},{id:ids.evidence2,type:'codex/claim-reference',start:2,end:2,value:ids.claim},{id:uuid(),type:'codex/meta-relation-reference',start:2,end:2,value:ids.hot},{id:uuid(),type:'codex/trait-reference',start:0,end:0,value:ids.claim,isDeleted:true}],blockProperties:[]}]};
 await write('data/source.custom',document);const duplicate={id:uuid(),type:'main-list-block',children:[]};await write('data/duplicate-a.json',duplicate);await write('data/duplicate-b.json',{...duplicate,title:'different version'});
 await write('data/zero-point.json',{id:uuid(),type:'main-list-block',children:[{id:uuid(),type:'standoff-editor-block',text:'x',standoffProperties:[{id:uuid(),type:'codex/document-reference',value:ids.document,start:1,end:1,zeroPoint:true}]}]});
 return {dir,source,destination,ids,document,write};
}
it('real pipeline uses canonical services, preserves authored .ink data, isolates failures, indexes mentions/evidence and reruns without duplicates',async()=>{
 const f=await fixture(),before=(await inspectLegacySource(f.source)).fingerprint;
 const first=await runLegacyCodexImport({source:f.source,destination:f.destination});expect(first.sourceUnchanged).toBe(true);expect(first.coverage.coverage.complete).toBe(true);expect(first.documents).toHaveLength(1);expect(first.discovery.standaloneMarkdown).toEqual([]);
 expect(first.diagnostics.some(d=>d.status==='ambiguous-mapping')).toBe(true);expect(first.diagnostics.some(d=>d.disposition==='QUARANTINE')).toBe(true);expect(first.diagnostics.some(d=>d.legacyGuid===f.ids.failedClaim&&d.status==='skipped-dependency-failed')).toBe(true);
 const native=await fs.readFile(path.join(f.destination,'documents/source.custom.ink'));expect(encodeDocument(resourceToRepository(decodeNative(native)))).toEqual(f.document);expect(await fs.readFile(path.join(f.destination,'documents/source.custom.ink.md'),'utf8')).toContain('A😀B');
 let c=await createLegacyImportContext(f.destination);try{
  expect((await c.services.claims.get(f.ids.failedClaim)).record).toBeUndefined();const claim=(await c.services.claims.get(f.ids.claim)).record!;expect(claim.participants).toHaveLength(2);expect(claim.qualifiers).toHaveLength(2);expect(claim.evidence).toHaveLength(2);expect(new Set((claim.evidence as any[]).map(e=>e.guid)).size).toBe(2);expect((claim.evidence as any[]).map(e=>e.authoredPropertyId).sort()).toEqual([f.ids.evidence,f.ids.evidence2].sort());
  expect((await c.services.times.get(f.ids.time)).record).toMatchObject({startYear:1475,startMinute:0,startHour:null});expect((await c.services.memberships.collections(f.ids.point)).items).toHaveLength(2);expect((await c.services.dataPoints.count({dataSetGuids:[f.ids.set,f.ids.set2]})).count).toBe(2);
  expect((await c.services.execute({op:'get',recordType:'Entity',id:f.ids.cold,operationId:uuid()})).entity).toBeUndefined();expect((await c.services.execute({op:'get',recordType:'Entity',id:f.ids.hot,operationId:uuid()})).entity).toBeTruthy();
  const evidence=(claim.evidence as any[]).find(e=>e.authoredPropertyId===f.ids.evidence),resolved=await c.services.evidence.resolve(evidence.guid,{location:{folder:'documents',filename:'source.custom.ink'},byteHash:digest(native)});expect(resolved.status).toBe('resolved');expect(resolved.excerpt).toBe('😀');
  await c.host.refresh(c.selected.lease);const scan=await c.request('/api/native/vault/discover',{vault:'.'}),scope=await c.request('/api/sqlite/knowledge/facts/begin',{lease:c.selected.lease,vault:'.',signature:digest(JSON.stringify(scan)),policy:normalizePolicy()});
  const mentions=await c.request('/api/sqlite/knowledge/facts/mentions',{scope:scope.scope,ids:[f.ids.document],entityId:f.ids.person,limit:10});expect(mentions.items).toHaveLength(1);expect(mentions.items[0].resourceId).toBe(f.ids.document);await c.request('/api/sqlite/knowledge/facts/release',{scope:scope.scope});
 }finally{await c.close();}
 const second=await runLegacyCodexImport({source:f.source,destination:f.destination});expect(second.documents).toHaveLength(1);expect(await fs.readFile(path.join(f.destination,'documents/source.custom.ink'))).toEqual(native);expect((await inspectLegacySource(f.source)).fingerprint).toBe(before);
 c=await createLegacyImportContext(f.destination);try{expect((await c.services.dataPoints.count()).count).toBe(2);expect((await c.services.claims.count()).count).toBe(1);expect((await c.services.claims.get(f.ids.claim)).record!.evidence).toHaveLength(2);expect((await c.services.query('DataSetMembership')).items).toHaveLength(3);expect((await c.services.audit.status()).pending).toBe(0);
  const guid=importGuid('DataSetMembership:'+f.ids.set+':'+f.ids.point),set=(await c.services.dataSets.get(f.ids.set)).record!;
  await c.services.memberships.remove({guid,expectedRevision:0,expectedDataSetRevision:set.revision,operationId:uuid()});expect((await c.services.memberships.collections(f.ids.point)).items).toHaveLength(1);expect((await c.services.dataPoints.get(f.ids.point)).record?.revision).toBe(0);
 }finally{await c.close();}
},60000);
it('rejects source/destination overlap, a live/nonempty destination and a disabled importer',async()=>{
 const f=await fixture();await expect(runLegacyCodexImport({source:f.source,destination:f.source})).rejects.toThrow(/disjoint/);await fs.mkdir(f.destination);await fs.writeFile(path.join(f.destination,'live.txt'),'untouched');await expect(runLegacyCodexImport({source:f.source,destination:f.destination})).rejects.toThrow(/empty disposable/);expect(await fs.readFile(path.join(f.destination,'live.txt'),'utf8')).toBe('untouched');await expect(runLegacyCodexImport({source:f.source,enabled:false})).rejects.toThrow(/disabled/);
});
it('does not recognize workspace suffixes or import its .ink.md projections as new source Documents',async()=>{
 const f=await fixture();await f.write('data/source.desktop',f.document);await f.write('data/source.ink.md',f.document);const inventory=await inspectLegacySource(f.source);expect(inventory.documents.some(d=>d.file.path.endsWith('.desktop')||d.file.path.endsWith('.ink.md'))).toBe(false);
});

it('isolates ambiguous graph identities and unreadable incidence exports without weakening complete-aggregate gating',async()=>{
 const f=await fixture();await f.write('graph/nodes/agents.json',[{Guid:f.ids.person,Name:'first'},{Guid:f.ids.person,Name:'second'},{Guid:f.ids.other,Name:'safe unrelated'}]);
 await fs.writeFile(path.join(f.source,'graph/edges/acted_in_claim.json'),'{broken');
 const source=await inspectLegacySource(f.source),plan=buildLegacyGraphPlan(source,{id:uuid(),fingerprint:source.fingerprint},new Set());
 expect(plan.base.some(j=>j.command.id===f.ids.other)).toBe(true);expect(plan.base.some(j=>j.command.id===f.ids.person)).toBe(false);
 expect(plan.aggregates.some(j=>j.command.recordType==='Claim')).toBe(false);expect(plan.aggregates.filter(j=>j.command.recordType==='DataPoint')).toHaveLength(2);
 expect(plan.diagnostics.filter(d=>d.status==='ambiguous-mapping'&&d.legacyGuid===f.ids.person)).toHaveLength(2);expect(plan.diagnostics.some(d=>d.source.endsWith('acted_in_claim.json')&&d.disposition==='QUARANTINE')).toBe(true);
 expect(source.documents.some(d=>d.resourceId===f.ids.document&&!d.error)).toBe(true);
});

it('preserves a client-only source artifact rather than publishing a codec round-trip that discards it',async()=>{
 const f=await fixture();await f.write('data/client-only.json',{id:uuid(),type:'main-list-block',children:[{id:uuid(),type:'standoff-editor-block',text:'x',standoffProperties:[{id:uuid(),type:'codex/trait-reference',start:0,end:0,value:f.ids.claim,clientOnly:true}]}]});
 const source=await inspectLegacySource(f.source),d=source.documents.find(d=>d.file.path==='data/client-only.json')!;convertLegacyDocument(d);expect(d.status).toBe('skipped-as-unsupported');expect(d.error).toMatch(/round-trip/);
});


it('rejects a frozen parent command that differs from the current annotation before replaying it',async()=>{
 const f=await fixture(),first=await runLegacyCodexImport({source:f.source,destination:f.destination,skipIndex:true});
 const folder=path.join(first.home,'parent-commands');
 for(const name of await fs.readdir(folder)){const file=path.join(folder,name),frozen=JSON.parse(await fs.readFile(file,'utf8'));if(frozen.value?.recordType==='ClaimEvidence'){frozen.value.excerpt='different source';await fs.writeFile(file,JSON.stringify(frozen));break;}}
 await expect(runLegacyCodexImport({source:f.source,destination:f.destination,skipIndex:true})).rejects.toThrow(/Frozen operation parent command differs/);
 const c=await createLegacyImportContext(f.destination);try{expect((await c.services.claims.get(f.ids.claim)).record!.evidence).toHaveLength(2);}finally{await c.close();}
},60000);

it('preserves raw negative-zero observations in public dispatch and frozen requests on repeat import',async()=>{
 const f=await fixture();await fs.writeFile(path.join(f.source,'graph/nodes/data-points.json'),'[{"Guid":"'+f.ids.point+'","Name":"raw zero","Value":-0,"IsDeleted":false},{"Guid":"'+f.ids.point2+'","Name":"ordinary zero","Value":0,"IsDeleted":false}]');
 for(let i=0;i<2;i++){await runLegacyCodexImport({source:f.source,destination:f.destination,skipIndex:true});const c=await createLegacyImportContext(f.destination);try{expect(Object.is((await c.services.dataPoints.get(f.ids.point)).record!.value,-0)).toBe(true);expect(Object.is((await c.services.dataPoints.get(f.ids.point2)).record!.value,0)).toBe(true);}finally{await c.close();}}
},60000);

it('gates a native conversion that would normalize an authored negative zero',async()=>{
 const f=await fixture();const doc={id:uuid(),type:'main-list-block',metadata:{sample:0},children:[]};await fs.writeFile(path.join(f.source,'data/raw-negative-zero.json'),JSON.stringify(doc).replace('"sample":0','"sample":-0'));
 const d=(await inspectLegacySource(f.source)).documents.find(d=>d.file.path==='data/raw-negative-zero.json')!;convertLegacyDocument(d);expect(d.status).toBe('skipped-as-unsupported');expect(d.error).toMatch(/round-trip/);expect(Object.is(d.raw.metadata.sample,-0)).toBe(true);
});
