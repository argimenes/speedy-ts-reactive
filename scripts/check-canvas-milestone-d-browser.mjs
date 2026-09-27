// Canvas Milestone D: inherited editing checks plus owned interactions, apps and media.
// Node 22+, CHROME_BIN and BENCHMARK_URL supported. Isolated Chrome profile,
// Vite dev server required; in-memory fixtures and captured DTOs only.
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import path from 'node:path';
const profile = await mkdtemp(path.join(tmpdir(), 'speedy-presentation-check-'));
const chrome = spawn(process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', ...(process.env.CANVAS_SOFTWARE_GPU === '0' ? [] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']), '--disk-cache-size=1', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank']);
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

 await evaluate(`(async()=>{q.actions=(await import('/src/application/canvas-actions.ts')).canvasActions(q.session);q.actions.order('canvas:block:one',Infinity);q.bounds=()=>q.session.presentation.read().presentations.canvas.placements.find(p=>p.id==='canvas:block:one').bounds;q.session.presentation.setBounds('canvas:block:one',{x:100,y:180,width:1000,height:640});await q.frame()})()`);
 const handle='[data-canvas-placement="canvas:block:one"] .workspace-canvas__handle';
 const rect=async selector=>evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();const point={x:r.left+r.width/2,y:r.top+r.height/2};const e=document.querySelector(${JSON.stringify(selector)});if(!e.contains(document.elementFromPoint(point.x,point.y)))throw new Error('Obscured '+${JSON.stringify(selector)}+' by '+document.elementFromPoint(point.x,point.y)?.outerHTML.slice(0,300));return point})()`);
 for(const scale of [.5,1,2]) {
   await evaluate(`q.session.presentation.setCamera({x:0,y:0,zoom:${scale}});q.repo=q.editor.repository.state.revision;q.before=q.bounds();q.dom=q.flow('a');q.beforeRevision=q.session.presentation.capture().revision;q.frame()`);
   const start=await rect(handle), end={x:start.x+60,y:start.y+40};
   await mouse('mousePressed',start);await mouse('mouseMoved',end);await evaluate('q.frame()');
   check(scale+'x move preview does not commit',await evaluate('q.session.presentation.capture().revision===q.beforeRevision&&q.editor.repository.state.revision===q.repo'),true);
   check(scale+'x gesture owns shield',await evaluate('!!document.querySelector("[data-canvas-shield]")'),true);
   await mouse('mouseReleased',end);await evaluate('q.frame()');
   check(scale+'x local movement and one commit',await evaluate(`({dx:q.bounds().x-q.before.x,dy:q.bounds().y-q.before.y,revisions:q.session.presentation.capture().revision-q.beforeRevision,same:q.flow('a')===q.dom,shield:!!document.querySelector('[data-canvas-shield]')})`),{dx:60/scale,dy:40/scale,revisions:1,same:true,shield:false});
   const before=await evaluate('q.bounds()'), rs=await rect('[data-canvas-placement="canvas:block:one"] .workspace-canvas__resize');
   await mouse('mousePressed',rs);await mouse('mouseMoved',{x:rs.x+40,y:rs.y+20});await mouse('mouseReleased',{x:rs.x+40,y:rs.y+20});await evaluate('q.frame()');
   const after=await evaluate('q.bounds()');check(scale+'x resize in local units',{w:after.width-before.width,h:after.height-before.height},{w:40/scale,h:20/scale});
   // Keep every handle visible at the next zoom level.
   await evaluate("q.session.presentation.setBounds('canvas:block:one',{x:100,y:180,width:900,height:600});q.frame()");
 }
 await evaluate("q.session.presentation.setCamera({x:0,y:0,zoom:1});q.frame()");
 for(const cancel of ['Escape','blur','lostpointercapture','pointercancel','switch']) {
   const start=await rect(handle);await evaluate('q.before=q.bounds()');await mouse('mousePressed',start);await mouse('mouseMoved',{x:start.x+80,y:start.y+90});await evaluate('q.frame()');
   if(cancel==='Escape') await key('Escape');
   else if(cancel==='blur') await evaluate("window.dispatchEvent(new Event('blur'))");
   else if(cancel==='switch') await evaluate("q.session.selectPresentation('desktop');q.session.selectPresentation('canvas');q.frame()");
   else await evaluate(`document.querySelector(${JSON.stringify(handle)}).dispatchEvent(new PointerEvent('${cancel}',{pointerId:1,bubbles:true}))`);
   await mouse('mouseReleased',{x:start.x+80,y:start.y+90});await evaluate('q.frame()');
   check(cancel+' cancels without persisting preview',await evaluate('JSON.stringify(q.bounds())===JSON.stringify(q.before)&&!document.querySelector("[data-canvas-shield]")'),true);
 }
 {const start=await rect(handle);await evaluate('q.before=q.bounds()');await mouse('mousePressed',start);await mouse('mouseMoved',{x:2450,y:1850});await mouse('mouseReleased',{x:2450,y:1850});await evaluate('q.frame()');
 check('pointer completion outside viewport releases capture',await evaluate('q.bounds().x>2000&&!document.querySelector("[data-canvas-shield]")'),true);
 await evaluate("q.session.presentation.setBounds('canvas:block:one',q.before);q.frame()");}
 // Snapshot must settle the newest pointer delta even before its animation frame.
 {const start=await rect(handle);await evaluate('q.before=q.bounds()');await mouse('mousePressed',start);await mouse('mouseMoved',{x:start.x+30,y:start.y+20});
 check('save settles owned gesture',await evaluate(`(()=>{const s=q.editor.persistence.captureWorkspace();return s.presentation.value.presentations.canvas.placements.find(p=>p.id==='canvas:block:one').bounds.x===q.before.x+30&&!document.querySelector('[data-canvas-shield]')})()`),true);await mouse('mouseReleased',{x:start.x+30,y:start.y+20});}
 await click(handle);await evaluate('q.before=q.bounds()');await key('ArrowRight');check('chrome arrow nudge',await evaluate('q.bounds().x-q.before.x'),10);
 await evaluate("q.flow('native').focus();q.flow('native').setSelectionRange(0,1);q.placementCount=q.session.presentation.read().presentations.canvas.placements.length");await key('Backspace');
 check('native Backspace does not remove placement',await evaluate('q.session.presentation.read().presentations.canvas.placements.length===q.placementCount'),true);
 await evaluate('q.editor.repository.undo();q.frame()');
 // Compact resize changes expanded geometry by the local drag delta, not by the narrowed DOM width.
 await click('[data-canvas-placement="canvas:block:one"] .compact-document-toggle');await click(handle);
 await evaluate('q.before=q.bounds();q.compactWidth=document.querySelector("[data-canvas-placement=\\"canvas:block:one\\"] .reactive-window").getBoundingClientRect().width');
 {const start=await rect('[data-canvas-placement="canvas:block:one"] .workspace-canvas__resize');await mouse('mousePressed',start);await mouse('mouseMoved',{x:start.x+40,y:start.y});await mouse('mouseReleased',{x:start.x+40,y:start.y});await evaluate('q.frame()');}
 check('Compact resize preserves expanded-width delta',await evaluate('q.bounds().width-q.before.width'),40);
 await click('[data-canvas-placement="canvas:block:one"] .compact-document-toggle');
 check('expanded width restored after Compact resize',await evaluate('Math.abs(document.querySelector("[data-canvas-placement=\\"canvas:block:one\\"] .reactive-window").getBoundingClientRect().width-q.bounds().width)<1'),true);
 // Background pan and anchored Alt-wheel zoom; interiors retain native wheel.
 await evaluate('q.cameraBefore=q.session.presentation.read().presentations.canvas.camera;q.frame()');
 await mouse('mousePressed',{x:2200,y:1500});await mouse('mouseMoved',{x:2250,y:1530});await mouse('mouseReleased',{x:2250,y:1530});await evaluate('q.frame()');
 check('background pan commits world offset',await evaluate('q.session.presentation.read().presentations.canvas.camera.x-q.cameraBefore.x'),-50);
 await evaluate('q.cameraBefore=q.session.presentation.read().presentations.canvas.camera;q.viewport=document.querySelector(".workspace-canvas").getBoundingClientRect();q.anchor={x:2200-q.viewport.left,y:1500-q.viewport.top}');
 await send('Input.dispatchMouseEvent',{type:'mouseWheel',x:2200,y:1500,deltaY:-120,deltaX:0,modifiers:1},sessionId);await evaluate('new Promise(r=>setTimeout(r,250))');
 check('Alt-wheel stays anchored',await evaluate('(()=>{const a=q.cameraBefore,b=q.session.presentation.read().presentations.canvas.camera;return b.zoom>a.zoom&&Math.abs(a.x+q.anchor.x/a.zoom-b.x-q.anchor.x/b.zoom)<.01})()'),true);
 await evaluate('q.cameraBefore=JSON.stringify(q.session.presentation.read().presentations.canvas.camera)');
 {const p=await rect('[data-canvas-placement="canvas:block:one"] textarea');await send('Input.dispatchMouseEvent',{type:'mouseWheel',...p,deltaY:60,deltaX:0},sessionId);await evaluate('q.frame()');}
 check('native interior wheel leaves camera alone',await evaluate('JSON.stringify(q.session.presentation.read().presentations.canvas.camera)===q.cameraBefore'),true);
 await evaluate("q.session.presentation.setCamera({x:0,y:0,zoom:1});q.counter=q.actions.create('counter','Inline pilot');q.frame()");
 await click('[aria-label="Increase counter"]');

 check('inline runtime application updates authored count',await evaluate('document.querySelector(".canvas-counter output").textContent'),'1');
 await evaluate("q.session.selectPresentation('desktop');q.session.selectPresentation('canvas');q.frame()");
 check('inline application survives remount',await evaluate('document.querySelector(".canvas-counter output").textContent'),'1');
 await evaluate("q.actions.remove(q.counter);q.actions.add(q.session.presentation.read().objects.find(o=>o.label==='Inline pilot').id);q.frame()");
 check('remove/re-add retains app state',await evaluate('document.querySelector(".canvas-counter output").textContent'),'1');
 await evaluate("q.createdDocument=q.actions.create('document','Bank document');q.frame()");
 check('new document local/server roundtrip',await evaluate('q.roundtrip()'),{local:'canvas',server:'canvas',same:true,documents:2});
 // Image host resizing preserves intrinsic aspect through object-fit: contain.
 await evaluate("q.image=q.actions.create('image','data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==');q.session.presentation.setBounds(q.image,{x:1800,y:1100,width:360,height:240});q.frame()");
 check('direct image uses bounded host and aspect-preserving fit',await evaluate("(()=>{const e=document.querySelector('[data-canvas-placement=\"'+q.image+'\"] img');return getComputedStyle(e).objectFit==='contain'&&Math.abs(e.getBoundingClientRect().width-360)<1})()"),true);
 await evaluate("q.actions.remove(q.image);q.frame()");
 // Keep a record of actual animation-frame cadence and content/mount invariants.
 const profiles=[];
 for(const cohort of ['representative','larger']) {
   if(cohort==='larger') await evaluate(`(()=>{for(let i=0;i<20;i++){const id=q.actions.create('document','Profile '+i);const root=q.session.canvasRoots().find(r=>r.placement.id===id).nodeKey;const window=q.projection.state.nodes[root],doc=q.projection.state.nodes[window.children[0]],text=doc.children[0];q.editor.commands.replaceInlineRange(text,0,0,'Canvas profile text with native editing. '.repeat(12));q.session.presentation.setBounds(id,{x:1500+i%5*880,y:300+Math.floor(i/5)*700,width:840,height:620});}return q.frame()})()`);
   const result=await evaluate(`(async()=>{
     const digest=async()=>{const bytes=new TextEncoder().encode(JSON.stringify(q.editor.encodeWorkspace()));return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('')};
     const before=await digest(),revision=q.editor.repository.state.revision,layoutRevision=q.session.presentation.revision();
     const mounts=[...document.querySelectorAll('[data-runtime-key]')],viewport=document.querySelector('.workspace-canvas');
     const deltas=[];let previous=performance.now();
     for(let i=0;i<90;i++){await new Promise(requestAnimationFrame);const now=performance.now();deltas.push(now-previous);previous=now;viewport.dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY:i%30<15?-5:5,altKey:true,clientX:2200,clientY:1500}));}
     await new Promise(r=>setTimeout(r,220));
     const sorted=deltas.slice(3).sort((a,b)=>a-b),after=[...document.querySelectorAll('[data-runtime-key]')];
     return {objects:q.session.presentation.read().presentations.canvas.placements.length,mounts:mounts.length,frames:sorted.length,medianMs:sorted[Math.floor(sorted.length*.5)],p95Ms:sorted[Math.floor(sorted.length*.95)],maxMs:sorted.at(-1),authoredRevisionDelta:q.editor.repository.state.revision-revision,layoutRevisionDelta:q.session.presentation.revision()-layoutRevision,sameMounts:mounts.length===after.length&&mounts.every((e,i)=>e===after[i]),changed:after.filter(e=>!mounts.includes(e)).map(e=>({key:e.dataset.runtimeKey,type:e.dataset.blockType})),removed:mounts.filter(e=>!after.includes(e)).map(e=>({key:e.dataset.runtimeKey,type:e.dataset.blockType})),sameAuthoredHash:before===await digest()};
   })()`);
   if(!result.sameMounts) console.error(result);
   check(cohort+' camera frames preserve content and mounts',{revision:result.authoredRevisionDelta,mounts:result.sameMounts,hash:result.sameAuthoredHash},{revision:0,mounts:true,hash:true});
   profiles.push({cohort,...result});
 }

 // Direct iframe uses native DOM, shield only during outer gesture, explicit close before unmount.
 await evaluate(`q.editor.commands.insert({id:'frame',type:'iframe-block',metadata:{title:'Frame',url:'about:blank'}},{kind:'at',parentKey:q.projection.state.rootKey,index:0});q.frameId=q.actions.add(q.actions.candidates().find(o=>o.label==='Frame').id);q.actions.order(q.frameId,Infinity);q.session.presentation.setCamera({x:0,y:0,zoom:1});q.session.presentation.setBounds(q.frameId,{x:1400,y:600,width:500,height:300});q.frame()`);
 await evaluate(`const f=document.querySelector('[data-canvas-placement="canvas:block:frame"] iframe');f.contentDocument.body.innerHTML='<input aria-label="Embedded draft" value="unsaved">';f.contentDocument.querySelector('input').focus()`);
 check('iframe native field retains focus',await evaluate('document.activeElement.tagName'), 'IFRAME');
 const frameHandle='[data-canvas-placement="canvas:block:frame"] .workspace-canvas__handle';
 {const start=await rect(frameHandle);await mouse('mousePressed',start);await mouse('mouseMoved',{x:start.x+80,y:start.y+30});
 check('iframe shield exists only during outer drag',await evaluate('!!document.querySelector("[data-canvas-shield]")'),true);
 await mouse('mouseReleased',{x:start.x+80,y:start.y+30});await evaluate('q.frame()');
 check('iframe draft survives outer move',await evaluate('document.querySelector("[data-canvas-placement=\\"canvas:block:frame\\"] iframe").contentDocument.querySelector("input").value'), 'unsaved');
 check('iframe shield clears on completion',await evaluate('!!document.querySelector("[data-canvas-shield]")'),false);}
 check('iframe blocks silent switch',await evaluate("q.session.selectPresentation('desktop')"),false);
 check('iframe blocks silent removal',await evaluate("(()=>{try{q.actions.remove(q.frameId);return false}catch{return true}})()"),true);
 await evaluate("q.actions.media(q.frameId,true);q.frame()");check('explicit media close unmounts iframe',await evaluate('!!document.querySelector("[data-canvas-placement=\\"canvas:block:frame\\"] iframe")'),false);
 check('switch after explicit close',await evaluate("q.session.selectPresentation('desktop')"),true);

 await evaluate('q.dispose()');
 console.log(JSON.stringify({browser:await send('Browser.getVersion'),gpu:await send('SystemInfo.getInfo'),checks,profiles},null,2));
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
