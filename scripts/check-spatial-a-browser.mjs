// Spatial A: real-browser scene, state, camera, lifecycle and Desktop regression checks.
// Node 22+, CHROME_BIN and BENCHMARK_URL supported. Isolated Chrome profile,
// Vite dev server required; in-memory fixtures and captured DTOs only.
import { spawn } from 'node:child_process';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import path from 'node:path';
const profile = await mkdtemp(path.join(tmpdir(), 'speedy-spatial-check-'));
const chrome = spawn(process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', ...(process.env.SPATIAL_SOFTWARE_GPU === '0' ? [] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']), '--disk-cache-size=1', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank']);
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



 const checks = [], errors = [], captures = [];
 socket.addEventListener('message', event => { const r=JSON.parse(event.data); if(r.method==='Runtime.exceptionThrown') errors.push(r.params.exceptionDetails); });
 await send('Runtime.enable',{},sessionId);
 const check = (name, actual, expected=true) => { assert.deepEqual(actual, expected, name); checks.push(name); console.log("✓ "+name); };
 const wait = ms => new Promise(r=>setTimeout(r,ms));
 const frame = async () => { await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))'); await wait(150); };
 const screenshot = async name => { await frame(); const {data}=await send('Page.captureScreenshot',{format:'png'},sessionId); const file=`artifacts/spatial-a/${name}.png`; await writeFile(file,Buffer.from(data,'base64')); captures.push(file); };
 await mkdir('artifacts/spatial-a',{recursive:true});
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false},sessionId);
 await send('Page.navigate',{url:process.env.SPATIAL_URL ?? 'http://127.0.0.1:5188/'},sessionId);
 await wait(1000);
 for(let i=0;i<150;i++){if(await evaluate('!!document.querySelector("[data-system-menu-trigger=workspace]")'))break;await wait(100);}
 check("main application ready",await evaluate('!!document.querySelector("[data-system-menu-trigger=workspace]")'));
 const button = async (label, scope='document') => { await evaluate(`(()=>{const b=[...${scope}.querySelectorAll('button')].find(b=>b.textContent.replace(/[✓▸]/g,'').trim()===${JSON.stringify(label)});if(!b||b.disabled)throw new Error('Unavailable button '+${JSON.stringify(label)});b.click()})()`); await frame(); };
 const menu = async () => { await evaluate(`if(!document.querySelector('[data-system-menu="workspace"]'))document.querySelector('[data-system-menu-trigger="workspace"]').click()`); await frame(); };
 const choose = async name => { await menu(); await button('Presentations'); await button(name,`document.querySelector('[aria-label="Presentations"]')`); };
 await choose('Create Spatial');
 for(let i=0;i<80;i++){if(await evaluate('Number(document.querySelector(".workspace-spatial")?.dataset.frames)>0'))break;await wait(100);}
 check('actual application exposes explicit Create Spatial',await evaluate('!!document.querySelector(".workspace-spatial[data-frames]")'));
 check('empty application creates an empty desk',await evaluate(`document.querySelector('.workspace-spatial summary').textContent.includes('0')`));
 await menu();await button('New Document');await frame();
 check('actual New Document creates a proxy without an editor',await evaluate(`document.querySelector('.workspace-spatial summary').textContent.includes('1')&&!document.querySelector('.reactive-standoff-flow')`));
 await menu();await button('Open Document from Server…');
 for(let i=0;i<60;i++){if(await evaluate(`[...document.querySelectorAll('[role=option]')].some(e=>e.textContent.includes('text1.json'))`))break;await wait(100);}
 await evaluate(`[...document.querySelectorAll('[role=option]')].find(e=>e.textContent.includes('text1.json')).click()`);await button('Open',`document.querySelector('[role="dialog"]')`);
 for(let i=0;i<60;i++){if(await evaluate(`!document.querySelector('[role="dialog"]')&&document.querySelector('.workspace-spatial summary').textContent.includes('2')`))break;await wait(100);}
 check('actual server Document opening produces a second physical proxy',await evaluate(`document.querySelector('.workspace-spatial summary').textContent.includes('2')`));
 await evaluate(`window.savedSpatial='';window.showSaveFilePicker=async()=>({name:'Spatial.json',createWritable:async()=>({write:async value=>{window.savedSpatial=typeof value==='string'?value:await value.text()},close:async()=>{}})})`);
 await menu();await button('Save Workspace',`document.querySelector('[aria-label="Local files"]')`);
 check('actual local save includes independent Spatial entry',await evaluate(`JSON.parse(savedSpatial).metadata.workspacePresentation.active==='spatial'`));
 await screenshot('application-open-documents');
 await button('Return to Desktop');check('actual app returns to Desktop',await evaluate('!document.querySelector(".workspace-spatial")'));
 await evaluate(`(async()=>{
 const {WorkspaceSession}=await import('/src/application/workspace-session.ts');
 const {WorkspacePresentationView}=await import('/src/application/workspace-presentation-view.tsx');
 const {WorkspacePresentations}=await import('/src/demo/workspace-presentations.tsx');
 const {materializeLocalWorkspace}=await import('/src/reactive-editor/workspace-manifest.ts');
 const {render}=await import('/node_modules/.vite/deps/solid-js_web.js');
 const {createComponent}=await import('/node_modules/.vite/deps/solid-js.js');
 const {workspaceOpen}=await import('/src/application/workspace-open.ts');
 const titles=['A visit to the Alps','Notes for the evening','Collected passages'];
 const docs=titles.map((title,i)=>({id:'window-'+i,type:'document-window-block',metadata:{title,position:{x:30+i*50,y:60},size:{w:840,h:620}},children:[{id:'doc-'+i,type:'document-block',metadata:{documentId:'doc-'+i},children:[{id:'text-'+i,type:'plain-text-block',text:title+' — existing Codex content.'}]}]}));
 const svg='<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="#20354f"/><path d="M0 240L150 45L300 230L430 65L600 230V400H0Z" fill="#6c8297"/><path d="M95 120L150 45L220 130L155 100L135 135Z M375 150L430 65L510 145L444 115L420 160Z" fill="#c6d0d6"/><path d="M0 290L160 205L310 320L470 225L600 295V400H0Z" fill="#1a292c"/><path d="M0 355Q280 290 600 370V400H0Z" fill="#536571"/></svg>';
 const image={id:'photo',type:'image-block',metadata:{title:'Alpine photograph',url:'data:image/svg+xml,'+encodeURIComponent(svg)}};
 const dto={id:'spatial-fixture',type:'workspace-block',children:[...docs,image,{id:'notes-window',type:'document-window-block',metadata:{title:'Reading list'},children:[{id:'reading',type:'document-block',children:[{id:'reading-text',type:'plain-text-block',text:'A quiet place to think.'}]}]}]};
 const session=new WorkspaceSession(materializeLocalWorkspace(dto),{features:{canvasWorkspace:true,spatialWorkspace:true}});
 const old=document.querySelector('#root'); if(old)old.style.display='none';
 const host=document.createElement('main');host.id='spatial-proof';document.body.append(host);document.body.style.margin='0';
 const dispose=render(()=>[createComponent(WorkspacePresentations,{session}),createComponent(WorkspacePresentationView,{session})],host);
 session.editor.installGateway(document);
 window.q={session,host,dispose,materializeLocalWorkspace,WorkspaceSession,opening:workspaceOpen(session),baseline:session.editor.repository.snapshot(),projection:session.projection};
 session.selectPresentation('spatial');
})()`);
 for(let i=0;i<100;i++){ if(await evaluate('!!document.querySelector(".workspace-spatial[data-frames]")'))break; await wait(100); }
 check('scene rendered',await evaluate('Number(document.querySelector(".workspace-spatial")?.dataset.frames)>0'));
 check('no live document mounts in Spatial A',await evaluate('q.host.querySelectorAll("textarea,.reactive-standoff-flow,.reactive-window").length'),0);
 check('no content or Desktop geometry changes',await evaluate('JSON.stringify(q.baseline)===JSON.stringify(q.session.editor.repository.snapshot())'));
 check('same session projection',await evaluate('q.session.projection===q.projection'));
 for(const kind of ['perspective','orthographic']) {
   for(const [name,yaw] of [['centre',0],['left',Math.PI/4],['right',-Math.PI/4]]) {
     await evaluate(`q.session.spatial.camera({kind:${JSON.stringify(kind)},yaw:${yaw},approach:0})`);await frame();
     await screenshot(`${kind}-${name}`);
   }
   await evaluate(`q.session.spatial.camera({kind:${JSON.stringify(kind)},yaw:0,approach:1})`);await screenshot(`${kind}-approach`);
   await evaluate(`q.session.spatial.camera({kind:${JSON.stringify(kind)},yaw:0,approach:0});[...q.host.querySelectorAll('button')].find(b=>b.textContent==='Rehearse alignment').click()`);await frame();
   check(kind+' CSS/world alignment',await evaluate('Number(document.querySelector(".workspace-spatial").dataset.alignmentError)<.001'));
   await screenshot(`${kind}-alignment`);
   await evaluate(`[...q.host.querySelectorAll('button')].find(b=>b.textContent==='Rehearse alignment').click()`);
 }
 await evaluate(`q.session.spatial.camera({kind:'perspective',yaw:0,approach:0})`);await frame();
 // Native pointer ownership: drag previews, Escape cancels, pointerup commits; keyboard is scoped to the canvas.
 const canvasRect=await evaluate(`(()=>{const r=q.host.querySelector('canvas').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height*.32}})()`);
 const mouse=(type,x,y)=>send('Input.dispatchMouseEvent',{type,x,y,button:'left',buttons:type==='mouseReleased'?0:1,clickCount:1},sessionId);
 await mouse('mousePressed',canvasRect.x,canvasRect.y);await mouse('mouseMoved',canvasRect.x+130,canvasRect.y);await frame();
 check('camera drag is transient until completion',await evaluate('q.session.spatial.layout().camera.yaw'),0);
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27},sessionId);await mouse('mouseReleased',canvasRect.x+130,canvasRect.y);await frame();
 check('Escape cancels camera gesture',await evaluate('q.session.spatial.layout().camera.yaw'),0);
 await mouse('mousePressed',canvasRect.x,canvasRect.y);await mouse('mouseMoved',canvasRect.x+120,canvasRect.y);await mouse('mouseReleased',canvasRect.x+120,canvasRect.y);await frame();
 check('pointer completion commits camera',await evaluate('q.session.spatial.layout().camera.yaw>0'));
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Home',code:'Home',windowsVirtualKeyCode:36},sessionId);await frame();check('keyboard recentre',await evaluate('q.session.spatial.layout().camera.yaw'),0);
 await evaluate(`const modal=document.createElement('div');modal.setAttribute('role','dialog');modal.id='proof-modal';document.body.append(modal)`);
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowLeft',code:'ArrowLeft',windowsVirtualKeyCode:37},sessionId);await frame();check('dialog owns navigation priority',await evaluate('q.session.spatial.layout().camera.yaw'),0);await evaluate(`document.getElementById('proof-modal').remove()`);
 const frameTimes=await evaluate(`(async()=>{const times=[];for(let i=0;i<25;i++){const t=performance.now();q.session.spatial.camera({kind:'perspective',yaw:(i-12)*.018,approach:0});await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));times.push(performance.now()-t)}q.session.spatial.camera({kind:'perspective',yaw:0,approach:0});return times})()`);await frame();
 const before=await evaluate('Number(document.querySelector(".workspace-spatial").dataset.frames)');await wait(800);
 check('static scene renders no idle frames',await evaluate('Number(document.querySelector(".workspace-spatial").dataset.frames)'),before);
 const resources=[];
 for(let i=0;i<10;i++) {
   await evaluate(`q.session.selectPresentation('desktop')`);await frame();
   check('Desktop roots restored '+i,await evaluate('q.host.querySelectorAll("textarea").length'),4);
   if(i===0){ await evaluate(`const input=q.host.querySelector('textarea');input.focus();input.setSelectionRange(input.value.length,input.value.length)`);await send('Input.insertText',{text:' Edited on Desktop.'},sessionId);await frame();check('ordinary Desktop input',await evaluate(`Object.values(q.session.editor.repository.state.contents).find(c=>c.payload.id==='text-0').payload.text.endsWith(' Edited on Desktop.')`)); }
   await evaluate(`q.session.selectPresentation('spatial')`);
   for(let j=0;j<60;j++){if(await evaluate('Number(document.querySelector(".workspace-spatial")?.dataset.frames)>0'))break;await wait(100);}
   await frame();resources.push(await evaluate(`({...document.querySelector('.workspace-spatial').dataset})`));
 }
 check('resource counts stabilize',resources.slice(1).every(r=>r.geometries===resources[0].geometries&&r.textures===resources[0].textures));
 const roundtrip = await evaluate(`(()=>{const saved=q.session.editor.persistence.captureWorkspace().document;const reopened=new q.WorkspaceSession(q.materializeLocalWorkspace(JSON.parse(JSON.stringify(saved))),{features:{spatialWorkspace:true}});const result={saved,reopened:reopened.editor.persistence.captureWorkspace().document,active:reopened.presentation.active()};reopened.dispose();return result})()`);
 await writeFile('artifacts/spatial-a/study-review.workspace.json',JSON.stringify(roundtrip.saved,null,2));
 check('round-trip Spatial layout and stable content identities',roundtrip.reopened,roundtrip.saved);check('Spatial-only reopening',roundtrip.active,'spatial');
 // Viewport/DPR changes and graphics loss preserve presentation and authored content.
 await send('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:2,mobile:false},sessionId);await frame();await screenshot('perspective-laptop-dpr2');
 await evaluate(`[...q.host.querySelectorAll('button')].find(b=>b.textContent==='Rehearse alignment').click()`);await frame();check('alignment at DPR 2',await evaluate('Number(document.querySelector(".workspace-spatial").dataset.alignmentError)<.001'));
 await screenshot('perspective-laptop-alignment');await evaluate(`[...q.host.querySelectorAll('button')].find(b=>b.textContent==='Rehearse alignment').click()`);
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false},sessionId);await frame();
 await evaluate(`window.beforeLoss=JSON.stringify(q.session.editor.persistence.captureWorkspace().document);q.host.querySelector('canvas').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext()`);await frame();
 check('graphics failure leaves a usable fallback notice',await evaluate(`!!q.host.querySelector('[role="alert"]')`));
 check('graphics failure preserves content and preference',await evaluate(`JSON.stringify(q.session.editor.persistence.captureWorkspace().document)===beforeLoss`));
 await button('Retry study');for(let i=0;i<30;i++){if(await evaluate(`!q.host.querySelector('[role="alert"]')`))break;await wait(100);}check('graphics context recovery',await evaluate(`!q.host.querySelector('[role="alert"]')`));
 await screenshot('perspective-final');
 await evaluate('q.dispose();q.session.dispose()');
 for(const port of [3000,3002]) {
   await send('Page.navigate',{url:`http://localhost:${port}/`},sessionId);
   for(let i=0;i<100;i++){if(await evaluate('!!document.querySelector("[data-system-menu-trigger=workspace]")'))break;await wait(100);}
   await menu();await button('Presentations');
   check(port+' keeps Spatial default-off',await evaluate(`![...document.querySelector('[aria-label="Presentations"]').querySelectorAll('button')].some(b=>/Spatial/.test(b.textContent))`));
   check(port+' does not fetch the Spatial/Three renderer',await evaluate(`!performance.getEntriesByType('resource').some(r=>/features\\/spatial\\/(view|scene)|three\\.js|assets\\/view-/.test(r.name))`));
 }
 check('no uncaught browser exceptions',errors,[]);
 const report={checks,captures,resources,cameraTwoFrameCheckpointMs:frameTimes,browser:await send('Browser.getVersion'),softwareGpu:process.env.SPATIAL_SOFTWARE_GPU!=='0',errors};
 await writeFile('artifacts/spatial-a/browser-results.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify({checks:checks.length,captures:captures.length,resources:resources[0]},null,2));
} finally {socket?.close();chrome.kill();await new Promise(r=>chrome.once('exit',r));await rm(profile,{recursive:true,force:true});}
