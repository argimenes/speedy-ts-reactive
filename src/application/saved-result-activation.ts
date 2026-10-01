import type {ReactiveEditor} from '../reactive-editor/editor';
import type {NativeDocumentSession} from '../persistence/native-session';
import type {DocumentVaultLease} from './document-vault';
import type {SavedSourceEvidence} from './facts-query-provider';
import {sameLocation} from '../knowledge/contribution-state';
import {policyKey} from '../knowledge/policy';
/** Application host authority, deliberately outside the Facts/query provider. */
export class SavedResultActivation {
 private serial=0;private alive=true;
 constructor(private editor:ReactiveEditor,private native:NativeDocumentSession,private vault:()=>DocumentVaultLease,private guard:()=>void){}
 dispose(){this.alive=false;this.serial++;}
 async prepare(evidence:SavedSourceEvidence,current:()=>boolean,signal?:AbortSignal){
  const serial=++this.serial,repository=this.editor.repository,vault=this.vault(),signature=vault.signature();let revision=repository.state.revision;
  const check=()=>{this.guard();signal?.throwIfAborted();if(!this.alive||serial!==this.serial||this.editor.repository!==repository||repository.state.revision!==revision||this.vault()!==vault||!vault.isAlive()||vault.signature()!==signature||policyKey({version:1,opaqueTypes:this.editor.registry.typesWithCapability('opaque-widget')})!==evidence.policy)throw Error('Selected activation is stale');};
  check();if(!current())throw Error('Saved result is stale');await vault.refresh();check();if(!current())throw Error('Saved result is stale');
  const row=vault.requireFile(evidence.location),native=this.native.knowledgeEvidence(evidence.resourceId);
  if(row.resourceId!==evidence.resourceId||row.baseline?.nativeHash!==evidence.byteHash||!['paired','unenrolled'].includes(row.state)||native.closed||native.admitting||native.pending||native.location&&!sameLocation(native.location,evidence.location))throw Error('Selected identity, binding or storage evidence changed');
  const boundary=await repository.readCanonicalResourceBoundaryCooperative(evidence.resourceId,{signal});check();
  if(boundary.status==='missing'){
   const admitted=await this.native.openVerified(evidence.location,evidence,check,signal,()=>vault.refresh());
   if(admitted.id!==evidence.resourceId)throw Error('Selected Open returned another identity');
   // Only this synchronous admitted Open may advance the activation revision.
   // Other query/result tokens remain expired; no global proof is refreshed.
   revision=admitted.revision;
  }else if(boundary.status!=='ready')throw Error('Canonical source is '+boundary.status);
  check();const binding=this.native.knowledgeEvidence(evidence.resourceId),epoch=binding.epoch;
  if(!binding.location||!sameLocation(binding.location,evidence.location)||binding.byteHash!==evidence.byteHash||binding.pending||binding.admitting)throw Error('Selected binding is not current');
  const ticket=()=>{try{check();const n=this.native.knowledgeEvidence(evidence.resourceId);return n.epoch===epoch&&!n.pending&&!n.admitting&&!n.closed;}catch{return false;}};
  const verify=async()=>{if(!ticket())throw Error('Selected navigation expired');await vault.refresh();await this.native.verifySelected(evidence.location,evidence,signal);if(!ticket())throw Error('Selected file changed before reveal');};
  return {current:ticket,verify};
 }
}
