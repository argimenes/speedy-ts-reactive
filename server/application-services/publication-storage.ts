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
 private async lock(dir:Dir,name='writer.lock'){
  const fs=await filesystem();try{await fs.atDirectory(dir,{kind:'create',name,data:Buffer.alloc(0),maxBytes:0});}catch(e){if((e as any).code!=='EEXIST')throw e;}
  const s=await fs.atDirectory(dir,{kind:'stat',name});try{return await fs.lockFile(dir,name,s.identity);}catch(e){if(['EAGAIN','EWOULDBLOCK'].includes((e as any).code))throw Error('Publication is executing in another host');throw e;}
 }
 private transaction<T>(fn:(home:Dir,fd:number)=>Promise<T>):Promise<T>{
  if(this.closed)return Promise.reject(Error('Publication storage closed'));
  const run=this.tail.then(async()=>{const home=await this.home(),lease=await this.lock(home);try{return await fn(home,lease.fd);}finally{await lease.close();}});this.tail=run.catch(()=>{});return run;
 }
 private async names(dir:Dir,fd?:number){const fs=await filesystem(),names:string[]=[];for(let offset=0;;){const page=await fs.atDirectory(dir,{kind:'list',offset,limit:100},fd);for(const e of page.entries){if(e.symlink)throw Error('Unsafe publication entry');names.push(e.name);}if(names.length>2048)throw Error('Publication storage entry limit; maintenance required');if(page.next===undefined)return names;offset=page.next;}}
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
 private async loadAt(id:string,fd:number){const r=await this.latest<PublicationRecord>(await this.jobDir(id,fd),fd);if(r.value.job.version!==2||r.value.job.id!==id||r.value.job.revision!==r.revision||r.value.job.siteId!==r.value.site.id)throw Error('Invalid publication job');return r.value;}
 create(record:PublicationRecord){return this.transaction(async(_,fd)=>{
  const jobs=await this.home('jobs'),names=await this.names(jobs,fd);if(!names.includes(`publication-${record.job.id}`)&&names.filter(n=>n.startsWith('publication-')).length>=1000)throw Error('Publication job limit');
  const dir=await this.jobDir(record.job.id,fd,true);
  try{const r=await this.loadAt(record.job.id,fd);if(r.site.id!==record.site.id||r.site.revision!==record.site.revision)throw Error('Publication job identity has different input');return r;}catch(e){if((e as any).code!=='ENOENT')throw e;}
  await this.revision(dir,record,-1,fd);return record;
 });}
 load(id:string){return this.transaction((_,fd)=>this.loadAt(id,fd));}
 list(siteId:string,after?:string){jobId(siteId);if(after)jobId(after);return this.transaction(async(_,fd)=>{const out:PublicationRecord[]=[],names=(await this.names(await this.home('jobs'),fd)).filter(n=>/^publication-[a-f0-9-]{36}$/.test(n)&&(!after||n.slice(12)>after)).sort();for(const n of names.slice(0,50)){const r=await this.loadAt(n.slice(12),fd);if(r.site.id===siteId)out.push(r);}return {records:out,...names.length>50?{next:names[49].slice(12)}:{}};});}
 checkpoint(record:PublicationRecord,expected:number){return this.transaction(async(_,fd)=>{const old=await this.loadAt(record.job.id,fd);if(JSON.stringify(old.site)!==JSON.stringify(record.site))throw Error('Publication plan is immutable');const next={...record,job:{...record.job,revision:expected+1}};await this.revision(await this.jobDir(next.job.id,fd),next,expected,fd);return next;});}
 async acquire(id:string){return this.lock(await this.jobDir(id,undefined),'execution.lock');}
 private async clearUnitStages(dir:Dir,fd:number){
  // Only unreachable temporary names, under the unit/release writer lease. Never
  // remove immutable blobs, receipts, canonical data or managed asset originals.
  for(const name of await this.names(dir,fd))if(/^stage-[a-f0-9-]{36}$/.test(name)){const fs=await filesystem(),s=await fs.atDirectory(dir,{kind:'stat',name},fd);await fs.atDirectory(dir,{kind:'unlink',name,expectedIdentity:s.identity},fd);}
 }
 private async unitDir(id:string,key:string,fd:number,create=false){if(!/^(?:doc-[0-9]{4}|inventory)$/.test(key))throw Error('Invalid publication unit');return this.dir(await this.dir(await this.jobDir(id,fd),'units',create,fd),key,create,fd);}
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
 private async releaseDir(home:Dir,siteId:string,release:string,fd:number,create=false){hash(release);return this.dir(await this.dir(await this.siteDir(home,siteId,fd),'releases',create,fd),release,create,fd);}
 private async publicPath(dir:Dir,p:string,fd:number,create=false){
  if(!publicRoute(p)&&! /^(?:reader\.css|assets\/[a-f0-9]{64}\.(?:png|jpg))$/.test(p))throw Error('Invalid public artifact path');
  const parts=p.split('/');for(const part of parts.slice(0,-1))dir=await this.dir(dir,part,create,fd);return {dir,name:parts.at(-1)!};
 }
 commit(record:PublicationRecord,signal?:AbortSignal){if(record.site.directory)return this.commitDirectory(record,signal);return this.transaction(async(home,fd)=>{
  const files=[...record.files].sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0),release=sha(json(files)),site=await this.siteAt(home,record.site.id,fd);
  if(site.committedJobs?.[record.job.id]===release&&site.releases.includes(release))return release;
  if(site.revision!==record.site.revision)throw Error('Site changed; review required');if(site.releases.length>=100)throw Error('Retained release limit; maintenance required');
  const dir=await this.releaseDir(home,site.id,release,fd,true),pub=await this.dir(dir,'public',true,fd);
  for(const file of files){signal?.throwIfAborted();const bytes=await this.bytes(file.unit?await this.unitDir(record.job.id,file.unit,fd):await this.jobDir(record.job.id,fd),`blob-${file.hash}`,16*1024*1024,fd);if(sha(bytes)!==file.hash||bytes.length!==file.size)throw Error('Release artifact integrity mismatch');const target=await this.publicPath(pub,file.path,fd,true);await this.putFile(target.dir,target.name,bytes,fd);}
  await this.putFile(dir,'manifest.json',json(files),fd);await this.fault('sealed');signal?.throwIfAborted();
  const next={...site,revision:site.revision+1,active:release,releases:[...new Set([...site.releases,release])],committedJobs:{...site.committedJobs,[record.job.id]:release}};
  await this.revision(await this.siteDir(home,site.id,fd),next,site.revision,fd);await this.fault('committed');return release;
 });}
 private async commitDirectory(record:PublicationRecord,signal?:AbortSignal){
  const files=[...record.files].sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0),release=sha(json(files));
  if(files.length>2002||files.reduce((n,f)=>n+f.size,0)>128*1024*1024)throw Error('Directory release budget exceeded');
  const dir=await this.transaction(async(home,fd)=>{const site=await this.siteAt(home,record.site.id,fd);if(site.committedJobs?.[record.job.id]!==release&&site.revision!==record.site.revision)throw Error('Site changed; review required');return this.releaseDir(home,site.id,release,fd,true);});
  // A release-specific OS lease protects staged artifacts. The site metadata lock is
  // acquired only for admission and the final compare-and-swap, never the page sweep.
  const lease=await this.lock(dir,'release.lock');
  try{
   const pub=await this.dir(dir,'public',true,lease.fd),usage=new Map<string,{bytes:number}>();
   for(const file of files){signal?.throwIfAborted();const source=file.unit?await this.unitDir(record.job.id,file.unit,lease.fd):await this.jobDir(record.job.id,lease.fd),b=await this.bytes(source,`blob-${file.hash}`,16*1024*1024,lease.fd);if(sha(b)!==file.hash||b.length!==file.size)throw Error('Release artifact integrity mismatch');
    const target=await this.publicPath(pub,file.path,lease.fd,true);let size=usage.get(target.dir.path);
    if(!size){await this.clearUnitStages(target.dir,lease.fd);size={bytes:0};for(const n of await this.names(target.dir,lease.fd))size.bytes+=(await (await filesystem()).atDirectory(target.dir,{kind:'stat',name:n},lease.fd)).size??0;usage.set(target.dir.path,size);}
    await this.putFile(target.dir,target.name,b,lease.fd,size);
   }
   await this.clearUnitStages(dir,lease.fd);await this.putFile(dir,'manifest.json',json(files),lease.fd);await this.fault('sealed');signal?.throwIfAborted();
   return await this.transaction(async(home,fd)=>{signal?.throwIfAborted();const site=await this.siteAt(home,record.site.id,fd);if(site.committedJobs?.[record.job.id]===release&&site.releases.includes(release))return release;
    if(site.revision!==record.site.revision)throw Error('Site changed; review required');if(site.releases.length>=100)throw Error('Retained release limit; maintenance required');
    await this.revision(await this.siteDir(home,site.id,fd),{...site,revision:site.revision+1,active:release,releases:[...new Set([...site.releases,release])],committedJobs:{...site.committedJobs,[record.job.id]:release}},site.revision,fd);await this.fault('committed');return release;
   });
  }finally{await lease.close();}
 }
 release(siteId:string,release:string){return this.transaction(async(home,fd)=>{const site=await this.siteAt(home,siteId,fd);if(!site.releases.includes(release))throw Error('Release is not committed');const b=await this.bytes(await this.releaseDir(home,siteId,release,fd),'manifest.json',1024*1024,fd);if(sha(b)!==release)throw Error('Release manifest integrity mismatch');return JSON.parse(b.toString()) as PublicFile[];});}
 file(siteId:string,release:string,file:PublicFile){return this.transaction(async(home,fd)=>{const site=await this.siteAt(home,siteId,fd);if(!site.releases.includes(release))throw Error('Uncommitted release');const dir=await this.releaseDir(home,siteId,release,fd),manifest=await this.bytes(dir,'manifest.json',1024*1024,fd);if(sha(manifest)!==release||!(JSON.parse(manifest.toString()) as PublicFile[]).some(f=>JSON.stringify(f)===JSON.stringify(file)))throw Error('File not in sealed manifest');const target=await this.publicPath(await this.dir(dir,'public',false,fd),file.path,fd);const bytes=await this.bytes(target.dir,target.name,16*1024*1024,fd);if(bytes.length!==file.size||sha(bytes)!==file.hash)throw Error('Release file integrity mismatch');return new Uint8Array(bytes);});}
 async folder(siteId:string,release:string){const files=await this.release(siteId,release);return {relativePath:`.mutable/publications/${siteId}/releases/${release}/public`,files:files.length};}
 async close(){this.closed=true;await this.tail;}
}
