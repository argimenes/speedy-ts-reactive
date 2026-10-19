import {it,expect} from 'vitest';
import {recognizeEveryday,everydayEndpoint,everydayFrame,localSource,validateWebFile} from './everyday';
import {recognizeWeb,webCandidate} from './registry';
import {webProjection,parseWebBytes} from './parse';
import {webCapture,type WebOriginal} from './model';
const at='2026-10-19T00:00:00Z';
const original=(source:string,body?:unknown):WebOriginal=>{const i=recognizeEveryday(source)!,ep=everydayEndpoint(i);return {version:1,source,adapter:'everyday-v1',capturedAt:at,...(body===undefined?{format:'url'}:{format:ep!.format,endpoint:ep!.url,body:typeof body==='string'?body:JSON.stringify(body)})};};
export const calendar='\uFEFFBEGIN:VCALENDAR\r\nVERSION:2.0\r\nMETHOD:CANCEL\r\nBEGIN:VEVENT\r\nUID:stable@example.org\r\nSUMMARY:Research session\r\nDTSTART;TZID=Australia/Brisbane:20261020T100000\r\nDTEND;TZID=Australia/Brisbane:20261020T110000\r\nRRULE:FREQ=WEEKLY;COUNT=999999999\r\nX-AUTHORED:keep me\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:stable@example.org\r\nRECURRENCE-ID;TZID=Australia/Brisbane:20261027T100000\r\nDTSTART;TZID=Australia/Brisbane:20261027T120000\r\nSTATUS:CANCELLED\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n';
const local=(body:string,format:'calendar'|'feed'='calendar'):WebOriginal=>({version:1,adapter:'everyday-v1',source:localSource(format==='calendar'?'Original.ics':'Original.rss'),file:{name:format==='calendar'?'Original.ics':'Original.rss'},format,capturedAt:at,body});
it.each([
 ['https://open.spotify.com/intl-en/track/0Lr4kGOYn9l83EjuK6cZFQ?si=original','spotify','track'],
 ['https://soundcloud.com/forss/flickermood','soundcloud','track'],
 ['https://github.com/solidjs/solid/issues/12?x=1#issuecomment-1','github','issues'],
 ['https://github.com/solidjs/solid/pull/12','github','pull'],
 ['https://github.com/solidjs/solid/commit/abc1234','github','commit'],
 ['https://github.com/solidjs/solid/releases/tag/v1.9.0','github','releases/tag'],
 ['https://gist.github.com/user/abc12345','github','gist'],
 ['https://www.amazon.com.au/title/dp/B012345678?tag=tracking&th=1','amazon','product'],
 ['https://www.ebay.com/itm/title/123456789012?var=456','ebay','listing'],
 ['https://docs.google.com/spreadsheets/d/abcdefghij12345/edit?usp=sharing','drive','spreadsheets'],
 ['https://drive.google.com/open?id=abcdefghij12345','drive','file'],
 ['https://calendar.google.com/calendar/event?eid=original','calendar','event-link'],
 ['https://podcasts.apple.com/us/podcast/show/id123456789','podcast','apple-show'],
 ['https://podcasts.apple.com/us/podcast/show/id123456789?i=1234567890123','podcast','apple-episode'],
 ['https://example.org/public.rss','podcast','feed'],
])('recognizes exact provider and retains source %s',(source,provider,type)=>{const i=recognizeEveryday(source)!;expect(i.provider).toBe(provider);expect(i.resourceType).toBe(type);expect(i.source).toBe(source);});
it('rejects deceptive hosts/IDs, shortlinks, private tokens and preserves specialised priority',()=>{
 for(const s of ['https://open.spotify.com.evil.test/track/0Lr4kGOYn9l83EjuK6cZFQ','https://github.com.evil.test/o/r','https://drive.google.com.evil.test/file/d/abcdefghij12345'])expect(recognizeEveryday(s)).toBeUndefined();
 for(const s of ['https://open.spotify.com/track/bad','https://github.com/o/r/issues/not-a-number','https://spoti.fi/abc','https://soundcloud.com/a/b?secret_token=private'])expect(everydayEndpoint(recognizeEveryday(s)!)).toBeUndefined();
 for(const s of ['https://youtu.be/dQw4w9WgXcQ','https://vimeo.com/76979871','https://example.org/a.pdf','https://example.org/a.json','https://example.org/a.xml','https://example.org/a.png','https://en.wikipedia.org/wiki/Test'])expect(webCandidate(s)).toBe(false);
 expect(recognizeWeb('https://open.spotify.com/track/0Lr4kGOYn9l83EjuK6cZFQ').provider).toBe('web');
});
it('keeps products and private Drive/event links network-free without invented title, price, access or current availability',()=>{
 for(const s of ['https://amazon.com/dp/B012345678?tag=secret','https://ebay.com/itm/123456789012?var=original','https://drive.google.com/file/d/abcdefghij12345/view','https://outlook.live.com/calendar/0/event/abc']){const o=original(s),p=webProjection(o);expect(p.status).toBe('link-only');expect(p.title).toBeUndefined();expect(p.everyday?.fields).toEqual([]);expect(everydayEndpoint(recognizeEveryday(s)!)).toBeUndefined();expect(o.source).toBe(s);}
});
it('validates music identity, renders only native text, and generates fixed opt-in player URLs',()=>{
 const o=original('https://open.spotify.com/track/0Lr4kGOYn9l83EjuK6cZFQ',{type:'rich',provider_name:'Spotify',title:'<b>Music</b><script>attack()</script>',html:'<iframe src="https://open.spotify.com/embed/track/0Lr4kGOYn9l83EjuK6cZFQ"></iframe>'}),p=webProjection(o);expect(p.title).toBe('Music');expect(everydayFrame({source:o.source,projection:p} as any)).toBe('https://open.spotify.com/embed/track/0Lr4kGOYn9l83EjuK6cZFQ');
 o.body=o.body!.replace('/embed/track/0Lr4kGOYn9l83EjuK6cZFQ','/embed/track/AAAAAAAAAAAAAAAAAAAAAA');expect(()=>webProjection(o)).toThrow('identity');
});
it('projects GitHub fields only from verified response identity and rejects private or different resources',()=>{
 const o=original('https://github.com/solidjs/solid/issues/12',{html_url:'https://github.com/solidjs/solid/issues/12',title:'Issue',state:'closed'});expect(webProjection(o).everyday?.fields[0]).toMatchObject({label:'State',value:'closed',provenance:'$.state'});
 expect(()=>webProjection({...o,body:o.body!.replace('/issues/12','/issues/13')})).toThrow('identity');expect(()=>webProjection({...o,body:JSON.stringify({private:true})})).toThrow('public');
});
it('retains timezone, huge RRULE, cancellation and recurrence exceptions without expanding any instances',()=>{
 const o=local(calendar),bytes=new TextEncoder().encode(JSON.stringify(o)),p=parseWebBytes(bytes);expect(p.status).toBe('captured');expect(p.everyday?.items).toHaveLength(2);expect(JSON.stringify(p)).toContain('Australia/Brisbane');expect(JSON.stringify(p)).toContain('999999999');expect(JSON.stringify(p)).toContain('Recurrence exception');expect(JSON.stringify(p)).toContain('Cancellation');expect(JSON.parse(new TextDecoder().decode(bytes)).body).toBe(calendar);
 const c={version:1,snapshotId:'capture',source:o.source,capturedAt:at,asset:{kind:'managed',cavernId:'v',assetId:'sha256:'+'a'.repeat(64)},projection:p};expect(webCapture(c)).toBe(true);
 expect(()=>validateWebFile('mutable-file:bad',{name:'../bad',body:calendar,format:'calendar'})).toThrow();expect(()=>webProjection(local('BEGIN:VCALENDAR\n'+'BEGIN:VEVENT\n'.repeat(20)))).toThrow('depth');
});
it('parses bounded RSS/Atom without fetching enclosures or rendering descriptions as HTML',()=>{
 const feed='<rss version="2.0"><channel><title>Show</title>'+Array.from({length:30},(_,i)=>`<item><title>Episode ${i}</title><guid>same-guid</guid><description>&lt;script&gt;bad()&lt;/script&gt;&lt;b&gt;Useful&lt;/b&gt;</description><enclosure url="https://media.example.org/${i}.mp3" type="audio/mpeg"/></item>`).join('')+'</channel></rss>';
 const p=webProjection(local(feed,'feed'));expect(p.everyday?.items).toHaveLength(25);expect(JSON.stringify(p)).not.toContain('bad()');expect(p.everyday?.items[0].enclosure).toBe('https://media.example.org/0.mp3');expect(p.diagnostics.join(' ')).toContain('25');
 const atom='<feed xmlns="http://www.w3.org/2005/Atom"><title>Atom</title><entry><title>Entry</title><id>scoped</id><link rel="enclosure" href="https://example.org/audio.mp3"/></entry></feed>';expect(webProjection(local(atom,'feed')).everyday?.items[0].enclosure).toBe('https://example.org/audio.mp3');
 for(const bad of ['<!DOCTYPE rss [<!ENTITY x SYSTEM "file:///etc/passwd">]><rss/>','<rss><broken></rss>','<rss><channel>'+'<x>'.repeat(33)])expect(()=>webProjection(local(bad,'feed'))).toThrow();
});
it('bounds originals, preserves diagnosed parser/provider failures and never activates failure captures',()=>{
 const o=original('https://open.spotify.com/track/0Lr4kGOYn9l83EjuK6cZFQ');o.failure='HTTP 429';const p=webProjection(o);expect(p.status).toBe('unavailable');expect(everydayFrame({source:o.source,projection:p} as any)).toBeUndefined();
 const bad=local('malformed');expect(parseWebBytes(new TextEncoder().encode(JSON.stringify(bad))).status).toBe('unavailable');expect(()=>webProjection(local('x'.repeat(2*1024*1024+1)))).toThrow();
});
it('keeps explicit feed intent in unavailable captures and accepts Spotify video oEmbed without executing markup',()=>{
 const source='https://example.org/feed-without-extension',o:WebOriginal={version:1,adapter:'everyday-v1',intent:'feed',format:'url',source,capturedAt:at,failure:'Response exceeds byte budget'};expect(webProjection(o).provider).toBe('podcast');expect(webProjection(o).status).toBe('unavailable');
 const broken={...o,format:'feed' as const,endpoint:source,body:'broken'};expect(parseWebBytes(new TextEncoder().encode(JSON.stringify(broken))).status).toBe('unavailable');
 const music=original('https://open.spotify.com/track/0Lr4kGOYn9l83EjuK6cZFQ',{type:'video',provider_name:'Spotify',title:'Actual response shape',html:'<iframe src="https://open.spotify.com/embed/track/0Lr4kGOYn9l83EjuK6cZFQ"></iframe>'});expect(webProjection(music).status).toBe('captured');
});
it('preserves VTIMEZONE/all-day/unsupported calendar data and bounds component and XML work',()=>{
 const c='BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VTIMEZONE\r\nTZID:Custom/Zone\r\nBEGIN:STANDARD\r\nDTSTART:19700101T000000\r\nTZOFFSETFROM:+1000\r\nTZOFFSETTO:+1000\r\nEND:STANDARD\r\nEND:VTIMEZONE\r\nBEGIN:VEVENT\r\nUID:day\r\nSUMMARY:All day\r\nDTSTART;VALUE=DATE:20261020\r\nX-UNKNOWN:preserved\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n';const o=local(c);expect(JSON.stringify(webProjection(o))).toContain('all-day');expect(o.body).toContain('X-UNKNOWN:preserved');expect(o.body).toContain('VTIMEZONE');
 const many='BEGIN:VCALENDAR\n'+Array.from({length:101},()=> 'BEGIN:VEVENT\nUID:x\nEND:VEVENT\n').join('')+'END:VCALENDAR';expect(()=>webProjection(local(many))).toThrow('event limit');expect(()=>webProjection(local('<rss><channel>'+'<x/>'.repeat(20001)+'</channel></rss>','feed'))).toThrow('complexity');
});
it('checks issue/PR/commit/release/Gist identities and captured fields independently',()=>{
 const cases:[string,any,string][]=[
 ['https://github.com/o/r/pull/12',{html_url:'https://github.com/o/r/pull/12',title:'PR',state:'closed',merged:true},'Merged'],
 ['https://github.com/o/r/commit/abc1234',{html_url:'https://github.com/o/r/commit/abc123456789',sha:'abc123456789',commit:{message:'Summary\nbody',author:{name:'Author'}}},'SHA'],
 ['https://github.com/o/r/releases/tag/v1',{html_url:'https://github.com/o/r/releases/tag/v1',name:'Release',tag_name:'v1'},'Tag'],
 ['https://gist.github.com/u/abc12345',{html_url:'https://gist.github.com/u/abc12345',public:true,description:'Gist',files:{'a.js':{filename:'a.js',content:'never execute'}}},'File']];
 for(const [source,response,label] of cases){const p=webProjection(original(source,response));expect(p.everyday!.fields.some(f=>f.label===label)).toBe(true);expect(JSON.stringify(p)).not.toContain('never execute');}
});
