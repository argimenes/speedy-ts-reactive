// 3D Object browser qualification; isolated in-memory fixture.
// Node 22+, CHROME_BIN and OBJECT_URL supported. Isolated Chrome profile,
// in-memory fixture, no document saves. OBJECT_ARTIFACTS writes review evidence.
import { spawn } from 'node:child_process';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import path from 'node:path';
const profile = await mkdtemp(path.join(tmpdir(), 'speedy-object-check-'));
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
const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const requestId = ++id; const timeout=setTimeout(()=>{pending.delete(requestId);reject(new Error('CDP timeout: '+method));},20000);pending.set(requestId,{resolve:v=>{clearTimeout(timeout);resolve(v)},reject:e=>{clearTimeout(timeout);reject(e)}}); socket.send(JSON.stringify({id:requestId,method,params,...(sessionId ? {sessionId} : {})})); });
 const {targetId} = await send('Target.createTarget',{url:'about:blank'}); const {sessionId} = await send('Target.attachToTarget',{targetId,flatten:true});
 await send('Network.enable',{},sessionId);
 socket.addEventListener('message', event => { const msg=JSON.parse(event.data); if(msg.method==='Network.loadingFailed') console.error(JSON.stringify(msg.params)); });
 const evaluate = async expression => {
   const result = await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);
   if(result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
   return result.result.value;
 };


const artifacts=process.env.OBJECT_ARTIFACTS??'artifacts/three-d-object';await mkdir(artifacts,{recursive:true});
const checks=[];const check=(name,value,expected=true)=>{assert.deepEqual(value,expected,name);checks.push(name);};
const wait=async(ms=150)=>evaluate(`new Promise(r=>setTimeout(r,${ms}))`);
const poll=async(expression)=>{for(let i=0;i<100;i++){if(await evaluate(expression))return;await wait(100);}throw Error('Not ready: '+expression+' '+JSON.stringify(await evaluate(`({text:document.body.innerText.slice(-2000),phase:document.querySelector('.workspace-spatial')?.dataset.phase,active:p.session.presentation.active(),notice:p.session.notice()})`)));};
const shot=async(name)=>{const{data}=await send('Page.captureScreenshot',{format:'png'},sessionId);await writeFile(path.join(artifacts,name+'.png'),Buffer.from(data,'base64'));};
await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false},sessionId);
await send('Page.navigate',{url:process.env.OBJECT_URL??'http://localhost:3000/'},sessionId);await wait(1200);
await evaluate(`(async()=>{
 const {WorkspaceSession}=await import('/src/application/workspace-session.ts');const {materializeLocalWorkspace}=await import('/src/reactive-editor/workspace-manifest.ts');
 const {WorkspacePresentationView}=await import('/src/application/workspace-presentation-view.tsx');
 const source=await(await fetch('/src/rendering/reactive-tree-view.tsx')).text();const {render,createComponent}=await import(source.split('"').find(p=>p.includes('/solid-js_web.js')));
 const host=document.createElement('div');host.className='workspace-demo';host.style.cssText='position:fixed;inset:0;z-index:9000;background:#ddd';document.body.append(host);
 const dto={id:'work',type:'workspace-block',children:[{id:'win',type:'document-window-block',metadata:{title:'Coffee and notes',position:{x:30,y:50},size:{w:900,h:800}},children:[{id:'doc',type:'document-block',metadata:{documentId:'coffee-doc'},children:[{id:'text',type:'standoff-editor-block',text:'A small object on a page.'},{id:'cup',type:'3d-object-block',object3D:{version:1,scene:'coffee-cup',settings:{steam:true,coffeeStain:true}}},{id:'counter',type:'canvas-counter-block',count:0}]}]}]};
 const session=new WorkspaceSession(materializeLocalWorkspace(dto),{features:{canvasWorkspace:true,spatialWorkspace:true}});
 const dispose=render(()=>createComponent(WorkspacePresentationView,{session}),host);session.editor.installGateway(document);
 const node=id=>Object.values(session.projection.state.nodes).find(n=>n.payload.id===id),root=id=>session.editor.mounts.get(node(id).key)?.root;
 window.p={session,dispose,host,node,root,editor:session.editor};
})()`);
await poll(`p.root('cup')?.dataset.ready==='true'`);
await evaluate(`p.session.selectPresentation('spatial')`);await poll(`document.querySelector('.workspace-spatial')?.dataset.phase==='desk'`);await wait(500);
check('resting paper has no live widgets',await evaluate(`document.querySelectorAll('.three-d-object').length`),0);
check('bounded generic previews',await evaluate(`p.session.spatial.objects()[0].preview.blocks.filter(b=>b.kind==='widget').length`),2);
const placement=await evaluate(`JSON.stringify(p.session.spatial.layout().placements)`);
const activate=async()=>{await evaluate(`(()=>{const a=p.session.spatial;a.select(a.objects()[0].id);[...document.querySelectorAll('button')].find(b=>b.textContent==='Read Document').click()})()`);await poll(`document.querySelector('.workspace-spatial')?.dataset.phase==='editing' && p.root('cup')?.dataset.ready==='true'`);};
await activate();await shot('spatial-live-document');
await evaluate(`window.liveCup=p.root('cup');p.root('win').querySelector('[aria-label="Compact document"]').click()`);await wait(180);
check('Compact keeps the same live widget',await evaluate(`p.root('cup')===liveCup && liveCup.dataset.ready==='true' && liveCup.clientWidth===liveCup.clientHeight`));
await evaluate(`p.root('win').querySelector('[aria-label="Compact document"]').click()`);await wait(100);
await evaluate(`p.editor.commands.setPayloadField(p.node('cup').key,'metadata',{anchor:{version:1,blockId:'text',offset:{x:280,y:30}}},'Anchor coffee')`);
await poll(`!!p.root('cup')?.closest('[data-positioned-block]') && p.root('cup').dataset.ready==='true'`);
check('ordinary Anchor Relationship hosts the 3D Block',await evaluate(`document.querySelectorAll('[data-block-id="cup"]').length`),1);
await evaluate(`p.editor.commands.setPayloadField(p.node('cup').key,'metadata',{},'Remove coffee anchor')`);await poll(`p.root('cup')?.dataset.ready==='true' && !p.root('cup').closest('[data-positioned-block]')`);

