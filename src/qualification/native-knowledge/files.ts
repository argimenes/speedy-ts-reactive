/** Read-only bounded filesystem probe. Not a production managed-store replacement. */
import {promises as fs,constants as C} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {decode,extract,PROFILE} from './extract';
import {KnowledgeIndex} from './index';
export const nativeName=(name:string)=>name.endsWith('.ink')||name.endsWith('.mutable.json');
/** Earlier stem.md collision probe only. The later .ink.md recommendation is report-only. */
export const markdownName=(name:string)=>name.replace(/\.(ink|mutable\.json)$/,'.md');
const hash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
export interface FileEvidence {path:string;size:number;mtimeMs:number;hash?:string;resourceId?:string;profile:string}
export async function discover(root:string,signal?:AbortSignal){
 const base=await fs.realpath(root),top=await fs.lstat(root);if(top.isSymbolicLink()||!top.isDirectory())throw Error('Unsafe vault root');
 const files:FileEvidence[]=[],diagnostics:string[]=[];let entries=0;
 async function walk(relative:string,depth:number){if(depth>32){diagnostics.push('Directory depth budget');return;}signal?.throwIfAborted();
  for(const item of (await fs.readdir(path.join(base,relative),{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
   if(++entries>100000)throw Error('Discovery budget exceeded');
   if(item.name==='.mutable'||item.name.startsWith('.mutable-'))continue;
   const name=path.posix.join(relative,item.name);if(item.isSymbolicLink()){diagnostics.push(`${name}: symlink omitted`);continue;}
   if(item.isDirectory())await walk(name,depth+1);
   else if(item.isFile()&&nativeName(item.name)){const stat=await fs.lstat(path.join(base,name));if(stat.isSymbolicLink()||!stat.isFile())throw Error('File changed during discovery');files.push({path:name,size:stat.size,mtimeMs:stat.mtimeMs,profile:PROFILE});}
  }
 }
 await walk('',0);
 const claims=new Map<string,string[]>();for(const f of files){const key=markdownName(f.path).normalize('NFC').toLocaleLowerCase('en-US');const names=claims.get(key)??[];names.push(f.path);claims.set(key,names);}
 const collision=new Set<string>();for(const names of claims.values())if(names.length>1){names.forEach(n=>collision.add(n));diagnostics.push(`Projection name collision: ${names.join(', ')}`);}
 return {base,files,collision,diagnostics};
}
export async function readNative(root:string,relative:string){
 if(path.isAbsolute(relative)||relative.split(/[\\/]/).some(p=>p==='..'||p===''||p==='.')||relative.includes('\0'))throw Error('Invalid relative path');
 const base=await fs.realpath(root);let current=base;
 for(const part of relative.split('/')){current=path.join(current,part);if((await fs.lstat(current)).isSymbolicLink())throw Error('Symlink omitted');}
 if(!path.relative(base,await fs.realpath(current)).split(path.sep).every(p=>p!=='..'))throw Error('Outside vault');
 const h=await fs.open(current,C.O_RDONLY|C.O_NOFOLLOW);
 try{const before=await h.stat();if(!before.isFile()||before.size>20*1024*1024)throw Error('Unsupported file size/type');const bytes=await h.readFile();const after=await h.stat(),visible=await fs.lstat(current);
  if(before.size!==after.size||before.mtimeMs!==after.mtimeMs||before.ctimeMs!==after.ctimeMs||visible.ino!==after.ino||visible.dev!==after.dev||visible.isSymbolicLink())throw Error('File changed while reading');
  return {bytes,hash:hash(bytes),size:after.size,mtimeMs:after.mtimeMs};
 }finally{await h.close();}
}
export async function rebuild(root:string,signal?:AbortSignal,onProgress?:(n:number)=>void){
 const start=performance.now(),scan=await discover(root,signal),discoveryMs=performance.now()-start;
 const index=new KnowledgeIndex(),diagnostics=[...scan.diagnostics],evidence:FileEvidence[]=[],times={readHashMs:0,decodeMs:0,extractMs:0,insertMs:0};
 const identities=new Map<string,string>();let nativeBytes=0,peakHeap=process.memoryUsage().heapUsed;
 for(const file of scan.files){signal?.throwIfAborted();if(scan.collision.has(file.path))continue;
  try{let t=performance.now();const read=await readNative(scan.base,file.path);nativeBytes+=read.bytes.length;times.readHashMs+=performance.now()-t;
   t=performance.now();const resource=decode(read.bytes);times.decodeMs+=performance.now()-t;
   evidence.push({...file,size:read.size,mtimeMs:read.mtimeMs,hash:read.hash,resourceId:resource.resourceId});
   if(identities.has(resource.resourceId)){index.rejectIdentity(resource.resourceId);diagnostics.push(`Duplicate resource identity ${resource.resourceId}: ${identities.get(resource.resourceId)}, ${file.path}`);continue;}identities.set(resource.resourceId,file.path);
   t=performance.now();const facts=await extract(resource,file.path,read.hash,signal);times.extractMs+=performance.now()-t;
   t=performance.now();index.putSaved(facts);times.insertMs+=performance.now()-t;
  }catch(error){signal?.throwIfAborted();diagnostics.push(`${file.path}: ${String(error)}`);}
  peakHeap=Math.max(peakHeap,process.memoryUsage().heapUsed);onProgress?.(evidence.length);
 }
 return {index,evidence,diagnostics,metrics:{discoveryMs,...times,totalMs:performance.now()-start,nativeBytes,peakHeap,files:scan.files.length}};
}
