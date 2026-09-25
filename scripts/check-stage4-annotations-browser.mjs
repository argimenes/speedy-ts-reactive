// Stage 4 measured-effect, panel and optional-feature qualification.
// Node 22+, CHROME_BIN and BENCHMARK_URL supported. Isolated Chrome profile,
// in-memory fixture, no document saves. Also runs against the Stage 3 baseline.
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

 const removed = process.env.ENTITY_REMOVED === '1';
 await evaluate(`(async () => {
   const {ReactiveEditor} = await import('/src/reactive-editor/editor.ts');
   const {registerApplicationViews} = await import('/src/application/features.ts');
   const {ReactiveTreeView} = await import('/src/rendering/reactive-tree-view.tsx');
   const source = await (await fetch('/src/rendering/reactive-tree-view.tsx')).text();
   const webPath = source.split('"').find(part => part.includes('/solid-js_web.js'));
   const {render, createComponent} = await import(webPath);
   const NativeObserver = window.ResizeObserver; let observers = 0;
   window.ResizeObserver = class extends NativeObserver { constructor(callback) { super(callback); observers++; } };
   const text = 'Blake wrote about art and colour. '.repeat(12);
   const editor = new ReactiveEditor({type:'document-block',children:[
     {id:'a',type:'standoff-editor-block',text,standoffProperties:[{id:'entity',type:'codex/entity-reference',start:0,end:100,value:'blake',metadata:{entityName:'Blake'},future:{keep:true}},{id:'rainbow',type:'style/rainbow',start:0,end:100}]},
     {id:'b',type:'standoff-editor-block',text:'Another passage to select across Blocks.'}]});
   registerApplicationViews(editor); const projection=editor.createView('stage4-browser');
   const host=document.body.appendChild(document.createElement('div'));
   host.style.cssText='position:fixed;left:40px;top:20px;width:460px;height:430px;overflow:auto;background:white;z-index:9999;padding:12px;font:20px/1.5 Arial';
   const dispose=render(()=>createComponent(ReactiveTreeView,{editor,projection}),host);editor.installGateway(document);
   const node=id=>Object.values(projection.state.nodes).find(n=>n.payload.id===id);
   const flow=id=>editor.mounts.get(node(id).key).focusElement;
   const frame=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
   const paths=()=>[...host.querySelectorAll('[data-property-type="codex/entity-reference"]')];
   const geometry=()=>{
     const surface=flow('a').closest('.reactive-standoff-surface'), rect=surface.getBoundingClientRect();
     const range=document.createRange();range.setStart(flow('a').children[0].firstChild,0);range.setEnd(flow('a').children[100].firstChild,1);
     const first=[...range.getClientRects()].find(r=>r.width>0);
     const nums=paths()[0]?.getAttribute('d').split(' ');
     return {lines:paths().length, x:Number(nums?.[1]),y:Number(nums?.[2]),expectedX:first.left-rect.left+surface.scrollLeft, expectedY:first.bottom-rect.top+surface.scrollTop+1.5};
   };
   window.stage4={editor,projection,host,dispose,node,flow,frame,paths,geometry,observers:()=>observers,before:editor.encodeDocument(),cells:[...flow('a').childNodes]};
   flow('a').focus();editor.mounts.get(node('a').key).restoreInlineSelection({anchor:3,head:8});await frame();
 })()`);
 const first = await evaluate('stage4.geometry()');
 if (!removed) {
   check('entity underline covers wrapped lines',first.lines>1,true);
   check('entity underline aligns with centrally measured text',Math.abs(first.x-first.expectedX)<.1 && Math.abs(first.y-first.expectedY)<.1,true);
 } else check('removed feature produces no entity effect',first.lines,0);
 const native = await evaluate('document.getSelection().toString()');
 await evaluate('stage4.host.style.width="310px"; stage4.frame()');
 const narrow = await evaluate('stage4.geometry()');
 if (!removed) check('resize remeasures wrapped entity effect',narrow.lines>first.lines && Math.abs(narrow.y-narrow.expectedY)<.1,true);
 check('resize preserves native selection',await evaluate('document.getSelection().toString()'),native);
 await evaluate('stage4.host.scrollTop=130; stage4.frame()');
 const scrolled = await evaluate('stage4.geometry()');
 if (!removed) check('scroll preserves local SVG/text alignment',Math.abs(scrolled.y-scrolled.expectedY)<.1,true);
 check('measurement preserves editable cell identity',await evaluate('stage4.cells.every((cell,i)=>cell===stage4.flow("a").childNodes[i])'),true);
 const observerCount=await evaluate('stage4.observers()');
 await evaluate(`stage4.editor.commands.setPayloadField(stage4.node('a').key,'standoffProperties',[...JSON.parse(JSON.stringify(stage4.node('a').payload.standoffProperties)),{id:'another',type:'codex/entity-reference',value:'other',start:10,end:80}]);stage4.frame()`);
 check('adding an effect adds no measurement observer',await evaluate('stage4.observers()'),observerCount);
 await evaluate('stage4.editor.repository.undo();stage4.frame()');
 check('authored properties survive resize and undo',await evaluate('stage4.editor.encodeDocument().children'),await evaluate('stage4.before.children'));
 const key=(key,code,modifiers=0,type='keyDown')=>send('Input.dispatchKeyEvent',{key,code,modifiers,type},sessionId);
 if (!removed) {
   await evaluate(`stage4.host.scrollTop=0;stage4.flow('a').focus();stage4.editor.mounts.get(stage4.node('a').key).restoreInlineSelection({anchor:0,head:5}); window.fetchBeforeStage4=window.fetch;window.fetch=async url=>String(url).startsWith('/api/')?({ok:true,json:async()=>({Success:true,Results:[{id:'blake',name:'Blake'}],Count:1,Page:1,MaxPage:1})}):fetchBeforeStage4(url);`);
   await key(';','Semicolon',2);await key(';','Semicolon',0,'keyUp');await key('r','KeyR');await key('r','KeyR',0,'keyUp');
   await evaluate('new Promise(resolve=>setTimeout(resolve,450))');
   check('entity chord opens contributed panel with selected query',await evaluate(`document.querySelector('.reactive-entity-search input[aria-label="Search entities"]')?.value`),'Blake');
   await key('Escape','Escape');await key('Escape','Escape',0,'keyUp');await evaluate('stage4.frame()');
   check('panel Escape restores native selected text',await evaluate('document.getSelection().toString()'),'Blake');
   check('panel Escape restores editor focus',await evaluate('document.activeElement===stage4.flow("a")'),true);
   await evaluate('window.fetch=window.fetchBeforeStage4');
 } else {
   check('removed feature has no entity command',await evaluate('stage4.editor.commandRegistry.owner("entity.open")??null'),null);
 }
 await evaluate(`stage4.flow('b').focus();stage4.editor.mounts.get(stage4.node('b').key).restoreInlineSelection({anchor:0,head:0})`);
 await send('Input.insertText',{text:'Q'},sessionId);
 check('ordinary native typing remains functional',await evaluate('stage4.editor.encodeDocument().children[1].text.startsWith("QAnother")'),true);
 await evaluate('stage4.editor.repository.undo();stage4.frame()');
 check('typing undo restores document including unknown fields',await evaluate('stage4.editor.encodeDocument().children'),await evaluate('stage4.before.children'));
 await evaluate('stage4.host.scrollTop=0;stage4.frame()');
 const screenshot=await send('Page.captureScreenshot',{format:'png',clip:{x:40,y:20,width:310,height:430,scale:1}},sessionId);
 if(process.env.SCREENSHOT_PATH) await (await import('node:fs/promises')).writeFile(process.env.SCREENSHOT_PATH,Buffer.from(screenshot.data,'base64'));
 await evaluate('stage4.dispose();stage4.editor.dispose();stage4.host.remove()');
 console.log(JSON.stringify({browser:await send('Browser.getVersion'),removed,checks,geometry:{first,narrow,scrolled},observerCount},null,2));
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
