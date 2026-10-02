/** Disposable, bounded diagnostic exercise. Not production queries or P6. */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {Worker} from 'node:worker_threads';
import {randomUUID,createHash} from 'node:crypto';
import Database from 'better-sqlite3';
import {openSqliteFoundation} from '../src/knowledge-sqlite/client.mjs';
import {createSavedIndexer,ManagedPair} from '../server/sqlite-saved-indexer';
import {SqliteKnowledgeHost} from '../server/sqlite-knowledge-host';
import {decodeBlockTree} from '../src/block-tree/codecs';
import {captureNative,nativeText} from '../src/persistence/native-resource';
import {exportMarkdown} from '../src/persistence/markdown';
import {entityQuery} from './sqlite-p3a-query-prototype.mjs';
const hash=(v:any)=>createHash('sha256').update(v).digest('hex');
const summary=(values:number[])=>{const a=[...values].sort((a,b)=>a-b);return {p50:a[Math.floor(a.length*.5)],p95:a[Math.min(a.length-1,Math.floor(a.length*.95))],max:a.at(-1),n:a.length};};
const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'sqlite-p3a-workloads-')));
const report:any={recordedUtc:new Date().toISOString(),node:process.version,cpu:os.cpus()[0].model,memoryBytes:os.totalmem(),purpose:'P3a bounded diagnostic controls, not P6 or user-visible latency guarantees',resources:[],entities:{}};
let client:any,queryWorker:Worker|undefined,server:http.Server|undefined;
try{
 const vault=path.join(root,'entities');await fs.mkdir(vault);client=await openSqliteFoundation({vault,initialize:true});await client.close();client=undefined;
 const file=path.join(vault,'.mutable/mutable.db');let db=new Database(file);db.pragma('foreign_keys=ON');
 const ids=Array.from({length:10000},()=>randomUUID());
 const populate=performance.now();db.transaction(()=>{
  const entity=db.prepare('INSERT INTO Entity(guid,name,nameKey,typename,description) VALUES(?,?,?,?,?)'),alias=db.prepare('INSERT INTO EntityAlias(guid,entityGuid,alias,aliasKey,origin) VALUES(?,?,?,?,?)');
  ids.forEach((id,i)=>{const name=i%100===0?'Edgar Allan Poe':i%101===0?'Émile 漢 😀 '+i:'Research subject '+i;entity.run(id,name,name.normalize('NFC').toLowerCase(),'person','Canonical description '+i);
    for(let j=0;j<2;j++){const name=j?'Curated form '+i:'E. Allan '+i;alias.run(randomUUID(),id,name,name.toLowerCase(),j?'curated':'imported');}});
  const resource=db.prepare("INSERT INTO Resource(guid,path,typename,format,rootBlockGuid,contentHash,indexedUtc,extractionProfile,indexStatus) VALUES(?,?,'document-block','mutable-document',?,'synthetic',?,'qualification','complete')");
  const block=db.prepare("INSERT INTO Block(guid,resourceGuid,typename,authoredType,text,coordinate,cellCount) VALUES(?,?,'standoff-editor-block','standoff-editor-block',?,'cell',?)");
  const segment=db.prepare("INSERT INTO StandoffProperty(guid,resourceGuid,sourceBlockGuid,authoredId,identityKind,logicalGuid,typename,startIndex,endIndex,coordinate,text,targetEntityGuid,resolution,attributes) VALUES(?,?,?,?,'authored',?,'codex/entity-reference',0,5,'cell',?,?,?,'{}')");
  for(let r=0;r<100;r++){resource.run('r'+r,`r${r}.mutable.json`,'r'+r+'-root',new Date().toISOString());
    for(let b=0;b<250;b++){const n=r*250+b,bid=`r${r}b${b}`,text=n%4===0?'quoth the raven':'authored form '+n;block.run(bid,'r'+r,text,text.length);segment.run('s'+n,'r'+r,bid,'segment-'+n,'logical-'+n,text,n%10===0?ids[0]:n%7===0?'unresolved-entity':ids[n%ids.length],n%9===0?'unresolved':'direct');}}
 }).immediate();report.entities.populationMs=performance.now()-populate;report.entities.shape={entities:10000,curatedImportedAliases:20000,resources:100,blocks:25000,segments:25000,highDegree:'every tenth segment targets one Entity',unresolvedDefinitions:'every ninth segment excluded',missingEntities:'every seventh target absent unless high-degree'};
 report.entities.sqlite=db.prepare('SELECT sqlite_version() AS version').get();db.close();
 queryWorker=new Worker(new URL('../../scripts/sqlite-p3a-query-worker.mjs',import.meta.url),{workerData:{file}});
 await new Promise<void>((resolve,reject)=>{queryWorker!.once('message',()=>resolve());queryWorker!.once('error',reject);});let sequence=0;const waiting=new Map<number,any>();queryWorker.on('message',m=>{const p=waiting.get(m.id);if(p){waiting.delete(m.id);m.error?p.reject(Error(m.error)):p.resolve(m);}});
 const roundtrip=(kind:string,ids?:string[])=>new Promise<any>((resolve,reject)=>{const id=++sequence;waiting.set(id,{resolve,reject});queryWorker!.postMessage({id,kind,ids});});
 server=http.createServer(async(req,res)=>{try{let data='';for await(const chunk of req)data+=chunk;if(data.length>100000)throw Error('benchmark request too large');const b=JSON.parse(data),t=performance.now(),r=await roundtrip(b.kind,b.ids);res.setHeader('Content-Type','application/json');res.end(JSON.stringify({...r,serviceMs:performance.now()-t}));}catch(e){res.statusCode=500;res.end(JSON.stringify({error:String(e)}));}});
 await new Promise<void>(r=>server!.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${(server.address() as any).port}`;report.entities.queries=[];
 for(const [kind,size]of [['exact',0],['prefix',0],['lexical',0],['substring',0],['mention',0],['guid',1],['guid',10],['guid',100],['guid',1000]] as Array<[string,number]>){
  const keys=ids.slice(0,size),q=entityQuery(kind,keys);db=new Database(file,{readonly:true,fileMustExist:true});const plan=db.prepare('EXPLAIN QUERY PLAN '+q.sql).all(...q.args);
  const statement=db.prepare(q.sql),first=performance.now(),cold=statement.all(...q.args),coldMs=performance.now()-first,raw=[];
  for(let n=0;n<20;n++){const t=performance.now();statement.all(...q.args);raw.push(performance.now()-t);}db.close();
  const worker=[],transport=[],serialization=[],httpTimes=[],clientDecode=[],workerSql=[];let firstWorker,firstHttpMs;
  for(let n=0;n<21;n++){const t=performance.now(),result=await roundtrip(kind,keys),elapsed=performance.now()-t,d=performance.now();JSON.parse(result.payload);const decode=performance.now()-d;if(n===0){firstWorker=elapsed;continue;}worker.push(elapsed);workerSql.push(result.metrics.sqlMs);serialization.push(result.metrics.serializationMs);transport.push(Math.max(0,elapsed-result.metrics.workerMs));clientDecode.push(decode);}
  for(let n=0;n<11;n++){const t=performance.now(),response=await fetch(url,{method:'POST',body:JSON.stringify({kind,ids:keys})});const r:any=await response.json();if(r.error)throw Error(r.error);JSON.parse(r.payload);const elapsed=performance.now()-t;if(!n)firstHttpMs=elapsed;else httpTimes.push(elapsed);}
  report.entities.queries.push({kind,batch:size||undefined,returned:cold.length,firstConnectionReadMs:coldMs,warmRaw:summary(raw),firstWorkerMs:firstWorker,warmWorker:summary(worker),workerSql:summary(workerSql),workerSerialize:summary(serialization),transportAndScheduling:summary(transport),clientPayloadDecode:summary(clientDecode),firstHttpMs,httpServiceRoundtrip:summary(httpTimes),plan});
 }
 await new Promise<void>(r=>server!.close(()=>r()));server=undefined;await queryWorker.terminate();queryWorker=undefined;
 for(const count of [100,1000,10000]){
  const folder=path.join(root,'blocks-'+count);await fs.mkdir(folder);client=await openSqliteFoundation({vault:folder,initialize:true});const index=createSavedIndexer(client,{root:folder});
  const buildStart=performance.now(),children=Array.from({length:count},(_,i)=>({id:'b'+i,type:i===0?'standoff-editor-block':'plain-text-block',text:i===0?'Edgar Allan Poe wrote poems.':`Paragraph ${i}: reading and writing.`}));
  const state=decodeBlockTree({id:'root',type:'document-block',metadata:{documentId:'resource',title:'A study'},children}).state;
  let resource:any=structuredClone(captureNative(state,'resource'));const rootContent=resource.contents[resource.placements[resource.rootPlacementKey].target.contentKey],plain=Object.values<any>(resource.contents).find(c=>c.payload.id==='b1'),annotated=Object.values<any>(resource.contents).find(c=>c.payload.id==='b0');
  const pair=new ManagedPair({root:folder,resourceId:'resource',nativeName:'study.mutable.json',markdownName:'study.md'});let baseline:any={nativeHash:null,markdownHash:null,generation:null};
  const publish=async()=>{const encode=performance.now(),native=nativeText(resource),encoded=performance.now(),md=exportMarkdown(resource),projected=performance.now(),generation={resourceId:'resource',generation:randomUUID(),native,markdown:md.text,profile:md.profile,targets:[]};const result=await pair.save(generation,undefined,baseline);if(result.phase!=='saved')throw Error(JSON.stringify(result));baseline={nativeHash:hash(native),markdownHash:hash(md.text),generation:generation.generation};return {nativeEncodeMs:encoded-encode,markdownMs:projected-encoded,filePublicationMs:performance.now()-projected,saveTotalMs:performance.now()-encode,bytes:Buffer.byteLength(native)};};
  const fixtureBuildMs=performance.now()-buildStart;
  const initialPublication=await publish();const seed=await index.refresh({mode:'full'});if(!seed.complete)throw Error(JSON.stringify(seed));
  const rows:any[]=[];const operations=count===100?['text','style','entity','add','delete','move']:['text','move'];
  for(const operation of operations){
   if(operation==='text')plain.payload.text+=' New words.';
   if(operation==='style')annotated.payload.standoffProperties=[{id:'bold',type:'bold',start:0,end:4}];
   if(operation==='entity')annotated.payload.standoffProperties.push({id:'mention',type:'codex/entity-reference',value:ids[0],start:0,end:14,metadata:{entityId:ids[0],entityName:'Edgar Allan Poe'}});
   if(operation==='add'){const pk='added-placement',ck='added-content';resource.contents[ck]={...structuredClone(plain),key:ck,payload:{id:'added',type:'plain-text-block',text:'New Block'}};resource.placements[pk]={...structuredClone(resource.placements[rootContent.children[1]]),key:pk,placementId:randomUUID(),target:{kind:'local',contentKey:ck}};rootContent.children.push(pk);}
   if(operation==='delete'){const pk=rootContent.children.pop();delete resource.contents[resource.placements[pk].target.contentKey];delete resource.placements[pk];}
   if(operation==='move'){const [pk]=rootContent.children.splice(1,1);rootContent.children.splice(Math.min(20,rootContent.children.length),0,pk);}
   const saved=await publish(),t=performance.now(),result=await index.refresh();if(!result.complete)throw Error(JSON.stringify(result));
   rows.push({operation,...saved,totalReconciliationMs:performance.now()-t,phases:result.timings,resources:result.reconciled});
  }
  const integrity=await client.verify();await client.close();client=undefined;
  let reached!:()=>void;const stageStarted=new Promise<void>(r=>reached=r);
  const host=new SqliteKnowledgeHost({root:folder,debounceMs:60000,indexer:(c:any,o:any)=>{const stage=c.stageSaved;c.stageSaved=(p:any,signal?:AbortSignal)=>{const work=stage(p,signal);reached();return work;};return createSavedIndexer(c,o);}});
  let foreground;
  try{await host.acquire('.');const refresh=host.flush();await stageStarted;foreground=await host.foreground(()=>host.store.lock(async()=>{plain.payload.text+=' Foreground.';return publish();}));await refresh;foreground={...foreground,coordination:host.metrics};}finally{await host.close();}
  report.resources.push({childBlocks:count,initialSetupAndFirstReconcileMs:seed.timings.totalMs+initialPublication.saveTotalMs,fixtureBuildMs,initialPublication,measurements:rows,verify:integrity,foregroundSaveDuringStage:foreground});
 }
 report.notes=['Cold = first read on a new connection; OS caches were not flushed. Warm raw 20 samples, HTTP 10.','Resource scenarios are single diagnostic samples, not p95 promises. Mostly plain-text Blocks; one standoff Block.','FTS trigger work is included in SQL mutation; no production triggers disabled for measurement.','Discovery and inspection decode the Resource before stage decodes/projects it again. Timings retain that work.','Mention prototype only admits direct authored assertions; unresolved linked definitions excluded. Missing Entity targets do not produce canonical rows. Live unsaved mentions not in SQLite.','No 100000-Block optional fixture; no P6 data generation or schema/query optimization.'];
 console.log(JSON.stringify(report,null,2));
}finally{await client?.close();await queryWorker?.terminate();if(server)await new Promise<void>(r=>server!.close(()=>r()));await fs.rm(root,{recursive:true,force:true});}
