/** Import orchestration through public HTTP/application contracts, into a guarded, explicitly selected vault. */
import express from 'express';
import {promises as fs,constants as C} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {featureFlags} from '../src/configuration';
import {openSemanticServices} from '../src/application/semantic-services';
import type {SemanticVaultServices} from '../src/feature-api/semantics';
import {SqliteKnowledgeHost} from './sqlite-knowledge-host';
import {createSavedIndexer} from './sqlite-saved-indexer';
import {createNativeDocumentStoreRouter} from './native-document-store.mjs';
import {NativeVaultStore} from './native-vault-store.mjs';
import {projectSaved} from '../src/knowledge-sqlite/saved-projection';
import {decodeNative} from '../src/persistence/native-resource';
import {exportMarkdown} from '../src/persistence/markdown';
import {encodeDocument} from '../src/block-tree/codecs';
import {resourceToRepository} from '../src/history/durable-core';
import {buildLegacyGraphPlan,type ImportJob,type ImportDiagnostic} from './legacy-import-mapping';
import {inspectLegacySource,readSource,convertLegacyDocument,importGuid,digest,stable,type SourceInventory,type DocumentCandidate} from './legacy-import-source';
import {normalizePolicy} from '../src/knowledge/policy';
import {encodeAuthoredValue,decodeAuthoredValue} from '../src/history/preplan-spike/authored-values.mjs';
export interface LegacyImportOptions {source:string;destination?:string;enabled?:boolean;documentLimit?:number;skipIndex?:boolean;allowEmptyDestination?:boolean;zeroWidthAnnotations?:boolean;onProgress?:(message:string)=>void}
async function immutable(file:string,bytes:string|Uint8Array){
 await fs.mkdir(path.dirname(file),{recursive:true});let h;try{h=await fs.open(file,C.O_WRONLY|C.O_CREAT|C.O_EXCL|C.O_NOFOLLOW,0o600);}catch(e:any){if(e.code!=='EEXIST')throw e;const r=await fs.open(file,C.O_RDONLY|C.O_NOFOLLOW);try{if(!(await r.stat()).isFile()||digest(await r.readFile())!==digest(typeof bytes==='string'?bytes:bytes))throw Error('Import journal conflict: '+file);return;}finally{await r.close();}}
 try{await h.writeFile(bytes);await h.sync();}finally{await h.close();}const directory=await fs.open(path.dirname(file),C.O_RDONLY);try{await directory.sync();}finally{await directory.close();}
}
function journalWire(value:any){return {authoredCommandVersion:1,value:encodeAuthoredValue(value)};}
function journalValue(value:any){return value?.authoredCommandVersion===1?decodeAuthoredValue(value.value):value;}
const commandSignature=(value:any)=>stable(encodeAuthoredValue(value));
async function snapshotWrite(file:string,value:any){const temporary=file+'.'+randomUUID()+'.tmp';await immutable(temporary,JSON.stringify(value,null,2)+'\n');await fs.rename(temporary,file);}
async function jsonIfExists(file:string){try{return JSON.parse(await fs.readFile(file,'utf8'));}catch(e:any){if(e.code==='ENOENT')return;throw e;}}
export async function createLegacyImportContext(root:string,options:{onIndexProgress?:(phase:string,details:any)=>Promise<void>|void}={}){
 const store=new NativeVaultStore({root}),host=new SqliteKnowledgeHost({root,store,debounceMs:2_000_000_000,leaseMs:24*3_600_000,indexer:(client,settings)=>createSavedIndexer(client,{...settings,checkpoint:async(phase,details)=>{await options.onIndexProgress?.(phase,details);}})}),app=express();
 app.use('/api/sqlite/knowledge',host.router());app.use('/api/native',createNativeDocumentStoreRouter({root,coordinate:action=>host.foreground(action),establishVault:vault=>host.establish(vault)}));
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));const baseUrl='http://127.0.0.1:'+(server.address() as any).port;
 const services=await openSemanticServices({vault:'.',baseUrl}),selected=await host.acquire('.');
 const request=async(route:string,body:any)=>{const response=await fetch(baseUrl+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),result=await response.json() as any;if(!response.ok||!result.Success)throw Error(result.Error??'Import service unavailable');return result.Data;};
 return {root,host,store,services,selected,request,async close(){try{await services.dispose();await host.release(selected.lease);}finally{await host.close();await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}}};
}
export type LegacyImportContext=Awaited<ReturnType<typeof createLegacyImportContext>>;
function jobGuid(job:ImportJob){return String(job.command.guid??job.command.id);}
function eventCost(job:ImportJob){return 1+(job.command.recordType==='Time'?1:0)+((job.command.participants as any[])?.length??0)+((job.command.qualifiers as any[])?.length??0)+((job.command.dimensions as any[])?.length??0);}
export async function executeLegacyJobs(jobs:ImportJob[],services:SemanticVaultServices,home:string,available:Set<string>,diagnostics:ImportDiagnostic[],metrics:any,progress:(message:string)=>void){
 const accepted:ImportJob[]=[];
 for(const job of jobs){const missing=job.dependencies.filter(id=>!available.has(id));if(missing.length){for(const m of job.mappings)diagnostics.push({key:m.row.key,source:m.row.file,ordinal:m.row.ordinal,legacyGuid:m.row.raw.Guid,destination:{recordType:m.recordType,guid:m.guid},status:'skipped-dependency-failed',disposition:'UNRESOLVED',reason:'Unavailable canonical dependencies: '+missing.join(', ')});}else accepted.push(job);}
 const record=(job:ImportJob,error?:string)=>{for(const m of job.mappings)diagnostics.push({key:m.row.key,source:m.row.file,ordinal:m.row.ordinal,legacyGuid:m.row.raw.Guid,destination:{recordType:m.recordType,guid:m.guid},status:error?(/budget|Invalid Entity value/.test(error)?'skipped-as-unsupported':/Invalid|invalid|required|must be|cannot|does not exist|revision|GUID|already exists|Unknown|unknown/.test(error)?'invalid-source':'unexpected-implementation-failure'):job.warnings.length?'imported-with-warning':'imported',disposition:error?'UNRESOLVED':job.disposition,reason:error,warnings:job.warnings});if(!error)available.add(jobGuid(job));};
 const dispatch=async(input:any)=>{
  const file=path.join(home,'requests',digest(input.operationId)+'.json'),prior=journalValue(await jsonIfExists(file));if(prior&&commandSignature(prior)!==commandSignature(input))throw Error('Frozen operation request differs from this import plan');if(!prior)await immutable(file,JSON.stringify(journalWire(input)));
  const started=performance.now();try{const result=input.op==='batch'?await services.batch(input):await services.execute(input);metrics.canonicalRequests++;return result;}catch(error){const outcome=await services.audit.outcome(input.operationId);if(outcome.status==='committed')return outcome.result;if(outcome.status==='unavailable')throw Error('Canonical mutation outcome unavailable; dependent import must stop');throw error;}finally{metrics.canonicalMs+=performance.now()-started;}
 };
 const drain=async()=>{const status=await services.audit.status();metrics.peakPending=Math.max(metrics.peakPending,status.pending);metrics.peakOutboxBytes=Math.max(metrics.peakOutboxBytes,status.bytes);if(status.pending>=100||status.bytes>=8*1024*1024){const t=performance.now();await services.audit.deliver({limit:1000,maxBytes:16*1024*1024});metrics.auditMs+=performance.now()-t;}};
 for(let offset=0;offset<accepted.length;){
  const group:ImportJob[]=[];let bytes=128,events=0;
  while(offset<accepted.length){const j=accepted[offset],size=Buffer.byteLength(commandSignature(j.command));if(group.length&&(bytes+size>28*1024||events+eventCost(j)>200||group.length>=75))break;group.push(j);offset++;bytes+=size;events+=eventCost(j);}
  const operationId=importGuid('batch:'+group.map(j=>j.key+':'+digest(commandSignature(j.command))).join('|')),request={op:'batch',operationId,commands:group.map(j=>j.command)};
  try{await dispatch(request);group.forEach(j=>record(j));}catch(error){if(/outcome unavailable|journal conflict|Frozen operation/.test(String(error)))throw error;for(const job of group){try{await dispatch({...job.command,operationId:importGuid('record:'+job.key+':'+digest(commandSignature(job.command)))});record(job);}catch(e){if(/outcome unavailable/.test(String(e)))throw e;record(job,String(e));}}}
  await drain();if(offset%500<group.length)progress(`Canonical records processed: ${offset}/${accepted.length}`);
 }
}
/** Incidence commands freeze the observed parent revision before their first dispatch. */
async function executeParentJobs(jobs:ImportJob[],context:LegacyImportContext,home:string,available:Set<string>,diagnostics:ImportDiagnostic[],metrics:any,progress:(message:string)=>void){
 for(const job of jobs){
  const inputFile=path.join(home,'parent-commands',digest(job.key)+'.json');let command=journalValue(await jsonIfExists(inputFile));
  if(command){const {expectedParentRevision,expectedDataSetRevision,...base}=command;if(commandSignature(base)!==commandSignature(job.command))throw Error('Frozen operation parent command differs from this import plan: '+job.key);}
  if(!command){const t=job.command.recordType,parentGuid=String(t==='DataSetMembership'?job.command.dataSetGuid:job.command.claimGuid),parent=await (t==='DataSetMembership'?context.services.dataSets:context.services.claims).get(parentGuid);if(!parent.record){await executeLegacyJobs([job],context.services,home,available,diagnostics,metrics,progress);continue;}command={...job.command,[t==='DataSetMembership'?'expectedDataSetRevision':'expectedParentRevision']:parent.record.revision};await immutable(inputFile,JSON.stringify(journalWire(command)));}
  await executeLegacyJobs([{...job,command}],context.services,home,available,diagnostics,metrics,progress);
 }
}
function documentDiagnostic(d:DocumentCandidate,status:any,reason?:string):ImportDiagnostic{return {key:d.file.path,source:d.file.path,legacyGuid:d.resourceId,destination:d.resourceId?{recordType:'Document',guid:d.resourceId}:undefined,status,disposition:status.startsWith('imported')?'IMPORT':'UNRESOLVED',reason,warnings:d.warnings};}
export async function runLegacyCodexImport(options:LegacyImportOptions){
 if(!(options.enabled??featureFlags.legacyCodexImport))throw Error('Legacy Codex import is disabled');
 if(options.documentLimit!==undefined&&(!Number.isInteger(options.documentLimit)||options.documentLimit<0))throw Error('Invalid document limit');
 const progress=options.onProgress??(()=>{}),started=performance.now();progress('Inspecting read-only source and recording its full fingerprint');
 const source=await inspectLegacySource(options.source);
 const selected=options.destination?path.resolve(options.destination):await fs.mkdtemp(path.join((await import('node:os')).tmpdir(),'mutable-codex-phase2-'));
 if(selected===source.root||selected.startsWith(source.root+path.sep)||source.root.startsWith(selected+path.sep))throw Error('Source and destination must be disjoint');
 await fs.mkdir(selected,{recursive:true});if((await fs.lstat(selected)).isSymbolicLink())throw Error('Destination symlinks are not admitted');const destination=await fs.realpath(selected);
 if(destination===source.root||destination.startsWith(source.root+path.sep)||source.root.startsWith(destination+path.sep))throw Error('Resolved source and destination overlap');
 if(options.allowEmptyDestination&&!options.destination)throw Error('An authorized empty destination must be explicitly supplied');
 const marker=path.join(destination,options.allowEmptyDestination?'.mutable-import.json':'.mutable-import-disposable.json'),existing=await jsonIfExists(marker),zeroWidthAnnotations=options.zeroWidthAnnotations===true;
 if(!existing){if((await fs.readdir(destination)).length)throw Error('First import requires an empty destination');await immutable(marker,JSON.stringify({version:1,disposable:!options.allowEmptyDestination,authorizedEmptyDestination:!!options.allowEmptyDestination,source:source.root,sourceFingerprint:source.fingerprint,zeroWidthAnnotations}));}
 else if(existing.version!==1||(options.allowEmptyDestination?!existing.authorizedEmptyDestination:!existing.disposable)||existing.source!==source.root||existing.sourceFingerprint!==source.fingerprint||!!existing.zeroWidthAnnotations!==zeroWidthAnnotations)throw Error('Destination is not this snapshot and migration policy\'s import vault');
 let indexed=0;const context=await createLegacyImportContext(destination,{onIndexProgress:(phase)=>{if(phase==='staged'&&++indexed%100===0)progress(`Documents indexed: ${indexed}`);}}),home=path.join(destination,'.mutable','imports',source.fingerprint);await fs.mkdir(home,{recursive:true});
 let run=await jsonIfExists(path.join(home,'run.json'));if(!run){run={id:randomUUID(),fingerprint:source.fingerprint,source:source.root,createdUtc:new Date().toISOString(),policy:zeroWidthAnnotations?'codex-to-mutable-zero-width-v1':'codex-to-mutable-v1'};await immutable(path.join(home,'run.json'),JSON.stringify(run));}
 const metrics:any={canonicalMs:0,canonicalRequests:0,auditMs:0,documentMs:0,indexMs:0,peakPending:0,peakOutboxBytes:0,peakHeapBytes:process.memoryUsage().heapUsed,batchesEnabled:true},diagnostics:ImportDiagnostic[]=[],available=new Set<string>(),published:DocumentCandidate[]=[];
 const progressWithMemory=(message:string)=>{metrics.peakHeapBytes=Math.max(metrics.peakHeapBytes,process.memoryUsage().heapUsed);progress(message);};
 try{
  // Preserve every original byte, including unresolved material; not an epistemic evidence link.
  await immutable(path.join(home,'inventory.json'),JSON.stringify({fingerprint:source.fingerprint,root:source.root,files:source.files.map(({absolute,...f})=>f)}));
  const referencedGuids=new Set<string>();for(const file of source.files){const bytes=await readSource(file);await immutable(path.join(home,'source',file.path),bytes);if(!file.path.startsWith('graph/'))for(const match of bytes.toString('utf8').matchAll(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/ig))referencedGuids.add(match[0]);}
  for(const [family,rows]of [...source.nodes,...source.edges])if(!['meta-relations','agent_is_related_metarelation','type_of_metarelation','metarelation_at_time'].includes(family))for(const r of rows)for(const match of stable(r.raw).matchAll(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/ig))referencedGuids.add(match[0]);
  progressWithMemory(`Source recorded: ${source.files.length} files, ${source.documents.length} document candidates`);
  const graph=buildLegacyGraphPlan(source,run,referencedGuids);diagnostics.push(...graph.diagnostics);
  for(const group of [graph.base,graph.aggregates,graph.relationships])await executeLegacyJobs(group,context.services,home,available,diagnostics,metrics,progressWithMemory);
  await executeParentJobs(graph.memberships,context,home,available,diagnostics,metrics,progressWithMemory);
  const identityMap=diagnostics.filter(d=>d.destination).map(d=>({sourceKey:d.key,legacyGuid:d.legacyGuid??null,destination:d.destination,status:d.status}));
  await snapshotWrite(path.join(home,'semantic-identity-map.json'),identityMap);
  let admitted=0;
  for(const d of source.documents){
   convertLegacyDocument(d,{zeroWidthAnnotations});if(d.error){diagnostics.push(documentDiagnostic(d,d.status??'invalid-source',d.error));continue;}
   if(options.documentLimit!==undefined&&admitted>=options.documentLimit){diagnostics.push(documentDiagnostic(d,'skipped-as-unsupported','Explicit pilot document limit'));continue;}
   const capture=path.join(home,'captures',digest(d.file.path)+'.native'),existingCapture=await fs.readFile(capture,'utf8').catch((e:any)=>{if(e.code==='ENOENT')return;throw e;});
   if(existingCapture){const raw=encodeDocument(resourceToRepository(decodeNative(Buffer.from(existingCapture))));if(commandSignature(raw)!==commandSignature(encodeDocument(resourceToRepository(decodeNative(Buffer.from(d.native!))))))throw Error('Captured authored Document differs on rerun');d.native=existingCapture;}else await immutable(capture,d.native!);
   try{d.projection=await projectSaved(Buffer.from(d.native!),context.services.vaultGuid);if(d.projection.resourceId!==d.resourceId)throw Error('Resource identity changed during projection');}catch(error){d.error=String(error);diagnostics.push(documentDiagnostic(d,'skipped-as-unsupported','Saved projection could not preserve all ranges: '+d.error));continue;}
   for(const block of d.projection.blocks)for(const p of block.segments)if(p.typename==='codex/entity-reference'&&(!p.targetEntityGuid||!available.has(p.targetEntityGuid)))d.warnings.push(`Unresolved Entity Reference: ${p.authoredId??p.guid} -> ${p.targetEntityGuid??'null'}`);
   d.warnings.push(...d.projection.diagnostics);admitted++;
   const resource=decodeNative(Buffer.from(d.native!)),projection=exportMarkdown(resource,[]);d.warnings.push(...projection.diagnostics.map(p=>`Markdown ${p.code}: ${p.detail}`));
   const location={folder:path.posix.dirname(d.destination),filename:path.posix.basename(d.destination)};await fs.mkdir(path.join(destination,location.folder),{recursive:true});
   const generation={resourceId:d.resourceId,generation:importGuid('document:'+source.fingerprint+':'+d.file.path),native:d.native,markdown:projection.text,profile:projection.profile,targets:[]};
   const t=performance.now();try{const receipt=await context.request('/api/native/save',{location,generation,baseline:{nativeHash:null,markdownHash:null,generation:null}});if(receipt.result.phase!=='saved')throw Error(JSON.stringify(receipt.result));
    const reopened=await context.request('/api/native/open',{location});if(reopened.kind!=='native'||reopened.native!==d.native||reopened.pending)throw Error('Published native generation does not reopen exactly');
    published.push(d);diagnostics.push(documentDiagnostic(d,d.warnings.length?'imported-with-warning':'imported'));
   }catch(error){diagnostics.push(documentDiagnostic(d,'unexpected-implementation-failure',String(error)));}finally{metrics.documentMs+=performance.now()-t;}
   if(admitted%100===0)progressWithMemory(`Documents published: ${published.length}/${source.documents.length}`);
  }
  // Evidence is derived only from exact, published and range-qualified source annotations.
  const evidenceJobs:ImportJob[]=[];
  for(const d of published)for(const b of d.projection.blocks)for(const [ordinal,segment] of b.segments.entries())if(['codex/trait-reference','codex/claim-reference'].includes(segment.typename)){
   const claim=segment.value,key=d.file.path+':'+b.block.guid+':'+segment.guid+':ClaimEvidence',raw=JSON.parse(segment.attributes);
   if(segment.isDeleted||raw.clientOnly){diagnostics.push({key,source:d.file.path,ordinal,status:'skipped-as-unsupported',disposition:'PRESERVE',reason:'Deleted/client-only annotation retained natively; no active evidence attachment'});continue;}
   if(graph.nodeKinds.get(claim)!=='claims'){diagnostics.push({key,source:d.file.path,ordinal,status:'skipped-as-unsupported',disposition:'PRESERVE',reason:'Annotation target does not identify an exported Claim; native annotation retained, no assertion inferred'});continue;}
   const guid=importGuid(key),row={key,file:d.file.path,ordinal,hash:d.file.hash,raw};
   evidenceJobs.push({key,command:{recordType:'ClaimEvidence',op:'add',guid,claimGuid:claim,resourceGuid:d.resourceId,blockGuid:b.block.guid,authoredPropertyId:segment.authoredId,sourceContentHash:d.projection.contentHash,startIndex:segment.startIndex,endIndex:segment.endIndex,coordinate:segment.coordinate,evidenceKind:'legacy-annotation',excerpt:segment.text,attributes:{legacyImport:{importRun:run.id,snapshot:source.fingerprint,sourceFile:d.file.path,sourceHash:d.file.hash,rawAnnotation:raw,rule:'qualified-legacy-annotation-span-v1',epistemicInterpretation:'attachment only; not truth certification'}}},dependencies:[claim],rows:[row],mappings:[{row,recordType:'ClaimEvidence',guid}],warnings:[],disposition:'IMPORT'});
  }
  await executeParentJobs(evidenceJobs,context,home,available,diagnostics,metrics,progressWithMemory);
  progressWithMemory('Delivering durable audit and reconciling published Documents');
  while((await context.services.audit.status()).pending){const t=performance.now(),result=await context.services.audit.deliver({limit:1000,maxBytes:16*1024*1024});metrics.auditMs+=performance.now()-t;if(!result.delivered)throw Error('Audit delivery made no progress');}
  const indexingStart=performance.now();let coverage:any={complete:false,diagnostics:['Indexing skipped by explicit pilot option']};if(!options.skipIndex)coverage=await context.host.refresh(context.selected.lease);metrics.indexMs=performance.now()-indexingStart;
  const discovery=await context.request('/api/native/vault/discover',{vault:'.'});
  const after=await inspectLegacySource(source.root);if(after.fingerprint!==source.fingerprint)throw Error('Source changed during import; qualification stopped');
  metrics.totalMs=performance.now()-started;metrics.peakHeapBytes=Math.max(metrics.peakHeapBytes,process.memoryUsage().heapUsed);
  const result={version:1,run,source:{root:source.root,fingerprint:source.fingerprint,files:source.files.length,bytes:source.bytes,nodeCounts:Object.fromEntries([...source.nodes].map(([k,v])=>[k,v.length])),edgeCounts:Object.fromEntries([...source.edges].map(([k,v])=>[k,v.length])),documents:source.documents.length,blocks:source.documents.reduce((n,d)=>n+d.blocks.length,0),standoff:source.documents.reduce((n,d)=>n+d.blocks.reduce((a,b)=>a+(b.standoffProperties?.length??0),0),0),excluded:source.excluded},destination,home,sourceUnchanged:true,diagnostics,documents:published.map(d=>({source:d.file.path,destination:d.destination,resourceGuid:d.resourceId,contentHash:d.projection.contentHash,blocks:d.projection.blocks.length,standoff:d.projection.blocks.reduce((n:number,b:any)=>n+b.segments.length,0),entityReferences:d.projection.blocks.reduce((n:number,b:any)=>n+b.segments.filter((s:any)=>s.typename==='codex/entity-reference').length,0),transformations:d.transforms,warningCount:d.warnings.length})),coverage,discovery:{documents:discovery.documents.length,standaloneMarkdown:discovery.markdown,complete:discovery.complete,diagnostics:discovery.diagnostics},metrics,audit:await context.services.audit.status()};
  await snapshotWrite(path.join(home,'qualification.json'),result);await snapshotWrite(path.join(home,'identity-map.json'),[...diagnostics.filter(d=>d.destination).map(d=>({sourceKey:d.key,legacyGuid:d.legacyGuid??null,destination:d.destination,status:d.status})),...published.flatMap(d=>[{sourceKey:d.file.path,legacyGuid:d.resourceId,destination:{recordType:'Document',guid:d.resourceId,path:d.destination}},...d.projection.blocks.flatMap((b:any)=>[{sourceKey:d.file.path+':'+b.block.guid,legacyGuid:b.block.guid,destination:{recordType:'Block',guid:b.block.guid}},...b.segments.map((p:any)=>({sourceKey:d.file.path+':'+b.block.guid+':'+p.guid,legacyGuid:p.authoredId,destination:{recordType:'DerivedStandoffProperty',guid:p.guid}}))])])]);
  progressWithMemory(`Import completed in ${(metrics.totalMs/1000).toFixed(1)} seconds; report data: ${home}/qualification.json`);return result;
 }catch(error){await snapshotWrite(path.join(home,'interrupted.json'),{run,error:String(error),diagnostics,metrics});throw error;}finally{await context.close();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),value=(flag:string)=>{const i=args.indexOf(flag);return i<0?undefined:args[i+1];},source=value('--source');
 if(!source){console.error('Usage: npm run import:codex -- --source /path/to/codex-data [--destination EMPTY_DIRECTORY] [--allow-empty-destination] [--zero-width-annotations] [--document-limit N] [--skip-index]');process.exitCode=1;}
 else runLegacyCodexImport({source,destination:value('--destination'),allowEmptyDestination:args.includes('--allow-empty-destination'),zeroWidthAnnotations:args.includes('--zero-width-annotations'),documentLimit:value('--document-limit')===undefined?undefined:Number(value('--document-limit')),skipIndex:args.includes('--skip-index'),onProgress:message=>console.log(message)}).then(result=>console.log(JSON.stringify({destination:result.destination,home:result.home,documents:result.documents.length,metrics:result.metrics},null,2))).catch(error=>{console.error(error);process.exitCode=1;});
}
