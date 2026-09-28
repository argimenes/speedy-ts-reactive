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


 const artifacts = process.env.OBJECT_ARTIFACTS ?? 'artifacts/three-d-object';
 await mkdir(artifacts,{recursive:true});
 const checks=[];
 const check=(name,actual,expected=true)=>{assert.deepEqual(actual,expected,name);checks.push(name);};
 const wait=async(ms=150)=>evaluate(`new Promise(r=>setTimeout(r,${ms}))`);
 const poll=async(expression)=>{for(let i=0;i<60;i++){if(await evaluate(expression))return;await wait(100);}throw Error('Not ready: '+expression);};
 const shot=async(name)=>{const {data}=await send('Page.captureScreenshot',{format:'png'},sessionId);await writeFile(path.join(artifacts,name+'.png'),Buffer.from(data,'base64'));};
 const mouse=async(type,x,y,extra={})=>send('Input.dispatchMouseEvent',{type,x,y,button:'left',buttons:type==='mouseReleased'?0:1,clickCount:1,...extra},sessionId);
 await send('Emulation.setDeviceMetricsOverride',{width:1200,height:900,deviceScaleFactor:1,mobile:false},sessionId);
 await send('Page.navigate',{url:process.env.OBJECT_URL??'http://localhost:3000/'},sessionId);await wait(1200);
 await evaluate(`(async()=>{
   const {ReactiveEditor}=await import('/src/reactive-editor/editor.ts');
   const {registerApplicationViews}=await import('/src/application/features.ts');
   const {ReactiveTreeView}=await import('/src/rendering/reactive-tree-view.tsx');
   const source=await(await fetch('/src/rendering/reactive-tree-view.tsx')).text();
   const {render,createComponent}=await import(source.split('"').find(p=>p.includes('/solid-js_web.js')));
   window.makeObjectFixture=(scale=1,saved,enabled=true)=>{
     if(window.objectCheck){objectCheck.dispose();objectCheck.editor.dispose();objectCheck.host.remove();}
     const host=document.createElement('div');host.style.cssText='position:fixed;inset:0;z-index:9000;background:#faf8f3;color:#302c28;overflow:auto;padding:35px;font:17px/1.6 Georgia';document.body.append(host);
     const surface=document.createElement('div');surface.style.cssText='width:800px;transform-origin:top left;transform:scale('+scale+')';host.append(surface);
     const editor=new ReactiveEditor(saved??{id:'doc',type:'document-block',children:[{id:'before',type:'standoff-editor-block',text:'A quiet moment in the study.'},{id:'cup',type:'3d-object-block',object3D:{version:1,scene:'coffee-cup',view:{azimuth:45,elevation:25},autoRotate:false,lighting:'neutral',settings:{steam:true,coffeeStain:false},future:{keep:true}}},{id:'after',type:'standoff-editor-block',text:'Coffee, notes, and a little time to think.'}]},{features:{threeDObjects:enabled}});
     registerApplicationViews(editor);const projection=editor.createView('object-browser');
     const dispose=render(()=>createComponent(ReactiveTreeView,{editor,projection,coordinates:{scale:()=>scale}}),surface);editor.installGateway(document);
     const node=id=>Object.values(projection.state.nodes).find(n=>n.payload.id===id);
     const root=id=>editor.mounts.get(node(id).key)?.root;
     const patch=patch=>{const n=node('cup'),old=JSON.parse(JSON.stringify(n.payload.object3D));editor.commands.setPayloadField(n.key,'object3D',{...old,...patch,settings:{...old.settings,...patch.settings}},'Browser setting');};
     window.objectCheck={host,surface,editor,projection,dispose,node,root,patch};
   };
   window.menuClick=label=>{const button=[...document.querySelectorAll('.reactive-block-menu [role=menuitem]')].find(b=>b.textContent.replace(/[›‹]/g,'').trim()===label);if(!button)throw Error('Menu item not found: '+label);button.click();};
 })()`);
 await evaluate('makeObjectFixture()');
 if(process.env.OBJECT_REMOVED==='1'){
   check('unknown block fallback',await evaluate(`objectCheck.root('cup').classList.contains('reactive-unknown-block')`));
   const old=await evaluate('JSON.parse(JSON.stringify(objectCheck.node("cup").payload.object3D))');
   await evaluate(`(()=>{const p=objectCheck,m=p.editor.mounts.get(p.node('before').key);m.focus();m.restoreInlineSelection({anchor:0,head:0});})()`);
   await send('Input.insertText',{text:'Still editable. '},sessionId);
   await evaluate('window.saved=objectCheck.editor.encodeDocument();makeObjectFixture(1,saved)');
   check('unknown authored payload round-trips',await evaluate('JSON.parse(JSON.stringify(objectCheck.node("cup").payload.object3D))'),old);
   check('adjacent editing with physical feature removal',await evaluate(`objectCheck.editor.encodeDocument().children[0].text.startsWith('Still editable. ')`));
 } else {
 await poll(`objectCheck.root('cup')?.dataset.ready==='true'`);await wait(400);await shot('desktop-default');
 check('renders real geometry',await evaluate(`+objectCheck.root('cup').dataset.geometries>3`));
 const revision=await evaluate('objectCheck.editor.repository.state.revision');await wait(300);
 check('animation never authors changes',await evaluate('objectCheck.editor.repository.state.revision'),revision);
 await evaluate(`objectCheck.patch({settings:{steam:false},autoRotate:false})`);await wait();
 const frames=await evaluate(`objectCheck.root('cup').dataset.frames`);await wait(250);
 check('idle frame count stops',await evaluate(`objectCheck.root('cup').dataset.frames`),frames);
 await evaluate(`objectCheck.patch({settings:{steam:true}});objectCheck.root('cup').hidden=true`);await wait();
 const hidden=await evaluate(`objectCheck.root('cup').dataset.frames`);await wait(250);
 check('hidden mounted occurrence stops animation',await evaluate(`objectCheck.root('cup').dataset.frames`),hidden);
 await evaluate(`objectCheck.root('cup').hidden=false`);await wait(250);
 check('show resumes animation',await evaluate(`+objectCheck.root('cup').dataset.frames>+${hidden}`));
 const point=await evaluate(`(()=>{const r=objectCheck.root('cup').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
 await mouse('mousePressed',point.x,point.y,{modifiers:2});await mouse('mouseReleased',point.x,point.y,{modifiers:2});await wait();
 check('Control-click opens exactly one menu',await evaluate(`document.querySelectorAll('.reactive-block-menu').length`),1);
 await evaluate(`menuClick('3D Object');menuClick('Coffee Stain: Off')`);await wait();await shot('desktop-stain');
 check('stain action authors setting',await evaluate(`objectCheck.node('cup').payload.object3D.settings.coffeeStain`));
 await evaluate(`objectCheck.editor.repository.undo()`);check('stain undo',await evaluate(`objectCheck.node('cup').payload.object3D.settings.coffeeStain`),false);
 await evaluate(`objectCheck.editor.repository.redo()`);
 const openMenu=async()=>{await evaluate(`objectCheck.root('cup').querySelector('[aria-label="3D Object menu"]').click()`);await wait(30);await evaluate(`menuClick('3D Object')`);};
 for(const preset of ['Front','Side','Three-quarter','Isometric','Top-ish']){await openMenu();await evaluate(`menuClick('View');menuClick(${JSON.stringify(preset)})`);await wait(100);await shot('view-'+preset.toLowerCase());}
 await openMenu();await shot('semantic-menu');await evaluate(`menuClick('Lighting');menuClick('Warm')`);await wait();await shot('lighting-warm');
 await evaluate(`objectCheck.patch({lighting:'dramatic'});objectCheck.host.style.background='#252a30';objectCheck.host.style.color='#eee'`);await wait();await shot('dark-dramatic');
 await evaluate(`objectCheck.host.style.background='#faf8f3';objectCheck.host.style.color='#302c28';objectCheck.patch({view:{azimuth:45,elevation:25},lighting:'neutral',autoRotate:false})`);
 const beforeOrbit=await evaluate('JSON.parse(JSON.stringify(objectCheck.node("cup").payload.object3D))');
 const beforeRevision=await evaluate('objectCheck.editor.repository.state.revision');
 await mouse('mousePressed',point.x,point.y);await mouse('mouseMoved',point.x+80,point.y+25);await mouse('mouseReleased',point.x+80,point.y+25);await wait();
 check('orbit commits once',await evaluate('objectCheck.editor.repository.state.revision'),beforeRevision+1);
 check('orbit changes view',await evaluate('objectCheck.node("cup").payload.object3D.view.azimuth!==45'));
 await evaluate('objectCheck.editor.repository.undo()');check('orbit undo restores full state',await evaluate('JSON.parse(JSON.stringify(objectCheck.node("cup").payload.object3D))'),beforeOrbit);
 const cancelRevision=await evaluate('objectCheck.editor.repository.state.revision');
 await mouse('mousePressed',point.x,point.y);await mouse('mouseMoved',point.x+40,point.y+20);await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'},sessionId);await mouse('mouseReleased',point.x+40,point.y+20);
 check('Escape cancels orbit',await evaluate('objectCheck.editor.repository.state.revision'),cancelRevision);
 for(const scale of [.5,1,2]){
   await evaluate(`makeObjectFixture(${scale})`);await poll(`objectCheck.root('cup')?.dataset.ready==='true'`);
   const r=await evaluate(`(()=>{const h=objectCheck.root('cup').querySelector('[aria-label="Resize 3D Object"]').getBoundingClientRect();return{x:h.x+h.width/2,y:h.y+h.height/2}})()`);
   await mouse('mousePressed',r.x,r.y);await mouse('mouseMoved',r.x+40*scale,r.y+10*scale);await mouse('mouseReleased',r.x+40*scale,r.y+10*scale);await wait();
   check('ratio and local resize at scale '+scale,await evaluate(`(()=>{const p=objectCheck.node('cup').payload.blockProperties.find(p=>p.type==='block/size');return [p.metadata.width,p.metadata.height]})()`),[320,320]);
 }
 await evaluate('makeObjectFixture()');await poll(`objectCheck.root('cup')?.dataset.ready==='true'`);
 // Real insertion entry and ordinary adjacent editing.
 const textPoint=await evaluate(`(()=>{const r=objectCheck.root('before').getBoundingClientRect();return{x:r.x+30,y:r.y+20}})()`);
 await mouse('mousePressed',textPoint.x,textPoint.y,{button:'right',buttons:2});await mouse('mouseReleased',textPoint.x,textPoint.y,{button:'right',buttons:0});await wait(50);
 await evaluate(`menuClick('Add Block');menuClick('3D Object — Coffee Cup')`);
 await poll(`document.querySelectorAll('.three-d-object[data-ready=true]').length===2`);
 check('Add Block menu inserts a second independent object',await evaluate(`document.querySelectorAll('.three-d-object').length`),2);
 await evaluate(`objectCheck.patch({settings:{steam:false}})`);await wait(600);
 const firstFrames=await evaluate(`objectCheck.root('cup').dataset.frames`);
 const secondFrames=await evaluate(`[...document.querySelectorAll('.three-d-object')].find(e=>e!==objectCheck.root('cup')).dataset.frames`);await wait(400);
 check('one idle object does not pause its sibling',await evaluate(`objectCheck.root('cup').dataset.frames===${JSON.stringify(firstFrames)} && +[...document.querySelectorAll('.three-d-object')].find(e=>e!==objectCheck.root('cup')).dataset.frames>+${JSON.stringify(secondFrames)}`));
 await evaluate(`(()=>{const p=objectCheck,m=p.editor.mounts.get(p.node('after').key);m.focus();m.restoreInlineSelection({anchor:0,head:0})})()`);
 await send('Input.insertText',{text:'Written beside coffee. '},sessionId);
 check('ordinary adjacent native typing',await evaluate(`objectCheck.editor.encodeDocument().children.find(n=>n.id==='after').text.startsWith('Written beside coffee. ')`));
 await evaluate('makeObjectFixture()');await poll(`objectCheck.root('cup')?.dataset.ready==='true'`);
 for(const width of [160,640]){
   await evaluate(`objectCheck.editor.commands.setPayloadField(objectCheck.node('cup').key,'blockProperties',[{type:'block/size',metadata:{width:${width},height:${width}}}],'Resize fixture')`);await wait(120);await shot('size-'+width);
   check('square effective size '+width,await evaluate(`(()=>{const r=objectCheck.root('cup').getBoundingClientRect();return[r.width,r.height]})()`),[width,width]);
 }
 await evaluate(`objectCheck.surface.style.width='120px'`);await wait();
 check('narrow layout fits without persisting collapse',await evaluate(`objectCheck.root('cup').clientWidth<=120 && objectCheck.root('cup').clientHeight===objectCheck.root('cup').clientWidth && objectCheck.node('cup').payload.blockProperties[0].metadata.width===640`));
 await evaluate(`objectCheck.surface.style.width='800px'`);await wait();check('expanded width restores',await evaluate(`objectCheck.root('cup').clientWidth`),640);
 await evaluate('makeObjectFixture()');await poll(`objectCheck.root('cup')?.dataset.ready==='true'`);
 await evaluate(`objectCheck.root('cup').querySelector('canvas').focus()`);
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'F10',code:'F10',modifiers:8},sessionId);await wait(50);
 check('keyboard context menu',await evaluate(`document.querySelectorAll('.reactive-block-menu').length`),1);
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'},sessionId);await wait(50);
 check('menu Escape restores widget focus',await evaluate(`objectCheck.root('cup').contains(document.activeElement)`));
 await evaluate(`objectCheck.patch({settings:{steam:true},autoRotate:true})`);await wait(150);
 await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]},sessionId);await wait(600);
 const reducedFrames=await evaluate(`objectCheck.root('cup').dataset.frames`);await wait(200);
 check('reduced motion stops automatic animation',await evaluate(`objectCheck.root('cup').dataset.frames`),reducedFrames);
 check('reduced motion preserves authored preference',await evaluate(`objectCheck.node('cup').payload.object3D.autoRotate`));
 await send('Emulation.setEmulatedMedia',{features:[]},sessionId);
 await evaluate(`objectCheck.patch({settings:{steam:false,coffeeStain:true},lighting:'warm',view:{azimuth:120,elevation:60},autoRotate:true});window.saved=objectCheck.editor.encodeDocument();makeObjectFixture(1,saved)`);await poll(`objectCheck.root('cup')?.dataset.ready==='true'`);
 check('authored settings and unknown fields persist',await evaluate('JSON.parse(JSON.stringify(objectCheck.node("cup").payload.object3D))'),await evaluate('saved.children.find(n=>n.id==="cup").object3D'));
 await evaluate(`window.saved=objectCheck.editor.encodeDocument();makeObjectFixture(1,saved,false)`);
 check('disabled feature fallback',await evaluate(`objectCheck.root('cup').classList.contains('reactive-unknown-block')`));
 check('disabled payload preserved',await evaluate(`JSON.stringify(objectCheck.editor.encodeDocument().children.find(n=>n.id==='cup').object3D)===JSON.stringify(saved.children.find(n=>n.id==='cup').object3D)`));
 await evaluate('makeObjectFixture()');await poll(`objectCheck.root('cup')?.dataset.ready==='true'`);
 await openMenu();await evaluate(`menuClick('Auto Rotate: Off')`);await wait(400);
 const autoRevision=await evaluate('objectCheck.editor.repository.state.revision');
 await openMenu();await evaluate(`menuClick('Auto Rotate: On')`);await wait(100);
 check('stopping Auto Rotate saves its current angle once',await evaluate(`objectCheck.node('cup').payload.object3D.autoRotate===false && objectCheck.node('cup').payload.object3D.view.azimuth!==45 && objectCheck.editor.repository.state.revision===${autoRevision}+1`));
 await evaluate(`objectCheck.root('cup').style.marginTop='1300px'`);await wait(500);
 const offscreenFrames=await evaluate(`objectCheck.root('cup').dataset.frames`);await wait(250);
 check('offscreen viewport stops animation',await evaluate(`objectCheck.root('cup').dataset.frames`),offscreenFrames);
 await evaluate(`objectCheck.root('cup').style.marginTop='8px'`);await wait(400);
 check('viewport reentry resumes',await evaluate(`+objectCheck.root('cup').dataset.frames>+${offscreenFrames}`));
 await evaluate(`objectCheck.patch({version:99})`);await wait(100);
 check('unsupported version keeps authored state and uses fallback',await evaluate(`objectCheck.node('cup').payload.object3D.version===99 && objectCheck.root('cup').textContent.includes('version is unavailable') && objectCheck.root('cup').dataset.ready==='false'`));
 await evaluate(`objectCheck.editor.repository.undo()`);await poll(`objectCheck.root('cup').dataset.ready==='true'`);
 check('undo unsupported version remounts graphics',true);
 await evaluate(`window.originalContext=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(...args){return this.classList.contains('three-d-object__canvas')?null:originalContext.apply(this,args)};makeObjectFixture()`);
 await poll(`objectCheck.root('cup')?.textContent.includes('Graphics could not start')`);
 check('WebGL initialization failure preserves authored payload',await evaluate(`objectCheck.node('cup').payload.object3D.future.keep`));
 await evaluate(`HTMLCanvasElement.prototype.getContext=originalContext;objectCheck.root('cup').querySelector('.three-d-object__fallback button').click()`);await poll(`objectCheck.root('cup').dataset.ready==='true'`);
 check('initialization retry recovers',true);

 }
 await writeFile(path.join(artifacts,process.env.OBJECT_REMOVED==='1'?'removal-results.json':'browser-results.json'),JSON.stringify({checks},null,2));console.log(JSON.stringify({checks},null,2));
 await evaluate('objectCheck.dispose();objectCheck.editor.dispose();objectCheck.host.remove()');
} finally {
 socket?.close();if(chrome.pid&&chrome.exitCode===null&&chrome.signalCode===null){const exited=new Promise(r=>chrome.once('exit',r));chrome.kill('SIGKILL');await exited;}
 chrome.stdin?.destroy();chrome.stdout?.destroy();chrome.stderr?.destroy();await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
