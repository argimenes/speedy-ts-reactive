// Run against an already-running Vite dev server (npm run dev).
// Uses an isolated Chrome profile and an in-memory fixture; never saves documents.
// Checks compact desktop chrome, overflow, native selection and the count worker.
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
   window.makeChromeFixture = compact => {
     window.chromeCheck?.dispose();window.chromeCheck?.editor.dispose();window.chromeCheck?.host.remove();
     const host=document.createElement('div');host.style.cssText='position:fixed;inset:0;background:white;z-index:1000';document.body.append(host);
     const editor=new ReactiveEditor({type:'document-window-block',metadata:{size:{w:840,h:620}},children:[{type:'document-block',children:[{id:'p',type:'standoff-editor-block',text:'one 😀 two',standoffProperties:[{id:'entity',type:'codex/entity-reference',start:0,end:2,value:'id'}]},{id:'q',type:'standoff-editor-block',text:'another paragraph'}]}]}, {features:{compactEditorChrome:compact,publicHostedVersion:false}});
     registerCoreViews(editor);const projection=editor.createView('chrome-browser');
     const dispose=render(()=>createComponent(ReactiveTreeView,{editor,projection}),host);editor.installGateway(document);
     window.chromeCheck={editor,host,dispose,projection,flow:host.querySelector('.reactive-standoff-flow')};
   };
   makeChromeFixture(false);
 })()`);
 const measure=()=>evaluate(`(() => {const host=chromeCheck.host,bar=host.querySelector('.document-style-bar'),footer=host.querySelector('.document-status-bar'),content=host.querySelector('.reactive-window__content');return {toolbar:bar.getBoundingClientRect().height,footer:footer?.getBoundingClientRect().height??0,content:content.getBoundingClientRect().height,footerAtBottom:footer ? footer.getBoundingClientRect().top >= content.getBoundingClientRect().bottom : false};})()`);
 const before=await measure();
 await evaluate('makeChromeFixture(true);new Promise(resolve=>setTimeout(resolve,500))');
 const after=await measure();
 assert.equal(after.toolbar,40);assert.equal(after.footer,24);assert.ok(after.content>before.content);assert.equal(after.footerAtBottom,true);
 const select=()=>evaluate(`(() => {const f=chromeCheck.flow;f.focus();const r=document.createRange();r.setStart(f,0);r.setEnd(f,5);getSelection().removeAllRanges();getSelection().addRange(r);document.dispatchEvent(new Event('selectionchange'));})()`);
 const choose=async name=>{await evaluate(`(()=>{const s=chromeCheck.host.querySelector('[aria-label="Toolset"]');s.value=${JSON.stringify(name)};s.dispatchEvent(new Event('change',{bubbles:true}));})()`);};
 const click=async selector=>{
   const p=await evaluate(`(() => {const b=chromeCheck.host.querySelector(${JSON.stringify(selector)}) ?? document.querySelector(${JSON.stringify(selector.startsWith(".compact-toolbar__panel") ? selector : ".compact-toolbar__panel "+selector)});if(!b)throw new Error('Missing '+${JSON.stringify(selector)});b.scrollIntoView({block:'nearest'});const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
   await send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1},sessionId);
   await send('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',clickCount:1},sessionId);
 };
 const reveal=async (selector,set)=>{
   await choose(set);
   if(!await evaluate(`!!chromeCheck.host.querySelector(${JSON.stringify(selector)})`)) await click('.compact-toolbar__more');
 };
 const names=await evaluate(`(async()=>{const {annotationTools}=await import('/src/rendering/document-style-bar.tsx');return annotationTools;})()`);
 for(let index=0;index<names.length;index++){
   await select();const selector='[data-tool-id="'+names[index][0]+'"]';await reveal(selector,index<7?'Typography':index<9?'Annotations':'Visual effects');await click(selector);
 }
 let properties=await evaluate('chromeCheck.editor.encodeDocument().children[0].children[0].standoffProperties');
 assert.equal(properties.length,16);assert.ok(properties.slice(1).every(p=>p.start===0&&p.end===4));
 for (const title of ['Apply text colour','Apply background colour']) {
   await select();await reveal('[data-tool-id="colours"]','Visual effects');await click('[data-tool-id="colours"]');
   await click('button[title="'+title+'"]');
 }
 properties=await evaluate('chromeCheck.editor.encodeDocument().children[0].children[0].standoffProperties');assert.equal(properties.length,18);
 const revision=await evaluate('chromeCheck.editor.repository.state.revision');
 await select();const selection=await evaluate('getSelection().toString()');
 await click('[aria-label="Next toolset"]');
 assert.equal(await evaluate('getSelection().toString()'),selection);
 assert.equal(await evaluate('document.activeElement===chromeCheck.flow'),true);
 await evaluate(`chromeCheck.host.querySelector('.reactive-window').style.width='560px';new Promise(resolve=>setTimeout(resolve,100))`);
 assert.equal((await measure()).toolbar,40);
 await click('.compact-toolbar__more');
 assert.equal(await evaluate(`(()=>{const p=document.querySelector('.compact-toolbar__panel').getBoundingClientRect();return p.left>=0&&p.right<=innerWidth&&p.bottom<=innerHeight;})()`),true);
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'},sessionId);
 assert.equal(await evaluate(`document.activeElement===chromeCheck.host.querySelector('.compact-toolbar__more')`),true);
 assert.equal(await evaluate('chromeCheck.editor.repository.state.revision'),revision);
 await evaluate(`chromeCheck.host.querySelector('.document-count-bar').open=true`);
 assert.equal((await measure()).footer,24);
 assert.ok(await evaluate(`chromeCheck.host.querySelector('.document-count-bar summary').textContent.includes('Document: 4 words')`));
 await evaluate(`chromeCheck.host.querySelector('.document-count-bar').open=false;chromeCheck.editor.crossText.enable(true);const nodes=Object.values(chromeCheck.projection.state.nodes);const a=nodes.find(n=>n.payload.id==='p'),b=nodes.find(n=>n.payload.id==='q');chromeCheck.editor.mounts.get(a.key).focus();chromeCheck.editor.crossText.set(chromeCheck.editor.crossText.position(a.key,0),chromeCheck.editor.crossText.position(b.key,3));`);
 await choose('Visual effects');await click('.compact-toolbar__more');
 assert.equal(await evaluate('!!chromeCheck.editor.crossText.range()'),true);
 await click('.compact-toolbar__panel summary');
 assert.equal(await evaluate(`!!document.querySelector('[aria-label="Linked annotation type"]')`),true);
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'},sessionId);
 assert.equal(await evaluate('!!chromeCheck.editor.crossText.range()'),true);
 await evaluate('chromeCheck.editor.crossText.collapseToHead()');
 await choose('Typography');
 const shot=await send('Page.captureScreenshot',{format:'png'},sessionId);
 await writeFile('/tmp/compact-editor-chrome.png',Buffer.from(shot.data,'base64'));
 console.log(JSON.stringify({before,after,recoveredDocumentPixels:after.content-before.content,styles:17,selectionRetained:true,narrowOverflow:true,footerWorker:true,crossSelection:true,screenshot:'/tmp/compact-editor-chrome.png'}));
 await evaluate('chromeCheck.dispose();chromeCheck.editor.dispose();chromeCheck.host.remove()');
} finally {
  socket?.close();
  if (chrome.pid && chrome.exitCode === null && chrome.signalCode === null) {
    const exited = new Promise(resolve => chrome.once('exit', resolve));
    chrome.kill('SIGKILL');
    await exited;
  }
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
