// Disposable Cavern only. Requires build:server and Chrome; no user preferences/files.
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';import os from 'node:os';import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';import express from 'express';import {createServer} from 'vite';
import {createCavernLifecycle} from '../dist/server/cavern-lifecycle.js';
import {closeFilesystemWorkers} from './stage-c-gates/filesystem.mjs';
const root=await mkdtemp(path.join(os.tmpdir(),'services-browser-')),profile=await mkdtemp(path.join(os.tmpdir(),'services-chrome-'));
const lifecycle=createCavernLifecycle({stateFile:path.join(root,'preferences.json')});
const app=express();app.use(express.json());app.use('/api/cavern',lifecycle.router);app.use('/api',lifecycle.middleware);
const vite=await createServer({server:{port:0},plugins:[{name:'services-proof',configureServer(server){server.middlewares.use('/api',(req,res,next)=>{req.url='/api'+req.url;app(req,res,next);});server.middlewares.use('/__services-proof',(_req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Application services qualification</title><p>Disposable service qualification</p>');});}}]});
await vite.listen();const url=vite.resolvedUrls.local[0];
const opened=await fetch(url+'api/cavern/establish',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path:path.join(root,'cavern'),intent:'create'})}).then(r=>r.json());assert.equal(opened.Success,true,opened.Error);const scope={cavernId:opened.Data.current.cavernGuid,session:opened.Data.current.session};
const chrome=spawn(process.env.CHROME_BIN??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank']);let socket;
try{
 const endpoint=await new Promise((resolve,reject)=>{let out='';chrome.stderr.on('data',b=>{out+=b;const m=out.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(m)resolve(m[1]);});chrome.once('error',reject);setTimeout(()=>reject(Error('Chrome startup timeout')),15000).unref();});
 socket=new WebSocket(endpoint);await new Promise(r=>socket.addEventListener('open',r,{once:true}));let id=0;const pending=new Map();
 socket.addEventListener('message',e=>{const m=JSON.parse(e.data),p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}});
 const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const key=++id,timer=setTimeout(()=>reject(Error('CDP timeout '+method)),30000);pending.set(key,{resolve,reject,timer});socket.send(JSON.stringify({id:key,method,params,sessionId}));});
 const {targetId}=await send('Target.createTarget',{url:'about:blank'}),{sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},sessionId);if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 await send('Page.navigate',{url:url+'__services-proof'},sessionId);await new Promise(r=>setTimeout(r,500));
 const connect=`window.scope=${JSON.stringify(scope)};window.client=new (await import('/src/runtime/application-services.ts')).HttpApplicationServices(()=>scope);`;
 const created=await evaluate(`(async()=>{${connect}window.job=crypto.randomUUID();return client.call('jobs.create',{id:job,preparation:{kind:'convert',format:'markdown',source:${JSON.stringify('# Browser\n\n**Semantic** text')}}})})()`);
 assert.equal(created.state,'ready');
 await send('Page.reload',{},sessionId);await new Promise(r=>setTimeout(r,500));
 const result=await evaluate(`(async()=>{${connect}const page=await client.call('jobs.list',{});if(page.jobs.length!==1)throw Error('Missing durable inventory');const inspected=await client.call('jobs.inspect',{id:page.jobs[0].id});const done=await client.call('jobs.run',{id:inspected.id,expectedRevision:inspected.revision});const result=await client.call('jobs.result',{id:inspected.id});return {done,result}})()`);
 assert.equal(result.done.state,'completed');assert.equal(result.result.kind,'convert');assert.ok(JSON.stringify(result.result.fragment).includes('style/bold'));
 const stale=await evaluate(`(async()=>{scope={...scope,session:'stale'};try{await client.call('jobs.inspect',{id:${JSON.stringify(created.id)}});return 'accepted'}catch(e){return e.message}})()`);assert.match(stale,/Cavern changed/);
 console.log(JSON.stringify({browser:await evaluate('navigator.userAgent'),reviewedJob:created.id,reloadRecovery:result.done.state,staleSessionRejected:true,externalAcquisition:false},null,2));
}finally{socket?.close();chrome.kill();await vite.close();await lifecycle.close();await closeFilesystemWorkers();await rm(root,{recursive:true,force:true});await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
