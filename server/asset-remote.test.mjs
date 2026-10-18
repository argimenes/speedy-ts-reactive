import {test} from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';import {Readable} from 'node:stream';
import {acquireRemoteAsset,publicAddress,remoteAssetUrl} from './asset-remote.mjs';
test('rejects nonpublic IPv4/IPv6, mapped addresses and unsafe schemes/credentials/ports',()=>{
 for(const address of ['127.0.0.1','10.0.0.1','169.254.169.254','192.168.1.2','172.20.1.1','0.0.0.0','100.64.0.1','192.0.2.1','224.0.0.1','::1','::','fc00::1','fe80::1','::ffff:8.8.8.8'])assert.equal(publicAddress(address),false,address);
 assert.equal(publicAddress('8.8.8.8'),true);assert.equal(publicAddress('2606:4700:4700::1111'),true);
 for(const value of ['http://example.com/a','file:///a','https://a:b@example.com/a','https://example.com:8443/a'])assert.throws(()=>remoteAssetUrl(value));
});
const answer=[{address:'8.8.8.8',family:4}];
const transport=(responses,inspect=()=>{})=>(url,options,callback)=>{inspect(url,options);const req=new EventEmitter();req.destroy=e=>req.emit('error',e);req.end=()=>queueMicrotask(()=>{const response=responses.shift();const stream=Readable.from(response.bytes?[response.bytes]:[]);stream.statusCode=response.status??200;stream.headers=response.headers??{};callback(stream);});return req;};
test('pins vetted DNS to the actual connection and sends no credentials or cookies',async()=>{
 let pins=0;const bytes=await acquireRemoteAsset('https://example.com/a',undefined,{lookup:async()=>answer,request:transport([{bytes:Buffer.from('original')}],(_url,options)=>{assert.equal(options.agent,false);assert.deepEqual(Object.keys(options.headers).sort(),['Accept','Accept-Encoding','User-Agent']);options.lookup('example.com',{},(error,address,family)=>{assert.equal(address,'8.8.8.8');assert.equal(family,4);pins++;});})});assert.equal(bytes.toString(),'original');assert.equal(pins,1);
});
test('identifies the importer on every redirect without changing the consented query',async()=>{
 const url='https://upload.wikimedia.org/wikipedia/commons/b/b2/Josef_Hofman.jpg?utm_source=en.wikipedia.org&utm_campaign=parser&utm_content=thumbnail_unscaled',seen=[];
 const result=await acquireRemoteAsset(url,undefined,{lookup:async()=>answer,request:transport([{status:302,headers:{location:'/original.jpg?source=clipboard'}},{bytes:Buffer.from('original JPEG bytes')}],(u,options)=>{seen.push(u.href);assert.equal(options.headers['User-Agent'],'MutableOS/0.0.0 (Flint; user-requested resource import)');assert.equal(options.headers.Accept,'image/png, image/jpeg');})});
 assert.deepEqual(seen,[url,'https://upload.wikimedia.org/original.jpg?source=clipboard']);assert.equal(result.toString(),'original JPEG bytes');
});
test('reports the remote HTTP status instead of a generic rejection',async()=>{
 for(const status of [403,404,429])await assert.rejects(acquireRemoteAsset('https://example.com/a',undefined,{lookup:async()=>answer,request:transport([{status}])}),new RegExp(`HTTP ${status}`));
});
test('rejects mixed public/private DNS before connecting',async()=>{await assert.rejects(acquireRemoteAsset('https://example.com/a',undefined,{lookup:async()=>[...answer,{address:'127.0.0.1',family:4}],request:()=>{assert.fail('must not connect');}}),/not public/);});
test('revalidates same-origin redirects and refuses a changed origin or rebound address',async()=>{
 let lookups=0;await assert.rejects(acquireRemoteAsset('https://example.com/a',undefined,{lookup:async()=>++lookups===1?answer:[{address:'10.0.0.1',family:4}],request:transport([{status:302,headers:{location:'/b'}}])}),/not public/);
 await assert.rejects(acquireRemoteAsset('https://example.com/a',undefined,{lookup:async()=>answer,request:transport([{status:302,headers:{location:'https://other.example/a'}}])}),/new consent/);
 await assert.rejects(acquireRemoteAsset('https://example.com/a',undefined,{lookup:async()=>answer,request:transport(Array.from({length:4},()=>({status:302,headers:{location:'/b'}})))}),/redirect limit/);
});
test('rejects oversized responses and honours an already-aborted import',async()=>{
 await assert.rejects(acquireRemoteAsset('https://example.com/a',undefined,{lookup:async()=>answer,request:transport([{headers:{'content-length':String(11*1024*1024)}}])}),/rejected/);
 const controller=new AbortController();controller.abort();await assert.rejects(acquireRemoteAsset('https://example.com/a',controller.signal));
});

