// Spatial C: constrained arrangement and unchanged live-editor handoff.
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
 const check = (name, actual, expected) => { assert.deepEqual(actual, expected, name); checks.push(name); console.log("PASS", name); };
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false},sessionId);
 await send('Page.navigate',{url:process.env.BENCHMARK_URL ?? 'http://localhost:3000/'},sessionId);
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


 const shot=async name=>{const r=await send('Page.captureScreenshot',{format:'png'},sessionId);await writeFile('artifacts/spatial-c/'+name+'.png',Buffer.from(r.data,'base64'));};
 await evaluate(`(async()=>{
  const {Vector3}=await import('/node_modules/.vite/deps/three.js');
  const {studyCamera,projectCss}=await import('/src/features/spatial/camera.ts');
  const {PAGE_TILT,surfaceHeight}=await import('/src/features/spatial/arrangement.ts');
  q.session.selectPresentation('canvas');q.canvas=JSON.stringify(q.session.presentation.read().presentations.canvas);q.session.selectPresentation('spatial');
  q.place=(id='block:one')=>q.session.spatial.layout().placements.find(p=>p.objectId===id);
  q.point=(id='block:one')=>{const layout=q.session.spatial.layout(),p=q.place(id),index=layout.placements.indexOf(layout.placements.find(p=>p.objectId===id));const e=document.querySelector('.workspace-spatial__scene'),r=e.getBoundingClientRect();const camera=studyCamera(layout.camera,r.width,r.height);const point=new Vector3(0,p.size.height*.65,.001).applyAxisAngle(new Vector3(1,0,0),p.posture==='lying'?-Math.PI/2:PAGE_TILT).applyAxisAngle(new Vector3(0,1,0),p.heading).add(new Vector3(p.position.x,surfaceHeight(index),p.position.z));const css=projectCss(point,camera,r.width,r.height);return{x:css.x+r.left,y:css.y+r.top};};
  q.repository=JSON.stringify(q.editor.repository.snapshot());q.layoutBefore=q.session.spatial.layout();
  await q.frame();
 })()`);
 for(let i=0;i<100;i++){if(await evaluate('Number(document.querySelector(".workspace-spatial")?.dataset.frames)>0'))break;await evaluate('new Promise(r=>setTimeout(r,100))');}
 const settle=()=>evaluate('new Promise(r=>setTimeout(r,600))');
 const choose=async label=>{const selector=await evaluate(`(()=>{document.querySelector('[data-c-action]')?.removeAttribute('data-c-action');const e=[...document.querySelectorAll('.workspace-spatial button')].find(e=>e.textContent.trim()===${JSON.stringify(label)});if(!e)throw new Error('Missing '+${JSON.stringify(label)});e.setAttribute('data-c-action','');return '[data-c-action]'})()`);await click(selector);};
 const begin=async(dx=65,dy=-20)=>{await evaluate('q.before=q.place();q.revision=q.session.presentation.revision()');const initial=await evaluate('({...document.querySelector(".workspace-spatial").dataset})');
 const states=[];const p=await evaluate('q.point()');await mouse('mousePressed',p);await mouse('mouseMoved',{x:p.x+dx,y:p.y+dy});await evaluate('q.frame()');return{x:p.x+dx,y:p.y+dy};};

 await settle();
 await evaluate("(async()=>{q.probe=await import('/src/features/spatial/drag-profile.ts');q.probe.startDragProfile()})()");
 const initial=await evaluate('({...document.querySelector(".workspace-spatial").dataset})');
 const states=[];const p=await evaluate('q.point()');await mouse('mousePressed',p);
 for(let i=0;i<100;i++) { await mouse('mouseMoved',{x:p.x+40+Math.sin(i/9)*35,y:p.y+Math.cos(i/13)*12});states.push(await evaluate('({...document.querySelector(".workspace-spatial").dataset,capture:document.querySelector(".workspace-spatial__scene").hasPointerCapture(1)})'));await new Promise(r=>setTimeout(r,8)); }
 await settle();await mouse('mouseReleased',p);await evaluate('q.frame()');
 const samples=await evaluate('q.probe.stopDragProfile()');
 const pointerGeometry=await evaluate(`(async()=>{const {Vector3}=await import('/node_modules/.vite/deps/three.js'),{deskPoint,projectCss,studyCamera}=await import('/src/features/spatial/camera.ts');const camera=studyCamera({kind:'perspective',yaw:0,approach:0},1440,1000),point=new Vector3(0,.2,-.98),start=projectCss(point,camera,1440,1000),end={x:start.x+80,y:start.y-12};const slip=height=>{const a=deskPoint(camera,{width:1440,height:1000},start.x,start.y,height),b=deskPoint(camera,{width:1440,height:1000},end.x,end.y,height);const p=projectCss(point.clone().add(new Vector3(b.x-a.x,0,b.z-a.z)),camera,1440,1000);return Math.hypot(p.x-end.x,p.y-end.y)};return{floorPlaneSlipPx:slip(0),grabPlaneSlipPx:slip(.2)}})()`);
 const summary={};for(const [label,a,b] of [['intersection','input','intersection'],['constraint','intersection','constrained'],['publishDelay','constrained','published'],['sceneWait','queued','transformed'],['renderCPU','transformed','rendered'],['inputToRender','input','rendered']]) { const values=samples.filter(s=>s[a]!==undefined&&s[b]!==undefined).map(s=>s[b]-s[a]).sort((a,b)=>a-b);summary[label]={count:values.length,median:values[Math.floor(values.length/2)],p95:values[Math.floor(values.length*.95)]}; }
 await mkdir('artifacts/spatial-d',{recursive:true});await writeFile('artifacts/spatial-d/drag-'+(process.env.DRAG_RUN??'current')+'.json',JSON.stringify({initial,states,pointerGeometry,summary,samples},null,2));console.log(JSON.stringify(summary,null,2));await evaluate('q.dispose()');
} finally {
 if(socket&&socket.readyState!==WebSocket.CLOSED){const closed=new Promise(r=>socket.addEventListener('close',r,{once:true}));socket.close();await Promise.race([closed,new Promise(r=>setTimeout(r,1000))]);}
 if(chrome.exitCode===null&&chrome.signalCode===null){const closed=new Promise(r=>chrome.once('exit',r));chrome.kill('SIGKILL');await closed;}
 await rm(profile,{recursive:true,force:true,maxRetries:8,retryDelay:200});
}
