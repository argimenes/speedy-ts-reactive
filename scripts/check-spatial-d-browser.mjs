// Spatial D: constrained arrangement and unchanged live-editor handoff.
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
   const doc=structuredClone(scaledWindowDocument); Object.assign(doc.metadata,{folder:'notes',filename:'Scale.json',title:'A visit to the Alps'});
   const photo='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="260"><rect width="600" height="260" fill="#284d6c"/><path d="M0 210L150 35 250 165 380 15 600 230" fill="#8196a5"/><path d="M105 90L150 35 200 100 155 80Z M330 70L380 15 425 70 380 48Z" fill="#e5e8e5"/><path d="M0 214Q300 170 600 230V260H0Z" fill="#315c74"/></svg>');
   doc.children[0].children.unshift({id:'preview-heading',type:'standoff-editor-block',text:'A quiet evening by the lake',blockProperties:[{type:'block/font/size/h2'}]}, {id:'preview-image',type:'image-block',metadata:{url:photo,alt:'Alpine lake'}});
   const dto={id:'workspace',type:'workspace-block',children:[
     {id:'one',type:'document-window-block',metadata:{title:'First',position:{x:20,y:40},size:{w:1000,h:640}},children:[doc]},
     {id:'two',type:'document-window-block',metadata:{title:'Second',state:'minimized',position:{x:1100,y:40},size:{w:900,h:600}},children:[structuredClone(doc)]},
     {id:'image',type:'image-block',metadata:{url:'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='}}
   ]};
   dto.children.push({id:'botanical',type:'document-window-block',metadata:{title:'Botanical notebook'},children:[{id:'botanical-doc',type:'document-block',metadata:{documentId:'botanical-doc',title:'Botanical notebook',folder:'notes',filename:'Botanical.json'},children:[{type:'standoff-editor-block',text:'Flowers above the tree line',blockProperties:[{type:'block/font/size/h1'}]},{type:'plain-text-block',text:'Field observations\\n\\nEdelweiss · silvery leaves and star-shaped flowers.\\nGentian · intense blue petals against limestone.\\nAlpine rose · low shrubs beside the path.'},{type:'standoff-editor-block',text:'Next visit',blockProperties:[{type:'block/font/size/h2'}]},{type:'plain-text-block',text:'Return in June. Sketch the leaves, record the altitude and compare north-facing slopes.'}]}]});
   for(let i=0;i<5;i++)dto.children.push({id:'print-'+i,type:'image-block',metadata:{url:'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='}});
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

 await mkdir('artifacts/spatial-d',{recursive:true});
 const shot=async name=>{const r=await send('Page.captureScreenshot',{format:'png'},sessionId);await writeFile('artifacts/spatial-d/'+name+'.png',Buffer.from(r.data,'base64'));};
 await evaluate(`(async()=>{
  const {Vector3}=await import('/node_modules/.vite/deps/three.js');
  const {studyCamera,projectCss}=await import('/src/features/spatial/camera.ts');
  const {PAGE_TILT,surfaceHeight}=await import('/src/features/spatial/arrangement.ts');
  q.session.selectPresentation('canvas');q.canvas=JSON.stringify(q.session.presentation.read().presentations.canvas);q.session.selectPresentation('spatial');
  q.paperSize=(await import('/src/features/spatial/model.ts')).paperSize;
  q.place=(id='block:one')=>q.session.spatial.layout().placements.find(p=>p.objectId===id);
  q.point=(id='block:one')=>{const layout=q.session.spatial.layout(),p=q.place(id),index=layout.placements.indexOf(layout.placements.find(p=>p.objectId===id));const e=document.querySelector('.workspace-spatial__scene'),r=e.getBoundingClientRect();const camera=studyCamera(layout.camera,r.width,r.height);const point=new Vector3(0,q.paperSize(p).height*.65,.001).applyAxisAngle(new Vector3(1,0,0),p.posture==='lying'?-Math.PI/2:PAGE_TILT).applyAxisAngle(new Vector3(0,1,0),p.heading).add(new Vector3(p.position.x,surfaceHeight(index),p.position.z));const css=projectCss(point,camera,r.width,r.height);return{x:css.x+r.left,y:css.y+r.top};};
  q.repository=JSON.stringify(q.editor.repository.snapshot());q.layoutBefore=q.session.spatial.layout();
  await q.frame();
 })()`);
 for(let i=0;i<100;i++){if(await evaluate('Number(document.querySelector(".workspace-spatial")?.dataset.frames)>0'))break;await evaluate('new Promise(r=>setTimeout(r,100))');}
 const settle=()=>evaluate('new Promise(r=>setTimeout(r,600))');
 const choose=async label=>{const selector=await evaluate(`(()=>{document.querySelector('[data-c-action]')?.removeAttribute('data-c-action');const e=[...document.querySelectorAll('.workspace-spatial button')].find(e=>e.textContent.trim()===${JSON.stringify(label)});if(!e)throw new Error('Missing '+${JSON.stringify(label)});e.setAttribute('data-c-action','');return '[data-c-action]'})()`);await click(selector);};
 const begin=async(dx=65,dy=-20)=>{await evaluate('q.before=q.place();q.revision=q.session.presentation.revision()');const p=await evaluate('q.point()');await mouse('mousePressed',p);await mouse('mouseMoved',{x:p.x+dx,y:p.y+dy});await evaluate('q.frame()');return{x:p.x+dx,y:p.y+dy};};
 await evaluate('q.startFrames=Number(document.querySelector(".workspace-spatial").dataset.frames)');await shot('01-original');check('distinct Documents have recognisable actual content',await evaluate("q.session.spatial.objects().find(o=>o.id==='block:one').preview.title==='A visit to the Alps'&&q.session.spatial.objects().find(o=>o.id==='block:botanical').preview.title==='Botanical notebook'&&q.session.spatial.objects().find(o=>o.id==='block:one').preview.blocks.some(b=>b.kind==='image')"),true);
 let end=await begin();
 check('paper drag owns pointer capture',await evaluate("document.querySelector('.workspace-spatial').dataset.moving==='true'&&document.querySelector('.workspace-spatial__scene').hasPointerCapture(1)"),true);
 check('drag preview does not persist',await evaluate('JSON.stringify(q.place())===JSON.stringify(q.before)&&q.session.presentation.revision()===q.revision'),true);
 await evaluate('q.startFrames=Number(document.querySelector(".workspace-spatial").dataset.frames)');end.x+=5;await mouse('mouseMoved',end);await evaluate('q.frame()');
 check('preview actually reaches a scene frame before commit',await evaluate('Number(document.querySelector(".workspace-spatial").dataset.frames)>q.startFrames'),true);await shot('02-preview');
 await evaluate('q.resources={...document.querySelector(".workspace-spatial").dataset}');
 for(let i=1;i<=8;i++){await mouse('mouseMoved',{x:end.x+i,y:end.y});await evaluate('q.frame()');}
 check('drag preview reuses scene geometries and textures',await evaluate('document.querySelector(".workspace-spatial").dataset.geometries===q.resources.geometries&&document.querySelector(".workspace-spatial").dataset.textures===q.resources.textures'),true);
 await mouse('mouseReleased',end);await evaluate('q.frame()');
 check('completion commits one settled placement',await evaluate('q.session.presentation.revision()===q.revision+1&&q.place().position.x>q.before.position.x&&!document.querySelector(".workspace-spatial__scene").hasPointerCapture(1)'),true);
 for(const cause of ['Escape','pointercancel','lostpointercapture','blur','resize','switch','stale']) {
  end=await begin(40,10);
  if(cause==='Escape')await key('Escape');
  else if(cause==='blur')await evaluate("window.dispatchEvent(new Event('blur'))");
  else if(cause==='resize'){await send('Emulation.setDeviceMetricsOverride',{width:1300,height:1000,deviceScaleFactor:1,mobile:false},sessionId);await evaluate('q.frame()');}
  else if(cause==='switch'){await evaluate("q.session.selectPresentation('desktop');q.session.selectPresentation('spatial');q.frame()");await settle();}
  else if(cause==='stale')await evaluate('q.session.spatial.arrange(q.before.objectId,{heading:q.before.heading+.1},q.before);q.before=q.place();q.frame()');
  else await evaluate(`document.querySelector('.workspace-spatial__scene').dispatchEvent(new PointerEvent('${cause}',{pointerId:1,bubbles:true}))`);
  await mouse('mouseReleased',end);await evaluate('q.frame()');
  check(cause+' discards unfinished movement',await evaluate('JSON.stringify(q.place())===JSON.stringify(q.before)&&document.querySelector(".workspace-spatial").dataset.moving==="false"'),true);
  if(cause==='resize'){await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false},sessionId);await evaluate('q.frame()');}
 }
 // The presentation owner settles the latest delta during capture.
 end=await begin(90,-10);
 const saved=await evaluate(`(()=>{const snapshot=q.editor.persistence.captureWorkspace();const placement=snapshot.presentation.value.presentations.spatial.placements.find(p=>p.objectId==='block:one');return{position:placement.position,revisions:q.session.presentation.revision()-q.revision,moving:document.querySelector('.workspace-spatial').dataset.moving}})()`);
 check('save settles the current move once',saved.revisions,1);check('save releases movement',saved.moving,'false');assert.ok(saved.position.x>await evaluate('q.before.position.x'));
 await mouse('mouseReleased',end);await evaluate('q.frame()');
 // Preserve future fields through every operation; no new sidecar format.
 await evaluate("const layout=q.session.spatial.layout();layout.future={keep:true};layout.placements[0].future='placement';layout.placements[0].position.future='position';q.session.presentation.updateSpatial(layout);q.frame()");
 if(await evaluate('document.querySelector(".workspace-spatial").dataset.arranging!=="true"'))await choose('Arrange with keyboard');await evaluate('document.querySelector(".workspace-spatial__scene").focus();q.before=q.place()');await key('ArrowLeft');
 check('focused keyboard arrows move by one centimetre',await evaluate('Math.abs(q.place().position.x-q.before.position.x+.01)<1e-8'),true);
 await key('ArrowRight','ArrowRight',8);
 check('Shift provides millimetre adjustment',await evaluate('Math.abs(q.place().position.x-q.before.position.x+.009)<1e-8'),true);
 await key(']','BracketRight');
 check('keyboard rotates heading',await evaluate('Math.abs(q.place().heading-q.before.heading-Math.PI/36)<1e-8'),true);
 await key('}','BracketRight',8);check('Shift-bracket rotates by one degree',await evaluate('Math.abs(q.place().heading-q.before.heading-Math.PI/30)<1e-8'),true);
 await key('l','KeyL');check('L lays the page flat',await evaluate('q.place().posture'),'lying');
 await shot('03-arranged-flat');
 await choose('Prop up');check('button props the page up',await evaluate('q.place().posture'),'propped');
 await choose('Bring to top');check('overlap order is the persisted placement order',await evaluate("q.session.spatial.layout().placements.at(-1).objectId"),'block:one');
 check('unknown placement data survives',await evaluate("q.place().future==='placement'&&q.place().position.future==='position'&&q.session.spatial.layout().future.keep"),true);
 check('physical size remains A4',await evaluate('q.place().size'),{width:.21,height:.297});
 check('arrangement leaves repository and Canvas geometry untouched',await evaluate('JSON.stringify(q.editor.repository.snapshot())===q.repository&&JSON.stringify(q.session.presentation.read().presentations.canvas)===q.canvas'),true);
 await shot('04-arranged-propped');
 check('all-layout/shared-document round-trip',await evaluate('q.roundtrip()'),{local:'spatial',server:'spatial',same:true,documents:2});
 await evaluate('q.settled=JSON.stringify(q.session.spatial.layout());q.session.selectPresentation("canvas");q.session.selectPresentation("desktop");q.session.selectPresentation("spatial");q.frame()');await settle();
 check('settled arrangement survives switches',await evaluate('JSON.stringify(q.session.spatial.layout())===q.settled'),true);
 await evaluate("q.session.spatial.select('block:one');q.frame()");await choose('Read Document');await settle();
 check('moved and rotated Document activates through B',await evaluate('document.querySelectorAll(".workspace-spatial__document .reactive-window").length'),1);
 check('arrangement controls are absent while editing',await evaluate('!!document.querySelector(".workspace-spatial__arrangement")'),false);
 await evaluate('q.digestBefore=q.session.spatial.objects().find(o=>o.id==="block:one").preview;q.editFrames=Number(document.querySelector(".workspace-spatial").dataset.frames)');
 await evaluate("q.flow('native').focus();q.flow('native').setSelectionRange(0,0)");await send('Input.insertText',{text:'After arranging '},sessionId);await evaluate('q.frame()');
 check('native editing remains ordinary Codex',await evaluate("q.flow('native').value.startsWith('After arranging Native')"),true);
 check('typing neither refreshes preview nor renders the scene',await evaluate('q.session.spatial.objects().find(o=>o.id==="block:one").preview===q.digestBefore&&Number(document.querySelector(".workspace-spatial").dataset.frames)===q.editFrames'),true);await shot('05-live-editor');await choose('Return to desk');await settle();
 check('return refreshes the shared non-live digest',await evaluate('q.session.spatial.objects().find(o=>o.id==="block:one").preview.blocks.some(b=>b.kind==="text"&&b.text.startsWith("After arranging Native"))&&q.session.spatial.objects().find(o=>o.id==="block:one").preview===q.session.spatial.objects().find(o=>o.id==="block:two").preview'),true);
 check('return restores the exact arranged placement',await evaluate('JSON.stringify(q.session.spatial.layout())===q.settled'),true);
 await choose('Lay flat');await evaluate('q.settled=JSON.stringify(q.session.spatial.layout())');await choose('Read Document');await settle();await choose('Return to desk');await settle();
 check('lying arrangement survives activation and reverse',await evaluate('JSON.stringify(q.session.spatial.layout())===q.settled'),true);
 // Both orientations and postures use the same B handoff and exact saved home.
 for(const orientation of ['Landscape','Portrait'])for(const posture of ['Prop up','Lay flat']){
  await choose(orientation);await choose(posture);await evaluate('q.oriented=JSON.stringify(q.session.spatial.layout())');
  check(orientation+' swaps only physical edge roles',await evaluate('q.place().size'),{width:.21,height:.297});
  await shot('orientation-'+orientation+'-'+posture.replaceAll(' ','-'));
  await choose('Read Document');await settle();check(orientation+' '+posture+' aligns ordinary editor',await evaluate('document.querySelectorAll(".workspace-spatial__document .reactive-window").length===1&&Number(document.querySelector(".workspace-spatial").dataset.alignmentError)<.01'),true);
  await choose('Return to desk');await settle();check(orientation+' '+posture+' restores exact physical arrangement',await evaluate('JSON.stringify(q.session.spatial.layout())===q.oriented'),true);
 }
 check('orientation survives local/server roundtrip',await evaluate('q.roundtrip()'),{local:'spatial',server:'spatial',same:true,documents:2});
 // A covered image is recoverable by the native object list and arrangement controls.
 await evaluate("q.savedImage=q.place('block:image');const p=q.place();q.session.spatial.arrange('block:image',{position:p.position,heading:p.heading,posture:p.posture},q.savedImage);q.frame()");
 await click('.workspace-spatial__footer summary');await choose(await evaluate("(()=>{const o=q.session.spatial.objects().find(o=>o.id==='block:image');return o.label+o.kind})()"));
 check('object list selects a covered image',await evaluate('q.session.spatial.selected()'),'block:image');
 await click('.workspace-spatial__footer summary');
 await choose('Bring to top');await click('[aria-label="Move right"]');await click('[aria-label="Rotate right"]');
 check('image arrangement uses the same restrained controls',await evaluate("q.session.spatial.layout().placements.at(-1).objectId==='block:image'&&q.place('block:image').heading!==q.place().heading"),true);
 await shot('06-overlap-recovery');
 await evaluate("q.session.spatial.select('block:one');q.settled=JSON.stringify(q.session.spatial.layout());q.frame()");
 // Completion outside the viewport is captured and clamped to the desk.
 const outsideStart=await evaluate('q.point()');await mouse('mousePressed',outsideStart);await mouse('mouseMoved',{x:-100,y:1100});await mouse('mouseReleased',{x:-100,y:1100});await evaluate('q.frame()');
 check('outside completion releases capture and remains a valid placement',await evaluate("!document.querySelector('.workspace-spatial__scene').hasPointerCapture(1)&&q.place().position.x>=-1.5&&q.place().position.z<0"),true);
 await evaluate("q.settled=JSON.stringify(q.session.spatial.layout())");
 await evaluate('q.idleFrames=Number(document.querySelector(".workspace-spatial").dataset.frames)');await settle();check('desk is idle without recurring frames',await evaluate('Number(document.querySelector(".workspace-spatial").dataset.frames)===q.idleFrames'),true);
 // A missing reference remains a recoverable labelled proxy, with no arrangement writes.
 await evaluate("q.editor.commands.remove(q.node('one').key);q.frame()");
 check('missing objects disable arrangement',await evaluate('!document.querySelector(".workspace-spatial__arrangement")&&!document.querySelector(".workspace-spatial__footer > button")'),true);
 await evaluate('q.editor.repository.undo();q.frame()');
 check('undo restores shared content without undoing arrangement',await evaluate('JSON.stringify(q.session.spatial.layout())===q.settled'),true);
 await writeFile('artifacts/spatial-d/browser-results.json',JSON.stringify({browser:await send('Browser.getVersion'),checks},null,2));console.log(JSON.stringify({checks},null,2));await evaluate('q.dispose()');
} finally {
 if(socket&&socket.readyState!==WebSocket.CLOSED){const closed=new Promise(r=>socket.addEventListener('close',r,{once:true}));socket.close();await Promise.race([closed,new Promise(r=>setTimeout(r,1000))]);}
 if(chrome.exitCode===null&&chrome.signalCode===null){const closed=new Promise(r=>chrome.once('exit',r));chrome.kill('SIGKILL');await closed;}
 await rm(profile,{recursive:true,force:true,maxRetries:8,retryDelay:200});
}