test('text acquisition shares pinning/redirect protections and returns exact validated UTF-8 source',async()=>{
 const {acquireRemoteText}=await import('./asset-remote.mjs');let pins=0;
 const result=await acquireRemoteText('https://example.com/a','html',undefined,{lookup:async()=>answer,request:transport([{status:302,headers:{location:'/folder/page'}},{bytes:Buffer.from('<p>héllo</p>'),headers:{'content-type':'text/html; charset=utf-8'}}],(_url,options)=>{assert.equal(options.headers.Accept,'text/html');assert.equal(options.headers['Accept-Encoding'],'identity');assert.equal(options.headers.Cookie,undefined);options.lookup('example.com',{},(_,a)=>{assert.equal(a,'8.8.8.8');pins++;});})});
 assert.equal(result.source,'<p>héllo</p>');assert.equal(result.url,'https://example.com/folder/page');assert.match(result.byteHash,/^[a-f0-9]{64}$/);assert.equal(pins,2);
 for(const format of ['markdown','text']){const r=await acquireRemoteText('https://example.com/a',format,undefined,{lookup:async()=>answer,request:transport([{bytes:Buffer.from('source'),headers:{'content-type':format==='text'?'text/plain':'text/markdown'}}])});assert.equal(r.source,'source');}
 await assert.rejects(acquireRemoteText('https://example.com/a','html',undefined,{lookup:async()=>answer,request:transport([{status:302,headers:{location:'https://other.test/a'}}])}),/new consent/);
 let n=0;await assert.rejects(acquireRemoteText('https://example.com/a','html',undefined,{lookup:async()=>++n===1?answer:[{address:'127.0.0.1',family:4}],request:transport([{status:302,headers:{location:'/b'}}])}),/not public/);
});
test('text policy rejects mismatched formats, charsets, compressed and excessive responses',async()=>{
 const {acquireRemoteText}=await import('./asset-remote.mjs');
 for(const response of [
  {headers:{'content-type':'image/png'}},{headers:{'content-type':'text/html; charset=iso-8859-1'}},
  {headers:{'content-type':'text/html','content-encoding':'gzip'}},{headers:{'content-type':'text/html','content-length':String(3*1024*1024)}},
  {bytes:Buffer.from([255]),headers:{'content-type':'text/html'}},{bytes:Buffer.from('<meta charset="windows-1252">'),headers:{'content-type':'text/html'}},
  {bytes:Buffer.from('a'.repeat(200001)),headers:{'content-type':'text/html'}},{bytes:Buffer.from('a'.repeat(2*1024*1024+1)),headers:{'content-type':'text/html'}},
  {bytes:Buffer.from('\0'),headers:{'content-type':'text/html'}},{bytes:Buffer.from('é'),headers:{'content-type':'text/html; charset=us-ascii'}}
 ])await assert.rejects(acquireRemoteText('https://example.com/a','html',undefined,{lookup:async()=>answer,request:transport([response])}));
 await assert.rejects(acquireRemoteText('https://example.com/a','video'),/Unsupported/);
 await assert.rejects(acquireRemoteText('https://example.com/a','markdown',undefined,{lookup:async()=>answer,request:transport([{bytes:Buffer.from('<html>'),headers:{'content-type':'text/markdown'}}])}),/not Markdown/);
});
test('cancellation interrupts pending text DNS and streaming requests',async()=>{
 const {acquireRemoteText}=await import('./asset-remote.mjs');
 const controller=new AbortController(),pending=acquireRemoteText('https://example.com/a','html',controller.signal,{lookup:()=>new Promise(()=>{}),request:()=>assert.fail('must not connect')});controller.abort();await assert.rejects(pending);
 const streaming=new AbortController();let stop;
 const result=acquireRemoteText('https://example.com/a','html',streaming.signal,{lookup:async()=>answer,request:(_u,options,callback)=>{const req=new EventEmitter();req.end=()=>{const stream=new Readable({read(){}});stream.statusCode=200;stream.headers={'content-type':'text/html'};callback(stream);stop=()=>stream.destroy(Error('aborted'));options.signal.addEventListener('abort',stop);queueMicrotask(()=>streaming.abort());};return req;}});await assert.rejects(result,/aborted/);
});

