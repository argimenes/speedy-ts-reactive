/** P3 browser control only. No product provider selection. */
import {liveState} from './live-fixture';import {fixtureText} from './fixture';import {CanonicalRepository} from '../../block-tree/repository';import {TreeCommands} from '../../block-tree/commands';import {NativeKnowledgeHost} from '../../knowledge/session';import {DEFAULT_POLICY,policyKey} from '../../knowledge/policy';import {observeLive} from '../../knowledge/live-observer';import {ReactiveEditor} from '../../reactive-editor/editor';import {yieldTask} from '../../knowledge/scheduler';
const median=(a:number[])=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];
export async function setup(count:number,kind='ordinary'){
 let first:Uint8Array|undefined;
 if(kind!=='ordinary'){const v=JSON.parse(fixtureText(0,count)),root=v.document.blocks.find((b:any)=>b.id==='resource-0-root');if(kind==='cells')v.document.blocks.find((b:any)=>b.id==='resource-0-p0').inline=[{kind:'text',text:'🧭Writing beside the mountains. '.repeat(1600)}];else for(let i=v.document.blocks.length;i<10001;i++){v.document.blocks.push({id:'heavy-'+i,type:'plain-text-block',properties:{text:'Readable native text '+i}});root.children.push({placementId:'heavy-p-'+i,kind:'owned',target:{kind:'local',blockId:'heavy-'+i}});}first=new TextEncoder().encode(JSON.stringify(v));}
 let t=performance.now();const input=liveState(count,first),weak=new WeakRef(input.state),repository=new CanonicalRepository(input.state),constructionMs=performance.now()-t;
 const commands=new TreeCommands(repository,k=>k),s=repository.readState(),p=Object.values(s.contents).find(c=>c.payload.id==='resource-0-p0')!,pk=Object.values(s.placements).find(p1=>p1.contentKey===p.key)!.key;
 const rows=input.ids.map(resourceId=>({resourceId,state:'paired',location:{folder:'vault',filename:resourceId+'.mutable.json'},baseline:{nativeHash:'hash'}})),listeners=new Set<()=>void>();
 let saved:any;const port={root:'vault',snapshot:()=>({complete:true,documents:rows,operations:[]}),native:(id:string)=>({closed:false,pending:false,admitting:false,location:rows.find(r=>r.resourceId===id)!.location,byteHash:'hash'}),policy:()=>DEFAULT_POLICY,subscribe(l:()=>void){listeners.add(l);return()=>{listeners.delete(l);};},verifySaved:async()=>{if(!saved)throw Error('No qualified saved control');return saved;}};
 let host:NativeKnowledgeHost|undefined,lease:ReturnType<NativeKnowledgeHost['acquire']>|undefined;
 const attach=()=>{host=new NativeKnowledgeHost(repository,{debounceMs:60000});lease=host.acquire(port);};
 return {count,kind,weak,repository,constructionMs,
  async cold(){if(host)await host.dispose();attach();const t=performance.now();await host!.flush();return {elapsedMs:performance.now()-t,metrics:{...host!.metrics},coverage:lease!.coverage(),facts:(await lease!.prepare()).facts.length};},
  async input(enabled:boolean,query:'none'|'search'|'backlinks'){
   if(host){await host.dispose();host=undefined;lease=undefined;}if(enabled){attach();await host!.flush();}
   for(let i=0;i<35;i++)commands.replaceInlineRange(pk,0,1,i%2?'a':'b');const times:number[]=[];
   for(let i=0;i<100;i++){const start=performance.now();commands.replaceInlineRange(pk,0,1,i%2?'a':'b');times.push(performance.now()-start);}
   const synchronous=host?{...host.metrics}:undefined,start=performance.now();if(host)await host.flush();const refreshMs=performance.now()-start;
   let queryMs=0,resultCount=0;if(lease&&query!=='none'){const q=performance.now();const result=query==='search'?await lease.prepare():await lease.backlinks('resource-0');result.current();resultCount='facts'in result?result.facts.length:result.hits.length;queryMs=performance.now()-q;}
   return {enabled,query,medianMs:median(times),maxMs:Math.max(...times),synchronous,refreshMs,queryMs,resultCount,metrics:host?{...host.metrics}:undefined};
  },
  async heavyBaseline(){await host?.dispose();host=undefined;lease=undefined;const times=[];for(let i=0;i<4;i++){await yieldTask();const t=performance.now();commands.replaceInlineRange(pk,0,1,i%2?'a':'b');times.push(performance.now()-t);}return times;},
  async replacement(){const rounds=[];for(let i=0;i<4;i++){if(host)await host.dispose();attach();const t=performance.now();await host!.flush();rounds.push(performance.now()-t);}return {rounds,metrics:{...host!.metrics}};},
  async sharing(){if(!host)attach();await host!.flush();const before=host!.metrics.observations,second=host!.acquire(port);lease!.release();const facts=(await second.prepare()).facts.length;await host!.flush();lease=second;return {facts,additionalObservation:host!.metrics.observations-before};},
  async churn(rounds:number){if(!host)attach();for(let i=0;i<rounds;i++){commands.replaceInlineRange(pk,0,1,i%2?'a':'b');await host!.flush();}return {retainedBytes:host!.index.retainedBytes,maxRetainedBytes:host!.index.maxRetainedBytes,metrics:{...host!.metrics}};},
  async cycle(){if(host)await host.dispose();attach();await host!.flush();const bytes=host!.index.retainedBytes;lease!.release();await host!.flush();return {bytes,released:host!.index.retainedBytes};},
  async handback(){if(!host)attach();await host!.flush();const facts=(await lease!.prepare()).facts[0];saved={facts:structuredClone(facts),resourceId:facts.id,byteHash:'hash',location:rows[0].location,policy:policyKey(DEFAULT_POLICY)};const root=Object.values(repository.readState().contents).find(c=>c.payload.id==='resource-0-root')!;repository.commit('Explicit identity disappearance',[{kind:'put-content',record:{...root,payload:{...root.payload,metadata:{documentId:'absent-control'}}}}]);const suppressed=(await lease!.prepare()).facts.length;await host!.flush();const savedState=lease!.coverage().resources[0].state;repository.undo();const suppressedAgain=(await lease!.prepare()).facts.length;await host!.flush();return {suppressed,savedState,suppressedAgain,liveState:lease!.coverage().resources[0].state};},
  async release(){await host?.dispose();host=undefined;lease=undefined;},
 };
}
/** Actual ReactiveEditor constructor. Weak reference is only for GC observation;
 * the returned object deliberately does not retain the constructor state. */
