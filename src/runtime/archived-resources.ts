import type {ReactiveEditor} from '../reactive-editor/editor';
import type {ApplicationServices} from '../application-services/contracts';
import {HttpApplicationServices} from './application-services';
import {resourceOwner} from '../block-tree/resource-identity';
import {RESOURCE_TYPES,resourceSnapshots,captureAssets} from '../interchange/package/resources';
import {assetKey,managedAsset,type ManagedAssetReference} from '../interchange/managed-asset';
import {emptyFragment} from '../interchange/fragment';
import {materializeFragment} from '../interchange/materialize';
import {validResourceAnchor} from '../resources/resource-anchor';
import {IIIFService} from '../application-services/iiif-service';
import {runInterchange} from './interchange-worker';
export interface ArchiveResources {version:1;snapshots:any[];bindings:Array<[string,ManagedAssetReference]>}
/** Deliberate local reinterpretation of a known resource, not general activation.
 * Canonical references remain inert; only independently validated spatial notes
 * resume their visual contributions. No network or knowledge mutation occurs. */
export function restoreArchivedResource(editor:ReactiveEditor,key:string){
 if(!editor.features.crossResourceLoaders)throw Error('Resource reconstruction disabled');
 const state=editor.repository.readState(),node=editor.node(key);if(!node)throw Error('Block unavailable');const content=state.contents[node.contentKey],original=content.payload.original as any;
 if(content.viewType!=='mutable/opaque-block'||!RESOURCE_TYPES.includes(original?.type))throw Error('No supported retained resource');
 const owner=resourceOwner(state,content.key),contextId=(owner?.payload.metadata as any)?.packageContextBlockId;
 const context=Object.values(state.contents).find(c=>c.payload.id===contextId&&c.definitionOwnerKey===owner?.key)?.payload.packageContext as any;
 if(!context)throw Error('Isolated package context unavailable');
 const all=resourceSnapshots(context.data),data=original.data??{},capture=data.pdf??data.iiif??data.article??data.citation;
 if(!capture?.snapshotId)throw Error('Resource capture unavailable');
 const prior=data.archive as ArchiveResources|undefined;
 const snapshots=prior?.version===1?prior.snapshots:all.filter(s=>s.snapshotId===capture.snapshotId||s.parentSnapshotId===capture.snapshotId);
 if(!Array.isArray(snapshots)||snapshots.length>129||!snapshots.some(s=>s.snapshotId===capture.snapshotId))throw Error('Pinned snapshot is outside the package');
 const currentBindings=new Map<string,ManagedAssetReference>(context.assetBindings??[]);
 const bindings=prior?.version===1?prior.bindings.map(([key,value])=>[key,(currentBindings.get(assetKey(value))??(value.cavernId===editor.readAssetContext().cavernId?value:undefined))] as const):[...currentBindings.entries()];
 const validBindings=bindings.filter((v):v is [string,ManagedAssetReference]=>typeof v[0]==='string'&&!!managedAsset(v[1]));
 for(const a of captureAssets(capture))if(!validBindings.some(([k])=>k===assetKey(a)))throw Error('Required original is missing; no remote acquisition was attempted');
 const archive:ArchiveResources={version:1,snapshots,bindings:validBindings};
 const safe:Record<string,any>={archive};for(const field of ['pdf','iiif','article','citation','sourceUrl','text','links','diagnostics','metadata'])if(data[field]!==undefined)safe[field]=structuredClone(data[field]);
 // Previous metadata cannot inject styles, cell overrides or executable values.
 const f=emptyFragment();f.blocks=[{localId:'restored',type:original.type,data:{},children:[],relations:{},blockProperties:[]}];f.placements=[{localId:'edge',kind:'owned',target:{kind:'local',object:'block',id:'restored'}}];f.roots=[{placement:'edge',openStart:false,openEnd:false,clippedStart:false,clippedEnd:false}];const native=materializeFragment(f),root=native.state.contents[native.state.placements[native.roots[0]].contentKey];root.viewType=original.type;
 const properties=(content.payload.blockProperties as any[]??[]).map(p=>{const candidate=p.type==='mutable/opaque-block-property'&&p.original?.type==='mutable/resource-annotation'?p.original.data:undefined;if(!candidate||candidate.isDeleted||typeof candidate.value!=='string'||candidate.value.length>4000||!validResourceAnchor(candidate.anchor))return structuredClone(p);return {...structuredClone(candidate),id:p.id,type:'mutable/resource-annotation'};});
 root.payload={...safe,id:root.payload.id,type:original.type,blockProperties:properties};editor.commands.replaceSourceWithFragment(native,key);
}
/** All capabilities are local and restricted to the package's explicit bindings.
 * IIIF's existing viewer/service adapter is reused with acquisition disabled. */
