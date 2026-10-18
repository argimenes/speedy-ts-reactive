import type {ManagedAssetReference} from '../interchange/managed-asset';
export const IIIF_LIMITS={jsonBytes:8*1024*1024,nodes:100000,depth:32,canvases:2000,annotations:500,tile:512,tileBytes:2*1024*1024,cacheBytes:32*1024*1024,grants:4} as const;
export const IIIF_MANIFEST='mutable/iiif-manifest-block',IIIF_IMAGE='mutable/iiif-image-block';
export interface Canvas {id:string;label:string;width:number;height:number;service?:string;image?:string;rights?:string;attribution?:string;diagnostics:string[]}
export interface ImageInfo {kind:'image';id:string;version:2|3;width:number;height:number;tileWidth:number;tileHeight:number;scales:number[];profile:string;label:string;rights:string;attribution:string;diagnostics:string[]}
export interface Manifest {kind:'manifest';id:string;label:string;rights:string;attribution:string;metadata:Array<{label:string;value:string}>;canvases:Canvas[];diagnostics:string[]}
export type Projection=Manifest|ImageInfo;
export interface Capture {version:1;kind:'iiif-manifest'|'iiif-image'|'iiif-canvas'|'iiif-retained';snapshotId:string;identityId:string;entityId:string;resourceId:string;sourceUrl:string;endpoint?:string;resourceUrl:string;retrievedAt:string;asset:ManagedAssetReference;label:string;parentSnapshotId?:string;canvasId?:string;width?:number;height?:number}
export const httpsUrl=(value:unknown):string=>{if(typeof value!=='string'||value.length>4096)throw Error('Invalid IIIF URL');const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.hash||u.port&&u.port!=='443')throw Error('IIIF acquisition requires credential-free HTTPS on port 443');return u.href;};
export function iiifInput(value:unknown){try{const url=httpsUrl(value);return /(?:\/info\.json(?:\?|$)|\/manifest(?:\.json)?(?:\?|$)|\/iiif\/[^?#]+\.json(?:\?|$)|\/presentation\/(?:v3|3)\/[^?#]+)/i.test(url)?url:undefined;}catch{return;}}
export function identity(value:unknown):string{if(typeof value!=='string'||!value||value.length>4096||/[\u0000-\u001f]/.test(value))throw Error('Invalid IIIF identity');const u=new URL(value);if(!['https:','http:'].includes(u.protocol)||u.username||u.password)throw Error('Invalid IIIF identity');return value;}
const positive=(v:unknown,max=10000000)=>{if(typeof v!=='number'||!Number.isSafeInteger(v)||v<1||v>max)throw Error('Invalid IIIF dimensions or tile descriptor');return v;};
const label=(v:any)=>{const a=typeof v==='string'?[v]:v&&typeof v==='object'?(v.en??v.none??Object.values(v)[0]):[];return (Array.isArray(a)?a:[a]).filter(x=>typeof x==='string').join(' · ').replace(/<[^>]*>/g,'').slice(0,4000);};
function json(bytes:Uint8Array){if(bytes.length>IIIF_LIMITS.jsonBytes)throw Error('IIIF JSON exceeds 8 MiB');const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));let count=0;const todo=[{v:value,d:0}];while(todo.length){const {v,d}=todo.pop()!;if(++count>IIIF_LIMITS.nodes||d>IIIF_LIMITS.depth)throw Error('IIIF structure exceeds limits');if(v&&typeof v==='object')for(const child of Object.values(v))todo.push({v:child,d:d+1});}return value;}
export function normalizeIIIF(bytes:Uint8Array):Projection {
 const v=json(bytes);if(!v||typeof v!=='object')throw Error('Invalid IIIF JSON');
 if(v.type==='Manifest'){
  if(!(Array.isArray(v['@context'])?v['@context']:[v['@context']]).includes('http://iiif.io/api/presentation/3/context.json'))throw Error('Presentation v3 context required');
  if(!Array.isArray(v.items)||!v.items.length||v.items.length>IIIF_LIMITS.canvases)throw Error('Manifest canvas limit exceeded or no canvases');
  const seen=new Set<string>(),canvases:Canvas[]=v.items.map((c:any)=>{
   if(c.type!=='Canvas')throw Error('Manifest items must be canvases');const id=identity(c.id);if(seen.has(id))throw Error('Duplicate canvas identity');seen.add(id);
   const canvas:Canvas={id,label:label(c.label)||`Canvas ${seen.size}`,width:positive(c.width),height:positive(c.height),rights:label(c.rights),attribution:label(c.requiredStatement?.value),diagnostics:[]};
   const pages=c.items;if(!Array.isArray(pages)||pages.length!==1||pages[0]?.type!=='AnnotationPage'||!Array.isArray(pages[0]?.items)||pages[0].items.length!==1){canvas.diagnostics.push('Only one embedded painting annotation is supported; external pages and compositions are not fetched.');return canvas;}
   const annotation=pages[0].items[0],body=annotation?.body;
   if(annotation.motivation!=='painting'||annotation.target!==id||!body||Array.isArray(body)||body.type!=='Image') {canvas.diagnostics.push('Unsupported painting target/body; retained in original manifest.');return canvas;}
   if(body.id)canvas.image=identity(body.id);
   const services=Array.isArray(body.service)?body.service:body.service?[body.service]:[],supported=services.filter((s:any)=>['ImageService2','ImageService3'].includes(s.type)||s.profile?.includes?.('/api/image/2/'));
   const ids=[...new Set(supported.map((s:any)=>s.id??s['@id']))];
   if(ids.length===1){try{canvas.service=httpsUrl(ids[0]);}catch{canvas.diagnostics.push('Image service is not an acquirable HTTPS URL.');}}
   else canvas.diagnostics.push('A single Image API service is required for deep zoom.');
   if(c.annotations?.length)canvas.diagnostics.push('External annotation/OCR pages remain in the source; they are not automatically acquired.');
   return canvas;
  });
  return {kind:'manifest',id:identity(v.id),label:label(v.label)||'IIIF manifest',rights:typeof v.rights==='string'?v.rights.slice(0,4096):'',attribution:label(v.requiredStatement?.value),metadata:(Array.isArray(v.metadata)?v.metadata:[]).slice(0,100).map((m:any)=>({label:label(m.label),value:label(m.value)})),canvases,diagnostics:['One selected canvas is loaded at a time. Collections, ranges, authentication, choices, multi-image painting and OCR alignment are not implemented.']};
 }
 const contexts=Array.isArray(v['@context'])?v['@context']:[v['@context']],version:2|3=contexts.includes('http://iiif.io/api/image/3/context.json')?3:2;
 if(version===2&&!contexts.includes('http://iiif.io/api/image/2/context.json')||v.protocol!=='http://iiif.io/api/image')throw Error('Supported IIIF Image API 2/3 information required');
 const id=httpsUrl(v.id??v['@id']);if(new URL(id).search)throw Error('Query-bearing Image API service identities are unsupported');const width=positive(v.width),height=positive(v.height),profile=Array.isArray(v.profile)?v.profile[0]:v.profile;
 if(typeof profile!=='string'||!/(?:^level[012]$|\/level[012]\.json$)/.test(profile))throw Error('Unsupported Image API compliance profile');
 if(!Array.isArray(v.tiles)||!v.tiles.length||v.tiles.length>16)throw Error('Advertised Image API tiles are required');
 const tile=v.tiles.find((t:any)=>Number.isInteger(t.width)&&t.width>=128&&t.width<=512&&(t.height??t.width)<=512)??v.tiles[0];
 let tileWidth=positive(tile.width,4096),tileHeight=positive(tile.height??tile.width,4096);
 const diagnostics:string[]=[];
 if(tileWidth>512||tileHeight>512){if(/level0/.test(profile))throw Error('Level 0 service tiles exceed the decoded tile budget');tileWidth=tileHeight=512;diagnostics.push('Level 1/2 region-by-pixel tiles are bounded to 512px.');}
 if(tileWidth<128||tileHeight<128||!Array.isArray(tile.scaleFactors)||!tile.scaleFactors.length||tile.scaleFactors.length>32)throw Error('Unsupported tile grid');
 const scales=[...new Set<number>(tile.scaleFactors.map((s:any)=>positive(s,2**24)))].sort((a,b)=>a-b);if(scales.some(s=>Math.log2(s)%1!==0))throw Error('Only power-of-two tile scales are supported');
 if(Math.ceil(width/(tileWidth*Math.max(...scales)))*Math.ceil(height/(tileHeight*Math.max(...scales)))>64)throw Error('Coarsest tile grid exceeds the viewport budget');
 if(v.maxWidth&&tileWidth>positive(v.maxWidth)||(v.maxHeight??v.maxWidth)&&tileHeight>positive(v.maxHeight??v.maxWidth)||v.maxArea&&tileWidth*tileHeight>positive(v.maxArea,1000000000))throw Error('Tiles exceed advertised image service size limits');
 return {kind:'image',id,version,width,height,tileWidth,tileHeight,scales,profile,label:label(v.label)||'IIIF image',rights:label(v.rights??v.license),attribution:label(v.requiredStatement?.value??v.attribution),diagnostics};
}
export function canvasAt(p:Projection,id:string):Canvas {if(p.kind==='image'){if(id!==p.id)throw Error('Unknown canvas');return {id:p.id,label:p.label,width:p.width,height:p.height,service:p.id,rights:p.rights,attribution:p.attribution,diagnostics:p.diagnostics};}const c=p.canvases.find(c=>c.id===id);if(!c)throw Error('Unknown canvas');return c;}
export function tileRequest(info:ImageInfo,scale:number,x:number,y:number){if(!info.scales.includes(scale)||![x,y].every(n=>Number.isSafeInteger(n)&&n>=0))throw Error('Invalid tile coordinates');const rx=x*info.tileWidth*scale,ry=y*info.tileHeight*scale;if(rx>=info.width||ry>=info.height)throw Error('Tile is outside the image');const w=Math.min(info.tileWidth*scale,info.width-rx),h=Math.min(info.tileHeight*scale,info.height-ry),outW=Math.ceil(w/scale),outH=Math.ceil(h/scale);return {url:`${info.id.replace(/\/$/,'')}/${rx},${ry},${w},${h}/${info.version===3?`${outW},${outH}`:outW+','}/0/default.jpg`,width:outW,height:outH};}
