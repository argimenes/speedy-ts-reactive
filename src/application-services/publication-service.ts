import {validateReader} from '../publication/reader';
import {researchSources,researchPlan,approvedResearch} from './publication-research';
import {readerArtifacts} from './publication-reader';
import {directoryScope,routeEntries,allocateRoutes} from '../publication/directory';
import {prepareDirectory,validateDirectory,type DocumentReceipt} from './publication-directory-job';
import type {PublicationOperations,PublicationJob,PublicationProfile,PublicFile} from './publication-contracts';
import type {PublicationPorts,PublicationRecord} from './publication-ports';
import {object,jobId,nativeRead} from './validation';
import {READER_CSS,PUBLICATION_VERSION} from '../publication/policy';
import type {Projection} from '../publication/projection';
const bytes=(v:string)=>new TextEncoder().encode(v);
export function publicationProfile(v:unknown):asserts v is PublicationProfile {
 object(v,['title','route','images','outboundLinks','includeMargins','reader']);
 if(typeof v.title!=='string'||!v.title.trim()||v.title.length>200||typeof v.route!=='string'||!/^[a-z0-9][a-z0-9_-]{0,79}\.html$/.test(v.route)||/^(con|prn|aux|nul|com[0-9]|lpt[0-9])\.html$/.test(v.route))throw Error('Invalid public title or route');
 if(v.reader!==undefined){validateReader(v.reader);if(['search.html','research.html'].includes(v.route))throw Error('Route reserved for reader tools');}
 if(['images','outboundLinks','includeMargins'].some(k=>typeof v[k]!=='boolean'))throw Error('Invalid publication disclosure policy');
}
/** Host-owned jobs. Request abort only bounds admission; it never owns an admitted build. */
export class PublicationService {
 private running=new Map<string,{controller:AbortController;done:Promise<void>}>();private closed=false;private starting=false;
 constructor(private p:PublicationPorts){}
 async call<K extends keyof PublicationOperations>(op:K,input:PublicationOperations[K]['input'],signal?:AbortSignal):Promise<PublicationOperations[K]['output']>{
  if(this.closed)throw Error('Publication host closed');signal?.throwIfAborted();const v=input as any;let out:unknown;
  switch(op){
   case 'publication.research.sources':case 'publication.research.plan':{
    object(v,op==='publication.research.sources'?['siteId','expectedRevision']:['siteId','expectedRevision','source']);jobId(v.siteId);const site=await this.p.storage.site(v.siteId);if(site.revision!==v.expectedRevision)throw Error('Site changed; review required');
    out=op==='publication.research.sources'?await researchSources(this.p,site,signal):(await researchPlan(this.p,site,v.source,signal)).plan;break;
   }
   case 'publication.directories.plan':{
    object(v,['id','scope','home']);jobId(v.id);directoryScope(v.scope);publicationProfile({title:'Directory',route:v.home,images:false,outboundLinks:false,includeMargins:false});
    if(!this.p.inventory)throw Error('Directory publication unavailable');let old;try{old=await this.p.storage.site(v.id);}catch(e){if((e as any).code!=='ENOENT')throw e;}
    const inventory=await this.p.inventory(v.scope,signal);out={...inventory,documents:allocateRoutes(inventory,old?.directory?.pages??[],v.home,id=>this.p.hash(bytes(v.id+'\0'+id)).slice(0,24))};break;
   }
   case 'publication.directories.save':{
    object(v,['id','expectedRevision','scope','profile','pages','reviewedRoutes']);jobId(v.id);directoryScope(v.scope);publicationProfile(v.profile);routeEntries(v.pages,v.profile.route);if(v.profile.reader&&v.pages.some((p:any)=>['search.html','research.html'].includes(p.route)))throw Error('Page route reserved for reader tools');
    if(!Number.isInteger(v.expectedRevision)||v.expectedRevision< -1||JSON.stringify(v.pages)!==JSON.stringify(v.reviewedRoutes))throw Error('Explicit route review required');
    if(!this.p.inventory)throw Error('Directory publication unavailable');const inventory=await this.p.inventory(v.scope,signal);
    if(inventory.documents.length!==v.pages.length||inventory.documents.some(d=>!v.pages.some((p:any)=>p.resourceId===d.resourceId)))throw Error('Directory membership changed; review required');
    let old;try{old=await this.p.storage.site(v.id);}catch(e){if(v.expectedRevision!==-1||(e as any).code!=='ENOENT')throw e;}
    if(old&&!old.directory)throw Error('Create another site for a directory scope');
    const directory={scope:{folder:v.scope.folder,recursive:v.scope.recursive,excluded:v.scope.excluded},pages:v.pages.map((p:any)=>({resourceId:p.resourceId,route:p.route,title:p.title}))},profile={title:v.profile.title,route:v.profile.route,images:v.profile.images,outboundLinks:v.profile.outboundLinks,includeMargins:v.profile.includeMargins,...v.profile.reader?{reader:structuredClone(v.profile.reader)}:{}};
    if(old&&old.revision===v.expectedRevision+1&&JSON.stringify(old.directory)===JSON.stringify(directory)&&JSON.stringify(old.profile)===JSON.stringify(profile)){out=old;break;}
    out=await this.p.storage.writeSite({version:1,kind:'directory',id:v.id,revision:0,profile,directory,releases:old?.releases??[],committedJobs:old?.committedJobs??{},...(old?.active?{active:old.active}:{})},v.expectedRevision);break;
   }
   case 'publication.review.documents':{
    object(v,['id','offset']);jobId(v.id);if(!Number.isInteger(v.offset)||v.offset<0||v.offset>1000)throw Error('Invalid review page');const r=await this.p.storage.load(v.id);if(!r.directory)throw Error('No directory review');
    const documents=[];for(let i=v.offset;i<Math.min(v.offset+10,r.directory.documents.length);i++){signal?.throwIfAborted();const receipt=await this.p.storage.unit<DocumentReceipt>(v.id,`doc-${String(i).padStart(4,'0')}`);if(!receipt)throw Error('Document review is not prepared');documents.push({entry:receipt.entry,text:receipt.text,diagnostics:receipt.diagnostics});}
    out={documents,...v.offset+10<r.directory.documents.length?{next:v.offset+10}:{}};break;
   }
   case 'publication.releases.folder':object(v,['siteId','release']);jobId(v.siteId);out=await this.p.storage.folder(v.siteId,v.release);break;
   case 'publication.sites.list':object(v,[]);out={sites:await this.p.storage.sites()};break;
   case 'publication.sites.write':{
    object(v,['id','expectedRevision','location','profile','reviewedRoute']);jobId(v.id);nativeRead({location:v.location});publicationProfile(v.profile);
    if(!Number.isInteger(v.expectedRevision)||v.expectedRevision< -1||v.reviewedRoute!==v.profile.route)throw Error('Explicit route review and expected revision required');
    const doc=await this.p.native({location:v.location},signal);let old;try{old=await this.p.storage.site(v.id);}catch(e){if(v.expectedRevision!==-1||(e as any).code!=='ENOENT')throw e;}
    const normalized={title:v.profile.title,route:v.profile.route,images:v.profile.images,outboundLinks:v.profile.outboundLinks,includeMargins:v.profile.includeMargins,...v.profile.reader?{reader:structuredClone(v.profile.reader)}:{}};
    if(old&&old.revision===v.expectedRevision+1&&old.resourceId===doc.resourceId&&JSON.stringify(old.profile)===JSON.stringify(normalized)&&old.location.folder===v.location.folder&&old.location.filename===v.location.filename){out=old;break;}
    if(old?.directory)throw Error('Create another site for a single document');
    if(old&&old.resourceId!==doc.resourceId)throw Error('A site scope cannot silently switch document identity; create another site');
    out=await this.p.storage.writeSite({version:1,id:v.id,revision:0,resourceId:doc.resourceId,location:v.location,profile:normalized,releases:old?.releases??[],committedJobs:old?.committedJobs??{},...(old?.active?{active:old.active}:{})},v.expectedRevision);break;
   }
   case 'publication.review.create':{
    object(v,['id','siteId','expectedRevision']);jobId(v.id);jobId(v.siteId);const site=await this.p.storage.site(v.siteId);if(site.revision!==v.expectedRevision)throw Error('Site revision changed');
    const r=await this.p.storage.create({job:{version:2,id:v.id,siteId:v.siteId,revision:0,state:'reviewing',phase:'Saved input'},site,files:[]});
    if(r.job.state==='reviewing'&&!this.running.has(r.job.id))await this.launch(r,false);out=(await this.p.storage.load(v.id)).job;break;
   }
   case 'publication.jobs.list':{object(v,['siteId','after']);jobId(v.siteId);if(v.after!==undefined)jobId(v.after);const page=await this.p.storage.list(v.siteId,v.after);out={jobs:page.records.map(r=>r.job),...page.next?{next:page.next}:{}};break;}
   case 'publication.jobs.inspect':object(v,['id']);jobId(v.id);out=(await this.inspect(v.id)).job;break;
   case 'publication.build.start':{
    object(v,['id','expectedRevision','reviewDigest']);jobId(v.id);const r=await this.p.storage.load(v.id);
    if(r.approved===v.reviewDigest&&['running','completed'].includes(r.job.state)){out=r.job;break;}
    if(r.job.state!=='awaiting-approval'||r.job.revision!==v.expectedRevision||r.job.review?.digest!==v.reviewDigest)throw Error('Current explicit privacy approval required');
    this.capacity();await this.launch(r,true);out=(await this.p.storage.load(v.id)).job;break;
   }
   case 'publication.jobs.resume':{
    object(v,['id','expectedRevision']);jobId(v.id);const r=await this.inspect(v.id);if(r.job.revision!==v.expectedRevision||!['interrupted','failed'].includes(r.job.state))throw Error('Job cannot resume at this revision');
    this.capacity();await this.launch(r,!!r.approved);out=(await this.p.storage.load(v.id)).job;break;
   }
   case 'publication.jobs.cancel':{
    object(v,['id']);jobId(v.id);const live=this.running.get(v.id);if(live){live.controller.abort();await live.done;out=(await this.p.storage.load(v.id)).job;}
    else {const lease=await this.p.storage.acquire(v.id);try{const r=await this.p.storage.load(v.id);out=['completed','cancelled'].includes(r.job.state)?r.job:(await this.save(r,'cancelled','Cancelled')).job;}finally{await lease.close();}}break;
   }
   case 'publication.releases.preview':object(v,['siteId','release']);jobId(v.siteId);await this.p.storage.release(v.siteId,v.release);out=await this.p.preview(v.siteId,v.release);break;
   case 'publication.preview.close':object(v,['grant']);jobId(v.grant);await this.p.closePreview(v.grant);out={closed:true};break;
   case 'publication.releases.export':{
    object(v,['siteId','release']);jobId(v.siteId);const files=await this.p.storage.release(v.siteId,v.release);if(files.reduce((n,f)=>n+f.size,0)>60*1024*1024)throw Error('ZIP delivery exceeds 60 MiB; use the complete static folder');
    const members:Record<string,Uint8Array>={};for(const file of files){signal?.throwIfAborted();members[file.path]=await this.p.storage.file(v.siteId,v.release,file);}
    const result:any=await this.p.executor.run({kind:'publication-zip',members},signal);out={bytes:result.bytes,mediaType:'application/zip',filename:`site-${v.siteId}.zip`};break;
   }
   default:throw Error('Unknown publication operation');
  }
  return out as PublicationOperations[K]['output'];
 }
 private capacity(){if(this.running.size||this.starting)throw Error('A publication job is already active');}
 private save(r:PublicationRecord,state:PublicationJob['state'],phase:string,error?:string){return this.p.storage.checkpoint({...r,job:{...r.job,state,phase,error}},r.job.revision);}
 private async current(r:PublicationRecord,signal:AbortSignal,checkResearch=true){
  signal.throwIfAborted();
  if(checkResearch&&r.site.profile.reader?.preset==='research'){const current=await approvedResearch(this.p,r.site,signal);if(JSON.stringify(current)!==JSON.stringify(r.research))throw Error('Semantic disclosure changed; review required');}
  if(r.site.directory){await validateDirectory(this.p,r,signal);return {native:'',resourceId:'',sha256:'',generation:null};}
  if(r.job.review&&r.job.review.digest!==this.p.hash(bytes(JSON.stringify({version:PUBLICATION_VERSION,site:r.site,nativeHash:r.job.review.nativeHash,files:r.files,research:r.research}))))throw Error('Publication policy or prepared inputs changed; review required');
  const site=await this.p.storage.site(r.site.id);
  if(site.revision!==r.site.revision)throw Error('Site changed; review required');
  const doc=await this.p.native({location:r.site.location,...r.job.review?{expectedHash:r.job.review.nativeHash}:{}},signal);
  if(doc.resourceId!==r.site.resourceId)throw Error('Saved identity changed; review required');return doc;
 }
 private async launch(r:PublicationRecord,build:boolean){
  this.capacity();this.starting=true;let lease;try{lease=await this.p.storage.acquire(r.job.id);}catch(e){this.starting=false;throw e;}const controller=new AbortController();
  try{
   const current=await this.p.storage.load(r.job.id);if(current.job.revision!==r.job.revision)throw Error('Job revision changed');
   r=await this.save({...r,...build?{approved:r.job.review!.digest}:{}},build?'running':'reviewing',build?'Validate approved input':'Saved input');
   const allowance=setTimeout(()=>controller.abort(Error('Publication work allowance reached; explicit resume required')),30*60*1000);
   const done=this.execute(r,build,controller.signal).finally(async()=>{clearTimeout(allowance);await lease.close();this.running.delete(r.job.id);});this.running.set(r.job.id,{controller,done});
  }catch(e){await lease.close();throw e;}finally{this.starting=false;}
 }
 private async execute(initial:PublicationRecord,build:boolean,signal:AbortSignal){
  let r=initial;
  try{
   // Reconcile a committed release before checking the now-advanced site revision.
   if(build&&r.files.length){const expected=this.releaseHash(r.files),site=await this.p.storage.site(r.site.id);if(site.committedJobs?.[r.job.id]===expected&&site.releases.includes(expected)){r={...r,job:{...r.job,release:expected}};await this.save(r,'completed','Complete');return;}}
   const capture=!build&&r.site.profile.reader?.preset==='research'&&!r.research;
   if(capture){r={...r,research:await approvedResearch(this.p,r.site,signal)};r=await this.save(r,'reviewing','Captured reviewed semantics');}
   const doc=await this.current(r,signal,!capture);
   if(!build&&r.site.directory){r=await prepareDirectory(this.p,r,signal,(next,phase)=>this.save(next,'reviewing',phase));await this.current(r,signal);await this.save(r,'awaiting-approval','Review directory content');return;}
   if(!build){
    const native=bytes(doc.native);await this.p.storage.put(r.job.id,native);
    const projection=await this.p.executor.run({kind:'publication-project',native,profile:r.site.profile,cavernId:this.p.cavernId,namespace:r.site.id,research:r.research},signal) as Projection;
    let html=projection.html,total=0;const files:PublicFile[]=[];const seen=new Set<string>();
    for(const a of projection.assets){
     if(seen.has(a.reference.assetId))continue;seen.add(a.reference.assetId);if(seen.size>20)throw Error('Stage A supports at most 20 image originals');
     const original=await this.p.asset(a.reference.assetId,signal);if(original.bytes.length>10*1024*1024||(total+=original.bytes.length)>40*1024*1024)throw Error('Stage A image budget exceeded');
     if(!['image/png','image/jpeg'].includes(original.mediaType)||`sha256:${this.p.hash(original.bytes)}`!==a.reference.assetId)throw Error('Original image integrity mismatch');
     const path=`${a.path}.${original.mediaType==='image/png'?'png':'jpg'}`;html=html.split(`src="${a.path}"`).join(`src="${path}"`);
     files.push({path,hash:await this.p.storage.put(r.job.id,original.bytes),size:original.bytes.length,mediaType:original.mediaType});
     signal.throwIfAborted();
    }
    for(const [path,text,mediaType] of [[r.site.profile.route,html,'text/html'],...r.site.profile.reader?[]:[['reader.css',READER_CSS,'text/css']]]){const b=bytes(text);files.push({path,hash:await this.p.storage.put(r.job.id,b),size:b.length,mediaType});}
    if(r.site.profile.reader){const receipt={entry:{resourceId:doc.resourceId,location:r.site.location!,hash:doc.sha256,size:native.length,route:r.site.profile.route,title:r.site.profile.title},files,text:projection.text,diagnostics:projection.diagnostics,omittedAnnotations:projection.omittedAnnotations,omittedBlocks:projection.omittedBlocks,headings:projection.headings,search:projection.search,occurrences:projection.occurrences};files.push(...await readerArtifacts(this.p,r,(async function*(){yield receipt;})(),signal));}
    files.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
    const digest=this.p.hash(bytes(JSON.stringify({version:PUBLICATION_VERSION,site:r.site,nativeHash:doc.sha256,files,research:r.research})));
    r={...r,files,job:{...r.job,review:{digest,nativeHash:doc.sha256,profile:r.site.profile,text:projection.text,diagnostics:projection.diagnostics,files,omittedAnnotations:projection.omittedAnnotations,omittedBlocks:projection.omittedBlocks,...r.research?{semantics:r.research.entries}:{}}}};
    await this.current(r,signal);await this.save(r,'awaiting-approval','Review public content');
   }else{
    if(r.approved!==r.job.review?.digest)throw Error('Privacy approval missing');
    if(!r.site.directory)for(const f of r.files){signal.throwIfAborted();const b=await this.p.storage.read(r.job.id,f.hash,f.unit);if(b.length!==f.size)throw Error('Artifact size mismatch');}
    r=await this.save(r,'running','Seal complete release');await this.current(r,signal);
    const release=await this.p.storage.commit(r,signal);r={...r,job:{...r.job,release}};await this.save(r,'completed','Complete');
   }
  }catch(error){
   // Commit is authoritative even when its acknowledgement or final job checkpoint was lost.
   try{r=await this.p.storage.load(r.job.id);const site=await this.p.storage.site(r.site.id),expected=r.approved&&this.releaseHash(r.files);if(expected&&site.committedJobs?.[r.job.id]===expected&&site.releases.includes(expected)){await this.save({...r,job:{...r.job,release:expected}},'completed','Complete');return;}
    const message=String((error as Error).message).slice(0,400);await this.save(r,this.closed||signal.reason?.message?.includes('work allowance')?'interrupted':signal.aborted?'cancelled':/changed|review required/i.test(message)?'review-required':'failed','Stopped',message);
   }catch{/* Immutable receipts remain recoverable after a storage failure. */}
  }
 }
 private releaseHash(files:PublicFile[]){return this.p.hash(bytes(JSON.stringify([...files].sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0))));}
 private async inspect(id:string){
  const r=await this.p.storage.load(id);if(!['running','reviewing'].includes(r.job.state)||this.running.has(id))return r;
  let lease;try{lease=await this.p.storage.acquire(id);}catch(e){if((e as Error).message.includes('another host'))return r;throw e;}
  try{return await this.save(await this.p.storage.load(id),'interrupted','Explicit resume required');}finally{await lease.close();}
 }
 async close(){this.closed=true;for(const live of this.running.values())live.controller.abort();await Promise.allSettled([...this.running.values()].map(v=>v.done));await this.p.storage.close();}
}
