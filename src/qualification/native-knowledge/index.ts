/** Session-only experiment. Maps are derived lookups, not identity/binding/ownership authorities. */
import type {Facts,Mention} from './extract';
export interface Hit {sourceId:string;mention:Mention}
const add=<T>(map:Map<string,Set<T>>,key:string,value:T)=>{let set=map.get(key);if(!set)map.set(key,set=new Set());set.add(value);};
const remove=<T>(map:Map<string,Set<T>>,key:string,value:T)=>{const set=map.get(key);set?.delete(value);if(!set?.size)map.delete(key);};
export class KnowledgeIndex {
 readonly saved=new Map<string,Facts>();readonly effective=new Map<string,Facts>();readonly overlays=new Map<string,Facts|null>();
 readonly tags=new Map<string,Set<string>>();readonly roots=new Map<string,Set<string>>();
 readonly outgoing=new Map<string,Hit[]>();readonly incomingRoots=new Map<string,Set<Hit>>();readonly entities=new Map<string,Set<Hit>>();
 readonly ambiguous=new Set<string>();revision=0;
 private hits=new Map<string,Hit[]>();
 putSaved(facts:Facts){if(this.ambiguous.has(facts.id))return;this.saved.set(facts.id,facts);if(!this.overlays.has(facts.id))this.replace(facts.id,facts);}
 rejectIdentity(id:string){this.ambiguous.add(id);this.saved.delete(id);this.replace(id);}
 overlay(id:string,facts:Facts|null){if(facts&&facts.id!==id)throw Error('Overlay identity mismatch');this.overlays.set(id,facts);this.replace(id,this.ambiguous.has(id)?undefined:facts??undefined);}
 /** Caller must explicitly verify hand-back; disposal never calls this. */
 restoreSaved(id:string){this.overlays.delete(id);this.replace(id,this.ambiguous.has(id)?undefined:this.saved.get(id));}
 private replace(id:string,facts?:Facts){
  const old=this.effective.get(id);if(old){for(const tag of old.tags)remove(this.tags,tag,id);remove(this.roots,old.rootBlockId,id);}
  for(const hit of this.hits.get(id)??[])remove(hit.mention.kind==='entity'?this.entities:this.incomingRoots,hit.mention.targetId,hit);
  this.hits.delete(id);this.outgoing.delete(id);this.effective.delete(id);
  if(facts){this.effective.set(id,facts);for(const tag of facts.tags)add(this.tags,tag,id);add(this.roots,facts.rootBlockId,id);
   const hits=facts.mentions.map(mention=>({sourceId:id,mention}));this.hits.set(id,hits);this.outgoing.set(id,hits.filter(h=>h.mention.kind==='document'));
   for(const hit of hits)add(hit.mention.kind==='entity'?this.entities:this.incomingRoots,hit.mention.targetId,hit);
  }this.revision++;
 }
 target(hit:Hit):string|undefined {
  const m=hit.mention;if(m.kind!=='document')return;
  if(m.targetResourceId){const doc=this.effective.get(m.targetResourceId);return doc?.rootBlockId===m.targetId?doc.id:undefined;}
  const roots=this.roots.get(m.targetId);return roots?.size===1?[...roots][0]:undefined;
 }
 backlinks(id:string){const root=this.effective.get(id)?.rootBlockId;return root?[...(this.incomingRoots.get(root)??[])].filter(h=>this.target(h)===id):[];}
 entityMentions(id:string){return [...(this.entities.get(id)??[])];}
 entitySources(id:string){return [...new Set(this.entityMentions(id).map(h=>h.sourceId))];}
 traverse(start:string,maxHops=3,maxNodes=250,maxEdges=1000){
  if(!Number.isSafeInteger(maxHops)||maxHops<0||!Number.isSafeInteger(maxNodes)||maxNodes<1||!Number.isSafeInteger(maxEdges)||maxEdges<1)throw Error('Invalid traversal budget');
  const seen=new Set<string>(),queue:Array<[string,number]>=[],edges:Array<[string,string,string]>=[];let unresolved=0,truncated=false;
  if(this.effective.has(start)){seen.add(start);queue.push([start,0]);}
  loop:for(let i=0;i<queue.length;i++){const[id,depth]=queue[i];if(depth===maxHops)continue;for(const hit of this.outgoing.get(id)??[]){if(edges.length===maxEdges){truncated=true;break loop;}const to=this.target(hit);if(!to){unresolved++;continue;}if(!seen.has(to)&&seen.size===maxNodes){truncated=true;break loop;}edges.push([id,to,hit.mention.id]);if(!seen.has(to)){seen.add(to);queue.push([to,depth+1]);}}}
  return {ids:[...seen],edges,unresolved,truncated,revision:this.revision};
 }
 coverage(){return {resources:this.effective.size,ambiguous:[...this.ambiguous],suppressed:[...this.overlays].filter(([,v])=>!v).map(([id])=>id),diagnostics:[...this.effective.values()].flatMap(f=>f.diagnostics.map(d=>`${f.id}: ${d}`))};}
}
