// Run against an already-running Vite dev server (npm run dev).
// Uses an isolated Chrome profile and an in-memory fixture; never saves documents.
// Checks Ctrl+period, annotation preview/edit/delete/undo and caret restoration.
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
   const host=document.createElement('div'); host.className='workspace-demo';
   host.style.cssText='position:fixed;inset:0;display:block;padding:80px 260px;background:white;z-index:1000;overflow:auto';
   document.body.append(host);
   const editor=new ReactiveEditor({type:'document-block',children:[{id:'source',type:'standoff-editor-block',text:'one two three',standoffProperties:[{id:'a',type:'style/bold',start:0,end:2,metadata:{keep:true},future:'retained'},{type:'codex/entity-reference',start:1,end:4}],children:[]},{id:'other',type:'standoff-editor-block',text:'Other paragraph'}]});
   registerCoreViews(editor); const projection=editor.createView('margin-browser');
   const dispose=render(()=>createComponent(ReactiveTreeView,{editor,projection}),host);editor.installGateway(document);
   window.marginCheck={editor,projection,host,dispose,flow:host.querySelector('.reactive-standoff-flow')};
 })()`);

 await evaluate(`(() => { const f=window.marginCheck.flow; f.focus();const r=document.createRange();r.setStart(f,2);r.collapse(true);document.getSelection().removeAllRanges();document.getSelection().addRange(r); })()`);
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'.',code:'Period',modifiers:2,windowsVirtualKeyCode:190},sessionId);
 await send('Input.dispatchKeyEvent',{type:'keyUp',key:'.',code:'Period',modifiers:0},sessionId);
 await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
 const opened=await evaluate(`(() => { const p=document.querySelector('.reactive-annotation-monitor');const r=p.getBoundingClientRect();return {rows:p.querySelectorAll('.annotation-select').length,focused:document.activeElement===p,preview:!!document.querySelector('[data-decoration-key*="annotation-preview"]'),bounded:r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight}; })()`);
 assert.equal(opened.rows,2);assert.equal(opened.focused,true);assert.equal(opened.preview,true);assert.equal(opened.bounded,true);
 const layout=await evaluate(`(() => {
   const p=document.querySelector('.reactive-annotation-monitor');const r=p.getBoundingClientRect();
   const nav=p.querySelector('nav').getBoundingClientRect(),main=p.querySelector('.annotation-main').getBoundingClientRect(),settings=p.querySelector('.annotation-settings').getBoundingClientRect();
   const cell=window.marginCheck.flow.children[0].getClientRects()[0];
   return {horizontal:r.width>r.height,listRatio:nav.width/r.width,threeColumns:nav.right<=main.left&&main.right<=settings.left,
     anchored:Math.abs(r.left-Math.max(8,Math.min(cell.left-100,innerWidth-r.width-8)))<2&&Math.abs(r.top-(cell.bottom+21))<2,
     readonlyId:p.querySelector('input[readonly]').value,visible:p.contains(document.elementFromPoint(r.left+20,r.top+20))};
 })()`);
 assert.equal(layout.horizontal,true);assert.ok(layout.listRatio>=.20&&layout.listRatio<=.25);assert.equal(layout.threeColumns,true);assert.equal(layout.anchored,true);assert.equal(layout.readonlyId,'a');assert.equal(layout.visible,true);
 if(process.env.SCREENSHOT_PATH) { const shot=await send('Page.captureScreenshot',{format:'png'},sessionId);await writeFile(process.env.SCREENSHOT_PATH,Buffer.from(shot.data,'base64')); }
 const geometry=()=>evaluate(`(() => {const p=document.querySelector('.reactive-annotation-monitor'),r=p.getBoundingClientRect(),h=p.querySelector('.annotation-resize').getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,handleX:h.right-3,handleY:h.bottom-3};})()`);
 const drag=async(x,y,dx,dy)=>{
   await send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1},sessionId);
   await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:x+dx,y:y+dy,button:'left',buttons:1},sessionId);
   await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:x+dx,y:y+dy,button:'left',clickCount:1},sessionId);
   await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
 };
 const beforeDrag=await geometry();await drag(beforeDrag.x+100,beforeDrag.y+20,25,15);
 const afterDrag=await geometry();assert.ok(Math.abs(afterDrag.x-beforeDrag.x-25)<2);assert.ok(Math.abs(afterDrag.y-beforeDrag.y-15)<2);
 await drag(afterDrag.handleX,afterDrag.handleY,-80,-30);
 const afterResize=await geometry();assert.ok(Math.abs(afterResize.w-afterDrag.w+80)<2);assert.ok(Math.abs(afterResize.h-afterDrag.h+30)<2);
 await evaluate('document.querySelector(".reactive-annotation-monitor").focus()');
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight',modifiers:8,windowsVirtualKeyCode:39},sessionId);
 await send('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowRight',code:'ArrowRight',modifiers:0},sessionId);
 const property=()=>evaluate('window.marginCheck.editor.encodeDocument().children[0].standoffProperties[0]');
 assert.equal((await property()).start,1);
 await evaluate(`(() => {const p=document.querySelector('.reactive-annotation-monitor');const a=p.querySelectorAll('textarea')[1];a.value='{"certainty":0.9}';a.dispatchEvent(new InputEvent('input',{bubbles:true}));p.querySelector('form').requestSubmit();})()`);
 assert.equal((await property()).attributes.certainty,.9);assert.equal((await property()).metadata.keep,true);assert.equal((await property()).future,'retained');
 await evaluate('document.querySelector(".reactive-annotation-monitor").focus()');
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'d',code:'KeyD',windowsVirtualKeyCode:68},sessionId);
 await send('Input.dispatchKeyEvent',{type:'keyUp',key:'d',code:'KeyD',windowsVirtualKeyCode:68},sessionId);
 assert.equal((await property()).isDeleted,true);
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'z',code:'KeyZ',modifiers:2,windowsVirtualKeyCode:90},sessionId);
 await send('Input.dispatchKeyEvent',{type:'keyUp',key:'z',code:'KeyZ',modifiers:0},sessionId);
 assert.equal(!!(await property()).isDeleted,false);
 assert.equal(await evaluate('document.activeElement===window.marginCheck.flow'),true);
 assert.equal(await evaluate('!!document.querySelector(".reactive-annotation-monitor")'),false);
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:700,deviceScaleFactor:1,mobile:false},sessionId);
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'.',code:'Period',modifiers:2,windowsVirtualKeyCode:190},sessionId);
 await send('Input.dispatchKeyEvent',{type:'keyUp',key:'.',code:'Period',modifiers:0},sessionId);
 await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
 const narrow=await evaluate(`(() => {const p=document.querySelector('.reactive-annotation-monitor');const r=p.getBoundingClientRect();return {bounded:r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight,noHorizontalOverflow:p.scrollWidth<=p.clientWidth+1};})()`);
 assert.equal(narrow.bounded,true);assert.equal(narrow.noHorizontalOverflow,true);
 console.log(JSON.stringify({opened,layout,narrow,drag:true,resize:true,shift:true,attributes:true,deleteUndo:true,focusRestored:true},null,2));
 await evaluate('window.marginCheck.dispose();window.marginCheck.editor.dispose();window.marginCheck.host.remove()');
} finally {
  socket?.close();
  if (chrome.pid && chrome.exitCode === null && chrome.signalCode === null) {
    const exited = new Promise(resolve => chrome.once('exit', resolve));
    chrome.kill('SIGKILL');
    await exited;
  }
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
