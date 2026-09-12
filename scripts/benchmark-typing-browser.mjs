// Run against an already-running Vite dev server (npm run dev).
// Uses an isolated Chrome profile and an in-memory fixture; never saves documents.
// Optional: CHROME_BIN, BENCHMARK_URL and BENCHMARK_DOCUMENT_URL (read-only API
// loadDocumentJson URL). A supplied document benchmarks its longest paragraph.
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
 const result = await evaluate(`(async () => {
   const {ReactiveEditor} = await import('/src/reactive-editor/editor.ts');
   const {registerCoreViews} = await import('/src/rendering/register-core-views.ts');
   const {ReactiveTreeView} = await import('/src/rendering/reactive-tree-view.tsx');
   const source = await (await fetch('/src/rendering/reactive-tree-view.tsx')).text();
   const webPath = source.split('"').find(part => part.startsWith('/node_modules/.vite/deps/solid-js_web.js'));
   const {render, createComponent} = await import(webPath);
   const host = document.createElement('div'); document.body.append(host);
   host.style.cssText = 'position:fixed;inset:0;overflow:auto;background:white;z-index:99999';
   const documentUrl = ${JSON.stringify(process.env.BENCHMARK_DOCUMENT_URL ?? "")};
   const dto = documentUrl ? (await (await fetch(documentUrl)).json()).Data.document : {type:'document-block',children:Array.from({length:250},(_,i)=>({id:'bench-'+i,type:'standoff-editor-block',text:'x'.repeat(100),standoffProperties:[{type:'style/bold',start:40,end:60}]}))};
   const editor = new ReactiveEditor(dto);
   registerCoreViews(editor);
   const projection = editor.createView('browser-performance');
   const dispose = render(() => createComponent(ReactiveTreeView,{editor,projection}), host);
   editor.installGateway(document);
   await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
   const flows = host.querySelectorAll('[contenteditable=true]');
   const flow=documentUrl ? [...flows].sort((a,b)=>b.textContent.length-a.textContent.length)[0] : flows[0];
   const unrelated=[...flows].find(f=>f!==flow), originalCell=unrelated.firstChild;
   flow.focus();
   const selection = document.getSelection();
   const caret = index => { const r=document.createRange(); r.setStart(flow,index);r.collapse(true);selection.removeAllRanges();selection.addRange(r); };
   const midpoint=documentUrl ? Math.floor(flow.childNodes.length/2) : 50;
   caret(midpoint);
   const samples=[];let snapshots=0; const snapshot=editor.repository.snapshot.bind(editor.repository);
   editor.repository.snapshot=()=>{snapshots++;return snapshot();};
   const before=flow.textContent;
   for(let i=0;i<20;i++){
     let start=performance.now();
     flow.dispatchEvent(new InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType:'insertText',data:'a'}));
     samples.push(performance.now()-start);
     await Promise.resolve();
     start=performance.now();
     flow.dispatchEvent(new InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType:'deleteContentBackward'}));
     samples.push(performance.now()-start);
     await new Promise(resolve=>requestAnimationFrame(resolve));
   }
   const restored=flow.textContent===before;
   window.typingBench={editor,projection,host,flow,dispose,caret,midpoint,before,originalCell,unrelated};
   samples.sort((a,b)=>a-b);
   return {characters:[...flows].reduce((n,f)=>n+[...f.textContent].length,0),paragraphCharacters:[...before].length,paragraphs:flows.length,edits:samples.length,meanMs:samples.reduce((a,b)=>a+b)/samples.length,medianMs:samples[20],p95Ms:samples[38],maxMs:samples[39],snapshots,restored,unrelatedCellStable:unrelated.firstChild===originalCell};
 })()`);
 console.log(JSON.stringify(result,null,2)); assert.equal(result.restored,true);assert.equal(result.snapshots,0);assert.equal(result.unrelatedCellStable,true);
 const before = await evaluate('window.typingBench.before');
 const midpoint = await evaluate('window.typingBench.midpoint');
 const inserted = [...before].slice(0,midpoint).join('')+'Q'+[...before].slice(midpoint).join('');
 await send('Input.insertText',{text:'Q'},sessionId);
 assert.equal(await evaluate('window.typingBench.flow.textContent'), inserted);
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8},sessionId);
 await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8},sessionId);
 assert.equal(await evaluate('window.typingBench.flow.textContent'), before);
 await evaluate('window.typingBench.editor.repository.undo()');
 assert.equal(await evaluate('window.typingBench.flow.textContent'), inserted);
 await evaluate('window.typingBench.editor.repository.redo()');
 assert.equal(await evaluate('window.typingBench.flow.textContent'), before);
 console.log('Real Chrome insertText, Backspace, undo and redo: passed');
 const split = await evaluate(`(async () => {
   const {editor,host,flow,caret,midpoint,before,unrelated,originalCell}=window.typingBench;
   caret(midpoint); let snapshots=0;
   const original=editor.repository.snapshot.bind(editor.repository);
   editor.repository.snapshot=()=>{snapshots++;return original();};
   const count=host.querySelectorAll('[contenteditable=true]').length;
   const start=performance.now();
   flow.dispatchEvent(new InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType:'insertParagraph'}));
   const splitMs=performance.now()-start;
   await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
   const frameMs=performance.now()-start;
   const splitSnapshots=snapshots;
   const added=host.querySelectorAll('[contenteditable=true]').length===count+1;
   const focusedRight=document.activeElement?.textContent===[...before].slice(midpoint).join('');
   const undoStart=performance.now(); editor.repository.undo(); const undoMs=performance.now()-undoStart;
   const restored=flow.textContent===before;
   return {splitMs,frameMs,undoMs,splitSnapshots,added,focusedRight,restored,unrelatedCellStable:unrelated.firstChild===originalCell};
 })()`);
 console.log(JSON.stringify({split},null,2));
 assert.equal(split.added,true); assert.equal(split.focusedRight,true); assert.equal(split.restored,true); assert.equal(split.unrelatedCellStable,true);
 await evaluate('window.typingBench.flow.focus(); window.typingBench.caret(window.typingBench.midpoint)');
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13},sessionId);
 await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13},sessionId);
 assert.equal(await evaluate('document.activeElement.textContent'), [...before].slice(midpoint).join(''));
 await evaluate('window.typingBench.editor.repository.undo()');
 assert.equal(await evaluate('window.typingBench.flow.textContent'), before);
 console.log('Real Chrome Enter and split undo: passed');
 const boundaries = await evaluate(`(async () => {
   const {editor,host,flow,caret,before,unrelated,originalCell}=window.typingBench;
   const results=[];
   for (const position of ['start','end','empty']) {
     flow.focus(); caret(position==='start' ? 0 : flow.childNodes.length);
     let target=flow;
     if(position==='empty') {
       flow.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
       await Promise.resolve(); target=document.activeElement;
     }
     const count=host.querySelectorAll('[contenteditable=true]').length;
     let snapshots=0; const original=editor.repository.snapshot.bind(editor.repository);
     editor.repository.snapshot=()=>{snapshots++;return original();};
     const start=performance.now();
     target.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
     const handlerMs=performance.now()-start;
     await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
     const frameMs=performance.now()-start;
     const added=host.querySelectorAll('[contenteditable=true]').length===count+1;
     const focusCorrect=position==='end' ? document.activeElement!==flow && document.activeElement.textContent==='' : document.activeElement===target;
     const editSnapshots=snapshots;
     const undoStart=performance.now(); editor.repository.undo(); const undoMs=performance.now()-undoStart;
     editor.repository.snapshot=original;
     if(position==='empty') editor.repository.undo();
     results.push({position,handlerMs,frameMs,undoMs,snapshots:editSnapshots,added,focusCorrect,restored:flow.textContent===before,unrelatedCellStable:unrelated.firstChild===originalCell});
   }
   return results;
 })()`);
 console.log(JSON.stringify({boundaries},null,2));
 for (const result of boundaries) { assert.equal(result.added,true); assert.equal(result.focusCorrect,true); assert.equal(result.restored,true); assert.equal(result.unrelatedCellStable,true); }
 await evaluate('window.typingBench.dispose();window.typingBench.editor.dispose();window.typingBench.host.remove()');
} finally {
  socket?.close();
  if (chrome.pid && chrome.exitCode === null && chrome.signalCode === null) {
    const exited = new Promise(resolve => chrome.once('exit', resolve));
    chrome.kill('SIGKILL');
    await exited;
  }
  await rm(profile, { recursive: true, force: true });
}
