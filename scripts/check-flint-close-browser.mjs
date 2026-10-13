// Measure closing the real Masque document in Flint using an isolated temporary
// Vault, the production router and browser UI. Build the server before running.
import {spawn} from 'node:child_process';
import {mkdtemp, rm, mkdir, writeFile, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import express from 'express';
import {createNativeDocumentStoreRouter} from '../dist/server/native-document-store.mjs';
import {createServer} from 'vite';
const artifacts='artifacts/flint-close';await mkdir(artifacts,{recursive:true});
const profile=await mkdtemp(path.join(tmpdir(),'flint-integration-'));
const vaultRoot=await mkdtemp(path.join(tmpdir(),'vault-cache-browser-'));
await mkdir(path.join(vaultRoot,'.mutable'));await mkdir(path.join(vaultRoot,'notes'));
await writeFile(path.join(vaultRoot,'notes/story.ink'),await readFile(process.env.CLOSE_DOCUMENT??'vaults/imported/documents/edgar-allan-poe/masque-of-the-red-death-[1c48f303].ink'));
const api=express();
api.use('/api/native',createNativeDocumentStoreRouter({root:vaultRoot,defaultVault:'.',establishVault:async()=>({vault:'.'}),nativeDiscoveryWorker:false}));
const vite=await createServer({plugins:[{
 name:'flint-integration-proof',
 resolveId(id){if(id==='/__flint-proof.js')return '\0flint-proof';},
 load(id){if(id==='\0flint-proof')return `
 import {render} from 'solid-js/web';
 import {createComponent} from 'solid-js';
 import {WorkspaceSession} from '/src/application/workspace-session.ts';
 import {WorkspacePresentationView} from '/src/application/workspace-presentation-view.tsx';
 import {materializeLocalWorkspace} from '/src/reactive-editor/workspace-manifest.ts';
 import '/src/index.css';
 import '/src/demo/workspace-demo.css';
 const session=new WorkspaceSession(materializeLocalWorkspace({type:'workspace-block',children:[]}),{features:{nativeDocumentPersistence:true,sqliteKnowledge:false,sqliteEntities:false,flintProbe:false,flintSceneChrome:true}});
 const editor=session.editor;
 editor.commandRegistry.execute('flint.open',{targetKey:session.projection.state.rootKey,args:undefined});
 const win=Object.values(session.projection.state.nodes).find(n=>n.viewType==='window-block');
 editor.commands.setPayloadField(win.key,'metadata',{...JSON.parse(JSON.stringify(win.payload.metadata)),size:{w:1450,h:920},position:{x:25,y:25}});
 const host=document.getElementById('root');host.className='workspace-demo workspace-demo--canonical';
 const dispose=render(()=>createComponent(WorkspacePresentationView,{session}),host);editor.installGateway(document);
 window.proof={editor,session,dispose,host};
 `;},
 configureServer(server){server.middlewares.use((req,res,next)=>req.url.startsWith('/api/')?api(req,res,next):next());server.middlewares.use(async(req,res,next)=>{if(req.url!=='/__flint-integration')return next();res.setHeader('Content-Type','text/html');res.end(await server.transformIndexHtml(req.url,'<html><body><div id="root"></div><script type="module" src="/__flint-proof.js"></script></body></html>'));});}
}],server:{host:'127.0.0.1',port:0,hmr:false}});await vite.listen();
const base=`http://127.0.0.1:${vite.httpServer.address().port}`;
const chrome=spawn(process.env.CHROME_BIN??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank']);
let socket;
try{
 const endpoint=await new Promise((resolve,reject)=>{let out='';chrome.stderr.on('data',b=>{out+=b;const m=out.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(m)resolve(m[1]);});chrome.once('error',reject);setTimeout(()=>reject(Error('Chrome timeout')),15000).unref();});
 socket=new WebSocket(endpoint);await new Promise(r=>socket.addEventListener('open',r,{once:true}));
 let id=0;const pending=new Map(),errors=[];
 socket.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);});
 const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const n=++id;const timer=setTimeout(()=>{pending.delete(n);reject(Error('CDP timeout '+method));},120000);pending.set(n,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});socket.send(JSON.stringify({id:n,method,params,...(sessionId?{sessionId}:{})}));});
 const {targetId}=await send('Target.createTarget',{url:'about:blank'}),{sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
 const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value;};
 const wait=condition=>evaluate(`(async()=>{for(let i=0;i<1200;i++){if(${condition})return;await new Promise(r=>setTimeout(r,50));}throw Error('Timed out: '+${JSON.stringify(condition)})})()`);
 await send('Runtime.enable',{},sessionId);await send('Emulation.setDeviceMetricsOverride',{width:1500,height:990,deviceScaleFactor:1,mobile:false},sessionId);
 await send('Page.navigate',{url:`http://127.0.0.1:${vite.httpServer.address().port}/__flint-integration`},sessionId);
 console.log("Waiting for Flint");
 await wait("window.proof && document.querySelector('.flint-mark[data-logo-ready=true]')");


 await wait(`document.querySelector('[aria-label="Open notes/story.ink"]')`);
 console.log('Closing initial tabs');
 await evaluate(`document.querySelectorAll('.flint-document-tab__close').forEach(b=>b.click())`);
 console.log('Opening document');
 await evaluate(`document.querySelector('[aria-label="Open notes/story.ink"]').click()`);
 await wait(`document.querySelector('.reactive-document-occurrence') && !document.querySelector('[aria-label="Open notes/story.ink"]').disabled`);
 await evaluate(`(async()=>{await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));})()`);
 console.log('Measuring close');
 await send('Profiler.enable',{},sessionId);await send('Profiler.start',{},sessionId);
 const result=await evaluate(`(async()=>{
 const editor=window.proof.editor,times={};
 for(const [object,name] of [[editor.commands,'remove'],[editor.repository,'commit'],[editor.repository,'snapshot'],[editor,'disposeView']]){
 const original=object[name];object[name]=function(...args){const start=performance.now();try{return original.apply(this,args);}finally{const value=times[name]??={ms:0,calls:0};value.ms+=performance.now()-start;value.calls++;}};
 }
 const start=performance.now();document.querySelector('.flint-document-tab__close').click();const handlerMs=performance.now()-start;
 await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
 return {handlerMs,paintMs:performance.now()-start,times,tabs:document.querySelectorAll('.flint-document-tab').length};
 })()`);
 const {profile:cpu}=await send('Profiler.stop',{},sessionId);
 await writeFile(path.join(artifacts,(process.env.CLOSE_RUN??'after')+'.cpuprofile'),JSON.stringify(cpu));
 console.log(JSON.stringify({result,errors},null,2));
 await writeFile(path.join(artifacts,(process.env.CLOSE_RUN??'after')+'.json'),JSON.stringify({result,errors},null,2));
 assert.equal(result.tabs,0);assert.equal(errors.length,0);
 assert.equal(result.times.commit?.calls??0,0,'Closing must not commit an edit');
 assert.equal(result.times.snapshot?.calls??0,0,'Closing must not copy the workspace');
}finally{socket?.close();chrome.kill();await vite.close();await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});await rm(vaultRoot,{recursive:true,force:true});}
