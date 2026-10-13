// Persistent Library cache browser check. Uses an isolated temporary Vault and
// the production router and Flint views. Build the server before running.
import {spawn} from 'node:child_process';
import {mkdtemp, rm, mkdir, writeFile, rename, unlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import express from 'express';
import {createNativeDocumentStoreRouter} from '../dist/server/native-document-store.mjs';
import {createServer} from 'vite';
const artifacts='artifacts/vault-cache/browser';await mkdir(artifacts,{recursive:true});
const profile=await mkdtemp(path.join(tmpdir(),'flint-integration-'));
const vaultRoot=await mkdtemp(path.join(tmpdir(),'vault-cache-browser-'));
await mkdir(path.join(vaultRoot,'.mutable'));await mkdir(path.join(vaultRoot,'notes'));
const edge=(id,placementId)=>({kind:'owned',placementId,target:{kind:'local',blockId:id}});
const document={format:'mutable-document',version:1,valueEncoding:'codex-authored-value-v1',resourceId:'cache-document',definitionOwnerBlockIds:[],document:{format:'codex-portable-resource-gate',version:1,resourceId:'cache-document',root:edge('cache-document','cache-root'),blocks:[{id:'cache-document',type:'document-block',properties:{metadata:{title:'Cached title'}},children:[edge('cache-text','cache-paragraph')]},{id:'cache-text',type:'standoff-editor-block',properties:{},children:[],inline:[{kind:'text',text:'A small cache fixture.'}]}]}};
const doc=document.document.blocks.find(b=>b.type==='document-block');doc.properties.metadata.title='Cached title';
await writeFile(path.join(vaultRoot,'notes/story.ink'),JSON.stringify(document));
let releaseReconcile;const gate=new Promise(r=>releaseReconcile=r);let holding=true,legacyBackend=false,failStartup=false;const requests=[];
const api=express();api.use(express.json());api.use(async(req,res,next)=>{requests.push({url:req.url,mode:req.body?.mode});if(failStartup&&req.url==='/api/native/vault/default')return res.status(503).json({Success:false,Error:'Temporary storage failure'});if(legacyBackend&&req.url==='/api/native/vault/browse')return res.status(404).json({Success:false,Error:'This service is unavailable in the current Cavern.'});if(holding&&req.url==='/api/native/vault/browse'&&req.body.mode==='reconcile')await gate;next();});
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
const cold=await fetch(base+'/api/native/vault/browse',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({vault:'.'})}).then(r=>r.json());assert.equal(cold.Data.complete,true);
doc.properties.metadata.title='Updated on disk';await writeFile(path.join(vaultRoot,'notes/story.ink'),JSON.stringify(document));requests.length=0;

