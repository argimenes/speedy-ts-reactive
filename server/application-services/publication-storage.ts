import type {MaintenanceTarget,MaintenanceReview} from '../../src/application-services/publication-maintenance';
import {publicManifest} from '../../src/publication/incremental';
import {readerArtifact} from '../../src/publication/shell';
import {publicRoute} from '../../src/publication/directory';
/** Publication records share the Cavern job facility and its pinned filesystem primitives.
 * Version-1 preparation records are neither migrated nor interpreted here. */
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import type {PublicationStorage,PublicationRecord} from '../../src/application-services/publication-ports';
import type {PublicationSite,PublicFile} from '../../src/application-services/publication-contracts';
import {jobId} from '../../src/application-services/validation';
export const sha=(bytes:Uint8Array|string)=>createHash('sha256').update(bytes).digest('hex');
const filesystem=()=>import(pathToFileURL(path.resolve('scripts/stage-c-gates/filesystem.mjs')).href);
type Dir={path:string;identity:{dev:string;ino:string}};
const hash=(v:string)=>{if(!/^[a-f0-9]{64}$/.test(v))throw Error('Invalid publication hash');};
const json=(v:unknown)=>Buffer.from(JSON.stringify(v));
export class CavernPublicationStorage implements PublicationStorage {
 private tail:Promise<unknown>=Promise.resolve();private closed=false;
 constructor(private root:string,private cavernId:string,private fault:(at:string)=>Promise<void>=async()=>{}){}
 private async dir(parent:Dir,name:string,create=true,fd?:number):Promise<Dir>{
  const fs=await filesystem();try{const s=await fs.atDirectory(parent,{kind:'stat',name},fd);if(!s.directory)throw Error('Invalid publication directory');return {path:path.join(parent.path,name),identity:s.identity};}
  catch(e){if(!create||(e as any).code!=='ENOENT')throw e;try{return await fs.createDirectory(parent,name,fd);}catch(e){if((e as any).code!=='EEXIST')throw e;return this.dir(parent,name,false,fd);}}
 }
 private async home(name='publications'){const fs=await filesystem();return this.dir(await this.dir(await fs.pinDirectory(this.root),'.mutable'),name);}
 private async lock(dir:Dir,name='writer.lock',shared=false){
  const fs=await filesystem();try{await fs.atDirectory(dir,{kind:'create',name,data:Buffer.alloc(0),maxBytes:0});}catch(e){if((e as any).code!=='EEXIST')throw e;}
  const s=await fs.atDirectory(dir,{kind:'stat',name});try{return await fs.lockFile(dir,name,s.identity,shared);}catch(e){if(['EAGAIN','EWOULDBLOCK'].includes((e as any).code))throw Error('Publication is executing in another host');throw e;}
 }
 private transaction<T>(fn:(home:Dir,fd:number)=>Promise<T>):Promise<T>{
  if(this.closed)return Promise.reject(Error('Publication storage closed'));
  const run=this.tail.then(async()=>{const home=await this.home(),lease=await this.lock(home);try{return await fn(home,lease.fd);}finally{await lease.close();}});this.tail=run.catch(()=>{});return run;
 }
 private async names(dir:Dir,fd?:number){const fs=await filesystem(),names:string[]=[];for(let offset=0;;){const page=await fs.atDirectory(dir,{kind:'list',offset,limit:100},fd);for(const e of page.entries){if(e.symlink)throw Error('Unsafe publication entry');names.push(e.name);}if(names.length>10000)throw Error('Publication storage entry limit; maintenance required');if(page.next===undefined)return names;offset=page.next;}}
 private async bytes(dir:Dir,name:string,limit=2*1024*1024,fd?:number):Promise<Buffer>{return (await (await filesystem()).atDirectory(dir,{kind:'read',name,maxBytes:limit},fd)).data;}
 private async putFile(dir:Dir,name:string,bytes:Uint8Array,fd:number,usage?:{bytes:number}){
  if(bytes.length>16*1024*1024)throw Error('Publication file exceeds 16 MiB');
  try{const existing=await this.bytes(dir,name,16*1024*1024,fd);if(!existing.equals(Buffer.from(bytes)))throw Error('Immutable publication conflict');return;}catch(e){if((e as any).code!=='ENOENT')throw e;}
  const fs=await filesystem();let retained=bytes.length+(usage?.bytes??0);if(!usage)for(const entry of await this.names(dir,fd))retained+=(await fs.atDirectory(dir,{kind:'stat',name:entry},fd)).size??0;
  if(retained>128*1024*1024)throw Error('Publication retention budget exceeded; maintenance required');
  const stage=`stage-${randomUUID()}`,s=await fs.atDirectory(dir,{kind:'create',name:stage,data:Buffer.from(bytes),maxBytes:16*1024*1024},fd);
  await this.fault('staged');await fs.atDirectory(dir,{kind:'publish',name,source:stage,expectedIdentity:s.identity},fd);await this.fault('published');await fs.atDirectory(dir,{kind:'unlink',name:stage,expectedIdentity:s.identity},fd);if(usage)usage.bytes+=bytes.length;
 }
 private async latest<T>(dir:Dir,fd:number):Promise<{value:T;revision:number}>{
  const names=(await this.names(dir,fd)).filter(n=>/^revision-\d{4}\.json$/.test(n)).sort();if(!names.length){const error:any=Error('No publication record');error.code='ENOENT';throw error;}
  if(names.length>256||names.some((n,i)=>n!==`revision-${String(i).padStart(4,'0')}.json`))throw Error('Incomplete publication history');
  let previous:string|null=null,value:any;
  for(const name of names){const bytes=await this.bytes(dir,name,2*1024*1024,fd),envelope=JSON.parse(bytes.toString());if(envelope.cavernId!==this.cavernId||envelope.previous!==previous||envelope.digest!==sha(json(envelope.value)))throw Error('Publication record integrity mismatch');value=envelope.value;previous=sha(bytes);}
  return {value,revision:names.length-1};
 }
 private async revision<T>(dir:Dir,value:T,expected:number,fd:number){
  let previous:null|string=null,revision=-1;try{const current=await this.latest<T>(dir,fd);revision=current.revision;previous=sha(await this.bytes(dir,`revision-${String(revision).padStart(4,'0')}.json`,2*1024*1024,fd));}catch(e){if((e as any).code!=='ENOENT')throw e;}
  if(revision!==expected)throw Error('Publication revision conflict');if(revision>=254)throw Error('Publication revision limit; create a new job');
  const record=json({cavernId:this.cavernId,previous,digest:sha(json(value)),value});if(record.length>2*1024*1024)throw Error('Publication review record exceeds 2 MiB');
  await this.putFile(dir,`revision-${String(revision+1).padStart(4,'0')}.json`,record,fd);
 }
 private async siteDir(home:Dir,id:string,fd:number,create=false){jobId(id);return this.dir(home,id,create,fd);}
 private async jobDir(id:string,fd:number,create=false){jobId(id);return this.dir(await this.home('jobs'),`publication-${id}`,create,fd);}
 private async siteAt(home:Dir,id:string,fd:number){const r=await this.latest<PublicationSite>(await this.siteDir(home,id,fd),fd);if(r.value.id!==id||r.value.version!==1||r.value.revision!==r.revision)throw Error('Invalid site record');return r.value;}
 sites(){return this.transaction(async(home,fd)=>{const ids=(await this.names(home,fd)).filter(n=>/^[a-f0-9-]{36}$/.test(n)).sort();if(ids.length>100)throw Error('Site count limit');const out=[];for(const id of ids)out.push(await this.siteAt(home,id,fd));return out;});}
 site(id:string){return this.transaction((home,fd)=>this.siteAt(home,id,fd));}
 writeSite(site:PublicationSite,expected:number){return this.transaction(async(home,fd)=>{if(expected===-1&&(await this.names(home,fd)).filter(n=>/^[a-f0-9-]{36}$/.test(n)).length>=100)throw Error('Site count limit');const next={...site,revision:expected+1};await this.revision(await this.siteDir(home,site.id,fd,true),next,expected,fd);return next;});}
 private async loadAt(id:string,fd:number){const d=await this.jobDir(id,fd);if(await this.marked(d,fd))throw Object.assign(Error('Publication job removed'),{code:'ENOENT'});const r=await this.latest<PublicationRecord>(await this.jobDir(id,fd),fd);if(r.value.job.version!==2||r.value.job.id!==id||r.value.job.revision!==r.revision||r.value.job.siteId!==r.value.site.id)throw Error('Invalid publication job');return r.value;}
 create(record:PublicationRecord){return this.transaction(async(_,fd)=>{
  const jobs=await this.home('jobs'),names=await this.jobNames(fd);if(!names.includes(`publication-${record.job.id}`)&&names.filter(n=>n.startsWith('publication-')).length>=1000)throw Error('Publication job limit');
  const dir=await this.jobDir(record.job.id,fd,true);if(await this.marked(dir,fd))throw Error('Deleted job identity cannot be reused');
  try{const r=await this.loadAt(record.job.id,fd);if(r.site.id!==record.site.id||r.site.revision!==record.site.revision||r.job.buildMode!==record.job.buildMode)throw Error('Publication job identity has different input');return r;}catch(e){if((e as any).code!=='ENOENT')throw e;}
  await this.revision(dir,record,-1,fd);return record;
 });}
 load(id:string){return this.transaction((_,fd)=>this.loadAt(id,fd));}
 list(siteId:string,after?:string){jobId(siteId);if(after)jobId(after);return this.transaction(async(_,fd)=>{const out:PublicationRecord[]=[],names=(await this.jobNames(fd)).filter(n=>/^publication-[a-f0-9-]{36}$/.test(n)&&(!after||n.slice(12)>after)).sort();for(const n of names.slice(0,50)){const r=await this.loadAt(n.slice(12),fd);if(r.site.id===siteId)out.push(r);}return {records:out,...names.length>50?{next:names[49].slice(12)}:{}};});}
 checkpoint(record:PublicationRecord,expected:number){return this.transaction(async(_,fd)=>{const old=await this.loadAt(record.job.id,fd);if(JSON.stringify(old.site)!==JSON.stringify(record.site))throw Error('Publication plan is immutable');const next={...record,job:{...record.job,revision:expected+1}};await this.revision(await this.jobDir(next.job.id,fd),next,expected,fd);return next;});}
 async acquire(id:string){return this.transaction(async(_,fd)=>{const d=await this.jobDir(id,fd);if(await this.marked(d,fd))throw Error('Publication job removed');return this.lock(d,'execution.lock');});}
 private async clearUnitStages(dir:Dir,fd:number){
  // Only unreachable temporary names, under the unit/release writer lease. Never
  // remove immutable blobs, receipts, canonical data or managed asset originals.
  for(const name of await this.names(dir,fd))if(/^stage-[a-f0-9-]{36}$/.test(name)){const fs=await filesystem(),s=await fs.atDirectory(dir,{kind:'stat',name},fd);await fs.atDirectory(dir,{kind:'unlink',name,expectedIdentity:s.identity},fd);}
 }
 private async unitDir(id:string,key:string,fd:number,create=false){if(!/^(?:doc-[0-9]{4}|inventory|reader)$/.test(key))throw Error('Invalid publication unit');return this.dir(await this.dir(await this.jobDir(id,fd),'units',create,fd),key,create,fd);}
 unit<T>(id:string,key:string,value?:T):Promise<T|undefined>{return this.transaction(async(_,fd)=>{
  let dir:Dir;try{dir=await this.unitDir(id,key,fd,value!==undefined);}catch(e){if((e as any).code==='ENOENT'&&value===undefined)return;throw e;}
  if(value!==undefined){await this.clearUnitStages(dir,fd);const b=json(value);if(b.length>2*1024*1024)throw Error('Unit receipt budget exceeded');await this.putFile(dir,'receipt.json',json({value,digest:sha(b)}),fd);await this.fault('unit');return value;}
  let b:Buffer;try{b=await this.bytes(dir,'receipt.json',3*1024*1024,fd);}catch(e){if((e as any).code==='ENOENT')return;throw e;}
  const r=JSON.parse(b.toString());if(sha(json(r.value))!==r.digest)throw Error('Unit receipt integrity mismatch');return r.value;
 });}
 put(id:string,bytes:Uint8Array,unit?:string){return this.transaction(async(_,fd)=>{
  const dir=unit?await this.unitDir(id,unit,fd,true):await this.jobDir(id,fd),h=sha(bytes);if(unit)await this.clearUnitStages(dir,fd);await this.putFile(dir,`blob-${h}`,bytes,fd);return h;
 });}
 read(id:string,h:string,unit?:string){hash(h);return this.transaction(async(_,fd)=>{const dir=unit?await this.unitDir(id,unit,fd):await this.jobDir(id,fd),b=await this.bytes(dir,`blob-${h}`,16*1024*1024,fd);if(sha(b)!==h)throw Error('Publication artifact integrity mismatch');return new Uint8Array(b);});}
 /** Verify and copy one bounded cache object under one writer lease. Source errors
  * are cache misses; destination publication errors must still stop the job. */
 reuseProjection(sourceId:string,sourceUnit:string,id:string,unit:string,fingerprint:string){return this.transaction(async(_,fd)=>{
  let data:Buffer,h:string;
  try{
   const source=await this.unitDir(sourceId,sourceUnit,fd),receipt=JSON.parse((await this.bytes(source,'receipt.json',3*1024*1024,fd)).toString());
   if(sha(json(receipt.value))!==receipt.digest||receipt.value.projection?.fingerprint!==fingerprint)return;
   h=receipt.value.projection.hash;hash(h);data=await this.bytes(source,`blob-${h}`,16*1024*1024,fd);if(sha(data)!==h)return;
  }catch{return;}
  const destination=await this.unitDir(id,unit,fd,true);await this.clearUnitStages(destination,fd);await this.putFile(destination,`blob-${h}`,data,fd);return {bytes:new Uint8Array(data),hash:h};
 });}
 private async releaseDir(home:Dir,siteId:string,release:string,fd:number,create=false){hash(release);return this.dir(await this.dir(await this.siteDir(home,siteId,fd),'releases',create,fd),release,create,fd);}
 private async publicPath(dir:Dir,p:string,fd:number,create=false){
  if(!publicRoute(p)&&!readerArtifact(p)&&! /^(?:reader\.css|assets\/[a-f0-9]{64}\.(?:png|jpg))$/.test(p))throw Error('Invalid public artifact path');
  const parts=p.split('/');for(const part of parts.slice(0,-1))dir=await this.dir(dir,part,create,fd);return {dir,name:parts.at(-1)!};
 }
 commit(record:PublicationRecord,signal?:AbortSignal){return this.commitDirectory(record,signal);}
 private async commitDirectory(record:PublicationRecord,signal?:AbortSignal){
  const files=[...record.files].sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0),release=sha(json(publicManifest(files)));
  if(files.length>2002||files.reduce((n,f)=>n+f.size,0)>128*1024*1024)throw Error('Directory release budget exceeded');
  const existing=await this.transaction(async(home,fd)=>{
   const site=await this.siteAt(home,record.site.id,fd);if(!site.releases.includes(release))return false;
   if(site.committedJobs?.[record.job.id]===release)return true;
   if(site.revision!==record.site.revision)throw Error('Site changed; review required');
   const dir=await this.releaseDir(home,site.id,release,fd);if(await this.marked(dir,fd))throw Error('Release maintenance pending');
   const manifest=await this.bytes(dir,'manifest.json',1024*1024,fd);if(sha(manifest)!==release)throw Error('Existing release integrity mismatch');
   for(const file of files){signal?.throwIfAborted();const target=await this.publicPath(await this.dir(dir,'public',false,fd),file.path,fd),b=await this.bytes(target.dir,target.name,16*1024*1024,fd);if(sha(b)!==file.hash||b.length!==file.size)throw Error('Existing release integrity mismatch');}
   await this.revision(await this.siteDir(home,site.id,fd),{...site,revision:site.revision+1,active:release,committedJobs:{...site.committedJobs,[record.job.id]:release}},site.revision,fd);return true;
  });if(existing)return release;
  const dir=await this.transaction(async(home,fd)=>{const site=await this.siteAt(home,record.site.id,fd);if(site.committedJobs?.[record.job.id]!==release&&site.revision!==record.site.revision)throw Error('Site changed; review required');return this.releaseDir(home,site.id,release,fd,true);});
  // A release-specific OS lease protects staged artifacts. The site metadata lock is
  // acquired only for admission and the final compare-and-swap, never the page sweep.
  const lease=await this.lock(dir,'release.lock');
  try{
   await this.revive(dir,lease.fd);const pub=await this.dir(dir,'public',true,lease.fd),usage=new Map<string,{bytes:number}>();
   for(const file of files){signal?.throwIfAborted();const source=file.unit?await this.unitDir(record.job.id,file.unit,lease.fd):await this.jobDir(record.job.id,lease.fd),b=await this.bytes(source,`blob-${file.hash}`,16*1024*1024,lease.fd);if(sha(b)!==file.hash||b.length!==file.size)throw Error('Release artifact integrity mismatch');
    const target=await this.publicPath(pub,file.path,lease.fd,true);let size=usage.get(target.dir.path);
    if(!size){await this.clearUnitStages(target.dir,lease.fd);size={bytes:0};for(const n of await this.names(target.dir,lease.fd))size.bytes+=(await (await filesystem()).atDirectory(target.dir,{kind:'stat',name:n},lease.fd)).size??0;usage.set(target.dir.path,size);}
    await this.putFile(target.dir,target.name,b,lease.fd,size);
   }
   await this.clearUnitStages(dir,lease.fd);await this.putFile(dir,'manifest.json',json(publicManifest(files)),lease.fd);await this.fault('sealed');signal?.throwIfAborted();
   return await this.transaction(async(home,fd)=>{signal?.throwIfAborted();const site=await this.siteAt(home,record.site.id,fd);if(site.committedJobs?.[record.job.id]===release&&site.releases.includes(release))return release;
    if(site.revision!==record.site.revision)throw Error('Site changed; review required');if(site.releases.length>=100&&!site.releases.includes(release))throw Error('Retained release limit; maintenance required');
    await this.revision(await this.siteDir(home,site.id,fd),{...site,revision:site.revision+1,active:release,releases:[...new Set([...site.releases,release])],committedJobs:{...site.committedJobs,[record.job.id]:release}},site.revision,fd);await this.fault('committed');return release;
   });
  }finally{await lease.close();}
 }
 release(siteId:string,release:string){return this.transaction(async(home,fd)=>{const site=await this.siteAt(home,siteId,fd);if(!site.releases.includes(release))throw Error('Release is not committed');const dir=await this.releaseDir(home,siteId,release,fd);if(await this.marked(dir,fd))throw Error('Release removed');const b=await this.bytes(dir,'manifest.json',1024*1024,fd);if(sha(b)!==release)throw Error('Release manifest integrity mismatch');return JSON.parse(b.toString()) as PublicFile[];});}
 file(siteId:string,release:string,file:PublicFile){return this.transaction(async(home,fd)=>{const site=await this.siteAt(home,siteId,fd);if(!site.releases.includes(release))throw Error('Uncommitted release');const dir=await this.releaseDir(home,siteId,release,fd);if(await this.marked(dir,fd))throw Error('Release removed');const manifest=await this.bytes(dir,'manifest.json',1024*1024,fd);if(sha(manifest)!==release||!(JSON.parse(manifest.toString()) as PublicFile[]).some(f=>JSON.stringify(f)===JSON.stringify(file)))throw Error('File not in sealed manifest');const target=await this.publicPath(await this.dir(dir,'public',false,fd),file.path,fd);const bytes=await this.bytes(target.dir,target.name,16*1024*1024,fd);if(bytes.length!==file.size||sha(bytes)!==file.hash)throw Error('Release file integrity mismatch');return new Uint8Array(bytes);});}
 async folder(siteId:string,release:string){const files=await this.release(siteId,release);return {relativePath:`.mutable/publications/${siteId}/releases/${release}/public`,files:files.length};}
 private async exists(dir:Dir,name:string,fd:number){try{await (await filesystem()).atDirectory(dir,{kind:'stat',name},fd);return true;}catch(e){if((e as any).code==='ENOENT')return false;throw e;}}
 private async marked(dir:Dir,fd:number){return await this.exists(dir,'deleting.json',fd)||await this.exists(dir,'deleted.json',fd);}
 private async jobNames(fd:number){const home=await this.home('jobs'),out:string[]=[];for(const n of await this.names(home,fd))if(/^publication-[a-f0-9-]{36}$/.test(n)){const d=await this.dir(home,n,false,fd);if(!await this.marked(d,fd))out.push(n);}return out;}
 private target(t:MaintenanceTarget){if(!t||Object.keys(t).some(k=>!['kind','id'].includes(k)))throw Error('Invalid maintenance target');if(t.kind==='job')jobId(t.id);else if(t.kind==='release')hash(t.id);else throw Error('Invalid maintenance kind');}
 private async targetDir(home:Dir,siteId:string,t:MaintenanceTarget,fd:number){return t.kind==='job'?this.jobDir(t.id,fd):this.releaseDir(home,siteId,t.id,fd);}
 /** Bounded traversal only within a pinned publication-owned tree. */
 private async tree(dir:Dir,fd:number,remove=false,signal?:AbortSignal,depth=0,budget={entries:0},root=true):Promise<{bytes:number;files:number}>{
  if(depth>20)throw Error('Publication maintenance depth limit');const fs=await filesystem();let bytes=0,files=0;
  for(const name of await this.names(dir,fd)){signal?.throwIfAborted();if(++budget.entries>20000)throw Error('Publication maintenance entry limit');
   const s=await fs.atDirectory(dir,{kind:'stat',name},fd);
   if(s.directory){const child={path:path.join(dir.path,name),identity:s.identity},r=await this.tree(child,fd,remove,signal,depth+1,budget,false);bytes+=r.bytes;files+=r.files;if(remove)await fs.atDirectory(dir,{kind:'rmdir',name,expectedIdentity:s.identity},fd);}
   else{if(!s.file)throw Error('Unsafe publication maintenance entry');bytes+=s.size;files++;if(remove&&!(root&&['execution.lock','release.lock','deleting.json','deleted.json'].includes(name)))await fs.atDirectory(dir,{kind:'unlink',name,expectedIdentity:s.identity},fd);}
  }return {bytes,files};
 }
 private async maintenanceAt(home:Dir,siteId:string,t:MaintenanceTarget,fd:number):Promise<MaintenanceReview>{
  this.target(t);const site=await this.siteAt(home,siteId,fd),dir=await this.targetDir(home,siteId,t,fd),pending=await this.exists(dir,'deleting.json',fd)&&!await this.exists(dir,'deleted.json',fd),blocked:string[]=[];let jobRevision:number|undefined;
  if(await this.exists(dir,'deleted.json',fd))throw Error('Already deleted');
  if(t.kind==='job'){
   if(pending){const mark=JSON.parse((await this.bytes(dir,'deleting.json',4096,fd)).toString());if(mark.siteId!==siteId)throw Error('Job belongs to another site');jobRevision=mark.jobRevision;}
   else{const r=await this.loadAt(t.id,fd);if(r.site.id!==siteId)throw Error('Job belongs to another site');jobRevision=r.job.revision;if(!['completed','cancelled'].includes(r.job.state))blocked.push('Cancel or complete the job first; resumable evidence is protected.');}
  }else{
   if(site.active===t.id)blocked.push('The active release cannot be deleted.');
   for(const n of await this.jobNames(fd)){const r=await this.loadAt(n.slice(12),fd);if(r.site.id===siteId&&(r.job.release===t.id||r.files.length&&sha(json(publicManifest(r.files)))===t.id))blocked.push(`Retained job ${r.job.id} references this release; remove that job first.`);}
  }
  return {siteId,siteRevision:site.revision,target:t,...jobRevision!==undefined?{jobRevision}:{},...await this.tree(dir,fd),blocked,pending};
 }
 maintenanceList(siteId:string,offset=0){jobId(siteId);if(!Number.isInteger(offset)||offset<0||offset>10000)throw Error('Invalid maintenance offset');return this.transaction(async(home,fd)=>{
  await this.siteAt(home,siteId,fd);const targets:MaintenanceTarget[]=[];
  let releases:Dir|undefined;try{releases=await this.dir(await this.siteDir(home,siteId,fd),'releases',false,fd);}catch(e){if((e as any).code!=='ENOENT')throw e;}
  if(releases)for(const id of (await this.names(releases,fd)).sort())if(/^[a-f0-9]{64}$/.test(id)&&!await this.exists(await this.dir(releases,id,false,fd),'deleted.json',fd))targets.push({kind:'release',id});
  const jobs=await this.home('jobs');for(const n of (await this.names(jobs,fd)).sort())if(/^publication-[a-f0-9-]{36}$/.test(n)){
   const dir=await this.dir(jobs,n,false,fd);if(await this.exists(dir,'deleted.json',fd))continue;
   const owner=await this.exists(dir,'deleting.json',fd)?JSON.parse((await this.bytes(dir,'deleting.json',4096,fd)).toString()).siteId:(await this.loadAt(n.slice(12),fd)).site.id;
   if(owner===siteId)targets.push({kind:'job',id:n.slice(12)});
  }return {targets:targets.slice(offset,offset+50),...offset+50<targets.length?{next:offset+50}:{}};
 });}
 maintenanceInspect(siteId:string,t:MaintenanceTarget){jobId(siteId);return this.transaction((home,fd)=>this.maintenanceAt(home,siteId,t,fd));}
 maintenanceDelete(review:MaintenanceReview,signal?:AbortSignal){jobId(review.siteId);this.target(review.target);return this.transaction(async(home,fd)=>{
  const current=await this.maintenanceAt(home,review.siteId,review.target,fd);
  if(current.siteRevision!==review.siteRevision||current.jobRevision!==review.jobRevision||current.bytes!==review.bytes||current.files!==review.files||current.pending!==review.pending)throw Error('Maintenance review changed; inspect again');
  if(current.blocked.length)throw Error(current.blocked.join(' '));signal?.throwIfAborted();
  const dir=await this.targetDir(home,review.siteId,review.target,fd),lease=await this.lock(dir,review.target.kind==='job'?'execution.lock':'release.lock');
  try{
   await this.putFile(dir,'deleting.json',json({siteId:review.siteId,jobRevision:review.jobRevision}),fd);await this.fault('maintenance-marked');
   if(review.target.kind==='release'){const site=await this.siteAt(home,review.siteId,fd);if(site.releases.includes(review.target.id))await this.revision(await this.siteDir(home,site.id,fd),{...site,revision:site.revision+1,releases:site.releases.filter(r=>r!==review.target.id)},site.revision,fd);}
   await this.fault('maintenance-detached');await this.tree(dir,fd,true,signal);await this.fault('maintenance-pruned');await this.putFile(dir,'deleted.json',json({deleted:true}),fd);
  }finally{await lease.close();}
 });}
 private async revive(dir:Dir,fd:number){
  if(!await this.marked(dir,fd))return;if(!await this.exists(dir,'deleted.json',fd))throw Error('Release maintenance pending; finish deletion first');
  const fs=await filesystem();for(const name of await this.names(dir,fd))if(!['release.lock','deleted.json','deleting.json'].includes(name))throw Error('Deleted release contains unexpected data');
  for(const name of ['deleted.json','deleting.json'])if(await this.exists(dir,name,fd)){const s=await fs.atDirectory(dir,{kind:'stat',name},fd);await fs.atDirectory(dir,{kind:'unlink',name,expectedIdentity:s.identity},fd);}
 }
 leaseRelease(siteId:string,release:string){jobId(siteId);hash(release);return this.transaction(async(home,fd)=>{const site=await this.siteAt(home,siteId,fd);if(!site.releases.includes(release))throw Error('Release not committed');const d=await this.releaseDir(home,siteId,release,fd);if(await this.marked(d,fd))throw Error('Release removed');return this.lock(d,'release.lock',true);});}
 async close(){this.closed=true;await this.tail;}
}
