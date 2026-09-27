// Canvas Milestone C: static presentation composition, switching and persistence.
// Node 22+, CHROME_BIN and BENCHMARK_URL supported. Isolated Chrome profile,
// Vite dev server required; in-memory fixtures and captured DTOs only.
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
 const evaluate = async expression => {
   const result = await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);
   if(result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
   return result.result.value;
 };



 const checks = [];
 const check = (name, actual, expected) => { assert.deepEqual(actual, expected, name); checks.push(name); };
 await send('Emulation.setDeviceMetricsOverride',{width:2400,height:1800,deviceScaleFactor:1,mobile:false},sessionId);
 await send('Page.navigate',{url:process.env.BENCHMARK_URL ?? 'http://127.0.0.1:5187/'},sessionId);
 await evaluate('new Promise(resolve=>setTimeout(resolve,1200))');
 await evaluate(`(async()=>{
   const {WorkspaceSession}=await import('/src/application/workspace-session.ts');
   const {WorkspacePresentationView}=await import('/src/application/workspace-presentation-view.tsx');
   const {WorkspacePresentations}=await import('/src/demo/workspace-presentations.tsx');
   const {CodexSystemBar}=await import('/src/demo/codex-system-bar.tsx');
   const {scaledWindowDocument}=await import('/src/demo/scaled-window-prototype.tsx');
   const {materializeLocalWorkspace,createWorkspaceSaveBundle,materializeWorkspace}=await import('/src/reactive-editor/workspace-manifest.ts');
   const {render}=await import('/node_modules/.vite/deps/solid-js_web.js'); const {createComponent}=await import('/node_modules/.vite/deps/solid-js.js');
   const doc=structuredClone(scaledWindowDocument); Object.assign(doc.metadata,{folder:'notes',filename:'Scale.json'});
   const dto={id:'workspace',type:'workspace-block',children:[
     {id:'one',type:'document-window-block',metadata:{title:'First',position:{x:20,y:40},size:{w:1000,h:640}},children:[doc]},
     {id:'two',type:'document-window-block',metadata:{title:'Second',state:'minimized',position:{x:1100,y:40},size:{w:900,h:600}},children:[structuredClone(doc)]},
     {id:'image',type:'image-block',metadata:{url:'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='}}
   ]};
   const session=new WorkspaceSession(materializeLocalWorkspace(dto),{features:{canvasWorkspace:true}});
   document.body.replaceChildren(); const host=document.createElement('main'); host.className='workspace-demo workspace-demo--canonical'; document.body.append(host);
   const dispose=render(()=>[
     createComponent(CodexSystemBar,{get children(){return createComponent(WorkspacePresentations,{session,menu:true})}}),
     createComponent(WorkspacePresentationView,{session})
   ],host);
   session.editor.installGateway(document);
   const node=id=>Object.values(session.projection.state.nodes).find(n=>n.payload.id===id);
   const frame=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(r,80))));
   window.q={session,editor:session.editor,projection:session.projection,host,node,frame,
     flow:id=>session.editor.mounts.get(node(id).key).focusElement,
     text:id=>session.editor.node(node(id).key).inlineContent.map(k=>session.editor.node(k).payload.text).join(''),
     dispose:()=>{dispose();session.dispose()},
     roundtrip:async()=>{const s=session.editor.persistence.captureWorkspace(),b=await createWorkspaceSaveBundle(s.repository,[],'workspace',s.presentation);
       const local=new WorkspaceSession(materializeLocalWorkspace(JSON.parse(JSON.stringify(s.document))),{features:{canvasWorkspace:true}});
       const server=new WorkspaceSession(materializeWorkspace(b.manifest,new Map(b.documents.map(d=>[d.documentId,d.document]))),{features:{canvasWorkspace:true}});
       const result={local:local.presentation.active(),server:server.presentation.active(),same:JSON.stringify(local.presentation.read())===JSON.stringify(server.presentation.read()),documents:b.documents.length};local.dispose();server.dispose();return result;}
   };
   q.baseline=JSON.stringify(q.editor.encodeWorkspace());q.keys=Object.keys(q.projection.state.nodes);
   await frame();
 })()`);
 const mouse=(type,p,modifiers=0)=>send('Input.dispatchMouseEvent',{type,...p,button:'left',buttons:type==='mouseReleased'?0:1,clickCount:1,modifiers},sessionId);
 const click=async selector=>{
   const p=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw new Error('Missing '+${JSON.stringify(selector)});const r=e.getBoundingClientRect(),p={x:r.left+r.width/2,y:r.top+r.height/2};if(!e.contains(document.elementFromPoint(p.x,p.y)))throw new Error('Obscured '+${JSON.stringify(selector)});return p})()`);
   await mouse('mousePressed',p);await mouse('mouseReleased',p);await evaluate('q.frame()');
 };
 const key=async(key,code=key,modifiers=0)=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key,code,modifiers,...(key==='Enter'?{text:'\r'}:{}),windowsVirtualKeyCode:({ArrowRight:39,ArrowLeft:37,ArrowDown:40,Escape:27,Enter:13})[key]},sessionId);await send('Input.dispatchKeyEvent',{type:'keyUp',key,code},sessionId);await evaluate('q.frame()');};
 await evaluate(`q.flow('native').focus();q.flow('native').setSelectionRange(2,5)`);
 await click('[data-system-menu-trigger="workspace"]');await key('ArrowRight');
 check('submenu right-arrow focuses Desktop',await evaluate('document.activeElement.textContent'),'Desktop✓');
 await key('ArrowDown'); await key('Enter');
 check('menu selects Canvas',await evaluate('q.session.presentation.active()'),'canvas');
 check('menu closes after selection',await evaluate('!!document.querySelector("[data-system-menu=workspace]")'),false);
 check('focus and native selection restored',await evaluate(`({focused:document.activeElement===q.flow('native'),start:q.flow('native').selectionStart,end:q.flow('native').selectionEnd})`),{focused:true,start:2,end:5});
 check('both document Windows mount normally',await evaluate('document.querySelectorAll(".reactive-window").length'),2);
 check('Desktop controls absent on Canvas',await evaluate(`document.querySelectorAll('[aria-label="Close window"],[aria-label="Minimize window"],.reactive-window__resize').length`),0);
 check('one projection',await evaluate('q.editor.projections.size'),1);
 check('no duplicate occurrence roots',await evaluate(`(()=>{const keys=[...document.querySelectorAll('[data-runtime-key]')].map(e=>e.dataset.runtimeKey);return keys.length===new Set(keys).size})()`),true);
 await evaluate(`q.native=q.flow('native');q.flow('native').focus();q.flow('native').setSelectionRange(0,0)`);
 await send('Input.insertText',{text:'Typed '},sessionId);await evaluate('q.frame()');
 check('native typing keeps the mount',await evaluate(`q.flow('native')===q.native&&q.native.value.startsWith('Typed Native')`),true);
 await evaluate(`q.session.selectPresentation('desktop');q.editor.repository.undo();q.frame()`);
 check('Desktop restores minimized Window',await evaluate('document.querySelectorAll("[data-window-icon]").length'),1);
 check('undo crosses presentation switch',await evaluate(`q.flow('native').value`),'Native text field');
 for(const scale of [.5,1,2]) {
   await evaluate(`q.session.selectPresentation('canvas');q.session.presentation.setCamera({x:0,y:0,zoom:${scale}});q.frame()`);
   await evaluate(`q.flow('a').focus();q.editor.mounts.get(q.node('a').key).restoreInlineSelection({anchor:0,head:0})`);
   await send('Input.insertText',{text:'C '},sessionId);await evaluate('q.frame()');
   check(scale+'x standoff native typing',await evaluate(`q.text('a').startsWith('C Blake')`),true);
   await evaluate('q.editor.repository.undo();q.frame()');
   const alignment=await evaluate(`(()=>{const flow=q.flow('a'),range=document.createRange();range.setStart(flow.children[0].firstChild,0);range.setEnd(flow.children[200].firstChild,1);const first=[...range.getClientRects()].find(r=>r.width>0);const path=flow.closest('.reactive-standoff-surface').querySelector('[data-property-type="codex/entity-reference"]');const n=path.getAttribute('d').split(' '),p=new DOMPoint(+n[1],+n[2]).matrixTransform(path.ownerSVGElement.getScreenCTM());return {x:p.x,y:p.y,left:first.left,bottom:first.bottom}})()`);
   assert.ok(Math.abs(alignment.x-alignment.left)<.3&&Math.abs(alignment.y-alignment.bottom-1.5*scale)<.3,JSON.stringify(alignment));checks.push(scale+'x SVG alignment');
   await evaluate(`q.session.selectPresentation('desktop');q.session.selectPresentation('canvas');q.frame()`);
   check(scale+'x existing camera survives switch',await evaluate('q.session.presentation.read().presentations.canvas.camera.zoom'),scale);
 }
 await evaluate("q.session.presentation.setCamera({x:0,y:0,zoom:1});q.frame()");
 const point=async(id,index)=>evaluate(`(()=>{const r=q.flow('${id}').children[${index}].getBoundingClientRect();return{x:r.left+.1,y:r.top+r.height/2}})()`);
 const drag=async(a,b,control=false)=>{const start=await point(...a),end=await point(...b);await mouse('mousePressed',start,control?2:0);await mouse('mouseMoved',end,control?2:0);await mouse('mouseReleased',end,control?2:0);await evaluate('q.frame()');};
 await evaluate('q.editor.crossText.enable(true)');
 await drag(['a',2],['b',4]);
 check('cross-Block native selection in composed Canvas',await evaluate('Object.keys(q.editor.crossText.segments).length>=2'),true);
 await key('Escape');
 await drag(['a',0],['a',5],true);
 check('Grouping in composed Canvas',await evaluate('(q.editor.currentTextOperation.annotationOperation()?.annotationTargets()??[]).map(r=>[r.start,r.end])'),[[0,5]]);
 await evaluate("q.session.selectPresentation('desktop');q.session.selectPresentation('canvas');q.frame()");
 check('Grouping targets survive root remount',await evaluate('(q.editor.currentTextOperation.annotationOperation()?.annotationTargets()??[]).map(r=>[r.start,r.end])'),[[0,5]]);
 await key('Escape');
 await evaluate(`q.editor.crossText.clear();q.editor.crossText.enable(false);q.flow('a').focus();q.editor.mounts.get(q.node('a').key).restoreInlineSelection({anchor:0,head:5});window.originalFetch=window.fetch;window.fetch=async url=>String(url).startsWith('/api/')?({ok:true,json:async()=>({Success:true,Results:[{id:'blake',name:'Blake'}],Count:1,Page:1,MaxPage:1})}):originalFetch(url)`);
 await key(';','Semicolon',2);await key('r','KeyR');await evaluate('new Promise(r=>setTimeout(r,400))');
 check('single Entity panel outside transformed world',await evaluate(`document.querySelectorAll('.reactive-entity-search').length===1&&!document.querySelector('.workspace-canvas__world').contains(document.querySelector('.reactive-entity-search'))`),true);
 check('open panel prevents switching',await evaluate("q.session.selectPresentation('desktop')"),false);
 await key('Escape');await evaluate('q.frame();window.fetch=originalFetch');
 check('Entity restores inline selection',await evaluate('document.getSelection().toString()'),'Blake');
 await evaluate("q.flow('a').focus();q.editor.mounts.get(q.node('a').key).restoreInlineSelection({anchor:5,head:5})");
 await send('Input.imeSetComposition',{text:'語',selectionStart:1,selectionEnd:1},sessionId);
 check('switch waits for native composition',await evaluate("q.session.selectPresentation('desktop')"),false);
 await send('Input.insertText',{text:'語'},sessionId);await evaluate('q.frame()');
 check('composition commits before Desktop mounts',await evaluate("q.session.presentation.active()==='desktop'&&q.text('a').startsWith('Blake語')"),true);
 await evaluate("q.editor.repository.undo();q.session.selectPresentation('canvas');q.frame()");
 await evaluate(`q.layoutBeforeCompact=JSON.stringify(q.session.presentation.read().presentations.canvas);q.widthBefore=document.querySelector('[data-canvas-placement="canvas:block:one"] .reactive-window').getBoundingClientRect().width`);
 await click('[data-canvas-placement="canvas:block:one"] .compact-document-toggle');
 check('Compact works on the static Canvas Window',await evaluate(`document.querySelector('[data-canvas-placement="canvas:block:one"] .compact-document-toggle').getAttribute('aria-pressed')`),'true');
 check('Compact does not persist narrowed bounds',await evaluate('JSON.stringify(q.session.presentation.read().presentations.canvas)===q.layoutBeforeCompact'),true);
 await click('[data-canvas-placement="canvas:block:one"] .compact-document-toggle');
 check('Compact restores expanded width',await evaluate(`Math.abs(document.querySelector('[data-canvas-placement="canvas:block:one"] .reactive-window').getBoundingClientRect().width-q.widthBefore)<.3`),true);
 check('projection identity keys retained',await evaluate('JSON.stringify(Object.keys(q.projection.state.nodes))===JSON.stringify(q.keys)'),true);
 check('Desktop metadata retained',await evaluate(`JSON.stringify(q.editor.encodeWorkspace().children.map(c=>c.metadata))===JSON.stringify(JSON.parse(q.baseline).children.map(c=>c.metadata))`),true);
 check('local/server roundtrip',await evaluate('q.roundtrip()'),{local:'canvas',server:'canvas',same:true,documents:1});
 await evaluate('q.dispose()');
 console.log(JSON.stringify({browser:await send('Browser.getVersion'),checks},null,2));
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
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
