// PDF browser qualification using deterministic transport and real PDF.js. Requires Vite.
// Run against an already-running Vite dev server (npm run dev).
// Uses an isolated Chrome profile and an in-memory fixture; never saves documents.
// Optional: CHROME_BIN and BENCHMARK_URL.
// Requires Node 22+ (WebSocket).
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import path from 'node:path';
const profile = await mkdtemp(path.join(tmpdir(), 'mutable-pdf-browser-'));
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
  const {captureNative,nativeEnvelope,admitNative}=await import('/src/persistence/native-resource.ts'),{pdfFixture}=await import('/src/pdf/fixtures.ts');
  const source=await(await fetch('/src/rendering/reactive-tree-view.tsx')).text(),webPath=source.split('"').find(p=>p.includes('/solid-js_web.js'));const {render,createComponent}=await import(webPath);
  const pdf=pdfFixture(),digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',pdf))].map(b=>b.toString(16).padStart(2,'0')).join('');
  const snapshot={version:1,kind:'pdf',snapshotId:crypto.randomUUID(),identityId:crypto.randomUUID(),entityId:crypto.randomUUID(),resourceId:crypto.randomUUID(),sourceUrl:'https://papers.example/work.pdf',endpoint:'https://papers.example/work.pdf',retrievedAt:'2026-10-18T00:00:00Z',asset:{kind:'managed',cavernId:'fixture',assetId:'sha256:'+digest},inspection:{kind:'pdf-inspection',pages:2,label:'Academic PDF',version:'fixture'}};
  const scanned=pdfFixture(1,true),scanDigest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',scanned))].map(b=>b.toString(16).padStart(2,'0')).join(''),scanSnapshot={...snapshot,snapshotId:crypto.randomUUID(),asset:{...snapshot.asset,assetId:'sha256:'+scanDigest},inspection:{...snapshot.inspection,pages:1,label:'Scanned PDF'}};
  const calls=[],original=window.fetch.bind(window);window.fetch=async(input,init)=>{if(String(input).startsWith('/api/services/pdf.')){const op=String(input).split('.').at(-1);calls.push(op);if(op==='read'){const scan=JSON.parse(init.body).snapshotId===scanSnapshot.snapshotId;return new Response(scan?scanned:pdf,{headers:{'Content-Type':'application/octet-stream','X-Mutable-Cavern-Id':'fixture','X-Mutable-Result':JSON.stringify({snapshot:scan?scanSnapshot:snapshot})}});}return new Response(JSON.stringify({Success:true,Data:{snapshot}}));}return original(input,init);};
  const host=document.body.appendChild(document.createElement('div'));host.style.cssText='position:fixed;inset:0;background:white;z-index:99999;overflow:auto';let editor=new ReactiveEditor({id:'pdf-doc',type:'document-block',children:[{id:'text',type:'standoff-editor-block',text:'before after'}]});editor.clipboard.setContext(()=>({cavernId:'fixture',session:'test'}));registerCoreViews(editor);let projection=editor.createView('pdf-browser'),stop=render(()=>createComponent(ReactiveTreeView,{editor,projection}),host);editor.installGateway(document);
  const select=()=>{const n=Object.values(projection.state.nodes).find(n=>n.payload.id==='text'),m=editor.mounts.get(n.key);m.focus();m.restoreInlineSelection({anchor:6,head:6});editor.selections.setPrimary(n.key,n.contentKey,n.viewId,6,6);};select();
  window.proof={get editor(){return editor;},get projection(){return projection;},host,snapshot,scanSnapshot,pdf,select,calls,save:()=>JSON.stringify(nativeEnvelope(captureNative(editor.repository.readState(),'pdf-doc'))),reopen(bytes){stop();editor.dispose();editor=new ReactiveEditor({id:'bank',type:'workspace-object-bank-block',children:[]});editor.clipboard.setContext(()=>({cavernId:'fixture',session:'test'}));registerCoreViews(editor);const bank=Object.values(editor.repository.readState().contents).find(c=>c.viewType==='workspace-object-bank-block'),a=admitNative(editor.repository,new TextEncoder().encode(bytes),bank.key);projection=editor.createView('reopened',a.placementKey);stop=render(()=>createComponent(ReactiveTreeView,{editor,projection}),host);},dispose(){stop();editor.dispose();}};
 })()`);
 const wait=condition=>evaluate(`(async()=>{for(let i=0;i<400;i++){if(${condition})return;await new Promise(r=>setTimeout(r,30));}throw Error('Timed out: '+${JSON.stringify(condition)}+' '+proof.host.textContent);})()`);
 const click=text=>evaluate(`[...proof.host.querySelectorAll('button')].find(b=>b.textContent===${JSON.stringify(text)}).click()`);
 await evaluate(`navigator.clipboard.writeText('https://papers.example/work.pdf')`);await evaluate('proof.select()');const key={key:'v',code:'KeyV',windowsVirtualKeyCode:86,modifiers:12};await send('Input.dispatchKeyEvent',{type:'keyDown',...key,commands:['pasteAndMatchStyle']},sessionId);await send('Input.dispatchKeyEvent',{type:'keyUp',...key},sessionId);
 await wait(`!!proof.host.querySelector('.mutable-pdf')`);assert.deepEqual(await evaluate('proof.calls'),['import']);await evaluate('proof.editor.repository.undo()');assert.equal(await evaluate(`!!proof.host.querySelector('.mutable-pdf')`),false);await evaluate('proof.editor.repository.redo()');
 const revision=await evaluate('proof.editor.repository.state.revision');await click('Open retained PDF');await wait(`proof.host.querySelector('.textLayer')?.textContent.includes('Academic PDF page 1')`);assert.equal(await evaluate('proof.editor.repository.state.revision'),revision);
 assert.equal(await evaluate(`(()=>{const c=proof.host.querySelector('canvas'),p=c.getContext('2d').getImageData(0,0,c.width,c.height).data;return p.some((n,i)=>i%4===0&&n<100);})()`),true);
 await evaluate(`(()=>{const span=proof.host.querySelector('.textLayer span'),r=document.createRange();r.selectNodeContents(span);const s=window.getSelection();s.removeAllRanges();s.addRange(r);})()`);assert.match(await evaluate('window.getSelection().toString()'),/Academic PDF page 1/);
 await evaluate(`[...proof.host.querySelectorAll('details')].find(d=>d.querySelector('summary')?.textContent.startsWith('PDF annotations')).open=true`);await click('Use selection / visible region');
 const note=text=>evaluate(`(()=>{const input=proof.host.querySelector('[aria-label="PDF note"]');input.value=${JSON.stringify(text)};input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
 await note('PDF note one');await click('Add PDF annotation');await note('PDF note two');await click('Add PDF annotation');await wait(`proof.host.querySelectorAll('[data-annotation-id]').length===2`);
 const saved=await evaluate('proof.save()'),width=await evaluate(`proof.host.querySelector('[data-annotation-id]').getBoundingClientRect().width`);await click('Zoom in');await wait(`proof.host.querySelectorAll('[data-annotation-id]').length===2&&proof.host.querySelector('[data-annotation-id]').getBoundingClientRect().width>${width}`);assert.equal(await evaluate('proof.save()'),saved);
 await click('Next PDF page');await wait(`proof.host.querySelector('.textLayer')?.textContent.includes('Academic PDF page 2')`);assert.equal(await evaluate(`proof.host.querySelectorAll('[data-annotation-id]').length`),0);assert.equal(await evaluate(`proof.host.querySelectorAll('canvas').length`),1);await click('Previous PDF page');await wait(`proof.host.querySelectorAll('[data-annotation-id]').length===2`);
 await click('Delete PDF annotation');assert.equal(await evaluate(`proof.host.querySelectorAll('[data-annotation-id]').length`),1);await evaluate('proof.editor.repository.undo()');assert.equal(await evaluate(`proof.host.querySelectorAll('[data-annotation-id]').length`),2);
 await click('Extract page text as editable Ink');await wait(`Object.values(proof.editor.repository.readState().contents).some(c=>c.payload.metadata?.role==='PdfTextBlock')`);const derivative=await evaluate(`Object.values(proof.editor.repository.readState().contents).find(c=>c.payload.metadata?.role==='PdfTextBlock').payload.metadata.provenance`);assert.equal(derivative.snapshotId,await evaluate('proof.snapshot.snapshotId'));assert.ok(derivative.runs.length>=2);await evaluate('proof.editor.repository.undo()');assert.equal(await evaluate(`Object.values(proof.editor.repository.readState().contents).some(c=>c.payload.metadata?.role==='PdfTextBlock')`),false);
 await evaluate(`(()=>{const span=proof.host.querySelector('.textLayer span'),r=document.createRange();r.setStart(span.firstChild,0);r.setEnd(span.firstChild,8);const s=window.getSelection();s.removeAllRanges();s.addRange(r);})()`);await click('Extract selected text as editable Ink');await wait(`Object.values(proof.editor.repository.readState().contents).some(c=>c.payload.metadata?.provenance?.selection)`);assert.deepEqual(await evaluate(`Object.values(proof.editor.repository.readState().contents).find(c=>c.payload.metadata?.provenance?.selection).payload.metadata.provenance.selection`),{start:0,end:8});await evaluate('proof.editor.repository.undo()');
 await evaluate(`proof.reopen(${JSON.stringify(saved)})`);await click('Open retained PDF');await wait(`proof.host.querySelectorAll('[data-annotation-id]').length===2`);assert.equal(await evaluate(`proof.calls.filter(x=>x==='import').length`),1);await click('Close / cancel PDF');assert.equal(await evaluate(`proof.host.querySelectorAll('canvas').length`),0);
 await evaluate(`(async()=>{const {pdfBlock}=await import('/src/pdf/block.ts'),n=Object.values(proof.projection.state.nodes).find(n=>n.viewType==='mutable/pdf-document-block'),p=pdfBlock(proof.scanSnapshot);proof.editor.commands.insertFragment(p.native,{kind:'after',anchorKey:n.placementKey});})()`);await evaluate(`[...proof.host.querySelectorAll('.mutable-pdf')].at(-1).querySelector('button').click()`);await wait(`proof.host.textContent.includes('No text layer on this page')`);const scanRevision=await evaluate('proof.editor.repository.state.revision');await evaluate(`[...[...proof.host.querySelectorAll('.mutable-pdf')].at(-1).querySelectorAll('button')].find(b=>b.textContent==='Extract page text as editable Ink').click()`);await wait(`proof.host.textContent.includes('no extractable text')`);assert.equal(await evaluate('proof.editor.repository.state.revision'),scanRevision);
 await evaluate('proof.dispose()');console.log(JSON.stringify({browser:await send('Browser.getVersion'),trustedPaste:true,originalAcquisitions:1,renderedPixels:true,nativeTextSelection:true,imageOnlyOcrBoundary:true,twoPageNavigation:true,boundedCanvasCount:1,zoomStableAnchors:true,independentDeletionUndo:true,explicitNativeDerivative:true,selectedTextAlignment:true,saveReopenLocalOnly:true,unmountCleanup:true}));
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
