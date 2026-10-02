/** Verified SQL saved adapter; application composition owns provider selection. */
import {SavedFactsClient} from './saved-facts-client';
import type {DiscoveryRow} from '../knowledge/contribution-state';
import {policyKey,type ExtractionPolicy} from '../knowledge/policy';
export class SqliteSavedFactsClient extends SavedFactsClient {
 protected endpoint='/api/sqlite/knowledge/facts/';
 private lease?:string;private proof?:string;private coverage:any={state:'unknown',complete:false};
 status(){return this.coverage;}
 reset(){super.reset();const lease=this.lease;this.lease=undefined;this.proof=undefined;this.coverage={state:'unknown',complete:false};if(lease)void this.requestAt('/api/sqlite/knowledge/','release',{lease}).catch(()=>{});}
 protected async request(action:string,body:any,signal?:AbortSignal){
  const serial=this.serial;
  try{
   if(action==='begin'&&!this.lease){
    const opened=await this.requestAt('/api/sqlite/knowledge/','open',{vault:this.vault.root,policy:body.policy},signal);
    if(serial!==this.serial||signal?.aborted){void this.requestAt('/api/sqlite/knowledge/','release',{lease:opened.lease}).catch(()=>{});throw Error('SQL saved scope superseded');}
    this.lease=opened.lease;
   }
   const result=await super.request(action,action==='begin'?{...body,lease:this.lease}:body,signal);
   if(action!=='release'){
    if(serial!==this.serial)throw Error('SQL saved scope superseded');
    if(!result.coverage||typeof result.coverage.complete!=='boolean'||!result.evidence||typeof result.evidence.session!=='string'||typeof result.evidence.revision!=='string'||!Number.isInteger(result.evidence.indexEpoch))throw Error('Incomplete SQL read evidence');
    const proof=JSON.stringify(result.evidence);if(action==='begin')this.proof=proof;else if(proof!==this.proof)throw Error('SQL read epoch changed');this.coverage=result.coverage;
   }
   return result;
  }catch(error){if(serial===this.serial)this.coverage={state:'unknown',complete:false,diagnostics:[String(error)]};throw error;}
 }
 async current(signal:AbortSignal){if(!this.scope)throw Error('SQL scope unavailable');await this.request('current',{scope:this.scope},signal);}
 protected async validateRead(signal:AbortSignal){await this.current(signal);}
 async read(row:DiscoveryRow,policy:ExtractionPolicy,signal:AbortSignal){
  try{const result=await super.read(row,policy,signal);
  if(result.resourceId!==row.resourceId||result.facts.id!==row.resourceId||result.byteHash!==row.baseline?.nativeHash||result.policy!==policyKey(policy)||result.location.folder!==row.location.folder||result.location.filename!==row.location.filename)throw Error('SQL contribution evidence mismatch');
  return result;
  }catch(error){this.coverage={state:'unknown',complete:false,diagnostics:[String(error)]};throw error;}
 }
}
