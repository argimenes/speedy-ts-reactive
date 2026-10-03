/** Verified source identity within an established Mutable Vault; no suffix-derived identity. */
import path from 'node:path';
import { promises as fs, constants as C } from 'node:fs';
import { hash } from '../src/persistence/managed-pair.mjs';
import { documentIdentities, recognizeCompatibleDocument } from '../src/persistence/compatible-document';
/** Reject media/prose by the whole-file JSON prefix, never by filename. A possible
 * JSON candidate still requires complete bounded inspection; exhaustion is unknown. */
async function inspectIdentities(store, file) {
 const h=await fs.open(await store.resolve(file),C.O_RDONLY|C.O_NOFOLLOW);
 try {
  if(!(await h.stat()).isFile())throw Error('Expected regular identity candidate');
  const prefix=Buffer.alloc(4096),{bytesRead}=await h.read(prefix,0,prefix.length,0);
  let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(prefix.subarray(0,bytesRead),{stream:true});}catch{return [];}
  const first=text.trimStart()[0];
  if(first!==undefined&&first!=='{'&&first!=='[')return [];
 }finally{await h.close();}
 return documentIdentities(await store.read(file));
}
export async function verifyDocumentSource(store,vault,source,signal,recovery) {
 const file=path.posix.join(source.location.folder,source.location.filename);
 let root,resolved;try{root=await store.resolve(vault);resolved=await store.resolve(file,{missing:!!recovery});}catch(e){throw Error('Document source evidence unavailable: '+e.message);}
 const relative=path.relative(root,resolved);
 if(relative.startsWith('..')||path.isAbsolute(relative))throw Error('Document source outside its Vault');
 const fence=await store.readScopeFence(vault,signal),scan=await store.discover(vault,{signal});
 if((!scan.complete&&!(recovery&&!scan.diagnostics.length&&scan.documentSaves?.every(o=>o.resourceId===source.resourceId)))||scan.operations.some(o=>o.phase==='pending'))throw Error('Incomplete or pending Vault evidence; Refresh required');
 if(scan.documents.some(d=>d.resourceId===source.resourceId&&['pending','ambiguous'].includes(d.state)))throw Error('Document source evidence is pending or ambiguous');
 let matches=scan.documents.filter(d=>d.resourceId===source.resourceId).map(d=>path.posix.join(d.location.folder,d.location.filename));
 for(const p of scan.other){signal?.throwIfAborted();try{for(const id of await inspectIdentities(store,p))if(id===source.resourceId)matches.push(p);}catch(e){throw Error(`Cannot verify Document identities in ${p}: ${e.message}`);}}
 if(!(matches.length===1&&matches[0]===file)&&!(recovery&&matches.length===0))throw Error('Document source identity is missing or ambiguous in this Vault');
 await store.guardReadPath(file);
 const bytes=await store.read(file,!!recovery);
 if(bytes&&hash(bytes)!==source.byteHash&&hash(bytes)!==recovery?.desired)throw Error('Document source changed since Open/Save; explicit reconciliation required');
 if(bytes&&recognizeCompatibleDocument(bytes).resource.resourceId!==source.resourceId)throw Error('Document source identity changed');
 if(await store.readScopeFence(vault,signal)!==fence)throw Error('Document source scope changed during verification');
 return {bytes,scan};
}
