// Milestone F: real Flint file import, managed originals, offline viewers and packages.
import Database from 'better-sqlite3';
import {migrate} from '../src/knowledge-sqlite/schema.mjs';
import {extractPackageData} from '../src/knowledge-sqlite/package-data.mjs';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,rm,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import express from 'express';
import sharp from 'sharp';
import {createManagedAssetService} from '../server/managed-assets-router.mjs';
import {closeFilesystemWorkers} from './stage-c-gates/filesystem.mjs';
const root=await mkdtemp(path.join(tmpdir(),'interchange-proof-')),profile=await mkdtemp(path.join(tmpdir(),'interchange-chrome-'));
const authored='# Source\r\n\r\n**bold**\nlast\rend';
await writeFile(path.join(root,'source.md'),authored);
await writeFile(path.join(root,'source.html'),'<p style="color:purple;font-size:20px;position:fixed" onclick="parent.compromised=true">Safe <strong>preview</strong><img src="https://interchange-probe.invalid/image.png" alt="image"></p><script>parent.compromised=true</script><style>@import "https://interchange-probe.invalid/style.css";</style><iframe src="https://interchange-probe.invalid/frame"></iframe><a href="https://example.org">link</a>');
const image=await sharp({create:{width:3,height:2,channels:3,background:'#678'}}).png().toBuffer();await writeFile(path.join(root,'photo.png'),image);
const assets=createManagedAssetService({root,cavernId:'proof',session:'proof',structuredEnabled:true});await assets.recover();
const app=express();app.use(express.json({limit:'32mb'}));app.use('/api/assets',assets.router);
const vite=await createServer({cacheDir:path.join(root,'vite-cache'),plugins:[{name:'interchange-proof',resolveId(id){if(id==='/__interchange.js')return '\0interchange';},load(id){if(id==='\0interchange')return `
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
const fixtures={
 'data.json':'{"title":"<script>parent.compromised=true</script>","nested":{"a":[1,true,null]}}',
 'data.yaml':'# retained comment\nname: Example\nvalues: [one, two]',
 'data.csv':'id,note\r\n001,"quoted, value\nsecond line"\r\n002,=1+1',
 'data.tsv':'key\tvalue\n001\ttrue',
 'demo.ts':'const answer: number = 42;\r\n',
 'demo.cs':'public class Example { public string Name = "Example"; }',
 'flow.mmd':'flowchart TD\nA[Source] --> B[View]',
 'sequence.mermaid':'sequenceDiagram\nAlice->>Bob: Hello',
 'bad.yaml':'a: &x [*x]',
 'bad.json':'{invalid',
 'unsafe.mmd':'%%{init:{securityLevel:"loose"}}%%\ngraph TD\nA["<img src=https://interchange-probe.invalid/leak>"]',
 'invalid.mmd':'this is not a Mermaid diagram',
 'long.ts':'x'.repeat(20000),
};
for(const [name,source]of Object.entries(fixtures))await writeFile(path.join(root,name),source);
const canonicalDb=new Database(':memory:');migrate(canonicalDb,'mutable',{fresh:true});let canonicalCalls=0;
app.use('/api/sqlite',(_req,res)=>{canonicalCalls++;res.status(500).json({Success:false,Error:'No knowledge calls allowed'});});
const {decodeNative}=await vite.ssrLoadModule('/src/persistence/native-resource.ts'),{createPackage}=await vite.ssrLoadModule('/src/interchange/package/format.ts');
const chrome=spawn(process.env.CHROME_BIN??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank']);let socket;
try{
 const endpoint=await new Promise((resolve,reject)=>{let out='';chrome.stderr.on('data',b=>{out+=b;const m=out.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(m)resolve(m[1]);});chrome.once('error',reject);setTimeout(()=>reject(Error('Chrome timeout')),15000).unref();});socket=new WebSocket(endpoint);await new Promise(r=>socket.addEventListener('open',r,{once:true}));
 let id=0;const pending=new Map(),errors=[],external=[];
 socket.addEventListener('message',event=>{const m=JSON.parse(event.data),p=pending.get(m.id);if(m.method==='Target.attachedToTarget'){void send('Runtime.enable',{},m.params.sessionId).catch(()=>{});void send('Log.enable',{},m.params.sessionId).catch(()=>{});}if(p){pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}if(m.method==='Runtime.exceptionThrown'){errors.push(m.params.exceptionDetails);console.error('Browser exception',JSON.stringify(m.params));}if(m.method==='Log.entryAdded'&&m.params.entry.source==='security')console.error('Browser security log',JSON.stringify(m.params));if(m.method==='Network.requestWillBeSent'&&m.params.request.url.includes('interchange-probe.invalid'))external.push(m.params.request.url);});
 const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const n=++id,timer=setTimeout(()=>reject(Error('CDP timeout '+method)),45000);pending.set(n,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});socket.send(JSON.stringify({id:n,method,params,...(sessionId?{sessionId}:{})}));});
 const {targetId}=await send('Target.createTarget',{url:'about:blank'}),{sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true},sessionId);if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 const wait=condition=>evaluate(`(async()=>{for(let i=0;i<400;i++){if(${condition})return;await new Promise(r=>setTimeout(r,30));}throw Error('Timed out '+${JSON.stringify(condition)}+' '+window.proof?.editor.interchange.message()+' '+[...document.querySelectorAll('.structured-resource')].map(n=>n.querySelector('strong')?.textContent+': '+n.querySelector('[role=status]')?.textContent).join(' | '))})()`);
 const click=text=>evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)}).click()`);
 const origin=`http://127.0.0.1:${vite.httpServer.address().port}`;
 await send('Target.setAutoAttach',{autoAttach:true,waitForDebuggerOnStart:false,flatten:true},sessionId);await send('Log.enable',{},sessionId);await send('Runtime.enable',{},sessionId);await send('Network.enable',{},sessionId);await send('Page.bringToFront',{},sessionId);await send('Emulation.setDeviceMetricsOverride',{width:1500,height:990,deviceScaleFactor:1,mobile:false},sessionId);
 await send('Browser.grantPermissions',{origin,permissions:['clipboardReadWrite','clipboardSanitizedWrite']});await send('Page.navigate',{url:origin+'/__interchange'},sessionId);await wait("window.proof&&document.querySelector('.flint-application .reactive-standoff-flow')");

 const choose=async(files,selector='[aria-label="External files"]')=>{await wait(`document.querySelector(${JSON.stringify(selector)})`);const {root:dom}=await send('DOM.getDocument',{},sessionId);const {nodeId}=await send('DOM.querySelector',{nodeId:dom.nodeId,selector},sessionId);await send('DOM.setFileInputFiles',{nodeId,files},sessionId);};
 const block=name=>`[...document.querySelectorAll('.structured-resource')].find(n=>n.querySelector('strong')?.textContent===${JSON.stringify(name)})`;
 await evaluate(`proof.select(0);proof.editor.interchange.pickInsert(proof.text().key)`);await choose(Object.keys(fixtures).map(name=>path.join(root,name)));await wait('!proof.editor.interchange.busy()');assert.match(await evaluate('proof.editor.interchange.message()'),/Inserted files/);
 await wait(`document.querySelectorAll('.structured-resource').length===${Object.keys(fixtures).length}`);
 await wait(`${block('flow.mmd')}.querySelector('iframe')?.dataset.rendered==='true'`);await wait(`${block('sequence.mermaid')}.querySelector('iframe')?.dataset.rendered==='true'`);
 await wait(`${block('demo.ts')}.querySelector('.cm-content')`);await wait(`${block('demo.cs')}.querySelector('.cm-content')`);
 assert.match(await evaluate(`${block('demo.ts')}.textContent`),/answer/);assert.ok(await evaluate(`${block('demo.ts')}.querySelectorAll('.cm-content .cm-line span').length`)>0);
 assert.match(await evaluate(`${block('bad.yaml')}.textContent`),/alias/i);assert.match(await evaluate(`${block('bad.json')}.textContent`),/JSON|property|position/i);
 assert.match(await evaluate(`${block('unsafe.mmd')}.textContent`),/disabled/);await wait(`${block('invalid.mmd')}.querySelector('iframe')?.dataset.rendered==='false'`);
 assert.match(await evaluate(`${block('long.ts')}.textContent`),/long lines/);
 assert.deepEqual(await evaluate(`[...${block('data.csv')}.querySelectorAll('tbody tr:first-child td')].map(c=>c.textContent)`),['001','quoted, value\nsecond line']);
 const originalRevision=await evaluate('proof.editor.repository.state.revision');
 await evaluate(`${block('data.json')}.querySelector('summary').click()`);await wait(`${block('data.json')}.textContent.includes('<script>')`);assert.equal(await evaluate('!!window.compromised'),false);
 await evaluate(`[...${block('data.json')}.querySelectorAll('button')].find(b=>b.textContent==='Source').click()`);await wait(`${block('data.json')}.querySelector('.cm-content')`);
 await evaluate(`[...${block('demo.ts')}.querySelectorAll('button')].find(b=>b.textContent==='Copy source').click()`);assert.equal(await evaluate('navigator.clipboard.readText()'),fixtures['demo.ts']);
 assert.equal(await evaluate('proof.editor.repository.state.revision'),originalRevision);
 const collected=await evaluate(`Object.values(proof.editor.repository.readState().contents).filter(c=>c.viewType==='mutable/structured-resource-block').map(c=>({id:c.payload.id,asset:c.payload.asset,name:c.payload.structured.filename,text:c.payload.text}))`);
 for(const c of collected){const original=await assets.store.get(c.asset.assetId,'proof');assert.equal(original.bytes.toString(),fixtures[c.name]);assert.equal(c.text,fixtures[c.name]);}
 await evaluate('proof.editor.repository.undo()');await wait('!document.querySelector(".structured-resource")');await evaluate('proof.editor.repository.redo()');await wait(`document.querySelectorAll('.structured-resource').length===${collected.length}`);
 const docId=await evaluate(`Object.values(proof.active().state.nodes).find(n=>n.viewType==='document-block').payload.id`);
 assert.equal((await evaluate(`proof.native.save(${JSON.stringify(docId)},{folder:'.',filename:'structured.ink'})`)).phase,'saved');
 const reopened=await evaluate(`(async()=>{const {ReactiveEditor}=await import('/src/reactive-editor/editor.ts');const {nativeDocumentSession}=await import('/src/persistence/native-session.ts');const e=new ReactiveEditor({type:'workspace-block',children:[{type:'workspace-object-bank-block',children:[]}]});try{await nativeDocumentSession(e).open({folder:'.',filename:'structured.ink'});return Object.values(e.repository.readState().contents).filter(c=>c.viewType==='mutable/structured-resource-block').map(c=>c.payload.text);}finally{e.dispose();}})()`);assert.deepEqual(reopened.slice().sort(),Object.values(fixtures).sort());
 const savedBytes=new Uint8Array(await readFile(path.join(root,'structured.ink'))),native=decodeNative(savedBytes),data={kind:'mutable-package-data',version:1,readOnly:true,encoding:'sqlite-storage-class-v1',tables:[],provenance:{},selection:{},unresolved:[],excluded:[]},schema={kind:'mutable-knowledge-schema',version:1,tables:[]};
 const packageAssets=[];for(const c of collected){const a=await assets.store.get(c.asset.assetId,'proof');packageAssets.push({reference:c.asset,mediaType:a.manifest.mediaType,bytes:new Uint8Array(a.bytes)});}
 const archive=await createPackage(savedBytes,{resourceId:native.resourceId,cavernId:'proof'},data,schema,packageAssets),packageFile=path.join(root,'structured.inkpkg');await writeFile(packageFile,archive);
 await evaluate(`document.querySelector('[aria-label="Flint application menu"]').click()`);await click('Import Ink package…');await choose([packageFile]);await wait('!!proof.editor.interchange.question()');await click('Continue');await wait('!proof.editor.interchange.busy()');assert.match(await evaluate('proof.editor.interchange.message()'),/Imported an unsaved/);
 await wait(`${block('flow.mmd')}.querySelector('iframe')?.dataset.rendered==='true'`);const imported=await evaluate(`Object.values(proof.active().state.nodes).filter(n=>n.viewType==='mutable/structured-resource-block').map(n=>n.payload.id)`);assert.equal(imported.length,collected.length);assert.ok(imported.every(id=>!collected.some(c=>c.id===id)));
 assert.equal(canonicalCalls,0);assert.equal(canonicalDb.prepare('SELECT COUNT(*) n FROM Entity').get().n,0);assert.equal(canonicalDb.prepare('SELECT COUNT(*) n FROM Claim').get().n,0);
 // Local support code and exact source are already loaded; diagram re-render works with network disabled.
 await send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0},sessionId);
 await evaluate(`[...${block('flow.mmd')}.querySelectorAll('button')].find(b=>b.textContent==='Source').click()`);await wait(`${block('flow.mmd')}.querySelector('.cm-content')`);
 await evaluate(`[...${block('flow.mmd')}.querySelectorAll('button')].find(b=>b.textContent==='Structured').click()`);await wait(`${block('flow.mmd')}.querySelector('iframe')?.dataset.rendered==='true'`);
 assert.deepEqual(external,[]);assert.deepEqual(errors,[]);await evaluate('proof.dispose();proof.session.dispose()');
 console.log(JSON.stringify({browser:await send('Browser.getVersion'),files:collected.length,faithfulOriginals:true,tree:true,table:true,highlighting:true,flowchart:true,sequence:true,unsafeAndInvalidDiagrams:true,noPresentationHistory:true,copyExactCRLF:true,oneStepUndoRedo:true,manualSave:true,nativeReopen:true,packageImport:true,offlineDiagram:true,canonicalCalls,external,errors,packageBytes:archive.length},null,2));
}finally{socket?.close();chrome.kill();await vite.close();await assets.close();await closeFilesystemWorkers();canonicalDb.close();await rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:200});await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
process.exit(0);
