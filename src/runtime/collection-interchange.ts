import {createSignal} from 'solid-js';
import type {ReactiveEditor} from '../reactive-editor/editor';
import {allocate,classify,validateInventory,relativePath,joinPath,folderOf,ancestors,fold,COLLECTION_LIMITS,type Entry,type Destination,type CollectionPlan} from '../interchange/collection/plan';
import type {PreparedDocument} from '../interchange/collection/content';
import type {CollectionRequest} from '../interchange/collection/operations';
import {assetKey,type AssetManifest} from '../interchange/managed-asset';
import type {AssetLease} from './managed-assets';
import {runInterchange} from './interchange-worker';
import {IndexedCollectionJournal,type JournalStore,type CollectionJournal} from './collection-journal';
export type CollectionFile={path:string;blob:Blob};
export type ExportItem={path:string;selected:boolean};
const message=(e:unknown)=>e instanceof Error?e.message:String(e);
export const location=(vault:string,path:string)=>({folder:joinPath(vault,folderOf(path)),filename:path.split('/').at(-1)!});
/** No editor state subscription. Import is explicit create-only persistence, not an editor transaction. */
export class CollectionInterchange {
 private alive=true;private controller?:AbortController;private files=new Map<string,Blob>();private journal?:CollectionJournal;private session?:string;private cavern?:string;
 private planSignal=createSignal<CollectionPlan>();readonly plan=this.planSignal[0];
 private busySignal=createSignal(false);readonly busy=this.busySignal[0];
 private statusSignal=createSignal('');readonly status=this.statusSignal[0];
 private notesSignal=createSignal<string[]>([]);readonly notes=this.notesSignal[0];
 private exportsSignal=createSignal<ExportItem[]>([]);readonly exports=this.exportsSignal[0];
 private downloadSignal=createSignal<Uint8Array>();readonly download=this.downloadSignal[0];
 private reviewedVersion?:number;private reviewedJournalId?:string;private reviewedSession?:string;private exportSession?:string;
 private exportFolder='';
 constructor(private editor:ReactiveEditor,readonly vault:string,private current:()=>boolean,private journals:JournalStore=new IndexedCollectionJournal()){}
 private scope(){if(this.editor.features.nativeDocumentPersistence===false)throw Error('Collection interchange requires native document persistence.');const c=this.editor.readAssetContext();if(!c.cavernId||!c.session)throw Error('Choose a Cavern first.');return c;}
 private check(){this.controller?.signal.throwIfAborted();const c=this.scope();if(!this.alive||!this.current()||c.session!==this.session||c.cavernId!==this.cavern)throw Error('Cavern or collection destination changed. Nothing further will be saved.');}
 private async api(route:string,body:unknown,abort=true){this.check();const r=await fetch(`/api/native/${route}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),...(abort?{signal:this.controller?.signal}:{})});const data=await r.json();this.check();if(!r.ok||!data.Success)throw Object.assign(Error(data.Error??'Native operation failed'),{preflight:data.PublicationStarted===false});return data.Data;}
 private worker(request:CollectionRequest){this.check();return runInterchange({kind:'collection',request},this.controller!.signal);}
 private update(){if(this.journal){this.planSignal[1](structuredClone(this.journal.plan));}}
 private async persist(){this.check();if(!this.journal)throw Error('Missing recovery plan');this.journal.updated=Math.max(Date.now(),(this.reviewedVersion??0)+1);this.update();await this.journals.save(this.cavern!,this.journal);this.reviewedVersion=this.journal.updated;this.reviewedJournalId=this.journal.plan.id;this.check();}
 private async task(run:()=>Promise<void>){if(this.busy()||!this.alive||!this.editor.features.documentInterchange)return;this.busySignal[1](true);this.controller=new AbortController();try{const c=this.scope();this.session=c.session;this.cavern=c.cavernId;await run();}catch(e){this.statusSignal[1](message(e));}finally{this.update();this.controller=undefined;this.busySignal[1](false);}}
 private async locked(run:()=>Promise<void>){if(!navigator.locks)throw Error('Safe batch saves require Web Locks in this browser. Use a current secure-context browser.');await navigator.locks.request(`mutable-collection:${this.cavern}`,{ifAvailable:true},async lock=>{if(!lock)throw Error('Another tab is importing this collection.');await run();});}
 private async inventory(files:CollectionFile[]){
  if(!files.length||files.length>COLLECTION_LIMITS.files||files.reduce((n,f)=>n+f.blob.size,0)>COLLECTION_LIMITS.bytes)throw Error('Choose up to 5,000 files and 512 MiB.');
  const entries:Entry[]=files.map(f=>({path:relativePath(f.path),size:f.blob.size,hash:'',...classify(f.path,f.blob.size)}));validateInventory(entries);
  this.files=new Map(files.map(f=>[f.path,f.blob]));
  for(let i=0;i<entries.length;i++){this.check();const e=entries[i];this.statusSignal[1](`Inventory ${i+1}/${entries.length}: ${e.path}`);if(e.kind!=='skip')e.hash=await this.worker({action:'hash',blob:this.files.get(e.path)!});}
  return entries.sort((a,b)=>a.path.localeCompare(b.path));
 }
 async review(files:CollectionFile[],destination:string,mode:'native'|'source',policy:'keep'|'skip'|'abort',resume=false){return this.task(async()=>{
  this.notesSignal[1]([]);this.downloadSignal[1](undefined);this.planSignal[1](undefined);this.journal=undefined;
  const entries=await this.inventory(files),saved=await this.journals.load(this.cavern!);this.reviewedVersion=saved?.updated;this.reviewedJournalId=saved?.plan.id;this.reviewedSession=this.session;
  if(resume){
   if(!saved||saved.plan.version!==1||saved.plan.cavernId!==this.cavern||saved.plan.vault!==this.vault)throw Error('No resumable batch for this Cavern and Vault.');
   if(JSON.stringify(entries)!==JSON.stringify(saved.plan.entries))throw Error('Source inventory or bytes changed. Resume refused; reselect the original collection.');
   this.journal=saved;this.notesSignal[1](saved.diagnostics??[]);try{await this.verifyCompleted();}catch(e){this.journal=undefined;throw e;}
   if(!saved.pending){const inventory=await this.api('collection/inventory',{folder:this.vault});const revised=allocate(entries,inventory.entries,{cavernId:saved.plan.cavernId,vault:this.vault,destination:saved.plan.destination,mode:saved.plan.mode});for(const d of saved.plan.documents)if(d.status==='pending'||d.status==='failed'){const next=revised.documents.find(n=>n.source===d.source)!;d.path=next.path;d.status='pending';d.error=next.error;}saved.plan.directories=[...new Set([...saved.plan.directories,...revised.directories])];}
   this.update();this.statusSignal[1]('Recovery reviewed. Import and Save collection resumes pending/failed documents with their existing identities.');return;
  }
  if(saved&&(saved.pending||saved.plan.documents.some(d=>!['completed','skipped'].includes(d.status))))throw Error('An unfinished batch exists. Reselect its source and use Review resume before starting a new batch.');
  const inventory=await this.api('collection/inventory',{folder:this.vault});if(inventory.readOnly)throw Error('Vault is read-only.');
  const plan=allocate(entries,inventory.entries,{cavernId:this.cavern!,vault:this.vault,destination:destination.trim()||'.',mode},policy);
  const notes:string[]=[];let omitted=0;const note=(s:string)=>{if(notes.length<1000)notes.push(s.slice(0,1024));else omitted++;};
  for(const d of plan.documents){if(d.status==='skipped')continue;this.statusSignal[1](`Reviewing semantics: ${d.source}`);
   try{const prepared:PreparedDocument=await this.worker({action:'prepare',blob:this.files.get(d.source)!,entry:entries.find(e=>e.path===d.source)!,plan});d.diagnosticCount=prepared.diagnostics.length;prepared.diagnostics.forEach(s=>note(`${d.source}: ${s}`));}
   catch(e){this.check();d.status='failed';d.error=message(e);note(`${d.source}: ${d.error}`);}
  }
  if(omitted)notes.push(`${omitted} additional diagnostics omitted from this summary; affected document counts and native provenance retain details.`);
  this.journal={plan,diagnostics:notes,updated:Date.now()};this.update();this.notesSignal[1](notes);this.statusSignal[1]('Review paths, exclusions and conversion diagnostics. No documents have been saved.');
 });}
 private async verifyCompleted(){for(const d of this.journal!.plan.documents)if(d.status==='completed'){const opened=await this.api('open',{location:location(this.vault,d.path)});if(opened.pending||opened.resourceId!==d.id||opened.baseline?.nativeHash!==d.nativeHash)throw Error(`Saved destination changed or missing: ${d.path}. Resume stopped.`);}}
 private async directories(plan:CollectionPlan){const result=await this.api('collection/inventory',{folder:this.vault}),existing=new Map<string,Destination>(result.entries.map((e:Destination)=>[fold(e.path),e]));
  for(const dir of plan.directories){this.check();const e=existing.get(fold(dir));if(e){if(!e.directory||e.path!==dir)throw Error(`Directory collision changed: ${dir}`);continue;}await this.api('vault/mkdir',{vault:this.vault,directory:joinPath(this.vault,dir)});existing.set(fold(dir),{path:dir,directory:true});}
 }
 async reviewSaved(){return this.task(async()=>{this.journal=undefined;this.planSignal[1](undefined);this.files.clear();this.reviewedSession=undefined;const saved=await this.journals.load(this.cavern!);if(!saved||saved.plan.cavernId!==this.cavern||saved.plan.vault!==this.vault)throw Error('No saved batch for this Cavern and Vault.');this.files.clear();this.journal=saved;this.reviewedVersion=saved.updated;this.reviewedJournalId=saved.plan.id;this.reviewedSession=undefined;this.notesSignal[1](saved.diagnostics??[]);this.update();this.statusSignal[1]('Saved batch report. Reselect the original folder and Review resume to continue.');});}
 async abandon(){return this.task(()=>this.locked(async()=>{const saved=await this.journals.load(this.cavern!);this.check();if(!saved||saved.plan.id!==this.journal?.plan.id||saved.updated!==this.reviewedVersion)throw Error('Batch progress changed. Review saved batch first.');if(saved.pending)throw Error('An unacknowledged save must be recovered before abandoning this batch.');await this.journals.remove(this.cavern!);this.journal=undefined;this.files.clear();this.planSignal[1](undefined);this.statusSignal[1]('Remaining import abandoned. Completed documents and published assets were retained.');}));}
 canSave(){return !!this.plan()&&!!this.journal&&this.reviewedSession===this.session&&this.journal.plan.entries.filter(e=>e.kind!=='skip').every(e=>this.files.has(e.path));}
 canAbandon(){return !!this.plan()&&!!this.journal&&!this.journal.pending&&this.reviewedJournalId===this.journal.plan.id;}
 async save(){return this.task(()=>this.locked(async()=>{
  if(!this.journal)throw Error('Review a collection first.');if(this.journal.plan.cavernId!==this.cavern||this.reviewedSession!==this.session)throw Error('Cavern session changed. Review resume before saving.');
  const stored=await this.journals.load(this.cavern!);if(stored&&stored.plan.id!==this.journal.plan.id&&(stored.pending||stored.plan.documents.some(d=>!['completed','skipped'].includes(d.status))))throw Error('Another batch was started. Resume that batch first.');
  if(stored?.plan.id===this.journal.plan.id&&stored.updated!==this.reviewedVersion)throw Error('Batch progress changed in another tab. Review resume again.');
  // Full source revalidation also protects programmatic File replacement before dispatch.
  for(const e of this.journal.plan.entries)if(e.kind!=='skip'){const blob=this.files.get(e.path);if(!blob||await this.worker({action:'hash',blob})!==e.hash)throw Error(`Source changed or missing: ${e.path}`);}
  await this.verifyCompleted();await this.persist();await this.directories(this.journal.plan);
  const plan=this.journal.plan;
  for(const d of [...plan.documents].sort((a,b)=>Number(b.source===this.journal!.pending?.source)-Number(a.source===this.journal!.pending?.source))){if(['completed','skipped'].includes(d.status))continue;this.check();this.statusSignal[1](`Importing ${d.source}`);let lease:AssetLease|undefined;let captured:CollectionJournal['pending'];
   try{
    if(this.journal.pending&&this.journal.pending.source!==d.source)throw Error('An earlier save is awaiting acknowledgement; resume it first.');
    if(!this.journal.pending){
     const prepared:PreparedDocument=await this.worker({action:'prepare',blob:this.files.get(d.source)!,entry:plan.entries.find(e=>e.path===d.source)!,plan}),assets:Record<string,AssetManifest>=Object.create(null);
     const images=[...new Set(prepared.bindings.filter(b=>b.image).map(b=>b.path))];
     if(prepared.bindings.filter(b=>b.image).length>20||images.reduce((n,p)=>n+this.files.get(p)!.size,0)>40*1024*1024)throw Error('Per-document image limit: 20 images / 40 MiB.');
     if(images.length){lease=await this.editor.assets.begin([],this.controller!.signal);this.check();for(const path of images){await this.editor.assets.action(lease,'renew',this.controller!.signal);const asset=await this.editor.assets.stage(lease,this.files.get(path)!,this.controller!.signal);this.check();const expected=plan.entries.find(e=>e.path===path)!.hash;if(asset.assetId!==`sha256:${expected}`)throw Error('Asset bytes changed after review.');assets[path]=asset;}await this.editor.assets.action(lease,'publish',this.controller!.signal);this.check();}
     const native:string=await this.worker({action:'native',prepared,plan,document:d,assets});this.check();
     this.journal.pending={source:d.source,generation:{resourceId:d.id,generation:crypto.randomUUID(),native}};
     await this.persist(); // Durable before publication. A quota failure never dispatches this generation.
    }
    const pending=this.journal.pending;captured=pending;
    const response=await this.api('save',{location:location(this.vault,d.path),generation:pending.generation,baseline:{nativeHash:null,markdownHash:null,generation:null},collectionCreate:true});
    if(response.result.phase!=='saved'||!response.baseline?.nativeHash)throw Error(response.result.error??'Save outcome is unconfirmed; resume retries the exact generation.');
    d.status='completed';d.nativeHash=response.baseline.nativeHash;delete d.error;delete this.journal.pending;await this.persist();
   }catch(e){if(captured&&!this.journal.pending)this.journal.pending=captured;if((e as {preflight?:boolean})?.preflight)delete this.journal.pending;d.status=this.controller!.signal.aborted||this.journal.pending?.source===d.source?'pending':'failed';d.error=(this.journal.pending?.source===d.source?'Save acknowledgement pending: ':'')+message(e);this.update();
    // Keep an uncertain generation, including cancellation, and stop dispatching later documents.
    if(!this.controller!.signal.aborted){await this.persist();}if(this.journal.pending||this.controller!.signal.aborted)throw e;
   }finally{if(lease)await this.editor.assets.action(lease,d.status==='completed'?'finish':'abort').catch(()=>{});}
  }
  this.statusSignal[1]('Batch finished. Review completed, skipped, failed and pending counts. Saved documents are independent manual saves; this batch has no global Undo.');
 }));}
 async listExport(folder:string){return this.task(async()=>{this.downloadSignal[1](undefined);const relative=folder.trim()||'.';if(relative!=='.'){relativePath(relative);if(relative.split('/').some(p=>p.startsWith('.')))throw Error('Hidden/internal directories are excluded.');}const result=await this.api('collection/inventory',{folder:joinPath(this.vault,relative)});this.exportSession=this.session;this.exportFolder=folder.trim()||'.';if(this.exportFolder!=='.')relativePath(this.exportFolder);this.exportsSignal[1](result.entries.filter((e:Destination)=>!e.directory&&/\.(ink|phosphor|mutable\.json)$/.test(e.path)).map((e:Destination)=>({path:e.path,selected:true})));this.statusSignal[1]('Select saved documents to export. Unsaved editor changes are not included.');});}
 skip(source:string){if(this.busy()||this.journal?.pending?.source===source)return;const doc=this.journal?.plan.documents.find(d=>d.source===source);if(doc&&doc.status!=='completed'){doc.status='skipped';doc.error='Explicitly skipped. Existing references to its planned identity may remain unresolved.';this.update();}}
 canSkip(source:string){return !this.busy()&&this.journal?.pending?.source!==source;}
 report(){return {format:'mutable-collection-import-report',version:1,plan:this.plan(),diagnostics:this.notes(),unacknowledgedSave:this.journal?.pending?{source:this.journal.pending.source,generation:this.journal.pending.generation.generation}:null};}
 invalidateReview(){if(this.busy())return;this.journal=undefined;this.files.clear();this.planSignal[1](undefined);this.notesSignal[1]([]);}
 toggleExport(path:string,selected:boolean){this.downloadSignal[1](undefined);this.exportsSignal[1](items=>items.map(e=>e.path===path?{...e,selected}:e));}
 async export(){return this.task(async()=>{
  this.downloadSignal[1](undefined);if(this.exportSession!==this.session)throw Error('Cavern session changed. Review export inventory again.');const selected=this.exports().filter(e=>e.selected);if(!selected.length||selected.length>1000)throw Error('Select 1–1,000 saved documents.');
  const records:Array<{path:string;output:string;id:string;hash:string;assets:AssetManifest[]}>=[],paths:Record<string,string>=Object.create(null),taken=new Set<string>(selected.flatMap(e=>ancestors(e.path)).map(fold)),assetPaths:Record<string,string>=Object.create(null),members:Record<string,Uint8Array>=Object.create(null),notes:string[]=[];let total=0;
  const add=(path:string,data:Uint8Array)=>{relativePath(path);if((total+=data.length)>60*1024*1024)throw Error('Collection ZIP exceeds 60 MiB content budget (64 MiB archive). Select fewer documents.');members[path]=data;};
  for(const item of selected){this.statusSignal[1](`Inspecting ${item.path}`);const opened=await this.api('open',{location:location(this.vault,joinPath(this.exportFolder,item.path))});if(opened.kind!=='native'||opened.pending)throw Error(`Save recovery must finish before export: ${item.path}`);
   const info=await this.worker({action:'inspect',native:opened.native,cavernId:this.cavern!});if(paths[info.id])throw Error('Duplicate document identities in export selection.');
   const original=item.path.replace(/\.(ink|phosphor|mutable\.json)$/,'.'+info.extension);let output=original,n=2;while(taken.has(fold(output)))output=original.replace(/\.[^.]+$/,` (${n++}).${info.extension}`);relativePath(output);taken.add(fold(output));paths[info.id]=output;records.push({path:item.path,output,id:info.id,hash:opened.baseline.nativeHash,assets:info.assets});
  }
  validateInventory(records.map(r=>({path:r.output,kind:'markdown',size:0,hash:''})));
  let assetDirectory='_assets',n=2;while(records.some(r=>fold(r.output.split('/')[0])===fold(assetDirectory)))assetDirectory=`_assets-${n++}`;
  for(const record of records)for(const asset of record.assets){this.check();if(assetPaths[assetKey(asset)])continue;const original=await this.editor.assets.original(asset,this.controller!.signal);this.check();const path=`${assetDirectory}/${asset.assetId.slice(7)}.${original.mediaType==='image/png'?'png':'jpg'}`;assetPaths[assetKey(asset)]=path;add(path,original.bytes);}
  for(const record of records){this.statusSignal[1](`Exporting ${record.path}`);const opened=await this.api('open',{location:location(this.vault,joinPath(this.exportFolder,record.path))});if(opened.pending||opened.resourceId!==record.id||opened.baseline.nativeHash!==record.hash)throw Error(`Document changed during export: ${record.path}`);
   const projected=await this.worker({action:'project',native:opened.native,cavernId:this.cavern!,path:record.output,paths,assetPaths});add(record.output,new TextEncoder().encode(projected.text));for(const detail of projected.diagnostics){if(notes.length<1000)notes.push(`${record.path}: ${detail}`.slice(0,1024));else if(notes.length===1000)notes.push('Further projection diagnostics omitted from this summary. Export may lose additional unsupported semantics.');}
  }
  let manifest='mutable-collection.json';while(taken.has(fold(manifest)))manifest='_'+manifest;
  add(manifest,new TextEncoder().encode(JSON.stringify({format:'mutable-collection',version:1,dialect:'mutable-markdown-vault-v1',documents:records.map(({id,path,output,hash})=>({id,source:path,path:output,nativeHash:hash})),assets:assetPaths,diagnostics:notes},null,2)));
  const zip=await this.worker({action:'zip',members});this.check();this.notesSignal[1](notes);this.downloadSignal[1](zip);this.statusSignal[1]('Export ready. Review diagnostics before downloading the collection ZIP.');
 });}
 cancel(){this.controller?.abort();}
 dispose(){this.alive=false;this.cancel();this.files.clear();this.downloadSignal[1](undefined);}
}
