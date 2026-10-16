// Stage B: real Flint source editing, isolated worker previews and native storage.
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';
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
const assets=createManagedAssetService({root,cavernId:'proof',session:'proof'});await assets.recover();
const app=express();app.use(express.json());app.use('/api/assets',assets.router);
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
 socket.addEventListener('message',event=>{const m=JSON.parse(event.data),p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);if(m.method==='Network.requestWillBeSent'&&m.params.request.url.includes('interchange-probe.invalid'))external.push(m.params.request.url);});
 const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const n=++id,timer=setTimeout(()=>reject(Error('CDP timeout '+method)),45000);pending.set(n,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});socket.send(JSON.stringify({id:n,method,params,...(sessionId?{sessionId}:{})}));});
 const {targetId}=await send('Target.createTarget',{url:'about:blank'}),{sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true},sessionId);if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 const wait=condition=>evaluate(`(async()=>{for(let i=0;i<400;i++){if(${condition})return;await new Promise(r=>setTimeout(r,30));}throw Error('Timed out '+${JSON.stringify(condition)}+' '+window.proof?.editor.interchange.message())})()`);
 const click=text=>evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)}).click()`);
 const origin=`http://127.0.0.1:${vite.httpServer.address().port}`;
 await send('Runtime.enable',{},sessionId);await send('Network.enable',{},sessionId);await send('Page.bringToFront',{},sessionId);await send('Emulation.setDeviceMetricsOverride',{width:1500,height:990,deviceScaleFactor:1,mobile:false},sessionId);
 await send('Browser.grantPermissions',{origin,permissions:['clipboardReadWrite','clipboardSanitizedWrite']});await send('Page.navigate',{url:origin+'/__interchange'},sessionId);await wait("window.proof&&document.querySelector('.flint-application .reactive-standoff-flow')");

 const inputFiles=async files=>{await wait(`document.querySelector('[aria-label="External files"]')`);const {root:dom}=await send('DOM.getDocument',{},sessionId);const {nodeId}=await send('DOM.querySelector',{nodeId:dom.nodeId,selector:'[aria-label="External files"]'},sessionId);await send('DOM.setFileInputFiles',{nodeId,files},sessionId);await wait('!proof.editor.interchange.busy()&&!proof.editor.interchange.picker()');};
 await evaluate(`document.querySelector('[aria-label="Flint application menu"]').click()`);await click('Import external files…');await inputFiles([path.join(root,'source.md')]);
 await evaluate(`proof.select(0);proof.editor.interchange.pickEmbed(proof.text().key)`);await inputFiles([path.join(root,'source.md')]);assert.match(await evaluate('proof.editor.interchange.message()'),/Embedded an independent/);
 await wait(`document.querySelector('.mutable-source-block textarea')`);
 await evaluate(`proof.source=()=>Object.values(proof.active().state.nodes).find(n=>n.viewType==='mutable/markdown-source-block');proof.area=()=>document.querySelector('.mutable-source-block textarea');proof.sourceId=proof.source().payload.id;proof.beforeSource=proof.source().payload.text;proof.initialRevision=proof.editor.repository.state.revision;proof.sourceRoot=()=>proof.editor.mounts.get(proof.source().key).root;proof.sourceButton=label=>[...proof.sourceRoot().querySelectorAll('button')].find(b=>b.textContent===label);proof.area().focus();proof.area().setSelectionRange(2,8);proof.sourceButton('Preview').click();`);
 await wait(`document.querySelector('.mutable-source-block iframe')`);
 assert.equal(await evaluate('proof.source().payload.text'),authored);assert.equal(await evaluate('proof.editor.repository.state.revision'),await evaluate('proof.initialRevision'));
 assert.deepEqual(await evaluate(`(()=>{const f=proof.sourceRoot().querySelector('iframe');return {sandbox:f.getAttribute('sandbox'),referrer:f.referrerPolicy,opaque:f.contentDocument===null,markup:f.srcdoc.includes('<strong>bold</strong>')}})()`),{sandbox:'',referrer:'no-referrer',opaque:true,markup:true});
 await evaluate(`proof.sourceButton('Source').click()`);await wait('document.activeElement===proof.area()');assert.equal(await evaluate('proof.area().selectionStart'),2);assert.equal(await evaluate('proof.area().selectionEnd'),8);assert.equal(await evaluate('!!proof.sourceRoot().querySelector("iframe")'),false);
 // Real browser insertion and undo use the native-text/history path, with no snapshots or worker starts.
 await evaluate(`proof.snapshots=0;proof.workerStarts=0;proof.originalSnapshot=proof.editor.repository.snapshot;proof.editor.repository.snapshot=function(...args){proof.snapshots++;return proof.originalSnapshot.apply(this,args)};proof.Worker=window.Worker;window.Worker=class extends proof.Worker{constructor(...args){super(...args);proof.workerStarts++}};proof.area().setSelectionRange(2,2);`);
 await send('Input.insertText',{text:'!'},sessionId);assert.equal(await evaluate('proof.source().payload.text'),authored.slice(0,2)+'!'+authored.slice(2));assert.deepEqual(await evaluate('({snapshots:proof.snapshots,workerStarts:proof.workerStarts})'),{snapshots:0,workerStarts:0});
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'z',code:'KeyZ',windowsVirtualKeyCode:90,modifiers:4},sessionId);await send('Input.dispatchKeyEvent',{type:'keyUp',key:'z',code:'KeyZ',windowsVirtualKeyCode:90,modifiers:4},sessionId);assert.equal(await evaluate('proof.source().payload.text'),authored);
 await evaluate(`proof.editor.repository.snapshot=proof.originalSnapshot;window.Worker=proof.Worker;`);
 // Actual Chrome IME composition emits no intermediate authoring commit.
 await evaluate(`proof.area().focus();proof.area().setSelectionRange(2,2);proof.imeRevision=proof.editor.repository.state.revision;`);
 await send('Input.imeSetComposition',{text:'語',selectionStart:1,selectionEnd:1},sessionId);assert.equal(await evaluate('proof.editor.repository.state.revision'),await evaluate('proof.imeRevision'));
 await send('Input.insertText',{text:'語'},sessionId);assert.equal(await evaluate('proof.source().payload.text'),authored.slice(0,2)+'語'+authored.slice(2));await evaluate('proof.editor.repository.undo()');assert.equal(await evaluate('proof.source().payload.text'),authored);
 // Manual native save/reopen retains the exact decoded source and original file remains untouched.
 await evaluate(`(async()=>{proof.docId=proof.active().state.nodes[proof.active().state.rootKey].payload.id;proof.saved=await proof.native.save(proof.docId,{folder:'.',filename:'source-copy.ink'});})()`);assert.equal(await evaluate('proof.saved.phase'),'saved');
 const reopened=await evaluate(`(async()=>{const {ReactiveEditor}=await import('/src/reactive-editor/editor.ts');const {nativeDocumentSession}=await import('/src/persistence/native-session.ts');const fresh=new ReactiveEditor({id:'fresh',type:'workspace-block',children:[{id:'bank',type:'workspace-object-bank-block',children:[]}]});try{await nativeDocumentSession(fresh).open({folder:'.',filename:'source-copy.ink'});return Object.values(fresh.repository.readState().contents).find(c=>c.viewType==='mutable/markdown-source-block').payload;}finally{fresh.dispose();}})()`);assert.equal(reopened.text,authored);assert.equal(await readFile(path.join(root,'source.md'),'utf8'),authored);
 // Whole Block conversion: confirmation then exactly one history entry; undo restores source identity and metadata.
 await evaluate(`proof.convertBefore=JSON.stringify(proof.source().payload);proof.convertRevision=proof.editor.repository.state.revision;proof.sourceButton('Convert to Mutable Ink…').click()`);await wait('!!proof.editor.interchange.question()');await click('Continue');await wait('!proof.editor.interchange.busy()');assert.match(await evaluate('proof.editor.interchange.message()'),/Converted the whole/);assert.equal(await evaluate('proof.editor.repository.state.revision'),await evaluate('proof.convertRevision+1'));assert.equal(await evaluate('!!proof.source()'),false);await evaluate('proof.editor.repository.undo()');assert.equal(await evaluate('JSON.stringify(proof.source().payload)'),await evaluate('proof.convertBefore'));
 // HTML preview never touches the application DOM or follows authored URLs.
 await evaluate(`proof.editor.interchange.pickEmbed(proof.source().key)`);await inputFiles([path.join(root,'source.html')]);await evaluate(`proof.html=()=>Object.values(proof.active().state.nodes).find(n=>n.viewType==='mutable/html-source-block');proof.htmlRoot=()=>proof.editor.mounts.get(proof.html().key).root;proof.htmlBefore=proof.html().payload.text;proof.previewRevision=proof.editor.repository.state.revision;[...proof.htmlRoot().querySelectorAll('button')].find(b=>b.textContent==='Preview').click()`);await wait('!!proof.htmlRoot().querySelector("iframe")');
 const safety=await evaluate(`(()=>{const f=proof.htmlRoot().querySelector('iframe');return {sandbox:f.getAttribute('sandbox'),opaque:f.contentDocument===null,body:f.srcdoc.slice(f.srcdoc.indexOf('<body>')),height:f.getBoundingClientRect().height,source:proof.html().payload.text,revision:proof.editor.repository.state.revision,compromised:!!window.compromised}})()`);assert.equal(safety.opaque,true);assert.equal(safety.sandbox,'');assert.equal(safety.compromised,false);assert.equal(safety.height,360);assert.equal(safety.source,await evaluate('proof.htmlBefore'));assert.equal(safety.revision,await evaluate('proof.previewRevision'));assert.match(safety.body,/color:purple;font-size:20px/);assert.doesNotMatch(safety.body,/<script|<style|<iframe|onclick|href=|src=|position:/);assert.match(safety.body,/\[Image: image\]/);
 // CDP inspects the opaque child solely for qualification; application code cannot.
 let childSession=sessionId,contextId;
 for(let i=0;i<100;i++){
  const {targetInfos}=await send('Target.getTargets');const target=targetInfos.find(t=>t.type==='iframe'&&t.url==='about:srcdoc');
  if(target){childSession=(await send('Target.attachToTarget',{targetId:target.targetId,flatten:true})).sessionId;await send('Runtime.enable',{},childSession);break;}
  const {frameTree}=await send('Page.getFrameTree',{},sessionId);const frame=frameTree.childFrames?.find(f=>f.frame.url==='about:srcdoc');
  if(frame){contextId=(await send('Page.createIsolatedWorld',{frameId:frame.frame.id,worldName:'source-preview-qualification'},sessionId)).executionContextId;break;}
  await new Promise(r=>setTimeout(r,30));
 }
 assert.ok(childSession!==sessionId||contextId,'HTML preview must mount a real child document');
 const child=await send('Runtime.evaluate',{...(contextId?{contextId}:{}),expression:"JSON.stringify({text:document.body.textContent,color:getComputedStyle(document.querySelector('p')).color,active:!!document.querySelector('script,iframe,img,form,a[href]'),csp:document.querySelector('meta[http-equiv]').content})",returnByValue:true},childSession);
 const visible=JSON.parse(child.result.value);assert.match(visible.text,/Safe preview/);assert.equal(visible.color,'rgb(128, 0, 128)');assert.equal(visible.active,false);assert.match(visible.csp,/script-src 'none'/);
 assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
 await evaluate(`proof.editor.commands.remove(proof.html().key)`);assert.equal(await evaluate('document.querySelectorAll(".mutable-source-block iframe").length'),0);
 console.log(JSON.stringify({passed:['real Flint source file embedding','opaque sandbox and Markdown worker preview','preview is history free','source/preview selection restoration','real native typing with zero snapshots and workers','real Chrome IME single commit','manual Ink save/reopen preserves mixed endings','external file unchanged','one-transaction whole Block conversion and exact undo','HTML active content/CSS/resource isolation','iframe disposal'],browser:'headless Chrome',external,errors},null,2));
 await evaluate('proof.dispose();proof.session.dispose()');
}finally{socket?.close();chrome.kill();await vite.close();await closeFilesystemWorkers();await rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:200});await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
process.exit(0);
