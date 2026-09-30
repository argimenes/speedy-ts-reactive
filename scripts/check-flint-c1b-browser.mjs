// C1b filesystem vault UI browser qualification. Node 22+, CHROME_BIN supported.
// Uses an isolated temporary document store, actual server process and Vite host.
// Writes only fixture files; evidence goes to artifacts/flint-native-production.
import { spawn } from 'node:child_process';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { tmpdir } from 'node:os';
import path from 'node:path';
const artifacts=process.env.PROOF_ARTIFACTS??'artifacts/flint-c1b/browser';await mkdir(artifacts,{recursive:true});
const storeRoot=await mkdtemp(path.join(tmpdir(),'flint-native-store-'));
await mkdir(path.join(storeRoot,'vault/nested'),{recursive:true});
await writeFile(path.join(storeRoot,'vault/standalone.md'),'# Imported\n\n**native bold**');
let backend,port;
const startBackend=async()=>{backend=spawn(process.execPath,['scripts/native-production-test-host.mjs'],{env:{...process.env,PROOF_ROOT:storeRoot,PROOF_PORT:String(port??0)},stdio:['ignore','pipe','inherit']});
port=await new Promise((resolve,reject)=>{backend.stdout.once('data',b=>resolve(JSON.parse(b.toString()).port));backend.once('error',reject);backend.once('exit',code=>reject(new Error('Qualification server exited before startup: '+code)));});};
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
 await evaluate(`proof.one=proof.host.querySelector('.flint-application');proof.win=proof.one;
 proof.click=text=>{const b=[...proof.win.querySelectorAll('button')].find(b=>b.textContent===text);if(!b||b.disabled)throw Error('Button unavailable '+text);b.click();};
 proof.field=(label,value)=>{const el=proof.win.querySelector('[aria-label="'+label+'"]');if(!el)throw Error('Field missing '+label);el.value=value;el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));};
 proof.id=()=>proof.win.querySelector('[data-flint-property="id"]').textContent;
 proof.ready=()=>![...proof.win.querySelectorAll('button')].find(b=>b.textContent==='Refresh')?.disabled;
 `);
 const click=label=>evaluate(`proof.click(${JSON.stringify(label)})`),field=(label,value)=>evaluate(`proof.field(${JSON.stringify(label)},${JSON.stringify(value)})`),wait=p=>evaluate(`proof.wait(()=>(${p}))`);
 const ready=()=>wait('proof.ready()');
 const shot=async name=>{const {data}=await send('Page.captureScreenshot',{format:'png'},sessionId);await writeFile(path.join(artifacts,name+'.png'),Buffer.from(data,'base64'));};
 await field('Vault directory','vault');await click('Open Vault');await wait(`!!proof.win.querySelector('[aria-label="Selected folder"]')`);await ready();
 check('Open Vault reconstructs real nested directories without admission',await evaluate(`proof.win.textContent.includes('nested')&&!proof.win.querySelector('[aria-label="Open vault/standalone.md"]')`));
 await field('New directory name','Research');await click('Create directory');await ready();check('Create directory writes a real folder',(await(await import('node:fs/promises')).stat(path.join(storeRoot,'vault/Research'))).isDirectory());
 await field('New Document title','Evening notes');await field('New Document filename','notes.mutable.json');await click('New Document');await wait(`proof.win.textContent.includes('Saved native Document and Markdown')`);await ready();
 await evaluate('proof.resourceId=proof.id()');const resourceId=await evaluate('proof.resourceId');
 check('New Document creates native pair in selected physical directory',(await readFile(path.join(storeRoot,'vault/notes.mutable.json'),'utf8')).includes(resourceId));
 await field('Document title','A different authored title');await field('Document tags','night\npoetry');await click('Apply properties');await click('Save Document');await wait(`proof.win.textContent.includes('Saved native Document and Markdown')`);await ready();
 check('title and tags save as native metadata without renaming the pair',(await readFile(path.join(storeRoot,'vault/notes.mutable.json'),'utf8')).includes('A different authored title'));
 await evaluate(`proof.editor.commandRegistry.execute('flint.open',{targetKey:proof.session.projection.state.rootKey,args:undefined});proof.two=[...proof.host.querySelectorAll('.flint-application')].find(w=>w!==proof.one);proof.win=proof.two`);
 await field('Vault directory','vault');await click('Open Vault');await wait(`!!proof.win.querySelector('[aria-label="Open vault/notes.mutable.json"]')`);await ready();
 await evaluate(`proof.win.querySelector('[aria-label="Open vault/notes.mutable.json"]').click()`);await wait(`proof.id()===proof.resourceId`);await ready();
 await evaluate(`proof.views=()=>[...proof.editor.projections.values()].filter(p=>p!==proof.session.projection&&(p.state.nodes[p.state.rootKey].payload.metadata??{}).documentId===proof.resourceId);proof.oldViews=proof.views().map(p=>p.id);`);
 check('two Flint Windows independently host the same canonical Document',await evaluate('proof.views().length'),2);
 await field('Tag filter','poetry');check('loaded tag filter crosses the physical hierarchy',await evaluate(`!!proof.win.querySelector('[aria-label="Open vault/notes.mutable.json"]')`));
 // Type during the real, journalled relocation with the server held between filesystem steps.
 await field('Move destination folder','vault/Research');await field('Move destination name','paper.mutable.json');
 await control('hold?stage=relocation-after-0');await click('Apply rename / move');
 let entered=false;for(let i=0;i<200;i++){if((await(await control('status')).json()).entered){entered=true;break;}await new Promise(r=>setTimeout(r,20));}assert.equal(entered,true);
 await evaluate(`const v=proof.views().find(v=>proof.two.contains(proof.editor.mounts.get(v.state.rootKey)?.root))??proof.views()[0];const n=Object.values(v.state.nodes).find(n=>n.viewType==='standoff-editor-block');proof.textKey=n.key;proof.editor.focus.request(n.key);proof.editor.mounts.get(n.key).restoreInlineSelection({anchor:0,head:0})`);
 await send('Input.insertText',{text:'Written during relocation. '},sessionId);await control('release');await ready();
 check('continued native typing survives relocation in both occurrences',await evaluate(`proof.views().length===2&&proof.one.textContent.includes('Written during relocation.')&&proof.two.textContent.includes('Written during relocation.')`));
 check('relocation updates both physical trees and the binding without a new save generation',await evaluate(`proof.one.querySelector('[aria-label="Open vault/Research/paper.mutable.json"]')!==null&&proof.two.querySelector('[aria-label="Open vault/Research/paper.mutable.json"]')!==null&&proof.nativeDocumentSession(proof.editor).status(proof.resourceId).includes('unsaved')`));
 check('unsaved typing was not included in relocation',(await readFile(path.join(storeRoot,'vault/Research/paper.mutable.json'),'utf8')).includes('Written during relocation.'),false);
 await click('Save Document');await wait(`proof.win.textContent.includes('Saved native Document and Markdown')`);await ready();check('next Save publishes edits to relocated destination',(await readFile(path.join(storeRoot,'vault/Research/paper.mutable.json'),'utf8')).includes('Written during relocation.'));
 await click('Research');await field('Move destination folder','vault');await field('Move destination name','Archive');await click('Apply rename / move');await ready();
 check('directory move preserves title and updates both Windows',await evaluate(`proof.nativeDocumentSession(proof.editor).location(proof.resourceId).folder==='vault/Archive'&&proof.win.querySelector('[aria-label="Document title"]').value==='A different authored title'&&proof.one.textContent.includes('Archive')`));
 await shot('two-windows-vault');
 // Refresh must discover outside changes, not transfer the live binding.
 await mkdir(path.join(storeRoot,'vault/Outside'));await click('Refresh');await ready();check('Refresh discovers an external folder without catalog metadata',await evaluate(`proof.win.textContent.includes('Outside')`));
 // Actual process death during relocation, then recovery through the visible UI.
 await evaluate(`proof.win.querySelector('[aria-label="Open vault/Archive/paper.mutable.json"]').click()`);await ready();await field('Move destination name','recovered.mutable.json');await control('hold?stage=relocation-after-0');await click('Apply rename / move');
 entered=false;for(let i=0;i<200;i++){if((await(await control('status')).json()).entered){entered=true;break;}await new Promise(r=>setTimeout(r,20));}assert.equal(entered,true);
 backend.kill('SIGKILL');await new Promise(r=>backend.once('exit',r));await startBackend();await ready();await click('Refresh');await ready();await wait(`proof.win.textContent.includes('Pending relocation:')`);await shot('pending-recovery');await click('Recover relocation');await ready();
 check('visible recovery resumes durable relocation after server process death',await evaluate(`proof.nativeDocumentSession(proof.editor).location(proof.resourceId).filename==='recovered.mutable.json'`));
 // Explicit import source is never overwritten.
 await field('Markdown source','vault/standalone.md');await field('New Document filename','imported.mutable.json');await click('Import into new native Document');await wait(`proof.win.textContent.includes('native bold')`);await ready();
 check('explicit Markdown import saves a distinct native resource and preserves source',(await readFile(path.join(storeRoot,'vault/standalone.md'),'utf8'))==='# Imported\n\n**native bold**');
 // New editor/repository after backend restart: reopen tree and original ID from disk.
 backend.kill('SIGKILL');await new Promise(r=>backend.once('exit',r));await startBackend();await evaluate(`proof.dispose();proof.session.dispose();Object.assign(proof,proof.setup());proof.win=proof.host.querySelector('.flint-application');`);
 await field('Vault directory','vault');await click('Open Vault');await wait(`!!proof.win.querySelector('[aria-label="Open vault/Archive/recovered.mutable.json"]')`);await ready();await evaluate(`proof.win.querySelector('[aria-label="Open vault/Archive/recovered.mutable.json"]').click()`);await wait(`proof.id()===proof.resourceId`);await ready();
 check('fresh repository and restarted server reconstruct hierarchy, identity, native text and properties',await evaluate(`proof.win.textContent.includes('Written during relocation.')&&proof.win.querySelector('[aria-label="Document title"]').value==='A different authored title'&&proof.win.querySelector('[aria-label="Document tags"]').value==='night\\npoetry'`));
 await shot('reopened-vault');await writeFile(path.join(artifacts,'reopened.mutable.json'),await readFile(path.join(storeRoot,'vault/Archive/recovered.mutable.json')));
 check('no uncaught browser exceptions',errors.length,0);await writeFile(path.join(artifacts,'browser-results.json'),JSON.stringify({passed:checks.length,checks,errors},null,2));console.log(JSON.stringify({passed:checks.length,checks},null,2));
 await evaluate('proof.dispose();proof.session.dispose();proof.host.remove()');
}finally{socket?.close();chrome.kill('SIGKILL');backend.kill('SIGKILL');await vite.close();await new Promise(r=>setTimeout(r,300));await rm(profile,{recursive:true,force:true});await rm(storeRoot,{recursive:true,force:true});}
process.exit(0);
