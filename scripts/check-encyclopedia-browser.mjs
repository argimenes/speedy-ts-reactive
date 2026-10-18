// Wikipedia capture/review browser qualification with deterministic service responses. Requires Vite.
// Run against an already-running Vite dev server (npm run dev).
// Uses an isolated Chrome profile and an in-memory fixture; never saves documents.
// Optional: CHROME_BIN, BENCHMARK_URL and WIKIPEDIA_CAPTURE_PREFIX.
// The latter reads <prefix>0.json (lookup) and <prefix>1.json (revision parse).
// Requires Node 22+ (WebSocket).
import { spawn } from 'node:child_process';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import path from 'node:path';
const profile = await mkdtemp(path.join(tmpdir(), 'speedy-typing-bench-'));
const chrome = spawn(process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disk-cache-size=1', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank']);
// Optional exact provider responses, captured previously; no provider request is made.
const capturePrefix = process.env.WIKIPEDIA_CAPTURE_PREFIX;
const captured = capturePrefix ? await Promise.all([0,1].map(i => readFile(`${capturePrefix}${i}.json`, 'utf8'))) : undefined;
let socket;
try {
const endpoint = await new Promise((resolve, reject) => {
 let output = ''; chrome.stderr.on('data', chunk => { output += chunk; const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/); if(match) resolve(match[1]); });
 chrome.once('error', reject); setTimeout(() => reject(new Error('Chrome startup timed out')), 15000).unref();
});
socket = new WebSocket(endpoint); await new Promise(resolve => socket.addEventListener('open', resolve, {once:true}));
let id = 0; const pending = new Map();
socket.addEventListener('message', event => { const result = JSON.parse(event.data); if(result.id && pending.has(result.id)) { const p = pending.get(result.id); pending.delete(result.id); clearTimeout(p.timer); result.error ? p.reject(new Error(JSON.stringify(result.error))) : p.resolve(result.result); }});
const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const requestId = ++id; const timer=setTimeout(()=>{pending.delete(requestId);reject(new Error('CDP timed out: '+method));},capturePrefix ? 120000 : 30000); pending.set(requestId,{resolve,reject,timer}); socket.send(JSON.stringify({id:requestId,method,params,...(sessionId ? {sessionId} : {})})); });
 const {targetId} = await send('Target.createTarget',{url:'about:blank'}); const {sessionId} = await send('Target.attachToTarget',{targetId,flatten:true});
 const evaluate = async expression => {
   const result = await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);
   if(result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
   return result.result.value;
 };


 const origin=process.env.BENCHMARK_URL??'http://localhost:3000/';
 await send('Browser.grantPermissions',{origin:new URL(origin).origin,permissions:['clipboardReadWrite','clipboardSanitizedWrite']});
 await send('Page.navigate',{url:new URL('/scripts/academic-browser-fixture.html',origin).href},sessionId);await evaluate('new Promise(r=>setTimeout(r,1200))');
 await evaluate('window.capturedResponses='+JSON.stringify(captured??null));
 await evaluate(`(async()=>{
  const {ReactiveEditor}=await import('/src/reactive-editor/editor.ts');
  const {registerCoreViews}=await import('/src/rendering/register-core-views.ts');
  const {ReactiveTreeView}=await import('/src/rendering/reactive-tree-view.tsx');
  const {captureNative,nativeEnvelope,admitNative}=await import('/src/persistence/native-resource.ts');
  const {articleProjection}=await import('/src/interchange/encyclopedia-projection.ts');const {wikiFixture}=await import('/src/interchange/encyclopedia-fixtures.ts');
  const source=await(await fetch('/src/rendering/reactive-tree-view.tsx')).text(),webPath=source.split('"').find(p=>p.includes('/solid-js_web.js'));
  const {render,createComponent}=await import(webPath);
  const f=wikiFixture();if(window.capturedResponses){f.source={site:'en.wikipedia.org',title:'Douglas Adams',sourceUrl:'https://en.wikipedia.org/wiki/Douglas_Adams?utm_source=chatgpt.com'};f.responses=window.capturedResponses.map(s=>new TextEncoder().encode(s));}const projectionData=articleProjection(f.source,...f.responses);
  const c={snapshot:{version:1,kind:'article',entityId:crypto.randomUUID(),resourceId:crypto.randomUUID(),snapshotId:crypto.randomUUID(),identityId:crypto.randomUUID(),subjectId:crypto.randomUUID(),qid:'Q42',site:'en.wikipedia.org',pageId:projectionData.pageId,revision:projectionData.revision,title:projectionData.title,endpoint:'https://en.wikipedia.org/w/api.php',retrievedAt:'2026-10-18T00:00:00Z',assets:[{kind:'managed',cavernId:'fixture',assetId:'sha256:'+'a'.repeat(64)}]},projection:projectionData};
  const enrichment={snapshot:{snapshotId:crypto.randomUUID()},projection:{qid:'Q42',revision:456,label:'Douglas Adams',description:'writer',statements:[{id:'Q42$one',label:'occupation',rank:'normal',summary:'Q49757',value:{},qualifiers:{},references:[],supported:true,diagnostics:[]}],diagnostics:[]},reviews:[],existingClaims:[{guid:'authored',expression:'Authored conflicting fact',typename:'authored'}]};
  let calls=0,offline=false;const original=window.fetch.bind(window);
  window.fetch=async(input,init)=>{if(String(input).startsWith('/api/services/encyclopedia.')){calls++;if(offline)throw Error('offline');const data=String(input).endsWith('.enrich')?enrichment:String(input).endsWith('.review')?{statementId:'Q42$one',decision:'accepted',claimGuid:'accepted'}:c;return new Response(JSON.stringify({Success:true,Data:data}),{headers:{'Content-Type':'application/json'}});}return original(input,init);};
  const host=document.body.appendChild(document.createElement('div'));host.style.cssText='position:fixed;inset:0;background:white;z-index:99999;overflow:auto';
  const editor=new ReactiveEditor({id:'academic-doc',type:'document-block',children:[{id:'text',type:'standoff-editor-block',text:'before after'}]});editor.clipboard.setContext(()=>({cavernId:'fixture',session:'test'}));registerCoreViews(editor);const projection=editor.createView('academic-browser');const stop=render(()=>createComponent(ReactiveTreeView,{editor,projection}),host);editor.installGateway(document);
  const node=()=>Object.values(projection.state.nodes).find(n=>n.payload.id==='text');
    const select=()=>{const n=node(),m=editor.mounts.get(n.key);m.focus();m.restoreInlineSelection({anchor:6,head:6});editor.selections.setPrimary(n.key,n.contentKey,n.viewId,6,6);};select();
  window.proof={editor,projection,host,select,calls:()=>calls,reopen:()=>{
   const bytes=new TextEncoder().encode(JSON.stringify(nativeEnvelope(captureNative(editor.repository.readState(),'academic-doc'))));stop();editor.dispose();offline=true;
   const next=new ReactiveEditor({id:'bank',type:'workspace-object-bank-block',children:[]});registerCoreViews(next);const bank=Object.values(next.repository.readState().contents).find(c=>c.viewType==='workspace-object-bank-block');const a=admitNative(next.repository,bytes,bank.key),p=next.createView('offline',a.placementKey);render(()=>createComponent(ReactiveTreeView,{editor:next,projection:p}),host);
  }};
 })()`);
 const pastedUrl=captured?'https://en.wikipedia.org/wiki/Douglas_Adams?utm_source=chatgpt.com':'https://en.wikipedia.org/wiki/Redirect?historical=yes';
 await evaluate('navigator.clipboard.writeText('+JSON.stringify(pastedUrl)+')');
 await evaluate('proof.select()');
 const key={key:'v',code:'KeyV',windowsVirtualKeyCode:86,modifiers:12};
 await send('Input.dispatchKeyEvent',{type:'keyDown',...key,commands:['pasteAndMatchStyle']},sessionId);await send('Input.dispatchKeyEvent',{type:'keyUp',...key},sessionId);
 await evaluate(`(async()=>{for(let i=0;i<150&&!proof.host.querySelector('.mutable-web-article');i++)await new Promise(r=>setTimeout(r,20));if(!proof.host.querySelector('.mutable-web-article'))throw Error(proof.editor.clipboard.message());})()`);
 assert.equal(await evaluate('proof.calls()'),1);
 assert.equal(await evaluate(`proof.editor.encodeDocument().children.find(b=>b.type==='mutable/web-article-block').sourceUrl`),pastedUrl);
 await evaluate('proof.editor.repository.undo()');assert.equal(await evaluate(`!!proof.host.querySelector('.mutable-web-article')`),false);
 await evaluate('proof.editor.repository.redo()');assert.equal(await evaluate(`proof.host.textContent.includes('Douglas Adams')`),true);
 await evaluate(`(async()=>{for(let i=0;i<150&&!proof.host.querySelector('iframe');i++)await new Promise(r=>setTimeout(r,20));})()`);
 assert.equal(await evaluate(`proof.host.querySelector('iframe').getAttribute('sandbox')`),'');
 assert.equal(await evaluate(`proof.host.querySelector('iframe').srcdoc.includes('evil()')`),false);
 const revision=await evaluate('proof.editor.repository.state.revision');
 await evaluate(`[...proof.host.querySelectorAll('button')].find(b=>b.textContent.startsWith('Acquire Wikidata')).click()`);
 await evaluate(`(async()=>{for(let i=0;i<150&&![...proof.host.querySelectorAll('button')].some(b=>b.textContent==='Accept as Claim');i++)await new Promise(r=>setTimeout(r,20));})()`);
 assert.equal(await evaluate(`proof.host.textContent.includes('Authored conflicting fact')`),true);
 await evaluate(`[...proof.host.querySelectorAll('button')].find(b=>b.textContent==='Accept as Claim').click()`);
 await evaluate(`(async()=>{for(let i=0;i<150&&!proof.host.textContent.includes('Created a source-imported Claim');i++)await new Promise(r=>setTimeout(r,20));})()`);
 assert.equal(await evaluate('proof.editor.repository.state.revision'),revision);
 const conversionStarted=Date.now();
 await evaluate(`(async()=>{const key=proof.host.querySelector('.mutable-web-article').dataset.runtimeKey;window.conversion=proof.editor.interchange.convertSourceBlock(key);for(let i=0;i<150&&!proof.editor.interchange.question();i++)await new Promise(r=>setTimeout(r,20));if(!proof.editor.interchange.question())throw Error(proof.editor.interchange.message());proof.editor.interchange.respond([]);await window.conversion;})()`);
 console.log(JSON.stringify({conversionMs:Date.now()-conversionStarted,capturedArticle:!!captured,status:await evaluate('proof.editor.interchange.message()')}));
 assert.equal(await evaluate(`proof.editor.encodeDocument().children.some(b=>b.type==='standoff-editor-block'&&b.metadata?.provenance?.snapshotId)`),true);
 assert.equal(await evaluate(`proof.editor.encodeDocument().children.some(b=>(b.standoffProperties??[]).some(p=>p.type==='style/bold'))`),true);
 await evaluate(`(()=>{const n=Object.values(proof.projection.state.nodes).find(n=>n.viewType==='standoff-editor-block'&&n.payload.metadata?.provenance?.snapshotId&&n.inlineContent.length>3&&proof.editor.mounts.get(n.key));if(!n)throw Error('Converted text has no mounted editable surface');const m=proof.editor.mounts.get(n.key);m.focus();m.restoreInlineSelection({anchor:0,head:0});proof.editor.selections.setPrimary(n.key,n.contentKey,n.viewId,0,0);proof.readConvertedText=()=>{const s=proof.editor.repository.readState();return s.contents[n.contentKey].inlineContent.map(k=>s.contents[s.placements[k].contentKey].payload.text??'').join('');};proof.beforeTyping=proof.readConvertedText();})()`);
 await send('Input.insertText',{text:'Q'},sessionId);
 assert.equal(await evaluate(`proof.readConvertedText()==='Q'+proof.beforeTyping`),true);
 await evaluate('proof.editor.repository.undo()');
 assert.equal(await evaluate(`proof.readConvertedText()===proof.beforeTyping`),true);
 await evaluate('proof.editor.repository.undo()');assert.equal(await evaluate(`!!proof.host.querySelector('.mutable-web-article')`),true);
 await evaluate('proof.editor.repository.redo()');assert.equal(await evaluate(`!!proof.host.querySelector('.mutable-web-article')`),false);
 await evaluate('proof.editor.repository.undo()');
 await evaluate('proof.reopen()');assert.equal(await evaluate(`proof.host.textContent.includes('Douglas Adams')`),true);assert.equal(await evaluate('proof.calls()'),3);
 console.log(JSON.stringify({browser:await send('Browser.getVersion'),trustedMetaShiftV:true,provenance:true,oneStepUndoRedo:true,isolatedPreview:true,explicitClaimReview:true,reviewHistoryIndependent:true,nativeStandoffConversion:true,convertedTextEditing:true,nativeOfflineReload:true,serviceRequests:3,provider:'fixture response; host workflow/live acquisition qualified separately'}));

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
