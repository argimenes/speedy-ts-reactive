import { exportFragment } from '../export-plan';
import { assetKey, managedAsset } from '../managed-asset';
import type { MutableFragment } from '../fragment';
import type { PackageAsset } from './format';
import { bytes, hash, packZip } from './archive';
/** Explicit original-byte projection. Remote descriptors never trigger acquisition. */
export async function portableProjection(fragment:MutableFragment,assets:PackageAsset[],format:'html'|'markdown',standalone=false,title='Document'){
 if(standalone&&format!=='html')throw Error('Only HTML supports standalone images');
 const members:Record<string,Uint8Array>={},images:Record<string,string>={};
 for(const e of fragment.embeds){const ref=managedAsset(e.data.asset),asset=ref&&assets.find(a=>assetKey(a.reference)===assetKey(ref));if(!asset)throw Error('Self-contained export requires every inline image original. Resolve placeholders before export.');
  const digest=await hash(asset.bytes);if(`sha256:${digest}`!==asset.reference.assetId)throw Error('Original asset integrity failure');const path=`assets/${digest}.${asset.mediaType==='image/png'?'png':'jpg'}`;members[path]=asset.bytes;
  if(standalone){let binary='';for(let i=0;i<asset.bytes.length;i+=16384)binary+=String.fromCharCode(...asset.bytes.subarray(i,i+16384));images[e.localId]=`data:${asset.mediaType};base64,${btoa(binary)}`;}else images[e.localId]=path;
 }
 const result=exportFragment(fragment,format,title,true,{images,maxBytes:standalone?20*1024*1024:16*1024*1024}),document=bytes(result.text);
 if(standalone)return {bytes:document,extension:'html',mediaType:'text/html',diagnostics:result.diagnostics};
 members[`document.${result.extension}`]=document;return {bytes:packZip(members),extension:'zip',mediaType:'application/zip',diagnostics:result.diagnostics};
}
