import {decodeFacts} from '../knowledge/transport';
import {policyKey, type ExtractionPolicy} from '../knowledge/policy';
import type {DiscoveryRow, VerifiedSaved} from '../knowledge/contribution-state';
import type {DocumentVaultLease} from './document-vault';
/** One read scope and at most 32 response candidates; no Open/binding capability. */
export class SavedFactsClient {
 protected scope?:string; private signature=''; private policy=''; protected serial=0;
 private buffered=new Map<string,any>(); private failed?:string;
 readonly metrics={discoveryMs:0,requests:0,transportMs:0,decodeMs:0,workerMs:0,queueMs:0,validationMs:0,factsMs:0,sqlReadMs:0,bytes:0,fenceMs:0,readHashMs:0,workerHeapPeak:0,serverHeapPeak:0};
 constructor(protected vault:DocumentVaultLease,private bound:(id:string)=>boolean){}
 protected endpoint='/api/native/vault/facts/';
 protected validateRead(_signal:AbortSignal):Promise<void>{return Promise.resolve();}
 protected request(action:string,body:unknown,signal?:AbortSignal){return this.requestAt(this.endpoint,action,body,signal);}
 protected async requestAt(endpoint:string,action:string,body:unknown,signal?:AbortSignal){
  const start=performance.now();const r=await fetch(endpoint+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal});
  if(!r.body)throw Error('Saved response unavailable');
  const reader=r.body.getReader(),decoder=new TextDecoder(),parts:string[]=[];let bytes=0;
  try{for(;;){signal?.throwIfAborted();const item=await reader.read();if(item.done)break;bytes+=item.value.byteLength;if(bytes>4*1024*1024)throw Error('Saved response budget exceeded');parts.push(decoder.decode(item.value,{stream:true}));}parts.push(decoder.decode());}finally{await reader.cancel();}
  signal?.throwIfAborted();this.metrics.transportMs+=performance.now()-start;this.metrics.bytes+=bytes;this.metrics.requests++;
  const json=JSON.parse(parts.join(''));if(!r.ok||!json.Success)throw Error(json.Error??'Saved request failed');return json.Data;
 }
 async current(signal:AbortSignal){if(!this.scope)throw Error('Saved scope unavailable');const scope=this.scope;const result=await this.request('current',{scope},signal);if(this.scope!==scope||result.scope!==scope)throw Error('Saved scope changed');}
 failure(){return this.failed;}
 reset(){const scope=this.scope;this.scope=undefined;this.signature='';this.policy='';this.failed=undefined;this.buffered.clear();this.serial++;if(scope)void this.request('release',{scope}).catch(()=>{});}
 async prepare(policy:ExtractionPolicy,signal:AbortSignal) {
  const signature=this.vault.signature(),key=policyKey(policy);
  if(signature!==this.signature||key!==this.policy){this.reset();this.signature=signature;this.policy=key;}
  if(this.failed)throw Error(this.failed);
  const serial=this.serial,check=()=>{signal.throwIfAborted();if(serial!==this.serial||signature!==this.vault.signature()||!this.vault.isAlive())throw Error('Saved scope superseded');};
  try{
   if(!this.scope){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(signature));check();const expected=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
    const opened=await this.request('begin',{vault:this.vault.root,signature:expected,policy},signal);
    if(serial!==this.serial||signal.aborted){void this.request('release',{scope:opened.scope}).catch(()=>{});check();}
    if(opened.signature!==expected||opened.policy!==key||typeof opened.scope!=='string')throw Error('Invalid saved scope response');this.scope=opened.scope;this.metrics.discoveryMs+=opened.discoveryMs;check();
   }
  }catch(e){if(signal.aborted&&serial===this.serial)this.reset();if(!signal.aborted&&serial===this.serial)this.failed=String(e);throw e;}
 }
 async read(row:DiscoveryRow,policy:ExtractionPolicy,signal:AbortSignal):Promise<VerifiedSaved>{
  await this.prepare(policy,signal);
  const signature=this.vault.signature(),key=policyKey(policy);
  if(signature!==this.signature||key!==this.policy){this.reset();this.signature=signature;this.policy=key;}
  if(this.failed)throw Error(this.failed);
  const serial=this.serial,check=()=>{signal.throwIfAborted();if(serial!==this.serial||signature!==this.vault.signature()||!this.vault.isAlive())throw Error('Saved scope superseded');};
  try{
   if(!this.buffered.has(row.resourceId)){
    // Only a small look-ahead buffer; canonical bindings are not background Open requests.
    const rows=this.vault.snapshot().documents,at=rows.findIndex(r=>r.resourceId===row.resourceId);
    const ids=[row.resourceId,...rows.slice(at+1).filter(r=>!this.bound(r.resourceId)&&['paired','unenrolled'].includes(r.state)).slice(0,31).map(r=>r.resourceId)];
    const data=await this.request('batch',{scope:this.scope,ids},signal);check();
    if(data.scope!==this.scope||!Array.isArray(data.items)||data.items.length!==ids.length||new Set(data.items.map((i:any)=>i.resourceId)).size!==ids.length||data.items.some((i:any)=>!ids.includes(i.resourceId)))throw Error('Incomplete saved batch response');
    if(data.timings){this.metrics.fenceMs+=data.timings.fenceMs;this.metrics.readHashMs+=data.timings.readHashMs;this.metrics.workerHeapPeak=Math.max(this.metrics.workerHeapPeak,data.timings.workerHeapPeak);this.metrics.serverHeapPeak=Math.max(this.metrics.serverHeapPeak,data.timings.serverHeapPeak);}
    this.buffered.clear();for(const item of data.items){if(item.timings){this.metrics.workerMs+=item.timings.workerMs;this.metrics.queueMs+=item.timings.queueMs??0;this.metrics.validationMs+=item.timings.validationMs;this.metrics.factsMs+=item.timings.factsMs;this.metrics.sqlReadMs+=item.timings.readMs??0;}this.buffered.set(item.resourceId,item);}
   }
   await this.validateRead(signal);check();
   const item=this.buffered.get(row.resourceId);this.buffered.delete(row.resourceId);check();
   if(item.error)throw Object.assign(Error(item.error),{resourceFailure:true});
   if(typeof item.wire!=='string'||item.wire.length>2*1024*1024)throw Error('Invalid saved Facts response');
   const start=performance.now(),facts=decodeFacts(item.wire);this.metrics.decodeMs+=performance.now()-start;check();return {...item.evidence,facts};
  }catch(e){if(signal.aborted&&serial===this.serial)this.reset();if(!signal.aborted&&serial===this.serial&&!(e as any).resourceFailure)this.failed=String(e);throw e;}
 }
}
