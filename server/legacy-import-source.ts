/** Read-only Codex source characterization and conservative document admission. */
import {promises as fs, constants as C} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {recognizeCompatibleDocument} from '../src/persistence/compatible-document';
import {nativeText,decodeNative} from '../src/persistence/native-resource';
import {resourceToRepository} from '../src/history/durable-core';
import {encodeDocument} from '../src/block-tree/codecs';
import {isDerivedMarkdownName,isWorkspaceName} from '../src/persistence/document-file-names.mjs';
import {encodeAuthoredValue} from '../src/history/preplan-spike/authored-values.mjs';
export const digest=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex');
export const stable=(value:any):string=>JSON.stringify(value,(_key,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
/** UUIDv4-shaped deterministic public IDs, as required by the established services. */
export function importGuid(key:string){const b=createHash('sha256').update('mutable-codex-import-v1:'+key).digest().subarray(0,16);b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;const h=b.toString('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;}
export type ImportStatus='imported'|'imported-with-warning'|'skipped-as-unsupported'|'skipped-dependency-failed'|'invalid-source'|'ambiguous-mapping'|'architecture-conflict'|'unexpected-implementation-failure';
export interface SourceFile {path:string;hash:string;bytes:number;absolute:string}
export interface SourceRow {key:string;file:string;ordinal:number;hash:string;raw:any}
export interface DocumentCandidate {file:SourceFile;raw:any;blocks:any[];resourceId?:string;native?:string;destination:string;warnings:string[];transforms:any[];error?:string;status?:ImportStatus;projection?:any}
export interface SourceInventory {root:string;dataRoot:string;files:SourceFile[];fingerprint:string;bytes:number;nodes:Map<string,SourceRow[]>;edges:Map<string,SourceRow[]>;documents:DocumentCandidate[];excluded:any[];graphFailures:Array<{path:string;kind:string;family:string;reason:string}>}
export async function readSource(file:SourceFile){
 const h=await fs.open(file.absolute,C.O_RDONLY|C.O_NOFOLLOW);try{const st=await h.stat();if(!st.isFile()||st.size!==file.bytes)throw Error('Source changed or is not a regular file');const bytes=await h.readFile();if(digest(bytes)!==file.hash)throw Error('Source fingerprint changed');return bytes;}finally{await h.close();}
}
export function sourceBlocks(root:any){
 const blocks:any[]=[];
 const visit=(b:any,depth=0)=>{if(!b||typeof b!=='object'||Array.isArray(b)||typeof b.type!=='string'||depth>256||blocks.length>=100000)throw Error('Invalid/budget-exhausted authored Block tree');blocks.push(b);
  if(b.children!=null){if(!Array.isArray(b.children))throw Error('Invalid children');b.children.forEach(c=>visit(c,depth+1));}
  if(b.relation!=null)for(const [slot,c]of Object.entries(b.relation))if(c!=null&&(slot==='leftMargin'||slot==='rightMargin'||slot.startsWith('superposition:')))visit(c,depth+1);
 };visit(root);return blocks;
}
export async function inspectLegacySource(selected:string):Promise<SourceInventory>{
 const requested=path.resolve(selected),stat=await fs.lstat(requested);if(stat.isSymbolicLink()||!stat.isDirectory())throw Error('Source must be a real directory');
 const root=await fs.realpath(requested),files:SourceFile[]=[];
 const walk=async(dir:string,depth=0)=>{if(depth>32)throw Error('Source directory depth budget exceeded');for(const e of (await fs.readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){if(files.length>=100000)throw Error('Source file budget exceeded');if(e.isSymbolicLink())throw Error('Source symlinks are not admitted');const absolute=path.join(dir,e.name);if(e.isDirectory()){if(e.name!=='.git')await walk(absolute,depth+1);}else if(e.isFile()){const bytes=await fs.readFile(absolute);files.push({path:path.relative(root,absolute).split(path.sep).join('/'),absolute,bytes:bytes.length,hash:digest(bytes)});}else throw Error('Unsupported source entry');}};
 const dataRoot=await fs.stat(path.join(root,'data')).then(s=>s.isDirectory()?path.join(root,'data'):root).catch(()=>root);
 if(dataRoot!==root){await walk(dataRoot);for(const kind of ['nodes','edges']){const dir=path.join(root,'graph',kind);if(await fs.stat(dir).then(s=>s.isDirectory()).catch(()=>false))await walk(dir);}}else await walk(root);
 const inventory:SourceInventory={root,dataRoot,files,fingerprint:digest(stable(Object.fromEntries(files.map(f=>[f.path,f.hash])))),bytes:files.reduce((n,f)=>n+f.bytes,0),nodes:new Map(),edges:new Map(),documents:[],excluded:[],graphFailures:[]};
 for(const f of files){
  const graph=/^graph\/(nodes|edges)\/([^/]+)\.json$/.exec(f.path);
  if(graph){
   try{const rawRows=JSON.parse((await readSource(f)).toString());if(!Array.isArray(rawRows))throw Error('Graph export is not an array');
    const rows:SourceRow[]=[];rawRows.forEach((raw:any,ordinal:number)=>{if(!raw||typeof raw!=='object'||Array.isArray(raw)){inventory.graphFailures.push({path:f.path,kind:graph[1],family:graph[2],reason:'Malformed graph row #'+ordinal+'; dependent aggregate completeness is unknown'});return;}rows.push({key:`${f.path}#${ordinal}`,file:f.path,ordinal,hash:f.hash,raw});});
    (graph[1]==='nodes'?inventory.nodes:inventory.edges).set(graph[2],rows);
   }catch(error){inventory.graphFailures.push({path:f.path,kind:graph[1],family:graph[2],reason:String(error)});}continue;
  }
  if(!f.absolute.startsWith(dataRoot+path.sep)||f.path.startsWith('graph/'))continue;
  if(f.path.split('/').some(p=>p==='.memory'||p==='.mutable')||isDerivedMarkdownName(f.path)||isWorkspaceName(f.path)){inventory.excluded.push({path:f.path,status:'skipped-as-unsupported',reason:'History/private archive, derived projection or workspace-specific file; source retained'});continue;}
  if(f.bytes>20*1024*1024){inventory.excluded.push({path:f.path,status:'skipped-as-unsupported',reason:'Document read budget exceeded'});continue;}
  let raw:any;try{raw=JSON.parse((await readSource(f)).toString('utf8'));}catch{inventory.excluded.push({path:f.path,status:f.path.endsWith('.json')?'invalid-source':'skipped-as-unsupported',reason:'Not a compatible JSON BlockTree; bytes retained'});continue;}
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||typeof raw.type!=='string'){inventory.excluded.push({path:f.path,status:'skipped-as-unsupported',reason:'No authored BlockTree root; bytes retained'});continue;}
  const relative=path.relative(dataRoot,f.absolute).split(path.sep).join('/'),destination='documents/'+relative.replace(/\.(mutable\.json|json|ink)$/,'')+'.ink';
  const d:DocumentCandidate={file:f,raw,blocks:[],destination,warnings:[],transforms:[]};inventory.documents.push(d);
  try{d.blocks=sourceBlocks(raw);d.resourceId=raw.metadata?.documentId??raw.id;}catch(error){d.error=String(error);d.status='invalid-source';}
 }
 // Never select an arbitrary winner among differing copies/versions or shared authored IDs.
 const ids=new Map<string,DocumentCandidate[]>(),destinations=new Map<string,DocumentCandidate[]>();
 for(const d of inventory.documents){for(const b of d.blocks)if(typeof b.id==='string'&&b.id.trim()){const rows=ids.get(b.id)??[];rows.push(d);ids.set(b.id,rows);}const key=d.destination.normalize('NFC').toLowerCase(),rows=destinations.get(key)??[];rows.push(d);destinations.set(key,rows);}
 for(const rows of [...ids.values(),...destinations.values()])if(rows.length>1)for(const d of rows){d.error='Conflicting authored identity or destination shared by source files; no winner/remapping chosen';d.status='ambiguous-mapping';}
 const resources=new Map<string,DocumentCandidate[]>();for(const d of inventory.documents)if(d.resourceId){const rows=resources.get(d.resourceId)??[];rows.push(d);resources.set(d.resourceId,rows);}for(const rows of resources.values())if(rows.length>1)for(const d of rows){d.error='Resource identity claimed by multiple source documents';d.status='ambiguous-mapping';}
 return inventory;
}
export function convertLegacyDocument(d:DocumentCandidate,options:{zeroWidthAnnotations?:boolean}={}){
 if(d.error)return;
 try{
  const expected=structuredClone(d.raw),blocks=sourceBlocks(expected);
  for(const b of blocks)for(const [ordinal,p]of (b.standoffProperties??[]).entries()){
   if(p.zeroPoint===true){
    if(!options.zeroWidthAnnotations)throw Error('Legacy zeroPoint annotation semantics are unsupported; no one-cell/EOF reinterpretation');
    const cells=typeof b.text==='string'?[...b.text]:null,position=p.start;
    if(!cells||!Number.isSafeInteger(position)||position<0||position>cells.length)throw Error('Unrepresentable legacy zero-width text position');
    const original=structuredClone(p);
    // Native DTO ends are inclusive; end=start-1 encodes a collapsed span.
    // Saved SQL uses explicit UTF-16 positions for marked annotations, so EOF is text.length.
    p.end=position-1;p.isZeroWidth=true;
    d.transforms.push({rule:'legacy-zero-width-v1',blockGuid:b.id,ordinal,original,startIndex:cells.slice(0,position).join('').length,endIndex:cells.slice(0,position).join('').length,coordinate:'utf16',isZeroWidth:true});
   }
   if(p.type==='codex/entity-reference'&&typeof p.value==='string'){
    const qualified=/^Agent:⟨([0-9a-f-]{36})⟩$/i.exec(p.value);
    if(qualified){d.transforms.push({rule:'qualified-Agent-reference-v1',blockGuid:b.id,ordinal,from:p.value,to:qualified[1],original:structuredClone(p)});p.value=qualified[1];}
   }
  }
  const recognized=recognizeCompatibleDocument(Buffer.from(JSON.stringify(expected)));
  if(recognized.format!=='legacy-block-tree')throw Error('This importer only converts legacy BlockTree documents; other formats need their own migration');
  const native=nativeText(recognized.resource),reopened=decodeNative(Buffer.from(native));
  if(stable(encodeAuthoredValue(encodeDocument(resourceToRepository(reopened))))!==stable(encodeAuthoredValue(expected)))throw Error('Authored tree does not round-trip exactly');
  d.resourceId=reopened.resourceId;d.native=native;
 }catch(error){d.error=String(error);d.status=/zeroPoint|not a Document|Nested Document|own migration|does not round-trip/.test(d.error)?'skipped-as-unsupported':'invalid-source';}
}
