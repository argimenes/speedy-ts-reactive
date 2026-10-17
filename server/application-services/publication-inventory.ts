import path from 'node:path';
import {pathToFileURL} from 'node:url';
import type {DirectoryScope,DirectoryInventory} from '../../src/publication/directory';
import {DIRECTORY_LIMITS,directoryScope} from '../../src/publication/directory';
import type {ServiceCapabilities} from '../../src/application-services/capabilities';
/** Explicit bounded enumeration. Each path component is opened through the pinned helper. */
export async function publicationInventory(root:string,scope:DirectoryScope,read:ServiceCapabilities['readNative'],signal?:AbortSignal):Promise<DirectoryInventory>{
 directoryScope(scope);const fs=await import(pathToFileURL(path.resolve('scripts/stage-c-gates/filesystem.mjs')).href);
 let home=await fs.pinDirectory(root);for(const part of scope.folder==='.'?[]:scope.folder.split('/')){const s=await fs.atDirectory(home,{kind:'stat',name:part});if(!s.directory||s.symlink)throw Error('Unsafe directory scope');home={path:path.join(home.path,part),identity:s.identity};}
 const out:DirectoryInventory={documents:[],diagnostics:[],directories:[]};let count=0,total=0;const ids=new Set<string>();
 const walk=async(dir:any,relative:string,depth:number)=>{
  if(depth>16)throw Error('Publication directory depth limit');
  for(let offset=0;;){signal?.throwIfAborted();const page=await fs.atDirectory(dir,{kind:'list',offset,limit:100});
   for(const e of page.entries){signal?.throwIfAborted();if(++count>DIRECTORY_LIMITS.entries)throw Error('Publication inventory exceeds 5,000 entries');if(e.name.startsWith('.'))continue;
    const name=relative?`${relative}/${e.name}`:e.name;
    if(scope.excluded.some(p=>name===p||name.startsWith(p+'/'))){out.diagnostics.push(`Excluded: ${name}`);continue;}
    if(e.symlink){out.diagnostics.push(`Symlink omitted: ${name}`);continue;}
    const stat=await fs.atDirectory(dir,{kind:'stat',name:e.name});
    if(stat.directory){out.directories.push(name);if(scope.recursive)await walk({path:path.join(dir.path,e.name),identity:stat.identity},name,depth+1);continue;}
    if(!stat.file||! /\.(?:ink|phosphor|mutable\.json)$/.test(e.name)){out.diagnostics.push(`Non-native entry omitted: ${name}`);continue;}
    if(out.documents.length>=DIRECTORY_LIMITS.documents)throw Error('Publication exceeds 1,000 documents');
    const folder=[scope.folder==='.'?'':scope.folder,relative].filter(Boolean).join('/')||'.',location={folder,filename:e.name},doc=await read({location},signal),size=Buffer.byteLength(doc.native);
    if(size>8*1024*1024||(total+=size)>DIRECTORY_LIMITS.nativeBytes)throw Error('Publication saved input byte budget exceeded');
    if(ids.has(doc.resourceId))throw Error('Ambiguous duplicate native identity in selected scope');ids.add(doc.resourceId);
    out.documents.push({location,resourceId:doc.resourceId,hash:doc.sha256,size,route:'',title:''});
   }
   if(page.next===undefined)break;offset=page.next;
  }
 };
 await walk(home,'',0);out.documents.sort((a,b)=>{const x=`${a.location.folder}/${a.location.filename}`,y=`${b.location.folder}/${b.location.filename}`;return x<y?-1:x>y?1:0;});out.directories.sort();out.diagnostics.sort();
 if(!out.documents.length)throw Error('No saved native documents in selected scope');return out;
}
