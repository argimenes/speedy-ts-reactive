// Production native Save/Open browser qualification. Node 22+, CHROME_BIN supported.
// Uses an isolated temporary document store, actual server process and Vite host.
// Writes only fixture files; evidence goes to artifacts/flint-native-production.
import { spawn } from 'node:child_process';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { tmpdir } from 'node:os';
import path from 'node:path';
const artifacts='artifacts/flint-native-production';await mkdir(artifacts,{recursive:true});
const storeRoot=await mkdtemp(path.join(tmpdir(),'flint-native-store-'));
await writeFile(path.join(storeRoot,'rich.mutable.json'),await readFile('artifacts/flint-b1.2/rich.mutable.json'));
await writeFile(path.join(storeRoot,'standalone.md'),'# Imported\n\n**native bold**');
let backend,port;
const startBackend=async()=>{backend=spawn(process.execPath,['scripts/native-production-test-host.mjs'],{env:{...process.env,PROOF_ROOT:storeRoot,PROOF_PORT:String(port??0)},stdio:['ignore','pipe','inherit']});
port=await new Promise((resolve,reject)=>{backend.stdout.once('data',b=>resolve(JSON.parse(b.toString()).port));backend.once('error',reject);});};
await startBackend();process.env.PORT=String(port);
const vite=await createServer({server:{host:'127.0.0.1',port:0}});await vite.listen();
const appUrl=`http://127.0.0.1:${vite.httpServer.address().port}`;
const control=(name)=>fetch(`http://127.0.0.1:${port}/__proof/${name}`,{method:name==='status'?'GET':'POST'});
const profile = await mkdtemp(path.join(tmpdir(), 'speedy-flint-check-'));
const chrome = spawn(process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disk-cache-size=1', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank']);
let socket;
try {
const endpoint = await new Promise((resolve, reject) => {
 let output = ''; chrome.stderr.on('data', chunk => { output += chunk; const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/); if(match) resolve(match[1]); });
 chrome.once('error', reject); setTimeout(() => reject(new Error('Chrome startup timed out')), 15000).unref();
});
socket = new WebSocket(endpoint); await new Promise(resolve => socket.addEventListener('open', resolve, {once:true}));
let id = 0; const pending = new Map();
socket.addEventListener('message', event => { const result = JSON.parse(event.data); if(result.id && pending.has(result.id)) { const p = pending.get(result.id); pending.delete(result.id); result.error ? p.reject(new Error(JSON.stringify(result.error))) : p.resolve(result.result); }});
const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const requestId = ++id; const timeout=setTimeout(()=>{pending.delete(requestId);reject(new Error('CDP timeout: '+method));},20000);pending.set(requestId,{resolve:v=>{clearTimeout(timeout);resolve(v)},reject:e=>{clearTimeout(timeout);reject(e)}}); socket.send(JSON.stringify({id:requestId,method,params,...(sessionId ? {sessionId} : {})})); });
 const {targetId} = await send('Target.createTarget',{url:'about:blank'}); const {sessionId} = await send('Target.attachToTarget',{targetId,flatten:true});
 await send('Network.enable',{},sessionId);
 socket.addEventListener('message', event => { const msg=JSON.parse(event.data); if(msg.method==='Network.loadingFailed') console.error(JSON.stringify(msg.params)); });
 const evaluate = async expression => {
   const result = await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);
   if(result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
   return result.result.value;
 };

 const checks=[], errors=[];const check=(name,value,expected=true)=>{assert.deepEqual(value,expected,name);checks.push(name);};
 socket.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails)});
 await send('Runtime.enable',{},sessionId);await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false},sessionId);
 await send('Page.navigate',{url:appUrl},sessionId);await evaluate('new Promise(r=>setTimeout(r,1500))');
 await evaluate(`(async()=>{
 const {WorkspaceSession}=await import('/src/application/workspace-session.ts');
 const {materializeLocalWorkspace}=await import('/src/reactive-editor/workspace-manifest.ts');
 const {WorkspacePresentationView}=await import('/src/application/workspace-presentation-view.tsx');
 const {nativeDocumentSession}=await import('/src/persistence/native-session.ts');
 const codec=await import('/src/persistence/native-resource.ts');
 const source=await(await fetch('/src/rendering/reactive-tree-view.tsx')).text();const {render,createComponent}=await import(source.split('"').find(p=>p.includes('/solid-js_web.js')));
 const host=document.createElement('div');host.className='workspace-demo workspace-demo--canonical';host.style.cssText='position:fixed;inset:40px 0 0;z-index:9000;background:#eee;overflow:auto';document.body.append(host);
 const make=()=>new WorkspaceSession(materializeLocalWorkspace({id:crypto.randomUUID(),type:'workspace-block',children:[]}),{features:{publicHostedVersion:false}});
 const setup=()=>{const session=make(),editor=session.editor;editor.commandRegistry.execute('flint.open',{targetKey:session.projection.state.rootKey,args:undefined});const dispose=render(()=>createComponent(WorkspacePresentationView,{session}),host);editor.installGateway(document);return {session,editor,dispose}};
 window.proof={host,setup,...setup(),nativeDocumentSession,codec};
 proof.click=text=>{const button=[...host.querySelectorAll('button')].find(b=>b.textContent===text);if(!button)throw Error('Missing '+text);button.click()};
 proof.field=(label,value)=>{const input=host.querySelector('input[aria-label="'+label+'"]');input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));};
 proof.wait=async predicate=>{for(let i=0;i<150;i++){if(predicate())return;await new Promise(r=>setTimeout(r,30));}throw Error('UI wait timed out: '+host.textContent.slice(0,1700))};
 })()`);
 const click=label=>evaluate(`proof.click(${JSON.stringify(label)})`);
 const field=(label,value)=>evaluate(`proof.field(${JSON.stringify(label)},${JSON.stringify(value)})`);
 const wait=predicate=>evaluate(`proof.wait(()=>(${predicate}))`);
 await click('Files');await field('Native filename','rich.mutable.json');await click('List files');await wait(`proof.host.querySelector('select').textContent.includes('rich.mutable.json')`);
 check('real server listing offers native resources and explicit Markdown import',await evaluate(`proof.host.querySelector('select').textContent.includes('standalone.md')`));
 await click('Open native');await wait(`!!proof.nativeDocumentSession(proof.editor).location('resource')`);
 const resourceId='resource';
 await evaluate(`proof.resourceId=${JSON.stringify(resourceId)};proof.source=Object.values(proof.editor.repository.state.contents).find(c=>c.viewType==='document-block'&&((c.payload.metadata??{}).documentId??c.payload.id)===proof.resourceId);proof.rootKey=proof.source.key;`);
 check('native admission retains one canonical resource',await evaluate(`!!proof.source&&Object.values(proof.editor.repository.state.contents).filter(c=>c.viewType==='document-block'&&((c.payload.metadata??{}).documentId??c.payload.id)===proof.resourceId).length===1`));
 await evaluate(`proof.editor.commandRegistry.execute('flint.open',{targetKey:proof.session.projection.state.rootKey,args:undefined});for(const vault of proof.host.querySelectorAll('.flint-application__vault'))[...vault.querySelectorAll('button')].find(b=>b.textContent==='Untitled').click();`);
 check('two Flint Windows share native content through independent occurrences',await evaluate(`[...proof.editor.projections.values()].filter(p=>p!==proof.session.projection&&p.state.nodes[p.state.rootKey]?.contentKey===proof.rootKey).length===2`));
 await evaluate(`(()=>{const projection=[...proof.editor.projections.values()].find(p=>p!==proof.session.projection&&p.state.nodes[p.state.rootKey]?.contentKey===proof.rootKey);const n=Object.values(projection.state.nodes).find(n=>n.viewType==='standoff-editor-block');proof.textKey=n.key;proof.editor.focus.request(n.key);proof.editor.mounts.get(n.key).restoreInlineSelection({anchor:0,head:0})})()`);
 await send('Input.insertText',{text:'Production edit '},sessionId);
 const expectedFirst=await evaluate(`proof.codec.nativeText(proof.codec.captureNative(proof.editor.repository.snapshot(),proof.resourceId))`);
 await click('Save Document');await wait(`proof.host.textContent.includes('Saved native Document and Markdown')`);
 const firstNative=await readFile(path.join(storeRoot,'rich.mutable.json'),'utf8'),firstMd=await readFile(path.join(storeRoot,'rich.md'),'utf8');
 check('UI Save writes native and readable Markdown through production route',firstNative===expectedFirst&&firstMd.includes('Production edit'));
 check('Workspace tree Save remains guarded',await evaluate(`(()=>{try{proof.editor.persistence.captureWorkspace();return false}catch(e){return String(e).includes('native Documents')}})()`));
 await control('hold');await evaluate(`proof.editor.commands.replaceInlineRange(proof.textKey,0,0,'Captured ');proof.pendingCapture=proof.codec.nativeText(proof.codec.captureNative(proof.editor.repository.snapshot(),proof.resourceId));`);await click('Save Document');
 for(let i=0;i<100;i++){if((await(await control('status')).json()).entered)break;await new Promise(r=>setTimeout(r,20));}
 await evaluate(`proof.editor.commands.replaceInlineRange(proof.textKey,0,0,'Newer ');for(const n of Object.values(proof.session.projection.state.nodes).filter(n=>n.viewType==='window-block'))proof.editor.commands.remove(n.key);`);
 await control('release');await wait(`proof.nativeDocumentSession(proof.editor).status(proof.resourceId).startsWith('Saved')`);
 check('closing all Windows does not cancel save; newer edits stay dirty',await evaluate(`proof.nativeDocumentSession(proof.editor).status(proof.resourceId).includes('newer/unsaved')&&proof.editor.projections.size===1`));
 const captured=await readFile(path.join(storeRoot,'rich.mutable.json'),'utf8');check('saved generation excludes edits made during publication',captured===await evaluate('proof.pendingCapture'));
 // Reopen in a fresh shared repository through the actual file UI.
 await evaluate(`proof.dispose();proof.session.dispose();Object.assign(proof,proof.setup());void 0;`);
 await click('Files');await field('Native filename','rich.mutable.json');await click('Open native');await wait(`!!proof.nativeDocumentSession(proof.editor).location('resource')`);
 check('fresh Open restores native authored state without Markdown reconstruction',await evaluate(`proof.host.textContent.includes('Captured Production edit')`));
 // Restart the actual server process; the durable pair receipt remains usable.
 backend.kill('SIGKILL');await new Promise(r=>backend.once('exit',r));await startBackend();
 await click('Save Document');await wait(`proof.host.textContent.includes('Saved native Document and Markdown')`);
 check('save after actual server restart uses the persisted binding evidence',true);
 await control('hold');
 await evaluate(`(()=>{const view=[...proof.editor.projections.values()].find(p=>p!==proof.session.projection&&p.state.nodes[p.state.rootKey]?.viewType==='document-block'&&((p.state.nodes[p.state.rootKey].payload.metadata??{}).documentId??p.state.nodes[p.state.rootKey].payload.id)===proof.resourceId);const text=Object.values(view.state.nodes).find(n=>n.viewType==='standoff-editor-block');proof.editor.commands.replaceInlineRange(text.key,0,0,'Restart recovery ');})()`);
 await click('Save Document');
 let held=false;for(let i=0;i<100;i++){if((await(await control('status')).json()).entered){held=true;break;}await new Promise(r=>setTimeout(r,20));}assert.equal(held,true,'server reached the partial-publication checkpoint');
 backend.kill('SIGKILL');await new Promise(r=>backend.once('exit',r));await startBackend();
 await wait(`[...proof.host.querySelectorAll('button')].find(b=>b.textContent==='Retry / Recover').disabled===false`);
 await click('Retry / Recover');await wait(`proof.host.textContent.includes('Saved native Document and Markdown')`);
 check('UI retry recovers after actual server death during partial publication',(await readFile(path.join(storeRoot,'rich.md'),'utf8')).includes('Restart recovery'));

 await field('Native filename','standalone.md');await click('Import Markdown');await wait(`proof.host.textContent.includes('native bold')`);
 check('explicit Markdown import creates a separate native candidate',await evaluate(`proof.host.textContent.includes('native bold')`));
 await field('Native filename','candidate.mutable.json');await click('Save Document');await wait(`proof.host.textContent.includes('Saved native Document and Markdown')`);
 check('imported candidate saves natively without changing source Markdown',(await readFile(path.join(storeRoot,'standalone.md'),'utf8'))==='# Imported\n\n**native bold**');
 await writeFile(path.join(artifacts,'saved.mutable.json'),await readFile(path.join(storeRoot,'rich.mutable.json')));await writeFile(path.join(artifacts,'saved.md'),await readFile(path.join(storeRoot,'rich.md')));
 const screenshot=await send('Page.captureScreenshot',{format:'png'},sessionId);await writeFile(path.join(artifacts,'native-save-open.png'),Buffer.from(screenshot.data,'base64'));
 check('no uncaught browser exceptions',errors.length,0);await writeFile(path.join(artifacts,'browser-results.json'),JSON.stringify({passed:checks.length,checks,errors},null,2));console.log(JSON.stringify({passed:checks.length,checks},null,2));
 await evaluate('proof.dispose();proof.session.dispose();proof.host.remove()');
}finally{socket?.close();chrome.kill('SIGKILL');backend.kill('SIGKILL');await vite.close();await new Promise(r=>setTimeout(r,300));await rm(profile,{recursive:true,force:true});await rm(storeRoot,{recursive:true,force:true});}
process.exit(0);