check('one live document root',await evaluate(`document.querySelectorAll('.workspace-spatial__document .three-d-object').length`),1);
await evaluate(`p.editor.commandRegistry.execute('object3d.insert',{targetKey:p.node('text').key,args:undefined})`);await poll(`document.querySelectorAll('.three-d-object[data-ready=true]').length===2`);
check('insertion retains live Spatial Document',await evaluate(`!!p.session.spatial.activeRoot()`));
await evaluate(`p.root('counter').querySelectorAll('button')[1].click()`);check('qualified counter stays live',await evaluate(`p.node('counter').payload.count`),1);
await evaluate(`p.root('cup').querySelector('[aria-label="3D Object menu"]').click()`);await wait();check('Spatial widget menu opens',await evaluate(`!!document.querySelector('.reactive-block-menu')`));
await evaluate(`p.editor.overlays.dismissTopWithoutRestoring()`);
const point=await evaluate(`(()=>{const r=p.root('cup').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
const before=await evaluate(`JSON.stringify(p.node('cup').payload.object3D)`);
await send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',buttons:1,clickCount:1},sessionId);
await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x+60,y:point.y+20,button:'left',buttons:1},sessionId);
await evaluate(`window.retired=p.root('cup');[...document.querySelectorAll('button')].find(b=>b.textContent==='Return to desk').click()`);
await poll(`document.querySelector('.workspace-spatial')?.dataset.phase==='desk'`);
await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x+60,y:point.y+20,button:'left',buttons:0,clickCount:1},sessionId);
check('return cancels unfinished orbit',await evaluate(`JSON.stringify(p.node('cup').payload.object3D)`),before);
check('return removes live widgets',await evaluate(`document.querySelectorAll('.three-d-object').length`),0);
const frames=await evaluate(`retired.dataset.frames`);await wait(300);check('unmounted renderer stops',await evaluate(`retired.dataset.frames`),frames);
check('physical desk placement unchanged',await evaluate(`JSON.stringify(p.session.spatial.layout().placements)`),placement);
await shot('spatial-resting-preview');
for(let i=0;i<2;i++){await activate();check('repeated activation '+i,await evaluate(`document.querySelectorAll('.three-d-object[data-ready=true]').length`),2);await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Return to desk').click()`);await poll(`document.querySelector('.workspace-spatial')?.dataset.phase==='desk'`);}
await activate();
const frameBefore=await evaluate(`document.querySelector('.workspace-spatial').dataset.frames`);
await evaluate(`window.lostCanvas=p.root('cup').querySelector('canvas');lostCanvas.getContext('webgl2').getExtension('WEBGL_lose_context').loseContext()`);await poll(`p.root('cup').textContent.includes('Graphics paused')`);
check('widget graphics failure retains live Document',await evaluate(`!!p.session.spatial.activeRoot()`));
check('second widget unaffected',await evaluate(`document.querySelectorAll('.three-d-object[data-ready=true]').length`),1);
await evaluate(`p.root('cup').querySelector('.three-d-object__fallback button').click()`);await poll(`p.root('cup').dataset.ready==='true'`);
check('graphics retry replaces the lost canvas',await evaluate(`p.root('cup').querySelector('canvas')!==lostCanvas`));
check('graphics retry has a usable context',await evaluate(`!p.root('cup').querySelector('canvas').getContext('webgl2').isContextLost()`));
await evaluate(`p.session.selectPresentation('canvas')`);await poll(`p.root('cup')?.dataset.ready==='true'`);
await evaluate(`p.session.presentation.setCamera({x:0,y:0,zoom:.5})`);await wait(300);
check('same Block works in actual Canvas host',await evaluate(`p.root('cup').dataset.ready==='true'`));await shot('canvas-live-document');
await evaluate(`p.session.selectPresentation('desktop')`);await poll(`p.root('cup')?.dataset.ready==='true'`);
check('return to Desktop preserves counter',await evaluate(`p.node('counter').payload.count`),1);
await writeFile(path.join(artifacts,'spatial-results.json'),JSON.stringify({checks},null,2));console.log(JSON.stringify({checks},null,2));
await evaluate(`p.dispose();p.session.dispose();p.host.remove()`);
} finally {
 socket?.close();if(chrome.pid&&chrome.exitCode===null&&chrome.signalCode===null){const exited=new Promise(r=>chrome.once('exit',r));chrome.kill('SIGKILL');await exited;}
 chrome.stdin?.destroy();chrome.stdout?.destroy();chrome.stderr?.destroy();await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
