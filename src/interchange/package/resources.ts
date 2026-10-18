import {PackageDataReader,type PackageData} from './data';
import {managedAsset,assetKey,type ManagedAssetReference} from '../managed-asset';
export const RESOURCE_TYPES=['mutable/citation-block','mutable/web-article-block','mutable/iiif-manifest-block','mutable/iiif-image-block','mutable/pdf-document-block'];
export function captureAssets(s:any):ManagedAssetReference[]{return [s?.asset,...Array.isArray(s?.assets)?s.assets:[]].map(managedAsset).filter((a):a is ManagedAssetReference=>!!a);}
/** Archival rows are never canonical service requests. Decode only the bounded
 * explicit snapshot envelope; unknown attributes remain in PackageData intact. */
export function resourceSnapshots(data:PackageData){return (new PackageDataReader(data).tables.get('SourceSnapshot')??[]).map(row=>{try{const s=JSON.parse(row.attributes??'null');return s?.version===1&&s.snapshotId===row.guid?s:undefined;}catch{return undefined;}}).filter(Boolean);}
export function resourceAssets(data:PackageData){const result=new Map<string,ManagedAssetReference>();for(const s of resourceSnapshots(data))for(const a of captureAssets(s))result.set(assetKey(a),a);return [...result.values()];}
export const originalExtensions={'image/png':'png','image/jpeg':'jpg','application/json':'json','application/pdf':'pdf'} as const;
export type OriginalMedia=keyof typeof originalExtensions;
/** Passive archive validation. PDF parsing is required before viewer activation,
 * not while simply inspecting an untrusted archive. JSON never executes. */
export function validateOriginal(bytes:Uint8Array,mediaType:string,image:(b:Uint8Array)=>string){
 if(mediaType==='image/png'||mediaType==='image/jpeg'){if(bytes.length>10*1024*1024||image(bytes)!==mediaType)throw Error('Invalid packaged image');}
 else if(mediaType==='application/json'){if(bytes.length>8*1024*1024)throw Error('Snapshot JSON limit');JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
 else if(mediaType==='application/pdf'){if(bytes.length>50*1024*1024||!new TextDecoder().decode(bytes.subarray(0,8)).startsWith('%PDF-'))throw Error('Invalid passive PDF original');}
 else throw Error('Unsupported original asset type');
}
