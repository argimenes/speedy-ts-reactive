// IIIF browser qualification using deterministic service fixtures and real OpenSeadragon. Requires Vite.
// Run against an already-running Vite dev server (npm run dev).
// Uses an isolated Chrome profile and an in-memory fixture; never saves documents.
// Optional: CHROME_BIN and BENCHMARK_URL.
// Requires Node 22+ (WebSocket).
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import path from 'node:path';
const profile = await mkdtemp(path.join(tmpdir(), 'mutable-iiif-browser-'));
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
 await send('Runtime.enable',{},sessionId);socket.addEventListener('message',e=>{const r=JSON.parse(e.data);if(r.method==='Runtime.exceptionThrown')console.error('Browser exception',JSON.stringify(r.params));});
 const evaluate = async expression => {
   const result = await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);
   if(result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
   return result.result.value;
 };


 const origin=process.env.BENCHMARK_URL??'http://localhost:3000/';
 await send('Browser.grantPermissions',{origin:new URL(origin).origin,permissions:['clipboardReadWrite','clipboardSanitizedWrite']});
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false},sessionId);
 await send('Page.navigate',{url:new URL('/scripts/academic-browser-fixture.html',origin).href},sessionId);await evaluate('new Promise(r=>setTimeout(r,1200))');

 await evaluate(`(async()=>{
  const {ReactiveEditor}=await import('/src/reactive-editor/editor.ts'),{registerCoreViews}=await import('/src/rendering/register-core-views.ts'),{ReactiveTreeView}=await import('/src/rendering/reactive-tree-view.tsx');
  const {captureNative,nativeEnvelope,admitNative}=await import('/src/persistence/native-resource.ts');
  const {manifestFixture,imageFixture,jsonBytes}=await import('/src/iiif/fixtures.ts'),{normalizeIIIF}=await import('/src/iiif/model.ts');
  const source=await(await fetch('/src/rendering/reactive-tree-view.tsx')).text(),webPath=source.split('"').find(p=>p.includes('/solid-js_web.js'));const {render,createComponent}=await import(webPath);
  const projectionData=normalizeIIIF(jsonBytes(manifestFixture(200))),snapshot={version:1,kind:'iiif-manifest',snapshotId:crypto.randomUUID(),identityId:crypto.randomUUID(),entityId:crypto.randomUUID(),resourceId:crypto.randomUUID(),sourceUrl:'https://books.example/manifest.json',resourceUrl:projectionData.id,retrievedAt:'2026-10-18T00:00:00Z',asset:{kind:'managed',cavernId:'fixture',assetId:'sha256:'+'a'.repeat(64)},label:projectionData.label};
  let calls=[],retained=false,fail=false,pending=0,maxPending=0;const original=window.fetch.bind(window),grants=new Map();
  window.fetch=async(input,init)=>{if(String(input).startsWith('/api/services/iiif.')){const op=String(input).split('.').at(-1),v=JSON.parse(init.body);calls.push({op,v});let data;
   if(op==='import'||op==='read')data={snapshot,projection:projectionData};
   else if(op==='open'){const grant=crypto.randomUUID();grants.set(grant,v);data={grant,info:normalizeIIIF(jsonBytes(imageFixture())),retained:retained?1:0,cached:0};}
   else if(op==='close'){grants.delete(v.grant);data={closed:true};}
   else if(op==='retain'){retained=true;data={retained:1};}
   else if(op==='tile'){pending++;maxPending=Math.max(pending,maxPending);try{await new Promise((resolve,reject)=>{const t=setTimeout(resolve,20);init.signal?.addEventListener('abort',()=>{clearTimeout(t);reject(Error('aborted'));},{once:true});});if(fail||!grants.get(v.grant)?.online&&!retained)return new Response(JSON.stringify({Success:false,Error:'Tile unavailable offline'}),{status:409});const cv=document.createElement('canvas');cv.width=cv.height=512;const ctx=cv.getContext('2d');ctx.fillStyle='#b7c8dd';ctx.fillRect(0,0,512,512);ctx.fillStyle='#345';ctx.font='36px sans-serif';ctx.fillText('Manuscript '+v.x+','+v.y,30,240);const blob=await new Promise(r=>cv.toBlob(r));return new Response(blob,{headers:{'Content-Type':'application/octet-stream','X-Mutable-Cavern-Id':'fixture','X-Mutable-Result':JSON.stringify({availability:retained?'retained':'remote'})}});}finally{pending--;}}
   return new Response(JSON.stringify({Success:true,Data:data}),{headers:{'Content-Type':'application/json'}});}return original(input,init);};
  const host=document.body.appendChild(document.createElement('div'));host.style.cssText='position:fixed;inset:0;background:white;z-index:99999;overflow:auto';
  let editor=new ReactiveEditor({id:'iiif-doc',type:'document-block',children:[{id:'text',type:'standoff-editor-block',text:'before after'}]});editor.clipboard.setContext(()=>({cavernId:'fixture',session:'test'}));registerCoreViews(editor);let projection=editor.createView('iiif-browser'),stop=render(()=>createComponent(ReactiveTreeView,{editor,projection}),host);editor.installGateway(document);
  const select=()=>{const n=Object.values(projection.state.nodes).find(n=>n.payload.id==='text'),m=editor.mounts.get(n.key);m.focus();m.restoreInlineSelection({anchor:6,head:6});editor.selections.setPrimary(n.key,n.contentKey,n.viewId,6,6);};select();
  window.proof={get editor(){return editor;},get projection(){return projection;},host,select,calls:()=>calls,grants:()=>grants.size,maxPending:()=>maxPending,fail:()=>fail=true,save:()=>JSON.stringify(nativeEnvelope(captureNative(editor.repository.readState(),'iiif-doc'))),reopen(bytes){stop();editor.dispose();editor=new ReactiveEditor({id:'bank',type:'workspace-object-bank-block',children:[]});editor.clipboard.setContext(()=>({cavernId:'fixture',session:'test'}));registerCoreViews(editor);const bank=Object.values(editor.repository.readState().contents).find(c=>c.viewType==='workspace-object-bank-block'),a=admitNative(editor.repository,new TextEncoder().encode(bytes),bank.key);projection=editor.createView('reopened',a.placementKey);stop=render(()=>createComponent(ReactiveTreeView,{editor,projection}),host);},dispose(){stop();editor.dispose();}};
 })()`);
 const wait=condition=>evaluate(`(async()=>{for(let i=0;i<300;i++){if(${condition})return;await new Promise(r=>setTimeout(r,30));}throw Error('Timed out: '+${JSON.stringify(condition)}+' '+proof.host.textContent);})()`);
 const click=text=>evaluate(`[...proof.host.querySelectorAll('button')].find(b=>b.textContent===${JSON.stringify(text)}).click()`);
 await evaluate(`navigator.clipboard.writeText('https://books.example/manifest.json')`);await evaluate('proof.select()');const key={key:'v',code:'KeyV',windowsVirtualKeyCode:86,modifiers:12};await send('Input.dispatchKeyEvent',{type:'keyDown',...key,commands:['pasteAndMatchStyle']},sessionId);await send('Input.dispatchKeyEvent',{type:'keyUp',...key},sessionId);
 await wait(`proof.host.querySelector('select[aria-label="IIIF canvas"]')?.options.length===200`);
 assert.equal(await evaluate(`proof.calls().some(c=>c.op==='tile')`),false);
 await evaluate('proof.editor.repository.undo()');assert.equal(await evaluate(`!!proof.host.querySelector('.mutable-iiif')`),false);await evaluate('proof.editor.repository.redo()');await wait(`proof.host.querySelector('select[aria-label="IIIF canvas"]')?.options.length===200`);
 const revision=await evaluate('proof.editor.repository.state.revision');await click('Activate online viewer');await wait(`proof.calls().some(c=>c.op==='tile')&&proof.host.querySelector('.openseadragon-canvas')`);await evaluate('new Promise(r=>setTimeout(r,1000))');
 assert.equal(await evaluate(`(()=>{const cv=proof.host.querySelector('.openseadragon-canvas canvas'),ctx=cv.getContext('2d'),pixels=ctx.getImageData(0,0,cv.width,cv.height).data;return pixels.some((n,i)=>i%4===0&&n>100);})()`),true);assert.equal(await evaluate('proof.editor.repository.state.revision'),revision);assert.ok(await evaluate('proof.maxPending()<=4'));
 await evaluate(`[...proof.host.querySelectorAll('details')].find(d=>d.querySelector('summary')?.textContent.startsWith('Spatial annotations')).open=true`);await click('Use visible region');
 const note=text=>evaluate(`(()=>{const input=proof.host.querySelector('[aria-label="Spatial note"]');input.value=${JSON.stringify(text)};input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
 await note('First region');await click('Add spatial annotation');await note('Overlapping region');await click('Add spatial annotation');await wait(`proof.host.querySelectorAll('[data-annotation-id]').length===2`);
 const before=await evaluate('proof.save()');const overlayWidth=await evaluate(`proof.host.querySelector('[data-annotation-id]').getBoundingClientRect().width`);await click('Zoom in');await evaluate('new Promise(r=>setTimeout(r,400))');await send('Emulation.setDeviceMetricsOverride',{width:1000,height:900,deviceScaleFactor:1,mobile:false},sessionId);await evaluate('new Promise(r=>setTimeout(r,400))');assert.equal(await evaluate('proof.save()'),before);assert.notEqual(await evaluate(`proof.host.querySelector('[data-annotation-id]').getBoundingClientRect().width`),overlayWidth);
 const pan=await evaluate(`(()=>{const viewport=proof.host.querySelector('[aria-label="IIIF image viewport"]');viewport.scrollIntoView({block:'center'});const r=viewport.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
 const overlayLeft=await evaluate(`proof.host.querySelector('[data-annotation-id]').getBoundingClientRect().left`);
 await send('Input.dispatchMouseEvent',{type:'mousePressed',x:pan.x,y:pan.y,button:'left',buttons:1,clickCount:1},sessionId);for(let i=1;i<=4;i++)await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:pan.x+20*i,y:pan.y,button:'left',buttons:1},sessionId);await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:pan.x+80,y:pan.y,button:'left',buttons:0,clickCount:1},sessionId);await evaluate('new Promise(r=>setTimeout(r,300))');
 assert.notEqual(await evaluate(`proof.host.querySelector('[data-annotation-id]').getBoundingClientRect().left`),overlayLeft);assert.equal(await evaluate('proof.save()'),before);
 await evaluate(`proof.host.querySelector('[aria-label="Delete annotation First region"]').click()`);assert.equal(await evaluate(`proof.host.querySelectorAll('[data-annotation-id]').length`),1);await evaluate('proof.editor.repository.undo()');assert.equal(await evaluate(`proof.host.querySelectorAll('[data-annotation-id]').length`),2);await evaluate('proof.editor.repository.redo()');assert.equal(await evaluate(`proof.host.querySelectorAll('[data-annotation-id]').length`),1);
 await click('Retain cached tiles for offline viewing');await wait(`proof.host.textContent.includes('cached tiles retained')`);await click('Close / cancel viewer');await wait('proof.grants()===0');assert.equal(await evaluate(`proof.host.querySelectorAll('[data-annotation-id]').length`),0);
 await evaluate(`(()=>{const select=proof.host.querySelector('select[aria-label="IIIF canvas"]');select.selectedIndex=1;select.dispatchEvent(new Event('change',{bubbles:true}));})()`);await click('Activate online viewer');await wait(`proof.calls().filter(c=>c.op==='open').length===2`);assert.equal(await evaluate(`proof.calls().filter(c=>c.op==='open').at(-1).v.origins[0]`),'https://other-images.example');assert.equal(await evaluate(`proof.host.querySelectorAll('[data-annotation-id]').length`),0);
 await click('Close / cancel viewer');const saved=await evaluate('proof.save()');await evaluate('proof.reopen('+JSON.stringify(saved)+')');await wait(`proof.host.querySelector('select[aria-label="IIIF canvas"]')?.options.length===200`);await click('Open retained / cached tiles only');await wait(`proof.host.querySelectorAll('[data-annotation-id]').length===1`);assert.equal(await evaluate(`proof.calls().filter(c=>c.op==='open').at(-1).v.online`),false);
 await evaluate('proof.fail()');for(let i=0;i<4;i++)await click('Zoom in');await wait(`proof.host.textContent.includes('Tile unavailable offline')`);
 await evaluate('proof.dispose()');await wait('proof.grants()===0');assert.equal(await evaluate(`proof.host.querySelectorAll('canvas').length`),0);
 console.log(JSON.stringify({browser:await send('Browser.getVersion'),trustedMetaShiftV:true,canvasCount:200,noTilesBeforeActivation:true,maxConcurrentTileRequests:await evaluate('proof.maxPending()'),annotationOverlapAndIndependentDeletion:true,stableAcrossZoomPanResize:true,decodedCanvasPixels:true,unavailableOfflineTiles:true,oneStepUndoRedo:true,nativeSaveReopen:true,offlineActivation:true,unmountCleanup:true,fixture:'real OSD; deterministic transport; live-provider transport checked separately'}));

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
