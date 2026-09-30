/** Qualification only. Canonical lifetime; no occurrence, save or binding authority. */
import type {CanonicalRepository} from '../../block-tree/repository';
import {LiveFactsObserver,type LiveScope} from './live-adapter';
import type {KnowledgeIndex} from './index';
export function observedOverlay(index:KnowledgeIndex,repository:CanonicalRepository,scope:LiveScope,id:string,delay=30){
 const observer=new LiveFactsObserver(repository,scope),epoch=crypto.randomUUID();
 let timer:ReturnType<typeof setTimeout>|undefined,controller:AbortController|undefined,disposed=false,serial=0,error='',pending:Promise<void>|undefined,members:Set<string>|undefined;
 const suppress=()=>{serial++;controller?.abort();index.overlay(id,null);clearTimeout(timer);};
 const flush=()=>{
  suppress();if(disposed)return Promise.resolve();const request=serial,abort=controller=new AbortController(),revision=repository.state.revision;
  pending=(async()=>{try{
   const result=await observer.observe(id,`live:${epoch}:${revision}`,abort.signal);
   if(!disposed&&request===serial&&repository.state.revision===result.revision&&scope.signature()===result.signature){members=result.members;index.overlay(id,result.facts);error='';}
  }catch(e){if(!disposed&&request===serial){index.overlay(id,null);error=String(e);}}})();return pending;
 };
 // Scope/binding/discovery callers explicitly notify here, independently of repository commits.
 const invalidate=()=>{if(disposed)return;suppress();timer=setTimeout(()=>void flush(),delay);};
 const stop=repository.subscribeChanges(change=>{
  // Only certified unrelated inline edits preserve a published contribution.
  // Structural edits may change identity, ownership or foreign provenance anywhere.
  if(!change.inlineOwner||repository.readState().contents[change.inlineOwner]?.viewType!=='standoff-editor-block'||!members||!index.effective.has(id)||members.has(change.inlineOwner))invalidate();
 });
 invalidate();
 return{flush,invalidate,get error(){return error;},get pending(){return pending;},dispose(){if(disposed)return;disposed=true;suppress();stop();observer.dispose();}};
}
