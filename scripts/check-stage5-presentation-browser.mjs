// Stage 5 per-window presentation and physical-removal qualification.
// Node 22+, CHROME_BIN and BENCHMARK_URL supported. Isolated Chrome profile,
// in-memory fixture, no document saves. Also runs against the Stage 4 baseline.
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import path from 'node:path';
const profile = await mkdtemp(path.join(tmpdir(), 'speedy-presentation-check-'));
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


 const removed = process.env.COMPACT_REMOVED === '1';
 const checks = [], geometry = [];
 const check = (name, actual, expected) => { assert.deepEqual(actual, expected, name); checks.push(name); };
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false},sessionId);
 await send('Page.navigate',{url:process.env.BENCHMARK_URL ?? 'http://127.0.0.1:5186/'},sessionId);
 await evaluate('new Promise(resolve => setTimeout(resolve, 1400))');
 const shell = await evaluate(`(()=>{const main=document.querySelector('.workspace-demo'),win=document.querySelector('.workspace-demo__window'),bar=document.querySelector('.workspace-demo__windowbar'),style=document.querySelector('.document-style-bar'),footer=document.querySelector('.document-status-bar');return {mainPadding:main&&getComputedStyle(main).padding,window:win&&[win.getBoundingClientRect().width,win.getBoundingClientRect().height,win.getBoundingClientRect().top],barHeight:bar?.getBoundingClientRect().height,styleHeight:style?.getBoundingClientRect().height,footerHeight:footer?.getBoundingClientRect().height}})()`);

 await evaluate(`(async () => {
   const {ReactiveEditor}=await import('/src/reactive-editor/editor.ts');
   const {registerApplicationViews}=await import('/src/application/features.ts');
   const {ReactiveTreeView}=await import('/src/rendering/reactive-tree-view.tsx');
   const source=await (await fetch('/src/rendering/reactive-tree-view.tsx')).text();
   const {render,createComponent}=await import(source.split('"').find(part=>part.includes('/solid-js_web.js')));
   window.makePresentationFixture = width => {
     window.presentationCheck?.dispose();window.presentationCheck?.editor.dispose();
     const host=document.createElement('div');host.className='workspace-demo';host.style.cssText='position:relative;padding:0';document.body.replaceChildren(host);
     const editor=new ReactiveEditor({id:'win',type:'document-window-block',metadata:{size:{w:width,h:360},position:{x:12,y:12},state:'normal',unknownStage5:{keep:true}},children:[{type:'document-block',children:[{id:'page',type:'page-block',children:[{id:'text',type:'standoff-editor-block',text:'Ordinary editing remains available.'},{id:'source',type:'standoff-editor-block',text:'Margin source',relation:{leftMargin:{id:'margin',type:'left-margin-block',children:[{id:'note',type:'plain-text-block',text:'Margin note selection'}]}}}]}]}]});
     registerApplicationViews(editor);const projection=editor.createView('stage5-browser');
     const dispose=render(()=>createComponent(ReactiveTreeView,{editor,projection}),host);editor.installGateway(document);
     const node=id=>Object.values(projection.state.nodes).find(n=>n.payload.id===id);
     const root=host.querySelector('.reactive-window');
     window.presentationCheck={editor,projection,host,dispose,node,root,frame:()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(r,40))))};
   };
 })()`);
 const click = async selector => {
   const point=await evaluate(`(()=>{const element=presentationCheck.host.querySelector(${JSON.stringify(selector)});if(!element)throw new Error('Missing '+${JSON.stringify(selector)});element.scrollIntoView({block:'nearest'});const r=element.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;if(!element.contains(document.elementFromPoint(x,y)))throw new Error('Obscured '+${JSON.stringify(selector)});return{x,y}})()`);
   await send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',buttons:1,clickCount:1},sessionId);
   await send('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',buttons:0,clickCount:1},sessionId);
   await evaluate('presentationCheck.frame()');
 };
 const state = () => evaluate(`(()=>{const p=presentationCheck,r=p.root.getBoundingClientRect(),toggle=p.root.querySelector('[aria-label="Compact document"]');return{width:r.width,stored:p.node('win').payload.metadata.size.w,pressed:toggle?.getAttribute('aria-pressed')??null,collapsed:p.root.classList.contains('reactive-window--margins-collapsed'),indicators:p.root.querySelectorAll('.document-margin-indicator').length,revision:p.editor.repository.state.revision,unknown:p.node('win').payload.metadata.unknownStage5.keep}})()`);
 for (const scenario of [{name:'1440 laptop',width:1440,height:900,window:1000,scale:1},{name:'1280 laptop',width:1280,height:800,window:840,scale:1},{name:'200% effective CSS viewport',width:720,height:450,window:640,scale:2}]) {
   await send('Emulation.setDeviceMetricsOverride',{width:scenario.width,height:scenario.height,deviceScaleFactor:scenario.scale,mobile:false},sessionId);
   await evaluate(`makePresentationFixture(${scenario.window});presentationCheck.frame()`);
   const initial=await state();
   check(scenario.name+' initial policy',initial.pressed,removed?null:'false');
   check(scenario.name+' automatic collapse',initial.collapsed,scenario.window<=730);
   await evaluate(`(()=>{const p=presentationCheck;p.before=JSON.stringify(p.editor.encodeDocument());p.cell=p.root.querySelector('.reactive-standoff-flow').firstChild;})()`);
   if (!removed) {
     if (!initial.collapsed) await evaluate(`(()=>{const p=presentationCheck,m=p.editor.mounts.get(p.node('note').key);m.focus();m.restoreSelection?.({start:2,end:8,direction:'forward'});m.focusElement.setSelectionRange(2,8,'forward')})()`);
     await click('[aria-label="Compact document"]');
     const compact=await state();
     check(scenario.name+' explicit state',compact.pressed,'true');
     check(scenario.name+' compact margins',compact.collapsed,true);
     check(scenario.name+' expanded storage',compact.stored,scenario.window);
     assert.ok(compact.width<=initial.width);if(!initial.collapsed)assert.ok(compact.width<initial.width);
     if (!initial.collapsed) check(scenario.name+' focused margin selection',await evaluate(`(()=>{const p=presentationCheck,m=p.editor.mounts.get(p.node('note').key),e=m.focusElement;return[!!e.closest('.reactive-window__margin-drawer'),document.activeElement===e,e.selectionStart,e.selectionEnd]})()`),[true,true,2,8]);
     if(await evaluate(`!!presentationCheck.root.querySelector('[aria-label="Close margins"]')`)) await click('[aria-label="Close margins"]');
     await click('.document-margin-indicator');
     check(scenario.name+' drawer focus',await evaluate(`document.activeElement===presentationCheck.root.querySelector('.reactive-window__margin-drawer')`),true);
     await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27},sessionId);
     await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27},sessionId);await evaluate('presentationCheck.frame()');
     check(scenario.name+' drawer Escape focus',await evaluate(`document.activeElement===presentationCheck.root.querySelector('.document-style-bar__margins')`),true);
     await click('[aria-label="Compact document"]');
     const restored=await state();check(scenario.name+' width restored',restored.width,initial.width);check(scenario.name+' automatic cause survives toggle',restored.collapsed,initial.collapsed);
     geometry.push({scenario:scenario.name,initial,compact,restored});
   }
   check(scenario.name+' presentation preserves authored tree and Cells',await evaluate(`JSON.stringify(presentationCheck.editor.encodeDocument())===presentationCheck.before&&presentationCheck.cell===presentationCheck.root.querySelector('.reactive-standoff-flow').firstChild`),true);
   // Narrow through the normal core resize handle; this also runs with the module physically absent.
   await evaluate(`(()=>{const p=presentationCheck,handle=p.root.querySelector('.reactive-window__resize');handle.focus();})()`);
   for(let i=0;i<Math.ceil((scenario.window-640)/10);i++)await send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowLeft',code:'ArrowLeft',windowsVirtualKeyCode:37},sessionId);
   await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13},sessionId);await evaluate('presentationCheck.frame()');
   check(scenario.name+' resized automatic margins',(await state()).collapsed,true);
   await click('.document-style-bar__margins');
   check(scenario.name+' generic drawer access',await evaluate(`!!presentationCheck.root.querySelector('[data-margin-drawer-item]')`),true);
   await click('[aria-label="Close margins"]');
   await evaluate(`(()=>{const p=presentationCheck,m=p.editor.mounts.get(p.node('text').key);m.focus();m.restoreInlineSelection({anchor:0,head:0});p.editor.focus.adopt(p.node('text').key)})()`);
   await send('Input.insertText',{text:'Edited '},sessionId);
   check(scenario.name+' normal editing',await evaluate(`presentationCheck.editor.encodeDocument().children[0].children[0].children[0].text.startsWith('Edited ')`),true);
   check(scenario.name+' unknown authored metadata',(await state()).unknown,true);
   await click('[aria-label="Minimize window"]');
   await click('[data-window-icon]');
   check(scenario.name+' restored document focus',await evaluate(`presentationCheck.editor.focus.state.focusedKey===presentationCheck.node('text').key`),true);
 }
 await evaluate('presentationCheck.dispose();presentationCheck.editor.dispose()');
 console.log(JSON.stringify({browser:await send('Browser.getVersion'),removed,checks,shell,geometry},null,2));
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
