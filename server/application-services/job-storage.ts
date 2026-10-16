/** Node filesystem adapter: immutable checkpoints published with the existing
 * pinned-directory helper. No SQL, source paths or caller-selected filenames. */
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import type {JobStorage,JobRecord} from '../../src/application-services/capabilities';
import type {Preparation,JobSummary,JobPage} from '../../src/application-services/contracts';
import {jobId,preparation,jobSummary,SERVICE_LIMITS} from '../../src/application-services/validation';
const filesystem=()=>import(pathToFileURL(path.resolve('scripts/stage-c-gates/filesystem.mjs')).href);
const digest=(v:Uint8Array)=>createHash('sha256').update(v).digest('hex');
type Directory={path:string;identity:{dev:string;ino:string}};
export class CavernJobStorage implements JobStorage {
 private tail:Promise<unknown>=Promise.resolve();private homePromise?:Promise<Directory>;private closed=false;
 constructor(private root:string,private cavernId:string,private fault:(at:string)=>Promise<void>=async()=>{}){}
 private async directory(parent:Directory,name:string,create=false,fd?:number):Promise<Directory>{
  const fs=await filesystem();try{const s=await fs.atDirectory(parent,{kind:'stat',name},fd);if(!s.directory)throw Error('Invalid job directory');return {path:path.join(parent.path,name),identity:s.identity};}
  catch(e){if(!create||(e as any).code!=='ENOENT')throw e;try{return await fs.createDirectory(parent,name,fd);}catch(e){if((e as any).code!=='EEXIST')throw e;return this.directory(parent,name,false,fd);}}
 }
 private home(){return this.homePromise??=(async()=>{const fs=await filesystem();return this.directory(await this.directory(await fs.pinDirectory(this.root),'.mutable',true),'jobs',true);})().catch(e=>{this.homePromise=undefined;throw e;});}
 private async lock(dir:Directory,name:string){const fs=await filesystem();try{await fs.atDirectory(dir,{kind:'create',name,data:Buffer.alloc(0),maxBytes:0});}catch(e){if((e as any).code!=='EEXIST')throw e;}const s=await fs.atDirectory(dir,{kind:'stat',name});return fs.lockFile(dir,name,s.identity);}
 private locked<T>(action:(home:Directory,fd:number)=>Promise<T>):Promise<T>{
  if(this.closed)return Promise.reject(Error('Job storage closed'));
  const task=this.tail.then(async()=>{const home=await this.home(),lock=await this.lock(home,'writer.lock');try{return await action(home,lock.fd);}finally{await lock.close();}});this.tail=task.catch(()=>{});return task;
 }
 private async entries(dir:Directory,fd:number){const fs=await filesystem(),names:string[]=[];for(let offset=0;;){const page=await fs.atDirectory(dir,{kind:'list',offset,limit:100},fd);for(const e of page.entries){if(e.symlink)throw Error('Unsafe job entry');names.push(e.name);}if(names.length>2000)throw Error('Job storage requires maintenance');if(page.next===undefined)return names;offset=page.next;}}
 private async read(dir:Directory,name:string,maxBytes:number,fd:number){const fs=await filesystem();return (await fs.atDirectory(dir,{kind:'read',name,maxBytes},fd)).data as Buffer;}
 private async publish(dir:Directory,name:string,bytes:Uint8Array,maxBytes:number,fd:number){
  const fs=await filesystem(),temp=`stage-${randomUUID()}`;
  const s=await fs.atDirectory(dir,{kind:'create',name:temp,data:Buffer.from(bytes),maxBytes},fd);
  await this.fault('staged');await fs.atDirectory(dir,{kind:'publish',name,source:temp,expectedIdentity:s.identity},fd);await this.fault('published');
  await fs.atDirectory(dir,{kind:'unlink',name:temp,expectedIdentity:s.identity},fd);
 }
 private async record(home:Directory,id:string,fd:number):Promise<JobRecord>{
  jobId(id);const dir=await this.directory(home,id,false,fd),names=await this.entries(dir,fd),revisions=names.filter(n=>/^revision-\d{4}\.json$/.test(n)).sort();
  if(!revisions.length)throw Error('Job creation is incomplete; retry the same create request');
  if(revisions.length>SERVICE_LIMITS.revisions)throw Error('Job revision limit exceeded');
  const value=JSON.parse((await this.read(dir,revisions.at(-1)!,16384,fd)).toString()),request=await this.read(dir,'request.json',SERVICE_LIMITS.inputBytes,fd);
  jobSummary(value.summary,id,this.cavernId);
  if(revisions.some((name,i)=>name!==`revision-${String(i).padStart(4,'0')}.json`))throw Error('Job checkpoint history is incomplete');
  if(value.requestHash!==digest(request)||value.summary?.id!==id||value.summary.cavernId!==this.cavernId||value.summary.version!==1||revisions.at(-1)!==`revision-${String(value.summary.revision).padStart(4,'0')}.json`)throw Error('Invalid job recovery evidence');
  const input=JSON.parse(request.toString());preparation(input);if(input.kind!==value.summary.kind)throw Error('Job preparation kind changed');return {summary:value.summary,preparation:input,result:value.result};
 }
 create(id:string,input:Preparation){jobId(id);preparation(input);const bytes=Buffer.from(JSON.stringify(input));return this.locked(async(home,fd)=>{
  const names=await this.entries(home,fd);if(!names.includes(id)&&names.filter(n=>/^[a-f0-9-]{36}$/.test(n)).length>=SERVICE_LIMITS.jobs)throw Error('Job count limit reached');
  const dir=await this.directory(home,id,true,fd);let existing:Buffer|undefined;try{existing=await this.read(dir,'request.json',SERVICE_LIMITS.inputBytes,fd);}catch(e){if((e as any).code!=='ENOENT')throw e;}
  if(existing&&!existing.equals(bytes))throw Error('Job identity already has different input');
  if(!existing)await this.publish(dir,'request.json',bytes,SERVICE_LIMITS.inputBytes,fd);
  if((await this.entries(dir,fd)).some(n=>/^revision-/.test(n)))return this.record(home,id,fd);
  const now=new Date().toISOString(),summary:JobSummary={version:1,id,cavernId:this.cavernId,revision:0,state:'ready',kind:input.kind,created:now,updated:now};
  await this.publish(dir,'revision-0000.json',Buffer.from(JSON.stringify({summary,requestHash:digest(bytes)})),16384,fd);return {summary,preparation:input};
 });}
 load(id:string){return this.locked((home,fd)=>this.record(home,id,fd));}
 list(after?:string):Promise<JobPage>{if(after!==undefined)jobId(after);return this.locked(async(home,fd)=>{
  const names=(await this.entries(home,fd)).filter(n=>/^[a-f0-9-]{36}$/.test(n)&&(!after||n>after)).sort(),page:JobPage={jobs:[],diagnostics:[]};
  for(const id of names.slice(0,50))try{
   const dir=await this.directory(home,id,false,fd),revisions=(await this.entries(dir,fd)).filter(n=>/^revision-\d{4}\.json$/.test(n)).sort();if(!revisions.length)throw Error('Incomplete creation; retry original create request');
   const value=JSON.parse((await this.read(dir,revisions.at(-1)!,16384,fd)).toString());
   jobSummary(value.summary,id,this.cavernId);
   page.jobs.push(value.summary);
  }catch(e){page.diagnostics.push({id,message:String((e as Error).message).slice(0,200)});}
  if(names.length>50)page.next=names[49];return page;
 });}
 checkpoint(record:JobRecord,expectedRevision:number){return this.locked(async(home,fd)=>{
  const previous=await this.record(home,record.summary.id,fd);if(previous.summary.revision!==expectedRevision)throw Error('Job checkpoint conflict');
  if(expectedRevision+1>=SERVICE_LIMITS.revisions)throw Error('Job revision limit reached');
  if(JSON.stringify(previous.preparation)!==JSON.stringify(record.preparation))throw Error('Job input is immutable');
  const summary={...record.summary,cavernId:this.cavernId,revision:expectedRevision+1,updated:new Date().toISOString()};
  jobSummary(summary,previous.summary.id,this.cavernId);
  const dir=await this.directory(home,summary.id,false,fd),value={summary,result:record.result,requestHash:digest(Buffer.from(JSON.stringify(record.preparation)))};
  await this.publish(dir,`revision-${String(summary.revision).padStart(4,'0')}.json`,Buffer.from(JSON.stringify(value)),16384,fd);return {...record,summary};
 });}
 async acquire(id:string){jobId(id);const dir=await this.directory(await this.home(),id);try{return await this.lock(dir,'execution.lock');}catch(e){if(['EAGAIN','EWOULDBLOCK'].includes((e as any).code))throw Error('Job is executing in another host');throw e;}}
 putResult(id:string,bytes:Uint8Array){return this.locked(async(home,fd)=>{
  jobId(id);if(bytes.length>SERVICE_LIMITS.resultBytes)throw Error('Job result limit exceeded');
  const dir=await this.directory(home,id,false,fd),fs=await filesystem();let retained=0;
  for(const name of await this.entries(dir,fd)){const s=await fs.atDirectory(dir,{kind:'stat',name},fd);if(!s.file)throw Error('Unexpected job entry');retained+=s.size;}
  if(retained+bytes.length>128*1024*1024)throw Error('Job artifacts exceed retention budget; explicit maintenance required');
  const file=`result-${randomUUID()}.bin`;await this.publish(dir,file,bytes,SERVICE_LIMITS.resultBytes,fd);return {file,sha256:digest(bytes),bytes:bytes.length};
 });}
 readResult(id:string,result:NonNullable<JobRecord['result']>){return this.locked(async(home,fd)=>{jobId(id);if(!/^result-[a-f0-9-]{36}\.bin$/.test(result.file))throw Error('Invalid result reference');const bytes=await this.read(await this.directory(home,id,false,fd),result.file,SERVICE_LIMITS.resultBytes,fd);if(bytes.length!==result.bytes||digest(bytes)!==result.sha256)throw Error('Job result integrity mismatch');return new Uint8Array(bytes);});}
 async close(){this.closed=true;await this.tail;}
}
