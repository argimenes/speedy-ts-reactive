// Structural scaling and opt-in phase instrumentation in real Flint.
// Fixed moved content; unrelated content varies independently.
// Reads the fixture only; never saves it or opens a user vault.
// BENCHMARK_DOCUMENT_PATH selects a native fixture; BENCHMARK_OUTPUT selects artifacts.
import {spawn} from 'node:child_process';
import {mkdtemp, rm, mkdir, writeFile, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
const phases=process.env.STRUCTURAL_PHASES==='true';
const instrument=process.env.STRUCTURAL_PROFILE!=='false';
const scenario=process.env.STRUCTURAL_CASE??'moderate';
const native=JSON.parse(await readFile(process.env.BENCHMARK_DOCUMENT_PATH??'vaults/imported/documents/edgar-allan-poe/masque-of-the-red-death-[1c48f303].ink','utf8'));
const root=native.document.blocks.find(b=>b.id===native.resourceId);
const paragraph=(id,text)=>({id,type:'standoff-editor-block',children:[],inline:[{kind:'text',text}],properties:{standoffProperties:[{id:id+'-ann',type:'style/bold',start:0,end:4}]},relations:{opaque:{},owned:{}}});
if(scenario==='minimal'){native.document.blocks=[root];root.children=[];}
const id='structural-target';native.document.blocks.push(paragraph(id,'A fixed annotated Block to move.'));root.children.unshift({kind:'owned',placementId:'benchmark-placement-'+id,target:{kind:'local',blockId:id}});
if(scenario==='large')for(let i=0;i<500;i++){const id='unrelated-'+i;native.document.blocks.push(paragraph(id,'Unrelated paragraph with ordinary annotated prose.'));root.children.push({kind:'owned',placementId:'benchmark-placement-'+id,target:{kind:'local',blockId:id}});}
const fixture=Buffer.from(JSON.stringify(native));
const artifacts=process.env.BENCHMARK_OUTPUT??'/tmp/structural-'+scenario;await mkdir(artifacts,{recursive:true});
const profile=await mkdtemp(path.join(tmpdir(),'flint-integration-'));
const vite=await createServer({plugins:[{
 name:'flint-integration-proof', enforce:'pre',
 transform(code,id){
  const names=!instrument?[]:id.endsWith('/block-tree/repository.ts')?['planOperations','planChangedRecords','deriveLocations','validateRepository']:id.endsWith('/block-tree/clone.ts')?['clone']:id.endsWith('/block-tree/resource-identity.ts')?['resourceOwner']:id.endsWith('/block-tree/structural-plan.ts')?['structuralChangeFor']:id.endsWith('/block-tree/resource-registration.ts')?['documentRootPlacements']:[];
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
 const editor=session.editor;
 const bank=editor.commands.insert({type:'workspace-object-bank-block',children:[]},{kind:'at',parentKey:session.projection.state.rootKey,index:0});
 const {admitNative}=await import('/src/persistence/native-resource.ts');
 admitNative(editor.repository,new Uint8Array(await (await fetch('/__letter')).arrayBuffer()),editor.repository.readState().placements[bank].contentKey);
 editor.commandRegistry.execute('flint.open',{targetKey:session.projection.state.rootKey,args:undefined});
 if(${scenario==='workspace'})for(let i=0;i<4;i++){
 const copy=JSON.parse(JSON.stringify(${JSON.stringify(native)}));
 const replacements=new Map(copy.document.blocks.map(b=>[b.id,crypto.randomUUID()]));
 const remap=x=>{if(typeof x==='string')return replacements.get(x)??x;if(Array.isArray(x))return x.map(remap);if(x&&typeof x==='object')return Object.fromEntries(Object.entries(x).map(([k,v])=>[k==='placementId'?k:k,k==='placementId'?crypto.randomUUID():remap(v)]));return x};
 admitNative(editor.repository,new TextEncoder().encode(JSON.stringify(remap(copy))),editor.repository.readState().placements[bank].contentKey);
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
 window.proof={editor,session,dispose,host,native,render,createComponent};
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
 await evaluate(`proof.root=proof.host.querySelector('.flint-application');proof.view=[...proof.editor.projections.values()].find(v=>v!==proof.session.projection);proof.text=Object.values(proof.view.state.nodes).find(n=>n.payload.id==='structural-target');proof.mount=proof.editor.mounts.get(proof.text.key);proof.flow=proof.mount.root.querySelector('.reactive-standoff-flow')??proof.mount.root;proof.editor.focus.request(proof.text.key);proof.mount.restoreInlineSelection({anchor:5,head:5});`);

 await evaluate(`proof.tick=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));proof.stats=a=>{a=[...a].sort((a,b)=>a-b);return {median:a[Math.floor(a.length/2)],p95:a[Math.floor(a.length*.95)],max:a.at(-1)}};`);
 if(instrument){await send('Profiler.enable',{},sessionId);await send('Profiler.start',{},sessionId);}
 console.log("measuring",scenario,instrument);
 const result=await evaluate(`(async()=>{
 const e=proof.editor,v=proof.view,metrics={},stack=[];let enabled=false;
 window.__structuralMeasure=(name,fn)=>{if(!enabled||!${instrument||phases})return fn();const frame={child:0},start=performance.now();stack.push(frame);try{return fn();}finally{const elapsed=performance.now()-start;stack.pop();if(stack.length)stack.at(-1).child+=elapsed;const m=metrics[name]??={calls:0,total:0,self:0};m.calls++;m.total+=elapsed;m.self+=elapsed-frame.child;}};
 const wrap=(object,key,name=key)=>{if(!${instrument})return;const fn=object?.[key];if(typeof fn!=='function')return;object[key]=function(...args){return window.__structuralMeasure(name,()=>fn.apply(this,args))}};
 for(const key of ['snapshot','commit','commitInline','rebuildReferences','prepareCapture','deliverCapture','setState'])wrap(e.repository,key);
 for(const name of ['beforeChangeSubscribers','changeSubscribers','subscribers','beforeSubscribers']){const set=e.repository[name];for(const fn of [...set]){set.delete(fn);set.add((...args)=>window.__structuralMeasure('notify.'+name,()=>fn(...args)));}}
 const {RetainedBlockOutlets}=await import('/src/rendering/retained-block-outlets.ts');for(const key of ['attach','move','captureScroll'])wrap(RetainedBlockOutlets.prototype,key,'retained.'+key);
 for(const m of e.mounts.values?.()??[])wrap(m,'restoreInlineSelection','caret.restore');
 wrap(e.focus,'request','focus.request');wrap(e.selections,'setPrimary','selection.publish');wrap(e.measurements,'caretRect','geometry.caret');
 for(const key of ['transaction','structuralTransaction','publish','insert','move'])wrap(e.commands,key,'command.'+key);
 wrap(e.repository.historyStorage,'store','history.store');for(const key of ['validateCommit','acceptCommit']){wrap(e.repository.identity,key,'identity.'+key);wrap(e.repository.placementIdentity,key,'placementIdentity.'+key)}
 for(const p of e.projections.values())for(const key of ['build','register','unregister','updateStructural'])wrap(p,key,'projection.'+key);
 for(const key of ['prepare','execute','restore','holdMedia'])wrap(e.tables,key,'table.'+key);
 for(const key of ['getBoundingClientRect','getClientRects'])wrap(Element.prototype,key,'layout.'+key);
 for(const key of ['insertBefore','appendChild','removeChild'])wrap(Node.prototype,key,'DOM.'+key);wrap(Element.prototype,'moveBefore','DOM.moveBefore');
 const microtask=window.queueMicrotask;window.queueMicrotask=fn=>microtask(()=>window.__structuralMeasure('microtask',fn));
 for(const key of ['getBoundingClientRect','getClientRects'])wrap(Range.prototype,key,'layout.range.'+key);
 const mount=proof.mount;wrap(mount,'restoreInlineSelection','caret.restore');
 const sync=[],settled=[],frames=[],computation=[],idleFrames=[];
 for(let i=0;i<10;i++){
 const n=e.nodeForPlacementInView(proof.text.placementKey,v.viewId),m=e.mounts.get(n.key);e.focus.request(n.key);m.restoreInlineSelection({anchor:5,head:5});const idleStart=performance.now();await proof.tick();if(i>=2)idleFrames.push(performance.now()-idleStart);
 enabled=i>=2;const flush=()=> (metrics['reactive.batch']?.total??0)-(metrics['repository.publish']?.total??0);const flushBefore=flush();const start=performance.now();e.tables.run({kind:'create',targets:[n.key],columns:2});if(enabled){const duration=performance.now()-start;sync.push(duration);computation.push(duration-(flush()-flushBefore));}await Promise.resolve();if(enabled)settled.push(performance.now()-start);await proof.tick();if(enabled)frames.push(performance.now()-start);enabled=false;e.repository.undo();await proof.tick();
 }
 return {samples:8,warmups:2,raw:{sync,settled,frames,computation,idleFrames},idleFrameCadence:proof.stats(idleFrames),sync:proof.stats(sync),computationExcludingReactiveFlush:${instrument||phases}?proof.stats(computation):null,settled:proof.stats(settled),frame:proof.stats(frames),metrics,records:Object.keys(e.repository.readState().contents).length,documents:Object.values(e.repository.readState().contents).filter(c=>c.viewType==='document-block').length,paragraphs:Object.values(e.repository.readState().contents).filter(c=>c.viewType==='standoff-editor-block').length};
 })()`);
 if(instrument){const {profile:cpu}=await send('Profiler.stop',{},sessionId);await writeFile(path.join(artifacts,'structural.cpuprofile'),JSON.stringify(cpu));}
 await writeFile(path.join(artifacts,'results.json'),JSON.stringify({scenario,instrument,phases,result,errors},null,2));console.log(JSON.stringify({scenario,instrument,phases,result,errors},null,2));assert.equal(errors.length,0);
 await evaluate('proof.dispose();proof.session.dispose()');
}finally{await serviceLoad?.stop();socket?.close();chrome.kill();await vite.close();await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
process.exit(0);
