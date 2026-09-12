// Run against an already-running Vite dev server (npm run dev).
// Uses an isolated Chrome profile and an in-memory fixture; never saves documents.
// Checks every style button and paragraph indentation using real Chrome clicks.
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
   const host=document.createElement('div');host.style.cssText='position:fixed;inset:0;background:white;z-index:1000';document.body.append(host);
   const editor=new ReactiveEditor({type:'document-window-block',children:[{type:'document-block',children:[{id:'p',type:'standoff-editor-block',text:'one 😀 two',standoffProperties:[{id:'entity',type:'codex/entity-reference',start:0,end:2,value:'id'}]}]}]});
   registerCoreViews(editor);const projection=editor.createView('style-browser');
   const dispose=render(()=>createComponent(ReactiveTreeView,{editor,projection}),host);editor.installGateway(document);
   window.styleCheck={editor,host,dispose,flow:host.querySelector('.reactive-standoff-flow')};
 })()`);
 const select=()=>evaluate(`(() => {const f=window.styleCheck.flow;f.focus();const r=document.createRange();r.setStart(f,0);r.setEnd(f,5);document.getSelection().removeAllRanges();document.getSelection().addRange(r);document.dispatchEvent(new Event('selectionchange'));})()`);
 const click=async title=>{
   const p=await evaluate(`(() => {const b=window.styleCheck.host.querySelector('button[title="'+${JSON.stringify(title)}+'"]');const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
   await send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1},sessionId);
   await send('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',clickCount:1},sessionId);
 };
 const labels=await evaluate(`[...window.styleCheck.host.querySelectorAll('button[data-annotation-type]')].map(b=>b.title)`);
 assert.equal(labels.length,17);
 for(const label of labels){await select();await click(label);}
 const properties=await evaluate('window.styleCheck.editor.encodeDocument().children[0].children[0].standoffProperties');
 assert.equal(properties.length,18);
 assert.ok(properties.slice(1).every(p=>p.start===0&&p.end===4&&p.id));
 await select();await click('Increase indent');await click('Increase indent');await click('Increase indent');
 assert.equal(await evaluate('getComputedStyle(window.styleCheck.flow.closest(".reactive-standoff-block")).marginLeft'),'60px');
 await click('Decrease indent');
 assert.equal(await evaluate('getComputedStyle(window.styleCheck.flow.closest(".reactive-standoff-block")).marginLeft'),'40px');
 await evaluate('window.styleCheck.editor.repository.undo()');
 assert.equal(await evaluate('getComputedStyle(window.styleCheck.flow.closest(".reactive-standoff-block")).marginLeft'),'60px');
 console.log(JSON.stringify({styleButtons:17,selectedRanges:true,paragraphIndent:true,undo:true}));
 await evaluate('window.styleCheck.dispose();window.styleCheck.editor.dispose();window.styleCheck.host.remove()');
} finally {
  socket?.close();
  if (chrome.pid && chrome.exitCode === null && chrome.signalCode === null) {
    const exited = new Promise(resolve => chrome.once('exit', resolve));
    chrome.kill('SIGKILL');
    await exited;
  }
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
