/** Bounded native Document routes. No Workspace writer or global resource catalog. */
import { RecognizedDocumentStore } from './recognized-document-store.mjs';
import { verifyDocumentSource } from './recognized-source.mjs';
import { openSqliteFoundation } from '../src/knowledge-sqlite/client.mjs';
import { Router, json } from 'express';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ManagedPair, hash } from '../src/persistence/managed-pair.mjs';
import { installNativeKnowledgeRoutes } from './native-knowledge-routes.mjs';
import { NativeVaultStore } from './native-vault-store.mjs';
import { decodeNative } from '../src/persistence/native-resource';
import { exportMarkdown } from '../src/persistence/markdown';
import { recognizeCompatibleDocument, encodeRecognizedDocument } from '../src/persistence/compatible-document';
const LIMIT = 20 * 1024 * 1024;
const fail = (message, status = 409) => { throw Object.assign(new Error(message), { status }); };
const read = async file => { try { const s = await fs.lstat(file); if (!s.isFile() || s.isSymbolicLink() || s.size > LIMIT) fail('Expected a bounded regular file', 400); return await fs.readFile(file); } catch(e) { if(e.code !== 'ENOENT') throw e; } };
const fields = (v, names) => v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === names.length && Object.keys(v).every(k => names.includes(k));
export function createNativeDocumentStoreRouter({root, readOnly = false, fault = async () => {}, nativeDiscoveryWorker = true, coordinate = action => action(), establishVault, defaultVault}) {
 const vault = new NativeVaultStore({root,readOnly,fault,nativeDiscoveryWorker});
 const recognizedStore=new RecognizedDocumentStore(vault);
 const router = Router(); router.use(json({limit:'32mb'}));
 const directory = async folder => {
  if(typeof folder !== 'string' || path.isAbsolute(folder) || /[\\\0]/.test(folder) || folder.split('/').includes('..')) fail('Invalid document folder',400);
  const base = await fs.realpath(root), dir = await vault.resolve(folder || '.');
  const relative = path.relative(base,dir); if(relative.startsWith('..') || path.isAbsolute(relative) || !(await fs.stat(dir)).isDirectory()) fail('Location is outside the document store',400);
  return dir;
 };
 const locate = async location => {
  if(!fields(location,['folder','filename']) || typeof location.filename !== 'string' || !/^[^./\\\0][^/\\\0]*\.(mutable\.json|md)$/.test(location.filename)) fail('Choose a native .mutable.json or Markdown .md filename',400);
  const dir = await directory(location.folder); return {dir, file:path.join(dir,location.filename)};
 };
 const guardedHome = async home => {
  let count=0;
  const walk=async dir=>{let entries;try {const stat=await fs.lstat(dir);if(stat.isSymbolicLink()||!stat.isDirectory())fail('Invalid pair directory',400);entries=await fs.readdir(dir,{withFileTypes:true});}catch(e){if(e.code==='ENOENT')return;throw e;}
   for(const entry of entries){if(++count>10000)fail('Pair archive requires maintenance',409);if(entry.isSymbolicLink()||(!entry.isDirectory()&&!entry.isFile()))fail('Invalid pair archive entry',400);if(entry.isDirectory())await walk(path.join(dir,entry.name));}
  };await walk(home);
 };
 const store = async (location, resourceId, dependencies=[]) => {
  const {dir}=await locate(location);if(!location.filename.endsWith('.mutable.json')||typeof resourceId!=='string'||!resourceId.trim())fail('Invalid native binding',400);
  if(!Array.isArray(dependencies)||dependencies.length>256)fail('Too many dependency locations',400);
  const locations=new Map();for(const item of dependencies){if(typeof item.resourceId!=='string'||locations.has(item.resourceId))fail('Ambiguous dependency location',400);const dep=await locate(item.location);if(!item.location.filename.endsWith('.mutable.json'))fail('Dependencies must be native files',400);await read(dep.file);locations.set(item.resourceId,dep.file);}
  const pair=new ManagedPair({root:dir,resourceId,nativeName:location.filename,markdownName:location.filename.replace(/\.mutable\.json$/,'.md'),locations,fault});
  await guardedHome(pair.home);await read(pair.file('native'));await read(pair.file('markdown'));return pair;
 };
 const lock = async (_dir, action) => vault.lock(action);
 const baseline = async pair => ({nativeHash: await read(pair.file('native')).then(b=>b?hash(b):null),markdownHash:await read(pair.file('markdown')).then(b=>b?hash(b):null),generation:(await pair.receipt())?.generation??null,...(await vault.guard(pair.resourceId,{folder:path.relative(vault.root,pair.root).split(path.sep).join('/')||'.',filename:pair.nativeName}) ? {locationRevision:await vault.guard(pair.resourceId)} : {})});
 const writes=new Set(['/recover-recognized','/save-recognized','/save','/recover','/vault/mkdir','/vault/relocate','/vault/recover']);
 const route = (method,name,action) => router[method](name,async(req,res)=>{try{const execute=()=>action(req,res);res.json({Success:true,Data:await (writes.has(name)?coordinate(execute):execute())});}catch(e){res.status(e.status??(e.conflict?409:e.code==='ENOENT'?404:500)).json({Success:false,Error:e.message,PublicationStarted:!!req.nativePublicationStarted||!!e.relocationStarted});}});
 installNativeKnowledgeRoutes(route,vault);
 const writable=()=>{if(readOnly)fail('Server Documents are read-only. Paired Save requires a writable managed server store.',403);};
 route('get','/list',async req=>{const dir=await directory(req.query.folder??'.');return {files:(await fs.readdir(dir,{withFileTypes:true})).filter(e=>e.isFile()&&!e.name.startsWith('.')&&/\.(mutable\.json|md)$/.test(e.name)).map(e=>e.name).sort(),readOnly};});
 route('get','/vault/default',async()=>({vault:defaultVault}));
 route('post','/vault/establish',async req=>{
  const root=await directory(req.body.vault);
  if(establishVault)return establishVault(req.body.vault);
  const client=await openSqliteFoundation({vault:root,initialize:true});
  try{return {vault:req.body.vault,vaultGuid:(await client.inspect()).mutable.vaultGuid};}finally{await client.close();}
 });
 route('post','/vault/discover',async (req,res)=>{
  const controller=new AbortController(),closed=()=>{if(!res.writableEnded)controller.abort();};res.once('close',closed);
  try{return await vault.discover(req.body.vault,{signal:controller.signal});}finally{res.off('close',closed);}
 });
 route('post','/vault/mkdir',async req=>vault.mkdir(req.body.vault,req.body.directory));
 route('post','/vault/relocate',async req=>vault.relocate(req.body));
 route('post','/vault/recover',async req=>vault.recover(req.body.operationId));
 route('post','/recover-recognized',async req=>{writable();if(establishVault)await establishVault(req.body.vault);return recognizedStore.recover(req.body.vault,req.body.resourceId,req.body.generation,()=>{req.nativePublicationStarted=true;});});
 route('post','/save-recognized',async req=>{writable();if(establishVault)await establishVault(req.body.vault);return recognizedStore.save(req.body,()=>{req.nativePublicationStarted=true;});});
 route('post','/verify-source',async req=>{await verifyDocumentSource(vault,req.body.vault,req.body.source);if(await recognizedStore.pending(req.body.vault,req.body.source.resourceId))fail('Document Save recovery is pending');return {verified:true};});
 route('post','/recognize',async req=>{
  const location=req.body.location;
  if(!fields(location,['folder','filename'])||typeof location.filename!=='string'||!location.filename||/[/\\\0]/.test(location.filename)||location.filename.startsWith('.'))fail('Choose a regular vault file',400);
  if(location.filename.endsWith('.mutable.json'))fail('Use native Open for enrolled native files',400);
  if(location.filename.endsWith('.md'))fail('Use explicit Import Markdown; the source will remain unchanged',400);
  await directory(location.folder);const relative=path.posix.join(location.folder||'.',location.filename);await vault.guardReadPath(relative);
  const bytes=await vault.read(relative);if(!bytes)fail('File not found',404);
  let recognized;try{recognized=recognizeCompatibleDocument(bytes);}catch(error){fail(error.message,400);}
  const again=await vault.read(relative);await vault.guardReadPath(relative);
  if(await vault.guard(recognized.resource.resourceId))fail('Known native relocation identity; Open its current native location instead');
  if(!again||hash(again)!==hash(bytes))fail('Source changed during recognition; retry Open');
  let saveCapability='in-place',saveReason;try{encodeRecognizedDocument(recognized.resource,recognized.format);}catch(e){saveCapability='unavailable';saveReason=e.message;}
  return {text:bytes.toString('utf8'),byteHash:hash(bytes),format:recognized.format,resourceId:recognized.resource.resourceId,readOnly,saveCapability,saveReason};
 });
 route('post','/open',async req=>{
  if(req.body.location?.filename?.endsWith('.mutable.json'))await vault.guardPath(req.body.location);
  const {file}=await locate(req.body.location),data=await read(file);if(!data)fail('File not found',404);
  if(req.body.location.filename.endsWith('.md'))return {kind:'markdown',text:data.toString(),readOnly};
  const native=data.toString(),resource=decodeNative(data),pair=await store(req.body.location,resource.resourceId);
  await fault('open-native-read',{file});
  const pending=await pair.pending(),observed=await baseline(pair);
  // Bind the caller's permission to the exact native bytes returned, never to
  // a later receipt/file sampled after another writer replaced those bytes.
  if(hash(data)!==observed.nativeHash)fail('Native file changed while opening; retry Open');
  return {kind:'native',native,resourceId:resource.resourceId,baseline:observed,pending:pending?{generation:pending.generation,resourceId:resource.resourceId}:null,readOnly};
 });
 route('post','/save',async req=>{
  writable();const {location,generation,baseline:observed,dependencies,acceptMarkdownHash}=req.body;
  if(!(fields(observed,['nativeHash','markdownHash','generation'])||fields(observed,['nativeHash','markdownHash','generation','locationRevision'])&&typeof observed.locationRevision==='string') || ![observed.nativeHash,observed.markdownHash].every(h=>h===null||typeof h==='string'&&/^[a-f0-9]{64}$/.test(h)) || !(observed.generation===null||typeof observed.generation==='string'))fail('Caller baseline required',400);
  if(!generation||typeof generation.native!=='string'||typeof generation.markdown!=='string'||Buffer.byteLength(generation.native)>LIMIT||Buffer.byteLength(generation.markdown)>LIMIT||!Array.isArray(generation.targets)||generation.targets.length>256)fail('Invalid captured generation',400);
  const resource=decodeNative(new TextEncoder().encode(generation.native));if(resource.resourceId!==generation.resourceId)fail('Resource identity mismatch');
  const projection=exportMarkdown(resource,generation.targets);if(projection.text!==generation.markdown||projection.profile!==generation.profile)fail('Markdown is not the supplied native generation projection');
  const pair=await store(location,resource.resourceId,dependencies),dir=path.dirname(pair.file('native'));
  return lock(dir,async()=>{
   await vault.guard(resource.resourceId,location,observed);
   // Recheck paths after acquiring the publication lock.
   await guardedHome(pair.home);await read(pair.file('native'));await read(pair.file('markdown'));
   const current=await read(pair.file('native'));if(current&&decodeNative(current).resourceId!==resource.resourceId)fail('Another resource owns this destination');
   const pending=await pair.pending();
   if(pending){
    if(pending.generation!==generation.generation||pending.nativeHash!==hash(generation.native)||pending.markdownHash!==hash(generation.markdown))fail('A different generation is pending');
    req.nativePublicationStarted=true;return {result:await pair.recover(),baseline:await baseline(pair)};
   }
   const receipt=await pair.receipt();
   if(receipt?.generation===generation.generation){if(receipt.nativeHash!==hash(generation.native)||receipt.markdownHash!==hash(generation.markdown))fail('Retry generation bytes differ');req.nativePublicationStarted=true;return {result:await pair.recover(),baseline:await baseline(pair)};}
   req.nativePublicationStarted=true;const result=await pair.save(generation,acceptMarkdownHash,observed);return {result,baseline:await baseline(pair)};
  });
 });
 route('post','/recover',async req=>{
  writable();const pair=await store(req.body.location,req.body.resourceId,req.body.dependencies);
  return lock(path.dirname(pair.file('native')),async()=>{
   await vault.guard(req.body.resourceId,req.body.location,req.body.baseline);
   if(await vault.guard(req.body.resourceId)&&!req.body.baseline)fail('Caller location baseline required');
   const evidence=await pair.pending()??await pair.receipt();
   if(!evidence||evidence.generation!==req.body.generation)fail('Recovery generation changed or unavailable');
   req.nativePublicationStarted=true;return {result:await pair.recover(),baseline:await baseline(pair)};
  });
 });
 route('post','/compare',async req=>{await vault.guard(req.body.resourceId,req.body.location);const pair=await store(req.body.location,req.body.resourceId);return pair.compare('');});
 return router;
}
