/** Operation-local collection inventory. Paths are portable relative names, never OS paths. */
export const COLLECTION_LIMITS = { files:5000, documents:1000, bytes:512*1024*1024, text:8*1024*1024, image:10*1024*1024 };
export type Entry = {path:string;size:number;hash:string;kind:'markdown'|'html'|'text'|'image'|'skip';reason?:string};
export type Destination = {path:string;directory:boolean};
export type DocumentPlan = {source:string;path:string;id:string;status:'pending'|'completed'|'skipped'|'failed';error?:string;diagnosticCount?:number;nativeHash?:string};
export type CollectionPlan = {version:1;id:string;cavernId:string;vault:string;destination:string;mode:'native'|'source';entries:Entry[];documents:DocumentPlan[];directories:string[]};
export const fold = (value:string) => value.normalize('NFC').toLowerCase();
export function relativePath(value:string) {
 if(!value||value.length>240||/[\\\u0000-\u001f\u007f:<>"|?*]/.test(value)||value.split('/').some(p=>!p||p==='.'||p==='..'||/[. ]$/.test(p)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p)))throw Error(`Unsafe collection path: ${value}`);
 return value;
}
export const folderOf = (p:string)=>p.includes('/')?p.slice(0,p.lastIndexOf('/')):'';
export const joinPath = (...parts:string[])=>parts.filter(p=>p&&p!=='.').join('/')||'.';
export const ancestors = (p:string)=>p.split('/').slice(0,-1).map((_,i)=>p.split('/').slice(0,i+1).join('/'));
export function classify(path:string,size:number):Pick<Entry,'kind'|'reason'> {
 relativePath(path);
 if(path.split('/').some(p=>p.startsWith('.')||/^(node_modules|credentials|secrets)$/i.test(p))||/\.(pem|key|env)$/i.test(path))return {kind:'skip',reason:'Hidden, private or generated content excluded.'};
 const extension=path.split('.').at(-1)!.toLowerCase(),kind=extension==='md'||extension==='markdown'?'markdown':extension==='html'||extension==='htm'?'html':extension==='txt'?'text':['png','jpg','jpeg'].includes(extension)?'image':'skip';
 if(kind==='skip')return {kind,reason:'Unsupported file retained in inventory only.'};
 if(size>(kind==='image'?COLLECTION_LIMITS.image:COLLECTION_LIMITS.text))return {kind:'skip',reason:'File exceeds the per-file import limit.'};
 return {kind};
}
export function validateInventory(entries:Entry[]) {
 if(!entries.length||entries.length>COLLECTION_LIMITS.files||entries.reduce((n,e)=>n+e.size,0)>COLLECTION_LIMITS.bytes)throw Error('Collection limit: 5,000 files / 512 MiB.');
 const seen=new Map<string,{path:string;directory:boolean}>();for(const e of entries){relativePath(e.path);for(const path of [...ancestors(e.path),e.path]){const directory=path!==e.path,previous=seen.get(fold(path));if(previous&&(previous.path!==path||previous.directory!==directory||!directory))throw Error(`Case/Unicode path ambiguity: ${path}`);seen.set(fold(path),{path,directory});}}
 if(entries.filter(e=>!['skip','image'].includes(e.kind)).length>COLLECTION_LIMITS.documents)throw Error('Collection limit: 1,000 documents.');
}
export function allocate(entries:Entry[],existing:Destination[],options:Pick<CollectionPlan,'cavernId'|'vault'|'destination'|'mode'>,policy:'keep'|'skip'|'abort'='keep'):CollectionPlan {
 validateInventory(entries);if(options.destination!=='.'){relativePath(options.destination);if(options.destination.split('/').some(p=>p.startsWith('.')))throw Error('Choose a visible destination; hidden/internal directories are excluded.');}
 const occupied=new Map(existing.map(e=>[fold(e.path),e.directory]));
 const documents:DocumentPlan[]=[],directories=new Set<string>();
 // Map directories first, including file/directory conflicts, preserving shared ancestry.
 const dirs=[...new Set(entries.filter(e=>e.kind!=='skip').flatMap(e=>ancestors(e.path)))].sort((a,b)=>a.split('/').length-b.split('/').length||a.localeCompare(b));
 const directoryMap=new Map<string,string>();
 const available=(original:string,directory:boolean)=>{let candidate=original,n=2;while(occupied.has(fold(candidate))&&!(directory&&occupied.get(fold(candidate)))){if(policy==='abort')throw Error(`Destination collision: ${candidate}`);const at=directory?-1:original.lastIndexOf('.');candidate=at>original.lastIndexOf('/')?`${original.slice(0,at)} (${n++})${original.slice(at)}`:`${original} (${n++})`;}if(directory&&occupied.get(fold(candidate))){const exact=existing.find(e=>e.directory&&fold(e.path)===fold(candidate));if(exact)candidate=exact.path;}relativePath(candidate);occupied.set(fold(candidate),directory);return candidate;};
 let base='';if(options.destination!=='.')for(const part of options.destination.split('/')){base=available(joinPath(base,part),true);directories.add(base);}directoryMap.set('',base||'.');
 for(const dir of dirs){const parent=directoryMap.get(folderOf(dir))!,target=available(joinPath(parent,dir.split('/').at(-1)!),true);directoryMap.set(dir,target);directories.add(target);}
 for(const entry of [...entries].sort((a,b)=>a.path.localeCompare(b.path))) {
  if(['skip','image'].includes(entry.kind))continue;
  const original=joinPath(directoryMap.get(folderOf(entry.path))!,entry.path.split('/').at(-1)!.replace(/\.[^.]+$/,'')+'.ink');
  const collision=occupied.has(fold(original));
  const skipped=policy==='skip'&&collision;
  const path=skipped?original:available(original,false);
  documents.push({source:entry.path,path,id:crypto.randomUUID(),status:skipped?'skipped':'pending',...(collision?{error:skipped?'Destination exists; skipped.':`Kept both: ${original} → ${path}`}:{})});
 }
 for(const d of documents)ancestors(d.path).forEach(p=>directories.add(p));
 return {version:1,id:crypto.randomUUID(),...options,entries,documents,directories:[...directories].sort((a,b)=>a.split('/').length-b.split('/').length||a.localeCompare(b))};
}
function resolveCandidate(source:string,url:string,entries:Entry[],wiki=false):{entry?:Entry;reason?:string;external?:boolean} {
 if(/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(url))return {external:true};
 let decoded:string;try{decoded=decodeURIComponent(url);}catch{return {reason:'Invalid URL encoding'};}
 if(/[?#]/.test(url))return {reason:'Heading/block/query references are preserved without guessing a target'};
 if(decoded.includes('\\')||!decoded)return {reason:'Unsupported reference'};
 const root=wiki&&decoded.startsWith('/');if(!wiki&&decoded.startsWith('/'))return {reason:'Absolute paths are outside this collection'};
 const parts=(root?[]:folderOf(source).split('/').filter(Boolean));
 for(const part of (root?decoded.slice(1):decoded).split('/')){if(part==='..'){if(!parts.length)return {reason:'Reference escapes the selected directory'};parts.pop();}else if(part&&part!=='.')parts.push(part);}
 const path=parts.join('/');try{relativePath(path);}catch{return {reason:'Unsafe reference path'};}
 let matches=entries.filter(e=>e.kind!=='skip'&&e.path===path);
 if(!matches.length&&!/\.[^/]+$/.test(path))matches=entries.filter(e=>['markdown','html','text'].includes(e.kind)&&e.path.replace(/\.[^.]+$/,'')===path);
 if(matches.length!==1)return {reason:matches.length?'Ambiguous extensionless reference':'Missing or excluded target (no basename search)'};
 return {entry:matches[0]};
}

/** Wiki links may name an exact Vault-root or relative path; conflicting matches are never guessed. */
export function resolvePath(source:string,url:string,entries:Entry[],wiki=false):ReturnType<typeof resolveCandidate> {
 const local=resolveCandidate(source,url,entries,wiki);
 if(!wiki||local.external||url.startsWith('/')||/^\.\.?\//.test(url))return local;
 const root=resolveCandidate(source,'/'+url,entries,true);
 if(local.reason?.startsWith('Ambiguous')||root.reason?.startsWith('Ambiguous'))return {reason:'Ambiguous wiki reference'};
 if(local.entry&&root.entry&&local.entry.path!==root.entry.path)return {reason:'Ambiguous relative/Vault-root wiki reference'};
 return local.entry?local:root.entry?root:local;
}
export function relativeLink(from:string,to:string) {const a=folderOf(from).split('/').filter(Boolean),b=to.split('/');while(a.length&&a[0]===b[0]){a.shift();b.shift();}return [...a.map(()=>'..'),...b].map(p=>p==='..'?p:encodeURIComponent(p)).join('/');}
