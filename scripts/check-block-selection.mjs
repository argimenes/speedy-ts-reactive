// Run against an already-running Vite dev server (npm run dev).
// Uses an isolated Chrome profile and an in-memory fixture; never saves documents.
// Checks Block selection and native group drag/reorder without saving documents.
// Optional: CHROME_BIN and BENCHMARK_URL. No document-store saves.
// Requires Node 22+ (WebSocket).
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import path from 'node:path';
const profile = await mkdtemp(path.join(tmpdir(), 'speedy-typing-bench-'));
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
const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const requestId = ++id; pending.set(requestId,{resolve,reject}); socket.send(JSON.stringify({id:requestId,method,params,...(sessionId ? {sessionId} : {})})); });
 const {targetId} = await send('Target.createTarget',{url:'about:blank'}); const {sessionId} = await send('Target.attachToTarget',{targetId,flatten:true});
 const evaluate = async expression => {
   const result = await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);
   if(result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
   return result.result.value;
 };

 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false},sessionId);
 await send('Page.navigate',{url:process.env.BENCHMARK_URL ?? 'http://localhost:3000/'},sessionId);
 await evaluate('new Promise(resolve => setTimeout(resolve, 1500))');


 await evaluate(`(async () => {
   const {ReactiveEditor}=await import('/src/reactive-editor/editor.ts');
   const {registerCoreViews}=await import('/src/rendering/register-core-views.ts');
   const {ReactiveTreeView}=await import('/src/rendering/reactive-tree-view.tsx');
   const source=await (await fetch('/src/rendering/reactive-tree-view.tsx')).text();
   const webPath=source.split('"').find(part=>part.startsWith('/node_modules/.vite/deps/solid-js_web.js'));
   const {render,createComponent}=await import(webPath);
   const host=document.createElement('div');host.className='workspace-demo';host.style.cssText='position:fixed;inset:0;padding:100px 250px;background:white;z-index:1000;overflow:auto';document.body.append(host);
   const editor=new ReactiveEditor({type:'document-block',children:['a','b','c','d'].map(id=>({id,type:'standoff-editor-block',text:'Paragraph '+id+' — select using the gutter handle.'}))});
   registerCoreViews(editor);const projection=editor.createView('selection-browser');
   const dispose=render(()=>createComponent(ReactiveTreeView,{editor,projection}),host);editor.installGateway(document);
   window.selectionCheck={editor,host,dispose};
 })()`);
 const point=async(id,handle=true)=>evaluate(`(() => {const r=window.selectionCheck.host.querySelector('[data-block-id="'+${JSON.stringify(id)}+'"]');const el=${handle} ? r.querySelector(':scope > [data-block-selection-handle]') : r;const b=el.getBoundingClientRect();return {x:b.left+b.width/2,y:b.top+b.height/2};})()`);
 const click=async(id,modifiers=0)=>{
   const p=await point(id);
   await send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1,modifiers},sessionId);
   await send('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',clickCount:1,modifiers},sessionId);
 };
 const ids=()=>evaluate('window.selectionCheck.editor.blockSelection.ids');
 const originalDoc=await evaluate('window.selectionCheck.editor.encodeDocument()');
 await click('a');assert.deepEqual(await ids(),['a']);
 await click('c',8);assert.deepEqual(await ids(),['a','b','c']);
 await click('b',4);assert.deepEqual(await ids(),['a','c']);
 assert.equal(await evaluate('window.selectionCheck.editor.overlays.overlays.length'),0);
 assert.deepEqual(await evaluate('window.selectionCheck.editor.encodeDocument()'),originalDoc);
 const handleLayout=await evaluate(`(() => {const root=window.selectionCheck.host.querySelector('[data-block-id="a"]');const h=root.querySelector('[data-block-selection-handle]'),r=h.getBoundingClientRect(),text=root.querySelector('.reactive-standoff-flow').getBoundingClientRect();return {outsideText:r.right<=text.left,visible:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===h,selected:root.classList.contains('block-is-selected')};})()`);
 assert.equal(handleLayout.outsideText,true);assert.equal(handleLayout.visible,true);assert.equal(handleLayout.selected,true);
 if(process.env.SCREENSHOT_PATH) { const shot=await send('Page.captureScreenshot',{format:'png'},sessionId);await writeFile(process.env.SCREENSHOT_PATH,Buffer.from(shot.data,'base64')); }
 // Exercise Chrome's native drag initiation, not just direct command invocation.
 await evaluate(`(() => {window.dragTrace=[];for(const type of ['dragstart','dragenter','dragover','drop','dragend']) document.addEventListener(type,e=>window.dragTrace.push({type,id:e.target.closest?.('[data-block-id]')?.dataset.blockId}),true);})()`);
 const from=await point('a'),to=await point('d',false);
 await send('Input.dispatchMouseEvent',{type:'mouseMoved',...from},sessionId);
 await send('Input.dispatchMouseEvent',{type:'mousePressed',...from,button:'left',clickCount:1},sessionId);
 await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:from.x+10,y:from.y+8,button:'left',buttons:1},sessionId);
 await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:to.x,y:to.y+5,button:'left',buttons:1},sessionId);
 await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:to.x+1,y:to.y+6,button:'left',buttons:1},sessionId);
 await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:to.x,y:to.y+5,button:'left',clickCount:1},sessionId);
 await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
 assert.equal(await evaluate('window.dragTrace.some(event=>event.type==="dragstart") && window.dragTrace.some(event=>event.type==="drop")'),true);
 assert.deepEqual(await evaluate('window.selectionCheck.editor.encodeDocument().children.map(b=>b.id)'),['b','d','a','c']);
 await evaluate('window.selectionCheck.editor.repository.undo()');
 assert.deepEqual(await evaluate('window.selectionCheck.editor.encodeDocument().children.map(b=>b.id)'),['a','b','c','d']);
 console.log(JSON.stringify({single:true,range:true,discontiguous:true,sessionOnly:true,handleLayout,nativeDragGroup:true,undo:true},null,2));
 await evaluate('window.selectionCheck.dispose();window.selectionCheck.editor.dispose();window.selectionCheck.host.remove()');
} finally {
  socket?.close();
  if (chrome.pid && chrome.exitCode === null && chrome.signalCode === null) {
    const exited = new Promise(resolve => chrome.once('exit', resolve));
    chrome.kill('SIGKILL');
    await exited;
  }
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
