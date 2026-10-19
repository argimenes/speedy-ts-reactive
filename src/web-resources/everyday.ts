import {webUrl,type WebIdentity,type WebCapture} from './model';
export type EverydayProvider='spotify'|'soundcloud'|'github'|'amazon'|'ebay'|'calendar'|'drive'|'podcast';
export type EverydayFormat='spotify'|'soundcloud'|'github'|'apple-podcast'|'calendar'|'feed';
export interface WebFile {name:string;body:string;format:'calendar'|'feed'}
export const localSource=(name:string)=>'mutable-file:'+encodeURIComponent(name);
export function validateWebFile(source:string,file:WebFile){
 if(!file||Object.keys(file).some(k=>!['name','body','format'].includes(k))||typeof file.name!=='string'||!file.name||file.name.length>240||/[\\/\u0000-\u001f]/.test(file.name)||source!==localSource(file.name)||!['calendar','feed'].includes(file.format)||typeof file.body!=='string'||new TextEncoder().encode(file.body).length>2*1024*1024||/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(file.body))throw Error('Invalid local event/feed file');
}
export function isLocalSource(source:unknown):source is string {try{return typeof source==='string'&&source.startsWith('mutable-file:')&&localSource(decodeURIComponent(source.slice(13)))===source&&decodeURIComponent(source.slice(13)).length<=240&&!/[\\/\u0000-\u001f]/.test(decodeURIComponent(source.slice(13)))&&source.length>13;}catch{return false;}}
const amazon=['amazon.com','amazon.co.uk','amazon.com.au','amazon.ca','amazon.de','amazon.fr','amazon.it','amazon.es','amazon.co.jp','amazon.in'];
const ebay=['ebay.com','ebay.co.uk','ebay.com.au','ebay.ca','ebay.de','ebay.fr','ebay.it','ebay.es'];
const linkOnly='Link identity only. Public metadata access is not established; no title, current availability or permissions are inferred.';
export function recognizeEveryday(source:string,feed=false):WebIdentity|undefined {
 if(isLocalSource(source))return {source,url:source,provider:source.toLowerCase().endsWith('.ics')?'calendar':'podcast',resourceType:'local-file'};
 const u=webUrl(source),host=u.hostname.replace(/^www\./,''),path=u.pathname.replace(/\/$/,'');
 if(u.protocol!=='https:')return;
 const base={source,url:u.href};
 if(feed||/\.(rss|atom)$/i.test(path))return {...base,provider:'podcast',resourceType:'feed'};
 if(/\.ics$/i.test(path))return {...base,provider:'calendar',resourceType:'icalendar'};
 if(host==='open.spotify.com'){
  const m=/^\/(?:intl-[a-z]{2}\/)?(track|album|playlist|artist|episode|show)\/([a-zA-Z0-9]{22})$/.exec(path);
  return m?{...base,provider:'spotify',resourceType:m[1],id:m[2],url:`https://open.spotify.com/${m[1]}/${m[2]}`}:{...base,provider:'spotify',diagnostic:'Unsupported Spotify URL; copy the full public resource URL.'};
 }
 if(['spotify.link','spoti.fi','on.soundcloud.com','amzn.to','a.co','ebay.us'].includes(host))return {...base,provider:'web',diagnostic:'Short link retained without cross-origin expansion. Copy the full public resource URL.'};
 if(host==='soundcloud.com'){
  const m=/^\/([\w-]{1,100})(?:\/(sets\/)?([\w-]{1,150}))?$/.exec(path);
  return m&&!u.searchParams.has('secret_token')?{...base,provider:'soundcloud',resourceType:m[2]?'playlist':m[3]?'track':'artist',id:path.slice(1),url:'https://soundcloud.com'+path}:{...base,provider:'soundcloud',diagnostic:'Unsupported or private SoundCloud URL; use Open original.'};
 }
 if(host==='github.com'){
  const m=/^\/([\w-]{1,39})\/([\w.-]{1,100})(?:\/(issues|pull|commit|releases\/tag)\/([^/]+))?$/.exec(path);
  if(m&& !['.','..'].includes(m[2])){
   const kind=m[3]??'repository',id=m[4];
   if((['issues','pull'].includes(kind)&&!/^\d{1,12}$/.test(id))||(kind==='commit'&&!/^[a-f0-9]{7,40}$/i.test(id)))return {...base,provider:'github',diagnostic:'Malformed GitHub identifier.'};
   let tag=id;if(kind==='releases/tag'){try{tag=decodeURIComponent(id);if(!tag||tag.length>200||/[\u0000-\u001f]/.test(tag))throw Error();}catch{return {...base,provider:'github',diagnostic:'Invalid release tag.'};}}
   return {...base,provider:'github',account:m[1]+'/'+m[2],id:tag,resourceType:kind,url:'https://github.com'+path};
  }
  return {...base,provider:'github',diagnostic:'Only repository, issue, pull request, commit and tagged release URLs are supported.'};
 }
 if(host==='gist.github.com'){
  const m=/^\/(?:[\w-]+\/)?([a-f0-9]{5,64})$/i.exec(path);return m?{...base,provider:'github',resourceType:'gist',id:m[1],url:'https://gist.github.com/'+m[1]}:{...base,provider:'github',diagnostic:'Unsupported Gist URL.'};
 }
 if(amazon.includes(host)){
  const m=/(?:^|\/)(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})(?:\/|$)/i.exec(path);
  return {...base,provider:'amazon',resourceType:'product',id:m?.[1].toUpperCase(),marketplace:host,url:m?`https://${host}/dp/${m[1].toUpperCase()}`:u.href,diagnostic:linkOnly};
 }
 if(ebay.includes(host)){
  const m=/^\/itm\/(?:[^/]+\/)?(\d{9,15})$/.exec(path);return {...base,provider:'ebay',resourceType:'listing',id:m?.[1],marketplace:host,url:m?`https://${host}/itm/${m[1]}`:u.href,diagnostic:linkOnly};
 }
 if(host==='docs.google.com'||host==='drive.google.com'){
  const m=host==='docs.google.com'?/^\/(document|spreadsheets|presentation)\/(?:u\/\d+\/)?d\/([\w-]{10,200})(?:\/.*)?$/.exec(path):/^\/file\/(?:u\/\d+\/)?d\/([\w-]{10,200})(?:\/.*)?$/.exec(path);
  const queryId=host==='drive.google.com'&&['/open','/uc'].includes(path)&&u.searchParams.getAll('id').length===1?u.searchParams.get('id'):undefined;
  const id=m?(host==='docs.google.com'?m[2]:m[1]):queryId&&/^[\w-]{10,200}$/.test(queryId)?queryId:undefined;
  const kind=m&&host==='docs.google.com'?m[1]:'file';
  return {...base,provider:'drive',resourceType:kind,id,url:id?`https://${host}/${host==='docs.google.com'?kind:'file'}/d/${id}`:u.href,diagnostic:linkOnly+' Sharing is not publishing; open in Google Drive to check access.'};
 }
 if(['calendar.google.com','outlook.live.com','outlook.office.com','outlook.office365.com'].includes(host))return {...base,provider:'calendar',resourceType:'event-link',diagnostic:linkOnly+' Import an explicitly supplied ICS file for event details.'};
 if(host==='podcasts.apple.com'){
  const m=/\/id(\d{1,15})$/.exec(path),episode=u.searchParams.get('i');return m?{...base,provider:'podcast',resourceType:episode?'apple-episode':'apple-show',id:m[1],episodeId:episode&&/^\d{1,20}$/.test(episode)?episode:undefined,url:u.origin+path+(episode?'?i='+encodeURIComponent(episode):''),...(episode?{diagnostic:'Episode link retained. Show metadata is not substituted for episode metadata; open the original or import its explicit feed.'}:{})}:{...base,provider:'podcast',diagnostic:'Unsupported Apple Podcasts URL.'};
 }
}
export function everydayEndpoint(i:WebIdentity):{url:string;format:EverydayFormat}|undefined {
 if(i.diagnostic||isLocalSource(i.source))return;
 if(i.provider==='spotify')return {url:'https://open.spotify.com/oembed?url='+encodeURIComponent(i.url),format:'spotify'};
 if(i.provider==='soundcloud')return {url:'https://soundcloud.com/oembed?format=json&url='+encodeURIComponent(i.url),format:'soundcloud'};
 if(i.provider==='github'){
  const base='https://api.github.com/repos/'+i.account,k=i.resourceType;
  return {format:'github',url:k==='gist'?'https://api.github.com/gists/'+i.id:base+(k==='repository'?'':k==='releases/tag'?'/releases/tags/'+encodeURIComponent(i.id!):'/'+({issues:'issues',pull:'pulls',commit:'commits'}[k!]??'')+'/'+i.id)};
 }
 if(i.provider==='calendar'&&i.resourceType==='icalendar')return {url:i.url.split('#')[0],format:'calendar'};
 if(i.provider==='podcast'){
  if(i.resourceType==='feed')return {url:i.url.split('#')[0],format:'feed'};
  if(i.resourceType==='apple-show')return {url:'https://itunes.apple.com/lookup?id='+i.id+'&entity=podcast',format:'apple-podcast'};
 }
}
export function everydayFrame(c:WebCapture):string|undefined {
 if(c.projection.status!=='captured'||!c.projection.everyday)return;
 const i=recognizeEveryday(c.source);if(!i||i.diagnostic)return;
 if(i.provider==='spotify'&&c.projection.embedId===`${i.resourceType}/${i.id}`)return 'https://open.spotify.com/embed/'+c.projection.embedId;
 if(i.provider==='soundcloud'&&c.projection.embedId===i.id)return 'https://w.soundcloud.com/player/?url='+encodeURIComponent(i.url)+'&auto_play=false&show_comments=false';
}
