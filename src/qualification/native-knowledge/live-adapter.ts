/** Qualification-only canonical observer. No persistence capture, DTO, view or admission. */
import type {CanonicalRepository} from '../../block-tree/repository';
import type {RepositoryState} from '../../block-tree/types';
import {findResource,resourceSource} from '../../block-tree/resource-identity';
import {documentRootPlacements,resourceOwnership} from '../../block-tree/resource-registration';
import {vaultContains,vaultPath,type VaultDiscovery,type VaultLocation} from '../../application/document-vault';
import {collectFacts,type ObservationPolicy} from './extract';
export interface LiveScope {
 root:string;snapshot():VaultDiscovery;signature():string;binding(id:string):VaultLocation|undefined;pending():boolean;
 opaque(type:string):boolean;
}
interface Proof {root:string;placement:string;retained:string[];owners:Map<string,string[]>;epoch:number}
export class LiveFactsObserver {
 private alive=true;private epoch=0;private proofs=new Map<string,Proof>();private stop:()=>void;
 constructor(private repository:CanonicalRepository,private scope:LiveScope){
  this.stop=repository.subscribeChanges(change=>{
   // The hint proves structural fields unchanged, NOT arbitrary payload unchanged.
   // Document identity/retention cannot change through a standoff leaf edit.
   if(!change.inlineOwner||repository.readState().contents[change.inlineOwner]?.viewType!=='standoff-editor-block'){this.epoch++;this.proofs.clear();}
  });
 }
 dispose(){this.alive=false;this.stop();this.proofs.clear();}
 async observe(id:string,generation:string,signal?:AbortSignal){
  const started=performance.now(),state=this.repository.readState(),revision=state.revision,signature=this.scope.signature(),initialBinding=this.scope.binding(id),boundPath=initialBinding&&vaultPath(initialBinding);
  const check=()=>{signal?.throwIfAborted();if(!this.alive||this.repository.state.revision!==revision||this.scope.signature()!==signature||this.scope.pending()||(this.scope.binding(id)&&vaultPath(this.scope.binding(id)!))!==boundPath)throw Error('Live source stale, unavailable or disposed');};check();
  const scan=this.scope.snapshot(),rows=scan.documents.filter(d=>d.resourceId===id),binding=this.scope.binding(id);
  if(!scan.complete||rows.length!==1||!binding||!vaultContains(this.scope.root,vaultPath(rows[0].location))||vaultPath(binding)!==vaultPath(rows[0].location)||!['paired','unenrolled'].includes(rows[0].state))throw Error('Live source unavailable or ambiguous');
  const location=vaultPath(binding),selectionMs=performance.now()-started;let t=performance.now(),proof=this.proofs.get(id);const proofReused=!!proof;
  const boundary=this.repository.hasResourceBoundaryEvidence?this.repository.readCanonicalResourceBoundary(id):undefined;
  if(boundary&&boundary.status!=='ready')throw Error(boundary.reason);
  if(boundary?.status==='ready')proof={root:boundary.rootContentKey,placement:boundary.rootPlacementKey,retained:[...boundary.retainedDefinitionKeys],owners:new Map(),epoch:this.epoch};
  if(!proof){
   const root=findResource(state,{scope:'document',resourceId:id});if(!root)throw Error('Missing canonical identity');
   const roots=documentRootPlacements(state,root.key);if(roots.length!==1)throw Error('Ambiguous canonical root');
   resourceOwnership(state); // Existing semantic resource ownership rules; never inferred from registration.
   const retained=Object.values(state.contents).filter(c=>c.definitionOwnerKey===root.key).map(c=>c.key),owners=new Map<string,string[]>();
   for(const p of Object.values(state.placements))if(p.kind!=='reference'&&!p.resolvedReference&&!p.externalReference&&!['text-cell','image-cell'].includes(state.contents[p.contentKey]?.viewType))owners.set(p.contentKey,[...(owners.get(p.contentKey)??[]),p.key]);
   proof={root:root.key,placement:roots[0].key,retained,owners,epoch:this.epoch};check();
  }
  const eligibilityMs=performance.now()-t; t=performance.now();
  const root=state.contents[proof.root];if(!root||resourceSource(root)?.resourceId!==id)throw Error('Canonical source disappeared');
  const local:RepositoryState={revision,rootPlacementKey:proof.placement,contents:Object.create(null),placements:Object.create(null)};
  const members=new Set<string>(),seenPlacements=new Set<string>(),queue=[proof.placement],retained=[...proof.retained];
  let visits=0;
  const ownContent=(key:string)=>{
   const c=state.contents[key];if(!c)throw Error('Missing owned content');
   if(c.definitionOwnerKey!==undefined&&c.definitionOwnerKey!==root.key)throw Error('Conflicting definition membership');
   local.contents[key]=c;members.add(key);return c;
  };
  while(queue.length||retained.length){
   if(++visits%256===0){await new Promise(r=>setTimeout(r,0));check();}
   if(!queue.length){const key=retained.pop()!;if(members.has(key))continue;const c=ownContent(key);queue.push(...c.children,...c.inlineContent,...Object.values(c.ownedRelations));continue;}
   const pk=queue.pop()!;if(seenPlacements.has(pk))continue;seenPlacements.add(pk);
   const p=state.placements[pk];if(!p)throw Error('Missing canonical placement');
   if(pk===proof.placement)local.placements[pk]={...p,kind:'owned',resourceRegistration:undefined};
   else if(p.externalReference||p.resolvedReference||p.kind==='reference'){local.placements[pk]=p;continue;}
   else {
    const c=state.contents[p.contentKey];
    if(c?.viewType==='document-block'){
     local.placements[pk]={...p,contentKey:`unresolved:${pk}`,externalReference:{kind:'block',targetId:String(c.payload.id),source:resourceSource(c)!,version:{kind:'unpinned'}}};continue;
    }
    local.placements[pk]=p;
   }
   if(members.has(p.contentKey))continue;const c=ownContent(p.contentKey);queue.push(...c.children,...c.inlineContent,...Object.values(c.ownedRelations));
  }
  const traversalMs=performance.now()-t;t=performance.now();const blockIds=new Set<string>();
  for(const key of members){
   const c=local.contents[key];let incoming=proof.owners.get(key)??[];
   if(c.viewType!=='text-cell'&&c.viewType!=='image-cell'){
    const blockId=c.payload.id;if(typeof blockId!=='string'||!blockId.trim()||blockIds.has(blockId))throw Error('Missing or duplicate canonical Block identity');blockIds.add(blockId);
   }
   if(boundary?.status==='ready')incoming=this.repository.incomingOwnedPlacements(boundary.token,key).map(p=>p.placementKey);
   else if(c.viewType==='text-cell'||c.viewType==='image-cell'){
    if(this.repository.contentReferenceCount(key)===1)continue;
    incoming=Object.values(state.placements).filter(p=>p.contentKey===key&&p.kind!=='reference'&&!p.externalReference&&!p.resolvedReference).map(p=>p.key);
   }
   if(incoming.length>1||incoming.some(pk=>!local.placements[pk]))throw Error('Multiple or outside canonical owners');
  }
  check();if(!proofReused){proof.owners=new Map([...proof.owners].filter(([key])=>members.has(key)));this.proofs.set(id,proof);}
  const membershipMs=performance.now()-t;t=performance.now();const phases={textMs:0,annotationsMs:0};
  const policy:ObservationPolicy={check,opaque:this.scope.opaque,timings:phases};
  const facts=await collectFacts(local,id,location,generation,signal,undefined,policy);check();
  const factsMs=performance.now()-t;
  return {facts,members,revision,signature,proofReused,timings:{selectionMs,eligibilityMs,traversalMs,membershipMs,...phases,factsConstructionMs:Math.max(0,factsMs-phases.textMs-phases.annotationsMs),factsMs,totalMs:performance.now()-started}};
 }
}
