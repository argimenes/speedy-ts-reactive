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
 let pins=0;const bytes=await acquireRemoteAsset('https://example.com/a',undefined,{lookup:async()=>answer,request:transport([{bytes:Buffer.from('original')}],(_url,options)=>{assert.equal(options.agent,false);assert.deepEqual(Object.keys(options.headers).sort(),['Accept','Accept-Encoding']);options.lookup('example.com',{},(error,address,family)=>{assert.equal(address,'8.8.8.8');assert.equal(family,4);pins++;});})});assert.equal(bytes.toString(),'original');assert.equal(pins,1);
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