export function archivedResourceApi(editor:ReactiveEditor,archive:ArchiveResources):{api:ApplicationServices;close():Promise<void>}{
 if(archive.version!==1||!Array.isArray(archive.snapshots)||archive.snapshots.length>129||!Array.isArray(archive.bindings)||archive.bindings.length>128)throw Error('Invalid archival resource context');
 const snapshots=new Map(archive.snapshots.map(s=>[s.snapshotId,s])),bindings=new Map(archive.bindings),scope=editor.readAssetContext();
 const host=new HttpApplicationServices(()=>{const c=editor.readAssetContext();if(!c.cavernId||!c.session||c.cavernId!==scope.cavernId||c.session!==scope.session)throw Error('Archive Vault changed');return {cavernId:c.cavernId,session:c.session};});
 const original=async(asset:ManagedAssetReference,signal:AbortSignal)=>{const ref=bindings.get(assetKey(asset));if(!managedAsset(ref)||ref!.cavernId!==scope.cavernId||ref!.assetId!==asset.assetId)throw Error('Retained original unavailable in this package');return (await host.call('resources.original',{assetId:ref!.assetId},signal)).bytes;};
 const deny=async()=>{throw Error('Archived resources cannot acquire remote content or mutate canonical knowledge');};
 const iiif=new IIIFService({cavernId:scope.cavernId!,uuid:()=>crypto.randomUUID(),now:()=>new Date().toISOString(),jobs:new Proxy({},{get:()=>deny}) as any,executor:{run:async(task,signal)=>{if(task.kind!=='iiif-normalize')throw Error('Unsupported archive operation');return runInterchange({kind:'resource-iiif',bytes:task.bytes},signal??new AbortController().signal);},close:async()=>{}},acquire:deny,retain:deny,
  original:async(asset,signal)=>original({...asset,cavernId:(archive.snapshots.find(s=>s.asset?.assetId===asset.assetId)?.asset?.cavernId??asset.cavernId)},signal),
  knowledge:async r=>{if(r.op==='iiif-snapshot'){const s=snapshots.get(r.snapshotId);if(!s)throw Error('Snapshot not retained');return {snapshot:{...s,asset:{...s.asset,cavernId:scope.cavernId}}};}if(r.op==='iiif-associated')return {snapshots:archive.snapshots.filter(s=>s.parentSnapshotId===r.snapshotId&&s.canvasId===r.canvasId&&s.kind===r.kind)};return deny();}
 });
 return {close:()=>iiif.close(),api:{call:async(op:any,input:any,signal?:AbortSignal)=>{
  if(op==='pdf.read'){const s=snapshots.get(input.snapshotId);if(!s||s.kind!=='pdf')throw Error('PDF snapshot unavailable');return {snapshot:s,bytes:await original(s.asset,signal??new AbortController().signal)} as any;}
  if(op==='iiif.open'&&input.online||op==='iiif.retain')return deny();
  if(op.startsWith('iiif.'))return iiif.call(op,input,signal) as any;return deny();
 }}};
}
