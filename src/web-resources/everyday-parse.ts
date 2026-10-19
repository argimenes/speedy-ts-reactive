import ICAL from 'ical.js';
import {SaxesParser} from 'saxes';
import {parse} from 'parse5';
import {recognizeEveryday,everydayEndpoint,isLocalSource,validateWebFile} from './everyday';
import {safeWebUrl,type WebOriginal,type WebProjection,type WebIdentity} from './model';
type Field={label:string;value:string;provenance:string};
const clean=(v:unknown,max=1000)=>typeof v==='string'?v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').trim().slice(0,max):undefined;
function nodes(source:string){const root=parse(source),out:any[]=[],todo:[any,number][]=[[root,0]];while(todo.length){const [n,d]=todo.pop()!;if(d>64||out.length>=50000)throw Error('Metadata HTML structure limit');out.push(n);for(const c of n.childNodes??[])todo.push([c,d+1]);}return out;}
function plain(v:unknown,max=1000){if(typeof v!=='string')return;const all=nodes(v);return clean(all.filter(n=>n.nodeName==='#text'&&!['script','style','template'].includes(n.parentNode?.tagName)).reverse().map(n=>n.value).join(' '),max);}
function json(body:string){const j=JSON.parse(body.replace(/^\uFEFF/,'')),todo:[any,number][]=[[j,0]];let count=0;while(todo.length){const [v,d]=todo.pop()!;if(++count>50000||d>64)throw Error('Metadata JSON structure limit');if(v&&typeof v==='object')for(const c of Object.values(v))todo.push([c,d+1]);}return j;}
export function everydayProjection(o:WebOriginal):WebProjection {
 const local=isLocalSource(o.source),i=recognizeEveryday(o.source,o.format==='feed'||o.intent==='feed');
 if(!i)throw Error('Unknown everyday resource');
 const p:WebProjection={provider:i.provider,site:({spotify:'Spotify',soundcloud:'SoundCloud',github:'GitHub',amazon:'Amazon',ebay:'eBay',drive:'Google Drive',calendar:'Calendar',podcast:'Podcast'} as any)[i.provider],type:i.resourceType,canonicalUrl:local?undefined:i.url,status:'link-only',diagnostics:i.diagnostic?[i.diagnostic]:[],everyday:{version:1,origins:{canonicalUrl:'normalized supplied URL; not an access assertion'},identity:JSON.parse(JSON.stringify({type:i.resourceType,id:i.id,account:i.account,marketplace:i.marketplace})),fields:[],items:[]}};
 const e=p.everyday!,fields=e.fields;
 const add=(label:string,v:unknown,provenance:string,target=fields)=>{const value=clean(typeof v==='number'?String(v):v);if(value)target.push({label,value,provenance});};
 if(o.failure){p.status='unavailable';p.diagnostics.push(o.failure);}
 if(o.format==='url'){if(o.endpoint||o.body!==undefined||o.file)throw Error('Unexpected link-only body');return JSON.parse(JSON.stringify(p));}
 if(typeof o.body!=='string')throw Error('Missing original');
 if(local){if(!o.file||!['calendar','feed'].includes(o.format)||o.endpoint)throw Error('Invalid local source');validateWebFile(o.source,{name:o.file.name,body:o.body,format:o.format as 'calendar'|'feed'});p.provider=o.format==='calendar'?'calendar':'podcast';p.site=o.file.name;}
 else {const ep=everydayEndpoint(i);if(!ep||ep.format!==o.format||!o.endpoint||(o.format==='feed'||o.format==='calendar'?new URL(ep.url).origin!==new URL(o.endpoint).origin:ep.url!==o.endpoint))throw Error('Everyday endpoint mismatch');if(o.file)throw Error('Unexpected local file');}
 p.status='captured';
 if(o.format==='spotify'||o.format==='soundcloud'){
  const j=json(o.body),expected=o.format==='spotify'?'Spotify':'SoundCloud';
  if(!(o.format==='spotify'?['rich','video'].includes(j.type):j.type==='rich')||j.provider_name!==expected)throw Error('Wrong music response provider');
  p.title=plain(j.title,500);p.description=plain(j.description);p.author=clean(j.author_name,300);p.image=safeWebUrl(j.thumbnail_url);
  const frames=nodes(typeof j.html==='string'?j.html:'').filter(n=>n.tagName==='iframe'),src=frames[0]?.attrs?.find((a:any)=>a.name==='src')?.value;
  if(o.format==='spotify'){
   const u=src&&new URL(src);if(!u||u.origin!=='https://open.spotify.com'||u.pathname!==`/embed/${i.resourceType}/${i.id}`)throw Error('Spotify response identity mismatch');p.embedId=i.resourceType+'/'+i.id;
  }else {if(!src||new URL(src).origin!=='https://w.soundcloud.com'||new URL(src).pathname!=='/player/')throw Error('Wrong SoundCloud widget');p.embedId=i.id;}
  add('Resource',i.resourceType,'supplied URL');add('Provider ID',i.id,'supplied URL');p.diagnostics.push('Metadata is captured; playback and subscription/region availability are separate. No audio is retained.');
 }else if(o.format==='github'){
  const j=json(o.body),k=i.resourceType;
  if(j.private===true||k==='gist'&&j.public!==true)throw Error('Resource is not public');
  const html=safeWebUrl(j.html_url);if(!html)throw Error('Missing GitHub identity');
  const actual=recognizeEveryday(html);if(!actual||actual.provider!=='github'||actual.resourceType!==k||(k==='gist'?actual.id?.toLowerCase()!==i.id?.toLowerCase():actual.account?.toLowerCase()!==i.account?.toLowerCase())||(k==='commit'?!String(actual.id).toLowerCase().startsWith(i.id!.toLowerCase()):k!=='repository'&&actual.id!==i.id))throw Error('GitHub response identity mismatch');
  p.canonicalUrl=html;e.origins!.canonicalUrl='GitHub REST $.html_url, identity checked against supplied URL';
  if(k==='repository'){if(j.full_name?.toLowerCase()!==i.account?.toLowerCase())throw Error('Repository mismatch');p.title=clean(j.full_name,500);p.description=clean(j.description);add('Language',j.language,'$.language');add('Archived',typeof j.archived==='boolean'?String(j.archived):undefined,'$.archived');}
  else if(k==='commit'){p.title=clean(j.commit?.message?.split('\n')[0],500);p.author=clean(j.commit?.author?.name,300);add('SHA',j.sha,'$.sha');}
  else if(k==='gist'){p.title=clean(j.description,500);const files=Object.values(j.files??{}).slice(0,10) as any[];for(const f of files)add('File',f.filename,'$.files[].filename');if(Object.keys(j.files??{}).length>10)p.diagnostics.push('Only ten filenames displayed; complete bounded API response retained.');}
  else {p.title=clean(j.title??j.name??j.tag_name,500);add('State',j.state,'$.state');add('Tag',j.tag_name,'$.tag_name');add('Merged',typeof j.merged==='boolean'?String(j.merged):undefined,'$.merged');}
  p.diagnostics.push('Public API snapshot, not current status. No files, comments or repository history are followed.');
 }else if(o.format==='apple-podcast'){
  const j=json(o.body),r=Array.isArray(j.results)&&j.results.find((r:any)=>String(r.collectionId)===i.id&&r.kind==='podcast');if(!r)throw Error('Public podcast show not found');p.title=clean(r.collectionName,500);p.author=clean(r.artistName,300);p.image=safeWebUrl(r.artworkUrl600??r.artworkUrl100);add('Feed',safeWebUrl(r.feedUrl),'$.results[].feedUrl');p.diagnostics.push('Show catalog metadata only. Feed and episode media are not acquired automatically.');
 }else if(o.format==='calendar'){
  const source=o.body.replace(/^\uFEFF/,''),lines=source.split(/\r?\n/);if(lines.length>20000)throw Error('Calendar line limit');let depth=0;for(const line of lines){if(/^BEGIN:/i.test(line)&&++depth>16)throw Error('Calendar depth limit');if(/^END:/i.test(line)&&--depth<0)throw Error('Invalid calendar nesting');if(line.length>65536)throw Error('Calendar line limit');}if(depth!==0)throw Error('Unclosed calendar');
  const c=new ICAL.Component(ICAL.parse(source));if(c.name!=='vcalendar')throw Error('Expected VCALENDAR');const events=c.getAllSubcomponents('vevent');if(events.length>100)throw Error('Calendar event limit');if(!events.length)throw Error('No event components');
  const method=String(c.getFirstPropertyValue('method')??'');add('Method',method,'VCALENDAR/METHOD');add('Components',events.length,'VCALENDAR/VEVENT');
  for(const v of events.slice(0,25)){
   const f:Field[]=[],get=(name:string)=>v.getFirstPropertyValue(name),raw=(name:string)=>{const prop=v.getFirstProperty(name);return prop?.toICALString().slice(name.length+1);};
   const uid=get('uid'),exception=get('recurrence-id');add('UID',uid,'VEVENT/UID',f);add('Component',exception?'Recurrence exception':get('rrule')?'Recurring master':'Single event','VEVENT/RRULE,RECURRENCE-ID',f);
   for(const name of ['dtstart','dtend']){const prop=v.getFirstProperty(name),value=prop?.getFirstValue();if(value){const tz=prop?.getParameter('tzid');add(name==='dtstart'?'Start':'End',String(value)+' · '+(tz?String(tz):(value as any).isDate?'all-day':(value as any).zone?.tzid==='UTC'?'UTC':'floating local time'),'VEVENT/'+name.toUpperCase(),f);}}
   for(const [label,name] of [['Location','location'],['Organizer','organizer'],['Description','description'],['Status','status'],['Duration','duration'],['Recurrence','rrule'],['Exception date','recurrence-id'],['Excluded dates','exdate'],['Additional dates','rdate']])add(label,raw(name),'VEVENT/'+name.toUpperCase(),f);
   if(method.toUpperCase()==='CANCEL')add('Invitation','Cancellation','VCALENDAR/METHOD',f);
   e.items.push({title:clean(get('summary'),300),fields:f});
  }
  p.title=clean(c.getFirstPropertyValue('x-wr-calname'),500)??clean(events[0].getFirstPropertyValue('summary'),500);p.diagnostics.push('Event components only; no recurrence expansion or timezone conversion. Original VTIMEZONE, rules, exceptions, alarms and unsupported properties are retained, not executed.');if(events.length>25)p.diagnostics.push('Only the first 25 event components are displayed.');
 }else if(o.format==='feed'){
  interface N {name:string;uri:string;text:string;attrs:Record<string,string>;children:N[]}
  const stack:N[]=[],roots:N[]=[];let count=0;
  const parser=new SaxesParser({xmlns:true});parser.on('doctype',()=>{throw Error('Feed DTD/entity declarations are forbidden');});parser.on('opentag',t=>{if(++count>20000||stack.length>=32)throw Error('Feed XML complexity limit');const n:N={name:t.local,uri:t.uri,text:'',attrs:Object.fromEntries(Object.values(t.attributes).map(a=>[a.name,a.value])),children:[]};if(stack.length)stack.at(-1)!.children.push(n);else roots.push(n);stack.push(n);});parser.on('text',t=>{if(stack.length)stack.at(-1)!.text+=t;});parser.on('cdata',t=>{if(stack.length)stack.at(-1)!.text+=t;});parser.on('closetag',()=>{const n=stack.pop()!;if(stack.length)stack.at(-1)!.text+=n.text;});parser.write(o.body.replace(/^\uFEFF/,'')).close();
  const root=roots[0],atom=root?.name==='feed'&&root.uri==='http://www.w3.org/2005/Atom';if(!root||(!atom&&(root.name!=='rss'||root.uri)))throw Error('Expected RSS 2.0 or Atom feed');const channel=atom?root:root.children.find(n=>n.name==='channel');if(!channel)throw Error('Missing feed channel');const get=(n:N,k:string)=>n.children.find(c=>c.name===k)?.text;
  p.title=plain(get(channel,'title'),500);p.description=plain(get(channel,atom?'subtitle':'description'));p.author=plain(get(channel,'author')??get(channel,'managingEditor'),300);
  const artwork=channel.children.find(n=>n.name==='image');p.image=safeWebUrl(artwork?.attrs.href??(artwork&&get(artwork,'url')),o.endpoint);
  const items=channel.children.filter(n=>n.name===(atom?'entry':'item'));
  for(const n of items.slice(0,25)){
   const f:Field[]=[],enc=n.children.find(c=>atom?c.name==='link'&&c.attrs.rel==='enclosure':c.name==='enclosure'),link=atom?n.children.find(c=>c.name==='link'&&(!c.attrs.rel||c.attrs.rel==='alternate'))?.attrs.href:get(n,'link');
   add('GUID / ID',get(n,atom?'id':'guid'),'feed/item identity (scoped to source feed)',f);add('Published',get(n,atom?'published':'pubDate')??get(n,'updated'),'feed/item date',f);add('Duration',get(n,'duration'),'feed/item duration',f);add('Description',plain(get(n,'description')??get(n,'summary')),'feed/item description',f);add('Enclosure type',enc?.attrs.type,'feed/item enclosure type',f);
   e.items.push({title:plain(get(n,'title'),300),fields:f,url:safeWebUrl(link,o.endpoint),enclosure:safeWebUrl(enc?.attrs[atom?'href':'url'],o.endpoint)});
  }
  p.diagnostics.push('Feed snapshot; enclosure links open externally and are not retained audio. No subscription, history crawl or media download.');if(items.length>25)p.diagnostics.push('Only the first 25 entries in source order are displayed; complete bounded feed retained.');
 }
 const origins:Record<string,string>=o.format==='calendar'?{title:'VCALENDAR/X-WR-CALNAME or first VEVENT/SUMMARY'}:o.format==='feed'?{title:'feed/channel/title',description:'feed/channel/description or Atom subtitle',author:'feed/channel/author or managingEditor',image:'feed/channel/image URL'}:o.format==='github'?{title:'REST $.full_name, $.title, $.name, $.tag_name, $.description or $.commit.message (resource type)',description:'REST $.description',author:'REST $.commit.author.name'}:o.format==='apple-podcast'?{title:'$.results[matching collectionId].collectionName',author:'$.results[matching collectionId].artistName',image:'$.results[matching collectionId].artworkUrl600 or artworkUrl100'}:{title:'oEmbed $.title',description:'oEmbed $.description',author:'oEmbed $.author_name',image:'oEmbed $.thumbnail_url'};
 for(const [key,value] of Object.entries(origins))if((p as any)[key]!==undefined)e.origins![key]=value;
 p.diagnostics.push('Typed fields are bounded source assertions from this immutable capture, not canonical or live facts.');
 if(JSON.stringify(p).length>39000){while(e.items.length&&JSON.stringify(p).length>38000)e.items.pop();p.diagnostics.push('Display budget reached; remaining entries are retained only in the original.');}
 return JSON.parse(JSON.stringify(p));
}
