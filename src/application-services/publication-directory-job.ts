import {readerArtifacts} from './publication-reader';
import type {PublicationPorts,PublicationRecord} from './publication-ports';
import type {PublicFile} from './publication-contracts';
import type {DirectoryInventory,DirectoryEntry} from '../publication/directory';
import {DIRECTORY_LIMITS,directoryIndex} from '../publication/directory';
import {READER_CSS,PUBLICATION_VERSION} from '../publication/policy';
import type {Projection} from '../publication/projection';
const bytes=(s:string)=>new TextEncoder().encode(s);
export interface DocumentReceipt {entry:DirectoryEntry;files:PublicFile[];text:string;diagnostics:string[];omittedAnnotations:number;omittedBlocks:number;headings?:string[];search?:import('../publication/search').SearchEntry;occurrences?:import('../publication/research').SemanticOccurrence[]}
export function inventoryHash(p:PublicationPorts,inventory:DirectoryInventory){return p.hash(bytes(JSON.stringify(inventory.documents.map(d=>({location:d.location,resourceId:d.resourceId,hash:d.hash,size:d.size})))));}
export function directoryDigest(p:PublicationPorts,r:PublicationRecord){return p.hash(bytes(JSON.stringify({version:PUBLICATION_VERSION,site:r.site,nativeHash:inventoryHash(p,r.directory!),files:r.files,research:r.research})));}
export async function validateDirectory(p:PublicationPorts,r:PublicationRecord,signal:AbortSignal){
 signal.throwIfAborted();if(!p.inventory)throw Error('Directory publication unavailable');
 if((await p.storage.site(r.site.id)).revision!==r.site.revision)throw Error('Site changed; review required');
 const inventory=await p.inventory(r.site.directory!.scope,signal);
 const pages=r.site.directory!.pages;
 if(inventory.documents.length!==pages.length||inventory.documents.some(d=>!pages.some(e=>e.resourceId===d.resourceId)))throw Error('Directory membership changed; inventory and review required');
 if(r.directory&&inventoryHash(p,inventory)!==inventoryHash(p,r.directory))throw Error('Saved directory inputs changed; review required');
 if(r.job.review&&r.job.review.digest!==directoryDigest(p,r))throw Error('Directory policy or prepared inputs changed; review required');
 return {...inventory,documents:inventory.documents.map(d=>({...d,...pages.find(e=>e.resourceId===d.resourceId)!}))};
}
/** One native document/worker task at a time. Immutable per-document receipts, bounded phase checkpoints. */
export async function prepareDirectory(p:PublicationPorts,initial:PublicationRecord,signal:AbortSignal,checkpoint:(r:PublicationRecord,phase:string)=>Promise<PublicationRecord>){
 let r=initial;
 const previous=await p.storage.unit<DirectoryInventory>(r.job.id,'inventory');
 if(previous)r={...r,directory:previous};
 const inventory=await validateDirectory(p,r,signal);
 if(!previous)await p.storage.unit(r.job.id,'inventory',inventory);
 r={...r,directory:inventory};r=await checkpoint(r,'Project directory pages');
 const files=new Map<string,PublicFile>();let assetBytes=0,omittedAnnotations=0,omittedBlocks=0,reused=0;
 const add=(f:PublicFile)=>{const existing=files.get(f.path);if(existing&&existing.hash!==f.hash)throw Error('Public artifact collision');if(!existing){files.set(f.path,f);if(f.path.startsWith('assets/'))assetBytes+=f.size;}
  if(files.size>DIRECTORY_LIMITS.files||[...files.values()].reduce((n,f)=>n+f.size,0)>DIRECTORY_LIMITS.outputBytes||assetBytes>DIRECTORY_LIMITS.assetBytes||[...files.keys()].filter(k=>k.startsWith('assets/')).length>DIRECTORY_LIMITS.assets)throw Error('Directory artifact budget exceeded');};
 const pages=inventory.documents.map(({resourceId,route,title})=>({resourceId,route,title}));
 for(let i=0;i<inventory.documents.length;i++){
  signal.throwIfAborted();const entry=inventory.documents[i],key=`doc-${String(i).padStart(4,'0')}`;
  let receipt=await p.storage.unit<DocumentReceipt>(r.job.id,key);
  if(receipt){if(JSON.stringify(receipt.entry)!==JSON.stringify(entry))throw Error('Unit input changed; review required');
   const native=await p.storage.read(r.job.id,entry.hash,key);if(native.length!==entry.size)throw Error('Captured input integrity mismatch');
   for(const f of receipt.files){const b=await p.storage.read(r.job.id,f.hash,f.unit);if(b.length!==f.size)throw Error('Unit output integrity mismatch');}reused++;
  }else{
   const doc=await p.native({location:entry.location,expectedHash:entry.hash},signal);if(doc.resourceId!==entry.resourceId)throw Error('Saved identity changed; review required');
   await p.storage.put(r.job.id,bytes(doc.native),key);
   const projection=await p.executor.run({kind:'publication-project',native:bytes(doc.native),profile:{...r.site.profile,title:entry.title,route:entry.route},cavernId:p.cavernId,research:r.research,directory:{namespace:r.site.id,route:entry.route,home:r.site.profile.route,pages}},signal) as Projection;
   let html=projection.html;const unitFiles:PublicFile[]=[];const seen=new Set<string>();
   for(const a of projection.assets){if(seen.has(a.reference.assetId))continue;seen.add(a.reference.assetId);
    let f=[...files.values()].find(f=>f.path.startsWith(a.path+'.'));
    if(!f){const original=await p.asset(a.reference.assetId,signal);if(original.cavernId!==p.cavernId||original.bytes.length>10*1024*1024||!['image/png','image/jpeg'].includes(original.mediaType)||`sha256:${p.hash(original.bytes)}`!==a.reference.assetId)throw Error('Original image integrity or size mismatch');
     if(assetBytes+original.bytes.length>DIRECTORY_LIMITS.assetBytes)throw Error('Directory image budget exceeded');
     f={path:`${a.path}.${original.mediaType==='image/png'?'png':'jpg'}`,hash:await p.storage.put(r.job.id,original.bytes,key),size:original.bytes.length,mediaType:original.mediaType,unit:key};add(f);
    }
    // Projection uses relative paths; all pages share one immutable asset destination.
    const prefix='../'.repeat(entry.route.split('/').length-1);html=html.split(`src="${prefix}${a.path}"`).join(`src="${prefix}${f.path}"`);unitFiles.push(f);
   }
   const b=bytes(html);if(b.length>16*1024*1024)throw Error('Public page exceeds limit');
   unitFiles.push({path:entry.route,hash:await p.storage.put(r.job.id,b,key),size:b.length,mediaType:'text/html',unit:key});
   receipt={entry,files:unitFiles,text:projection.text,diagnostics:projection.diagnostics,omittedAnnotations:projection.omittedAnnotations,omittedBlocks:projection.omittedBlocks,headings:projection.headings,search:projection.search,occurrences:projection.occurrences};
   await p.storage.unit(r.job.id,key,receipt);
  }
  receipt.files.forEach(add);omittedAnnotations+=receipt.omittedAnnotations;omittedBlocks+=receipt.omittedBlocks;
  if((i+1)%25===0)r=await checkpoint(r,`Prepared ${i+1}/${inventory.documents.length} documents (${reused} recovered units)`);
 }
 for(const [path,text,mediaType] of [[r.site.profile.route,directoryIndex(r.site.profile,pages),'text/html'],...r.site.profile.reader?[]:[['reader.css',READER_CSS,'text/css']]]){const b=bytes(text);add({path,hash:await p.storage.put(r.job.id,b),size:b.length,mediaType});}
 if(r.site.profile.reader){const jobId=r.job.id;const receipts=async function*(){for(let i=0;i<inventory.documents.length;i++){signal.throwIfAborted();const receipt=await p.storage.unit<DocumentReceipt>(jobId,`doc-${String(i).padStart(4,'0')}`);if(!receipt)throw Error('Missing reader document receipt');yield receipt;}};for(const f of await readerArtifacts(p,r,receipts(),signal))add(f);}
 r={...r,files:[...files.values()].sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0)};
 r={...r,job:{...r.job,review:{digest:directoryDigest(p,r),nativeHash:inventoryHash(p,inventory),profile:r.site.profile,text:`${pages.length} saved documents. Review each page and its diagnostics below. Public navigation includes every approved page title and route.`,diagnostics:inventory.diagnostics,files:r.files,omittedAnnotations,omittedBlocks,...r.research?{semantics:r.research.entries}:{}}}};
 await validateDirectory(p,r,signal);return r;
}
