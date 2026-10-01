// Flint Stage A browser qualification; isolated in-memory fixture.
// Node 22+, CHROME_BIN and FLINT_URL supported. Isolated Chrome profile,
// in-memory fixture, no document saves. FLINT_ARTIFACTS writes review evidence.
import { spawn } from 'node:child_process';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
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


 const artifacts=process.env.FLINT_ARTIFACTS??'artifacts/flint-stage-a'; await mkdir(artifacts,{recursive:true});
 const checks=[];
 const check=(name,actual,expected=true)=>{assert.deepEqual(actual,expected,name);checks.push(name);};
 const wait=async(ms=120)=>evaluate(`new Promise(r=>setTimeout(r,${ms}))`);
 const shot=async(name)=>{const {data}=await send('Page.captureScreenshot',{format:'png'},sessionId);await writeFile(path.join(artifacts,name+'.png'),Buffer.from(data,'base64'));};
 const errors=[]; socket.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);});
 await send('Runtime.enable',{},sessionId);
 await send('Emulation.setDeviceMetricsOverride',{width:1280,height:1000,deviceScaleFactor:1,mobile:false},sessionId);
 await send('Page.navigate',{url:process.env.FLINT_URL??'http://localhost:3000/'},sessionId);await wait(200);
 for(let attempt=0;attempt<200;attempt++){if(await evaluate(`!!document.querySelector('[data-system-menu-trigger="workspace"]')`))break;if(attempt===199)throw Error('Workspace menu did not mount');await wait(100);}
 await evaluate(`document.querySelector('[data-system-menu-trigger="workspace"]').click()`);await wait();
 check('default-on Workspace menu exposes Flint',await evaluate(`[...document.querySelectorAll('button')].some(b=>b.textContent==='Open Flint')`));
 await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Open Flint').click()`);await wait(350);
 check('menu opens Flint with ordinary editable Document',await evaluate(`!!document.querySelector('.flint-application [contenteditable=true]')`));
 check('Flint is visible above the Desktop background',await evaluate(`(()=>{const root=document.querySelector('.flint-application'),r=root.getBoundingClientRect();return r.width>0&&r.top>=0&&root.contains(document.elementFromPoint(r.left+80,r.top+20));})()`));
 await shot('main-application');
 await evaluate(`(async()=>{
   const {WorkspaceSession}=await import('/src/application/workspace-session.ts');
   const {materializeLocalWorkspace}=await import('/src/reactive-editor/workspace-manifest.ts');
   const {WorkspacePresentationView}=await import('/src/application/workspace-presentation-view.tsx');
   const source=await(await fetch('/src/rendering/reactive-tree-view.tsx')).text();
   const {render,createComponent}=await import(source.split('"').find(p=>p.includes('/solid-js_web.js')));
   window.makeFlint=(saved,enabled=true)=>{
     if(window.f){f.dispose();f.session.dispose();f.host.remove();}
     const host=document.createElement('div');host.className='workspace-demo workspace-demo--canonical';host.style.cssText='position:fixed;inset:48px 0 0;z-index:9000;background:#e6ece6;overflow:auto;pointer-events:auto';document.body.append(host);
     const session=new WorkspaceSession(materializeLocalWorkspace(saved??{id:'proof-workspace',type:'workspace-block',children:[]}),{features:{flint:enabled,canvasWorkspace:true,compactEditorChrome:false}});
     const editor=session.editor;
     if(!saved)editor.commandRegistry.execute('flint.open',{targetKey:session.projection.state.rootKey,args:undefined});
     const dispose=render(()=>createComponent(WorkspacePresentationView,{session}),host);editor.installGateway(document);
     const views=()=>[...editor.projections.values()].filter(p=>p!==session.projection);
     const texts=(index=0)=>Object.values(views()[index].state.nodes).filter(n=>n.viewType==='standoff-editor-block');
     const focus=(index=0,anchor=0,head=anchor)=>{const n=texts()[index],m=editor.mounts.get(n.key);editor.focus.request(n.key);m.restoreInlineSelection({anchor,head});return n.key;};
     const tabs=()=>[...host.querySelectorAll('[role=tab]')];
     const text=key=>editor.node(key).inlineContent.map(k=>editor.node(k).payload.text??' ').join('');
     window.f={host,session,editor,dispose,views,texts,focus,tabs,text};
   };
   makeFlint();
 })()`);await wait(250);
 const key=await evaluate('f.focus()');
 await send('Input.insertText',{text:'Browser typing. '},sessionId);await wait();
 check('native input edits canonical content',await evaluate(`f.text(${JSON.stringify(key)}).startsWith('Browser typing. ')`));
 await evaluate('f.editor.repository.undo()');await wait();check('undo restores native text',await evaluate(`!f.text(${JSON.stringify(key)}).startsWith('Browser typing. ')`));
 await evaluate('f.editor.repository.redo()');await wait();check('redo restores edit',await evaluate(`f.text(${JSON.stringify(key)}).startsWith('Browser typing. ')`));
 await evaluate(`f.focus(0,2,7);f.editor.selections.setPrimary(f.texts()[0].key,f.texts()[0].contentKey,f.texts()[0].viewId,2,7);f.tabs()[1].click()`);await wait();
 check('switch releases previous projection and mounts',await evaluate(`f.views().length===1&&!f.editor.node(${JSON.stringify(key)})&&!f.editor.mounts.get(${JSON.stringify(key)})`));
 await evaluate('f.tabs()[0].click()');await wait();
 check('native selection restores in fresh occurrence',await evaluate('f.editor.mounts.get(f.texts()[0].key).captureInlineSelection()'),{anchor:2,head:7});
 await evaluate(`f.focus(0,0,7);f.host.querySelector('button[title="Bold selection"]').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));f.host.querySelector('button[title="Bold selection"]').click()`);await wait();
 check('scoped toolbar creates native annotation',await evaluate(`f.texts()[0].payload.standoffProperties.some(p=>p.type==='style/bold')`));
 await evaluate(`f.focus(0,0,7);f.host.querySelector('button[title="Rainbow underline"]').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));f.host.querySelector('button[title="Rainbow underline"]').click()`);await wait();
 check('measured SVG effect renders in occurrence',await evaluate(`!!f.host.querySelector('.reactive-document-occurrence svg path')`));
 await evaluate(`f.editor.crossText.enable(true);f.focus();f.editor.crossText.set(f.editor.crossText.position(f.texts()[0].key,1),f.editor.crossText.position(f.texts()[1].key,5))`);await wait();
 const cross=await evaluate('f.editor.crossText.selectedText()');check('cross-Block selection spans both Blocks',cross.includes('\n'));
 await evaluate('f.tabs()[1].click()');await wait();await evaluate('f.tabs()[0].click()');await wait();
 check('cross-Block selection restores with remapped occurrence keys',await evaluate('f.editor.crossText.selectedText()'),cross);
 await evaluate('f.editor.crossText.clear();f.focus(0,0,4)');
 await evaluate(`(()=>{const m=f.editor.mounts.get(f.texts()[0].key);m.focusElement.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,ctrlKey:true,button:0,pointerId:1}));m.focusElement.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,ctrlKey:true,pointerId:1,clientX:20}));m.restoreInlineSelection({anchor:0,head:4});m.focusElement.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,ctrlKey:true,button:0,pointerId:1}));})()`);await wait();
 check('Grouping uses transient occurrence scope',await evaluate(`f.editor.currentTextOperation.annotationOperation()?.annotationTargets()?.[0].nodeKey===f.texts()[0].key`));
 await evaluate('f.editor.currentTextOperation.active()?.cancel();f.focus(0,0,0)');
 await send('Input.imeSetComposition',{text:'日本',selectionStart:2,selectionEnd:2},sessionId);await wait();
 await send('Input.insertText',{text:'日本'},sessionId);await wait();
 check('browser IME composition commits to canonical text',await evaluate(`f.text(f.texts()[0].key).startsWith('日本')`));
 await evaluate(`f.focus(0,2,6);f.host.querySelector('[aria-label="Minimize window"]').click()`);await wait();
 check('minimize releases the hosted editor',await evaluate('f.views().length'),0);
 await evaluate(`f.host.querySelector('[data-window-icon]').click()`);await wait();
 check('restore focuses the recreated Document',await evaluate('f.editor.focus.state.focusedKey===f.texts()[0].key'));
 check('restore retains the Document selection',await evaluate('f.editor.mounts.get(f.texts()[0].key).captureInlineSelection()'),{anchor:2,head:6});
 const source=await evaluate('f.views()[0].rootPlacementKey');
 await evaluate(`f.editor.commands.remove(${JSON.stringify(source)})`);await wait();
 check('source deletion unmounts without dangling editor',await evaluate(`f.views().length===0&&f.host.textContent.includes('Document unavailable')`));
 await evaluate('f.editor.repository.undo()');await wait();check('source Undo resolves a fresh view',await evaluate('f.views().length===1'));
 await evaluate(`f.editor.commandRegistry.execute('flint.open',{targetKey:f.session.projection.state.rootKey,args:undefined})`);await wait();
 await evaluate(`f.host.querySelectorAll('[aria-label="Flint Documents"] button').forEach(b=>{if(b.textContent==='Notes')b.click()})`);await wait();
 check('two live occurrences share canonical content',await evaluate(`f.views().length===2&&f.texts(0)[0].contentKey===f.texts(1)[0].contentKey&&f.texts(0)[0].key!==f.texts(1)[0].key`));
 await evaluate('f.focus()');await send('Input.insertText',{text:'Shared edit. '},sessionId);await wait();
 check('typing updates both Windows',await evaluate(`f.editor.mounts.get(f.texts(1)[0].key).captureText().startsWith('Shared edit. ')`));
 await evaluate(`(()=>{const input=f.host.querySelector('[aria-label="Document title"]');input.focus();input.value='Reading notes';input.dispatchEvent(new Event('input',{bubbles:true}));[...f.host.querySelectorAll('button')].find(b=>b.textContent==='Apply properties').click();})()`);await wait();
 check('native rename control updates both tab labels',await evaluate(`f.tabs().filter(t=>t.textContent==='Reading notes').length`),2);
 await shot('shared-document-windows');
 for(let i=0;i<6;i++){await evaluate(`f.tabs()[${i%2}].click()`);await wait(30);}
 check('repeated switches retain exactly two live occurrences',await evaluate('f.views().length'),2);
 const saved=await evaluate('f.editor.persistence.captureWorkspace().document');
 await evaluate(`makeFlint(${JSON.stringify(saved)})`);await wait();
 check('local reopen retains two source Documents and independent Windows',await evaluate(`Object.values(f.editor.repository.state.contents).filter(c=>c.viewType==='document-block').length===2&&f.views().length===2`));
 check('tab DTOs never contain Document bodies',await evaluate(`Object.values(f.editor.repository.state.contents).filter(c=>c.viewType==='tab-block').every(c=>c.children.length===0)`));
 await evaluate(`makeFlint(${JSON.stringify(saved)},false)`);await wait();
 check('disabled application preserves serialized data',await evaluate('f.editor.persistence.captureWorkspace().document'),saved);
 check('disabled application creates no transient views',await evaluate('f.views().length'),0);
 check('no uncaught browser errors',errors.length,0);
 await writeFile(path.join(artifacts,'browser-results.json'),JSON.stringify({passed:checks.length,checks,errors},null,2));console.log(JSON.stringify({passed:checks.length,checks},null,2));
 await evaluate('f.dispose();f.session.dispose();f.host.remove()');
} finally {socket?.close();chrome.kill('SIGKILL');await new Promise(r=>setTimeout(r,300));await rm(profile,{recursive:true,force:true});}
