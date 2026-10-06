// Isolated presentation fixture only. No backend or Cavern is opened.
// Node 22+, installed Chromium; CHROME_BIN and PROOF_ARTIFACTS may override defaults.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'vite';

const artifacts = process.env.PROOF_ARTIFACTS ?? 'artifacts/flint-material/three-spike';
await mkdir(artifacts, { recursive: true });
const vite = await createServer({ server: { host: '127.0.0.1', port: 0, hmr: false } }); await vite.listen();
const url = `http://127.0.0.1:${vite.httpServer.address().port}`;
const profile = await mkdtemp(path.join(tmpdir(), 'flint-material-'));
const chrome = spawn(process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--enable-unsafe-swiftshader', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
let socket;
try {
  const endpoint = await new Promise((resolve, reject) => {
    let output = ''; const timeout = setTimeout(() => reject(new Error('Chrome startup timeout')), 15000);
    chrome.stderr.on('data', chunk => { output += chunk; const match = output.match(/DevTools listening on (ws:\/\/\S+)/); if (match) { clearTimeout(timeout); resolve(match[1]); } });
    chrome.once('error', reject);
  });
  socket = new WebSocket(endpoint); await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
  let sequence = 0, traceComplete; const requests = new Map(), errors = [], apiRequests = [], paintEvents = [];
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id && requests.has(message.id)) { const request = requests.get(message.id); requests.delete(message.id); clearTimeout(request.timer); message.error ? request.reject(new Error(JSON.stringify(message.error))) : request.resolve(message.result); }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') errors.push(message.params.args.map(a=>a.value??a.description).join(' '));
    if (message.method === 'Network.requestWillBeSent' && message.params.request.url.includes('/api/')) apiRequests.push(message.params.request.url);
    if (message.method === 'Tracing.dataCollected') paintEvents.push(...message.params.value.filter(e => e.name === 'Paint' && e.ph === 'X'));
    if (message.method === 'Tracing.tracingComplete') traceComplete?.();
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++sequence, timer = setTimeout(() => { requests.delete(id); reject(new Error('CDP timeout: ' + method)); }, 90000);
    requests.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  const version = await send('Browser.getVersion');
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' }), { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const evaluate = async expression => {
    if (expression.includes('await ') && !expression.startsWith('(async()=>')) expression = `(async()=>{${expression}})()`;
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId);
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  await send('Runtime.enable', {}, sessionId); await send('Network.enable', {}, sessionId); await send('Performance.enable', {}, sessionId);
  await send('Emulation.setDeviceMetricsOverride', { width: 1536, height: 1024, deviceScaleFactor: 1, mobile: false }, sessionId);
  await send('Page.navigate', { url: `${url}/flint-material-three` }, sessionId);
  await evaluate(`(async()=>{for(let i=0;i<400;i++){if(document.querySelector('[data-ready="true"]'))return;await new Promise(r=>setTimeout(r,50));}throw Error('Playground did not become ready')})()`);
  await evaluate(`(async()=>{
    const module=await import('/src/features/flint/material-playground.tsx');
    const root=document.querySelector('.flint-material-playground');
    window.study={module,root,p:module.materialPlaygroundPresentation(root),wait:ms=>new Promise(r=>setTimeout(r,ms))};
    study.until=async predicate=>{for(let i=0;i<100;i++){if(predicate())return;await study.wait(25);}throw Error('Browser state did not settle')};
    study.input=(label,value)=>{const el=root.querySelector('[aria-label="'+label+'"]');if(!el)throw Error('Missing '+label);el.value=value;el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));};
    study.click=text=>{const b=[...root.querySelectorAll('button')].find(b=>b.textContent===text);if(!b||b.disabled)throw Error('Unavailable '+text);b.click();};
    study.nodes=[...root.querySelectorAll('.flint-material-graph .x6-node')];
  })()`);
  // Await bitmap albedo decode before capturing or comparing rendered pixels.
  await evaluate(`(async()=>{const urls=[...new Set([...study.root.querySelectorAll('svg image')].map(i=>i.getAttribute('href')).filter(u=>u&&!u.startsWith('data:')))];await Promise.all(urls.map(async u=>{const i=new Image();i.src=u;await i.decode()}));await study.wait(100)})()`);
  const checks = []; const check = (label, actual, expected = true) => { assert.deepEqual(actual, expected, label); checks.push(label); };
  const shot = async name => { const { data } = await send('Page.captureScreenshot', { format: 'png' }, sessionId); await writeFile(path.join(artifacts, name + '.png'), Buffer.from(data, 'base64')); };
  await evaluate(`await study.until(()=>study.p.graph.metrics.loadedTextures===2&&study.p.graph.metrics.frames>0);await study.wait(300)`);
  check('orthographic Graph-only renderer with 13 real sculptural nodes',await evaluate(`study.p.graph.nodes.length===13&&study.p.graph.camera.isOrthographicCamera&&study.root.querySelectorAll('.flint-three-canvas').length===1&&!study.root.querySelector('.x6-graph')`));
  check('HTML labels remain selectable',await evaluate(`(()=>{const l=study.root.querySelector('.flint-three-label'),r=document.createRange();r.selectNodeContents(l);const s=window.getSelection();s.removeAllRanges();s.addRange(r);const ok=s.toString()==='The Waste Land'&&getComputedStyle(l).userSelect==='text';s.removeAllRanges();return ok})()`));
  check('sculptures use standard stone materials and real shadow geometry',await evaluate(`study.p.graph.scene.children.some(o=>o.isDirectionalLight&&o.castShadow)&&study.p.graph.views.get('waste-land').group.children[0].geometry.getAttribute('position').count>5000&&study.p.graph.views.get('waste-land').group.children[0].material.bumpMap!==null`));
  await shot('three-reference');
  await evaluate(`study.sunBefore=study.p.graph.scene.children.find(o=>o.isDirectionalLight).position.toArray();study.input('Direction',135);await study.wait(200)`);await shot('three-light-reversed');
  check('existing Flint light changes the physical scene',await evaluate(`JSON.stringify(study.p.graph.scene.children.find(o=>o.isDirectionalLight).position.toArray())!==JSON.stringify(study.sunBefore)&&study.p.graph.metrics.frames>1`));
  await evaluate(`study.click('Reset to Flint Default');await study.wait(100)`);
  const point=await evaluate(`study.p.graph.project(study.p.graph.views.get('waste-land').group.position)`);
  const rect=await evaluate(`(()=>{const r=study.root.querySelector('.flint-three-canvas').getBoundingClientRect();return {x:r.left,y:r.top}})()`);
  const client={x:point.x+rect.x,y:point.y+rect.y};
  check('raycast selects the carved head',await evaluate(`study.p.graph.hit(${JSON.stringify(client)})==='waste-land'`));
  const before=await evaluate(`study.p.graph.views.get('waste-land').group.position.x`);
  await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...client},sessionId);
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,x:client.x+30,y:client.y+20},sessionId);
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x:client.x+30,y:client.y+20},sessionId);
  await evaluate(`await study.wait(80)`);
  check('real mouse selection and XY dragging work',await evaluate(`study.p.graph.selectedId==='waste-land'&&study.p.graph.views.get('waste-land').group.position.x>${before}&&study.p.graph.views.get('waste-land').group.position.z===.12`));
  const cameraBefore=await evaluate(`study.p.graph.camera.position.x`);
  await evaluate(`study.p.graph.pan(30,10);study.p.graph.zoomBy(.1);await study.wait(100)`);
  check('pan and zoom remain two-dimensional',await evaluate(`study.p.graph.camera.position.x!==${cameraBefore}&&study.p.graph.camera.position.z===1600&&study.p.graph.zoom>1`));
  const blank=await evaluate(`(()=>{const r=study.root.querySelector('.flint-three-canvas').getBoundingClientRect();return {x:r.right-20,y:r.top+100}})()`);
  const beforePan=await evaluate(`study.p.graph.camera.position.x`);
  await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...blank},sessionId);
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,x:blank.x-25,y:blank.y+10},sessionId);
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x:blank.x-25,y:blank.y+10},sessionId);
  await evaluate(`await study.wait(80);study.p.graph.select('waste-land')`);
  check('real blank-canvas dragging pans the camera',await evaluate(`study.p.graph.camera.position.x!==${beforePan}`));
  await evaluate(`study.input('Lift',.75);await study.wait(100)`);
  check('shared local lift drives actual Z elevation',await evaluate(`study.p.graph.views.get('waste-land').group.position.z===9.12`));
  await shot('three-lift');
  await evaluate(`study.click('Clear local');study.click('Send wave');await study.wait(120)`);
  check('finite wave uses the shared response scheduler',await evaluate(`study.p.graph.views.get('waste-land').wave.visible`));
  await evaluate(`await study.wait(1000)`);
  check('static scene becomes idle after finite effects',await evaluate(`!study.p.lighting.pending&&!study.p.graph.views.get('waste-land').wave.visible`));
  const sanity=[];
  for(const count of [13,50,250]){
    await evaluate(`study.input('Graph fixture size',${count});await study.wait(400)`);
    const result=await evaluate(`(async()=>{const deltas=[],render=[];let previous;for(let i=0;i<24;i++){const t=await new Promise(requestAnimationFrame);if(previous!==undefined)deltas.push(t-previous);previous=t;study.p.lighting.setLight({azimuth:(i*13)%360});render.push(study.p.graph.metrics.lastRenderMs)}await study.wait(100);deltas.sort((a,b)=>a-b);render.sort((a,b)=>a-b);return {count:study.p.graph.nodes.length,medianFrameMs:deltas[Math.floor(deltas.length/2)],p95FrameMs:deltas[Math.ceil(deltas.length*.95)-1],medianSubmitMs:render[Math.floor(render.length/2)],metrics:{...study.p.graph.metrics},idle:!study.p.lighting.pending}})()`);
    check(`${count} nodes render and become idle`,result.count===count&&result.idle);sanity.push(result);console.log(JSON.stringify(result));
  }
  await evaluate(`study.input('Graph fixture size',13);study.click('Reset to Flint Default');await study.wait(200)`);await shot('three-reference-final');
  // Closely cropped actual viewport pixels, with orthographic zoom unchanged.
  for(const [id,name] of [['waste-land','mask'],['london','pyramids'],['time','spiral'],['rebirth','crescent'],['modernism','disc']]){
    const clip=await evaluate(`(()=>{const v=study.p.graph.views.get(${JSON.stringify(id)}),p=study.p.graph.project(v.group.position),r=study.root.querySelector('.flint-three-canvas').getBoundingClientRect(),z=study.p.graph.zoom;return {x:r.left+p.x-v.spec.width*z/2-25,y:r.top+p.y-v.spec.height*z/2-25,width:v.spec.width*z+50,height:v.spec.height*z+80,scale:2}})()`);
    const {data}=await send('Page.captureScreenshot',{format:'png',clip},sessionId);await writeFile(path.join(artifacts,`three-${name}-detail.png`),Buffer.from(data,'base64'));
  }
  await evaluate(`(async()=>{const source=await(await fetch('/src/features/flint/material-playground.tsx')).text();study.renderer=await import(source.split('"').find(s=>s.includes('/solid-js_web.js')));const module=await import('/src/features/flint/three-material-playground.tsx');study.secondHost=document.createElement('div');document.body.append(study.secondHost);study.stopSecond=study.renderer.render(()=>module.default({}),study.secondHost);await study.wait(250);const root=study.secondHost.querySelector('.flint-material-playground');study.second=study.module.materialPlaygroundPresentation(root);study.stopSecond();study.secondHost.remove();await study.wait(100)})()`);
  check('unmount releases renderer, targets and scheduler',await evaluate(`study.second.graph.disposed&&study.second.lighting.disposed&&!study.second.lighting.pending&&study.second.interactions.activeCount===0`));
  await evaluate(`(async()=>{const app=await import('/src/App.tsx');const host=document.createElement('div');document.body.append(host);const stop=study.renderer.render(()=>app.default({configuration:{features:{flintThreeGraphSpike:false}}}),host);study.disabled=host.textContent.includes('Three.js Graph spike disabled')&&!host.querySelector('canvas');stop();host.remove()})()`);
  check('new feature flag opt-out prevents the spike',await evaluate('study.disabled'));
  check('no canonical/persistence API calls',apiRequests.length,0);check('no uncaught browser exceptions',errors.length,0);
  const driver=await evaluate(`(()=>{const g=study.p.graph.renderer.getContext(),e=g.getExtension('WEBGL_debug_renderer_info');return e?g.getParameter(e.UNMASKED_RENDERER_WEBGL):g.getParameter(g.RENDERER)})()`);
  await writeFile(path.join(artifacts,'browser-results.json'),JSON.stringify({browser:version.product,driver,viewport:'1536×1024, device scale 1',checks,sanity,errors,apiRequests,limits:['Headless Chromium with software WebGL fallback allowed; this is a sanity check, not GPU or production qualification.','Frame cadence includes browser/compositor scheduling. Submit time is CPU-side renderer.render(), not GPU completion.']},null,2));
  console.log(JSON.stringify({passed:checks.length,artifacts},null,2));
} finally {
  socket?.close();chrome.kill('SIGKILL');vite.httpServer?.closeAllConnections();await vite.close();await new Promise(r=>setTimeout(r,200));await rm(profile,{recursive:true,force:true});
}
