/** Bounded native Document routes. No Workspace writer or global resource catalog. */
import { Router, json } from 'express';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ManagedPair, hash, nativeFlock } from '../src/persistence/managed-pair.mjs';
import { decodeNative } from '../src/persistence/native-resource';
import { exportMarkdown } from '../src/persistence/markdown';
const flock = nativeFlock, LIMIT = 20 * 1024 * 1024;
const fail = (message, status = 409) => { throw Object.assign(new Error(message), { status }); };
const read = async file => { try { const s = await fs.lstat(file); if (!s.isFile() || s.isSymbolicLink() || s.size > LIMIT) fail('Expected a bounded regular file', 400); return await fs.readFile(file); } catch(e) { if(e.code !== 'ENOENT') throw e; } };
const fields = (v, names) => v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === names.length && Object.keys(v).every(k => names.includes(k));
export function createNativeDocumentStoreRouter({root, readOnly = false, fault = async () => {}}) {
 const router = Router(); router.use(json({limit:'32mb'}));
 const directory = async folder => {
  if(typeof folder !== 'string' || path.isAbsolute(folder) || /[\\\0]/.test(folder) || folder.split('/').includes('..')) fail('Invalid document folder',400);
  const base = await fs.realpath(root), dir = await fs.realpath(path.resolve(base,folder));
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
 const lock = async (dir, action) => {
  const file=path.join(dir,'.mutable-store.lock');await read(file);const handle=await fs.open(file,'a+');
  try {try{await flock(handle.fd,'exnb');}catch(e){if(e.code==='EAGAIN'||e.code==='EWOULDBLOCK')fail('Another native publication is active; retry',409);fail('Native pair locking is unavailable on this server',503);}return await action();}finally{await handle.close();}
 };
 const baseline = async pair => ({nativeHash: await read(pair.file('native')).then(b=>b?hash(b):null),markdownHash:await read(pair.file('markdown')).then(b=>b?hash(b):null),generation:(await pair.receipt())?.generation??null});
 const route = (method,name,action) => router[method](name,async(req,res)=>{try{res.json({Success:true,Data:await action(req)});}catch(e){res.status(e.status??(e.conflict?409:e.code==='ENOENT'?404:500)).json({Success:false,Error:e.message,PublicationStarted:!!req.nativePublicationStarted});}});
 const writable=()=>{if(readOnly)fail('Server Documents are read-only. Paired Save requires a writable managed server store.',403);};
 route('get','/list',async req=>{const dir=await directory(req.query.folder??'.');return {files:(await fs.readdir(dir,{withFileTypes:true})).filter(e=>e.isFile()&&!e.name.startsWith('.')&&/\.(mutable\.json|md)$/.test(e.name)).map(e=>e.name).sort(),readOnly};});
 route('post','/open',async req=>{
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
  if(!fields(observed,['nativeHash','markdownHash','generation']) || ![observed.nativeHash,observed.markdownHash].every(h=>h===null||typeof h==='string'&&/^[a-f0-9]{64}$/.test(h)) || !(observed.generation===null||typeof observed.generation==='string'))fail('Caller baseline required',400);
  if(!generation||typeof generation.native!=='string'||typeof generation.markdown!=='string'||Buffer.byteLength(generation.native)>LIMIT||Buffer.byteLength(generation.markdown)>LIMIT||!Array.isArray(generation.targets)||generation.targets.length>256)fail('Invalid captured generation',400);
  const resource=decodeNative(new TextEncoder().encode(generation.native));if(resource.resourceId!==generation.resourceId)fail('Resource identity mismatch');
  const projection=exportMarkdown(resource,generation.targets);if(projection.text!==generation.markdown||projection.profile!==generation.profile)fail('Markdown is not the supplied native generation projection');
  const pair=await store(location,resource.resourceId,dependencies),dir=path.dirname(pair.file('native'));
  return lock(dir,async()=>{
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
   const evidence=await pair.pending()??await pair.receipt();
   if(!evidence||evidence.generation!==req.body.generation)fail('Recovery generation changed or unavailable');
   req.nativePublicationStarted=true;return {result:await pair.recover(),baseline:await baseline(pair)};
  });
 });
 route('post','/compare',async req=>{const pair=await store(req.body.location,req.body.resourceId);return pair.compare('');});
 return router;
}
