// Bounded real-Flint redesign qualification. A temporary Vault contains a copy
// of one native fixture. No user Vault writes or load generation.
// Before: FLINT_BASELINE=1 FLINT_BASE_REF=5812773 node scripts/check-flint-minimal-browser.mjs
import {spawn,execFileSync} from 'node:child_process';
import express from 'express';
import {mkdtemp, rm, mkdir, writeFile, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
const fixturePath=process.env.BENCHMARK_DOCUMENT_PATH??'vaults/imported/documents/edgar-allan-poe/masque-of-the-red-death-[1c48f303].ink';
const fixture=await readFile(fixturePath);
const baseline=process.env.FLINT_BASELINE==='1',baselineRef=process.env.FLINT_BASE_REF??'HEAD';
const artifacts=process.env.BENCHMARK_OUTPUT??('/tmp/flint-minimal-'+(baseline?'before':'after')); await mkdir(artifacts,{recursive:true});
const profile=await mkdtemp(path.join(tmpdir(),'flint-integration-'));
const store=await mkdtemp(path.join(tmpdir(),'flint-minimal-vault-'));
await mkdir(path.join(store,'vault/Research'),{recursive:true});await writeFile(path.join(store,'vault/Masque.ink'),fixture);
const native=express();
const beforeFiles=new Set(['src/features/flint/shell.tsx','src/features/flint/vault-view.tsx','src/features/flint/compact-layout.tsx','src/features/flint/compact-shell.css','src/rendering/compact-toolbar.tsx','src/rendering/document-style-bar.tsx','src/rendering/document-style-bar.css','src/rendering/annotation-bar-policy.ts']);
const vite=await createServer({plugins:[{
 name:'flint-integration-proof',
 resolveId(id){if(id==='/__flint-proof.js')return '\0flint-proof';},
 load(id){const relative=path.relative(process.cwd(),id.split('?')[0]);if(baseline&&beforeFiles.has(relative))return execFileSync('git',['show',baselineRef+':'+relative],{encoding:'utf8'});if(id==='\0flint-proof')return `
 import {render} from 'solid-js/web';
 import {createComponent} from 'solid-js';
 import {WorkspaceSession} from '/src/application/workspace-session.ts';
 import {WorkspacePresentationView} from '/src/application/workspace-presentation-view.tsx';
 import {materializeLocalWorkspace} from '/src/reactive-editor/workspace-manifest.ts';
 import '/src/assets/reset.css';
 import '/src/index.css';
 import '/src/demo/workspace-demo.css';
 localStorage.setItem('mutable.flint.compact-layout.v1',JSON.stringify({density:'reading'}));
 const session=new WorkspaceSession(materializeLocalWorkspace({type:'workspace-block',children:[]}),{features:{directDomCharacterCells:${process.env.BENCHMARK_DIRECT_CELLS!=='false'},nativeDocumentPersistence:true,nativeKnowledge:false,sqliteKnowledge:false,flintProbe:false,flintSceneChrome:true}});
 const editor=session.editor;
 const bank=editor.commands.insert({type:'workspace-object-bank-block',children:[]},{kind:'at',parentKey:session.projection.state.rootKey,index:0});
 const {admitNative}=await import('/src/persistence/native-resource.ts');
 admitNative(editor.repository,new Uint8Array(await (await fetch('/__letter')).arrayBuffer()),editor.repository.readState().placements[bank].contentKey);
 editor.commandRegistry.execute('flint.open',{targetKey:session.projection.state.rootKey,args:undefined});
 const win=Object.values(session.projection.state.nodes).find(n=>n.viewType==='window-block');
 editor.commands.setPayloadField(win.key,'metadata',{...JSON.parse(JSON.stringify(win.payload.metadata)),size:{w:1450,h:920},position:{x:25,y:25}});
 const host=document.getElementById('root');host.className='workspace-demo workspace-demo--canonical workspace-demo--system-bar compact-document-workspace';host.setAttribute('data-window-work-area','');
 const dispose=render(()=>createComponent(WorkspacePresentationView,{session}),host);editor.installGateway(document);
 window.proof={editor,session,dispose,host};
 `;},
 configureServer(server){server.middlewares.use(native);server.middlewares.use(async(req,res,next)=>{if(req.url==='/__letter'){res.setHeader('Content-Type','application/json');res.end(fixture);return;}if(req.url!=='/__flint-integration')return next();res.setHeader('Content-Type','text/html');res.end(await server.transformIndexHtml(req.url,'<html><body><div id="root"></div><script type="module" src="/__flint-proof.js"></script></body></html>'));});}
}],server:{host:'127.0.0.1',port:0,hmr:false}});const {createNativeDocumentStoreRouter}=await vite.ssrLoadModule('/server/native-document-store.mjs');native.use('/api/native',createNativeDocumentStoreRouter({root:store,defaultVault:'vault',nativeDiscoveryWorker:false}));await vite.listen();
const chrome=spawn(process.env.CHROME_BIN??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--window-size=1500,990','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows',...(process.env.BENCHMARK_NATIVE_GPU==='1'?[]:['--use-angle=swiftshader','--enable-unsafe-swiftshader']),'--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank']);
let socket;
try{
 const endpoint=await new Promise((resolve,reject)=>{let out='';chrome.stderr.on('data',b=>{out+=b;const m=out.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(m)resolve(m[1]);});chrome.once('error',reject);setTimeout(()=>reject(Error('Chrome timeout')),15000).unref();});
 socket=new WebSocket(endpoint);await new Promise(r=>socket.addEventListener('open',r,{once:true}));
 let id=0;const pending=new Map(),errors=[];
 socket.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);});
 const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const n=++id;const timer=setTimeout(()=>{pending.delete(n);reject(Error('CDP timeout '+method));},60000);pending.set(n,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});socket.send(JSON.stringify({id:n,method,params,...(sessionId?{sessionId}:{})}));});
 const {targetId}=await send('Target.createTarget',{url:'about:blank'}),{sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
 const evaluate=async expression=>{if(process.env.AUTOCOMPLETE_TRACE)console.log('EVAL '+expression.slice(0,180));const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value;};
 const wait=condition=>evaluate(`(async()=>{for(let i=0;i<900;i++){if(${condition})return;await new Promise(r=>setTimeout(r,50));}throw Error('Timed out: '+${JSON.stringify(condition)})})()`);
 await send('Page.bringToFront',{},sessionId);await send('Runtime.enable',{},sessionId);await send('Emulation.setDeviceMetricsOverride',{width:1500,height:990,deviceScaleFactor:1,mobile:false},sessionId);
 await send('Page.navigate',{url:`http://127.0.0.1:${vite.httpServer.address().port}/__flint-integration`},sessionId);
 await wait("window.proof && document.querySelector('.flint-compact .reactive-standoff-flow')");
 await evaluate(`proof.root=proof.host.querySelector('.flint-application');proof.view=[...proof.editor.projections.values()].find(v=>v!==proof.session.projection);proof.text=Object.values(proof.view.state.nodes).filter(n=>n.viewType==='standoff-editor-block'&&proof.editor.mounts.get(n.key)).sort((a,b)=>b.inlineContent.length-a.inlineContent.length)[0];proof.mount=proof.editor.mounts.get(proof.text.key);proof.flow=proof.mount.root.querySelector('.reactive-standoff-flow')??proof.mount.root;proof.editor.focus.request(proof.text.key);proof.mount.restoreInlineSelection({anchor:100,head:100});`);
 const checks=[];
 const check=(name,value)=>{assert.ok(value,name);checks.push(name);console.log('PASS '+name);};

 const click=async expression=>{const p=await evaluate(`(()=>{const el=${expression};if(!el)throw Error('Control missing');if(el.disabled)throw Error('Control disabled: '+el.textContent);el.scrollIntoView({block:'nearest'});const r=el.getBoundingClientRect();const x=r.left+r.width/2,y=r.top+r.height/2,hit=document.elementFromPoint(x,y);if(!el.contains(hit))throw Error('Control covered: '+el.textContent+' by '+hit?.outerHTML.slice(0,280));return{x,y}})()`);await send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1},sessionId);await send('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',clickCount:1},sessionId);await evaluate('new Promise(r=>requestAnimationFrame(r))');};

 await wait("proof.root.querySelector('[aria-label=\"Open vault/Masque.ink\"]')");
 await evaluate(`proof.bar=proof.root.querySelector('[data-annotation-bar-state]');proof.tabs=proof.root.querySelector('.flint-application__editor > .reactive-tabs > .reactive-tabs__labels');proof.scroll=proof.bar.parentElement.querySelector('.reactive-document-occurrence__content')`);
 const geometry=()=>evaluate(`({shell:proof.root.getBoundingClientRect().toJSON(),header:proof.root.querySelector('.flint-application__header').getBoundingClientRect().toJSON(),tabs:proof.tabs.getBoundingClientRect().toJSON(),bar:proof.bar.getBoundingClientRect().toJSON(),content:proof.scroll.getBoundingClientRect().toJSON(),context:proof.root.dataset.context})`);
 const measurements=await geometry();
 await send('Page.captureScreenshot',{format:'png'},sessionId).then(r=>writeFile(path.join(artifacts,'wide.png'),Buffer.from(r.data,'base64')));
 if(!baseline){
   check('wide header shares the document tab row',Math.abs(measurements.header.top-measurements.tabs.top)<1);
   check('inspector is collapsed with no saved visibility preference',measurements.context==='false');
   check('Cavern tree is open by default with no administrative forms',await evaluate(`proof.root.querySelector('.flint-tree-folder').open&&[...proof.root.querySelectorAll('[data-vault-panel]')].every(e=>e.hidden)`));
   await click(`proof.root.querySelector('[aria-label="New Document"]')`);
   check('header plus opens existing Document formats and creation form',await evaluate(`proof.root.querySelector('[data-vault-panel="new"]').open&&!proof.root.querySelector('[data-vault-panel="new"]').hidden&&proof.root.querySelector('[aria-label="New Document format"]').options.length>3`));
   await click(`proof.root.querySelector('.flint-close-file-form')`);
   await click(`proof.root.querySelector('[aria-label="New folder"]')`);
   check('new folder form uses selected tree location',await evaluate(`!proof.root.querySelector('[data-vault-panel="directory"]').hidden`));
   await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27},sessionId);
   check('Escape closes file controls and restores focus',await evaluate(`proof.root.querySelector('[data-vault-panel="directory"]').hidden&&document.activeElement.hasAttribute('data-new-document')`));
   await click(`proof.root.querySelector('[aria-label="Search collection"]')`);
   check('Search is an alternate Explorer view',await evaluate(`document.activeElement.getAttribute('aria-label')==='Search vault'`));
   await click(`[...proof.root.querySelectorAll('[aria-label="Library views"] button')].find(b=>b.textContent==='Recent')`);
   check('Recent remains available separately',await evaluate(`!proof.root.querySelector('.flint-recent-documents')?.closest('[hidden]')`));
   await click(`[...proof.root.querySelectorAll('[aria-label="Library views"] button')].find(b=>b.textContent==='Files')`);
   for(const label of ['Toggle Library','Toggle Context','Toggle Context','Toggle Library'])await click(`proof.root.querySelector('[aria-label="${label}"]')`);
   check('pane toggles preserve mounted editing DOM',await evaluate(`proof.editor.mounts.get(proof.text.key)===proof.mount&&proof.flow.isConnected`));
   await evaluate(`proof.scroll.scrollTop=0;proof.mount.focus();proof.mount.restoreInlineSelection({anchor:100,head:107});document.dispatchEvent(new Event('selectionchange'))`);
   await click(`proof.bar.querySelector('[aria-label="Bold selection"]')`);
   check('formatting applies to the retained source selection',await evaluate(`proof.editor.node(proof.text.key).payload.standoffProperties.some(p=>p.type==='style/bold'&&p.start===100&&p.end===106)`));
   await click(`proof.bar.querySelector('[aria-label="Undo"]')`);
   check('Undo button uses document history',await evaluate(`!proof.editor.node(proof.text.key).payload.standoffProperties.some(p=>p.type==='style/bold'&&p.start===100&&p.end===106)`));
   await click(`proof.bar.querySelector('[aria-label="Redo"]')`);
   check('Redo restores the annotation',await evaluate(`proof.editor.node(proof.text.key).payload.standoffProperties.some(p=>p.type==='style/bold'&&p.start===100&&p.end===106)`));
   await click(`proof.bar.querySelector('.compact-toolbar__more')`);
   check('advanced typography remains in More',await evaluate(`!!document.querySelector('.compact-toolbar__panel [aria-label="Underline"]')&&!!document.querySelector('.compact-toolbar__panel [aria-label="Apply H4"]')`));
   await click(`document.querySelector('[aria-label="Close tools"]')`);
   await evaluate(`proof.mount.focus();proof.mount.restoreInlineSelection({anchor:100,head:100});proof.scryRevision=proof.editor.repository.state.revision;proof.scryText=proof.mount.captureText();proof.snapshotCalls=0;proof.snapshotBeforeScry=proof.editor.repository.snapshot.bind(proof.editor.repository);proof.editor.repository.snapshot=(...args)=>{proof.snapshotCalls++;return proof.snapshotBeforeScry(...args)}`);
   await send('Input.insertText',{text:'(('},sessionId);
   await wait(`!proof.editor.repository.canUndo()`);
   // Use keyboard activation while the existing floating LER covers this part of the bar.
   for(const label of ['Undo','Redo']) {
     await evaluate(`proof.bar.querySelector('[aria-label="${label}"]').focus()`);
     await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r',unmodifiedText:'\r'},sessionId);
     await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13},sessionId);
   }
   check('real Scry suspends toolbar history without commits or snapshots',await evaluate(`proof.editor.repository.state.revision===proof.scryRevision&&proof.snapshotCalls===0&&!proof.editor.repository.canUndo()`));
   await evaluate(`proof.editor.completionInput.cancel();proof.editor.repository.snapshot=proof.snapshotBeforeScry`);
   check('cancelling boundary-only Scry preserves canonical text and history',await evaluate(`proof.mount.captureText()===proof.scryText&&proof.editor.repository.canUndo()`));
   // Presentation changes must not touch history, canonical data, or snapshots.
   await evaluate(`proof.snapshots=0;proof.originalSnapshot=proof.editor.repository.snapshot.bind(proof.editor.repository);proof.editor.repository.snapshot=(...args)=>{proof.snapshots++;return proof.originalSnapshot(...args)};proof.revision=proof.editor.repository.state.revision;proof.frame=proof.root.closest('.reactive-window');proof.originalWidth=proof.frame.style.width;proof.frame.style.width='850px'`);
   await evaluate('new Promise(r=>setTimeout(r,250))');
   const medium=await geometry();check('constrained layout separates header and tabs',medium.tabs.top>=medium.header.bottom-1);
   await send('Page.captureScreenshot',{format:'png'},sessionId).then(r=>writeFile(path.join(artifacts,'medium.png'),Buffer.from(r.data,'base64')));
   await evaluate(`proof.frame.style.width='520px'`);await evaluate('new Promise(r=>setTimeout(r,250))');
   if(await evaluate(`proof.root.dataset.narrowPanel!=='library'`))await click(`proof.root.querySelector('[aria-label="Toggle Library"]')`);
   check('narrow Explorer is an accessible overlay',await evaluate(`proof.root.dataset.narrowPanel==='library'&&getComputedStyle(proof.root.querySelector('.flint-application__vault')).position==='absolute'`));
   await send('Page.captureScreenshot',{format:'png'},sessionId).then(r=>writeFile(path.join(artifacts,'narrow.png'),Buffer.from(r.data,'base64')));
   await click(`proof.root.querySelector('[aria-label="Toggle Library"]')`);
   await evaluate(`proof.frame.style.width=proof.originalWidth`);await evaluate('new Promise(r=>setTimeout(r,250))');
   check('responsive layouts do not snapshot or edit documents',await evaluate(`proof.snapshots===0&&proof.editor.repository.state.revision===proof.revision&&proof.editor.mounts.get(proof.text.key)===proof.mount`));
   check('no browser exceptions',errors.length===0);
 }
 await writeFile(path.join(artifacts,'qualification.json'),JSON.stringify({baseline,baselineRef,browser:await send('Browser.getVersion'),measurements,checks,errors},null,2));
 await evaluate('proof.dispose();proof.session.dispose()');
}finally{socket?.close();chrome.kill();await vite.close();await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});await rm(store,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
process.exit(0);
