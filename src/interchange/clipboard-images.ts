import { plainFragment } from './serializer';
import { validateFragment, type MutableFragment } from './fragment';
import { managedAsset, assetKey, type AssetManifest } from './managed-asset';
import type { AssetLease, ManagedAssets } from '../runtime/managed-assets';
export interface ClipboardFile { blob: Blob; name: string }
export function captureFiles(data: DataTransfer | null): ClipboardFile[] {
  const files = Array.from(data?.files ?? []);
  if (files.length > 20 || files.reduce((n,f)=>n+f.size,0)>40*1024*1024 || files.some(f=>f.size>10*1024*1024)) throw Error('Clipboard image limits exceeded.');
  return files.map(blob=>({blob,name:blob.name}));
}
export function imagesFragment(files: ClipboardFile[]) {
  const f=plainFragment('');
  files.forEach((file,i)=>{const id=`file-${i}`;f.embeds.push({localId:id,type:'image-cell',data:{alt:file.name,src:''},asset:{kind:'local',object:'asset',id:`asset-${i}`}});f.assets.push({localId:`asset-${i}`,source:{kind:'transfer',index:i}});f.blocks[0].inline!.atoms.push({kind:'embed',embed:id});});
  return validateFragment(f);
}
/** Reconcile once, preserving authoritative fragment order. Never infer identity from URL equality. */
export async function resolveClipboardImages(input: {
  fragment: MutableFragment; files: ClipboardFile[]; assets: ManagedAssets; cavernId?: string;
  signal: AbortSignal; valid: () => boolean;
  choose: (urls: string[]) => Promise<string[] | undefined>;
  lease: (value: AssetLease) => void;
}) {
  const f=structuredClone(input.fragment), admitted:Array<[string,string]>=[], warnings:string[]=[];
  const sourceFor=(e:MutableFragment['embeds'][number])=>{const ref=e.asset;return ref?.kind==='local'?f.assets.find(a=>a.localId===ref.id)?.source:undefined;};
  const urls=[...new Set(f.embeds.flatMap(e=>{const source=sourceFor(e);return e.type==='image-cell'&&!e.data.original&&source?.kind==='remote'&&typeof source.url==='string'?[source.url]:[];}))];
  if(f.embeds.filter(e=>e.type==='image-cell'&&!e.data.original).length>20)throw Error('Too many clipboard images.');
  const selected=urls.length?await input.choose(urls):[];
  if(!selected)throw Error('Paste cancelled.');
  const check=()=>{input.signal.throwIfAborted();if(!input.valid())throw Error('Destination changed; paste cancelled.');};check();
  let lease:AssetLease|undefined;
  const getLease=async()=>{if(!lease){lease=await input.assets.begin(selected,input.signal);input.lease(lease);}else await input.assets.action(lease,'renew',input.signal);return lease;};
  const used=new Set<number>(), remotes=new Map<string,AssetManifest>(), verified=new Map<string,AssetManifest>();
  for(const e of f.embeds){
    if(e.type!=='image-cell'||e.data.original)continue;check();
    const source=sourceFor(e), asset=managedAsset(e.data.asset)??managedAsset(source);
    let manifest:AssetManifest|undefined;
    if(asset&&asset.cavernId===input.cavernId){
      const key=assetKey(asset);manifest=verified.get(key);
      if(!manifest){manifest=await input.assets.verify(asset,input.signal);verified.set(key,manifest);}
    }
    else if(asset)warnings.push('Foreign assets remain unresolved; supply their original files to import them.');
    else {
      let index=source?.kind==='transfer'&&Number.isInteger(source.index)?Number(source.index):-1;
      if(index<0&&typeof source?.contentId==='string'){
        const matches=input.files.flatMap((file,i)=>file.name===source.contentId?[i]:[]);if(matches.length===1)index=matches[0];
      }
      if(index>=0&&input.files[index]){used.add(index);manifest=await input.assets.stage(await getLease(),input.files[index].blob,input.signal);}
      else if(source?.kind==='remote'&&typeof source.url==='string'&&selected.includes(source.url)){
        manifest=remotes.get(source.url);if(!manifest){manifest=await input.assets.remote(await getLease(),source.url,input.signal);remotes.set(source.url,manifest);}
      }
    }
    if(manifest){
      const ref={kind:'managed' as const,cavernId:manifest.cavernId,assetId:manifest.assetId};
      admitted.push([assetKey(ref),ref.assetId]);
      e.data={alt:String(e.data.alt??''),...(typeof e.data.title==='string'?{title:e.data.title}:{}),asset:ref,src:'',width:typeof e.data.width==='number'&&e.data.width>0&&e.data.width<=16384?e.data.width:manifest.width??0,height:typeof e.data.height==='number'&&e.data.height>0&&e.data.height<=16384?e.data.height:manifest.height??0};
      if(source){Object.keys(source).forEach(k=>delete source[k]);Object.assign(source,ref);}
    }
  }
  if(input.files.length>used.size)warnings.push('Unmatched clipboard files were not inserted; image positions could not be established unambiguously.');
  check();if(lease)await input.assets.action(lease,'publish',input.signal);check();
  return {fragment:validateFragment(f),admitted,notice:warnings.join(' ')};
}
