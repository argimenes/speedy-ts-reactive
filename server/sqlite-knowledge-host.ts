/** P3a lifecycle/coverage only. No query provider, Entity authority or file writer. */
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { Router, json } from 'express';
import { openSqliteFoundation } from '../src/knowledge-sqlite/client.mjs';
import { NativeVaultStore } from './native-vault-store.mjs';
import { createSavedIndexer } from './sqlite-saved-indexer';
import { normalizePolicy, policyKey } from '../src/knowledge/policy';

const inside = (a:string,b:string) => a===b || b.startsWith(a+path.sep);
const unknown = (message:string) => ({state:'unknown',complete:false,diagnostics:[message]});
export class SqliteKnowledgeHost {
  readonly session=randomUUID(); readonly store:any;
  private entries=new Map<string,any>(); private leases=new Map<string,any>();
  private control=Promise.resolve(); private running?:Promise<void>; private timer?:ReturnType<typeof setTimeout>;
  private foregrounds=0; private foregroundTail=Promise.resolve(); private closed=false;
  readonly metrics={sweeps:0,cancellations:0,foregroundWaitMs:0,maxForegroundWaitMs:0};
  constructor(private options:{root:string;readOnly?:boolean;store?:any;open?:typeof openSqliteFoundation;indexer?:typeof createSavedIndexer;debounceMs?:number;leaseMs?:number}) {
    this.store=options.store??new NativeVaultStore({root:options.root,readOnly:!!options.readOnly});
  }
  private serialize<T>(action:()=>Promise<T>):Promise<T> {
    const work=this.control.then(action);this.control=work.then(()=>{},()=>{});return work;
  }
  async acquire(vault:string,policy=normalizePolicy()) {
    return this.serialize(async()=>{
      if(this.closed)throw Error('SQLite knowledge host closed');
      if(this.leases.size>=64)throw Error('SQLite lease budget exceeded');
      const root=await this.store.resolve(vault);
      const normalized=normalizePolicy(policy),key=policyKey(normalized);
      for(const other of this.entries.keys())if(other!==root&&(inside(other,root)||inside(root,other)))throw Error('Overlapping SQLite vault already open');
      let e=this.entries.get(root);
      if(e&&e.policyKey!==key)throw Error('SQLite vault extraction policy differs; no automatic profile replacement');
      if(!e){
        if(this.entries.size>=8)throw Error('SQLite vault budget exceeded');
        e={root,vault,policy:normalized,policyKey:key,users:0,epoch:0,coverage:unknown('Current saved scope has not been verified'),pending:false,full:false};
        // Failed/missing/corrupt/read-only databases remain unavailable, never repaired by replacement.
        try{e.client=await (this.options.open??openSqliteFoundation)({vault:root,initialize:!this.options.readOnly,readOnly:!!this.options.readOnly});
          e.vaultGuid=(await e.client.inspect()).mutable.vaultGuid;
          e.index=(this.options.indexer??createSavedIndexer)(e.client,{root:this.options.root,vault,store:this.store,policy:normalized});
        }catch(error){await e.client?.close().catch(()=>{});e.client=undefined;e.coverage=unknown(String(error));}
        this.entries.set(root,e);
        if(e.client&&!this.options.readOnly)this.enqueue(e,false);
      }
      const lease=randomUUID(),l={entry:e,timer:undefined};e.users++;this.leases.set(lease,l);this.renew(lease,l);
      return {lease,...this.snapshot(e)};
    });
  }
  private renew(token:string,l:any){clearTimeout(l.timer);l.timer=setTimeout(()=>{void this.release(token).catch(()=>{});},this.options.leaseMs??600000);l.timer.unref?.();}
  private entry(token:string){if(this.closed)throw Error('SQLite knowledge host closed');const l=this.leases.get(token);if(!l)throw Error('SQLite lease expired');this.renew(token,l);return l.entry;}
  private snapshot(e:any){return {session:this.session,vault:e.vault,vaultGuid:e.vaultGuid,epoch:e.epoch,readOnly:!!this.options.readOnly,pending:!!e.pending||this.active===e,coverage:structuredClone(e.coverage)};}
  private invalidate(e:any,message:string){e.epoch++;e.fence=undefined;e.coverage=unknown(message);}
  private enqueue(e:any,full:boolean){if(this.closed||!e.client||this.options.readOnly)return;this.invalidate(e,'Saved reconciliation pending');e.pending=true;e.full ||= full;this.schedule();}
  private schedule(){if(this.closed||this.foregrounds||this.timer||this.running)return;this.timer=setTimeout(()=>{this.timer=undefined;void this.flush();},this.options.debounceMs??100);this.timer.unref?.();}
  private active?:any; private controller?:AbortController;
  /** Internal drain used by explicit reconciliation and qualification, never by typing. */
  async flush():Promise<void>{
    clearTimeout(this.timer);this.timer=undefined;
    if(this.running)return this.running;
    if(this.closed)return;
    if(this.foregrounds){await this.foregroundTail;return this.flush();}
    const run=async()=>{
      while(!this.closed&&!this.foregrounds){
        const e=[...this.entries.values()].find(e=>e.pending&&e.users>0);if(!e)break;
        e.pending=false;const full=e.full;e.full=false;const epoch=e.epoch;
        this.active=e;const controller=this.controller=new AbortController();
        try{
          this.metrics.sweeps++;const r=await e.index.refresh({mode:full?'full':'incremental',signal:controller.signal});controller.signal.throwIfAborted();
          if(epoch!==e.epoch)throw Error('Reconciliation superseded');
          const status=await e.client.indexStatus();controller.signal.throwIfAborted();
          if(epoch!==e.epoch)throw Error('Reconciliation superseded');
          e.epoch++;e.fence=r.complete?r.scopeFence:undefined;
          e.coverage={state:r.complete&&!status.incompleteResources&&!status.issueCount?'complete':'incomplete',complete:!!r.complete&&!status.incompleteResources&&!status.issueCount,
            resources:status.resources,incompleteResources:status.incompleteResources,issueCount:status.issueCount,
            diagnostics:[...r.issues.map((x:any)=>x.message),...status.issues.map((x:any)=>x.reason)].slice(0,32)};
        }catch(error){this.invalidate(e,String(error));if(controller.signal.aborted){this.metrics.cancellations++;e.full ||= full;}}
        finally{this.active=undefined;this.controller=undefined;}
      }
    };
    this.running=run();try{await this.running;}finally{this.running=undefined;if([...this.entries.values()].some(e=>e.pending))this.schedule();}
  }
  async status(token:string){
    const e=this.entry(token),epoch=e.epoch;
    if(e.fence){try{await e.client.indexStatus();if(await this.store.readScopeFence(e.vault)!==e.fence&&epoch===e.epoch)this.invalidate(e,'Saved scope changed; Refresh required');}
      catch(error){if(epoch===e.epoch)this.invalidate(e,String(error));}}
    return this.snapshot(e);
  }
  async refresh(token:string,full=false){
    const e=this.entry(token);if(this.options.readOnly)throw Error('SQLite reconciliation is read-only');
    if(!e.client)throw Error('SQLite unavailable; close and reopen the vault to retry');
    this.enqueue(e,full);await this.flush();return this.status(token);
  }
  /** Foreground routes retain all save/admission/locking authority. A notification is only a wakeup. */
  async foreground<T>(action:()=>Promise<T>):Promise<T>{
    this.foregrounds++;clearTimeout(this.timer);this.timer=undefined;this.controller?.abort(Error('Foreground storage operation'));
    for(const e of this.entries.values())this.invalidate(e,'Storage operation pending');
    const previous=this.foregroundTail;let done:()=>void;this.foregroundTail=new Promise<void>(r=>{done=r;});
    const start=performance.now();
    try{await previous;await this.running;const wait=performance.now()-start;this.metrics.foregroundWaitMs+=wait;this.metrics.maxForegroundWaitMs=Math.max(this.metrics.maxForegroundWaitMs,wait);return await action();}
    finally{done!();this.foregrounds--;for(const e of this.entries.values())this.enqueue(e,false);this.schedule();}
  }
  async release(token:string){
    return this.serialize(async()=>{const l=this.leases.get(token);if(!l)return {released:true};clearTimeout(l.timer);this.leases.delete(token);const e=l.entry;
      if(--e.users===0){e.pending=false;if(this.active===e){this.controller?.abort(Error('Vault lease closed'));await this.running;}this.entries.delete(e.root);await e.client?.close();}
      return {released:true};});
  }
  async close(){this.closed=true;clearTimeout(this.timer);this.controller?.abort(Error('Host shutdown'));await this.control;await this.foregroundTail;await this.running;
    for(const l of this.leases.values())clearTimeout(l.timer);this.leases.clear();for(const e of this.entries.values())await e.client?.close();this.entries.clear();}
  router(){
    const router=Router();router.use(json({limit:'32kb'}));
    for(const [name,action]of Object.entries({open:(b:any)=>this.acquire(b.vault,b.policy),status:(b:any)=>this.status(b.lease),refresh:(b:any)=>this.refresh(b.lease,b.full===true),release:(b:any)=>this.release(b.lease)}))
      router.post('/'+name,async(req,res)=>{try{res.json({Success:true,Data:await action(req.body??{})});}catch(error){res.status(409).json({Success:false,Error:String(error)});}});
    return router;
  }
}
