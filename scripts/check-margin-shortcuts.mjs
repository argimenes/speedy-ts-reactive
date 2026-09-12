// Run against an already-running Vite dev server (npm run dev).
// Uses an isolated Chrome profile and an in-memory fixture; never saves documents.
// Checks real Ctrl+Shift arrow input, gutter geometry, focus and note reuse.
// Optional: CHROME_BIN and BENCHMARK_URL. No document-store saves.
// Requires Node 22+ (WebSocket).
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
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
   host.style.cssText='position:fixed;inset:0;display:block;padding:80px 260px;background:white;z-index:99999;overflow:auto';
   document.body.append(host);
   const editor=new ReactiveEditor({type:'document-block',children:[{id:'source',type:'standoff-editor-block',text:'Source paragraph',children:[]},{id:'other',type:'standoff-editor-block',text:'Other paragraph'}]});
   registerCoreViews(editor); const projection=editor.createView('margin-browser');
   const dispose=render(()=>createComponent(ReactiveTreeView,{editor,projection}),host);editor.installGateway(document);
   window.marginCheck={editor,projection,host,dispose,flow:host.querySelector('.reactive-standoff-flow')};
 })()`);
 const results=[];
 for(const side of ['left','right']) {
   await evaluate('window.marginCheck.flow.focus();window.marginSide='+JSON.stringify(side));
   const key=side==='left'?'ArrowLeft':'ArrowRight';
   await send('Input.dispatchKeyEvent',{type:'keyDown',key,code:key,modifiers:10,windowsVirtualKeyCode:side==='left'?37:39},sessionId);
   await send('Input.dispatchKeyEvent',{type:'keyUp',key,code:key,modifiers:0},sessionId);
   await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
   const result=await evaluate(`(() => {
     const {host,editor}=window.marginCheck, side=window.marginSide;
     const source=host.querySelector('[data-block-id="source"]');
     const margin=source.querySelector('[data-relation-name="'+side+'Margin"]');
     const text=margin.querySelector('.reactive-standoff-flow');
     const m=margin.getBoundingClientRect(), s=source.getBoundingClientRect();
     return {side,focused:document.activeElement===text,caret:document.getSelection().anchorOffset,
       alignment:getComputedStyle(text).textAlign,fontSize:getComputedStyle(text).fontSize,
       inGutter:side==='left'?m.right<=s.left:m.left>=s.right,atSource:Math.abs(m.top-s.top)<2,
       otherUntouched:!host.querySelector('[data-block-id="other"] [data-relation-name]')};
   })()`);
   assert.equal(result.focused,true);assert.equal(result.caret,0);assert.equal(result.alignment,side);assert.equal(result.fontSize,'12px');assert.equal(result.inGutter,true);assert.equal(result.atSource,true);assert.equal(result.otherUntouched,true);
   await send('Input.insertText',{text:side+' note'},sessionId);
   const revision=await evaluate('window.marginCheck.editor.repository.state.revision');
   await evaluate('window.marginCheck.flow.focus()');
   await send('Input.dispatchKeyEvent',{type:'keyDown',key,code:key,modifiers:10,windowsVirtualKeyCode:side==='left'?37:39},sessionId);
   await send('Input.dispatchKeyEvent',{type:'keyUp',key,code:key,modifiers:0},sessionId);
   assert.equal(await evaluate('document.activeElement.textContent'),side+' note');
   assert.equal(await evaluate('window.marginCheck.editor.repository.state.revision'),revision);
   results.push(result);
 }
 console.log(JSON.stringify(results,null,2));
 await evaluate('window.marginCheck.dispose();window.marginCheck.editor.dispose();window.marginCheck.host.remove()');
} finally {
  socket?.close();
  if (chrome.pid && chrome.exitCode === null && chrome.signalCode === null) {
    const exited = new Promise(resolve => chrome.once('exit', resolve));
    chrome.kill('SIGKILL');
    await exited;
  }
  await rm(profile, { recursive: true, force: true });
}
