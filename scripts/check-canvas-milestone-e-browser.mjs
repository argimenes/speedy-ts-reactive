// Canvas Milestone E: explicit reverse derivation and independent presentations.
// Node 22+, CHROME_BIN and BENCHMARK_URL supported. Isolated Chrome profile,
// Vite dev server required; in-memory fixtures and captured DTOs only.
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import path from 'node:path';
const profile = await mkdtemp(path.join(tmpdir(), 'speedy-presentation-check-'));
const chrome = spawn(process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--disk-cache-size=1', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank']);
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
 await send('Page.navigate',{url:process.env.BENCHMARK_URL ?? 'http://localhost:5187/'},sessionId);
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
   const objects=['one','two','image','counter','unknown','missing'].map(id=>({id,label:id,target:{kind:'block',blockId:id}}));
   const bounds=[{x:100,y:100,width:1000,height:680},{x:1220,y:100,width:1000,height:680},
     {x:0,y:800,width:300,height:240},{x:400,y:800,width:300,height:240},
     {x:800,y:800,width:300,height:240},{x:1200,y:800,width:300,height:240}];
   const dto={id:'workspace',type:'workspace-block',metadata:{workspacePresentation:{version:1,active:'canvas',objects,
     presentations:{canvas:{version:1,camera:{x:0,y:0,zoom:1},placements:objects.map((o,i)=>({id:'p-'+o.id,objectId:o.id,order:i,bounds:bounds[i]}))},future:'retain'}}},children:[
     {id:'bank',type:'workspace-object-bank-block',children:[
       {id:'one',type:'document-window-block',metadata:{title:'First',position:{x:20,y:40},size:{w:1000,h:640}},children:[doc]},
       {id:'two',type:'document-window-block',metadata:{title:'Second',state:'minimized',position:{x:1100,y:40},size:{w:900,h:600}},children:[structuredClone(doc)]},
       {id:'image',type:'image-block',metadata:{url:'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='}},
       {id:'counter',type:'canvas-counter-block',count:5},
       {id:'unknown',type:'future-block',custom:{retain:true}},
       {id:'unplaced',type:'image-block',metadata:{title:'Unplaced'}}
     ]}
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
     second:()=>session.editor.mounts.get(Object.values(session.projection.state.nodes).find(n=>n.payload.id==='native'&&session.editor.blockQueries.ancestors(n.key).some(a=>a.payload.id==='two')).key).focusElement,
     text:id=>session.editor.node(node(id).key).inlineContent.map(k=>session.editor.node(k).payload.text).join(''),
     dispose:()=>{dispose();session.dispose()},
     roundtrip:async()=>{const s=session.editor.persistence.captureWorkspace(),b=await createWorkspaceSaveBundle(s.repository,[],'workspace',s.presentation);
       const local=new WorkspaceSession(materializeLocalWorkspace(JSON.parse(JSON.stringify(s.document))),{features:{canvasWorkspace:true}});
       const server=new WorkspaceSession(materializeWorkspace(b.manifest,new Map(b.documents.map(d=>[d.documentId,d.document]))),{features:{canvasWorkspace:true}});
       const result={local:local.presentation.active(),server:server.presentation.active(),same:JSON.stringify(local.presentation.read())===JSON.stringify(server.presentation.read()),documents:b.documents.length};local.dispose();server.dispose();return result;}
   };
   q.baseline=JSON.stringify(q.editor.encodeWorkspace());q.contents=Object.values(q.editor.repository.state.contents).filter(c=>['document-block','image-block','canvas-counter-block'].includes(c.viewType)).map(c=>c.key);q.canvas=JSON.stringify(session.presentation.read().presentations.canvas);
   await frame();
 })()`);
 const mouse=(type,p,modifiers=0)=>send('Input.dispatchMouseEvent',{type,...p,button:'left',buttons:type==='mouseReleased'?0:1,clickCount:1,modifiers},sessionId);
 const click=async selector=>{
   const p=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw new Error('Missing '+${JSON.stringify(selector)});const r=e.getBoundingClientRect(),p={x:r.left+r.width/2,y:r.top+r.height/2};if(!e.contains(document.elementFromPoint(p.x,p.y)))throw new Error('Obscured '+${JSON.stringify(selector)});return p})()`);
   await mouse('mousePressed',p);await mouse('mouseReleased',p);await evaluate('q.frame()');
 };
 const key=async(key,code=key,modifiers=0)=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key,code,modifiers,...(key==='Enter'?{text:'\r'}:{}),windowsVirtualKeyCode:({ArrowRight:39,ArrowLeft:37,ArrowDown:40,Escape:27,Enter:13})[key]},sessionId);await send('Input.dispatchKeyEvent',{type:'keyUp',key,code},sessionId);await evaluate('q.frame()');};
 check('Canvas-only starts without Desktop',await evaluate('q.session.canCreateDesktop()'),true);
 check('ordinary selection does not derive',await evaluate("q.session.selectPresentation('desktop')"),false);
 check('open/select/save do not reparent',await evaluate('q.editor.persistence.captureWorkspace();JSON.stringify(q.editor.encodeWorkspace())===q.baseline'),true);
 await evaluate(`q.second().focus();q.second().setSelectionRange(2,5)`);
 await click('[data-system-menu-trigger="workspace"]');await key('ArrowRight');
 check('missing Desktop is disabled in submenu',await evaluate(`[...document.querySelectorAll('[role=menuitemradio]')].find(e=>e.textContent==='Desktop').disabled`),true);
 await key('ArrowDown');await key('Enter');
 check('explicit menu action derives Desktop',await evaluate('q.session.presentation.active()'),'desktop');
 check('menu closes',await evaluate('!!document.querySelector("[data-system-menu=workspace]")'),false);
 check('focus stays with second shared-document occurrence',await evaluate(`({focused:document.activeElement===q.second(),start:q.second().selectionStart,end:q.second().selectionEnd})`),{focused:true,start:2,end:5});
 check('unsupported objects reported',await evaluate("q.session.notice().includes('unknown (unsupported')&&q.session.notice().includes('missing (missing)')"),true);
 check('four Windows, reused or wrapped',await evaluate('document.querySelectorAll(".reactive-window").length'),4);
 check('bank keeps unsupported and unplaced content',await evaluate(`q.node('bank').children.map(k=>q.editor.node(k).payload.id)`),['unknown','unplaced']);
 check('authored content keys retained',await evaluate('q.contents.every(k=>!!q.editor.repository.state.contents[k])'),true);
 check('Canvas geometry unchanged by derivation',await evaluate('JSON.stringify(q.session.presentation.read().presentations.canvas)===q.canvas'),true);
 check('Desktop host mapping keeps inner image target',await evaluate(`q.session.presentation.read().objects.find(o=>o.id==='image')`),{id:'image',label:'image',target:{kind:'block',blockId:'image'},desktopHostBlockId:'desktop:image'});
 check('local/server roundtrip retains one shared Document',await evaluate('q.roundtrip()'),{local:'desktop',server:'desktop',same:true,documents:1});
 await send('Input.insertText',{text:'E '},sessionId);await evaluate('q.frame()');
 check('Desktop native typing updates both shared occurrences',await evaluate(`[q.flow('native').value,q.second().value]`),['NaE e text field','NaE e text field']);
 await evaluate('q.editor.repository.undo();q.frame()');
 const rect=selector=>evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2}})()`);
 const move=async(selector,dx,dy)=>{const p=await rect(selector),end={x:p.x+dx,y:p.y+dy};await mouse('mousePressed',p);await mouse('mouseMoved',end);await mouse('mouseReleased',end);await evaluate('q.frame()');};
 await evaluate(`q.firstSelector='[data-runtime-key="'+q.node('one').key+'"]';q.beforeMeta=JSON.parse(JSON.stringify(q.node('one').payload.metadata))`);
 const first=await evaluate('q.firstSelector');
 await move(first+' .reactive-window__header',35,25);
 check('real Desktop drag updates its own position',await evaluate(`({x:q.node('one').payload.metadata.position.x-q.beforeMeta.position.x,y:q.node('one').payload.metadata.position.y-q.beforeMeta.position.y})`),{x:35,y:25});
 await move(first+' .reactive-window__resize',40,30);
 check('real Desktop resize updates expanded geometry',await evaluate(`({w:q.node('one').payload.metadata.size.w-q.beforeMeta.size.w,h:q.node('one').payload.metadata.size.h-q.beforeMeta.size.h})`),{w:40,h:30});
 check('Desktop move/resize leaves Canvas intact',await evaluate('JSON.stringify(q.session.presentation.read().presentations.canvas)===q.canvas'),true);
 await evaluate(`q.desktop=JSON.stringify(q.node('one').payload.metadata);q.session.selectPresentation('canvas');q.frame()`);
 check('Counter is still directly mounted on Canvas',await evaluate(`!!document.querySelector('[data-canvas-placement="p-counter"] .canvas-counter')`),true);
 await move('[data-canvas-placement="p-one"] .workspace-canvas__handle',50,30);
 check('real Canvas drag changes only Canvas bounds',await evaluate(`({bounds:q.session.presentation.read().presentations.canvas.placements[0].bounds,desktop:JSON.stringify(q.node('one').payload.metadata)===q.desktop})`),{bounds:{x:150,y:130,width:1000,height:680},desktop:true});
 await evaluate(`q.canvas=JSON.stringify(q.session.presentation.read().presentations.canvas);q.flow('a').focus();q.editor.mounts.get(q.node('a').key).restoreInlineSelection({anchor:0,head:0})`);
 await send('Input.insertText',{text:'Canvas '},sessionId);await evaluate('q.frame()');
 check('Canvas standoff typing after reparenting',await evaluate(`q.text('a').startsWith('Canvas Blake')`),true);
 await evaluate('q.editor.repository.undo();q.frame()');
 for(const view of ['desktop','canvas','desktop','canvas']) {
   await evaluate(`q.session.selectPresentation('${view}');q.frame()`);
   check(view+' switch retains independent layouts',await evaluate(`JSON.stringify(q.node('one').payload.metadata)===q.desktop&&JSON.stringify(q.session.presentation.read().presentations.canvas)===q.canvas`),true);
   check(view+' no duplicate mounted occurrence roots',await evaluate(`(()=>{const keys=[...document.querySelectorAll('[data-runtime-key]')].map(e=>e.dataset.runtimeKey);return keys.length===new Set(keys).size})()`),true);
 }
 await evaluate(`q.session.presentation.setCamera({x:0,y:0,zoom:.5});q.frame()`);
 const alignment=await evaluate(`(()=>{const flow=q.flow('a'),range=document.createRange();range.setStart(flow.children[0].firstChild,0);range.setEnd(flow.children[200].firstChild,1);const first=[...range.getClientRects()].find(r=>r.width>0);const path=flow.closest('.reactive-standoff-surface').querySelector('[data-property-type="codex/entity-reference"]');const n=path.getAttribute('d').split(' '),p=new DOMPoint(+n[1],+n[2]).matrixTransform(path.ownerSVGElement.getScreenCTM());return {x:p.x,y:p.y,left:first.left,bottom:first.bottom}})()`);
 assert.ok(Math.abs(alignment.x-alignment.left)<.3&&Math.abs(alignment.y-alignment.bottom-.75)<.3,JSON.stringify(alignment));checks.push('SVG alignment after reparenting and switching at .5x');
 check('save/reopen from Canvas preserves independent layouts',await evaluate('q.roundtrip()'),{local:'canvas',server:'canvas',same:true,documents:1});
 check('existing Desktop refuses another derivation',await evaluate('q.session.createDesktop()'),false);
 check('one editor projection',await evaluate('q.editor.projections.size'),1);
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
