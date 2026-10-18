import {RESOURCE_TYPES,resourceSnapshots} from './resources';
import {assetKey,managedAsset} from '../managed-asset';
import { encodeAuthoredValue } from '../../history/preplan-spike/wire';
import type { DeepReadonly } from '../../block-tree/commit-capture';
import type { ResourceSnapshot } from '../../history/stage-c-gates/resource';
import { resourceToRepository } from '../../history/durable-core';
import { serializeSelection } from '../serializer';
import { materializeFragment, contentRecord } from '../materialize';
import type { MutableFragment } from '../fragment';
import { createBlockId, createContentKey } from '../../block-tree/ids';
import type { PackageData } from './data';
/** Only operation-local synthetic edges. Retained definitions never enter reading order. */
export function packageFragment(snapshot:DeepReadonly<ResourceSnapshot>,cavernId?:string,observeBlock?:(localId:string,canonicalId:string)=>void){
 const state=resourceToRepository(snapshot),slices=[{placementKey:state.rootPlacementKey}];
 // MutableFragment is JSON-only. Retain non-JSON authored values in an inert
 // native-codec carrier, rather than coercing them through JSON serialization.
 for(const c of Object.values(state.contents)){
  let changed=false;
  const safe=(v:unknown):any=>{if(v===null||typeof v==='string'||typeof v==='boolean'||typeof v==='number'&&Number.isFinite(v)&&!Object.is(v,-0))return v;
   if(Array.isArray(v))return Array.from(v,safe);
   if(v&&typeof v==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(v))){const out:Record<string,unknown>=Object.create(null);for(const [k,value]of Object.entries(v)){if(['__proto__','prototype','constructor'].includes(k)){changed=true;continue;}out[k]=safe(value);}return out;}
   changed=true;return null;
  };
  const payload=safe(c.payload);if(changed){payload.packageAuthoredSource={version:1,valueEncoding:'codex-authored-value-v1',value:JSON.stringify(encodeAuthoredValue(c.payload))};c.payload=payload;}
 }
 const reached=new Set<string>();
 const visit=(key:string)=>{const pending=[key];while(pending.length){const next=pending.pop()!;if(reached.has(next))continue;reached.add(next);const c=state.contents[next];for(const edge of [...c.children,...c.inlineContent,...Object.values(c.ownedRelations)]){const p=state.placements[edge];if(p&&!p.externalReference)pending.push(p.contentKey);}}};
 visit(state.placements[state.rootPlacementKey].contentKey);
 for(const c of Object.values(state.contents))if(!reached.has(c.key)){
  const key=`package-retained:${c.key}`;state.placements[key]={key,contentKey:c.key,kind:'owned',placementId:key};slices.push({placementKey:key});visit(c.key);
 }
 return serializeSelection(state,slices,{...(cavernId?{cavernId}:{}),resourceId:snapshot.resourceId},true,observeBlock);
}
export function materializePackage(fragment:MutableFragment,cavernId:string|undefined,assets:[string,string][],context:{data:PackageData;schema:unknown;source:unknown;assetBindings?:Array<[string,import('../managed-asset').ManagedAssetReference]>}){
 // A package is always a foreign copy, even if its source claims the active Cavern.
 const isolated=structuredClone(fragment);
 // Carry a bounded, inert reconstruction envelope with each resource. This also
 // survives re-export of an inactive imported copy without querying active SQL.
 const captured=resourceSnapshots(context.data),bindings=new Map(context.assetBindings??[]);
 for(const block of isolated.blocks){const data=RESOURCE_TYPES.includes(block.type)?block.data:block.type==='mutable/opaque-block'&&RESOURCE_TYPES.includes((block.data.original as any)?.type)?(block.data.original as any).data:undefined;if(!data)continue;
  const snapshot=data.pdf??data.iiif??data.article??data.citation,prior=data.archive;if(!snapshot?.snapshotId)continue;
  const snapshots=prior?.version===1?prior.snapshots:captured.filter(s=>s.snapshotId===snapshot.snapshotId||s.parentSnapshotId===snapshot.snapshotId);
  const mapped=prior?.version===1?prior.bindings.map(([key,value]:any[])=>[key,bindings.get(assetKey(value))]).filter((p:any[])=>!!managedAsset(p[1])):[...bindings.entries()];
  if(Array.isArray(snapshots)&&snapshots.length<=129)data.archive={version:1,snapshots,bindings:mapped};
 }

 for(const b of isolated.blocks){const fields=Object.fromEntries(['style','css','html'].filter(k=>b.data[k]!==undefined).map(k=>[k,b.data[k]]));if(Object.keys(fields).length)b.data.packageInactivePresentation={version:1,fields,...b.data.packageInactivePresentation!==undefined?{previous:b.data.packageInactivePresentation}:{}};}
 const native=materializeFragment(isolated,{cavernId},new Map(assets),new Map(),new Set((fragment as MutableFragment&{packageRetainedBlocks?:string[]}).packageRetainedBlocks??[]),false);
 const root=native.state.contents[native.state.placements[native.roots[0]].contentKey];
 if(root.viewType!=='document-block')throw Error('Package has no native Document root');
 root.definitionOwnerKey=root.key;
 root.payload.linkedAnnotations=native.linkedAnnotations??{};native.linkedAnnotations={};
 for(const edge of native.roots.slice(1)){const c=native.state.contents[native.state.placements[edge].contentKey];c.definitionOwnerKey=root.key;delete native.state.placements[edge];}
 native.roots=native.roots.slice(0,1);
 const key=createContentKey();native.state.contents[key]={...contentRecord(key,'mutable/package-data-block',{id:createBlockId(),type:'mutable/package-data-block',version:1,readOnly:true,packageContext:context}),definitionOwnerKey:root.key};
 const metadata=root.payload.metadata as Record<string,unknown>??{};root.payload.metadata={...metadata,packageContextBlockId:native.state.contents[key].payload.id,interchange:{suggestedFilename:'Imported package.ink',operation:'import-package-copy'}};
 return native;
}
