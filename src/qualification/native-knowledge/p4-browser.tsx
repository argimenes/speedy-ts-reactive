/** Qualification only: real repository/commands + production adapters/panels.
 * The scope is a deterministic read-only fixture. Full server/occurrence navigation
 * is exercised separately by check-flint-c3-browser with P4_FACTS=1. */
import {render} from 'solid-js/web';
import {liveState} from './live-fixture';
import {CanonicalRepository} from '../../block-tree/repository';
import {TreeCommands} from '../../block-tree/commands';
import {NativeKnowledgeHost} from '../../knowledge/session';
import {FactsQueryProvider} from '../../application/facts-query-provider';
import {FactsBacklinks} from '../../application/facts-backlinks';
import {CanonicalBacklinks} from '../../application/canonical-backlinks';
import {VaultKnowledge} from '../../application/vault-knowledge';
import type {DocumentVaultLease} from '../../application/document-vault';
import {BacklinksPanel} from '../../features/flint/backlinks-view';
import {KnowledgeView} from '../../features/flint/knowledge-view';
export {observeHeartbeat} from './p3-browser';
const delay=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const median=(v:number[])=>[...v].sort((a,b)=>a-b)[Math.floor(v.length/2)];
export async function setup(count:number,enabled:boolean){
 const t=performance.now(),{state,ids}=liveState(count),fixtureMs=performance.now()-t;
 const c=performance.now(),repository=new CanonicalRepository(state),constructionMs=performance.now()-c;
 const commands=new TreeCommands(repository,k=>k),paragraph=Object.values(repository.readState().contents).find(c=>c.payload.id==='resource-0-p0')!,placement=Object.values(repository.readState().placements).find(p=>p.contentKey===paragraph.key)!.key;
 const documents=ids.map(resourceId=>({resourceId,title:resourceId,state:'paired',location:{folder:'vault',filename:resourceId+'.mutable.json'}}));
 const scan={vault:'vault',folders:['vault'],documents,diagnostics:[],operations:[],markdown:[],readOnly:false,complete:true};
 const vault={root:'vault',snapshot:()=>scan,signature:()=> 'fixture',refresh:async()=>{},isAlive:()=>true,subscribe:()=>()=>{}} as unknown as DocumentVaultLease;
 const native={location:(id:string)=>documents.find(r=>r.resourceId===id)?.location,pendingVaultRelocations:()=>[]};
 const host=enabled?new NativeKnowledgeHost(repository,{loadedOnly:true}):undefined;
 const shared=host?{host,acquire:()=>host.acquire({root:'vault',snapshot:()=>scan,native:id=>({closed:false,admitting:false,pending:false,location:native.location(id)}),policy:()=>({version:1,opaqueTypes:[]}),subscribe:()=>()=>{},verifySaved:async()=>{throw Error('P4 cannot read saved resources');}})}:undefined;
 const panels:HTMLElement[]=[],disposers:Array<()=>void>=[],providers:FactsQueryProvider[]=[],searches:VaultKnowledge[]=[],backlinks:Array<FactsBacklinks|CanonicalBacklinks>=[];
 const query={vault:'vault',target:{documentId:'resource-0',blockId:'resource-0-root'}};
 function window(){
  const facts=shared?new FactsQueryProvider(shared):undefined;facts?.use(vault);if(facts)providers.push(facts);
  const search=new VaultKnowledge({repository,registry:{hasCapability:()=>false}} as any,native as any,{vault:()=>vault,guard:()=>{},active:()=>undefined,navigate:async()=>{throw Error('Navigation is qualified in the full host gate');}},undefined,facts);
  const service=facts?new FactsBacklinks(facts,()=>vault):new CanonicalBacklinks(repository,native,()=>vault);
  searches.push(search);backlinks.push(service);const panel=document.body.appendChild(document.createElement('div'));panel.style.cssText='display:inline-block;width:48%;height:650px;overflow:auto;vertical-align:top';panels.push(panel);
  disposers.push(render(()=><><KnowledgeView knowledge={search}/><BacklinksPanel backlinks={{service,target:()=>query,follow:async()=>{}}}/></>,panel));
 }
 window();
 const settle=async()=>{await host?.flush();await delay(350);await host?.flush();for(let i=0;i<100;i++){if(panels.every(p=>!p.textContent?.includes('Finding native references')))return;await delay(20);}throw Error('Panels did not settle');};
 const clickSearch=async(text:string)=>{
  const panel=panels[0],input=panel.querySelector<HTMLInputElement>('[aria-label="Search vault"]')!;input.value=text;input.dispatchEvent(new Event('input',{bubbles:true}));panel.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
  for(let i=0;i<400;i++){const expected=panel.textContent?.match(/(\d+) results ·/);if(expected&&panel.querySelectorAll('.flint-search-hit').length===Number(expected[1]))return Number(expected[1]);if(!expected&&!panel.textContent?.includes('Searching loaded'))throw Error('Search failed: '+panel.textContent?.slice(0,200));await delay(10);}throw Error('Search timed out');
 };
 return {count,enabled,fixtureMs,constructionMs,
  async cold(){const start=performance.now();await settle();return {elapsedMs:performance.now()-start,mentions:panels[0].querySelectorAll('.flint-backlink').length,panelStatus:panels[0].querySelector('.flint-backlinks')?.textContent,metrics:host?{...host.metrics}:undefined,retainedBytes:host?.index.retainedBytes};},
  async search(){const start=performance.now(),hits=await clickSearch('mountains');return {elapsedMs:performance.now()-start,hits};},
  async sharing(){const before=host?.metrics.observations,bytes=host?.index.retainedBytes;window();await settle();return {additionalObservations:host?host.metrics.observations-before!:undefined,bytesBefore:bytes,bytesAfter:host?.index.retainedBytes,panelStatus:panels.map(p=>p.querySelector('.flint-backlinks')?.textContent),mentions:panels.map(p=>p.querySelectorAll('.flint-backlink').length)};},
  async input(){const samples=[];for(let i=0;i<20;i++)commands.replaceInlineRange(placement,0,1,i%2?'L':'l');await settle();for(let i=0;i<100;i++){const t=performance.now();commands.replaceInlineRange(placement,0,1,i%2?'L':'l');samples.push(performance.now()-t);}const synchronous=host?{...host.metrics}:undefined,start=performance.now();await host?.flush();const refreshMs=performance.now()-start;await settle();return {medianMs:median(samples),maxMs:Math.max(...samples),synchronous,refreshMs,metrics:host?{...host.metrics}:undefined,mentions:panels.map(p=>p.querySelectorAll('.flint-backlink').length)};},
  async lifetime(){
   if(!host)return;
   let prepared:Awaited<ReturnType<FactsQueryProvider['prepare']>>|undefined=await providers[0].prepare(vault);
   const weak=new WeakRef(prepared.sources[0].facts),old=await backlinks[0].query(query);prepared=undefined;
   commands.replaceInlineRange(placement,0,1,'L');await host.flush();await settle();
   return {weak,current:()=>backlinks[0].current(old)};
  },
  async cancel(){const t=performance.now(),pending=searches[0].search('mountains');searches[0].cancel();let cancelled=false;try{await pending;}catch{cancelled=true;}return {elapsedMs:performance.now()-t,cancelled};},
  async release(){const t=performance.now();for(const d of disposers)d();for(const s of searches)s.dispose();for(const b of backlinks)b.dispose();for(const p of providers)p.dispose();for(const p of panels)p.remove();await host?.dispose();return {elapsedMs:performance.now()-t,retainedBytes:host?.index.retainedBytes};},
 };
}
