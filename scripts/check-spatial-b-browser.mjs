// Canvas Milestone D: inherited editing checks plus owned interactions, apps and media.
// Node 22+, CHROME_BIN and BENCHMARK_URL supported. Isolated Chrome profile,
// Vite dev server required; in-memory fixtures and captured DTOs only.
import { spawn } from 'node:child_process';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
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
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false},sessionId);
 await send('Page.navigate',{url:process.env.BENCHMARK_URL ?? 'http://127.0.0.1:5188/'},sessionId);
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
   for(let i=0;i<6;i++)dto.children.push({id:'print-'+i,type:'image-block',metadata:{url:'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='}});
   const session=new WorkspaceSession(materializeLocalWorkspace(dto),{features:{canvasWorkspace:true,spatialWorkspace:true}});
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
       const local=new WorkspaceSession(materializeLocalWorkspace(JSON.parse(JSON.stringify(s.document))),{features:{canvasWorkspace:true,spatialWorkspace:true}});
       const server=new WorkspaceSession(materializeWorkspace(b.manifest,new Map(b.documents.map(d=>[d.documentId,d.document]))),{features:{canvasWorkspace:true,spatialWorkspace:true}});
       const result={local:local.presentation.active(),server:server.presentation.active(),same:JSON.stringify(local.presentation.read())===JSON.stringify(server.presentation.read()),documents:b.documents.length};local.dispose();server.dispose();return result;}
   };
   q.baseline=JSON.stringify(q.editor.encodeWorkspace());q.keyIds=['one','two','scale-document','page','a','b','native','source','margin','note'];q.keys=q.keyIds.map(id=>q.node(id).key);
   await frame();
 })()`);
 const mouse=(type,p,modifiers=0)=>send('Input.dispatchMouseEvent',{type,...p,button:'left',buttons:type==='mouseReleased'?0:1,clickCount:1,modifiers},sessionId);
 const click=async selector=>{
   const p=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw new Error('Missing '+${JSON.stringify(selector)});const r=e.getBoundingClientRect(),p={x:r.left+r.width/2,y:r.top+r.height/2};if(!e.contains(document.elementFromPoint(p.x,p.y)))throw new Error('Obscured '+${JSON.stringify(selector)});return p})()`);
   await mouse('mousePressed',p);await mouse('mouseReleased',p);await evaluate('q.frame()');
 };
 const key=async(key,code=key,modifiers=0)=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key,code,modifiers,...(key==='Enter'?{text:'\r'}:{}),windowsVirtualKeyCode:({Backspace:8,Delete:46,Control:17,ArrowRight:39,ArrowLeft:37,ArrowDown:40,Escape:27,Enter:13})[key]},sessionId);await send('Input.dispatchKeyEvent',{type:'keyUp',key,code},sessionId);await evaluate('q.frame()');};

 await evaluate("q.session.selectPresentation('spatial');q.frame()");
 check('browsing mounts no live Document',await evaluate('document.querySelectorAll(".reactive-window").length'),0);
 check('qualified activation',await evaluate("q.session.spatial.document.activate('block:one')"),true);
 await evaluate('q.frame()');
 await evaluate('new Promise(r=>setTimeout(r,400))');
 check('exactly one live Document',await evaluate('document.querySelectorAll(".reactive-window").length'),1);
 check('second activation denied',await evaluate("q.session.spatial.document.activate('block:two')"),false);
 check('one projection',await evaluate('q.editor.projections.size'),1);
 check('untransformed DOM ancestry',await evaluate(`(()=>{let e=q.flow('a');while(e){const s=getComputedStyle(e);if(s.transform!=='none'&&s.transform!=='matrix(1, 0, 0, 1, 0, 0)')return false;e=e.parentElement;}return true})()`),true);
 check('no duplicate occurrence roots',await evaluate(`(()=>{const keys=[...document.querySelectorAll('[data-runtime-key]')].map(e=>e.dataset.runtimeKey);return keys.length===new Set(keys).size})()`),true);
 await evaluate(`q.native=q.flow('native');q.flow('native').focus();q.flow('native').setSelectionRange(0,0)`);
 await send('Input.insertText',{text:'Typed '},sessionId);await evaluate('q.frame()');
 check('native typing keeps mount',await evaluate(`q.flow('native')===q.native&&q.native.value.startsWith('Typed Native')`),true);
 await evaluate('q.editor.repository.undo();q.frame()');
 check('undo native input',await evaluate("q.flow('native').value"),'Native text field');
 await evaluate('q.editor.repository.redo();q.frame()');
 check('redo native input',await evaluate("q.flow('native').value.startsWith('Typed Native')"),true);
 await evaluate('q.editor.repository.undo();q.frame()');
 await evaluate(`q.flow('a').focus();q.editor.mounts.get(q.node('a').key).restoreInlineSelection({anchor:0,head:0})`);
 await send('Input.insertText',{text:'C '},sessionId);await evaluate('q.frame()');
 check('standoff native typing',await evaluate(`q.text('a').startsWith('C Blake')`),true);
 await evaluate('q.editor.repository.undo();q.frame()');
   const alignment=await evaluate(`(()=>{const flow=q.flow('a'),range=document.createRange();range.setStart(flow.children[0].firstChild,0);range.setEnd(flow.children[200].firstChild,1);const first=[...range.getClientRects()].find(r=>r.width>0);const path=flow.closest('.reactive-standoff-surface').querySelector('[data-property-type="codex/entity-reference"]');const n=path.getAttribute('d').split(' '),p=new DOMPoint(+n[1],+n[2]).matrixTransform(path.ownerSVGElement.getScreenCTM());return {x:p.x,y:p.y,left:first.left,bottom:first.bottom}})()`);
   assert.ok(Math.abs(alignment.x-alignment.left)<.3&&Math.abs(alignment.y-alignment.bottom-1.5)<.3,JSON.stringify(alignment));checks.push('SVG alignment');
 const point=async(id,index)=>evaluate(`(()=>{const r=q.flow('${id}').children[${index}].getBoundingClientRect();return{x:r.left+.1,y:r.top+r.height/2}})()`);
 const drag=async(a,b,control=false)=>{const start=await point(...a),end=await point(...b);if(control)await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Control',code:'ControlLeft',modifiers:2,windowsVirtualKeyCode:17},sessionId);await mouse('mousePressed',start,control?2:0);await mouse('mouseMoved',end,control?2:0);await mouse('mouseReleased',end,control?2:0);if(control)await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Control',code:'ControlLeft',windowsVirtualKeyCode:17},sessionId);await evaluate('q.frame()');};
 await evaluate('q.editor.crossText.enable(true)');
 await drag(['a',2],['b',4]);
 check('cross-Block native selection in composed Spatial',await evaluate('Object.keys(q.editor.crossText.segments).length>=2'),true);
 await key('Escape');
 await drag(['a',0],['a',5],true);
 check('Grouping in composed Spatial',await evaluate('(q.editor.currentTextOperation.annotationOperation()?.annotationTargets()??[]).map(r=>[r.start,r.end])'),[[0,5]]);
 await evaluate("q.session.spatial.document.requestReturn(()=>q.session.spatial.document.release());q.session.spatial.document.activate('block:one');q.frame()");
 check('Grouping targets survive root remount',await evaluate('(q.editor.currentTextOperation.annotationOperation()?.annotationTargets()??[]).map(r=>[r.start,r.end])'),[[0,5]]);

 const grouped=await point('a',2);await mouse('mousePressed',grouped,2);await mouse('mouseReleased',grouped,2);await evaluate('q.frame()');
 check('Ctrl-click removes Grouping membership',await evaluate('(q.editor.currentTextOperation.annotationOperation()?.annotationTargets()??[]).length'),0);
 await drag(['a',0],['a',5],true);
 await evaluate("q.flow('native').focus();q.flow('native').setSelectionRange(17,17)");await key('Backspace');
 check('native control Backspace preserves grouped text',await evaluate("q.text('a').startsWith('Blake wrote')&&q.flow('native').value==='Native text fiel'"),true);
 await evaluate("q.editor.repository.undo();q.flow('a').focus();q.frame()");await drag(['a',0],['a',5],true);await key('Delete');
 check('Delete consumes only grouped text',await evaluate("q.text('a').startsWith(' wrote')"),true);
 await evaluate('q.editor.repository.undo();q.frame()');
 check('group deletion undo restores text',await evaluate("q.text('a').startsWith('Blake wrote')"),true);
 await key('Escape');
 await evaluate(`q.editor.crossText.clear();q.editor.crossText.enable(false);q.flow('a').focus();q.editor.mounts.get(q.node('a').key).restoreInlineSelection({anchor:0,head:5});window.originalFetch=window.fetch;window.fetch=async url=>String(url).startsWith('/api/')?({ok:true,json:async()=>({Success:true,Results:[{id:'blake',name:'Blake'}],Count:1,Page:1,MaxPage:1})}):originalFetch(url)`);
 await key(';','Semicolon',2);await key('r','KeyR');await evaluate('new Promise(r=>setTimeout(r,400))');
 check('single Entity panel outside transformed world',await evaluate(`document.querySelectorAll('.reactive-entity-search').length===1&&!document.querySelector('.workspace-spatial__document').contains(document.querySelector('.reactive-entity-search'))`),true);
 check('open panel prevents switching',await evaluate("q.session.spatial.document.requestReturn(()=>q.session.spatial.document.release())"),false);
 await key('Escape');await evaluate('q.frame();window.fetch=originalFetch');
 check('Entity restores inline selection',await evaluate('document.getSelection().toString()'),'Blake');
 await evaluate("q.flow('a').focus();q.editor.mounts.get(q.node('a').key).restoreInlineSelection({anchor:5,head:5})");
 await send('Input.imeSetComposition',{text:'語',selectionStart:1,selectionEnd:1},sessionId);
 check('return waits for native composition',await evaluate("q.session.spatial.document.requestReturn(()=>q.session.spatial.document.release())"),false);
 await send('Input.insertText',{text:'語'},sessionId);await evaluate('q.frame()');
 check('composition commits before proxy returns',await evaluate("!q.session.spatial.document.active()&&q.text('a').startsWith('Blake語')"),true);
 await evaluate("q.editor.repository.undo();q.session.spatial.document.activate('block:one');q.frame()");
 await evaluate(`q.layoutBeforeCompact=JSON.stringify(q.session.presentation.read().presentations.spatial);q.widthBefore=document.querySelector('.workspace-spatial__document .reactive-window').getBoundingClientRect().width`);
 await click('.workspace-spatial__document .compact-document-toggle');
 check('Compact works on the static Spatial Window',await evaluate(`document.querySelector('.workspace-spatial__document .compact-document-toggle').getAttribute('aria-pressed')`),'true');
 check('Compact does not persist narrowed bounds',await evaluate('JSON.stringify(q.session.presentation.read().presentations.spatial)===q.layoutBeforeCompact'),true);
 await click('.workspace-spatial__document .compact-document-toggle');
 check('Compact restores expanded width',await evaluate(`Math.abs(document.querySelector('.workspace-spatial__document .reactive-window').getBoundingClientRect().width-q.widthBefore)<.3`),true);

 await evaluate("q.flow('note').focus();q.flow('note').setSelectionRange(2,8)");
 await click('.compact-document-toggle');
 check('Compact carries margin focus into drawer',await evaluate(`(()=>{const e=q.flow('note');return[!!e.closest('.reactive-window__margin-drawer'),document.activeElement===e,e.selectionStart,e.selectionEnd]})()`),[true,true,2,8]);
 await click('[aria-label="Close margins"]');await click('.document-margin-indicator');
 check('margin indicator opens drawer',await evaluate(`document.activeElement===document.querySelector('.reactive-window__margin-drawer')`),true);
 await key('Escape');
 check('drawer Escape restores focus',await evaluate(`document.activeElement===document.querySelector('.document-style-bar__margins')`),true);
 await click('.compact-document-toggle');
 await send('Emulation.setDeviceMetricsOverride',{width:800,height:1000,deviceScaleFactor:1,mobile:false},sessionId);await evaluate('q.frame()');
 check('narrow viewport automatically collapses margins',await evaluate(`document.querySelector('.reactive-window').classList.contains('reactive-window--margins-collapsed')`),true);
 check('automatic collapse is not explicit Compact',await evaluate(`document.querySelector('.compact-document-toggle').getAttribute('aria-pressed')`),'false');
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false},sessionId);await evaluate('q.frame()');
 check('wide viewport restores automatic margins',await evaluate(`document.querySelector('.reactive-window').classList.contains('reactive-window--margins-collapsed')`),false);
 check('projection identity keys retained',await evaluate('JSON.stringify(q.keyIds.map(id=>q.node(id).key))===JSON.stringify(q.keys)'),true);
 check('Desktop metadata retained',await evaluate(`JSON.stringify(q.editor.encodeWorkspace().children.map(c=>c.metadata))===JSON.stringify(JSON.parse(q.baseline).children.map(c=>c.metadata))`),true);
 check('local/server roundtrip',await evaluate('q.roundtrip()'),{local:'spatial',server:'spatial',same:true,documents:1});


 for(let i=0;i<5;i++) {
   await evaluate(`q.flow('native').focus();q.flow('native').setSelectionRange(2,5)`);
   await click('.workspace-spatial__controls button:nth-last-child(2)');await evaluate('new Promise(r=>setTimeout(r,500))');
   check('return '+i+' releases root',await evaluate('document.querySelectorAll(".reactive-window").length'),0);
   await evaluate("q.session.spatial.document.activate('block:one');q.frame()");
   check('activation '+i+' restores native selection',await evaluate(`({focused:document.activeElement===q.flow('native'),start:q.flow('native').selectionStart,end:q.flow('native').selectionEnd})`),{focused:true,start:2,end:5});
 }
 await evaluate("q.session.selectPresentation('desktop');q.frame()");
 check('Desktop restores both original Windows',await evaluate('document.querySelectorAll(".reactive-window").length'),2);
 await evaluate("q.session.selectPresentation('canvas');q.frame()");
 check('Canvas restores both original Windows',await evaluate('document.querySelectorAll(".reactive-window").length'),2);
 await evaluate("q.session.selectPresentation('spatial');q.frame()");
 check('Spatial returns to browsing',await evaluate('document.querySelectorAll(".reactive-window").length'),0);
 await evaluate("q.session.spatial.document.activate('block:one');q.frame()");
 await mkdir('artifacts/spatial-b',{recursive:true});
 const shot=await send('Page.captureScreenshot',{format:'png'},sessionId);await writeFile('artifacts/spatial-b/b1-editing.png',Buffer.from(shot.data,'base64'));
 await writeFile('artifacts/spatial-b/b1-browser-results.json',JSON.stringify({checks},null,2));
 console.log(JSON.stringify({checks},null,2));

 // B2 exercises the actual feature controls; B1 above deliberately tests the
 // immediate application authorization boundary independently of animation.
 await click('.workspace-spatial__controls button:nth-last-child(2)');await evaluate('new Promise(r=>setTimeout(r,500))');
 const settle=()=>evaluate('new Promise(r=>setTimeout(r,600))');
 const read='.workspace-spatial__footer > button', back='.workspace-spatial__controls button:nth-last-child(2)';
 await evaluate("q.session.spatial.select('block:one');q.physical=JSON.stringify(q.session.spatial.layout());q.repoRevision=q.editor.repository.state.revision;q.frame()");
 const capture=async name=>{const result=await send('Page.captureScreenshot',{format:'png'},sessionId);await writeFile('artifacts/spatial-b/'+name+'.png',Buffer.from(result.data,'base64'));};
 await capture('01-desk');
 const frames=[];
 const record=async event=>{const message=JSON.parse(event.data);if(message.method==='Page.screencastFrame'){frames.push({data:message.params.data,timestamp:message.params.metadata.timestamp});await send('Page.screencastFrameAck',{sessionId:message.params.sessionId},sessionId);}};
 socket.addEventListener('message',record);await send('Page.startScreencast',{format:'jpeg',quality:80,maxWidth:1440,maxHeight:1000,everyNthFrame:1},sessionId);
 await click(read);
 check('pickup starts without mounting editor early',await evaluate("document.querySelector('.workspace-spatial').dataset.phase==='approaching'&&!q.session.spatial.document.active()"),true);
 await settle();await capture('04-editing');
 check('physical handoff mounts one editor',await evaluate("document.querySelector('.workspace-spatial').dataset.phase==='editing'&&document.querySelectorAll('.reactive-window').length===1"),true);
 check('physical plane coincides with DOM rectangle',await evaluate("+document.querySelector('.workspace-spatial').dataset.alignmentError<.01"),true);
 check('activation retains saved physical placement',await evaluate('JSON.stringify(q.session.spatial.layout())===q.physical'),true);
 check('activation does not author changes',await evaluate('q.editor.repository.state.revision===q.repoRevision'),true);
 await click(back);await settle();await capture('06-desk-restored');
 await send('Page.stopScreencast',{},sessionId);socket.removeEventListener('message',record);
 await writeFile('artifacts/spatial-b/sequence.json',JSON.stringify(frames));
 check('reverse releases all live roots',await evaluate("document.querySelector('.workspace-spatial').dataset.phase==='desk'&&document.querySelectorAll('.reactive-window').length===0"),true);
 check('reverse preserves physical placement',await evaluate('JSON.stringify(q.session.spatial.layout())===q.physical'),true);
 await click(read);await evaluate("document.querySelector('.workspace-spatial__scene').focus()");await key('Escape');await settle();
 check('Escape cancels pickup',await evaluate('!q.session.spatial.document.active()'),true);
 await click(read);await evaluate("q.session.selectPresentation('desktop');q.frame()");await settle();
 check('switch cancels pending activation',await evaluate("q.session.presentation.active()==='desktop'&&document.querySelectorAll('.reactive-window').length===2"),true);
 await evaluate("q.session.selectPresentation('spatial');q.session.spatial.select('block:one');q.frame()");await settle();
 await click(read);await send('Emulation.setDeviceMetricsOverride',{width:1100,height:850,deviceScaleFactor:2,mobile:false},sessionId);await settle();
 check('resize/DPR change during pickup keeps editor within viewport',await evaluate(`(()=>{const r=document.querySelector('.workspace-spatial__document').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight})()`),true);
 await click(back);await settle();
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false},sessionId);await settle();
 const counts=[];
 for(let i=0;i<8;i++){await click(read);await settle();await click(back);await settle();counts.push(await evaluate(`(()=>{const d=document.querySelector('.workspace-spatial').dataset;return{geometries:+d.geometries,textures:+d.textures,roots:document.querySelectorAll('.reactive-window').length}})()`));}
 check('repeated transitions plateau resources and release roots',counts.every(c=>JSON.stringify(c)===JSON.stringify(counts[0])&&c.roots===0),true);
 await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]},sessionId);
 await click(read);
 check('reduced-motion immediate activation',await evaluate("document.querySelector('.workspace-spatial').dataset.phase==='editing'"),true);
 await evaluate("q.beforeIdle=+document.querySelector('.workspace-spatial').dataset.frames;q.flow('native').focus();q.frame()");
 await send('Input.insertText',{text:'Idle proof'},sessionId);await settle();
 check('ordinary typing does not render the study',await evaluate("+document.querySelector('.workspace-spatial').dataset.frames===q.beforeIdle"),true);
 await click(back);check('reduced-motion immediate return',await evaluate("document.querySelector('.workspace-spatial').dataset.phase==='desk'"),true);


 await click(read);await evaluate("q.nativeBeforeLoss=q.flow('native');q.nativeBeforeLoss.focus();q.nativeBeforeLoss.setSelectionRange(1,4);document.querySelector('.workspace-spatial__scene').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext()");await settle();
 check('graphics loss preserves the live editor',await evaluate("q.flow('native')===q.nativeBeforeLoss&&document.activeElement===q.nativeBeforeLoss"),true);
 await click('.workspace-spatial__error button:first-of-type');await settle();
 check('graphics retry preserves editor and focus',await evaluate("q.flow('native')===q.nativeBeforeLoss&&document.activeElement===q.nativeBeforeLoss&&q.nativeBeforeLoss.selectionStart===1&&q.nativeBeforeLoss.selectionEnd===4"),true);
 await click(back);
 await send('Emulation.setDeviceMetricsOverride',{width:1152,height:800,deviceScaleFactor:1.25,mobile:false},sessionId);await settle();await click(read);
 check('125-percent zoom-equivalent CSS viewport keeps identity DOM',await evaluate(`(()=>{const e=q.flow('a');return getComputedStyle(document.querySelector('.workspace-spatial__document')).transform==='none'&&document.querySelector('.reactive-window').getBoundingClientRect().right<=innerWidth})()`),true);
 await click(back);await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false},sessionId);
 await evaluate(`(async()=>{const {workspaceOpen}=await import('/src/application/workspace-open.ts');const open=workspaceOpen(q.session);q.beforeOpen=q.editor.repository.snapshot();const a=await open.serverDocument({folder:'notes',filename:'Scale.json'},new AbortController().signal);const b=await open.serverDocument({folder:'notes',filename:'Scale.json'},new AbortController().signal);q.sameServer=a===b})()`);
 check('server reopen reuses shared live identity and unsaved edits',await evaluate("q.sameServer&&JSON.stringify(q.beforeOpen)===JSON.stringify(q.editor.repository.snapshot())&&String(q.node('native').payload.text).includes('Idle proof')"),true);
 await writeFile('artifacts/spatial-b/browser-results.json' ,JSON.stringify({browser:await send('Browser.getVersion'),checks,counts,sequenceFrames:frames.length},null,2));
 console.log(JSON.stringify({b2Checks:checks.slice(45),counts,sequenceFrames:frames.length},null,2));
 await evaluate('q.dispose()');
} finally { socket?.close();chrome.kill();await new Promise(r=>setTimeout(r,300));await rm(profile,{recursive:true,force:true,maxRetries:8,retryDelay:200}); }
