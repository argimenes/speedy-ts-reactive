// Isolated browser transport/publication control; no application provider, user vault or UI rollout.
import {build} from 'esbuild';import {createServer} from 'node:http';import {spawn} from 'node:child_process';import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
const out='artifacts/native-knowledge-p2',bundle=await build({entryPoints:['src/knowledge/transport.ts'],bundle:true,write:false,platform:'browser',format:'iife',globalName:'NativeFacts'});
const samples=Object.fromEntries(await Promise.all(['sample','large'].map(async key=>[key,await readFile(`${out}/${key==='sample'?'final/sample-facts.json':'large-facts.json'}`,'utf8')])));
let serverJSONMs=0,serverHeapPeak=0;const serverMemoryBefore=process.memoryUsage();
const server=createServer((req,res)=>{res.setHeader('Cache-Control','no-store');if(req.url==='/module.js'){res.setHeader('Content-Type','text/javascript');res.end(bundle.outputFiles[0].text);}else if(req.url==='/sample'||req.url==='/large'){res.setHeader('Content-Type','application/json');const start=performance.now(),body=JSON.stringify({wire:samples[req.url.slice(1)]});serverJSONMs+=performance.now()-start;res.end(body);serverHeapPeak=Math.max(serverHeapPeak,process.memoryUsage().heapUsed);}else {res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>P2 transport qualification</title><script src="/module.js"></script>');}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const profile=await mkdtemp(path.join(os.tmpdir(),'native-p2-browser-'));const chrome=spawn(process.env.CHROME_BIN??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank']);let socket;
try{
 const endpoint=await new Promise((resolve,reject)=>{let log='';chrome.stderr.on('data',b=>{log+=b;const m=log.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(m)resolve(m[1]);});chrome.once('error',reject);setTimeout(()=>reject(Error('Chrome timeout')),15000).unref();});
 socket=new WebSocket(endpoint);await new Promise(r=>socket.addEventListener('open',r,{once:true}));let id=0;const pending=new Map();socket.addEventListener('message',e=>{const v=JSON.parse(e.data),p=pending.get(v.id);if(p){pending.delete(v.id);v.error?p.reject(Error(JSON.stringify(v.error))):p.resolve(v.result);}});
 const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});socket.send(JSON.stringify({id:n,method,params,...(sessionId?{sessionId}:{})}));});
 const {targetId}=await send('Target.createTarget',{url:'about:blank'}),{sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},sessionId);if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}`},sessionId);await evaluate('new Promise(r=>setTimeout(r,300))');
 await send('HeapProfiler.collectGarbage',{},sessionId);const before=await send('Runtime.getHeapUsage',{},sessionId);
 const results=await evaluate(`(async()=>{
 const results=[];window.held=[];
 for(const [name,count] of [['sample',100],['large',1]]){
  let transferMs=0,decodeMs=0,publicationMs=0,maxGap=0,last=performance.now();const timer=setInterval(()=>{const now=performance.now();maxGap=Math.max(maxGap,now-last-5);last=now},5);
  for(let i=0;i<count;i++){let start=performance.now();const response=await fetch('/'+name),body=await response.json();transferMs+=performance.now()-start;
   start=performance.now();const facts=NativeFacts.decodeFacts(body.wire);decodeMs+=performance.now()-start;
   start=performance.now();window.held.push(facts);publicationMs+=performance.now()-start;
  }await new Promise(r=>setTimeout(r,20));clearInterval(timer);results.push({name,count,transferMs,decodeMs,publicationMs,maxGap});
 }return results;
})()`);
 await send('HeapProfiler.collectGarbage',{},sessionId);const retained=await send('Runtime.getHeapUsage',{},sessionId);await evaluate('window.held=[]');await send('HeapProfiler.collectGarbage',{},sessionId);const released=await send('Runtime.getHeapUsage',{},sessionId);
 const report={method:'Chrome isolated JSON transport + production grammar decode + retained-array sink; no background provider, canonical repository or browser index. HTTP file serving excludes native discovery/extraction (measured separately).',browser:await send('Browser.getVersion'),results,server:{serverJSONMs,serverMemoryBefore,serverMemoryAfter:process.memoryUsage(),serverHeapPeak},memory:{before,retained,released}};await writeFile(out+'/browser-transport.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{socket?.close();chrome.kill('SIGTERM');await new Promise(r=>server.close(r));await rm(profile,{recursive:true,force:true,maxRetries:4,retryDelay:250});}
