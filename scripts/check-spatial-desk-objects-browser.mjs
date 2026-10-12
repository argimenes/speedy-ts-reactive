// Spatial desk objects: actual picking, lifting, desktop-only drops and persistence.
// Node 22+, CHROME_BIN and BENCHMARK_URL supported. Isolated Chrome profile,
// Self-hosted Vite; in-memory fixtures and captured DTOs only.
import { spawn } from 'node:child_process';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'vite';
const vite = await createServer({ server: { host: '127.0.0.1', port: 0, hmr: false } }); await vite.listen();
const appUrl = `http://127.0.0.1:${vite.httpServer.address().port}`;
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
const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const requestId = ++id; const timeout=setTimeout(()=>{pending.delete(requestId);reject(new Error('CDP timeout: '+method));},60000);pending.set(requestId,{resolve:v=>{clearTimeout(timeout);resolve(v)},reject:e=>{clearTimeout(timeout);reject(e)}}); socket.send(JSON.stringify({id:requestId,method,params,...(sessionId ? {sessionId} : {})})); });
 const {targetId} = await send('Target.createTarget',{url:'about:blank'}); const {sessionId} = await send('Target.attachToTarget',{targetId,flatten:true});
 await send('Network.enable',{},sessionId);
 const evaluate = async expression => {
   const result = await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);
   if(result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
   return result.result.value;
 };



 const checks = [], errors = [];
 const check = (name, actual, expected = true) => { assert.deepEqual(actual, expected, name); checks.push(name); console.log('PASS', name); };
 await send('Runtime.enable', {}, sessionId);
 socket.addEventListener('message', event => { const msg=JSON.parse(event.data); if(msg.method==='Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails); });
 await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false }, sessionId);
 await send('Page.navigate', { url: appUrl }, sessionId);
 await evaluate('new Promise(r=>setTimeout(r,1500))');
 await evaluate(`(async()=>{
   const {WorkspaceSession}=await import('/src/application/workspace-session.ts');
   const {WorkspacePresentationView}=await import('/src/application/workspace-presentation-view.tsx');
   const {materializeLocalWorkspace}=await import('/src/reactive-editor/workspace-manifest.ts');
   const {DESK_PROPS,propPlacement,validateDeskProps}=await import('/src/features/spatial/desk-props.ts');
   const {studyCamera,projectCss}=await import('/src/features/spatial/camera.ts');
   const {Vector3}=await import('/node_modules/.vite/deps/three.js');
   const {render}=await import('/node_modules/.vite/deps/solid-js_web.js');
   const {createComponent}=await import('/node_modules/.vite/deps/solid-js.js');
   document.body.replaceChildren(); document.body.style.margin='0';
   const host=document.body.appendChild(document.createElement('main'));host.className='workspace-demo workspace-demo--canonical';
   const frame=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(r,80))));
   const mount=(enabled=true,dto={id:'desk-props-proof',type:'workspace-block',children:[]})=>{
     const session=new WorkspaceSession(materializeLocalWorkspace(dto),{features:{spatialWorkspace:true,canvasWorkspace:true,spatialDeskObjects:enabled}});
     const dispose=render(()=>createComponent(WorkspacePresentationView,{session}),host);session.editor.installGateway(document);session.selectPresentation('spatial');
     return {session,dispose:()=>{dispose();session.dispose()}};
   };
   window.q={host,frame,mount,...mount(),DESK_PROPS,propPlacement,validateDeskProps};
   q.wait=async fn=>{for(let i=0;i<160;i++){if(fn())return;await new Promise(r=>setTimeout(r,50));}throw Error('Scene did not become ready')};
   await q.wait(()=>Number(host.querySelector('.workspace-spatial')?.dataset.frames)>0);
   q.root=()=>host.querySelector('.workspace-spatial');q.canvas=()=>host.querySelector('.workspace-spatial__scene');
   q.layout=()=>q.session.spatial.layout();q.place=id=>propPlacement(q.layout(),id);
   q.move=(id,x,z)=>q.session.spatial.arrange(id,{position:{x,z},heading:0},q.place(id));
   q.point=id=>{const p=q.place(id),r=q.canvas().getBoundingClientRect(),camera=studyCamera(q.layout().camera,r.width,r.height);
     const y=id==='study:lamp'?.39:id==='study:cup'?.054:id==='study:saucer'?.010:id==='study:inkpot'?.030:id==='study:quill'?.108:.020;
     const css=projectCss(new Vector3(p.position.x+(id==='study:lamp'?.03:0),y,p.position.z),camera,r.width,r.height);return{x:r.left+css.x,y:r.top+css.y};};
   q.repo=JSON.stringify(q.session.editor.repository.snapshot());
 })()`);
 const frame=()=>evaluate('q.frame()');
 const mouse=(type,p)=>send('Input.dispatchMouseEvent',{type,...p,button:'left',buttons:type==='mouseReleased'?0:1,clickCount:1},sessionId);
 const key=async name=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key:name,code:name,windowsVirtualKeyCode:{Escape:27,ArrowRight:39}[name]},sessionId);await send('Input.dispatchKeyEvent',{type:'keyUp',key:name,code:name},sessionId);await frame();};
 await mkdir('artifacts/spatial-desk-objects',{recursive:true});
 const shot=async name=>{const {data}=await send('Page.captureScreenshot',{format:'png'},sessionId);await writeFile('artifacts/spatial-desk-objects/'+name+'.png',Buffer.from(data,'base64'));};
 check('all eight props are available in the desk object list',await evaluate(`q.host.querySelectorAll('.workspace-spatial__footer li').length`),8);
 check('Probe remains disabled',await evaluate(`!q.host.querySelector('.probe-controls')`));
 for(const kind of ['perspective','orthographic']) {
   await evaluate(`q.session.spatial.camera({...q.layout().camera,kind:${JSON.stringify(kind)}})`);await frame();
   for(const id of await evaluate('q.DESK_PROPS.map(p=>p.id)')) {
     await evaluate(`for(const p of q.DESK_PROPS)q.move(p.id,p.id===${JSON.stringify(id)}?0:-.85,p.id===${JSON.stringify(id)}?-.92:-.85);q.session.spatial.select(undefined);`);await frame();
     const start=await evaluate(`q.point(${JSON.stringify(id)})`);
     await evaluate(`q.before=JSON.stringify(q.layout());q.rev=q.session.presentation.revision();q.resources={...q.root().dataset}`);
     await mouse('mousePressed',start);await frame();await evaluate('q.resources={...q.root().dataset}');
     check(kind+' picks '+id,await evaluate('q.session.spatial.selected()'),id);
     const end={x:start.x+80,y:start.y-25};await mouse('mouseMoved',end);await frame();
     check(kind+' lifts '+id+' without persisting',await evaluate(`q.root().dataset.moving==='true'&&Number(q.root().dataset.lift)>.05&&JSON.stringify(q.layout())===q.before`));
     if(kind==='perspective'&&id==='study:cup')await shot('cup-lifted');
     await mouse('mouseReleased',end);await frame();
     check(kind+' settles '+id+' on desktop exactly once',await evaluate(`(()=>{q.validateDeskProps(q.layout().environment.deskProps);return q.session.presentation.revision()===q.rev+1&&q.root().dataset.moving==='false'&&q.root().dataset.lift==='0'&&!q.canvas().hasPointerCapture(1)})()`));
     check(kind+' reuses '+id+' geometry',await evaluate(`q.root().dataset.geometries===q.resources.geometries&&q.root().dataset.textures===q.resources.textures`));
   }
 }
 await evaluate(`q.move('study:cup',0,-.92);q.session.spatial.camera({...q.layout().camera,kind:'perspective'});`);await frame();
 let start=await evaluate(`q.point('study:cup')`);
 await evaluate('q.before=JSON.stringify(q.layout());q.rev=q.session.presentation.revision()');
 await mouse('mousePressed',start);await mouse('mouseMoved',{x:start.x+90,y:start.y-80});await frame();await key('Escape');await mouse('mouseReleased',{x:start.x+90,y:start.y-80});await frame();
 check('Escape cancels lift and placement without writing',await evaluate(`q.root().dataset.lift==='0'&&JSON.stringify(q.layout())===q.before&&q.session.presentation.revision()===q.rev`));
 await mouse('mousePressed',start);await mouse('mouseMoved',{x:-200,y:1200});await frame();
 await shot('outside-desk-preview');
 await mouse('mouseReleased',{x:-200,y:1200});await frame();
 check('off-desk release settles safely on the desktop',await evaluate(`(()=>{q.validateDeskProps(q.layout().environment.deskProps);return !q.canvas().hasPointerCapture(1)&&q.root().dataset.lift==='0'})()`));
 await evaluate(`q.move('study:cup',0,-.92);q.session.spatial.select('study:cup');q.beforeX=q.place('study:cup').position.x;q.canvas().focus()`);await frame();await key('ArrowRight');
 check('keyboard moves props without paper-only controls',await evaluate(`q.place('study:cup').position.x>q.beforeX&&!q.host.querySelector('[aria-label="Paper orientation"]')`));
 start=await evaluate(`q.point('study:cup')`);await mouse('mousePressed',start);await mouse('mouseMoved',{x:start.x+60,y:start.y-20});await frame();
 await evaluate(`q.saved=q.session.editor.persistence.captureWorkspace().document;q.settled=JSON.stringify(q.layout());`);
 check('saving settles the lift before serializing',await evaluate(`q.root().dataset.lift==='0'&&JSON.stringify(q.saved.metadata.workspacePresentation.presentations.spatial)===q.settled`));
 await mouse('mouseReleased',{x:start.x+60,y:start.y-20});
 check('prop movement preserves workspace content',await evaluate('JSON.stringify(q.session.editor.repository.snapshot())===q.repo'));
 await shot('settled-props');
 await evaluate(`q.dispose();void Object.assign(q,q.mount(false,q.saved));`);await frame();
 check('saved positions survive reopening with the feature disabled',await evaluate(`JSON.stringify(q.layout())===q.settled&&q.host.querySelectorAll('.workspace-spatial__footer li').length===0`));
 start=await evaluate(`q.point('study:cup')`);await mouse('mousePressed',start);await mouse('mouseMoved',{x:start.x+30,y:start.y-10});await mouse('mouseReleased',{x:start.x+30,y:start.y-10});await frame();
 check('disabled feature leaves props immovable',await evaluate(`JSON.stringify(q.layout().environment.deskProps)===JSON.stringify(q.saved.metadata.workspacePresentation.presentations.spatial.environment.deskProps)&&!q.session.spatial.selected()`));
 await evaluate('q.dispose()');
 check('no uncaught browser errors',errors,[]);
 await writeFile('artifacts/spatial-desk-objects/browser-results.json',JSON.stringify({checks,errors},null,2));
 console.log(JSON.stringify({passed:checks.length},null,2));
} finally {
 if(socket&&socket.readyState!==WebSocket.CLOSED){const closed=new Promise(r=>socket.addEventListener('close',r,{once:true}));socket.close();await Promise.race([closed,new Promise(r=>setTimeout(r,1000))]);}
 if(chrome.exitCode===null&&chrome.signalCode===null){const closed=new Promise(r=>chrome.once('exit',r));chrome.kill('SIGKILL');await closed;}
 vite.httpServer?.closeAllConnections(); await vite.close();
 await rm(profile,{recursive:true,force:true,maxRetries:8,retryDelay:200});
}
