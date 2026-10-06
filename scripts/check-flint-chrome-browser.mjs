// Focused material chrome / native-editor integration proof. Node 22+, CHROME_BIN supported.
// Uses an isolated temporary document store, actual server process and Vite host.
// Writes only fixture files; evidence goes to artifacts/flint-material/chrome.
import { spawn } from 'node:child_process';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { tmpdir } from 'node:os';
import path from 'node:path';
const artifacts=process.env.PROOF_ARTIFACTS??'artifacts/flint-material/chrome';await mkdir(artifacts,{recursive:true});
const storeRoot=await mkdtemp(path.join(tmpdir(),'flint-native-store-'));
await mkdir(path.join(storeRoot,'vault/nested'),{recursive:true});
await writeFile(path.join(storeRoot,'vault/standalone.md'),'# Imported\n\n**native bold**');
let backend,port;
const startBackend=async()=>{backend=spawn(process.execPath,['scripts/native-production-test-host.mjs'],{env:{...process.env,PROOF_ROOT:storeRoot,PROOF_PORT:String(port??0)},stdio:['ignore','pipe','inherit']});
port=await new Promise((resolve,reject)=>{backend.stdout.once('data',b=>resolve(JSON.parse(b.toString()).port));backend.once('error',reject);backend.once('exit',code=>reject(new Error('Qualification server exited before startup: '+code)));});};
await startBackend();process.env.PORT=String(port);
const vite=await createServer({server:{host:'127.0.0.1',port:0,hmr:false}});await vite.listen();
const appUrl=`http://127.0.0.1:${vite.httpServer.address().port}`;
const control=(name)=>fetch(`http://127.0.0.1:${port}/__proof/${name}`,{method:name==='status'?'GET':'POST'});
const profile = await mkdtemp(path.join(tmpdir(), 'speedy-flint-check-'));
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
const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const requestId = ++id; const timeout=setTimeout(()=>{pending.delete(requestId);reject(new Error('CDP timeout: '+method));},60000);pending.set(requestId,{resolve:v=>{clearTimeout(timeout);resolve(v)},reject:e=>{clearTimeout(timeout);reject(e)}}); socket.send(JSON.stringify({id:requestId,method,params,...(sessionId ? {sessionId} : {})})); });
 const {targetId} = await send('Target.createTarget',{url:'about:blank'}); const {sessionId} = await send('Target.attachToTarget',{targetId,flatten:true});
 await send('Network.enable',{},sessionId);
 socket.addEventListener('message', event => { const msg=JSON.parse(event.data); if(msg.method==='Network.loadingFailed') console.error(JSON.stringify(msg.params)); });
 const evaluate = async expression => {
   if (expression.includes('await ') && !expression.trimStart().startsWith('(async()=>')) expression = `(async()=>{${expression}})()`;
   const result = await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);
   if(result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
   return result.result.value;
 };

 const checks=[], errors=[];const check=(name,value,expected=true)=>{assert.deepEqual(value,expected,name);checks.push(name);console.log('Passed: '+name);};
 socket.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')errors.push(m.params.args.map(a=>a.value??a.description).join(' '))});
 await send('Runtime.enable',{},sessionId);await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false},sessionId);
 await send('Page.navigate',{url:appUrl},sessionId);await evaluate('new Promise(r=>setTimeout(r,1500))');
 await evaluate(`(async()=>{
 const {WorkspaceSession}=await import('/src/application/workspace-session.ts');
 const {materializeLocalWorkspace}=await import('/src/reactive-editor/workspace-manifest.ts');
 const {WorkspacePresentationView}=await import('/src/application/workspace-presentation-view.tsx');
 const {nativeDocumentSession}=await import('/src/persistence/native-session.ts');
 const codec=await import('/src/persistence/native-resource.ts');
 const source=await(await fetch('/src/rendering/reactive-tree-view.tsx')).text();const {render,createComponent}=await import(source.split('"').find(p=>p.includes('/solid-js_web.js')));
 const host=document.createElement('div');host.className='workspace-demo workspace-demo--canonical';host.style.cssText='position:fixed;inset:40px 0 0;z-index:9000;background:#eee;overflow:auto';document.body.append(host);
 const make=()=>new WorkspaceSession(materializeLocalWorkspace({id:crypto.randomUUID(),type:'workspace-block',children:[]}),{features:{publicHostedVersion:false,...( ${process.env.P4_FACTS==='0'} ? {nativeKnowledge:false}:{}),nativeKnowledgeSaved:${process.env.P5_SAVED==='1'}}});
 const setup=()=>{const session=make(),editor=session.editor;editor.commandRegistry.execute('flint.open',{targetKey:session.projection.state.rootKey,args:undefined});const dispose=render(()=>createComponent(WorkspacePresentationView,{session}),host);editor.installGateway(document);return {session,editor,dispose}};
 window.proof={host,setup,...setup(),nativeDocumentSession,codec};
 proof.click=text=>{const button=[...host.querySelectorAll('button')].find(b=>b.textContent===text);if(!button)throw Error('Missing '+text);button.click()};
 proof.field=(label,value)=>{const input=host.querySelector('input[aria-label="'+label+'"]');input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));};
 proof.wait=async predicate=>{for(let i=0;i<150;i++){if(predicate())return;await new Promise(r=>setTimeout(r,30));}throw Error('UI wait timed out: '+host.textContent.slice(0,1700))};
 })()`);
 await evaluate(`proof.one=proof.host.querySelector('.flint-application');proof.win=proof.one;
 proof.click=text=>{if(text==='Close tab'||text==='Files'){const m=proof.win.querySelector('[aria-label="Flint application menu"]');if(m.getAttribute('aria-expanded')!=='true')m.click();}const b=[...proof.win.querySelectorAll('button')].find(b=>b.textContent===text);if(!b||b.disabled)throw Error('Button unavailable '+text);b.click();};
 proof.field=(label,value)=>{const el=proof.win.querySelector('[aria-label="'+label+'"]');if(!el)throw Error('Field missing '+label);el.value=value;el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));};
 proof.windowNode=proof.editor.node(proof.win.closest('.reactive-window').dataset.nodeKey);
 const wn=Object.values(proof.session.projection.state.nodes).find(n=>n.viewType==='window-block');proof.windowKey=wn.key;proof.editor.commands.setPayloadField(wn.key,'metadata',{...JSON.parse(JSON.stringify(wn.payload.metadata)),size:{w:1320,h:800}});
 proof.id=()=>proof.win.querySelector('[data-flint-property="id"]').textContent;
 proof.ready=()=>![...proof.win.querySelectorAll('button')].find(b=>b.textContent==='Refresh')?.disabled;
 `);
 const click=label=>evaluate(`proof.click(${JSON.stringify(label)})`),field=(label,value)=>evaluate(`proof.field(${JSON.stringify(label)},${JSON.stringify(value)})`),wait=p=>evaluate(`proof.wait(()=>(${p}))`);
 const ready=()=>wait('proof.ready()');
 const shot=async name=>{const {data}=await send('Page.captureScreenshot',{format:'png'},sessionId);await writeFile(path.join(artifacts,name+'.png'),Buffer.from(data,'base64'));};
 await evaluate(`(async()=>{
   const module=await import('/src/features/flint/material/material-chrome.tsx');
   proof.material=module.materialChromePresentation(proof.win);
   await proof.wait(()=>proof.win.dataset.materialReady==='true');
   proof.scene=proof.material.scene;
 })()`);
 check('one material canvas and one explicitly registered editor viewport',await evaluate(`proof.win.querySelectorAll('.flint-material-canvas').length===1&&proof.scene.metrics.surfaces===1&&proof.scene.camera.isOrthographicCamera`));
 await evaluate('new Promise(r=>setTimeout(r,500))');await shot('chrome-default');
 await evaluate(`proof.win.querySelector('.flint-light-controls').open=true;proof.sunBefore=proof.scene.scene.children.find(o=>o.isDirectionalLight).position.toArray();proof.field('Direction',135)`);
 await wait(`JSON.stringify(proof.scene.scene.children.find(o=>o.isDirectionalLight).position.toArray())!==JSON.stringify(proof.sunBefore)`);
 await evaluate(`proof.win.querySelector('.flint-light-controls').open=false`);await shot('chrome-reversed');
 await evaluate(`proof.field('Direction',315);proof.win.querySelector('[aria-label="Environmental occlusion"]').click()`);
 await wait(`!proof.scene.rig.group.visible`);await shot('chrome-open');
 check('environment toggles the real shadow-casting architecture',await evaluate(`!proof.scene.rig.environment.enabled&&proof.scene.rig.group.children.length===0`));
 await evaluate(`proof.win.querySelector('[aria-label="Environmental occlusion"]').click()`);await wait('proof.scene.rig.group.visible');
 // The ordinary Mutable mount is exercised through real browser text input.
 await evaluate(`proof.view=[...proof.editor.projections.values()].find(p=>p!==proof.session.projection);proof.node=Object.values(proof.view.state.nodes).find(n=>n.viewType==='standoff-editor-block');proof.mount=proof.editor.mounts.get(proof.node.key);proof.editor.focus.request(proof.node.key);proof.mount.restoreInlineSelection({anchor:0,head:0});proof.textBefore=proof.mount.captureText()`);
 await send('Input.insertText',{text:'Material light, ordinary words. '},sessionId);
 check('native editor accepts real browser text input over the material',await evaluate(`proof.mount.captureText()==='Material light, ordinary words. '+proof.textBefore`));
 await evaluate(`proof.mount.restoreInlineSelection({anchor:0,head:14});proof.beforeSnapshot=JSON.stringify(proof.editor.repository.snapshot());proof.selection=JSON.stringify(proof.mount.captureInlineSelection());proof.frames=proof.scene.metrics.frames;proof.win.querySelector('[aria-label="Toggle Library"]').click();proof.field('Intensity',.5)`);
 await wait('proof.scene.metrics.frames>proof.frames');
 check('light and responsive layout retain the mounted editor, range and document state',await evaluate(`proof.mount===proof.editor.mounts.get(proof.node.key)&&JSON.stringify(proof.mount.captureInlineSelection())===proof.selection&&JSON.stringify(proof.editor.repository.snapshot())===proof.beforeSnapshot`));
 await evaluate(`proof.win.querySelector('[aria-label="Toggle Library"]').click();proof.field('Intensity',.85)`);
 await evaluate(`proof.win.querySelector('[aria-label="Material effects"]').click()`);await wait('proof.scene.disposed');
 check('effects opt-out removes graphics and keeps editor mounted',await evaluate(`!proof.win.querySelector('.flint-material-canvas')&&proof.mount===proof.editor.mounts.get(proof.node.key)&&proof.win.dataset.materialReady==='false'`));await shot('chrome-fallback');
 await evaluate(`proof.win.querySelector('[aria-label="Material effects"]').click()`);await wait('proof.material.scene&&proof.win.dataset.materialReady===\'true\'');
 await evaluate(`proof.scene=proof.material.scene;proof.contextExtension=proof.scene.renderer.getContext().getExtension('WEBGL_lose_context');proof.contextExtension.loseContext()`);await wait(`proof.win.dataset.materialReady==='false'`);
 check('context loss exposes readable CSS while editor survives',await evaluate(`proof.win.querySelector('.flint-material-canvas').hidden&&proof.mount===proof.editor.mounts.get(proof.node.key)`));
 await evaluate(`proof.contextExtension.restoreContext()`);await wait(`proof.win.dataset.materialReady==='true'`);
 await send('Emulation.setEmulatedMedia',{features:[{name:'forced-colors',value:'active'}]},sessionId);
 await wait(`proof.win.dataset.materialReady==='false'&&!proof.material.scene`);
 check('forced colours releases graphics while native editing stays available',await evaluate(`proof.mount===proof.editor.mounts.get(proof.node.key)`));
 await send('Emulation.setEmulatedMedia',{features:[]},sessionId);await wait(`proof.win.dataset.materialReady==='true'`);
 await evaluate(`proof.scene=proof.material.scene;void 0`);
 await evaluate(`proof.editor.commands.setPayloadField(proof.windowKey,'metadata',{...JSON.parse(JSON.stringify(proof.editor.node(proof.windowKey).payload.metadata)),size:{w:760,h:800}})`);
 await evaluate('new Promise(r=>setTimeout(r,250))');await shot('chrome-narrow');
 check('registered surface follows responsive DOM viewport',await evaluate(`(()=>{const r=proof.win.querySelector('.flint-application__editor').getBoundingClientRect();const meshes=proof.scene.scene.children.filter(o=>o.isMesh);return meshes.some(m=>Math.abs(m.scale.x-r.width)<2&&Math.abs(m.scale.y-r.height)<2)})()`));
 await evaluate(`proof.frames=proof.scene.metrics.frames;await new Promise(r=>setTimeout(r,150))`);
 check('static scene idles',await evaluate(`proof.frames===proof.scene.metrics.frames&&!proof.material.lighting.pending`));
 await evaluate(`proof.dispose();proof.session.dispose()`);
 check('unmount releases material renderer and scheduler',await evaluate(`proof.scene.disposed&&proof.material.lighting.disposed`));
 // Same Graph fixture and viewport as A.5, now under the actual environment.
 await send('Emulation.setDeviceMetricsOverride',{width:1536,height:1024,deviceScaleFactor:1,mobile:false},sessionId);
 await send('Page.navigate',{url:appUrl+'/flint-material-three'},sessionId);
 await evaluate(`(async()=>{for(let i=0;i<250;i++){if(document.querySelector('[data-ready="true"]'))return;await new Promise(r=>setTimeout(r,40));}throw Error('Graph not ready')})()`);
 await evaluate(`(async()=>{const m=await import('/src/features/flint/material-playground.tsx');window.graphRoot=document.querySelector('.flint-material-playground');window.graphProof=m.materialPlaygroundPresentation(graphRoot);await new Promise(r=>setTimeout(r,700));})()`);
 check('Graph retains sculptures and HTML labels with a real material environment',await evaluate(`graphProof.graph.nodes.length===13&&graphRoot.querySelectorAll('.flint-three-label').length===13&&graphProof.materialScene.metrics.frames>0`));await shot('graph-environment');
 await evaluate(`const direction=graphRoot.querySelector('[aria-label="Direction"]');direction.value='135';direction.dispatchEvent(new Event('input',{bubbles:true}));await new Promise(r=>setTimeout(r,200))`);await shot('graph-reversed');
 await evaluate(`graphProof.graph.select('waste-land');window.oldX=graphProof.graph.views.get('waste-land').group.position.x;graphProof.graph.move(15,0);graphProof.graph.zoomBy(.1);await new Promise(r=>setTimeout(r,150))`);
 check('Graph selection, movement and XY zoom still work',await evaluate(`graphProof.graph.views.get('waste-land').group.position.x===oldX+15&&graphProof.graph.selectedId==='waste-land'`));
 check('no uncaught runtime errors',errors.length,0);
 await writeFile(path.join(artifacts,'browser-results.json'),JSON.stringify({checks,errors,limits:['Headless Chromium with software WebGL. Original concept reviewed visually; no pixel-equivalence claim.']},null,2));
 console.log(JSON.stringify({passed:checks.length,artifacts},null,2));
} finally {
 socket?.close();chrome.kill('SIGKILL');backend?.kill('SIGKILL');vite.httpServer?.closeAllConnections();await vite.close();await new Promise(r=>setTimeout(r,200));await rm(profile,{recursive:true,force:true});await rm(storeRoot,{recursive:true,force:true});
}
