import { emptyFragment, validateFragment } from './fragment';
import { plainFragment } from './serializer';
export type LinkedTextFormat = 'html'|'markdown'|'text';
export interface AcquiredText {source:string;format:LinkedTextFormat;url:string;mediaType:string;byteHash:string}
export interface PassiveVideo {version:1;provider:'youtube'|'vimeo';providerId:string;canonicalUrl:string;title?:string}
/** Syntax only. Never probe a URL, fetch a title, or load a thumbnail. */
export function inspectUri(value:string) {
 if(value.length>4096||/[\u0000-\u0020\\]/.test(value.trim()))throw Error('Enter one absolute HTTP(S) URL without spaces or credentials.');
 const url=new URL(value.trim());
 if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw Error('Enter an HTTP(S) URL without credentials.');
 const video=classifyVideo(url);
 const ext=url.pathname.toLowerCase();
 const format:LinkedTextFormat=/\.(md|markdown)$/.test(ext)?'markdown':/\.txt$/.test(ext)?'text':'html';
 return {url:url.href,video,format,acquirable:url.protocol==='https:'&&!url.port&&!url.hash};
}
function classifyVideo(url:URL):PassiveVideo|undefined {
 if(url.protocol!=='https:'||url.port||url.hash||url.username||url.password)return;
 let provider:PassiveVideo['provider']|undefined,id='';
 if(['youtube.com','www.youtube.com','m.youtube.com','youtu.be','www.youtube-nocookie.com'].includes(url.hostname)) {
  provider='youtube';
  if(url.hostname==='youtu.be'&&/^\/[\w-]{11}$/.test(url.pathname)&&!url.search)id=url.pathname.slice(1);
  else if(['youtube.com','www.youtube.com','m.youtube.com'].includes(url.hostname)&&url.pathname==='/watch'&&[...url.searchParams].length===1&&url.searchParams.has('v'))id=url.searchParams.get('v')!;
  else if(/^\/(embed|shorts)\/[\w-]{11}$/.test(url.pathname)&&!url.search&&url.hostname!=='youtu.be')id=url.pathname.split('/')[2];
  if(!/^[\w-]{11}$/.test(id))return;
 } else if(['vimeo.com','www.vimeo.com','player.vimeo.com'].includes(url.hostname)&&!url.search){
  provider='vimeo';const match=(url.hostname==='player.vimeo.com'?/^\/video\/([1-9]\d{0,11})$/:/^\/([1-9]\d{0,11})$/).exec(url.pathname);if(!match)return;id=match[1];
 }
 if(!provider)return;
 return {version:1,provider,providerId:id,canonicalUrl:provider==='youtube'?`https://www.youtube.com/watch?v=${id}`:`https://vimeo.com/${id}`};
}
export function passiveVideo(value:unknown):PassiveVideo|undefined {
 if(!value||typeof value!=='object')return;const v=value as PassiveVideo;
 if(v.version!==1||typeof v.canonicalUrl!=='string'||v.canonicalUrl.length>200||v.title!==undefined&&(typeof v.title!=='string'||v.title.length>300))return;
 try {const parsed=classifyVideo(new URL(v.canonicalUrl));if(parsed&&parsed.provider===v.provider&&parsed.providerId===v.providerId&&parsed.canonicalUrl===v.canonicalUrl)return {...parsed,...(v.title?{title:v.title}:{})};}catch{}
}
export const playerUrl=(input:PassiveVideo)=>{const v=passiveVideo(input);if(!v)throw Error('Invalid video descriptor');return v.provider==='youtube'?`https://www.youtube-nocookie.com/embed/${v.providerId}?autoplay=0`: `https://player.vimeo.com/video/${v.providerId}?autoplay=0&dnt=1`;};
export function videoFragment(video:PassiveVideo) {
 const validated=passiveVideo(video);if(!validated)throw Error('Unsupported video identifier.');const f=emptyFragment();
 f.blocks.push({localId:'video',type:'mutable/video-block',data:{video:{...validated}},blockProperties:[],children:[],relations:{}});
 f.placements.push({localId:'video-placement',kind:'owned',target:{kind:'local',object:'block',id:'video'}});
 f.roots.push({placement:'video-placement',openStart:false,openEnd:false,clippedStart:false,clippedEnd:false});return validateFragment(f);
}
export function urlFragment(value:string) {
 const {url}=inspectUri(value),f=plainFragment(url);
 f.blocks[0].inline!.properties.push({localId:'url-property',type:'reference/url',startIndex:0,endIndex:[...url].length,isZeroWidth:false,attributes:{},target:{kind:'url',url}});return validateFragment(f);
}
