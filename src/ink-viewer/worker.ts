import { openPackage } from '../interchange/package/format';
import { packageFragment } from '../interchange/package/native';
import { exportFragment } from '../interchange/export-plan';
import { assetKey, managedAsset } from '../interchange/managed-asset';
self.onmessage=async(event:MessageEvent<Uint8Array>)=>{try{
 const pkg=await openPackage(event.data),fragment=packageFragment(pkg.snapshot,pkg.manifest.source.cavernId),images:Record<string,string>={};
 for(const e of fragment.embeds){const ref=managedAsset(e.data.asset),asset=ref&&pkg.assets.find(a=>assetKey(a.reference)===assetKey(ref));if(asset){let binary='';for(let i=0;i<asset.bytes.length;i+=16384)binary+=String.fromCharCode(...asset.bytes.subarray(i,i+16384));images[e.localId]=`data:${asset.mediaType};base64,${btoa(binary)}`;}}
 const result=exportFragment(fragment,'html','Document',false,{images,entities:true,rootOnly:true});
 self.postMessage({html:result.text,data:pkg.data,inventory:pkg.inventory,diagnostics:[...result.diagnostics,...pkg.manifest.boundaries.map(detail=>({detail}))],source:pkg.manifest.source});
}catch(error){self.postMessage({error:error instanceof Error?error.message:String(error)});}};
