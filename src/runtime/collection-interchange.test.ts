// @vitest-environment jsdom
import {it,expect,vi,afterEach} from 'vitest';
import {Blob as NodeBlob} from 'node:buffer';
import {CollectionInterchange} from './collection-interchange';
import type {CollectionJournal,JournalStore} from './collection-journal';
import {hash,bytes} from '../interchange/package/archive';
const file=(path:string,source='Text')=>({path,blob:new NodeBlob([source]) as unknown as Blob});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
function fixture(){
 vi.stubGlobal('Worker',undefined);vi.stubGlobal('navigator',{locks:{request:async(_key:string,_options:unknown,action:(lock:object)=>Promise<void>)=>action({})}});
 let journal:CollectionJournal|undefined,quota=false,scope={cavernId:'c',session:'s'},intercept:((body:any)=>Promise<void>)|undefined,drop=false;
 const saved=new Map<string,{native:string;resourceId:string;nativeHash:string}>(),generations:string[]=[],calls:string[]=[];
 const store:JournalStore={load:async()=>journal&&structuredClone(journal),save:async(_,value)=>{if(quota)throw Error('Quota refused');journal=structuredClone(value);},remove:async()=>{journal=undefined;}};
 vi.stubGlobal('fetch',vi.fn(async(url:string,options:any)=>{
  const body=JSON.parse(options.body),route=url.replace('/api/native/','');calls.push(route);let Data:any;
  if(route==='collection/inventory')Data={entries:[{path:'Imports',directory:true},...[...saved.keys()].map(path=>({path,directory:false}))]};
  else if(route==='open'){const value=saved.get([body.location.folder,body.location.filename].filter((s:string)=>s!=='.').join('/'));if(!value)return {ok:false,json:async()=>({Success:false,Error:'Missing destination'})};Data={kind:'native',...value,baseline:{nativeHash:value.nativeHash},pending:null};}
  else if(route==='vault/mkdir')Data={};
  else if(route==='save'){
   expect(journal?.pending?.generation).toEqual(body.generation);generations.push(body.generation.generation);
   if(intercept)await intercept(body);
   saved.set([body.location.folder,body.location.filename].filter((s:string)=>s!=='.').join('/'),{native:body.generation.native,resourceId:body.generation.resourceId,nativeHash:await hash(bytes(body.generation.native))});
   if(drop)throw Error('Lost acknowledgement');Data={result:{phase:'saved'},baseline:{nativeHash:await hash(bytes(body.generation.native))}};
  }else throw Error(route);
  return {ok:true,json:async()=>({Success:true,Data})};
 }));
 const editor={features:{documentInterchange:true},readAssetContext:()=>scope,assets:{}} as any;
 const service=()=>new CollectionInterchange(editor,'.',()=>true,store);
 return {service,calls,saved,generations,get journal(){return journal;},set quota(v:boolean){quota=v;},set scope(v:typeof scope){scope=v;},set drop(v:boolean){drop=v;},set intercept(v:typeof intercept){intercept=v;}};
}
it('review does not save; explicit batch saves independently, with journal-before-dispatch and no editor access',async()=>{const f=fixture(),s=f.service();await s.review([file('a.md'),file('b.md')],'Imports','native','keep');expect(s.plan()?.documents).toHaveLength(2);expect(f.generations).toEqual([]);await s.save();expect(s.plan()?.documents.map(d=>d.status)).toEqual(['completed','completed']);expect(f.journal?.pending).toBeUndefined();expect(f.calls.filter(c=>c==='save')).toHaveLength(2);});
it('restarts after lost acknowledgement using identical generation, verifies completed destinations and preserves later identities',async()=>{const f=fixture(),s=f.service(),files=[file('a.md'),file('b.md')];await s.review(files,'Imports','native','keep');const ids=s.plan()!.documents.map(d=>d.id);f.drop=true;await s.save();expect(f.journal?.pending).toBeDefined();expect(f.generations).toHaveLength(1);s.dispose();f.drop=false;const next=f.service();await next.review(files,'ignored','source','keep',true);await next.save();expect(next.plan()?.documents.map(d=>d.status)).toEqual(['completed','completed']);expect(next.plan()?.documents.map(d=>d.id)).toEqual(ids);expect(f.generations[1]).toBe(f.generations[0]);expect(f.generations).toHaveLength(3);});
it('cancellation preserves completed/uncertain files and stops later dispatches',async()=>{const f=fixture(),s=f.service();await s.review([file('a.md'),file('b.md')],'Imports','native','keep');f.intercept=async()=>{s.cancel();};await s.save();expect(f.generations).toHaveLength(1);expect(f.journal?.pending).toBeDefined();expect(s.plan()?.documents[1].status).toBe('pending');});
it('refuses writes if journaling fails and refuses changed source or destination on restart',async()=>{const f=fixture(),s=f.service();await s.review([file('a.md')],'Imports','native','keep');f.quota=true;await s.save();expect(f.generations).toEqual([]);f.quota=false;await s.save();expect(f.generations).toHaveLength(1);const next=f.service();await next.review([file('a.md','Changed')],'Imports','native','keep',true);expect(next.status()).toMatch(/changed/);expect(next.plan()).toBeUndefined();f.saved.get('Imports/a.ink')!.nativeHash='changed';await next.review([file('a.md')],'Imports','native','keep',true);expect(next.status()).toMatch(/changed/);expect(next.plan()).toBeUndefined();});
it('revalidates the Cavern and prevents competing stale plans after another importer advances',async()=>{const f=fixture(),a=f.service(),b=f.service(),files=[file('a.md'),file('b.md')];await a.review(files,'Imports','native','keep');f.drop=true;await a.save();await b.review(files,'Imports','native','keep',true);f.drop=false;await a.save();const count=f.generations.length;await b.save();expect(b.status()).toMatch(/another tab/);expect(f.generations).toHaveLength(count);f.scope={cavernId:'other',session:'other'};await a.save();expect(f.generations).toHaveLength(count);});
it('can skip a failed parse, then recover a later uncertain save without blocking on the earlier failure',async()=>{const f=fixture(),s=f.service(),files=[file('a.md','\0invalid'),file('b.md')];await s.review(files,'Imports','native','keep');f.drop=true;await s.save();expect(f.journal?.pending?.source).toBe('b.md');f.drop=false;const resumed=f.service();await resumed.review(files,'Imports','native','keep',true);await resumed.save();expect(resumed.plan()?.documents.find(d=>d.source==='b.md')?.status).toBe('completed');resumed.skip('a.md');await resumed.save();expect(f.journal?.plan.documents.map(d=>d.status)).toEqual(['skipped','completed']);});
it('retains exact pending bytes when the acknowledgement was received but its journal update failed',async()=>{
 const f=fixture(),s=f.service(),files=[file('a.md')];await s.review(files,'Imports','native','keep');f.intercept=async()=>{f.quota=true;};await s.save();expect(f.journal?.pending).toBeDefined();const generation=f.generations[0];f.quota=false;f.intercept=undefined;const resumed=f.service();await resumed.review(files,'Imports','native','keep',true);await resumed.save();expect(f.generations).toEqual([generation,generation]);expect(resumed.plan()?.documents[0].status).toBe('completed');
});
it('does no work with the shared flag disabled and refuses saves when Web Locks are unavailable',async()=>{
 const f=fixture(),s=f.service();await s.review([file('a.md')],'Imports','native','keep');vi.stubGlobal('navigator',{});await s.save();expect(s.status()).toMatch(/Web Locks/);expect(f.generations).toEqual([]);
 const disabled=new CollectionInterchange({features:{documentInterchange:false},readAssetContext:()=>{throw Error('must not run');}} as any,'.',()=>true);await disabled.review([file('a.md')],'Imports','native','keep');expect(disabled.plan()).toBeUndefined();
 const noNative=new CollectionInterchange({features:{documentInterchange:true,nativeDocumentPersistence:false}} as any,'.',()=>true);await noNative.review([file('a.md')],'Imports','native','keep');expect(noNative.status()).toMatch(/requires native/);expect(f.generations).toEqual([]);
});
it('can inspect and abandon remaining work without source access, but never discards an uncertain save',async()=>{
 const f=fixture(),s=f.service();await s.review([file('a.md','\0invalid'),file('b.md')],'Imports','native','keep');await s.save();expect(f.saved.size).toBe(1);const report=f.service();await report.reviewSaved();expect(report.canSave()).toBe(false);await report.abandon();expect(f.journal).toBeUndefined();expect(f.saved.size).toBe(1);
 await s.review([file('c.md')],'Imports','native','keep');f.drop=true;await s.save();const pending=f.service();await pending.reviewSaved();await pending.abandon();expect(pending.status()).toMatch(/unacknowledged/);expect(f.journal?.pending).toBeDefined();
});
