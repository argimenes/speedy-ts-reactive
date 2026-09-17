// Actual Chromium IndexedDB probe on a temporary profile and two temporary origins.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { core } from './support.mjs';
const api=await core(), baseline=api.encodeWire(api.fixture(25000));
const profile=await mkdtemp(join(tmpdir(),'codex-preplan-browser-'));
const servers=[]; let active;
async function server() {
  const s=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/baseline'?'text/plain':'text/html');res.end(req.url==='/baseline'?baseline:'<!doctype html><title>Isolated history outbox experiment</title>');});
  await new Promise(resolve=>s.listen(0,'127.0.0.1',resolve));servers.push(s);return `http://127.0.0.1:${s.address().port}`;
}
async function launch() {
  const child=spawn(process.env.CHROME_BIN??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{detached:true,stdio:['ignore','ignore','pipe']});
  active={child};
  const endpoint=await new Promise((resolve,reject)=>{let text='';child.stderr.on('data',chunk=>{text+=chunk;const m=text.match(/DevTools listening on (ws:\/\/\S+)/);if(m)resolve(m[1]);});child.once('error',reject);setTimeout(()=>reject(new Error('Chrome startup timeout')),15000).unref();});
  const socket=new WebSocket(endpoint); active.socket=socket;await new Promise(resolve=>socket.addEventListener('open',resolve,{once:true}));
  const requests=new Map();let sequence=0;
  socket.addEventListener('message',event=>{const m=JSON.parse(event.data);if(requests.has(m.id)){const p=requests.get(m.id);requests.delete(m.id);clearTimeout(p.timer);m.error?p.reject(new Error(JSON.stringify(m.error))):p.resolve(m.result);}});
  const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++sequence;const timer=setTimeout(()=>reject(new Error(`CDP timeout: ${method}`)),30000);requests.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});
  const version=await send('Browser.getVersion'),{targetId}=await send('Target.createTarget',{url:'about:blank'}),{sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},sessionId);if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
  const navigate=async url=>{await send('Page.navigate',{url},sessionId);for(let i=0;i<100;i++){if(await evaluate('location.origin')===url)return;await new Promise(r=>setTimeout(r,20));}throw new Error('Navigation timeout');};
  return {version,evaluate,navigate};
}
async function kill() {
  if(!active)return;
  const {child,socket}=active; active=undefined;socket?.close();
  const exit=new Promise(resolve=>child.once('exit',resolve));process.kill(-child.pid,'SIGKILL');await exit;
}
const initialize=`(async()=>{
window.db=await new Promise((resolve,reject)=>{const r=indexedDB.open('codex-preplan-outbox',1);r.onupgradeneeded=()=>{r.result.createObjectStore('packets');r.result.createObjectStore('meta');};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
window.enqueue=(id,payload,mode='strict',cap=64*1024*1024)=>new Promise((resolve,reject)=>{
 const tx=db.transaction(['packets','meta'],'readwrite',{durability:mode});let reason;
 tx.oncomplete=()=>resolve(tx.durability);tx.onabort=()=>reject(new Error(reason||tx.error?.message||'aborted'));
 const packets=tx.objectStore('packets'),meta=tx.objectStore('meta'),existing=packets.get(id);
 existing.onsuccess=()=>{if(existing.result!==undefined){if(existing.result!==payload){reason='conflicting retry';tx.abort();}return;}
 const used=meta.get('bytes');used.onsuccess=()=>{const size=new TextEncoder().encode(payload).byteLength;if((used.result||0)+size>cap){reason='bounded capacity';tx.abort();return;}
 packets.put(payload,id);meta.put((used.result||0)+size,'bytes');};};
});
window.ack=ids=>new Promise((resolve,reject)=>{const tx=db.transaction(['packets','meta'],'readwrite',{durability:'strict'});tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);
 const p=tx.objectStore('packets'),m=tx.objectStore('meta'),used=m.get('bytes');used.onsuccess=()=>{let remaining=used.result||0;for(const id of ids){const r=p.get(id);r.onsuccess=()=>{if(r.result!==undefined){remaining-=new TextEncoder().encode(r.result).byteLength;p.delete(id);m.put(remaining,'bytes');}};}};
});
window.inspect=()=>new Promise((resolve,reject)=>{const tx=db.transaction(['packets','meta']);const count=tx.objectStore('packets').count(),bytes=tx.objectStore('meta').get('bytes');tx.oncomplete=()=>resolve({count:count.result,bytes:bytes.result||0});tx.onabort=()=>reject(tx.error);});
return true;
})()`;
try {
  const origin=await server(), otherOrigin=await server();let browser=await launch();await browser.navigate(origin);await browser.evaluate(initialize);
  const measurement=await browser.evaluate(`(async()=>{
 const summary=a=>{a.sort((x,y)=>x-y);return {samples:a.length,medianMs:a[Math.floor(a.length/2)],p95Ms:a[Math.ceil(a.length*.95)-1]};};
 const samples=[];for(const mode of ['strict','relaxed','default']){const timings=[];let actual;
 for(let i=0;i<30;i++){const start=performance.now();actual=await enqueue(mode+'-'+i,JSON.stringify({revisionId:crypto.randomUUID(),payload:'x'.repeat(1900)}),mode);timings.push(performance.now()-start);}
 samples.push({requested:mode,actual,...summary(timings)});}
 const body=await (await fetch('/baseline')).text();const start=performance.now();await enqueue('baseline',body);const baselineMs=performance.now()-start;
 const before=await inspect();let capacityRejected=false;try{await enqueue('over-capacity',body,'strict',before.bytes+1);}catch(e){capacityRejected=e.message==='bounded capacity';}
 const after=await inspect();await enqueue('baseline',body);let conflictRejected=false;try{await enqueue('baseline','different');}catch(e){conflictRejected=true;}
 await new Promise(resolve=>{const tx=db.transaction('packets','readwrite');tx.objectStore('packets').put('discard','aborted');tx.onabort=resolve;tx.abort();});
 await ack(['strict-0','strict-1']);await ack(['strict-0']);
 return {samples,baselineBytes:new TextEncoder().encode(body).byteLength,baselineStrictTransactionMs:baselineMs,beforeCapacity:before,afterCapacity:after,capacityRejected,conflictRejected,expectedAfterRestart:await inspect()};
})()`);
  assert.equal(measurement.capacityRejected,true);assert.equal(measurement.conflictRejected,true);assert.deepEqual(measurement.beforeCapacity,measurement.afterCapacity);
  await browser.navigate(otherOrigin);await browser.evaluate(initialize);assert.deepEqual(await browser.evaluate('inspect()'),{count:0,bytes:0});
  await kill();browser=await launch();await browser.navigate(origin);await browser.evaluate(initialize);
  const recovered=await browser.evaluate('inspect()');assert.deepEqual(recovered,measurement.expectedAfterRestart);
  await browser.evaluate(`new Promise((resolve,reject)=>{const tx=db.transaction('packets');const r=tx.objectStore('packets').get('aborted');tx.oncomplete=()=>r.result===undefined?resolve(true):reject(new Error('aborted packet survived'));})`);
  console.log(JSON.stringify({browser:browser.version.product,node:process.version,measurement,recovered,checks:['transactional byte cap leaves packet and ledger unchanged on rejection','identical local retry does not duplicate bytes','conflicting local retry rejected','aborted transaction absent after restart','ack deletion and ledger update are atomic/idempotent','different origin has independent outbox','committed outbox survives whole isolated browser process-group SIGKILL/restart'],limits:['Local headless Chromium only; no Safari/Firefox or OS power-loss test','Server acknowledgement input to local deletion is modeled, not an integrated network protocol','Cap counts payload bytes; actual IndexedDB overhead/quota and eviction not measured','Serial transaction latency, not sustained foreground typing or worker responsiveness']},null,2));
} finally {await kill();await Promise.all(servers.map(s=>new Promise(resolve=>s.close(resolve))));await rm(profile,{recursive:true,force:true});}
