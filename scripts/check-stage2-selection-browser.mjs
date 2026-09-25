// Stage 2/3 real-browser selection qualification against a running Vite server.
// Node 22+, CHROME_BIN and BENCHMARK_URL supported. Isolated Chrome profile,
// in-memory fixture, no document saves. Also runs against the Stage 2 baseline.
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
 await send('Network.enable',{},sessionId);
 socket.addEventListener('message', event => { const msg=JSON.parse(event.data); if(msg.method==='Network.loadingFailed') console.error(JSON.stringify(msg.params)); });
 const evaluate = async expression => {
   const result = await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);
   if(result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
   return result.result.value;
 };

 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false},sessionId);
 await send('Page.navigate',{url:process.env.BENCHMARK_URL ?? 'http://localhost:3000/'},sessionId);
 await evaluate('new Promise(resolve => setTimeout(resolve, 1500))');
 const checks = [];
 const check = (name, actual, expected) => { assert.deepEqual(actual, expected, name); checks.push(name); };
 await evaluate(`(async () => {
   const {ReactiveEditor} = await import('/src/reactive-editor/editor.ts');
   const {registerApplicationViews} = await import('/src/application/features.ts');
   const {ReactiveTreeView} = await import('/src/rendering/reactive-tree-view.tsx');
   const source = await (await fetch('/src/rendering/reactive-tree-view.tsx')).text();
   const webPath = source.split('"').find(part => part.includes('/solid-js_web.js'));
   const {render, createComponent} = await import(webPath);
   const editor = new ReactiveEditor({type:'document-block',children:[
     {id:'a',type:'standoff-editor-block',text:'alpha beta'}, {id:'b',type:'standoff-editor-block',text:'gamma delta'}]});
   registerApplicationViews(editor); const projection = editor.createView('selection-qualification');
   const host = document.body.appendChild(document.createElement('div'));
   host.style.cssText='position:fixed;inset:0;background:white;z-index:999999;padding:60px;font-size:24px';
   const dispose = render(() => createComponent(ReactiveTreeView,{editor,projection}),host); editor.installGateway(document);
   const node = id => Object.values(projection.state.nodes).find(n=>n.payload.id===id);
   const flow = id => editor.mounts.get(node(id).key).focusElement;
   const caret = (id,index) => { flow(id).focus(); editor.mounts.get(node(id).key).restoreInlineSelection({anchor:index,head:index}); };
   const point = (id,index) => { const cell=flow(id).children[index]; const rect=cell.getBoundingClientRect(); return {x:rect.left+1,y:rect.top+rect.height/2}; };
   window.qualify={editor,projection,host,dispose,node,flow,caret,point};
   await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
 })()`);
 const key = (key, code, modifiers=0, type='keyDown', autoRepeat=false) => send('Input.dispatchKeyEvent',{type,key,code,modifiers,autoRepeat,windowsVirtualKeyCode:({Control:17,Shift:16,ArrowRight:39,Escape:27,Backspace:8,Delete:46})[key]},sessionId);
 const state = () => evaluate('(qualify.editor.currentTextOperation.annotationOperation()?.annotationTargets() ?? []).map(r=>[qualify.editor.node(r.nodeKey).payload.id,r.start,r.end])');
 const drag = async (from, to, control=true, releaseEarly=false) => {
   const start=await evaluate('qualify.point('+JSON.stringify(from[0])+','+from[1]+')');
   const end=await evaluate('qualify.point('+JSON.stringify(to[0])+','+to[1]+')');
   if(control) await key('Control','ControlLeft',2);
   await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,...start,modifiers:control?2:0},sessionId);
   if(releaseEarly) await key('Control','ControlLeft',0,'keyUp');
   await send('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,...end,modifiers:control&&!releaseEarly?2:0},sessionId);
   await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,clickCount:1,...end,modifiers:control&&!releaseEarly?2:0},sessionId);
   if(control&&!releaseEarly) await key('Control','ControlLeft',0,'keyUp');
 };
 // Cross selection is off initially: verify local native/core selection still works.
 await evaluate('qualify.editor.crossText.enable(false); qualify.caret("a",0)');
 await drag(['a',0],['a',4],false); check('ordinary native selection is not grouped',await state(),[]);
 check('native selection remains nonempty',await evaluate('document.getSelection().toString().length>0'),true);
 await drag(['a',0],['a',4],true,true); check('early Control release does not group',await state(),[]);
 await drag(['a',0],['a',4]); check('Control pointer selection with cross mode off',await state(),[['a',0,4]]);
 check('pointer capture released before completion',await evaluate('qualify.host.querySelectorAll("*").length>0 && !qualify.editor.selectionGestures.selecting("pointer")'),true);
 await key('Escape','Escape'); check('Escape clears membership',await state(),[]);
 await evaluate('qualify.editor.crossText.enable(true)');
 await drag(['a',2],['b',4]); check('cross-Block pointer range',await state(),[['a',2,10],['b',0,4]]);
 await key('Escape','Escape');
 await evaluate('qualify.caret("a",8)');
 await key('Control','ControlLeft',2); await key('Shift','ShiftLeft',10);
 for(let i=0;i<5;i++) await key('ArrowRight','ArrowRight',10,'keyDown',i>0);
 await key('Shift','ShiftLeft',2,'keyUp'); await key('Control','ControlLeft',0,'keyUp');
 check('keyboard cross-Block completion on modifier release',await state(),[['a',8,10],['b',0,2]]);
 await evaluate('qualify.editor.currentTextOperation.annotationOperation().apply("style/show-hide")');
 check('Show/Hide retains membership',await evaluate('qualify.editor.showHide.selectionActive()'),true);
 await key('Escape','Escape'); check('Escape reveals and forgets Show/Hide',await evaluate('qualify.editor.showHide.selectionActive()'),false);
 await drag(['a',0],['a',4]);
 const point=await evaluate('qualify.point("a",1)');
 await key('Control','ControlLeft',2);
 await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,...point,modifiers:2},sessionId);
 await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,clickCount:1,...point,modifiers:2},sessionId);
 await key('Control','ControlLeft',0,'keyUp'); check('Control-click removes its range',await state(),[]);
 await drag(['a',0],['a',4]);
 await evaluate(`const field=document.createElement('input');field.id='native-test';qualify.host.append(field);field.value='native';field.focus();field.setSelectionRange(6,6)`);
 await key('Backspace','Backspace'); await key('Backspace','Backspace',0,'keyUp');
 check('native form Backspace retains grouped text',await state(),[['a',0,4]]);
 check('native form receives Backspace',await evaluate('document.getElementById("native-test").value'),'nativ');
 await evaluate(`const modal=document.createElement('div');modal.setAttribute('role','dialog');modal.tabIndex=0;qualify.host.append(modal);modal.focus()`);
 await key('Escape','Escape'); check('dialog Escape does not cancel group',await state(),[['a',0,4]]);
 await evaluate('qualify.editor.currentTextOperation.active()?.cancel();qualify.caret("a",0)');
 await drag(['a',0],['a',4]);

 await key('Delete','Delete'); await key('Delete','Delete',0,'keyDown',true); await key('Delete','Delete',0,'keyUp');
 check('Delete and repeat remove only membership once',await evaluate('qualify.editor.encodeDocument().children.map(b=>b.text)'),['a beta','gamma delta']);
 await evaluate('qualify.editor.repository.undo()'); check('group deletion undoes atomically',await evaluate('qualify.editor.encodeDocument().children.map(b=>b.text)'),['alpha beta','gamma delta']);
 await drag(['a',0],['a',4]);
 await evaluate('qualify.caret("a",4)');
 await send('Input.imeSetComposition',{text:'語',selectionStart:1,selectionEnd:1},sessionId);
 await key('Backspace','Backspace'); await key('Backspace','Backspace',0,'keyUp');
 check('IME does not delete group',await evaluate('qualify.editor.encodeDocument().children[0].text'),'alpha beta');
 await send('Input.imeSetComposition',{text:'',selectionStart:0,selectionEnd:0},sessionId);
 const observations = { imeCancelledMountComposing: await evaluate('!!qualify.editor.mounts.get(qualify.node("a").key).composing') };
 await evaluate('qualify.dispose();qualify.editor.dispose();qualify.host.remove()');
 console.log(JSON.stringify({browser:await send('Browser.getVersion'),checks,observations},null,2));
} finally {
  // Finish the CDP close handshake before killing Chrome. Otherwise Node's
  // WebSocket can retain a closing socket after all assertions have finished.
  if (socket && socket.readyState !== WebSocket.CLOSED) {
    const closed = new Promise(resolve => socket.addEventListener('close', resolve, { once: true }));
    socket.close();
    await Promise.race([closed, new Promise(resolve => setTimeout(resolve, 1000))]);
  }
  if (chrome.pid && chrome.exitCode === null && chrome.signalCode === null) {
    const exited = new Promise(resolve => chrome.once('exit', resolve));
    chrome.kill('SIGKILL');
    await exited;
  }
  await rm(profile, { recursive: true, force: true });
}
