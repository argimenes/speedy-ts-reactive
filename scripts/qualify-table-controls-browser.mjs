// Increment 2: trusted browser input, Event Timing next-paint latency, and screenshot-confirmed usability.
// Screenshot latency is an upper bound including CDP overhead, never a two-frame paint estimate.
// Trusted Chromium input, Event Timing through paint, DOM/caret readiness, and
// screenshot/input confirmation (upper bounds, not two-frame settling).
// Fixed moved content; unrelated content varies independently.
// Reads the fixture only; never saves it or opens a user vault.
// BENCHMARK_DOCUMENT_PATH selects a native fixture; BENCHMARK_OUTPUT selects artifacts.
import {spawn} from 'node:child_process';
import {mkdtemp, rm, mkdir, writeFile, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
const phases=false;
const instrument=true;
const scenario=process.env.STRUCTURAL_CASE??'moderate';
const native=JSON.parse(await readFile(process.env.BENCHMARK_DOCUMENT_PATH??'vaults/imported/documents/edgar-allan-poe/masque-of-the-red-death-[1c48f303].ink','utf8'));
const root=native.document.blocks.find(b=>b.id===native.resourceId);
const paragraph=(id,text)=>({id,type:'standoff-editor-block',children:[],inline:[{kind:'text',text}],properties:{standoffProperties:[{id:id+'-ann',type:'style/bold',start:0,end:4}]},relations:{opaque:{},owned:{}}});
if(scenario==='minimal'){native.document.blocks=[root];root.children=[];}
const id='structural-target';native.document.blocks.push(paragraph(id,'A fixed annotated Block to move.'));root.children.unshift({kind:'owned',placementId:'benchmark-placement-'+id,target:{kind:'local',blockId:id}});
if(scenario==='large'||scenario==='annotated25')for(let i=0;i<(scenario==='large'?500:200);i++){const id='unrelated-'+i;native.document.blocks.push(paragraph(id,'Unrelated paragraph with ordinary annotated prose.'));root.children.push({kind:'owned',placementId:'benchmark-placement-'+id,target:{kind:'local',blockId:id}});}
const fixture=Buffer.from(JSON.stringify(native));
const artifacts=process.env.BENCHMARK_OUTPUT??'/tmp/table-controls-'+scenario;await mkdir(artifacts,{recursive:true});
const profile=await mkdtemp(path.join(tmpdir(),'flint-integration-'));
const vite=await createServer({plugins:[{
 name:'flint-integration-proof', enforce:'pre',
 transform(code,id){
  const names=!instrument?[]:id.endsWith('/block-tree/repository.ts')?['planOperations','planChangedRecords','deriveLocations','validateRepository']:id.endsWith('/runtime/block-menu-actions.ts')?['blockMenuItems']:id.endsWith('/runtime/table-menu.ts')?['tableMenuItems']:id.endsWith('/block-tree/clone.ts')?['clone']:id.endsWith('/block-tree/resource-identity.ts')?['resourceOwner']:id.endsWith('/block-tree/structural-plan.ts')?['structuralChangeFor']:id.endsWith('/block-tree/resource-registration.ts')?['documentRootPlacements']:[];
  for(const name of names){const pattern=new RegExp('function '+name+'(<[^>]+>)?\\(');if(!pattern.test(code))continue;const exported=code.includes('export function '+name);code=code.replace('export function '+name,'function '+name);code=code.replace(pattern,(_,type)=>'function __measured_'+name+(type??'')+'(');code+='\n'+(exported?'export ':'')+'function '+name+'(...args:any[]):any { const m=(globalThis as any).__structuralMeasure; return m ? m('+JSON.stringify(name)+',()=>__measured_'+name+'(...args)) : __measured_'+name+'(...args); }';}
  if((instrument||phases)&&id.endsWith('/block-tree/repository.ts')){
   code=code.replace('import { batch, createSignal }','import { batch as solidBatch, createSignal }');
   code+='\nfunction batch(fn:any) { const m=(globalThis as any).__structuralMeasure; return m ? m("reactive.batch",()=>solidBatch(()=>m("repository.publish",fn))) : solidBatch(fn); }';
   return {code,map:null};
  }
  return names.length?{code,map:null}:undefined;
 },
 resolveId(id){if(id==='/__flint-proof.js')return '\0flint-proof';},
 load(id){if(id==='\0flint-proof')return `
 import {render} from 'solid-js/web';
 import {createComponent} from 'solid-js';
 import {WorkspaceSession} from '/src/application/workspace-session.ts';
 import {WorkspacePresentationView} from '/src/application/workspace-presentation-view.tsx';
 import {materializeLocalWorkspace} from '/src/reactive-editor/workspace-manifest.ts';
 import '/src/index.css';
 import '/src/demo/workspace-demo.css';
 const session=new WorkspaceSession(materializeLocalWorkspace({type:'workspace-block',children:[]}),{features:{directDomCharacterCells:${process.env.BENCHMARK_DIRECT_CELLS!=='false'},everydayWebResources:${process.env.BENCHMARK_EVERYDAY_WEB!=='false'},webResourceViewers:${process.env.BENCHMARK_WEB_RESOURCES!=='false'},deterministicAcademicResources:${process.env.BENCHMARK_DETERMINISTIC_ACADEMIC!=='false'},flintRecentDocuments:${process.env.BENCHMARK_FLINT_RECENTS!=='false'},webPublishing:${process.env.BENCHMARK_WEB_PUBLISHING!=='false'},applicationServices:${process.env.BENCHMARK_APPLICATION_SERVICES!=='false'},documentInterchange:${process.env.BENCHMARK_DOCUMENT_INTERCHANGE!=='false'},mutableClipboard:${process.env.BENCHMARK_MUTABLE_CLIPBOARD!=='false'},nativeDocumentPersistence:${!!process.env.BENCHMARK_VAULT_SIZE},nativeKnowledge:false,sqliteKnowledge:false,flintProbe:false,flintSceneChrome:true,annotationRangeEvents:${process.env.BENCHMARK_ANNOTATION_RANGE_EVENTS!=='false'},caretModes:${process.env.BENCHMARK_CARET_MODES!=='false'},standoffPropertyRendering:${process.env.BENCHMARK_STANDOFF_RENDERING!=='false'}}});
 const editor=session.editor;const extraDocuments=[];
 const bank=editor.commands.insert({type:'workspace-object-bank-block',children:[]},{kind:'at',parentKey:session.projection.state.rootKey,index:0});
 const {admitNative}=await import('/src/persistence/native-resource.ts');
 admitNative(editor.repository,new Uint8Array(await (await fetch('/__letter')).arrayBuffer()),editor.repository.readState().placements[bank].contentKey);
 editor.commandRegistry.execute('flint.open',{targetKey:session.projection.state.rootKey,args:undefined});
 if(${scenario==='workspace'})for(let i=0;i<4;i++){
 const copy=JSON.parse(JSON.stringify(${JSON.stringify(native)}));
 const replacements=new Map(copy.document.blocks.map(b=>[b.id,crypto.randomUUID()]));
 const remap=x=>{if(typeof x==='string')return replacements.get(x)??x;if(Array.isArray(x))return x.map(remap);if(x&&typeof x==='object')return Object.fromEntries(Object.entries(x).map(([k,v])=>[k==='placementId'?k:k,k==='placementId'?crypto.randomUUID():remap(v)]));return x};
 const mapped=remap(copy);extraDocuments.push(mapped.resourceId);admitNative(editor.repository,new TextEncoder().encode(JSON.stringify(mapped)),editor.repository.readState().placements[bank].contentKey);
 }
 const native=(await import('/src/persistence/native-session.ts')).nativeDocumentSession(editor);
 if(${!!process.env.BENCHMARK_VAULT_SIZE}){
   const id=${JSON.stringify(JSON.parse(fixture).resourceId)},location={folder:'benchmark',filename:'letter.ink'};
   native.bind(id,location,{nativeHash:null,markdownHash:null,generation:null});
   const listing={vault:'benchmark',folders:['benchmark'],documents:[...Array.from({length:${Number(process.env.BENCHMARK_VAULT_SIZE)||0}},(_,i)=>({resourceId:'unopened-'+i,title:'Unopened letter '+i,location:{folder:'benchmark',filename:'letter-'+i+'.ink'},state:'paired'})),{resourceId:id,title:'Michelangelo letter',location,state:'paired'}],markdown:[],diagnostics:[],operations:[],readOnly:false,complete:true};
   native.defaultVault=async()=> 'benchmark';native.establishVault=async()=>({vault:'benchmark'});native.browseVault=async()=>listing;native.discoverVault=async()=>listing;
 }
 const win=Object.values(session.projection.state.nodes).find(n=>n.viewType==='window-block');
 editor.commands.setPayloadField(win.key,'metadata',{...JSON.parse(JSON.stringify(win.payload.metadata)),size:{w:1450,h:920},position:{x:25,y:25}});
 const host=document.getElementById('root');host.className='workspace-demo workspace-demo--canonical';
 const dispose=render(()=>createComponent(WorkspacePresentationView,{session}),host);editor.installGateway(document);
 window.proof={editor,session,dispose,host,native,render,createComponent,extraDocuments};
 `;},
 configureServer(server){server.middlewares.use(async(req,res,next)=>{if(req.url==='/__letter'){res.setHeader('Content-Type','application/json');res.end(fixture);return;}if(req.url!=='/__flint-integration')return next();res.setHeader('Content-Type','text/html');res.end(await server.transformIndexHtml(req.url,'<html><body><div id="root"></div><script type="module" src="/__flint-proof.js"></script></body></html>'));});}
}],server:{host:'127.0.0.1',port:0,hmr:false}});await vite.listen();
const chrome=spawn(process.env.CHROME_BIN??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows',...(process.env.BENCHMARK_NATIVE_GPU==='1'?[]:['--use-angle=swiftshader','--enable-unsafe-swiftshader']),'--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank']);
let socket,serviceLoad;
try{
 const endpoint=await new Promise((resolve,reject)=>{let out='';chrome.stderr.on('data',b=>{out+=b;const m=out.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(m)resolve(m[1]);});chrome.once('error',reject);setTimeout(()=>reject(Error('Chrome timeout')),15000).unref();});
 socket=new WebSocket(endpoint);await new Promise(r=>socket.addEventListener('open',r,{once:true}));
 let id=0;const pending=new Map(),errors=[];
 socket.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}if(m.method==='Runtime.exceptionThrown'){errors.push(m.params.exceptionDetails);console.error(JSON.stringify(m.params.exceptionDetails));}});
 const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const n=++id;const timer=setTimeout(()=>{pending.delete(n);reject(Error('CDP timeout '+method+' '+String(params.expression??'').slice(0,160)));},180000);pending.set(n,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});socket.send(JSON.stringify({id:n,method,params,...(sessionId?{sessionId}:{})}));});
 const {targetId}=await send('Target.createTarget',{url:'about:blank'}),{sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
 const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value;};
 const wait=condition=>evaluate(`(async()=>{for(let i=0;i<300;i++){if(${condition})return;await new Promise(r=>setTimeout(r,50));}throw Error('Timed out: '+${JSON.stringify(condition)}+'; '+document.querySelector('.autocomplete-workstation')?.textContent+'; active '+document.activeElement?.outerHTML.slice(0,200)+'; query '+document.querySelector('.autocomplete-workstation input')?.value)})()`);
 await send('Page.bringToFront',{},sessionId);await send('Runtime.enable',{},sessionId);await send('Emulation.setDeviceMetricsOverride',{width:1500,height:990,deviceScaleFactor:1,mobile:false},sessionId);
 await send('Page.navigate',{url:`http://127.0.0.1:${vite.httpServer.address().port}/__flint-integration`},sessionId);
 console.log("waiting for Flint",scenario);
 await wait("window.proof && document.querySelector('.flint-compact .reactive-standoff-flow')");
 if(scenario==='workspace')await evaluate(`(async()=>{const {selectApplicationDocument}=await import('/src/application/document-application-navigation.ts');const key=Object.values(proof.session.projection.state.nodes).find(n=>n.viewType==='flint-application-block').key;for(const id of proof.extraDocuments){if(!selectApplicationDocument(proof.editor,key,id))throw Error('Cannot open Document');await new Promise(r=>setTimeout(r,30));}selectApplicationDocument(proof.editor,key,${JSON.stringify(native.resourceId)});})()`);
 await evaluate(`proof.root=proof.host.querySelector('.flint-application');proof.view=[...proof.editor.projections.values()].find(v=>v!==proof.session.projection&&Object.values(v.state.nodes).some(n=>n.payload.id==='structural-target'));proof.text=Object.values(proof.view.state.nodes).find(n=>n.payload.id==='structural-target');proof.mount=proof.editor.mounts.get(proof.text.key);proof.flow=proof.mount.root.querySelector('.reactive-standoff-flow')??proof.mount.root;proof.editor.focus.request(proof.text.key);proof.mount.restoreInlineSelection({anchor:5,head:5});`);

 await evaluate(`proof.tick=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));proof.stats=a=>{a=[...a].sort((a,b)=>a-b);return {median:a[Math.floor(a.length/2)],p95:a[Math.floor(a.length*.95)],max:a.at(-1)}};`);
 await evaluate(`
  proof.unrelatedWrites=[];const other=[...proof.host.querySelectorAll('[data-block-selection-handle]')].find(b=>b.dataset.blockSelectionHandle!==proof.text.key);if(other)new MutationObserver(records=>proof.unrelatedWrites.push(...records.map(r=>r.attributeName))).observe(other,{attributes:true,attributeFilter:['title','aria-pressed']});
  proof.events=[];new PerformanceObserver(list=>proof.events.push(...list.getEntries().map(e=>({name:e.name,start:e.startTime,duration:e.duration,processingStart:e.processingStart,processingEnd:e.processingEnd,interactionId:e.interactionId})))).observe({type:'event',durationThreshold:16,buffered:true});
  proof.counts={};proof.timings={};proof.measuring=false;
  window.__structuralMeasure=(name,fn)=>{if(!proof.measuring)return fn();proof.counts[name]=(proof.counts[name]??0)+1;const t=performance.now();try{return fn()}finally{proof.timings[name]=(proof.timings[name]??0)+performance.now()-t}};
  for(const [object,key,name] of [[proof.editor.repository,'snapshot','snapshot'],[proof.editor.commands,'structuralTransaction','structuralTransaction'],[proof.editor.repository,'rebuildReferences','index.rebuild'],[proof.editor.tables,'prepare','table.prepare'],[window,'fetch','fetch'],[proof.editor.focus,'request','focus.request'],[proof.mount,'restoreInlineSelection','caret.restore'],...Array.from(proof.editor.projections.values()).map(p=>[p,'build','projection.build'])]){const fn=object[key];object[key]=function(...args){return window.__structuralMeasure(name,()=>fn.apply(this,args))};}
  const execute=proof.editor.tables.execute.bind(proof.editor.tables);proof.editor.tables.execute=receipt=>{const start=performance.now();execute(receipt);proof.sync=performance.now()-start;queueMicrotask(()=>{proof.ready=performance.now();});};
  window.addEventListener('keydown',event=>{if(event.key==='Enter'&&proof.armed){proof.accept=event.timeStamp;proof.armed=false;proof.measuring=true;proof.counts={};proof.timings={};}},true);
  proof.current=()=>proof.editor.nodeForPlacementInView(proof.text.placementKey,proof.view.viewId);
  proof.focus=()=>{const n=proof.current(),m=proof.editor.mounts.get(n.key);proof.editor.focus.request(n.key);m.restoreInlineSelection({anchor:2,head:2});m.root.scrollIntoView({block:'center'});};
  proof.focus();
 `);
 const key=async(key,code=key)=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key,code,text:key==='Enter'?'\r':undefined,windowsVirtualKeyCode:key==='Enter'?13:key==='Escape'?27:undefined},sessionId);await send('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode:key==='Enter'?13:key==='Escape'?27:undefined},sessionId);};
 const text=async value=>{for(const ch of value)await send('Input.insertText',{text:ch},sessionId);};
 const dimensions=await evaluate(`({records:Object.keys(proof.editor.repository.readState().contents).length,documents:Object.values(proof.editor.repository.readState().contents).filter(n=>n.viewType==='document-block').length,openDocumentViews:[...proof.editor.projections.values()].filter(p=>p!==proof.session.projection).length,documentCharacters:Object.values(proof.view.state.nodes).reduce((s,n)=>s+n.inlineContent.length,0)})`);
 const browser=await send('Browser.getVersion');const graphics=await send('SystemInfo.getInfo');
 if(process.env.TABLE_PROFILE==='1'){await send('Profiler.enable',{},sessionId);await send('Profiler.start',{},sessionId);}
 const samples=[];
 for(let i=0;i<10;i++){
  await evaluate('proof.focus();proof.unrelatedWrites=[];proof.measuring=true;proof.counts={};proof.timings={}');await text('/c2');
  const suggestionCounts=await evaluate('proof.counts');
  for(const name of ['snapshot','projection.build','index.rebuild','table.prepare','structuralTransaction','planOperations','validateRepository','fetch'])assert.equal(suggestionCounts[name]??0,0);
  await evaluate('proof.measuring=false');
  await wait("proof.editor.overlays.overlays.some(o=>o.viewType==='autocomplete'&&o.data.session.state.selected==='table.columns-2')");
  await evaluate('proof.armed=true;proof.ready=undefined;proof.accept=undefined');
  await key('Enter');
  const ready=await evaluate(`(()=>{const e=proof.editor,n=proof.current(),m=e.mounts.get(n.key),cell=proof.view.parentOf(n.key),rect=m.root.getBoundingClientRect(),table=m.root.closest('[role=table]');return {sync:proof.sync,ready:proof.ready-proof.accept,table:cell.viewType==='table-cell-block',visible:!!table&&rect.width>0&&rect.height>0&&rect.top<innerHeight&&rect.bottom>0,caret:m.captureInlineSelection(),retained:m.root===proof.mount.root,active:document.activeElement===m.focusElement,counts:proof.counts,timings:proof.timings,accept:proof.accept,domUsableConfirmed:performance.now()-proof.accept};})()`);
  ready.suggestionCounts=suggestionCounts;
  assert.equal(ready.table,true);assert.equal(ready.visible,true);assert.equal(ready.retained,true);assert.equal(ready.active,true);assert.deepEqual(ready.caret,{anchor:2,head:2});
  // Observe the browser's event-to-next-paint entry before requesting a screenshot.
  // This prevents screenshot capture itself from determining the measured paint.
  await evaluate(`(async()=>{const start=performance.now();while(!proof.events.some(e=>e.name==='keydown'&&Math.abs(e.start-proof.accept)<2)&&performance.now()-start<2500)await new Promise(r=>setTimeout(r,20));})()`);
  const screenshot=await send('Page.captureScreenshot',{format:'png'},sessionId);
  ready.screenshotConfirmed=await evaluate('performance.now()-proof.accept');
  if(i===2)await writeFile(path.join(artifacts,'slash-table-visible.png'),Buffer.from(screenshot.data,'base64'));
  await text('Z');
  const usable=await evaluate(`(()=>{const m=proof.editor.mounts.get(proof.current().key);return {text:m.captureText(),caret:m.captureInlineSelection()};})()`);
  assert.ok(usable.text.startsWith('A Zfixed'));assert.deepEqual(usable.caret,{anchor:3,head:3});
  ready.usableInputConfirmed=await evaluate('performance.now()-proof.accept');
  ready.unrelatedHandleWrites=await evaluate('proof.unrelatedWrites');assert.deepEqual(ready.unrelatedHandleWrites,[]);
  await evaluate('proof.measuring=false');
  // Event Timing delivery may lag paint; this wait is outside the measured interval.
  await new Promise(r=>setTimeout(r,120));
  ready.paintEvents=await evaluate(`proof.events.filter(e=>e.name==='keydown'&&Math.abs(e.start-${ready.accept})<2)`);
  samples.push(ready);
  await evaluate(`proof.editor.repository.undo();proof.editor.repository.undo();`); // follow-up typing, then atomic table command
  await wait("proof.view.parentOf(proof.current().key).viewType!=='table-cell-block'");
  await evaluate(`{const n=proof.current();proof.editor.commands.replaceInlineRange(n.key,2,5,'');}`);
 }
 if(process.env.TABLE_PROFILE==='1'){const {profile}=await send('Profiler.stop',{},sessionId);await writeFile(path.join(artifacts,'slash.cpuprofile'),JSON.stringify(profile));}
 // Measure the new contextual controls separately, including focus restoration.
 const menu=await evaluate(`(async()=>{
  const e=proof.editor,{openTableMenu}=await import('/src/runtime/table-menu.ts');
  e.tables.run({kind:'create',targets:[proof.current().key],columns:2});await new Promise(r=>setTimeout(r,30));
  const samples=[];for(let i=0;i<8;i++){
   const n=proof.current(),cell=proof.view.parentOf(n.key),button=e.mounts.get(cell.key).root.querySelector('[aria-label="Row 1, column 1 controls"]');
   proof.focus();proof.unrelatedWrites=[];proof.measuring=true;proof.counts={};proof.timings={};const start=performance.now();openTableMenu(e,cell.key,button);await Promise.resolve();const opened=performance.now(),openCounts=proof.counts,openTimings=proof.timings;
   proof.measuring=true;proof.counts={};proof.timings={};document.querySelectorAll('[role=menuitem]').forEach(b=>{if(b.textContent==='Insert column right')b.click()});await Promise.resolve();await Promise.resolve();
   if(document.querySelector('.reactive-block-menu [role=alert]'))throw Error(document.querySelector('.reactive-block-menu [role=alert]').textContent);
   samples.push({open:opened-start,openCounts,openTimings,action:performance.now()-opened,sync:proof.sync,counts:proof.counts,timings:proof.timings,caret:e.mounts.get(n.key).captureInlineSelection()});proof.measuring=false;e.repository.undo();await new Promise(r=>setTimeout(r,30));
  }return samples;
 })()`);
 assert.ok(menu.every(x=>x.caret.anchor===2&&x.caret.head===2));


 const legacyMenu=await evaluate(`(async()=>{const {blockMenuItems}=await import('/src/runtime/block-menu-actions.ts');const samples=[];for(let i=0;i<8;i++){proof.focus();await new Promise(r=>setTimeout(r,30));proof.measuring=true;proof.counts={};proof.timings={};const start=performance.now(),items=blockMenuItems(proof.editor,proof.current().key),built=performance.now();items.find(i=>i.label==='Convert to grid (1 × 2)').run();const end=performance.now();samples.push({build:built-start,action:end-built,timings:proof.timings,counts:proof.counts});proof.measuring=false;proof.editor.repository.undo();await new Promise(r=>setTimeout(r,30));}return samples;})()`);
 const layout=await evaluate(`(()=>{
 const e=proof.editor,n=proof.current(),cell=proof.view.parentOf(n.key),row=proof.view.parentOf(cell.key),table=proof.view.parentOf(row.key),root=e.mounts.get(table.key).root;
 root.style.width='350px';const scroller=root.querySelector('.reactive-table-scroll');scroller.scrollLeft=100;
 const result={scrollWidth:scroller.scrollWidth,clientWidth:scroller.clientWidth,scrollLeft:scroller.scrollLeft,columns:row.children.map(k=>e.mounts.get(k).root.getBoundingClientRect().width)};
 const before=e.repository.state.revision;e.tables.toggleGuides(proof.view.viewId);result.guidesNoMutation=e.repository.state.revision===before;return result;
 })()`);
 assert.ok(layout.scrollWidth>layout.clientWidth);assert.ok(layout.scrollLeft>0);assert.equal(layout.guidesNoMutation,true);
 await send('Page.captureScreenshot',{format:'png'},sessionId).then(r=>writeFile(path.join(artifacts,'narrow-table.png'),Buffer.from(r.data,'base64')));

 // Functional gates use the same real editor and trusted Chromium key/mouse input.
 const click=async expression=>{const point=await evaluate(`(()=>{const b=${expression};if(!b)throw Error('Missing control: '+${JSON.stringify(expression)});const r=b.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()`);await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point},sessionId);await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point},sessionId);};
 const item=label=>`[...document.querySelectorAll('[role=menuitem]')].find(b=>b.textContent.replace(/[›‹]/g,'').trim()===${JSON.stringify(label)})`;
 const functional={};
 await evaluate('proof.focus()');await text('/c');const unavailableLiteral=await evaluate('proof.mount.captureText()');
 assert.equal(await evaluate("proof.editor.overlays.overlays.find(o=>o.viewType==='autocomplete').data.session.state.selected"),'');await key('Enter');assert.equal(await evaluate('proof.mount.captureText()'),unavailableLiteral);await key('Escape');await evaluate("proof.editor.commands.replaceInlineRange(proof.current().key,2,4,'')");functional.unavailableExactAliasLiteral=true;
 await evaluate(`(async()=>{const e=proof.editor,cell=proof.view.parentOf(proof.current().key),p=e.commands.insert({id:'controls-live-viewer',type:'iframe-block',url:'about:blank'},{kind:'at',parentKey:cell.key,index:1});await new Promise(r=>setTimeout(r,100));proof.live=e.mounts.get(e.nodeForPlacementInView(p,proof.view.viewId).key).root.querySelector('iframe');proof.liveWindow=proof.live.contentWindow;proof.liveDocument=proof.live.contentDocument;proof.liveWindow.controlsSentinel='retained';})()`);
 // Navigate through native focusable controls; scroll only the table at 150% zoom.
 functional.navigation=await evaluate(`(()=>{const n=proof.current(),m=proof.editor.mounts.get(n.key),root=m.root.closest('.reactive-table-viewport');root.style.zoom='1.5';proof.scroller=root.querySelector('.reactive-table-scroll');proof.scroller.scrollLeft=0;proof.scrollBefore={window:scrollY,document:proof.scroller.parentElement.parentElement.scrollTop};const button=root.querySelector('[aria-label="Row 1, column 1 controls"]');button.focus();return {revision:proof.editor.repository.state.revision};})()`);
 await key('Enter');await wait("document.querySelector('.reactive-block-menu')");
 await click(item('Go to cell…'));await click(item('Row 1, column 2'));
 await wait('proof.scroller.scrollLeft>0');
 Object.assign(functional.navigation,await evaluate(`(()=>{const e=proof.editor,n=e.mounts.resolveElement(document.activeElement),cell=document.activeElement.closest('[role=cell]');return {focusedCell:!!cell,scrollLeft:proof.scroller.scrollLeft,windowPreserved:scrollY===proof.scrollBefore.window,documentPreserved:proof.scroller.parentElement.parentElement.scrollTop===proof.scrollBefore.document,revisionAfter:e.repository.state.revision};})()`));
 assert.equal(functional.navigation.revision,functional.navigation.revisionAfter);assert.equal(functional.navigation.focusedCell,true);assert.equal(functional.navigation.windowPreserved,true);assert.equal(functional.navigation.documentPreserved,true);
 await evaluate(`proof.scroller.closest('.reactive-table-viewport').style.zoom='';proof.scroller.closest('.reactive-table-viewport').style.width='';proof.focus()`);
 functional.aliases=[];
 for(const alias of ['row','col','mc r','move-cell left','mr d','move-row up','unc','c3','unc','c4','unc']){
  await evaluate('proof.focus()');await text('/'+alias);
  await wait("proof.editor.overlays.overlays.some(o=>o.viewType==='autocomplete'&&o.data.session.state.rows.some(r=>r.id===o.data.session.state.selected&&r.exact))");
  const literal=await evaluate('proof.editor.mounts.get(proof.current().key).captureText()');
  await key('Enter');
  const after=await evaluate(`({text:proof.editor.mounts.get(proof.current().key).captureText(),caret:proof.editor.mounts.get(proof.current().key).captureInlineSelection(),retained:proof.editor.mounts.get(proof.current().key).root===proof.mount.root})`);
  assert.equal(after.text,'A fixed annotated Block to move.');assert.equal(after.retained,true);assert.deepEqual(after.caret,{anchor:2,head:2});
  await evaluate('proof.editor.repository.undo()');assert.equal(await evaluate('proof.editor.mounts.get(proof.current().key).captureText()'),literal);
  await evaluate('proof.editor.repository.redo()');functional.aliases.push({alias,...after,exactUndo:true});
 }
 for(const literal of ['/c99','/mc 2','/c2 extra']){
  await evaluate('proof.focus()');await text(literal);await key('Escape');
  assert.equal(await evaluate("proof.view.parentOf(proof.current().key).viewType==='table-cell-block'"),false);
  assert.ok((await evaluate('proof.mount.captureText()')).includes(literal));
  await evaluate(`proof.editor.commands.replaceInlineRange(proof.current().key,2,${2+literal.length},'')`);
 }
 functional.unknownAndEscape=true;
 await evaluate('proof.focus()');await text('/c2');
 functional.stale=await evaluate(`(async()=>{const e=proof.editor,s=e.overlays.overlays.find(o=>o.viewType==='autocomplete').data.session;e.commands.replaceInlineRange(proof.current().key,0,0,'Changed ');const before=proof.mount.captureText();await s.choose();return {unchanged:proof.mount.captureText()===before,literal:proof.mount.captureText().includes('/c2'),ordinary:proof.view.parentOf(proof.current().key).viewType!=='table-cell-block'};})()`);assert.ok(Object.values(functional.stale).every(Boolean));
 await evaluate(`proof.editor.commands.replaceInlineRange(proof.current().key,0,proof.current().inlineContent.length,'A fixed annotated Block to move.')`);
 // A real IME composition must not open completion or publish table structure.
 await evaluate('proof.focus()');await send('Input.imeSetComposition',{text:'/c2',selectionStart:3,selectionEnd:3},sessionId);
 assert.equal(await evaluate("proof.editor.overlays.overlays.some(o=>o.viewType==='autocomplete')"),false);
 await send('Input.insertText',{text:'/c2'},sessionId);
 assert.equal(await evaluate("proof.view.parentOf(proof.current().key).viewType==='table-cell-block'"),false);
 await evaluate(`proof.editor.commands.replaceInlineRange(proof.current().key,0,proof.current().inlineContent.length,'A fixed annotated Block to move.')`);
 functional.imeLiteral=true;
 // Clipboard input follows the real browser paste path.
 await send('Browser.grantPermissions',{permissions:['clipboardReadWrite','clipboardSanitizedWrite'],origin:`http://127.0.0.1:${vite.httpServer.address().port}`});
 await evaluate(`proof.focus();navigator.clipboard.writeText('/c2')`);
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'v',code:'KeyV',modifiers:4,commands:['paste']},sessionId);
 await send('Input.dispatchKeyEvent',{type:'keyUp',key:'v',code:'KeyV',modifiers:4},sessionId);
 await wait("proof.mount.captureText().includes('/c2')");assert.equal(await evaluate("proof.editor.overlays.overlays.some(o=>o.viewType==='autocomplete')"),false);
 functional.pasteLiteral=true;
 await evaluate(`proof.editor.commands.replaceInlineRange(proof.current().key,0,proof.current().inlineContent.length,'A fixed annotated Block to move.')`);
 // Whole-Block selection is captured before the out-of-document command field opens.
 await evaluate(`{const e=proof.editor,n=proof.current();proof.selected=[n.placementKey];for(let i=1;i<5;i++)proof.selected.push(e.commands.insert({id:'selection-'+i,type:'standoff-editor-block',text:'Selected '+i},{kind:'after',anchorKey:proof.selected.at(-1)}));proof.focus();e.blockSelection.clear();for(const p of proof.selected)e.blockSelection.select(e.nodeForPlacementInView(p,proof.view.viewId).key,'toggle');}`);
 await evaluate(`(async()=>{const {openTableMenu}=await import('/src/runtime/table-menu.ts');openTableMenu(proof.editor,proof.current().key,proof.mount.root);})()`);
 await click(item('Table command…'));await text('/c3');await key('Enter');
 functional.selection=await evaluate(`(()=>{const e=proof.editor,cell=proof.view.parentOf(proof.current().key),row=proof.view.parentOf(cell.key),table=proof.view.parentOf(row.key),contents=table.children.flatMap(r=>e.node(r).children.map(c=>e.node(e.node(c).children[0]).placementKey));return {rows:table.children.length,columns:row.children.length,identities:proof.selected.every((p,i)=>p===contents[i]),originalText:proof.mount.captureText(),noLiteral:!proof.mount.captureText().includes('/c3')};})()`);
 assert.equal(functional.selection.rows,2);assert.equal(functional.selection.columns,3);assert.equal(functional.selection.identities,true);assert.equal(functional.selection.noLiteral,true);
 functional.liveViewer=await evaluate(`({dom:proof.live.isConnected,window:proof.live.contentWindow===proof.liveWindow,document:proof.live.contentDocument===proof.liveDocument,sentinel:proof.live.contentWindow.controlsSentinel==='retained'})`);assert.ok(Object.values(functional.liveViewer).every(Boolean));
 // Front/back presentation survives table moves without recreating either face.
 functional.surface=await evaluate(`(async()=>{const e=proof.editor,n=proof.current();e.surfaces.run('surface.create',n.key);await Promise.resolve();const surface=e.surfaces.nearest(n.key),front=e.mounts.get(n.key).root,back=e.mounts.get(e.node(e.node(surface.children[1]).children[0]).children[0]).root;e.surfaces.run('surface.flip',surface.key);await Promise.resolve();await Promise.resolve();const face=front.closest('[data-surface-face]').inert;e.tables.run({kind:'swap-cell',target:surface.key,direction:'right'});await Promise.resolve();const after=front.closest('[data-surface-face]').inert;e.repository.undo();await Promise.resolve();e.repository.redo();await Promise.resolve();return {frontRetained:e.mounts.get(n.key).root===front,backConnected:back.isConnected,face,after};})()`);
 assert.equal(functional.surface.frontRetained,true);assert.equal(functional.surface.backConnected,true);assert.deepEqual(functional.surface.face,functional.surface.after);
 const measured=samples.slice(2),stats=xs=>{xs=[...xs].sort((a,b)=>a-b);return {median:xs[Math.floor(xs.length/2)],p95:xs[Math.floor(xs.length*.95)],max:xs.at(-1)}};
 const result={scenario,browser,graphics:graphics.gpu,directCells:process.env.BENCHMARK_DIRECT_CELLS!=='false',nativeGPU:process.env.BENCHMARK_NATIVE_GPU==='1',dimensions,samples,menu,legacyMenu,layout,functional,summary:{sync:stats(measured.map(s=>s.sync)),structuralTransaction:stats(measured.map(s=>s.timings.structuralTransaction)),ready:stats(measured.map(s=>s.ready)),screenshotUpperBound:stats(measured.map(s=>s.screenshotConfirmed)),eventTiming:stats(measured.flatMap(s=>s.paintEvents.map(e=>e.duration))),menuOpen:stats(menu.slice(2).map(s=>s.open)),menuAction:stats(menu.slice(2).map(s=>s.action))},errors};
 for(const sample of [...samples,...menu]){assert.equal(sample.counts.snapshot??0,0);assert.equal(sample.counts['projection.build']??0,0);assert.equal(sample.counts.planOperations??0,0);assert.equal(sample.counts.validateRepository??0,0);assert.equal(sample.counts['index.rebuild']??0,0);assert.equal(sample.counts.fetch??0,0);}
 await writeFile(path.join(artifacts,'results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({scenario,dimensions,summary:result.summary,layout,errors},null,2));assert.equal(errors.length,0);
 await evaluate('proof.dispose();proof.session.dispose()');
}finally{await serviceLoad?.stop();socket?.close();chrome.kill();await vite.close();await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
process.exit(0);
