// B1 native browser qualification; isolated shared-repository host.
// Node 22+, CHROME_BIN and FLINT_URL supported. Isolated Chrome profile,
// In-memory fixture, no server saves. Evidence goes to artifacts/flint-b1.
import { spawn } from 'node:child_process';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import path from 'node:path';
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

 const artifacts = process.env.NATIVE_B1_ARTIFACTS ?? 'artifacts/flint-b1'; await mkdir(artifacts, {recursive:true});
 const input = await readFile(path.join(artifacts, 'rich.mutable.json'), 'utf8');
 const checks=[], errors=[];
 const check=(name,actual,expected=true)=>{assert.deepEqual(actual,expected,name);checks.push(name);};
 socket.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);});
 await send('Runtime.enable',{},sessionId);
 await send('Emulation.setDeviceMetricsOverride',{width:1280,height:1000,deviceScaleFactor:1,mobile:false},sessionId);
 await send('Page.navigate',{url:process.env.FLINT_URL??'http://localhost:3000/'},sessionId);
 for(let attempt=0;attempt<100;attempt++) {
   if(await evaluate(`document.readyState==='complete'`))break;
   await new Promise(r=>setTimeout(r,100));
 }
 await evaluate(`(async()=>{
   const {WorkspaceSession}=await import('/src/application/workspace-session.ts');
   const {materializeLocalWorkspace}=await import('/src/reactive-editor/workspace-manifest.ts');
   const {WorkspacePresentationView}=await import('/src/application/workspace-presentation-view.tsx');
   const native=await import('/src/qualification/native-b1/resource.ts');
   const source=await(await fetch('/src/rendering/reactive-tree-view.tsx')).text();
   const {render,createComponent}=await import(source.split('"').find(p=>p.includes('/solid-js_web.js')));
   const host=document.createElement('div');host.className='workspace-demo workspace-demo--canonical';host.style.cssText='position:fixed;inset:48px 0 0;z-index:9000;background:#e6ece6;overflow:auto';document.body.append(host);
   const session=new WorkspaceSession(materializeLocalWorkspace({id:'b1-workspace',type:'workspace-block',children:[{id:'b1-bank',type:'workspace-object-bank-block',children:[]}]}),{features:{compactEditorChrome:false,textSuperposition:true}});
   const editor=session.editor, repository=editor.repository;
   const bank=Object.values(repository.state.contents).find(c=>c.payload.id==='b1-bank');
   const admitted=native.admitNative(repository,new TextEncoder().encode(${JSON.stringify(input)}),bank.key);
   editor.commandRegistry.execute('flint.open',{targetKey:session.projection.state.rootKey,args:undefined});
   const dispose=render(()=>createComponent(WorkspacePresentationView,{session}),host);editor.installGateway(document);
   const views=()=>[...editor.projections.values()].filter(p=>p!==session.projection);
   const textNode=()=>Object.values(views()[0].state.nodes).find(n=>n.payload.id==='text');
   const text=()=>textNode().inlineContent.map(k=>editor.node(k).payload.text??'\uFFFC').join('');
   const capture=()=>native.nativeText(native.captureNative(repository.snapshot(),'resource'));
   window.b1={native,editor,repository,session,host,dispose,views,textNode,text,capture,bank,admitted};
 })()`);
 check('admission uses the actual WorkspaceSession repository',await evaluate('b1.editor.repository===b1.repository'));
 check('native Document mounts in a Flint transient tab',await evaluate(`b1.views().length===1&&!!b1.editor.mounts.get(b1.textNode().key)`));
 const initial = await evaluate(`b1.native.nativeText(b1.native.decodeNative(new TextEncoder().encode(${JSON.stringify(input)})))`);
 check('initial rich authored state matches recaptured canonical resource',await evaluate('b1.capture()'),initial);
 await evaluate(`(()=>{const n=b1.textNode(),m=b1.editor.mounts.get(n.key);b1.editor.focus.request(n.key);m.restoreInlineSelection({anchor:0,head:0});})()`);
 await send('Input.insertText',{text:'Browser native edit. '},sessionId);
 check('ordinary browser typing edits admitted native content',await evaluate(`b1.text().startsWith('Browser native edit. ')`));
 const edited=await evaluate('b1.capture()');
 await evaluate('b1.repository.undo()');check('undo retains original authored rich graph',await evaluate('b1.capture()'),initial);
 await evaluate('b1.repository.redo()');check('redo and native re-save retain edited graph',await evaluate('b1.capture()'),edited);
 check('stale bytes cannot overwrite live edits',await evaluate(`(()=>{try{b1.native.admitNative(b1.repository,new TextEncoder().encode(${JSON.stringify(input)}),b1.bank.key);return false;}catch(e){return e.message.includes('disk/live resource conflict');}})()`));
 await evaluate(`b1.editor.commandRegistry.execute('flint.open',{targetKey:b1.session.projection.state.rootKey,args:undefined})`);
 check('second Flint Window shares canonical Document',await evaluate(`b1.views().length===2&&Object.values(b1.repository.state.contents).filter(c=>c.viewType==='document-block').length===1`));
 await evaluate(`(()=>{const n=Object.values(b1.views()[1].state.nodes).find(n=>n.payload.id==='text');b1.editor.commands.replaceInlineRange(n.key,0,0,'Shared ');})()`);
 check('second occurrence edits are visible in first',await evaluate(`b1.text().startsWith('Shared Browser native edit. ')`));
 if(process.env.NATIVE_B11 === '1') {
   await evaluate(`(()=>{const view=b1.views()[0];const other=Object.values(view.state.nodes).find(n=>n.payload.id==='other');
     b1.linkedId=b1.editor.linkedAnnotations.createForSegments([{nodeKey:b1.textNode().key,start:0,end:3},{nodeKey:other.key,start:0,end:3}],'codex/entity-reference','browser-linked');})()`);
   check('browser-created shared definition is Document-owned',await evaluate(`(()=>{const state=b1.repository.state,root=state.contents[state.placements[b1.admitted.placementKey].contentKey];return !!root.payload.linkedAnnotations[b1.linkedId]&&!state.contents[state.placements[state.rootPlacementKey].contentKey].payload.linkedAnnotations;})()`));
   check('resource-local definition resolves through both live Windows',await evaluate(`b1.views().every(view=>{const n=Object.values(view.state.nodes).find(n=>n.payload.id==='text'),p=n.payload.standoffProperties.find(p=>p.annotationId===b1.linkedId);return b1.editor.linkedAnnotations.resolve(p,n.contentKey).value==='browser-linked';})`));
   const beforeDefinitionEdit=await evaluate('b1.capture()');
   await evaluate(`(()=>{const n=b1.textNode(),i=n.payload.standoffProperties.findIndex(p=>p.annotationId===b1.linkedId);b1.editor.linkedAnnotations.edit(n.key,i,n.payload.standoffProperties[i],{start:0,end:2,value:'updated-linked'});})()`);
   check('editing a shared definition preserves one canonical value',await evaluate(`b1.views().every(view=>{const n=Object.values(view.state.nodes).find(n=>n.payload.id==='other'),p=n.payload.standoffProperties.find(p=>p.annotationId===b1.linkedId);return b1.editor.linkedAnnotations.resolve(p,n.contentKey).value==='updated-linked';})`));
   await evaluate('b1.repository.undo()');
   check('linked-definition edit undo restores exact native resource',await evaluate('b1.capture()'),beforeDefinitionEdit);
 }
 const saved=await evaluate('b1.capture()');
 check('re-save bytes decode without semantic change',await evaluate(`b1.native.nativeText(b1.native.decodeNative(new TextEncoder().encode(b1.capture())))`),saved);
 const shot=await send('Page.captureScreenshot',{format:'png'},sessionId);await writeFile(path.join(artifacts,'native-editing.png'),Buffer.from(shot.data,'base64'));
 check('no uncaught browser exceptions',errors.length,0);
 await writeFile(path.join(artifacts,'browser-resaved.mutable.json'),saved);
 await writeFile(path.join(artifacts,'native-browser-results.json'),JSON.stringify({passed:checks.length,checks,errors},null,2)+'\n');
 console.log(JSON.stringify({passed:checks.length,checks},null,2));
 await evaluate('b1.dispose();b1.session.dispose();b1.host.remove()');
} finally {socket?.close();chrome.kill('SIGKILL');await new Promise(r=>setTimeout(r,300));await rm(profile,{recursive:true,force:true});}