export function editorLifetime(count:number,hold=false){
 const {state}=liveState(count),weak=new WeakRef(state),editor=new ReactiveEditor({state,references:[],issues:[],legacy:true});
 return {weak,editor,held:hold?state:undefined,dispose:()=>editor.dispose()};
}
export async function observeHeartbeat(action:()=>Promise<unknown>){
 const tasks:number[]=[],frames:number[]=[],gaps:number[]=[];let frame=0,lastFrame=performance.now(),last=performance.now(),done=false;
 const observer=new PerformanceObserver(list=>{for(const e of list.getEntries())tasks.push(e.duration);});observer.observe({entryTypes:['longtask']});
 const tick=(now:number)=>{frames.push(now-lastFrame);lastFrame=now;if(!done)frame=requestAnimationFrame(tick);};frame=requestAnimationFrame(tick);
 const timer=setInterval(()=>{const now=performance.now();gaps.push(now-last);last=now;},5),start=performance.now();
 try{const result=await action();await new Promise(r=>setTimeout(r,30));return {result,elapsedMs:performance.now()-start,longTasks:tasks,maxHeartbeatGapMs:Math.max(0,...gaps),maxFrameGapMs:Math.max(0,...frames),frames:frames.length};}finally{done=true;cancelAnimationFrame(frame);clearInterval(timer);observer.disconnect();}
}
export async function retainedBudget(){
 const {FactsIndex}=await import('../../knowledge/index'),fixture=await setup(1),facts=(await observeLive(fixture.repository,'resource-0',DEFAULT_POLICY)).facts,index=new FactsIndex(()=>0),scope={alive:true,epoch:0};let published=0,reason='';
 const providerTasks:number[]=[];const observer=new PerformanceObserver(list=>{for(const e of list.getEntries())providerTasks.push(e.duration);});observer.observe({entryTypes:['longtask']});
 const start=performance.now();try{for(let i=0;i<10000;i++){const copy=structuredClone(facts);copy.id='budget-'+i;copy.rootBlockId='budget-root-'+i;await index.publish(scope,copy,()=>{},yieldTask);published++;}}catch(e){reason=String(e);}
 const result={requested:10000,published,reason,budget:index.budget,retainedBytes:index.retainedBytes,elapsedMs:performance.now()-start};index.closeScope(scope);const t=performance.now();await index.sweep(yieldTask);await fixture.release();const cleanupMs=performance.now()-t;await new Promise(r=>setTimeout(r,30));observer.disconnect();return {...result,cleanupMs,released:index.retainedBytes,providerTasks};
}
/** Matched fresh repositories avoid comparing different journal/History phases
 * after thousands of edits on one continually ageing control repository. */
export async function freshInputPairs(count=150){
 const t=performance.now(),{state,ids}=liveState(count),fixtureMs=performance.now()-t,rows=ids.map(resourceId=>({resourceId,state:'paired',location:{folder:'vault',filename:resourceId+'.mutable.json'},baseline:{nativeHash:'hash'}})),results=[];
 for(let round=0;round<3;round++)for(const mode of ['none','search','backlinks'])for(const enabled of (round%2?[true,false]:[false,true])){
  const start=performance.now(),repository=new CanonicalRepository(state),constructionMs=performance.now()-start,commands=new TreeCommands(repository,k=>k),s=repository.readState(),p=Object.values(s.contents).find(c=>c.payload.id==='resource-0-p0')!,pk=Object.values(s.placements).find(p1=>p1.contentKey===p.key)!.key;
  const host=enabled?new NativeKnowledgeHost(repository,{debounceMs:60000}):undefined,lease=host?.acquire({root:'vault',snapshot:()=>({complete:true,documents:rows,operations:[]}),native:(id:string)=>({closed:false,admitting:false,pending:false,location:rows.find(r=>r.resourceId===id)!.location}),policy:()=>DEFAULT_POLICY,subscribe:()=>()=>{},verifySaved:async()=>{throw Error('No saved fallback');}});await host?.flush();
  for(let i=0;i<100;i++)commands.replaceInlineRange(pk,0,1,i%2?'a':'b');const times=[];for(let i=0;i<200;i++){const t=performance.now();commands.replaceInlineRange(pk,0,1,i%2?'a':'b');times.push(performance.now()-t);}
  const metrics=host?{...host.metrics}:undefined;await host?.flush();let queryMs=0;if(lease&&mode!=='none'){const t=performance.now();mode==='search'?await lease.prepare():await lease.backlinks('resource-0');queryMs=performance.now()-t;}
  results.push({round,mode,enabled,constructionMs,medianMs:median(times),maxMs:Math.max(...times),metrics,queryMs});await host?.dispose();await yieldTask();
 }return {count,fixtureMs,results};
}