const chrome=spawn(process.env.CHROME_BIN??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank']);
let socket;
try{
 const endpoint=await new Promise((resolve,reject)=>{let out='';chrome.stderr.on('data',b=>{out+=b;const m=out.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(m)resolve(m[1]);});chrome.once('error',reject);setTimeout(()=>reject(Error('Chrome timeout')),15000).unref();});
 socket=new WebSocket(endpoint);await new Promise(r=>socket.addEventListener('open',r,{once:true}));
 let id=0;const pending=new Map(),errors=[];
 socket.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);});
 const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const n=++id;const timer=setTimeout(()=>{pending.delete(n);reject(Error('CDP timeout '+method));},45000);pending.set(n,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});socket.send(JSON.stringify({id:n,method,params,...(sessionId?{sessionId}:{})}));});
 const {targetId}=await send('Target.createTarget',{url:'about:blank'}),{sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
 const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value;};
 const wait=condition=>evaluate(`(async()=>{for(let i=0;i<1200;i++){if(${condition})return;await new Promise(r=>setTimeout(r,50));}throw Error('Timed out: '+${JSON.stringify(condition)})})()`);
 const check=(name,value)=>{assert.ok(value,name);console.log('Passed: '+name);checks.push(name);};const checks=[];
 const shot=async name=>{const {data}=await send('Page.captureScreenshot',{format:'png'},sessionId);await writeFile(path.join(artifacts,name+'.png'),Buffer.from(data,'base64'));};
 await send('Runtime.enable',{},sessionId);await send('Emulation.setDeviceMetricsOverride',{width:1500,height:990,deviceScaleFactor:1,mobile:false},sessionId);
 await send('Page.navigate',{url:`http://127.0.0.1:${vite.httpServer.address().port}/__flint-integration`},sessionId);
 await wait("window.proof && document.querySelector('.flint-mark[data-logo-ready=true]')");

 await wait(`document.querySelector('[aria-label="Open notes/story.ink"]')?.textContent.includes('Cached title')`);
 check('cached Library renders while filesystem reconciliation is still pending',await evaluate(`document.querySelector('.flint-vault-controls').textContent.includes('Checking for file changes')`));
 const before=requests.filter(r=>r.url==='/api/native/vault/browse').length;
 await evaluate(`[...document.querySelectorAll('.flint-segments button')].find(b=>b.textContent==='Search').click();[...document.querySelectorAll('.flint-segments button')].find(b=>b.textContent==='Browse').click()`);
 check('Browse switches panels without rescanning the Vault',requests.filter(r=>r.url==='/api/native/vault/browse').length===before);
 await shot('cached-listing');holding=false;releaseReconcile();
 await wait(`document.querySelector('[aria-label="Open notes/story.ink"]')?.textContent.includes('Updated on disk')`);
 await wait(`![...document.querySelectorAll('.flint-vault-controls button')].find(b=>b.textContent==='Refresh').disabled`);
 check('background reconciliation updates the title without verified discovery',!requests.some(r=>r.url==='/api/native/vault/discover'));
 await rename(path.join(vaultRoot,'notes/story.ink'),path.join(vaultRoot,'notes/moved.ink'));
 await evaluate(`[...document.querySelectorAll('.flint-vault-controls button')].find(b=>b.textContent==='Refresh').click()`);
 await wait(`document.querySelector('[aria-label="Open notes/moved.ink"]')&&!document.querySelector('[aria-label="Open notes/story.ink"]')`);
 check('Refresh discovers an external rename',true);
 await wait(`![...document.querySelectorAll('.flint-vault-controls button')].find(b=>b.textContent==='Verify files').disabled`);
 await evaluate(`[...document.querySelectorAll('.flint-vault-controls button')].find(b=>b.textContent==='Verify files').click()`);
 await wait(`![...document.querySelectorAll('.flint-vault-controls button')].find(b=>b.textContent==='Verify files').disabled`);
 check('Verify files requests full checksum verification',requests.some(r=>r.mode==='verify'));
 await shot('reconciled-listing');
 await unlink(path.join(vaultRoot,'notes/moved.ink'));
 await evaluate(`document.querySelector('[aria-label="Open notes/moved.ink"]').click()`);
 await wait(`document.querySelector('.flint-vault-controls').textContent.includes('File not found')`);
 check('Open checks the current filesystem even when the cached listing contains the document',true);
 await writeFile(path.join(vaultRoot,'notes/story.ink'),JSON.stringify(document));
 legacyBackend=true;requests.length=0;
 await send('Page.navigate',{url:base+'/__flint-integration'},sessionId);
 await wait(`document.querySelector('[aria-label="Open notes/story.ink"]')?.textContent.includes('Updated on disk')`);
 check('startup lists the Vault when an older backend has no cache endpoint',requests.some(r=>r.url==='/api/native/vault/discover'));
 await evaluate(`[...document.querySelectorAll('.flint-vault-controls button')].find(b=>b.textContent==='Refresh').click()`);
 await wait(`![...document.querySelectorAll('.flint-vault-controls button')].find(b=>b.textContent==='Refresh').disabled`);
 check('legacy Refresh remembers the fallback instead of repeating the missing request',requests.filter(r=>r.url==='/api/native/vault/browse').length===1);
 failStartup=true;
 await send('Page.navigate',{url:base+'/__flint-integration'},sessionId);
 await wait(`document.querySelector('.flint-vault-controls')?.textContent.includes('Could not load Vault contents: Error: Temporary storage failure')`);
 check('startup failure is visible in the Library even before any Vault is selected',await evaluate(`!document.querySelector('[aria-label="Selected folder"]')`));
 await shot('startup-error');failStartup=false;
 await evaluate(`[...document.querySelectorAll('.flint-vault-controls button')].find(b=>b.textContent==='Retry').click()`);
 await wait(`document.querySelector('[aria-label="Open notes/story.ink"]')?.textContent.includes('Updated on disk')`);
 check('Retry recovers the Vault listing without reloading Flint',await evaluate(`!document.querySelector('.flint-vault-controls').textContent.includes('Could not load Vault contents')`));
 await shot('legacy-listing');
 check('no uncaught browser errors',errors.length===0);
 await writeFile(path.join(artifacts,'results.json'),JSON.stringify({checks,errors,requests},null,2));
 console.log('Evidence: '+artifacts);
}finally{holding=false;releaseReconcile();socket?.close();chrome.kill();await vite.close();await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});await rm(vaultRoot,{recursive:true,force:true});}
