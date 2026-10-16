import sharp from 'sharp';
// Stage E: real Flint collection UI, actual native writer/assets, workers and IndexedDB restart.
import {spawn} from 'node:child_process';
import {mkdtemp,rm,mkdir,writeFile,readFile,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import express from 'express';
import {EventEmitter} from 'node:events';
import {Readable} from 'node:stream';
import {createManagedAssetService} from '../server/managed-assets-router.mjs';
import {closeFilesystemWorkers} from './stage-c-gates/filesystem.mjs';
const root=await mkdtemp(path.join(tmpdir(),'interchange-proof-')),profile=await mkdtemp(path.join(tmpdir(),'interchange-chrome-'));
const source=await mkdtemp(path.join(tmpdir(),'collection-source-'));
await mkdir(path.join(source,'nested'));await mkdir(path.join(source,'images'));
const png=await sharp({create:{width:2,height:2,channels:4,background:'#7856bc'}}).png().toBuffer();
await writeFile(path.join(source,'images','pixel.png'),png);
await writeFile(path.join(source,'Home.md'),'# Home\n\n[[nested/Letter|Letter]] ![[images/pixel.png]] [[missing]]\n\n[Ambiguous](dual) ![remote](https://example.invalid/remote.png)');
await writeFile(path.join(source,'nested','Letter.md'),'[Home](../Home.md) ![Same](../images/pixel.png)\n\n`[[Home]]`');
await writeFile(path.join(source,'dual.md'),'First');await writeFile(path.join(source,'dual.markdown'),'Second');await writeFile(path.join(source,'unsupported.pdf'),'inert');
const acquisitions=[];
const assets=createManagedAssetService({root,cavernId:'proof',session:'proof',remoteTextDependencies:{lookup:async()=>[{address:'8.8.8.8',family:4}],request:(url,options,callback)=>{acquisitions.push(url.href);const req=new EventEmitter();req.end=()=>queueMicrotask(()=>{const stream=Readable.from([Buffer.from('<p>Remote <strong>semantic</strong> text <img src="https://interchange-probe.invalid/photo.png"></p>')]);stream.statusCode=200;stream.headers={'content-type':'text/html; charset=utf-8'};callback(stream);});req.destroy=e=>req.emit('error',e);return req;}}});await assets.recover();
const app=express();app.use(express.json({limit:'32mb'}));app.use('/api/assets',assets.router);
const vite=await createServer({plugins:[{name:'interchange-proof',resolveId(id){if(id==='/__interchange.js')return '\0interchange';},load(id){if(id==='\0interchange')return `
 import {render} from 'solid-js/web';import {createComponent} from 'solid-js';
 import {WorkspaceSession} from '/src/application/workspace-session.ts';import {WorkspacePresentationView} from '/src/application/workspace-presentation-view.tsx';import {materializeLocalWorkspace} from '/src/reactive-editor/workspace-manifest.ts';
 import {nativeDocumentSession} from '/src/persistence/native-session.ts';
 import '/src/index.css';import '/src/demo/workspace-demo.css';
 const session=new WorkspaceSession(materializeLocalWorkspace({type:'workspace-block',children:[]}),{features:{nativeDocumentPersistence:true,nativeKnowledge:false,sqliteKnowledge:false,flintProbe:false}});
 const editor=session.editor;editor.setAssetContext(()=>({cavernId:'proof',session:'proof'}));editor.commandRegistry.execute('flint.open',{targetKey:session.projection.state.rootKey,args:undefined});
 const win=Object.values(session.projection.state.nodes).find(n=>n.viewType==='window-block');editor.commands.setPayloadField(win.key,'metadata',{...JSON.parse(JSON.stringify(win.payload.metadata)),size:{w:1400,h:900},position:{x:10,y:10}});
 const host=document.getElementById('root');host.className='workspace-demo workspace-demo--canonical';const dispose=render(()=>createComponent(WorkspacePresentationView,{session}),host);editor.installGateway(document);
 const active=()=>[...editor.projections.values()].find(v=>v!==session.projection&&Object.values(v.state.nodes).some(n=>n.viewType==='document-block'));
 const text=()=>Object.values(active().state.nodes).find(n=>n.viewType==='standoff-editor-block');
 const select=(start,end=start)=>{const n=text(),m=editor.mounts.get(n.key);m.focus();m.restoreInlineSelection({anchor:start,head:end});editor.selections.setPrimary(n.key,n.contentKey,n.viewId,start,end);return n.key;};
 window.proof={editor,session,dispose,active,text,select,native:nativeDocumentSession(editor)};
 `;},configureServer(server){server.middlewares.use(app);server.middlewares.use(async(req,res,next)=>{if(req.url!=='/__interchange')return next();res.setHeader('Content-Type','text/html');res.end(await server.transformIndexHtml(req.url,'<html><body><div id="root"></div><script type="module" src="/__interchange.js"></script></body></html>'));});}}],server:{host:'127.0.0.1',port:0,hmr:false}});
const {createNativeDocumentStoreRouter}=await vite.ssrLoadModule('/server/native-document-store.mjs');app.use('/api/native',createNativeDocumentStoreRouter({root}));
await vite.listen();
const chrome=spawn(process.env.CHROME_BIN??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank']);let socket;
try{
 const endpoint=await new Promise((resolve,reject)=>{let out='';chrome.stderr.on('data',b=>{out+=b;const m=out.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(m)resolve(m[1]);});chrome.once('error',reject);setTimeout(()=>reject(Error('Chrome timeout')),15000).unref();});socket=new WebSocket(endpoint);await new Promise(r=>socket.addEventListener('open',r,{once:true}));
 let id=0;const pending=new Map(),errors=[],external=[];
 socket.addEventListener('message',event=>{const m=JSON.parse(event.data),p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);if(m.method==='Network.requestWillBeSent'&&!m.params.request.url.startsWith('http://127.0.0.1:')&&!/^(blob:|data:|chrome-extension:)/.test(m.params.request.url))external.push(m.params.request.url);});
 const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const n=++id,timer=setTimeout(()=>reject(Error('CDP timeout '+method)),180000);pending.set(n,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});socket.send(JSON.stringify({id:n,method,params,...(sessionId?{sessionId}:{})}));});
 const {targetId}=await send('Target.createTarget',{url:'about:blank'}),{sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true},sessionId);if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 const wait=async condition=>{for(let i=0;i<1000;i++){try{if(await evaluate(`!!(${condition})`))return;}catch{}await new Promise(r=>setTimeout(r,30));}throw Error('Timed out '+condition);};
 const click=text=>evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)}).click()`);
 const origin=`http://127.0.0.1:${vite.httpServer.address().port}`;
 await send('Runtime.enable',{},sessionId);await send('Network.enable',{},sessionId);await send('Page.bringToFront',{},sessionId);await send('Emulation.setDeviceMetricsOverride',{width:1500,height:990,deviceScaleFactor:1,mobile:false},sessionId);
 await send('Browser.grantPermissions',{origin,permissions:['clipboardReadWrite','clipboardSanitizedWrite']});await send('Page.navigate',{url:origin+'/__interchange'},sessionId);await wait("window.proof&&document.querySelector('.flint-application .reactive-standoff-flow')");



 const setInput=(label,value)=>evaluate(`(()=>{const l=[...document.querySelectorAll('.collection-dialog label')].find(l=>l.textContent.startsWith(${JSON.stringify(label)}));const i=l.querySelector('input:not([type=checkbox]),select');const setter=Object.getOwnPropertyDescriptor(i instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set;setter.call(i,${JSON.stringify(value)});i.dispatchEvent(new Event(i.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`);
 const menu=async label=>{await evaluate(`document.querySelector('.flint-application__menu-button')?.click()`);if(!await evaluate(`[...document.querySelectorAll('button')].some(b=>b.textContent.trim()===${JSON.stringify(label)})`)){await evaluate(`[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')==='Flint application menu'||b.textContent.trim()==='Flint')?.click()`);}await click(label);};
 await evaluate(`proof.initialRevision=proof.editor.repository.state.revision;proof.initialContents=Object.keys(proof.editor.repository.state.contents).length`);
 // Menu opens the actual Solid dialog. Supply a real folder through browser's upload fallback.
 await evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')==='Flint application menu'||b.getAttribute('aria-label')==='Flint application menu');if(b)b.click();else document.querySelector('.flint-application__brand button, .flint-application__menu-button, .flint-application__menu-trigger')?.click();})()`);
 await wait(`[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Import collection…')`);await click('Import collection…');
 await send('DOM.enable',{},sessionId);const {root:domRoot}=await send('DOM.getDocument',{},sessionId);const {nodeId}=await send('DOM.querySelector',{nodeId:domRoot.nodeId,selector:'.collection-dialog input[type=file]'},sessionId);await send('DOM.setFileInputFiles',{nodeId,files:[source]},sessionId);
 await wait(`document.querySelector('.collection-dialog').textContent.includes('6 selected files')`);
 const started=Date.now();await click('Review collection');await wait(`document.querySelector('.collection-dialog [role=status]').textContent.includes('No documents have been saved')`);const reviewMs=Date.now()-started;
 const screenshot=await send('Page.captureScreenshot',{format:'png'},sessionId);await writeFile('/tmp/stage-e-collection-review.png',Buffer.from(screenshot.data,'base64'));
 assert.equal(await fsExists(path.join(root,'Imports')),false);assert.match(await evaluate(`document.querySelector('.collection-dialog').textContent`),/Ambiguous/);
 const saveStart=Date.now();await click('Import and Save collection');await wait(`document.querySelector('.collection-dialog [role=status]').textContent.includes('Batch finished')`);const saveMs=Date.now()-saveStart;
 assert.match(await evaluate(`document.querySelector('.collection-dialog').textContent`),/completed: 4/);
 assert.equal(await evaluate('proof.editor.repository.state.revision'),await evaluate('proof.initialRevision'));assert.equal(await evaluate('Object.keys(proof.editor.repository.state.contents).length'),await evaluate('proof.initialContents'));
 assert.equal(await fsExists(path.join(root,'Imports','Home.md')),false);
 const home=await readFile(path.join(root,'Imports','Home.ink'),'utf8'),letter=await readFile(path.join(root,'Imports','nested','Letter.ink'),'utf8');assert.ok(home.includes('codex/block-reference'));assert.ok(letter.includes('codex/block-reference'));
 assert.equal(await fsExists(path.join(root,'Imports','dual (2).ink')),true);
 await click('Close');await evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')==='Flint application menu'||b.getAttribute('aria-label')==='Flint application menu');if(b)b.click();})()`);await click('Export collection…');await setInput('Saved collection directory','Imports');await click('Review export inventory');await wait(`document.querySelectorAll('.collection-file').length===4`);await click('Prepare selected collection');await wait(`document.querySelector('.collection-dialog [role=status]').textContent.includes('Export ready')`);assert.ok(await evaluate(`[...document.querySelectorAll('button')].some(b=>b.textContent==='Download reviewed collection ZIP')`));await click('Close');
 // Runtime uses the same service as the dialog; inspect download bytes without overriding the browser download.
 await evaluate(`(async()=>{const {CollectionInterchange}=await import('/src/runtime/collection-interchange.ts');window.CollectionInterchange=CollectionInterchange;proof.collection=new CollectionInterchange(proof.editor,'.',()=>true);await proof.collection.listExport('Imports');await proof.collection.export();if(!proof.collection.download())throw Error(proof.collection.status());const {unpackZip}=await import('/src/interchange/package/archive.ts');const {collectionArchivePolicy}=await import('/src/interchange/collection/operations.ts');proof.members=[...unpackZip(proof.collection.download(),collectionArchivePolicy)].map(([path,bytes])=>({path,bytes:Array.from(bytes)}));})()`);
 const members=await evaluate('proof.members');const images=members.filter(m=>m.path.startsWith('_assets/'));assert.equal(images.length,1);assert.deepEqual(Buffer.from(images[0].bytes),png);const markdown=Buffer.from(members.find(m=>m.path==='Home.md').bytes).toString();assert.match(markdown,/nested\/Letter.md/);
 await evaluate(`proof.roundtrip=proof.members.filter(m=>m.path!=='mutable-collection.json').map(m=>({path:m.path,blob:new Blob([new Uint8Array(m.bytes)])}));proof.round=new CollectionInterchange(proof.editor,'.',()=>true);void 0;`);
 await evaluate(`proof.round.review(proof.roundtrip,'Roundtrip','native','keep')`);await evaluate('proof.round.save()');assert.equal(await evaluate('proof.round.plan().documents.every(d=>d.status==="completed")'),true);
 // Lost acknowledgement after the actual native server has persisted: retain exact generation in IndexedDB.
 await evaluate(`(async()=>{proof.cancelFiles=[{path:'one.md',blob:new Blob(['One'])},{path:'two.md',blob:new Blob(['Two'])}];proof.recovery=new CollectionInterchange(proof.editor,'.',()=>true);await proof.recovery.review(proof.cancelFiles,'Recovery','native','keep');proof.beforeFetch=window.fetch.bind(window);proof.dropped=false;window.fetch=async(...args)=>{const response=await proof.beforeFetch(...args);if(String(args[0]).endsWith('/api/native/save')&&!proof.dropped){proof.dropped=true;proof.droppedData=await response.clone().json();proof.recovery.cancel();throw Error('Lost acknowledgement probe');}return response;};await proof.recovery.save();window.fetch=proof.beforeFetch;})()`);
 assert.equal(await evaluate('proof.droppedData?.Data?.result?.phase'),'saved');
 assert.equal(await fsExists(path.join(root,'Recovery','one.ink')),true);assert.equal(await fsExists(path.join(root,'Recovery','two.ink')),false);
 const recoveryOriginal=await readFile(path.join(root,'Recovery','one.ink'),'utf8');
 await evaluate('proof.reloadSent=true');await send('Page.reload',{},sessionId);await wait('window.proof&&!window.proof.reloadSent&&document.querySelector(".flint-application .reactive-standoff-flow")');
 await evaluate(`(async()=>{const {CollectionInterchange}=await import('/src/runtime/collection-interchange.ts');proof.resume=new CollectionInterchange(proof.editor,'.',()=>true);proof.files=[{path:'one.md',blob:new Blob(['One'])},{path:'two.md',blob:new Blob(['Two'])}];await proof.resume.review(proof.files,'ignored','source','keep',true);await proof.resume.save();})()`);
 assert.equal(await evaluate('proof.resume.plan().documents.every(d=>d.status==="completed")'),true);assert.equal(await readFile(path.join(root,'Recovery','one.ink'),'utf8'),recoveryOriginal);assert.equal(await fsExists(path.join(root,'Recovery','two.ink')),true);
 let benchmark;
 if(process.env.COLLECTION_BENCHMARK_DOCS){
  const count=Number(process.env.COLLECTION_BENCHMARK_DOCS);assert.ok(count>0&&count<=1000);
  await evaluate(`(async()=>{const {CollectionInterchange}=await import('/src/runtime/collection-interchange.ts');proof.bench=new CollectionInterchange(proof.editor,'.',()=>true);proof.benchFiles=Array.from({length:${count}},(_,i)=>({path:'chapter-'+String(i).padStart(4,'0')+'.md',blob:new Blob(['# Chapter '+i+'\\n\\n'+'Ordinary text. '.repeat(100)])}));proof.benchStats={count:${count},activeWorkers:0,maxWorkers:0,startHeap:performance.memory?.usedJSHeapSize??null,peakHeap:0};proof.Worker=window.Worker;window.Worker=class extends proof.Worker{constructor(...args){super(...args);proof.benchStats.activeWorkers++;proof.benchStats.maxWorkers=Math.max(proof.benchStats.maxWorkers,proof.benchStats.activeWorkers);}terminate(){proof.benchStats.activeWorkers--;super.terminate();}};proof.heapTimer=setInterval(()=>{proof.benchStats.peakHeap=Math.max(proof.benchStats.peakHeap,performance.memory?.usedJSHeapSize??0);},100);const t=performance.now();await proof.bench.review(proof.benchFiles,'Benchmark','native','keep');proof.benchStats.reviewMs=performance.now()-t;const save=performance.now();await proof.bench.save();proof.benchStats.saveMs=performance.now()-save;clearInterval(proof.heapTimer);window.Worker=proof.Worker;proof.benchStats.completed=proof.bench.plan()?.documents.filter(d=>d.status==='completed').length;proof.benchStats.status=proof.bench.status();})()`);
  benchmark=await evaluate('proof.benchStats');assert.equal(benchmark.completed,count);assert.equal(benchmark.maxWorkers,1);assert.equal(benchmark.activeWorkers,0);
 }
 assert.deepEqual(acquisitions,[]);assert.deepEqual(external.filter(u=>u!=='about:blank'),[]);assert.deepEqual(errors,[]);
 console.log(JSON.stringify({passed:['Flint menus and folder upload inventory','semantic loss review before writes','native manual batch saves without mounting or repository changes','numbered filename collisions','cyclic links and shared original PNG','reviewed collection export','ZIP assets once with exact original bytes','round-trip import','IndexedDB restart after lost native-save acknowledgement','no remote acquisitions'],reviewMs,saveMs,documentCount:4,assetCount:images.length,benchmark,errors},null,2));
 await evaluate('proof.dispose();proof.session.dispose()');
}finally{socket?.close();chrome.kill();await assets.close();await Promise.race([vite.close(),new Promise(r=>setTimeout(r,3000))]);await closeFilesystemWorkers();await rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:200});await rm(source,{recursive:true,force:true,maxRetries:5,retryDelay:200});await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
async function fsExists(file){return readFile(file).then(()=>true,async()=>{try{await readdir(file);return true;}catch{return false;}});}
process.exit(0);
