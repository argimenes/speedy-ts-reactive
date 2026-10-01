/** Provisional repository-semantic qualification. No authored payload or membership cache. */
import {resourceSource} from './resource-identity';
import {selectDocumentRootPlacements} from './resource-registration';
import type {ContentRecord,RepositoryOperation,RepositoryState,Location} from './types';
import type {ReferenceBookkeeping} from './reference-bookkeeping';
export interface BoundaryValidation { error?:string; }
export interface BoundaryToken { readonly instance:symbol;readonly revision:number; }
export interface BoundaryVisits {contents:number;placements:number;incoming:number;wholeStateEnumerations:number;}
export type BoundaryResult = {status:'ready';rootContentKey:string;rootPlacementKey:string;retainedDefinitionKeys:readonly string[];token:BoundaryToken;visits:BoundaryVisits}
 | {status:'missing'|'ambiguous'|'invalid'|'unavailable';reason:string;visits:BoundaryVisits};
const identity=(c:ContentRecord|undefined)=>c?.viewType==='document-block'?(c.payload.metadata as any)?.documentId??c.payload.id:undefined;
const add=(m:Map<string,Set<string>>,key:string,value:string)=>{let set=m.get(key);if(!set)m.set(key,set=new Set());set.add(value);};
const remove=(m:Map<string,Set<string>>,key:string,value:string)=>{const set=m.get(key);set?.delete(value);if(!set?.size)m.delete(key);};
export class ResourceBoundaryBookkeeping {
 private readonly instance=Symbol('canonical repository');
 private identities=new Map<string,Set<string>>();private retained=new Map<string,Set<string>>();
 validation:BoundaryValidation={error:'Resource ownership not validated'};
 constructor(private references:ReferenceBookkeeping){}
 clear(){this.identities.clear();this.retained.clear();}
 add(c:ContentRecord){const id=identity(c);if(typeof id==='string')add(this.identities,id,c.key);if(c.definitionOwnerKey!==undefined)add(this.retained,c.definitionOwnerKey,c.key);}
 remove(c:ContentRecord){const id=identity(c);if(typeof id==='string')remove(this.identities,id,c.key);if(c.definitionOwnerKey!==undefined)remove(this.retained,c.definitionOwnerKey,c.key);}
 token(state:RepositoryState):BoundaryToken{return Object.freeze({instance:this.instance,revision:state.revision});}
 isCurrent(state:RepositoryState,token:BoundaryToken){return token.instance===this.instance&&token.revision===state.revision;}
 incoming(state:RepositoryState,token:BoundaryToken,key:string,location:(pk:string)=>Location|undefined){
  if(!this.isCurrent(state,token))throw Error('Stale repository boundary token');
  return this.references.owned(key).flatMap(pk=>{const p=state.placements[pk];return p&&!p.externalReference&&!p.resolvedReference?[Object.freeze({placementKey:pk,location:location(pk)&&structuredClone(location(pk))})]:[];});
 }
 read(state:RepositoryState,id:string):BoundaryResult {
  const visits:BoundaryVisits={contents:0,placements:0,incoming:0,wholeStateEnumerations:0};
  const content=(key:string)=>{visits.contents++;return state.contents[key];},placement=(key:string)=>{visits.placements++;return state.placements[key];};
  if(this.validation.error)return {status:'unavailable',reason:this.validation.error,visits};
  const candidates=this.identities.get(id);if(!candidates?.size)return {status:'missing',reason:'Missing canonical resource identity',visits};
  if(candidates.size!==1)return {status:'ambiguous',reason:'Ambiguous canonical resource identity',visits};
  const root=content(candidates.values().next().value!);
  try{
   if(resourceSource(root)?.resourceId!==id)throw Error('Invalid canonical resource identity');
   const incoming=[...new Set([...this.references.registrations(root.key),...this.references.owned(root.key)])].map(placement).filter(p=>p&&!p.externalReference);
   const roots=selectDocumentRootPlacements(incoming,root.key);
   if(roots.length!==1)throw Error('Ambiguous canonical root');
   const retained=[...this.retained.get(root.key)??[]],members=new Set<string>(),slots=new Set<string>([roots[0].key]),queue=[root.key,...retained],ids=new Set<string>();
   while(queue.length){
    const key=queue.pop()!;if(members.has(key))continue;const c=content(key);if(!c)throw Error('Missing owned content');members.add(key);
    if(c.definitionOwnerKey!==undefined&&c.definitionOwnerKey!==root.key)throw Error('Conflicting retained-definition owner');
    if(!['text-cell','image-cell'].includes(c.viewType)){
     if(typeof c.payload.id!=='string'||!c.payload.id.trim()||ids.has(c.payload.id))throw Error('Missing or duplicate Block identity');ids.add(c.payload.id);
    }
    for(const pk of [...c.children,...c.inlineContent,...Object.values(c.ownedRelations)]){
     slots.add(pk);const p=placement(pk);if(!p)throw Error('Missing canonical placement');
     if(p.kind==='reference'||p.externalReference||p.resolvedReference)continue;
     const child=content(p.contentKey);if(!child)throw Error('Missing owned target');
     if(child.viewType==='document-block'&&child.key!==root.key)continue;
     queue.push(child.key);
    }
   }
   for(const key of members){let owners=0;for(const pk of this.references.owned(key)){
    visits.incoming++;const p=placement(pk);if(p.resolvedReference||p.externalReference)continue;
    if(!slots.has(pk))throw Error('Content has an owner outside this resource');if(++owners>1)throw Error('Multiple canonical owners');
   }}
   return {status:'ready',rootContentKey:root.key,rootPlacementKey:roots[0].key,retainedDefinitionKeys:Object.freeze(retained),token:this.token(state),visits};
  }catch(e){return {status:'invalid',reason:String(e),visits};}
 }
}
/** Carry only the GLOBAL resource-ownership validation result across known-safe fast
 * mutations. Boundary membership is always read afresh. Hints alone are insufficient. */
export function preservesResourceOwnership(state:RepositoryState,ops:readonly RepositoryOperation[]):boolean {
 const created=new Map<string,ContentRecord>();for(const op of ops)if(op.kind==='put-content')created.set(op.record.key,op.record);
 for(const op of ops){
  if(op.kind==='set-root')return false;
  if(op.kind==='put-content'||op.kind==='remove-content'){
   const key=op.kind==='put-content'?op.record.key:op.key,before=state.contents[key],after=op.kind==='put-content'?op.record:undefined;
   // Existing fast recognizers prove sequences/retained edges; additionally exclude
   // resource roots and exotic inline hosts whose payload can alter identity/claims.
   if([before,after].some(c=>c&&!['text-cell','standoff-editor-block'].includes(c.viewType))){
    if(!before||!after||before.viewType!==after.viewType||identity(before)!==identity(after)||before.payload.id!==after.payload.id||JSON.stringify(resourceSource(before))!==JSON.stringify(resourceSource(after)))return false;
   }
   if(before&&after&&before.definitionOwnerKey!==after.definitionOwnerKey)return false;
   if(after?.definitionOwnerKey!==undefined&&!before&&(after.children.length||Object.keys(after.ownedRelations).length))return false;
  }else{
   const p=op.kind==='put-placement'?op.record:state.placements[op.key];
   if(!p||p.externalReference||p.resolvedReference||p.resourceRegistration)return false;
   const c=state.contents[p.contentKey]??created.get(p.contentKey);
   if(!c||!['text-cell','standoff-editor-block'].includes(c.viewType))return false;
  }
 }
 return true;
}
