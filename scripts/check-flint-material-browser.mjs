// Isolated presentation fixture only. No backend or Cavern is opened.
// Node 22+, installed Chromium; CHROME_BIN and PROOF_ARTIFACTS may override defaults.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'vite';

const artifacts = process.env.PROOF_ARTIFACTS ?? 'artifacts/flint-material/phase-a';
await mkdir(artifacts, { recursive: true });
const vite = await createServer({ server: { host: '127.0.0.1', port: 0, hmr: false } }); await vite.listen();
const url = `http://127.0.0.1:${vite.httpServer.address().port}`;
const profile = await mkdtemp(path.join(tmpdir(), 'flint-material-'));
const chrome = spawn(process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
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
  await send('Page.navigate', { url: `${url}/flint-material` }, sessionId);
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
  check('reference fixture and engine minimap render', await evaluate(`study.p.graph.nodes.length===13 && !!study.root.querySelector('.x6-widget-minimap-viewport')`));
  check('scoped Cycladic tokens replace the old palette within the study', await evaluate(`getComputedStyle(study.root).getPropertyValue('--flint-chalk').trim()==='#f7f5ee'`));
  check('SVG typography supports native text selection', await evaluate(`(()=>{const label=study.root.querySelector('[data-fixture-id="waste-land"] .flint-graph-label'),range=document.createRange();range.selectNodeContents(label);const s=window.getSelection();s.removeAllRanges();s.addRange(range);const selected=s.toString().split(String.fromCharCode(160)).join(' ')==='The Waste Land'&&getComputedStyle(label).userSelect==='text';s.removeAllRanges();return selected})()`));
  await shot('reference-default');
  check('one decorative workspace field renders above the material plane', await evaluate(`study.root.querySelectorAll('.flint-light-field-plane').length===1&&getComputedStyle(study.root.querySelector('.flint-light-field')).pointerEvents==='none'&&study.root.querySelector('.flint-light-field-plane').style.backgroundImage.includes('135deg')`));
  await evaluate(`study.input('Cloud variation',0);study.input('Mineral marks',0);study.input('Fine grain',0);await study.wait(100)`);
  const sampleClip = await evaluate(`(()=>{const n=study.p.graph.graph.getCellById('waste-land'),p=n.position(),s=n.size(),c=study.p.graph.graph.localToClient({x:p.x+s.width*.4,y:p.y+s.height*.35});return {x:c.x,y:c.y,width:20,height:25,scale:1}})()`);
  const plainStone = await send('Page.captureScreenshot', { format: 'png', clip: sampleClip }, sessionId);
  check('texture scales can be independently controlled', await evaluate(`study.root.querySelector('.flint-material-picture').style.getPropertyValue('--flint-macro-amount')==='0'&&[...study.root.querySelector('pattern[id$="-texture-limestone"]').children].every(g=>g.getAttribute('opacity')==='0')`));
  await evaluate(`study.click('Reset to Flint Default');await study.wait(120)`);
  const texturedStone = await send('Page.captureScreenshot', { format: 'png', clip: sampleClip }, sessionId);
  const textureDifference = await evaluate(`(async()=>{const pixels=async data=>{const i=new Image();i.src='data:image/png;base64,'+data;await i.decode();const c=document.createElement('canvas');c.width=i.width;c.height=i.height;const x=c.getContext('2d');x.drawImage(i,0,0);return x.getImageData(0,0,i.width,i.height).data};const a=await pixels('${plainStone.data}'),b=await pixels('${texturedStone.data}');let sum=0;for(let i=0;i<a.length;i+=4)sum+=Math.abs(a[i]-b[i]);return sum/(a.length/4)})()`);
  check('cached texture layers affect actual stone pixels', textureDifference > .6);
  // Inspect actual raster output: definition/style checks alone cannot catch a
  // black fallback fill inside an SVG <use> instance tree.
  const stonePoint = await evaluate(`(()=>{const n=study.p.graph.graph.getCellById('waste-land'),p=n.position(),s=n.size();return study.p.graph.graph.localToClient({x:p.x+s.width*.55,y:p.y+s.height*.45}).toJSON()})()`);
  const stonePixel = await send('Page.captureScreenshot', { format: 'png', clip: { x: stonePoint.x - 1, y: stonePoint.y - 1, width: 2, height: 2, scale: 1 } }, sessionId);
  check('rendered limestone keeps its pale albedo through SVG symbol cloning', await evaluate(`(async()=>{const img=new Image();img.src='data:image/png;base64,${stonePixel.data}';await img.decode();const c=document.createElement('canvas');c.width=c.height=2;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);const p=ctx.getImageData(0,0,1,1).data;return p[0]>130&&p[1]>130&&p[2]>130})()`));
  check('limestone texture uses reusable patterns clipped to object silhouettes', await evaluate(`(()=>{const texture=study.root.querySelector('.flint-stone-texture'),mask=texture.getAttribute('mask').slice(5,-1);return getComputedStyle(texture).fill.includes('-texture-limestone')&&!!document.getElementById(mask)&&study.p.interactions.target('waste-land').material.name==='limestone'})()`));
  check('both sculptural stone finishes use cached bitmap albedo with multiplicative shading', await evaluate(`study.root.querySelectorAll('svg image[href*="-albedo.png"]').length===2&&study.root.querySelectorAll('[data-albedo]').length===2&&getComputedStyle(study.root.querySelector('.flint-stone-texture')).mixBlendMode==='multiply'`));
  await evaluate(`study.input('Stone finish','marble');await study.wait(100)`);
  check('marble finish changes texture and material without replacing nodes', await evaluate(`study.root.querySelector('.flint-material-graph').dataset.finish==='marble'&&getComputedStyle(study.root.querySelector('.flint-stone-texture')).fill.includes('-texture-marble')&&study.p.interactions.target('waste-land').material.name==='marble'&&study.nodes.every((n,i)=>n===study.root.querySelectorAll('.flint-material-graph .x6-node')[i])`));
  await shot('reference-marble');
  await evaluate(`study.input('Stone finish','untextured');await study.wait(80)`);
  check('shading-only finish removes texture while retaining relief', await evaluate(`getComputedStyle(study.root.querySelector('.flint-stone-texture')).display==='none'&&getComputedStyle(study.root.querySelector('.flint-graph-relief')).filter!=='none'`));
  await shot('reference-untextured');
  await evaluate(`study.input('Stone finish','limestone');study.input('Graph detail','simple');await study.wait(80)`);
  check('simplified detail removes texture cost', await evaluate(`getComputedStyle(study.root.querySelector('.flint-stone-texture')).display==='none'`));
  await evaluate(`study.input('Graph detail','full');await study.wait(80)`);
  await evaluate(`study.input('Direction',135);await study.wait(100)`);
  check('shared light changes facet tones and SVG shadow direction without remounting nodes', await evaluate(`study.root.style.getPropertyValue('--flint-facet-left')!==study.root.style.getPropertyValue('--flint-facet-right') && Number(study.root.querySelector('filter[id$="-object"] feDropShadow').getAttribute('dx'))>0 && study.nodes.every((n,i)=>n===study.root.querySelectorAll('.flint-material-graph .x6-node')[i])`));
  await shot('reference-light-reversed');
  check('macro illumination follows the same reversed light as relief shadows', await evaluate(`study.root.querySelector('.flint-light-field-plane').style.backgroundImage.includes('315deg')`));
  await evaluate(`study.click('Reset to Flint Default');study.input('Local response surface','relief');study.input('Contact',1);study.input('Lift',.75);await study.wait(100)`);
  check('local response affects only the selected relief', await evaluate(`study.root.querySelectorAll('.flint-material-graph [data-local-active="true"]').length===1 && study.p.interactions.state('waste-land').lift===.75`));
  await shot('reference-local-relief');
  await evaluate(`study.click('Clear local');study.click('Send wave');await study.wait(150)`);
  check('finite wave is visible on its target', await evaluate(`Number(study.p.graph.graph.getCellById('waste-land').attr('wave/opacity'))>0`));
  await evaluate(`await study.wait(1100)`);
  check('wave expires and scheduler becomes idle', await evaluate(`!study.p.lighting.pending && !study.p.interactions.state('waste-land').wave && Number(study.p.graph.graph.getCellById('waste-land').attr('wave/opacity'))===0`));
  await evaluate(`study.input('Local response surface','panel');study.input('Contact X',20);study.input('Contact',1);study.input('Press',1);await study.wait(80)`);
  check('DOM surface uses the same bounded response and can become recessed', await evaluate(`study.root.querySelector('.flint-material-sample-panel').style.boxShadow.includes('inset') && study.root.querySelector('.flint-material-sample-panel').style.getPropertyValue('--flint-contact-x')==='20%'`));
  await evaluate(`study.click('Reset to Flint Default');await study.wait(80)`);
  check('reset restores light and clears all transient inputs', await evaluate(`study.p.lighting.light.azimuth===315 && study.p.interactions.activeCount===0`));
  // Real mouse drag and pan, then keyboard movement. No synthetic action dispatch substitutes for the engine.
  const point = await evaluate(`study.p.graph.graph.localToClient({x:453,y:355}).toJSON()`);
  const before = await evaluate(`study.p.graph.graph.getCellById('waste-land').position()`);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point }, sessionId);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', button: 'left', buttons: 1, x: point.x + 30, y: point.y + 20 }, sessionId);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, x: point.x + 30, y: point.y + 20 }, sessionId);
  check('engine mouse dragging moves a relief', await evaluate(`study.p.graph.graph.getCellById('waste-land').position().x>${before.x}`));
  await evaluate(`study.p.graph.select('waste-land');study.root.querySelector('.flint-material-graph').focus();study.beforeKey=study.p.graph.graph.getCellById('waste-land').position().x`);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 }, sessionId);
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 }, sessionId);
  check('keyboard movement works with a visible focus alternative', await evaluate(`study.p.graph.graph.getCellById('waste-land').position().x===study.beforeKey+5`));
  const blank = await evaluate(`(()=>{const r=study.root.querySelector('.flint-material-graph').getBoundingClientRect();return {x:r.right-25,y:r.top+60}})()`);
  await evaluate(`study.beforePan=study.p.graph.graph.translate()`);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...blank }, sessionId);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', button: 'left', buttons: 1, x: blank.x - 30, y: blank.y + 20 }, sessionId);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, x: blank.x - 30, y: blank.y + 20 }, sessionId);
  check('engine background panning works', await evaluate(`study.p.graph.graph.translate().tx!==study.beforePan.tx`));
  await evaluate(`study.p.graph.graph.zoomTo(.7);study.p.graph.pan(20,10)`);
  check('coordinate adapter accounts for both pan and zoom in local CSS-pixel units', await evaluate(`(()=>{const n=study.p.graph.graph.getCellById('waste-land'),r=n.position(),s=n.size(),p=study.p.graph.graph.localToClient({x:r.x+s.width/2,y:r.y+s.height/2}),local=study.p.interactions.target('waste-land').clientToLocal(p);return Math.abs(local.x-s.width/2)<.001&&Math.abs(local.y-s.height/2)<.001})()`));
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }, sessionId); await evaluate(`await study.until(()=>study.p.lighting.effects.reducedMotion)`);
  check('system reduced motion suppresses waves and travel through shared preferences', await evaluate(`study.p.lighting.effects.reducedMotion && [...study.root.querySelectorAll('button')].find(b=>b.textContent==='Send wave').disabled`));
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }, { name: 'forced-colors', value: 'active' }] }, sessionId); await evaluate(`await study.until(()=>study.p.lighting.effects.reducedEffects && getComputedStyle(study.root.querySelector('.flint-graph-relief')).filter==='none')`);
  check('forced colours remove decorative effects', await evaluate(`study.p.lighting.effects.reducedEffects && getComputedStyle(study.root.querySelector('.flint-graph-relief')).filter==='none'&&getComputedStyle(study.root.querySelector('.flint-stone-texture')).display==='none'&&getComputedStyle(study.root.querySelector('.flint-light-field')).display==='none'&&getComputedStyle(study.root.querySelector('.flint-material-picture')).display==='none'`));
  await shot('forced-colours');
  await send('Emulation.setEmulatedMedia', { features: [] }, sessionId);
  // Two independent roots, ID namespaces, lazy flag opt-out and disposal with a live wave.
  await evaluate(`(async()=>{const source=await(await fetch('/src/features/flint/material-playground.tsx')).text();study.renderer=await import(source.split('"').find(s=>s.includes('/solid-js_web.js')));study.secondHost=document.createElement('div');document.body.append(study.secondHost);study.stopSecond=study.renderer.render(()=>study.module.default(),study.secondHost);await study.wait(100);study.secondRoot=study.secondHost.querySelector('.flint-material-playground');study.second=study.module.materialPlaygroundPresentation(study.secondRoot);})()`);
  check('separate roots have separate lighting and SVG ID namespaces', await evaluate(`study.second.graph.prefix!==study.p.graph.prefix && study.second.lighting.light.azimuth===315 && [...document.querySelectorAll('[id]')].map(n=>n.id).length===new Set([...document.querySelectorAll('[id]')].map(n=>n.id)).size`));
  await evaluate(`study.second.interactions.wave('waste-land');study.stopSecond();study.secondHost.remove();await study.wait(50)`);
  check('unmount disposes graph, scheduler and transient targets during an active effect', await evaluate(`study.second.lighting.disposed && study.second.graph.disposed && !study.second.lighting.pending && study.second.interactions.activeCount===0 && !study.module.materialPlaygroundPresentation(study.secondRoot)`));
  await evaluate(`(async()=>{const app=await import('/src/App.tsx');const host=document.createElement('div');document.body.append(host);const stop=study.renderer.render(()=>app.default({configuration:{features:{flintMaterialLighting:false}}}),host);study.disabled=host.textContent.includes('Material playground disabled')&&!host.querySelector('.flint-material-playground');stop();host.remove()})()`);
  check('host feature opt-out leaves no playground mount', await evaluate('study.disabled'));
  await evaluate(`(async()=>{const app=await import('/src/App.tsx');const host=document.createElement('div');document.body.append(host);const stop=study.renderer.render(()=>app.default({configuration:{features:{flintLightField:false}}}),host);await study.wait(100);study.noField=!!host.querySelector('.flint-material-playground')&&!host.querySelector('.flint-light-field');stop();host.remove()})()`);
  check('macro field flag opt-out retains the material study', await evaluate('study.noField'));
  await send('Emulation.setDeviceMetricsOverride', { width: 600, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId); await evaluate(`await study.wait(100)`);
  check('narrow viewport has no horizontal overflow', await evaluate(`document.documentElement.scrollWidth<=600`)); await shot('narrow');
  await send('Emulation.setDeviceMetricsOverride', { width: 1536, height: 1024, deviceScaleFactor: 1, mobile: false }, sessionId);
  // Controlled browser measurements: visible fixture at fit zoom and a closer zoom, with shared light plus one local field.
  await evaluate(`study.input('Graph fixture size',50);await study.wait(100);study.fixtureDom=study.root.querySelectorAll('*').length;study.input('Graph fixture size',50);await study.wait(100)`);
  check('fixture replacement removes old main graph and minimap views', await evaluate(`study.root.querySelectorAll('*').length===study.fixtureDom && study.root.querySelectorAll('.flint-material-graph .x6-node').length===50 && study.root.querySelectorAll('.x6-widget-minimap .x6-node').length===50`));
  const baselineCadence = await evaluate(`(async()=>{const a=[];let previous;for(let i=0;i<30;i++){const now=await new Promise(requestAnimationFrame);if(previous!==undefined)a.push(now-previous);previous=now;}a.sort((x,y)=>x-y);return {medianMs:a[Math.floor(a.length/2)],p95Ms:a[Math.ceil(a.length*.95)-1]}})()`);
  const measurements = [];
  for (const count of process.env.MATERIAL_BENCH === '0' ? [] : [13, 50, 250, 1000]) for (const detail of ['full', 'simple', 'flat']) for (const zoom of ['fit', 'closer']) {
    await evaluate(`study.input('Graph fixture size',${count});study.input('Graph detail',${JSON.stringify(detail)});await study.wait(120);if(${JSON.stringify(zoom)}==='closer')study.p.graph.graph.zoomTo(Math.min(1.2,study.p.graph.graph.zoom()*1.6));study.p.interactions.set(study.p.graph.nodes[0].id,{contact:1,lift:.5});await study.wait(80)`);
    const beforeMetrics = await send('Performance.getMetrics', {}, sessionId);
    paintEvents.length = 0;
    await send('Tracing.start', { categories: 'devtools.timeline', transferMode: 'ReportEvents' });
    const result = await evaluate(`(async()=>{
      const timings=[],inputs=[],work=[],nodes=[...study.root.querySelectorAll('.flint-material-graph .x6-node')];let previous=performance.now();
      for(let i=0;i<45;i++){await new Promise(r=>requestAnimationFrame(now=>{timings.push(now-previous);previous=now;const started=performance.now();study.p.lighting.setLight({azimuth:(i*9)%360});study.p.interactions.set(study.p.graph.nodes[0].id,{contact:.7,position:{x:i%100,y:50}});inputs.push(performance.now()-started);work.push(study.p.lighting.metrics.lastWorkMs);r()}));}
      for(let i=0;i<100&&study.p.lighting.pending;i++)await study.wait(20);const sorted=a=>a.sort((x,y)=>x-y),stats=a=>{a=sorted(a.slice(3));return {medianMs:a[Math.floor(a.length/2)],p95Ms:a[Math.ceil(a.length*.95)-1],maxMs:a.at(-1)}};
      const box=study.root.querySelector('.flint-material-graph').getBoundingClientRect();const visible=nodes.filter(n=>{const r=n.getBoundingClientRect();return r.right>box.left&&r.left<box.right&&r.bottom>box.top&&r.top<box.bottom}).length;
      return {frame:stats(timings),inputDispatch:stats(inputs),controller:stats(work),zoom:study.p.graph.graph.zoom(),visibleNodes:visible,domNodes:study.root.querySelectorAll('*').length,stableMounts:nodes.every((n,i)=>n===study.root.querySelectorAll('.flint-material-graph .x6-node')[i]),idle:!study.p.lighting.pending};
    })()`);
    const complete = new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error('Paint trace timeout')), 20000); traceComplete = () => { clearTimeout(timer); resolve(); }; });
    await send('Tracing.end'); await complete; traceComplete = undefined;
    const afterMetrics = await send('Performance.getMetrics', {}, sessionId);
    const metric = (list, name) => list.metrics.find(m => m.name === name)?.value ?? 0;
    measurements.push({ count, detail, view: zoom, ...result, paintCpuMs: paintEvents.reduce((sum,e)=>sum+e.dur/1000,0), paintEvents: paintEvents.length, styleMs: (metric(afterMetrics, 'RecalcStyleDuration') - metric(beforeMetrics, 'RecalcStyleDuration')) * 1000, layoutMs: (metric(afterMetrics, 'LayoutDuration') - metric(beforeMetrics, 'LayoutDuration')) * 1000 });
    console.log(JSON.stringify(measurements.at(-1)));
    check(`${count}/${detail}/${zoom}: stable mounts and idle scheduler`, result.stableMounts && result.idle);
  }
  await evaluate(`study.input('Graph fixture size',13);study.input('Graph detail','full');study.click('Reset to Flint Default');await study.wait(150)`); await shot('reference-final');
  for (const finish of ['limestone', 'marble']) {
    await evaluate(`study.input('Stone finish',${JSON.stringify(finish)});study.p.graph.graph.zoomTo(2.5);await study.wait(150)`);
    const clip = await evaluate(`(()=>{const n=study.p.graph.graph.getCellById('waste-land'),p=n.position(),s=n.size(),c=study.p.graph.graph.localToClient(p),z=study.p.graph.graph.zoom();return {x:c.x-16,y:c.y-16,width:s.width*z+32,height:s.height*z+32,scale:1}})()`);
    const { data } = await send('Page.captureScreenshot', { format: 'png', clip }, sessionId);
    await writeFile(path.join(artifacts, `relief-${finish}-detail.png`), Buffer.from(data, 'base64'));
  }
  await evaluate(`study.input('Stone finish','limestone');study.p.graph.fit()`);
  check('isolated route never invokes canonical or persistence APIs', apiRequests.length, 0);
  check('no uncaught browser exceptions', errors.length, 0);
  const report = { browser: version.product, viewport: '1536×1024, device scale 1', textureDifference, baselineCadence, checks, errors, apiRequests, measurements, limits: ['Local headless Chromium measurements; Safari visual checks remain manual.', 'Development Vite build with timeline tracing, finite fixture and synthetic light/contact input; not a live corpus benchmark.', 'Paint event durations measure recorded CPU painting, not GPU or raster completion; input dispatch measures JS injection, not physical input-to-display latency.'] };
  await writeFile(path.join(artifacts, 'browser-results.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: checks.length, artifacts }, null, 2));
} finally {
  socket?.close(); chrome.kill('SIGKILL');
  // Terminating the browser can leave development HTTP connections alive;
  // close only this script's ephemeral server connections before disposal.
  vite.httpServer?.closeAllConnections();
  await vite.close(); await new Promise(r => setTimeout(r, 200)); await rm(profile, { recursive: true, force: true });
}
