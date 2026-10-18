import {IIIF_LIMITS,httpsUrl,canvasAt,tileRequest,type Capture,type Projection,type ImageInfo} from '../iiif/model';
import {object,jobId} from './validation';
import type {IIIFCapabilities,IIIFOperations} from './iiif-contracts';
interface Grant {snapshot:Capture;canvasId:string;info:ImageInfo;online:boolean;retained:Map<string,Capture>;controller:AbortController;expires:number;busy:number}
/** Per-authorised-Vault service. Grants/cache are device-local and never document data. */
export class IIIFService {
 private grants=new Map<string,Grant>();private cache=new Map<string,Uint8Array>();private cacheSize=0;private active=0;private opening=0;private closed=false;private controllers=new Set<AbortController>();
 constructor(private p:IIIFCapabilities){}
 private async normalize(bytes:Uint8Array,signal:AbortSignal){return await this.p.executor.run({kind:'iiif-normalize',bytes},signal) as Projection;}
 private async read(id:string,signal:AbortSignal){jobId(id);const {snapshot}=await this.p.knowledge({op:'iiif-snapshot',snapshotId:id},signal);if(!['iiif-manifest','iiif-image','iiif-canvas'].includes(snapshot.kind)||snapshot.asset.cavernId!==this.p.cavernId)throw Error('Wrong IIIF snapshot or Vault');return {snapshot:snapshot as Capture,projection:await this.normalize(await this.p.original(snapshot.asset,signal),signal)};}
 private prefix(g:Grant){return `${g.snapshot.snapshotId}\n${g.canvasId}\n`;}
 private cached(key:string){const b=this.cache.get(key);if(b){this.cache.delete(key);this.cache.set(key,b);}return b;}
 private put(key:string,bytes:Uint8Array){if(this.cache.has(key))this.cacheSize-=this.cache.get(key)!.length;this.cache.delete(key);this.cache.set(key,bytes);this.cacheSize+=bytes.length;while(this.cacheSize>IIIF_LIMITS.cacheBytes||this.cache.size>128){const [k,v]=this.cache.entries().next().value!;this.cache.delete(k);this.cacheSize-=v.length;}}
 private sweep(){for(const [id,g]of this.grants)if(g.expires<Date.now()){g.controller.abort();this.grants.delete(id);}}
 private grant(id:string){jobId(id);this.sweep();const g=this.grants.get(id);if(!g)throw Error('Viewer session expired; activate it again');return g;}
 async call<K extends keyof IIIFOperations>(op:K,input:IIIFOperations[K]['input'],signal?:AbortSignal):Promise<IIIFOperations[K]['output']>{
  if(this.closed)throw Error('IIIF service closed');signal?.throwIfAborted();if(op==='iiif.close'){const v=input as any;object(v,['grant']);jobId(v.grant);this.grants.get(v.grant)?.controller.abort();return {closed:this.grants.delete(v.grant)} as any;}if(this.active>=8)throw Error('IIIF host is busy');this.active++;
  const c=new AbortController(),abort=()=>c.abort();this.controllers.add(c);signal?.addEventListener('abort',abort,{once:true});const timer=setTimeout(abort,60000);const s=c.signal,v=input as any;
  try{
   if(op==='iiif.import'||op==='iiif.resume'||op==='iiif.inspect'){
    object(v,op==='iiif.import'?['id','source']:['id']);jobId(v.id);
    if(op==='iiif.import')await this.p.jobs.create(v.id,{kind:'iiif',source:httpsUrl(v.source)});
    if(op==='iiif.inspect'){let r=await this.p.jobs.load(v.id);if(r.preparation.kind!=='iiif')throw Error('Wrong job kind');if(r.summary.state==='running'){const lease=await this.p.jobs.acquire(v.id).catch(()=>undefined);if(lease)try{r=await this.p.jobs.load(v.id);if(r.summary.state==='running')r=await this.p.jobs.checkpoint({...r,summary:{...r.summary,state:'interrupted'}},r.summary.revision);}finally{await lease.close();}}return {job:r.summary} as any;}
    return await this.import(v.id,s) as any;
   }
   if(op==='iiif.read'){object(v,['snapshotId']);return await this.read(v.snapshotId,s) as any;}
   if(op==='iiif.open'){
    object(v,['snapshotId','canvasId','online','origins']);if(typeof v.online!=='boolean'||!Array.isArray(v.origins)||v.origins.length>4||v.origins.some((o:any)=>typeof o!=='string'||new URL(httpsUrl(o)).origin!==o))throw Error('Invalid reviewed origins');
    this.sweep();if(this.grants.size+this.opening>=IIIF_LIMITS.grants)throw Error('Close another IIIF viewer first');this.opening++;try{
    const {snapshot,projection}=await this.read(v.snapshotId,s),canvas=canvasAt(projection,v.canvasId);if(!canvas.service)throw Error('Canvas has no supported Image API service');
    const origin=new URL(canvas.service).origin;if(v.online&&!v.origins.includes(origin))throw Error('Image origin needs explicit approval');
    let info:ImageInfo;
    if(projection.kind==='image')info=projection;
    else {
     const prior=await this.p.knowledge({op:'iiif-associated',snapshotId:snapshot.snapshotId,canvasId:canvas.id,kind:'iiif-canvas'},s);
     if(prior.snapshots[0])info=(await this.read(prior.snapshots[0].snapshotId,s)).projection as ImageInfo;
     else {
      if(!v.online)throw Error('Image information has not been retained; offline viewing is unavailable');
      const url=canvas.service.replace(/\/$/,'')+'/info.json',r=await this.p.acquire(url,'json',s),p=await this.normalize(r.bytes,s);
      if(p.kind!=='image'||p.id.replace(/\/$/,'')!==canvas.service.replace(/\/$/,''))throw Error('Image information identifies a different service');
      const captured=await this.capture(r.bytes,p,url,'iiif-canvas',s,{parentSnapshotId:snapshot.snapshotId,canvasId:canvas.id,endpoint:r.endpoint});
      const accepted=await this.p.knowledge({op:'iiif-commit',operationId:this.p.uuid(),snapshot:captured},s);
      info=(await this.read(accepted.snapshot.snapshotId,s)).projection as ImageInfo;
     }
    }
    const retained=await this.p.knowledge({op:'iiif-associated',snapshotId:snapshot.snapshotId,canvasId:canvas.id,kind:'iiif-retained'},s),g:Grant={snapshot,canvasId:canvas.id,info,online:v.online,retained:new Map(retained.snapshots.map((r:any)=>[r.tileKey,r])),controller:new AbortController(),expires:Date.now()+30*60*1000,busy:0};
    s.throwIfAborted();if(info.kind!=='image')throw Error('Invalid image information');const grant=this.p.uuid();this.grants.set(grant,g);return {grant,info,retained:g.retained.size,cached:[...this.cache.keys()].filter(k=>k.startsWith(this.prefix(g))).length} as any;}finally{this.opening--;}
   }
   object(v,op==='iiif.tile'?['grant','scale','x','y']:['grant']);
   const g=this.grant(v.grant),stop=()=>c.abort();g.controller.signal.throwIfAborted();g.controller.signal.addEventListener('abort',stop,{once:true});
   try{
    if(op==='iiif.tile'){
     if(g.busy>=4)throw Error('Viewer tile limit reached');g.busy++;
     try{
      const request=tileRequest(g.info,v.scale,v.x,v.y),tileKey=`${v.scale}/${v.x}/${v.y}`,key=this.prefix(g)+tileKey,retained=g.retained.get(tileKey),cached=this.cached(key);
      if(cached)return {bytes:cached.slice(),availability:retained?'retained':'cached'} as any;
      if(retained){const bytes=await this.p.original(retained.asset,s);this.put(key,bytes);return {bytes,availability:'retained'} as any;}
      if(!g.online)throw Error('This tile is unavailable offline; no remote request was made');
      const acquired=await this.p.acquire(request.url,'tile',s);s.throwIfAborted();
      if(acquired.width!==request.width||acquired.height!==request.height)throw Error('Image tile dimensions differ from the requested bounded region');
      this.put(key,acquired.bytes);return {bytes:acquired.bytes,availability:'remote'} as any;
     }finally{g.busy--;}
    }
    if(op==='iiif.retain'){
     const entries=[...this.cache.entries()].filter(([k])=>k.startsWith(this.prefix(g))).slice(-32);let count=0;
     for(const [key,bytes]of entries){s.throwIfAborted();const tileKey=key.slice(this.prefix(g).length);if(g.retained.has(tileKey)){count++;continue;}
      const coordinates=tileKey.split('/').map(Number),sourceUrl=tileRequest(g.info,coordinates[0],coordinates[1],coordinates[2]).url;
      const {endpoint:originalEndpoint,...base}=g.snapshot;const asset=await this.p.retain(bytes,'tile',s),snapshot={...base,sourceUrl,kind:'iiif-retained',snapshotId:this.p.uuid(),asset,parentSnapshotId:g.snapshot.snapshotId,canvasId:g.canvasId,tileKey,retrievedAt:this.p.now()};
      const saved=await this.p.knowledge({op:'iiif-commit',operationId:this.p.uuid(),snapshot},s);g.retained.set(tileKey,saved.snapshot);count++;
     }
     return {retained:count} as any;
    }
    throw Error('Unknown IIIF operation');
   }finally{g.controller.signal.removeEventListener('abort',stop);}
  }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);this.controllers.delete(c);this.active--;}
 }
 private async capture(bytes:Uint8Array,p:Projection,sourceUrl:string,kind:Capture['kind'],signal:AbortSignal,extra:Partial<Capture>={}):Promise<Capture>{
  const asset=await this.p.retain(bytes,'json',signal);return {version:1,kind,snapshotId:this.p.uuid(),identityId:this.p.uuid(),entityId:this.p.uuid(),resourceId:this.p.uuid(),sourceUrl,resourceUrl:p.id,retrievedAt:this.p.now(),asset,label:p.label,...extra};
 }
 private async import(id:string,s:AbortSignal){
  const lease=await this.p.jobs.acquire(id);let r:Awaited<ReturnType<IIIFCapabilities['jobs']['load']>>;try{r=await this.p.jobs.load(id);if(r.preparation.kind!=='iiif')throw Error('Wrong job kind');
   const checkpoint=async(state:typeof r.summary.state,result=r.result,error?:string)=>r=await this.p.jobs.checkpoint({...r,result,summary:{...r.summary,state,error}},r.summary.revision);
   try{
    const saved=r.result?JSON.parse(new TextDecoder().decode(await this.p.jobs.readResult(id,r.result))):undefined;
    if(r.summary.state==='completed')return this.read(saved.snapshot.snapshotId,s);
    await checkpoint('running');let snapshot:Capture=saved?.snapshot;
    if(!snapshot){const result=await this.p.acquire(r.preparation.source,'json',s),projection=await this.normalize(result.bytes,s);snapshot=await this.capture(result.bytes,projection,r.preparation.source,projection.kind==='manifest'?'iiif-manifest':'iiif-image',s,{endpoint:result.endpoint});await checkpoint('running',await this.p.jobs.putResult(id,new TextEncoder().encode(JSON.stringify({snapshot}))));}
    await this.normalize(await this.p.original(snapshot.asset,s),s);s.throwIfAborted();
    const result=await this.p.knowledge({op:'iiif-commit',operationId:id,snapshot},s);await checkpoint('completed',await this.p.jobs.putResult(id,new TextEncoder().encode(JSON.stringify(result))));return this.read(result.snapshot.snapshotId,s);
   }catch(e){if(r.summary.state!=='completed')await checkpoint(s.aborted?'cancelled':'failed',r.result,String(e).slice(0,500));throw Error(`${String(e)}. IIIF job ${id} can be resumed.`);}
  }finally{await lease.close();}
 }
 async close(){this.closed=true;for(const c of this.controllers)c.abort();for(const g of this.grants.values())g.controller.abort();this.grants.clear();this.cache.clear();this.cacheSize=0;while(this.active)await new Promise(resolve=>setTimeout(resolve,10));}
}
