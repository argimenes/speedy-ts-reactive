// Document formats browser qualification; isolated in-memory fixture.
// Node 22+, CHROME_BIN and FORMATS_URL supported. Isolated Chrome profile,
// in-memory fixture, no document saves. FORMATS_ARTIFACTS writes review evidence.
import { spawn } from 'node:child_process';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import path from 'node:path';
const profile = await mkdtemp(path.join(tmpdir(), 'speedy-formats-check-'));
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


 const artifacts = process.env.FORMATS_ARTIFACTS ?? 'artifacts/document-formats';
 await mkdir(artifacts,{recursive:true});
 const checks=[];
 const check=(name,actual,expected=true)=>{assert.deepEqual(actual,expected,name);checks.push(name);};
 const wait=async(ms=150)=>evaluate(`new Promise(r=>setTimeout(r,${ms}))`);
 const poll=async(expression)=>{for(let i=0;i<60;i++){if(await evaluate(expression))return;await wait(100);}throw Error('Not ready: '+expression);};
 const shot=async(name)=>{const clip=await evaluate(name==='creation-menu' ? '({x:0,y:0,width:330,height:860,scale:1})' : `(()=>{const r=f.host.querySelector('.reactive-window').getBoundingClientRect();return{x:Math.max(0,r.x-12),y:Math.max(0,r.y-12),width:Math.min(r.width+24,1200-r.x+12),height:Math.min(r.height+24,900-r.y+12),scale:1}})()`);const {data}=await send('Page.captureScreenshot',{format:'png',clip},sessionId);await writeFile(path.join(artifacts,name+'.png'),Buffer.from(data,'base64'));};
 const mouse=async(type,x,y,extra={})=>send('Input.dispatchMouseEvent',{type,x,y,button:'left',buttons:type==='mouseReleased'?0:1,clickCount:1,...extra},sessionId);
 await send('Emulation.setDeviceMetricsOverride',{width:1200,height:900,deviceScaleFactor:1,mobile:false},sessionId);
 await send('Page.navigate',{url:process.env.FORMATS_URL??'http://localhost:3000/'},sessionId);await wait(1200);

 // Exercise the real application creation UI before using isolated sessions.
 await evaluate(`document.querySelector('[data-system-menu-trigger="workspace"]').click()`);await wait();
 await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='New Document in Format▸').click()`);await wait();
 check('all formats discoverable in creation submenu',await evaluate(`document.querySelector('[aria-label="New Document in Format"]').querySelectorAll('button').length`),9);
 await shot('creation-menu');
 await evaluate(`[...document.querySelectorAll('[aria-label="New Document in Format"] button')].find(b=>b.textContent==='Page Document').click()`);await wait();
 check('Page menu creates ordinary live Document',await evaluate(`document.querySelectorAll('.reactive-window [contenteditable="true"]').length`),1);
 await evaluate(`(async()=>{
   const {WorkspaceSession}=await import('/src/application/workspace-session.ts');
   const {createInitialWorkspace}=await import('/src/application/initial-workspace.ts');
   const {materializeLocalWorkspace}=await import('/src/reactive-editor/workspace-manifest.ts');
   const {workspaceOpen}=await import('/src/application/workspace-open.ts');
   const {WorkspacePresentationView}=await import('/src/application/workspace-presentation-view.tsx');
   const source=await(await fetch('/src/rendering/reactive-tree-view.tsx')).text();
   const {render,createComponent}=await import(source.split('"').find(p=>p.includes('/solid-js_web.js')));
   window.makeFormat=(format,saved,enabled=true)=>{
     if(window.f){f.dispose();f.session.dispose();f.host.remove();}
     const host=document.createElement('div');host.className='workspace-demo workspace-demo--canonical';host.style.cssText='position:fixed;inset:48px 0 0;z-index:9000;background:#e6ece6;overflow:auto;pointer-events:auto';document.body.append(host);
     const session=new WorkspaceSession(materializeLocalWorkspace(saved??createInitialWorkspace()),{features:{documentFormats:enabled,canvasWorkspace:true}});
     if(!saved)workspaceOpen(session).newDocument(format);
     const dispose=render(()=>createComponent(WorkspacePresentationView,{session}),host);session.editor.installGateway(document);
     const doc=()=>Object.values(session.projection.state.nodes).find(n=>n.viewType==='document-block');
     const texts=()=>Object.values(session.projection.state.nodes).filter(n=>n.viewType==='standoff-editor-block');
     const root=()=>session.editor.mounts.get(doc().key)?.root;
     const focus=()=>{const n=texts().find(n=>session.editor.mounts.get(n.key)&&!n.inlineContent.length)??texts().find(n=>session.editor.mounts.get(n.key));const m=session.editor.mounts.get(n.key);m.focus();m.restoreInlineSelection({anchor:0,head:0});return n.key;};
     const text=key=>session.editor.node(key).inlineContent.map(k=>session.editor.node(k).payload.text??" ").join("");
     window.f={host,session,dispose,doc,texts,root,focus,text};
   };
 })()`);
 const samples={page:'A place to begin. Ordinary Codex writing, with room for ideas to grow.',simple:'Field notes — a clear, quiet place for working thoughts and source material.','sticky-note':'Remember to take the notebook.\nMeet by the garden at four.',journal:'The morning began quietly, with light across the desk. I opened the window and let the day find its own pace.',diary:'Today I walked the long way home. The trees are changing, and the air has the feeling of a new season.',letter:'Thank you for the thoughtful conversation yesterday. I am writing to share a few ideas for our next meeting.',card:'Keep one idea close at hand. Give it a name, a little context, and space to become something useful.',notebook:'A notebook for observations, questions, and the things I want to return to.',framed:'Beyond the garden wall, the path turns toward the hills. Here we gather small discoveries, and leave room for those still to come.'};
 for(const format of Object.keys(samples)){
   await evaluate(`makeFormat(${JSON.stringify(format)})`);await wait(200);
   const key=await evaluate('f.focus()');
   await send('Input.insertText',{text:samples[format]},sessionId);await wait();
   check(format+' native editing',await evaluate(`f.text(${JSON.stringify(key)}).includes(${JSON.stringify(samples[format])})`));
   if(format!=='page')check(format+' paper fills its surface',await evaluate(`f.root().getBoundingClientRect().height>=f.host.querySelector('.reactive-window__content').clientHeight-1`));
   await shot(format);
   const saved=await evaluate('f.session.editor.persistence.captureWorkspace().document');
   await evaluate(`makeFormat(${JSON.stringify(format)},${JSON.stringify(saved)})`);await wait();
   check(format+' saved content and format reopen',await evaluate('f.session.editor.persistence.captureWorkspace().document'),saved);
   if(format==='journal'){
     await evaluate(`(()=>{const n=f.texts().at(-1),m=f.session.editor.mounts.get(n.key);m.focus();m.restoreInlineSelection({anchor:n.inlineContent.length,head:n.inlineContent.length});})()`);
     await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13},sessionId);
     await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13},sessionId);
     await send('Input.insertText',{text:'A second paragraph. '},sessionId);await wait();
     check('Journal Enter continues in the ruled writing area',await evaluate(`f.root().querySelector('.reactive-generic-block').textContent.includes('A second paragraph. ')`));
   }
   if(format==='sticky-note')check('Sticky uses a small Window',await evaluate(`f.host.querySelector('.reactive-window').getBoundingClientRect().width<400`));
   if(format==='notebook'){
     await evaluate(`f.host.querySelectorAll('[role=tab]')[1].click()`);await wait();
     check('Notebook changes section using existing tabs',await evaluate(`f.host.querySelector('[role=tabpanel]').textContent.includes('Ideas')`));
     const count=await evaluate('f.host.querySelectorAll("[contenteditable=true]").length');check('Notebook mounts only the active section',count,2);
   }
   if(format==='framed'){
     await evaluate(`(()=>{const n=f.texts()[1];f.session.editor.commands.replaceInlineRange(n.key,0,n.inlineContent.length,Array(35).fill('The manuscript remains an ordinary editable Document.').join(String.fromCharCode(10)));})()`);await wait();
     const before=await evaluate(`(()=>{const r=f.root().getBoundingClientRect(),c=f.root().querySelector('.document-format__content');return{x:r.x,y:r.y,h:r.height,scrollable:c.scrollHeight>c.clientHeight}})()`);
     check('Framed central content scrolls',before.scrollable);
     await evaluate(`f.root().querySelector('.document-format__content').scrollTop=250`);await wait();
     check('Frame stays stationary while content scrolls',await evaluate(`(()=>{const r=f.root().getBoundingClientRect(),c=f.root().querySelector('.document-format__content');return{x:r.x,y:r.y,h:r.height,scrollable:c.scrollTop===250}})()`),before);
     await shot('framed-scrolled');
     await evaluate(`(()=>{const w=Object.values(f.session.projection.state.nodes).find(n=>n.viewType==='document-window-block');f.session.editor.commands.setPayloadField(w.key,'metadata',{...JSON.parse(JSON.stringify(w.payload.metadata)),size:{w:560,h:240}});})()`);await wait();
     check('Framed fits a minimum-size Window',await evaluate(`f.host.querySelector('.reactive-window').getBoundingClientRect().height===240&&f.host.querySelector('.reactive-window').getBoundingClientRect().width===560&&f.root().getBoundingClientRect().height<=f.host.querySelector('.reactive-window__content').clientHeight+1&&f.root().querySelector('.document-format__content').clientHeight>0`));
     await shot('framed-small');
     await evaluate(`f.session.selectPresentation('canvas')`);await wait(250);
     check('Framed available in Canvas',await evaluate(`!!f.host.querySelector('.workspace-canvas .document-format--framed')`));
     const focus=await evaluate('f.focus()');await send('Input.insertText',{text:'Canvas edit. '},sessionId);await wait();
     check('Canvas uses ordinary editable content',await evaluate(`f.text(${JSON.stringify(focus)}).startsWith('Canvas edit. ')`));
     await shot('framed-canvas');
     const persisted=await evaluate('f.session.editor.persistence.captureWorkspace().document');
     await evaluate(`makeFormat('framed',${JSON.stringify(persisted)},false)`);await wait();
     check('disabled feature preserves authored format and content',await evaluate('f.session.editor.persistence.captureWorkspace().document'),persisted);
     check('disabled feature renders ordinary Blocks',await evaluate(`!f.host.querySelector('.document-format')&&f.host.querySelectorAll('[contenteditable=true]').length===3`));
   }
 }
 await writeFile(path.join(artifacts,'browser-results.json'),JSON.stringify({checks},null,2));
 console.log(JSON.stringify({passed:checks.length,checks},null,2));
 await evaluate('f.dispose();f.session.dispose();f.host.remove()');
} finally {socket?.close();chrome.kill('SIGKILL');await new Promise(r=>setTimeout(r,300));await rm(profile,{recursive:true,force:true});}
