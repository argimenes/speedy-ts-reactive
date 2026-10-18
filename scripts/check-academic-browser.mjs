// Academic citation browser qualification with deterministic service responses. Requires Vite.
// Run against an already-running Vite dev server (npm run dev).
// Uses an isolated Chrome profile and an in-memory fixture; never saves documents.
// Optional: CHROME_BIN and BENCHMARK_URL (the Vite origin).
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
socket.addEventListener('message', event => { const result = JSON.parse(event.data); if(result.id && pending.has(result.id)) { const p = pending.get(result.id); pending.delete(result.id); clearTimeout(p.timer); result.error ? p.reject(new Error(JSON.stringify(result.error))) : p.resolve(result.result); }});
const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const requestId = ++id; const timer=setTimeout(()=>{pending.delete(requestId);reject(new Error('CDP timed out: '+method));},30000); pending.set(requestId,{resolve,reject,timer}); socket.send(JSON.stringify({id:requestId,method,params,...(sessionId ? {sessionId} : {})})); });
 const {targetId} = await send('Target.createTarget',{url:'about:blank'}); const {sessionId} = await send('Target.attachToTarget',{targetId,flatten:true});
 const evaluate = async expression => {
   const result = await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);
   if(result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
   return result.result.value;
 };


 const origin=process.env.BENCHMARK_URL??'http://localhost:3000/';
 await send('Browser.grantPermissions',{origin:new URL(origin).origin,permissions:['clipboardReadWrite','clipboardSanitizedWrite']});
 await send('Page.navigate',{url:new URL('/scripts/academic-browser-fixture.html',origin).href},sessionId);await evaluate('new Promise(r=>setTimeout(r,1200))');
 await evaluate(`(async()=>{
  const {ReactiveEditor}=await import('/src/reactive-editor/editor.ts');
  const {registerCoreViews}=await import('/src/rendering/register-core-views.ts');
  const {ReactiveTreeView}=await import('/src/rendering/reactive-tree-view.tsx');
  const {captureNative,nativeEnvelope,admitNative}=await import('/src/persistence/native-resource.ts');
  const {normalizeScholarly}=await import('/src/interchange/scholarly.ts');
  const source=await(await fetch('/src/rendering/reactive-tree-view.tsx')).text(),webPath=source.split('"').find(p=>p.includes('/solid-js_web.js'));
  const {render,createComponent}=await import(webPath);
  const c={version:1,entityId:crypto.randomUUID(),resourceId:crypto.randomUUID(),snapshotId:crypto.randomUUID(),provider:'crossref',endpoint:'https://api.crossref.org/works/10.1234%2Ftest',retrievedAt:'2026-10-18T00:00:00Z',asset:{kind:'managed',cavernId:'fixture',assetId:'sha256:'+'a'.repeat(64)},metadata:normalizeScholarly('crossref','10.1234/test',new TextEncoder().encode(JSON.stringify({message:{DOI:'10.1234/test',title:['Offline fixture citation'],type:'journal-article',author:[{family:'Smith'}]}})))};
  let calls=0,offline=false;const original=window.fetch.bind(window);
  window.fetch=async(input,init)=>{if(String(input).startsWith('/api/services/academic.')){calls++;if(offline)throw Error('offline');return new Response(JSON.stringify({Success:true,Data:{citation:c,jobId:JSON.parse(init.body).id}}),{headers:{'Content-Type':'application/json'}});}return original(input,init);};
  const host=document.body.appendChild(document.createElement('div'));host.style.cssText='position:fixed;inset:0;background:white;z-index:99999;overflow:auto';
  const editor=new ReactiveEditor({id:'academic-doc',type:'document-block',children:[{id:'text',type:'standoff-editor-block',text:'before after'}]});editor.clipboard.setContext(()=>({cavernId:'fixture',session:'test'}));registerCoreViews(editor);const projection=editor.createView('academic-browser');const stop=render(()=>createComponent(ReactiveTreeView,{editor,projection}),host);editor.installGateway(document);
  const node=()=>Object.values(projection.state.nodes).find(n=>n.payload.id==='text');
    const select=()=>{const n=node(),m=editor.mounts.get(n.key);m.focus();m.restoreInlineSelection({anchor:6,head:6});editor.selections.setPrimary(n.key,n.contentKey,n.viewId,6,6);};select();
  window.proof={editor,host,select,calls:()=>calls,reopen:()=>{
   const bytes=new TextEncoder().encode(JSON.stringify(nativeEnvelope(captureNative(editor.repository.readState(),'academic-doc'))));stop();editor.dispose();offline=true;
   const next=new ReactiveEditor({id:'bank',type:'workspace-object-bank-block',children:[]});registerCoreViews(next);const bank=Object.values(next.repository.readState().contents).find(c=>c.viewType==='workspace-object-bank-block');const a=admitNative(next.repository,bytes,bank.key),p=next.createView('offline',a.placementKey);render(()=>createComponent(ReactiveTreeView,{editor:next,projection:p}),host);
  }};
 })()`);
 await evaluate(`navigator.clipboard.writeText('https://doi.org/10.1234/TEST?historical=yes')`);
 await evaluate('proof.select()');
 const key={key:'v',code:'KeyV',windowsVirtualKeyCode:86,modifiers:12};
 await send('Input.dispatchKeyEvent',{type:'keyDown',...key,commands:['pasteAndMatchStyle']},sessionId);await send('Input.dispatchKeyEvent',{type:'keyUp',...key},sessionId);
 await evaluate(`(async()=>{for(let i=0;i<150&&!proof.host.querySelector('.mutable-citation-block');i++)await new Promise(r=>setTimeout(r,20));if(!proof.host.querySelector('.mutable-citation-block'))throw Error(proof.editor.clipboard.message());})()`);
 assert.equal(await evaluate('proof.calls()'),1);
 assert.equal(await evaluate(`proof.editor.encodeDocument().children.find(b=>b.type==='mutable/citation-block').sourceUrl`),'https://doi.org/10.1234/TEST?historical=yes');
 await evaluate('proof.editor.repository.undo()');assert.equal(await evaluate(`!!proof.host.querySelector('.mutable-citation-block')`),false);
 await evaluate('proof.editor.repository.redo()');assert.equal(await evaluate(`proof.host.textContent.includes('Offline fixture citation')`),true);
 await evaluate('proof.reopen()');assert.equal(await evaluate(`proof.host.textContent.includes('Offline fixture citation')`),true);assert.equal(await evaluate('proof.calls()'),1);
 console.log(JSON.stringify({browser:await send('Browser.getVersion'),trustedMetaShiftV:true,provenance:true,oneStepUndoRedo:true,nativeOfflineReload:true,serviceRequests:1,provider:'fixture response; host workflow qualified separately'}));
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
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

// CDP/undici may retain a closing socket after Chrome has exited. All assertions
// and artifact writes above are awaited; failures never reach this success exit.
process.exit(0);
