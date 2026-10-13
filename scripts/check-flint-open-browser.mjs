// Measure native Open through the first painted editor in an isolated Vault.
// Build the server first. OPEN_BASELINE=1 loads the pre-optimisation client without
// changing workspace files; OPEN_RUN names the recorded benchmark artifacts.
import {spawn,execFileSync} from 'node:child_process';
import {mkdtemp, rm, mkdir, writeFile, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import express from 'express';
import {createNativeDocumentStoreRouter} from '../dist/server/native-document-store.mjs';
import {createServer} from 'vite';
const artifacts='artifacts/flint-open';await mkdir(artifacts,{recursive:true});
const profile=await mkdtemp(path.join(tmpdir(),'flint-integration-'));
const vaultRoot=await mkdtemp(path.join(tmpdir(),'vault-cache-browser-'));
await mkdir(path.join(vaultRoot,'.mutable'));await mkdir(path.join(vaultRoot,'notes'));
const documents={
 small:'vaults/imported/documents/luca-landucci_diary/1495-09-20-[b2cc0ed7].ink',
 large:'vaults/imported/documents/edgar-allan-poe/masque-of-the-red-death-[1c48f303].ink',
 next:'vaults/imported/documents/luca-landucci_diary/1502-01-01-[9f5e16ad].ink',
};
for(const [name,file] of Object.entries(documents))await writeFile(path.join(vaultRoot,'notes',name+'.ink'),await readFile(file));
const api=express();
api.use('/api/native',createNativeDocumentStoreRouter({root:vaultRoot,defaultVault:'.',establishVault:async()=>({vault:'.'}),nativeDiscoveryWorker:false}));
const baseline=new Map();
if(process.env.OPEN_BASELINE==='1'){
 for(const file of ['src/block-tree/repository.ts','src/block-tree/commands.ts','src/block-tree/resource-boundary.ts','src/persistence/native-resource.ts','src/persistence/native-session.ts','src/block-tree/projection.ts']){
  let source=execFileSync('git',['show','HEAD:'+file],{encoding:'utf8'});
  if(file.endsWith('/projection.ts'))source=source.replace('const snapshot = this.repository.snapshot();','const snapshot = this.repository.readState();').replace('payload: { ...content.payload, cycleTargetType: content.viewType },','payload: { ...clone(content.payload), cycleTargetType: content.viewType },').replace('payload: content.payload,','payload: clone(content.payload),');
  baseline.set(path.resolve(file),source);
 }
}
const vite=await createServer({plugins:[{
 name:'open-benchmark-baseline',enforce:'pre',load(id){return baseline.get(id.split('?')[0]);}
},{
 name:'flint-integration-proof',
 resolveId(id){if(id==='/__flint-proof.js')return '\0flint-proof';},
 load(id){if(id==='\0flint-proof')return `
 import {nativeDocumentSession} from '/src/persistence/native-session.ts';
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
 window.proof={editor,session,dispose,host,native:nativeDocumentSession(editor)};
 `;},
 configureServer(server){server.middlewares.use((req,res,next)=>req.url.startsWith('/api/')?api(req,res,next):next());server.middlewares.use(async(req,res,next)=>{if(req.url!=='/__flint-integration')return next();res.setHeader('Content-Type','text/html');res.end(await server.transformIndexHtml(req.url,'<html><body><div id="root"></div><script type="module" src="/__flint-proof.js"></script></body></html>'));});}
}],server:{host:'127.0.0.1',port:0,hmr:false}});await vite.listen();
const base=`http://127.0.0.1:${vite.httpServer.address().port}`;
const chrome=spawn(process.env.CHROME_BIN??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank']);
let socket;
try{
 const endpoint=await new Promise((resolve,reject)=>{let out='';chrome.stderr.on('data',b=>{out+=b;const m=out.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(m)resolve(m[1]);});chrome.once('error',reject);chrome.once('exit',code=>reject(Error(`Chrome exited (${code}): ${out}`)));setTimeout(()=>reject(Error('Chrome timeout: '+out)),30000).unref();});
 socket=new WebSocket(endpoint);await new Promise(r=>socket.addEventListener('open',r,{once:true}));
 let id=0;const pending=new Map(),errors=[];
 socket.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);});
 const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const n=++id;const timer=setTimeout(()=>{pending.delete(n);reject(Error('CDP timeout '+method));},120000);pending.set(n,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});socket.send(JSON.stringify({id:n,method,params,...(sessionId?{sessionId}:{})}));});
 const {targetId}=await send('Target.createTarget',{url:'about:blank'}),{sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
 const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value;};
 const wait=condition=>evaluate(`(async()=>{for(let i=0;i<1200;i++){if(${condition})return;await new Promise(r=>setTimeout(r,50));}throw Error('Timed out: '+${JSON.stringify(condition)})})()`);
 await send('Runtime.enable',{},sessionId);await send('Emulation.setDeviceMetricsOverride',{width:1500,height:990,deviceScaleFactor:1,mobile:false},sessionId);
 await send('Page.navigate',{url:`http://127.0.0.1:${vite.httpServer.address().port}/__flint-integration`},sessionId);
 await send('Page.bringToFront',{},sessionId);
 console.log("Waiting for Flint");
 await wait("window.proof && document.querySelector('.flint-mark[data-logo-ready=true]')");


 await wait(`document.querySelector('[aria-label="Open notes/small.ink"]')`);
 await evaluate(`document.querySelectorAll('.flint-document-tab__close').forEach(b=>b.click())`);
 await evaluate(`(()=>{
 const {editor,native}=window.proof;window.openTimes={};
 for(const [object,name] of [[editor.commands,'insert'],[editor.repository,'commit'],[editor.repository,'snapshot'],[editor,'createView'],[native,'openResource'],[native,'bind']]){
 const original=object[name];object[name]=function(...args){const start=performance.now();const record=()=>{const value=window.openTimes[name]??={ms:0,calls:0};value.ms+=performance.now()-start;value.calls++;};let result;try{result=original.apply(this,args);}catch(error){record();throw error;}if(result?.then)return result.finally(record);record();return result;};
 }
 const fetch=window.fetch;window.fetch=async(...args)=>{const start=performance.now();try{return await fetch(...args);}finally{const key=String(args[0]),value=window.openTimes[key]??={ms:0,calls:0};value.ms+=performance.now()-start;value.calls++;}};
 })()`);
 await send('Profiler.enable',{},sessionId);
 const results=[];
 for(const name of ['small','large','next','small']){
 console.log('Opening '+name);await send('Profiler.start',{},sessionId);
 const result=await evaluate(`new Promise((resolve,reject)=>{
 window.openTimes={};const start=performance.now(),button=document.querySelector('[aria-label="Open notes/${name}.ink"]');
 button.click();
 const timeout=setTimeout(()=>reject(Error('Open timeout')),60000);
 const poll=()=>{const current=document.querySelector('[aria-label="Open notes/${name}.ink"]');if(document.querySelector('.reactive-document-occurrence')&&current&&!current.disabled){requestAnimationFrame(()=>{clearTimeout(timeout);resolve({ms:performance.now()-start,times:window.openTimes,cells:Object.keys(window.proof.editor.repository.readState().contents).length});});}else requestAnimationFrame(poll);};
 requestAnimationFrame(poll);
 })`);
 const {profile:cpu}=await send('Profiler.stop',{},sessionId);
 const filename=(process.env.OPEN_RUN??'after')+'-'+results.length+'-'+name;
 await writeFile(path.join(artifacts,filename+'.cpuprofile'),JSON.stringify(cpu));
 results.push({name,...result});console.log(JSON.stringify(results.at(-1)));
 await evaluate(`document.querySelectorAll('.flint-document-tab__close').forEach(b=>b.click())`);
 }
 await writeFile(path.join(artifacts,(process.env.OPEN_RUN??'after')+'.json'),JSON.stringify({results,errors},null,2));
 assert.equal(errors.length,0);
}finally{socket?.close();chrome.kill();await vite.close();await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});await rm(vaultRoot,{recursive:true,force:true});}
