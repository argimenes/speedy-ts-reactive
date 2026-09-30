/** Isolated proof: lifetime belongs to the loaded canonical resource, not any occurrence. */
import {captureNative} from '../../persistence/native-resource';
import type {CanonicalRepository} from '../../block-tree/repository';
import {extract} from './extract';
import type {KnowledgeIndex} from './index';
export function liveOverlay(index:KnowledgeIndex,repository:CanonicalRepository,id:string,location:string,delay=30){
 const epoch=crypto.randomUUID();let members:Set<string>|undefined,timer:ReturnType<typeof setTimeout>|undefined,controller:AbortController|undefined,disposed=false,serial=0,pending:Promise<void>|undefined;
 let error='';
 const flush=()=>{
  clearTimeout(timer);controller?.abort();const request=++serial,abort=controller=new AbortController();
  if(disposed)return Promise.resolve();const revision=repository.state.revision;
  pending=(async()=>{try{const capture=captureNative(repository.readState(),id);members=new Set(Object.keys(capture.contents));
   const facts=await extract(capture,location,`live:${epoch}:${revision}`,abort.signal);
   if(!disposed&&request===serial&&repository.state.revision===revision){index.overlay(id,facts);error='';}
  }catch(e){if(!disposed&&request===serial){index.overlay(id,null);error=String(e);}}})();return pending;
 };
 const invalidate=()=>{serial++;controller?.abort();index.overlay(id,null);clearTimeout(timer);timer=setTimeout(()=>void flush(),delay);};
 const stop=repository.subscribeChanges(change=>{const keys=change.inlineOwner?[change.inlineOwner]:[...change.previousContents.keys()];if(!members||!index.effective.has(id)||keys.some(k=>members!.has(k)))invalidate();});
 invalidate();
 return {flush,get error(){return error;},get pending(){return pending;},dispose(){disposed=true;serial++;clearTimeout(timer);controller?.abort();stop();index.overlay(id,null);}};
}