test('explicit Markdown accepts text/plain without admitting an HTML response',async()=>{
 const {acquireRemoteText}=await import('./asset-remote.mjs');
 const dependencies=bytes=>({lookup:async()=>answer,request:transport([{bytes:Buffer.from(bytes),headers:{'content-type':'text/plain'}}])});
 const result=await acquireRemoteText('https://example.com/readme.md','markdown',undefined,dependencies('# Heading'));assert.equal(result.format,'markdown');assert.equal(result.source,'# Heading');assert.equal(result.mediaType,'text/plain');
 await assert.rejects(acquireRemoteText('https://example.com/readme.md','markdown',undefined,dependencies('<!doctype html><html>')),/not Markdown/);
});


test('scholarly acquisition fixes provider endpoints and preserves remote security boundaries',async()=>{
 const {acquireScholarlyJson}=await import('./asset-remote.mjs');
 let seen;const r=await acquireScholarlyJson('datacite','10.1234/a/b',undefined,{lookup:async()=>answer,request:transport([{bytes:Buffer.from('{"data":{}}'),headers:{'content-type':'application/vnd.api+json'}}],u=>seen=u.href)});
 assert.equal(seen,'https://api.datacite.org/dois/10.1234%2Fa%2Fb');assert.equal(new TextDecoder().decode(r.bytes),'{"data":{}}');
 await assert.rejects(acquireScholarlyJson('arbitrary','10.1234/a'),/Invalid/);
 for(const response of [{status:302,headers:{location:'https://private.example/x'}},{headers:{'content-type':'text/html'}},{headers:{'content-type':'application/json','content-length':String(2*1024*1024+1)}}])await assert.rejects(acquireScholarlyJson('crossref','10.1234/a',undefined,{lookup:async()=>answer,request:transport([response])}));
 await assert.rejects(acquireScholarlyJson('crossref','10.1234/a',undefined,{lookup:async()=>[{address:'127.0.0.1',family:4}]}),/not public/);
});

test('Wikipedia acquisition resolves once and pins the second call to the selected revision',async()=>{
 const {acquireEncyclopedia}=await import('./asset-remote.mjs');const seen=[];
 const first=Buffer.from(JSON.stringify({query:{pages:[{ns:0,pageid:42,revisions:[{revid:123}]}]}})),second=Buffer.from('{"parse":{"revid":123}}');
 const r=await acquireEncyclopedia({site:'en.wikipedia.org',title:'Redirect'},undefined,{lookup:async()=>answer,request:transport([first,second].map(bytes=>({bytes,headers:{'content-type':'application/json'}})),url=>seen.push(url))});
 assert.equal(seen[0].searchParams.get('redirects'),'1');assert.equal(seen[1].searchParams.get('oldid'),'123');assert.equal(seen[1].searchParams.has('page'),false);assert.deepEqual(Buffer.from(r.responses[1]),second);
 for(const source of ['Q42/../../evil',{site:'en.wikipedia.org.evil',title:'A'},{site:'localhost',title:'A'}])await assert.rejects(acquireEncyclopedia(source));
 await assert.rejects(acquireEncyclopedia('Q42',undefined,{lookup:async()=>[{address:'127.0.0.1',family:4}]}),/public/);
 await assert.rejects(acquireEncyclopedia('Q42',undefined,{lookup:async()=>answer,request:transport([{status:302,headers:{location:'https://evil.test/api'}}])}),/consent/);
 await assert.rejects(acquireEncyclopedia('Q42',undefined,{lookup:async()=>answer,request:transport([{bytes:Buffer.from('<html>'),headers:{'content-type':'text/html'}}])}),/JSON/);
});
