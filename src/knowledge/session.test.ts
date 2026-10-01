import {it,expect,vi} from 'vitest';import {NativeKnowledgeHost} from './session';import {DEFAULT_POLICY,policyKey} from './policy';import type {KnowledgeScope,Discovery,NativeEvidence,VerifiedSaved} from './contribution-state';import {liveFixture} from '../qualification/native-knowledge/live-fixture';import {observeLive} from './live-observer';import {FactsIndex} from './index';
const pause=async()=>{};
async function setup(options:ConstructorParameters<typeof NativeKnowledgeHost>[1]={}){
 const f=liveFixture(),listeners=new Set<()=>void>(),location={folder:'vault',filename:f.id+'.mutable.json'};
 let scan:Discovery={complete:true,documents:[{resourceId:f.id,state:'paired',location,baseline:{nativeHash:'hash'}}],operations:[]},native:NativeEvidence={closed:false,admitting:false,pending:false,location,byteHash:'hash'},policy=DEFAULT_POLICY;
 const saved=(await observeLive(f.repository,f.id,policy,{yieldControl:pause})).facts;
 const verify=vi.fn(async():Promise<VerifiedSaved>=>({facts:structuredClone(saved),resourceId:f.id,byteHash:'hash',location,policy:policyKey(policy)}));
 const port:KnowledgeScope={root:'vault',snapshot:()=>scan,native:()=>native,policy:()=>policy,subscribe(l){listeners.add(l);return()=>{listeners.delete(l);};},verifySaved:verify};
 const subscription=vi.spyOn(f.repository,'subscribeChanges'),host=new NativeKnowledgeHost(f.repository,{debounceMs:60000,yieldControl:pause,...options}),lease=host.acquire(port);
 const root=()=>Object.values(f.repository.readState().contents).find(c=>c.payload.id==='resource-0-root')!;
 const disappear=()=>{const c=root();f.repository.commit('Disappear',[{kind:'put-content',record:{...c,payload:{...c.payload,metadata:{documentId:'elsewhere'}}}}]);};
 const edit=()=>{const c=Object.values(f.repository.readState().contents).find(c=>c.viewType==='text-cell')!;f.repository.commit('Edit',[{kind:'put-content',record:{...c,payload:{...c.payload,text:'x'}}}]);};
 return {f,host,lease,port,verify,subscription,disappear,edit,notify:()=>listeners.forEach(l=>l()),scan:()=>scan,setScan:(v:Discovery)=>scan=v,setNative:(v:Partial<NativeEvidence>)=>native={...native,...v},setPolicy:()=>policy={version:1,opaqueTypes:['standoff-editor-block']}};
}
it('shares one repository subscription and resource contribution across two Window leases',async()=>{
 const x=await setup(),second=x.host.acquire(x.port);try{await x.host.flush();expect(x.subscription).toHaveBeenCalledTimes(1);expect(x.host.metrics.observations).toBe(1);const before=await x.lease.prepare();expect(before.facts).toHaveLength(1);x.lease.release();expect(()=>before.current()).toThrow(/closed/);expect((await second.prepare()).facts).toHaveLength(1);expect(x.host.index.retainedBytes).toBeGreaterThan(0);second.release();await x.host.flush();expect(x.host.index.retainedBytes).toBe(0);expect(x.f.repository.readCanonicalResourceBoundary(x.f.id).status).toBe('ready');}finally{await x.host.dispose();}
});
it('suppresses immediately on an edit, rejects spanning queries, and does no traversal or cleanup in the callback',async()=>{
 const x=await setup();try{await x.host.flush();const result=await x.lease.prepare(),remove=vi.spyOn(x.host.index,'retire'),observe=vi.spyOn(x.f.repository,'readCanonicalResourceBoundaryCooperative');const bytes=x.host.index.retainedBytes;
 x.edit();expect(remove).not.toHaveBeenCalled();expect(observe).not.toHaveBeenCalled();expect(x.host.index.retainedBytes).toBe(bytes);expect(()=>result.current()).toThrow(/Stale/);expect((await x.lease.prepare()).facts).toHaveLength(0);await x.host.flush();expect((await x.lease.prepare()).facts).toHaveLength(1);expect(x.verify).not.toHaveBeenCalled();}finally{await x.host.dispose();}
});
it('hand-back verifies bytes after disappearance; reappearance suppresses saved even on live failure',async()=>{
 const x=await setup();try{await x.host.flush();x.disappear();expect((await x.lease.prepare()).facts).toHaveLength(0);expect(x.verify).not.toHaveBeenCalled();await x.host.flush();expect(x.verify).toHaveBeenCalledTimes(1);expect(x.lease.coverage().resources[0].state).toBe('saved-ready');x.f.repository.undo();x.setNative({pending:true});x.notify();expect((await x.lease.prepare()).facts).toHaveLength(0);await x.host.flush();expect(x.lease.coverage().resources[0].state).toBe('unavailable');expect(x.verify).toHaveBeenCalledTimes(1);}finally{await x.host.dispose();}
});
it.each(['incomplete','duplicate','changed','pending operation','admitting','closed','binding move','binding hash','read failure','stale hash','wrong identity','wrong facts identity','wrong location','wrong policy','no hash','unavailable boundary','ambiguous boundary','invalid boundary'])('hand-back retains suppression on %s',async cause=>{
 const x=await setup();try{await x.host.flush();x.disappear();const scan=x.scan();
 if(cause==='incomplete')x.setScan({...scan,complete:false});if(cause==='duplicate')x.setScan({...scan,documents:[...scan.documents,...scan.documents]});if(cause==='changed')x.setScan({...scan,documents:scan.documents.map(r=>({...r,state:'changed'}))});if(cause==='pending operation')x.setScan({...scan,operations:[{phase:'pending'}]});
 if(cause==='admitting')x.setNative({admitting:true});if(cause==='closed')x.setNative({closed:true});if(cause==='binding move')x.setNative({location:{folder:'vault',filename:'moved.mutable.json'}});if(cause==='binding hash')x.setNative({byteHash:'external'});if(cause==='no hash')x.setScan({...scan,documents:scan.documents.map(r=>({...r,baseline:undefined}))});
 if(cause==='read failure')x.verify.mockRejectedValue(Error('worker crashed'));
 for(const field of ['byteHash','resourceId','facts','location','policy'] as const){const target={byteHash:'stale hash',resourceId:'wrong identity',facts:'wrong facts identity',location:'wrong location',policy:'wrong policy'}[field];if(cause===target){const original=await x.verify();(original as any)[field]=field==='facts'?{...original.facts,id:'other'}:field==='location'?{folder:'vault',filename:'moved.mutable.json'}:'other';x.verify.mockResolvedValue(original);}}
 if(cause.endsWith(' boundary'))vi.spyOn(x.f.repository,'readCanonicalResourceBoundaryCooperative').mockResolvedValue({status:cause.split(' ')[0] as 'unavailable'|'invalid'|'ambiguous',reason:'qualification'});
 x.notify();await x.host.flush();expect((await x.lease.prepare()).facts).toHaveLength(0);expect(x.lease.coverage().complete).toBe(false);expect(x.lease.coverage().resources[0].error).toBeTruthy();}finally{await x.host.dispose();vi.restoreAllMocks();}
});
it.each(['admission','policy','binding','discovery','reappearance','dispose'])('rejects asynchronous hand-back completion spanning %s',async change=>{
 const x=await setup();let finish!:()=>void,entered!:()=>void;const gate=new Promise<void>(r=>finish=r),started=new Promise<void>(r=>entered=r);try{await x.host.flush();x.disappear();const original=await x.verify();x.verify.mockImplementation(async()=>{entered();await gate;return original;});const pending=x.host.flush();await started;
 let disposal:Promise<void>|undefined;if(change==='admission')x.setNative({admitting:true});if(change==='policy')x.setPolicy();if(change==='binding')x.setNative({location:{folder:'vault',filename:'moved.mutable.json'}});if(change==='discovery')x.setScan({...x.scan(),complete:false});if(change==='reappearance')x.f.repository.undo();if(change==='dispose')disposal=x.host.dispose();else x.notify();finish();await pending;await disposal;if(change!=='dispose')expect((await x.lease.prepare()).facts).toHaveLength(0);expect(x.host.index.retainedBytes).toBe(0);}finally{finish();await x.host.dispose();}
});
it('keeps query cancellation separate from resource work and permits read-only derived Facts',async()=>{
 const x=await setup();try{const controller=new AbortController();controller.abort();await expect(x.lease.prepare(controller.signal)).rejects.toThrow();await x.host.flush();expect((await x.lease.prepare()).facts).toHaveLength(1);expect(x.verify).not.toHaveBeenCalled();}finally{await x.host.dispose();}
});
it('budget failures preserve live suppression and cleanup, never fallback',async()=>{
 const x=await setup({factsBudget:1024});try{await x.host.flush();expect(x.lease.coverage().complete).toBe(false);expect(x.lease.coverage().resources[0].error).toMatch(/budget/);expect(x.verify).not.toHaveBeenCalled();expect(x.host.index.retainedBytes).toBe(0);x.edit();await x.host.flush();expect(x.verify).not.toHaveBeenCalled();}finally{await x.host.dispose();}
});
it('truthfully limits queue coverage and does not silently omit unknown discovery',async()=>{
 const x=await setup({maxResources:1});try{x.setScan({...x.scan(),documents:[...x.scan().documents,{resourceId:'second',state:'unenrolled',location:{folder:'vault',filename:'second.mutable.json'}}]});x.notify();await x.host.flush();expect(x.lease.coverage().complete).toBe(false);expect(x.lease.coverage().diagnostic).toMatch(/queue budget/);}finally{await x.host.dispose();}
});
it('does not eagerly call the single-resource saved route per discovered resource',async()=>{
 const x=await setup();try{x.disappear();await x.host.flush();expect(x.verify).not.toHaveBeenCalled();expect(x.lease.coverage().complete).toBe(false);x.lease.requestSaved(x.f.id);await x.host.flush();expect(x.verify).toHaveBeenCalledTimes(1);expect(x.lease.coverage().resources[0].state).toBe('saved-ready');}finally{await x.host.dispose();}
});
it('reclaims cancelled staged indexes and invalidates large lookups during yielding',async()=>{
 let epoch=0;const index=new FactsIndex(()=>epoch),scope={alive:true,epoch:0},x=await setup();try{const facts=(await observeLive(x.f.repository,x.f.id,DEFAULT_POLICY,{yieldControl:pause})).facts;facts.mentions=Array.from({length:2000},(_,i)=>({...facts.mentions[0],id:String(i),kind:'document',targetId:facts.rootBlockId,targetResourceId:facts.id}));let turns=0;const e=await index.publish(scope,facts,()=>{},pause);expect(index.retainedBytes).toBeGreaterThan(0);
 await expect(index.backlinks(scope,facts.id,async()=>{if(++turns===1)epoch++;})).rejects.toThrow(/Stale/);expect(index.eligible(e)).toBe(false);index.closeScope(scope);await index.sweep(pause);expect(index.retainedBytes).toBe(0);
 const scope2={alive:true,epoch:0};let checks=0;await expect(index.publish(scope2,facts,()=>{if(++checks>90)throw Error('cancel');},pause)).rejects.toThrow();await index.sweep(pause);expect(index.retainedBytes).toBe(0);
 }finally{await x.host.dispose();}
});
it('repeated editing and cleanup retains one current generation; repository replacement owns fresh evidence',async()=>{
 const x=await setup();try{await x.host.flush();const base=x.host.index.retainedBytes;for(let i=0;i<12;i++){x.edit();await x.host.flush();expect(x.host.index.retainedBytes).toBeLessThan(base*1.1);}const old=await x.lease.prepare();await x.host.dispose();expect(()=>old.current()).toThrow();expect(x.host.index.retainedBytes).toBe(0);const y=await setup();try{await y.host.flush();expect((await y.lease.prepare()).facts).toHaveLength(1);}finally{await y.host.dispose();}}finally{await x.host.dispose();}
});
it('a stalled saved verification is cancelled by the resource deadline without restoring stale Facts',async()=>{
 const x=await setup({maxResourceMs:100});try{await x.host.flush();x.disappear();x.port.verifySaved=async(_row,_policy,signal)=>new Promise((_,reject)=>{signal.addEventListener('abort',()=>reject(signal.reason),{once:true});});await x.host.flush();expect(x.lease.coverage().resources[0].error).toMatch(/deadline/);expect((await x.lease.prepare()).facts).toHaveLength(0);}finally{await x.host.dispose();}
});
it('incomplete live Facts remain searchable and suppress saved reference certainty',async()=>{
 const x=await setup();try{const p=Object.values(x.f.repository.readState().contents).find(c=>c.payload.id==='resource-0-p0')!;x.f.repository.commit('Unresolved',[{kind:'put-content',record:{...p,payload:{...p.payload,standoffProperties:[{id:'unknown',annotationId:'absent',start:0,end:2}]}}}]);await x.host.flush();expect(x.lease.coverage().resources[0].state).toBe('live-incomplete');expect(x.lease.coverage().complete).toBe(false);expect((await x.lease.prepare()).facts[0].blocks.some(b=>!!b.text)).toBe(true);expect(x.verify).not.toHaveBeenCalled();}finally{await x.host.dispose();}
});
it('cancelled index insertion reclaims staging that was already charged',async()=>{
 const x=await setup(),index=new FactsIndex(()=>0),scope={alive:true,epoch:0};try{const facts=(await observeLive(x.f.repository,x.f.id,DEFAULT_POLICY,{yieldControl:pause})).facts;facts.mentions=Array.from({length:2000},(_,i)=>({...facts.mentions[0],id:String(i)}));let cancel=false;await expect(index.publish(scope,facts,()=>{if(cancel)throw Error('cancel staging');},async()=>{if(index.retainedBytes)cancel=true;})).rejects.toThrow(/cancel staging/);expect(index.retainedBytes).toBeGreaterThan(0);expect((await index.prepare(scope,pause)).facts).toHaveLength(0);await index.sweep(pause);expect(index.retainedBytes).toBe(0);}finally{await x.host.dispose();}
});
