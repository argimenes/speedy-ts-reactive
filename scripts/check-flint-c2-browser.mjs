// C2 vault search/reference browser qualification. Node 22+, CHROME_BIN supported.
// Uses an isolated temporary document store, actual server process and Vite host.
// Writes only fixture files; evidence goes to artifacts/flint-c2/browser.
import { spawn } from 'node:child_process';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { tmpdir } from 'node:os';
import path from 'node:path';
const artifacts=process.env.PROOF_ARTIFACTS??'artifacts/flint-c2/browser';await mkdir(artifacts,{recursive:true});
const storeRoot=await mkdtemp(path.join(tmpdir(),'flint-native-store-'));
await mkdir(path.join(storeRoot,'vault/nested'),{recursive:true});
await writeFile(path.join(storeRoot,'vault/standalone.md'),'# Imported\n\n**native bold**');
let backend,port;
const startBackend=async()=>{backend=spawn(process.execPath,['scripts/native-production-test-host.mjs'],{env:{...process.env,PROOF_ROOT:storeRoot,PROOF_PORT:String(port??0)},stdio:['ignore','pipe','inherit']});
port=await new Promise((resolve,reject)=>{backend.stdout.once('data',b=>resolve(JSON.parse(b.toString()).port));backend.once('error',reject);backend.once('exit',code=>reject(new Error('Qualification server exited before startup: '+code)));});};
await startBackend();process.env.PORT=String(port);
const vite=await createServer({server:{host:'127.0.0.1',port:0,hmr:false}});await vite.listen();
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
 const make=()=>new WorkspaceSession(materializeLocalWorkspace({id:crypto.randomUUID(),type:'workspace-block',children:[]}),{features:{publicHostedVersion:false,...( ${process.env.P4_FACTS==='0'} ? {nativeKnowledge:false}:{}),nativeKnowledgeSaved:${process.env.P5_SAVED==='1'}}});
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
 const create=async(filename,title,text)=>{await field('New Document filename',filename);await field('New Document title',title);await click('New Document');await wait(`proof.win.textContent.includes('Saved native Document and Markdown')`);await ready();await evaluate(`proof.currentId=proof.id();proof.view=[...proof.editor.projections.values()].find(p=>p!==proof.session.projection&&(p.state.nodes[p.state.rootKey].payload.metadata??{}).documentId===proof.currentId);proof.node=Object.values(proof.view.state.nodes).find(n=>n.viewType==='standoff-editor-block');proof.editor.focus.request(proof.node.key);proof.editor.mounts.get(proof.node.key).restoreInlineSelection({anchor:0,head:0})`);await send('Input.insertText',{text},sessionId);await click('Save Document');await wait(`proof.win.textContent.includes('Saved native Document and Markdown')`);await ready();return evaluate('proof.currentId');};
 const search=async q=>{for(let i=0;i<30;i++){await field('Search vault',q);await click('Search vault');await wait(`proof.win.textContent.includes('results ·')`);if(process.env.P5_SAVED!=='1'||await evaluate(`!!proof.win.querySelector('.flint-search-hit')`))return;await new Promise(r=>setTimeout(r,100));}throw Error('Expected source never became available');};
 const pointer=async selector=>{const p=await evaluate(`(()=>{const el=proof.win.querySelector(${JSON.stringify(selector)});el.scrollIntoView({block:'center'});const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...p},sessionId);await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...p},sessionId);};
 await create('target.mutable.json','Compass','A 🧭 destination passage.');await evaluate('proof.targetId=proof.id();proof.targetNode=proof.node');await click('Close tab');await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
 await writeFile(path.join(storeRoot,'vault/unopened.mutable.json'),await readFile('artifacts/flint-b1.2/rich.mutable.json'));
 if(process.env.P5_SAVED==='1'){await click('Refresh');await ready();}
 await evaluate(`proof.before=JSON.stringify(proof.editor.repository.snapshot());proof.history=0;proof.stopHistory=proof.editor.repository.subscribeHistoryChanges(()=>proof.history++,e=>{throw e});proof.viewsBefore=proof.editor.projections.size`);
 await search('🧭');console.log('search evidence',await evaluate(`({hits:proof.win.querySelectorAll('.flint-search-hit').length,unopened:proof.win.textContent.includes('unopened'),views:proof.editor.projections.size,before:proof.viewsBefore})`));check(process.env.P5_SAVED==='1'?'saved-enabled real worker searches unmounted Unicode text without mounting other resources':'real worker searches unmounted native Unicode text and reports unopened coverage',await evaluate(`proof.win.querySelectorAll('.flint-search-hit').length===1&&proof.win.textContent.includes('unopened')&&proof.editor.projections.size===proof.viewsBefore`));
 await pointer('.flint-search-hit');await wait('proof.id()===proof.targetId');await wait(`JSON.stringify(proof.editor.mounts.get(proof.editor.focus.state.focusedKey)?.captureInlineSelection?.())==='{"anchor":2,"head":3}'`);
 check('search and passage navigation do not change canonical state or History',await evaluate('JSON.stringify(proof.editor.repository.snapshot())===proof.before&&proof.history===0'));await evaluate('proof.stopHistory()');
 await create('source.mutable.json','Source','Visit this destination.');await evaluate('proof.sourceId=proof.id();proof.sourceNode=proof.node');
 await evaluate(`proof.editor.focus.request(proof.sourceNode.key);proof.editor.mounts.get(proof.sourceNode.key).restoreInlineSelection({anchor:0,head:5});proof.editor.selections.setPrimary(proof.sourceNode.key,proof.sourceNode.contentKey,proof.sourceNode.viewId,0,5);[...proof.win.querySelectorAll('button')].find(b=>b.textContent==='Link selected text').setAttribute('data-picker-launch','')`);
 await pointer('[data-picker-launch]');await wait(`!!proof.win.querySelector('[role="dialog"]')`);await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27},sessionId);await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27},sessionId);await wait(`!proof.win.querySelector('[role="dialog"]')`);check('keyboard Escape cancels picker and restores native selection',await evaluate(`JSON.stringify(proof.editor.mounts.get(proof.sourceNode.key).captureInlineSelection())==='{"anchor":0,"head":5}'`));await pointer('[data-picker-launch]');await wait(`!!proof.win.querySelector('[role="dialog"]')`);await pointer('[aria-label="Reference Compass"]');await wait(`proof.win.textContent.includes('reference created')`);
 check('real pointer picker consumes a native selection into a stable reference',await evaluate(`proof.editor.repository.readState().contents[proof.sourceNode.contentKey].payload.standoffProperties.some(p=>p.type==='codex/block-reference'&&p.value===proof.targetId&&p.metadata.documentId===proof.targetId&&p.start===0&&p.end===4)`));
 await evaluate('proof.editor.repository.undo()');check('reference creation Undo removes the native annotation',await evaluate(`!(proof.editor.repository.readState().contents[proof.sourceNode.contentKey].payload.standoffProperties??[]).length`));await evaluate('proof.editor.repository.redo()');
 await click('Save Document');await wait(`proof.win.textContent.includes('Saved native Document and Markdown')`);await ready();
 await click('References in this Document');await wait(`!!proof.win.querySelector('.flint-reference')`);await click('Follow reference');await wait('proof.id()===proof.targetId');await ready();
 await field('Document title','Renamed destination');await click('Apply properties');await click('Save Document');await wait(`proof.win.textContent.includes('Saved native Document and Markdown')`);await ready();
 await evaluate(`proof.win.querySelector('[aria-label="Open vault/target.mutable.json"]').click()`);await ready();await field('Move destination folder','vault/nested');await field('Move destination name','moved.mutable.json');await click('Apply rename / move');await ready();
 await click('Source');await click('References in this Document');await wait(`proof.win.querySelector('.flint-reference')?.textContent.includes('Renamed destination')`);await click('Follow reference');await wait('proof.id()===proof.targetId');check('reference target survives authored title change and pair relocation',await evaluate(`proof.nativeDocumentSession(proof.editor).location(proof.targetId).filename==='moved.mutable.json'`));
 await evaluate(`proof.editor.commandRegistry.execute('flint.open',{targetKey:proof.session.projection.state.rootKey,args:undefined});proof.two=[...proof.host.querySelectorAll('.flint-application')].find(w=>w!==proof.one);proof.win=proof.two`);
 await field('Vault directory','vault');await click('Open Vault');await wait(`!!proof.win.querySelector('[aria-label="Selected folder"]')`);await ready();await search('destination passage');check('two Windows do not duplicate canonical search results',await evaluate(`proof.win.querySelectorAll('.flint-search-hit').length`),1);
 await pointer('.flint-search-hit');await wait('proof.id()===proof.targetId');await wait(`proof.two.contains(proof.editor.mounts.get(proof.editor.focus.state.focusedKey)?.root)`);check('result uses invoking Window occurrence and preserves the other Window',await evaluate(`proof.one.querySelector('.reactive-document-occurrence')?.dataset.documentView!==proof.two.querySelector('.reactive-document-occurrence')?.dataset.documentView`));
 await evaluate(`proof.win.querySelector('[aria-label="Open vault/source.mutable.json"]').click()`);await wait('proof.id()===proof.sourceId');await ready();await click('References in this Document');await wait(`!!proof.win.querySelector('.flint-reference')`);await click('Follow reference');await wait('proof.id()===proof.targetId');await wait(`proof.two.contains(proof.editor.mounts.get(proof.editor.focus.state.focusedKey)?.root)`);check('same reference follows through the second Window',true);
 await shot('search-two-windows');
 await search('destination passage');await evaluate(`proof.stale=proof.win.querySelector('.flint-search-hit');const v=[...proof.editor.projections.values()].find(p=>(p.state.nodes[p.state.rootKey].payload.metadata??{}).documentId===proof.targetId);const n=Object.values(v.state.nodes).find(n=>n.viewType==='standoff-editor-block');proof.editor.commands.replaceInlineRange(n.key,0,0,'X')`);
 check('edits immediately disable stale result actions',await evaluate('proof.stale.disabled'));await evaluate('proof.editor.repository.undo()');check('Undo does not resurrect an old query token',await evaluate('proof.stale.disabled'));
 // Fresh repository and actual backend restart; no hierarchy catalog or saved search state.
 backend.kill('SIGKILL');await new Promise(r=>backend.once('exit',r));await startBackend();await evaluate(`proof.dispose();proof.session.dispose();Object.assign(proof,proof.setup());proof.win=proof.host.querySelector('.flint-application')`);
 await field('Vault directory','vault');await click('Open Vault');await wait(`!!proof.win.querySelector('[aria-label="Open vault/source.mutable.json"]')`);await ready();await evaluate(`proof.win.querySelector('[aria-label="Open vault/source.mutable.json"]').click()`);await wait('proof.id()===proof.sourceId');await ready();await click('References in this Document');await wait(`!!proof.win.querySelector('.flint-reference')`);
 check('reopened reference reports its unopened target explicitly',await evaluate(`proof.win.querySelector('.flint-reference').textContent.includes('unopened')`));
 await evaluate(`proof.win.querySelector('[aria-label="Open vault/nested/moved.mutable.json"]').click()`);await wait('proof.id()===proof.targetId');await ready();await click('Source');await click('References in this Document');await wait(`proof.win.querySelector('.flint-reference')?.textContent.includes('Renamed destination')`);await click('Follow reference');await wait('proof.id()===proof.targetId');check('native Save/Open plus restarted server preserves the canonical reference and relocated target',true);
 await click('Source');await click('References in this Document');await wait(`!proof.win.querySelector('.flint-reference button:last-child')?.disabled`);await click('Remove reference');await evaluate('proof.editor.repository.undo()');await click('References in this Document');await wait(`!!proof.win.querySelector('.flint-reference')`);check('reference removal Undo restores the same mention',true);
 await evaluate(`proof.win.querySelector('.flint-reference').scrollIntoView({block:'center'})`);await shot('reopened-native-reference');await writeFile(path.join(artifacts,'source.mutable.json'),await readFile(path.join(storeRoot,'vault/source.mutable.json')));
 await search('destination passage');await evaluate('proof.beforeRemoval=JSON.stringify(proof.editor.repository.snapshot());proof.viewsBeforeRemoval=proof.editor.projections.size');await (await import('node:fs/promises')).rename(path.join(storeRoot,'vault/nested/moved.mutable.json'),path.join(storeRoot,'outside.mutable.json'));await pointer('.flint-search-hit');await wait(`proof.win.textContent.includes('stale')`);check('real external removal rejects activation without a mount or canonical mutation',await evaluate('proof.viewsBeforeRemoval===proof.editor.projections.size&&proof.beforeRemoval===JSON.stringify(proof.editor.repository.snapshot())'));
 check('no uncaught browser exceptions',errors.length,0);await writeFile(path.join(artifacts,'browser-results.json'),JSON.stringify({passed:checks.length,checks,errors},null,2));console.log(JSON.stringify({passed:checks.length,checks},null,2));
 await evaluate('proof.dispose();proof.session.dispose();proof.host.remove()');
}finally{socket?.close();chrome.kill('SIGKILL');backend.kill('SIGKILL');await vite.close();await new Promise(r=>setTimeout(r,300));await rm(profile,{recursive:true,force:true});await rm(storeRoot,{recursive:true,force:true});}
process.exit(0);
