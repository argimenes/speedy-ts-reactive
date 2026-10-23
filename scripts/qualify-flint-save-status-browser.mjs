// Native Save status and actual Flint tab-indicator qualification. Node 22+, CHROME_BIN supported.
// Uses isolated storage, production HTTP routes and real Flint/editor components.
// PROOF_DOCUMENT selects a source to copy; originals are never saved or modified.
// PROOF_FIRST_SAVE=1 tests default Notes against an occupied filename.
// PROOF_ARTIFACTS selects the evidence directory (default /tmp/flint-save-status-proof).
import { spawn } from 'node:child_process';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { tmpdir } from 'node:os';
import path from 'node:path';
const artifacts=process.env.PROOF_ARTIFACTS??'/tmp/flint-save-status-proof';await mkdir(artifacts,{recursive:true});
const storeRoot=await mkdtemp(path.join(tmpdir(),'flint-native-store-'));
const firstSave=process.env.PROOF_FIRST_SAVE==='1',overwrite=process.env.PROOF_OVERWRITE==='1',ink=process.env.PROOF_INK==='1',outside=process.env.PROOF_OUTSIDE==='1',saveName=outside?'vault/Copied.ink':firstSave?(overwrite?'Notes.ink':'Notes (2).ink'):'rich.mutable.json';
const original=await readFile(process.env.PROOF_DOCUMENT??'artifacts/flint-b1.2/rich.mutable.json','utf8');
if(outside){await mkdir(path.join(storeRoot,'outside'));await mkdir(path.join(storeRoot,'vault'));}
await writeFile(path.join(storeRoot,outside?'outside/Original.ink':firstSave?'Notes.ink':saveName),original);
let backend,port;
const startBackend=async()=>{backend=spawn(process.execPath,['scripts/native-production-test-host.mjs'],{env:{...process.env,PROOF_ROOT:storeRoot,PROOF_PORT:String(port??0)},stdio:['ignore','pipe','inherit']});
port=await new Promise((resolve,reject)=>{backend.stdout.once('data',b=>resolve(JSON.parse(b.toString()).port));backend.once('error',reject);});};
await startBackend();process.env.PORT=String(port);
const vite=await createServer({server:{host:'127.0.0.1',port:0}});await vite.listen();
vite.middlewares.use('/__save-proof',(_req,res)=>{res.setHeader('Content-Type','text/html');res.end('<html><body></body></html>')});
const appUrl=`http://127.0.0.1:${vite.httpServer.address().port}/__save-proof`;
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
 const make=()=>new WorkspaceSession(materializeLocalWorkspace({id:crypto.randomUUID(),type:'workspace-block',children:[{id:crypto.randomUUID(),type:'workspace-object-bank-block',children:[]}]}),{features:{publicHostedVersion:false,nativeKnowledge:false,sqliteKnowledge:false}});
 const setup=async()=>{
 const session=make(),editor=session.editor,native=nativeDocumentSession(editor);let resourceId,dispose;
 if(${ink}){
  const {workspaceOpen}=await import('/src/application/workspace-open.ts');const {createWorkspaceOpenControls}=await import('/src/demo/workspace-open-controls.tsx');
  native.defaultVault=async()=>${JSON.stringify(outside?'vault':'.')};const actions=workspaceOpen(session);
  if(${outside})await actions.serverDocument({folder:'outside',filename:'Original.ink'},new AbortController().signal);
  else {actions.newDocument();const doc=Object.values(editor.repository.readState().contents).find(c=>c.viewType==='document-block');const placement=Object.values(editor.repository.readState().placements).find(p=>p.contentKey===doc.key);editor.commands.setPayloadField(placement.key,'metadata',{...doc.payload.metadata,title:'Notes'});const text=Object.values(editor.repository.readState().contents).find(c=>c.viewType==='standoff-editor-block');const owner=Object.values(editor.repository.readState().placements).find(p=>p.contentKey===text.key);editor.commands.replaceInlineRange(owner.key,0,0,'Standalone Ink editor for manual Save proof.');}
  const doc=Object.values(editor.repository.readState().contents).find(c=>c.viewType==='document-block');resourceId=doc.payload.metadata?.documentId??doc.payload.id;
  dispose=render(()=>{const controls=createWorkspaceOpenControls(session,()=>true);return [createComponent(WorkspacePresentationView,{session}),createComponent(controls.Dialogs,{})]},host);
 }else{
  if(${firstSave})native.defaultVault=async()=>'.';else resourceId=await native.open({folder:'.',filename:'rich.mutable.json'});
  editor.commandRegistry.execute('flint.open',{targetKey:session.projection.state.rootKey,args:undefined});dispose=render(()=>createComponent(WorkspacePresentationView,{session}),host);
  if(${firstSave})resourceId=host.querySelector('[data-flint-property="id"]').textContent;
 }
 editor.installGateway(document);return {session,editor,dispose,native,resourceId};};
 window.proof={host,setup,...await setup(),nativeDocumentSession,codec};
 proof.click=text=>{if(text==='Files'){const menu=host.querySelector('[aria-label="Flint application menu"]');if(menu.getAttribute('aria-expanded')!=='true')menu.click();}const button=[...host.querySelectorAll('button')].find(b=>b.textContent===text);if(!button)throw Error('Missing '+text);button.click()};
 proof.field=(label,value)=>{const input=host.querySelector('input[aria-label="'+label+'"]');input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));};
 proof.wait=async predicate=>{for(let i=0;i<150;i++){if(predicate())return;await new Promise(r=>setTimeout(r,30));}throw Error('UI wait timed out: '+host.textContent.slice(0,1700))};
 })()`);

 await evaluate(`proof.wait(()=>proof.host.querySelector('.reactive-standoff-flow'))`);
 await evaluate(`proof.text=[...proof.editor.projections.values()].flatMap(p=>Object.values(p.state.nodes)).find(n=>n.viewType==='standoff-editor-block'&&n.inlineContent.length>0&&proof.editor.mounts.get(n.key));proof.mount=proof.editor.mounts.get(proof.text.key);proof.editor.focus.request(proof.text.key);proof.mount.restoreInlineSelection({anchor:0,head:0});proof.events=[];proof.stopChanges=proof.editor.repository.subscribeChanges(c=>proof.events.push({revision:c.revision,label:c.label,contents:[...c.previousContents.keys()]}))`);
 const wait=predicate=>evaluate(`proof.wait(()=>(${predicate}))`);
 const dirty=()=>evaluate(`proof.native.isDirty(proof.resourceId)`);
 const saveButton=()=>evaluate(`proof.host.querySelector('.flint-save,[aria-label=\"Save Document\"]').click()`);
 const checkDirty=async(expected,label)=>{check(label,await dirty(),expected);if(!ink)check(label+' tab indicator',await evaluate(`!!proof.host.querySelector('[role=tab][aria-selected=true] [aria-label="Unsaved changes"]')`),expected);};
 if(firstSave){if(!ink)await wait(`proof.host.querySelector('[aria-label="Selected folder"]')?.textContent==='.'`);await checkDirty(true,'New Notes remains unsaved before manual Save');if(!ink)check('Default Document is Notes',await evaluate(`proof.host.querySelector('[role=tab][aria-selected=true]').textContent`),'Notes');}
 else await checkDirty(false,'Opened Document is clean');
 await send('Input.insertText',{text:'Save status proof '},sessionId);
 await checkDirty(true,'Actual editor typing marks the active Document dirty');
 await saveButton();
 if(outside){
  await wait(`document.body.textContent.includes('Save in Vault')`);
  await evaluate(`[...document.querySelectorAll('[role=dialog] button')].find(b=>b.textContent==='Cancel').click()`);await evaluate(`proof.wait(()=>proof.host.textContent.includes('Save cancelled'))`);
  check('Cancelling Vault copy keeps original binding',await evaluate('proof.native.location(proof.resourceId)'),{folder:'outside',filename:'Original.ink'});
  await saveButton();await wait(`document.body.textContent.includes('Save in Vault')`);
  await evaluate(`const input=document.querySelector('[aria-label="Save Vault filename"]');input.value='Copied.ink';input.dispatchEvent(new Event('input',{bubbles:true}));[...document.querySelectorAll('[role=dialog] button')].find(b=>b.textContent==='Save in Vault').click()`);
 }
 if(firstSave){
  await wait(`document.body.textContent.includes('File already exists')`);
  check('Collision does not write before confirmation',await readFile(path.join(storeRoot,'Notes.ink'),'utf8'),original);
  await evaluate(`[...document.querySelectorAll('[role=dialog] button')].find(b=>b.textContent==='Cancel').click()`);
  await wait(`!proof.host.querySelector('.flint-save,[aria-label=\"Save Document\"]').disabled`);await checkDirty(true,'Cancelled collision keeps the Document unsaved');
  check('Cancel preserves the existing file',await readFile(path.join(storeRoot,'Notes.ink'),'utf8'),original);
  await saveButton();await wait(`document.body.textContent.includes('File already exists')`);
  await evaluate(`[...document.querySelectorAll('[role=dialog] button')].find(b=>b.textContent===${JSON.stringify(overwrite?'Overwrite':'Save with a different name')}).click()`);
 }
 await wait(`proof.native.status(proof.resourceId).startsWith('Saved')`);
 await checkDirty(false,'Save button clears both native dirty state and tab indicator');
 await evaluate('new Promise(r=>setTimeout(r,700))');await checkDirty(false,'Rendering after Save does not dirty the Document');
 check('Edited bytes were written to the isolated native file',(await readFile(path.join(storeRoot,saveName),'utf8')).includes('Save status proof '));
 await evaluate(`proof.editor.focus.request(proof.text.key);proof.mount.restoreInlineSelection({anchor:0,head:0})`);
 await send('Input.insertText',{text:'Shortcut proof '},sessionId);
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'s',code:'KeyS',modifiers:4,windowsVirtualKeyCode:83},sessionId);
 await send('Input.dispatchKeyEvent',{type:'keyUp',key:'s',code:'KeyS',modifiers:4,windowsVirtualKeyCode:83},sessionId);
 await wait(`!proof.native.isDirty(proof.resourceId)`);await checkDirty(false,'Command-S saves and clears the active tab');
 check('Command-S persisted its current edit',(await readFile(path.join(storeRoot,saveName),'utf8')).includes('Shortcut proof '));
 if(firstSave){
 check('First Save uses available filename in active Vault',await evaluate('proof.native.location(proof.resourceId)'),{folder:'.',filename:saveName});
 check('Save never opens Storage and recovery',await evaluate(`!proof.host.querySelector('[aria-label="Storage and recovery"]')`));
 if(!overwrite)check('Original Notes file is unchanged',await readFile(path.join(storeRoot,'Notes.ink'),'utf8'),original);else check('Confirmed overwrite uses the requested filename',JSON.parse(await readFile(path.join(storeRoot,'Notes.ink'),'utf8')).resourceId,await evaluate('proof.resourceId'));
 check('Saved resource keeps its canonical identity',JSON.parse(await readFile(path.join(storeRoot,saveName),'utf8')).resourceId,await evaluate('proof.resourceId'));
 const shot=await send('Page.captureScreenshot',{format:'png'},sessionId);await writeFile(path.join(artifacts,'first-save.png'),Buffer.from(shot.data,'base64'));
 }
 if(outside){check('Outside original is untouched',await readFile(path.join(storeRoot,'outside/Original.ink'),'utf8'),original);check('Subsequent Save stays in selected Vault',await evaluate('proof.native.location(proof.resourceId)'),{folder:'vault',filename:'Copied.ink'});}
 // An external change must keep local edits dirty and surface the failure.
 await writeFile(path.join(storeRoot,saveName),(await readFile(path.join(storeRoot,saveName),'utf8'))+'\n');
 await evaluate(`proof.editor.focus.request(proof.text.key);proof.mount.restoreInlineSelection({anchor:0,head:0})`);
 await send('Input.insertText',{text:'Conflict proof '},sessionId);await saveButton();
 await wait(`proof.native.status(proof.resourceId).startsWith('Save blocked')`);
 await checkDirty(true,'Rejected Save retains the unsaved indicator');
 await wait(`!![...proof.host.querySelectorAll('[role=alert]')].find(e=>e.textContent.includes('Save blocked'))`);
 check('Rejected Save displays its reason in the main Flint window',await evaluate(`!![...proof.host.querySelectorAll('[role=alert]')].find(e=>e.textContent.includes('Save blocked'))`));
 check('Rejected Save preserves the external file',!(await readFile(path.join(storeRoot,saveName),'utf8')).includes('Conflict proof '));
 check('No browser exceptions',errors.length,0);
 await writeFile(path.join(artifacts,'results.json'),JSON.stringify({checks,errors,status:await evaluate('proof.native.status(proof.resourceId)')},null,2));
 console.log(JSON.stringify({checks,errors},null,2));
 await evaluate('proof.stopChanges();proof.dispose();proof.session.dispose()');
} finally { socket?.close();chrome.kill('SIGTERM');backend?.kill('SIGTERM');await vite.close();await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100});await rm(storeRoot,{recursive:true,force:true}); }
