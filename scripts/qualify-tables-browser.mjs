// Increment 1 table operations qualification in real Flint; no user files are saved.
// Canonical API, retained viewers, caret history, and paired typing/structural timings.
// Reads the fixture only; never saves it or opens a user vault.
// BENCHMARK_DOCUMENT_PATH selects a native fixture; BENCHMARK_OUTPUT selects artifacts.
import {spawn} from 'node:child_process';
import {mkdtemp, rm, mkdir, writeFile, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
const fixture=await readFile(process.env.BENCHMARK_DOCUMENT_PATH??'vaults/imported/documents/michelangelo-letters/1507-02-13-[a7a41cd3].ink');
const artifacts=process.env.BENCHMARK_OUTPUT??'/tmp/tables-columns-increment1';await mkdir(artifacts,{recursive:true});
const profile=await mkdtemp(path.join(tmpdir(),'flint-integration-'));
const vite=await createServer({plugins:[{
 name:'flint-integration-proof',
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
 socket.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);});
 const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const n=++id;const timer=setTimeout(()=>{pending.delete(n);reject(Error('CDP timeout '+method));},45000);pending.set(n,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});socket.send(JSON.stringify({id:n,method,params,...(sessionId?{sessionId}:{})}));});
 const {targetId}=await send('Target.createTarget',{url:'about:blank'}),{sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
 const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value;};
 const wait=condition=>evaluate(`(async()=>{for(let i=0;i<300;i++){if(${condition})return;await new Promise(r=>setTimeout(r,50));}throw Error('Timed out: '+${JSON.stringify(condition)}+'; '+document.querySelector('.autocomplete-workstation')?.textContent+'; active '+document.activeElement?.outerHTML.slice(0,200)+'; query '+document.querySelector('.autocomplete-workstation input')?.value)})()`);
 await send('Page.bringToFront',{},sessionId);await send('Runtime.enable',{},sessionId);await send('Emulation.setDeviceMetricsOverride',{width:1500,height:990,deviceScaleFactor:1,mobile:false},sessionId);
 await send('Page.navigate',{url:`http://127.0.0.1:${vite.httpServer.address().port}/__flint-integration`},sessionId);
 await wait("window.proof && document.querySelector('.flint-compact .reactive-standoff-flow')");
 await evaluate(`proof.root=proof.host.querySelector('.flint-application');proof.view=[...proof.editor.projections.values()].find(v=>v!==proof.session.projection);proof.text=Object.values(proof.view.state.nodes).filter(n=>n.viewType==='standoff-editor-block'&&proof.editor.mounts.get(n.key)).sort((a,b)=>b.inlineContent.length-a.inlineContent.length)[0];proof.mount=proof.editor.mounts.get(proof.text.key);proof.flow=proof.mount.root.querySelector('.reactive-standoff-flow')??proof.mount.root;proof.editor.focus.request(proof.text.key);proof.mount.restoreInlineSelection({anchor:100,head:100});`);

 const observations={};
 await evaluate(`proof.tick=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));proof.stats=xs=>{xs.sort((a,b)=>a-b);return {median:xs[Math.floor(xs.length/2)],p95:xs[Math.floor(xs.length*.95)],max:xs.at(-1)}};`);
 const typing=()=>evaluate(`(async()=>{
  const {editor:e}=proof,n=e.nodeForPlacementInView(proof.text.placementKey,proof.view.viewId),m=e.mounts.get(n.key),flow=m.root.querySelector('.reactive-standoff-flow');e.focus.request(n.key);m.restoreInlineSelection({anchor:100,head:100});await proof.tick();
  const before=m.captureText();let snapshots=0,builds=0,requests=0,statusReads=0;const snapshot=e.repository.snapshot.bind(e.repository),build=proof.view.build.bind(proof.view),fetch=window.fetch,status=proof.native.status.bind(proof.native);
  e.repository.snapshot=(...a)=>{snapshots++;return snapshot(...a)};proof.view.build=(...a)=>{builds++;return build(...a)};window.fetch=(...a)=>{requests++;return fetch(...a)};proof.native.status=(...a)=>{statusReads++;return status(...a)};
  const sync=[],settled=[],frame=[];
  try{for(let i=0;i<40;i++){const t=performance.now();flow.dispatchEvent(new InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType:i%2?'deleteContentBackward':'insertText',data:i%2?null:'a'}));sync.push(performance.now()-t);await Promise.resolve();settled.push(performance.now()-t);await new Promise(r=>requestAnimationFrame(r));frame.push(performance.now()-t);}}
  finally{e.repository.snapshot=snapshot;proof.view.build=build;window.fetch=fetch;proof.native.status=status;}
  return {samples:40,characters:before.length,documentCharacters:Object.values(proof.view.state.nodes).reduce((s,n)=>s+n.inlineContent.length,0),sync:proof.stats(sync),settled:proof.stats(settled),frame:proof.stats(frame),snapshots,builds,requests,statusReads,restored:before===m.captureText()};
 })()`);
 observations.typingBefore=await typing();
 observations.core=await evaluate(`(async()=>{
  const e=proof.editor,v=proof.view,p=(id,text=id,extra={})=>({id,type:'standoff-editor-block',text,...extra});
  let anchor=proof.text;while(v.parentOf(anchor.key)&&!['document-block','page-block'].includes(v.parentOf(anchor.key).viewType))anchor=v.parentOf(anchor.key);proof.anchor=anchor.placementKey;
  const source=e.commands.insert(p('table-source','Alpha /c2 Beta',{standoffProperties:[{id:'entity-mark',type:'codex/entity-reference',value:'proof-entity',start:0,end:4}],relation:{leftMargin:{id:'table-note',type:'left-margin-block',children:[p('note-text','Owned note')]}}}),{kind:'before',anchorKey:proof.anchor});
  proof.n=id=>Object.values(v.state.nodes).find(n=>n.payload.id===id);proof.source=source;await proof.tick();
  const original=proof.n('table-source'),m=e.mounts.get(original.key),root=m.root;e.focus.request(original.key);m.restoreInlineSelection({anchor:9,head:9});
  e.tables.run({kind:'create',targets:[original.key],columns:2},e.textRanges.snapshot(original.key,6,9));await proof.tick();
  const n=proof.n('table-source'),cell=v.parentOf(n.key),row=v.parentOf(cell.key),table=v.parentOf(row.key);proof.table=table.placementKey;proof.cellA=cell.placementKey;proof.cellB=e.node(row.children[1]).placementKey;
  const result={identity:n.contentKey===original.contentKey&&n.placementKey===source,retainedRoot:e.mounts.get(n.key).root===root,text:e.mounts.get(n.key).captureText(),caret:e.mounts.get(n.key).captureInlineSelection(),ownedRelation:Object.keys(n.ownedRelations).length,annotations:n.payload.standoffProperties.length};
  e.repository.undo();await proof.tick();result.undo={text:e.mounts.get(proof.n('table-source').key).captureText(),caret:e.mounts.get(proof.n('table-source').key).captureInlineSelection(),ordinary:v.parentOf(proof.n('table-source').key).viewType!=='table-cell-block'};
  e.repository.redo();await proof.tick();result.redoCaret=e.mounts.get(proof.n('table-source').key).captureInlineSelection();
  e.commands.insert(p('second-paragraph','An independent second paragraph in the first cell.'),{kind:'at',parentKey:proof.cellA,index:1});
  e.commands.insert({id:'whole-list',type:'indented-list-block',children:[p('task-item','A preserved task',{checked:true}),p('list-item','A second list item')]},{kind:'at',parentKey:proof.cellA,index:2});
  e.commands.insert({id:'live-viewer',type:'iframe-block',url:'about:blank'},{kind:'at',parentKey:proof.cellA,index:3});await proof.tick();
  const live=e.mounts.get(proof.n('live-viewer').key).root.querySelector('iframe');await new Promise(r=>setTimeout(r,100));proof.live=live;proof.liveWindow=live.contentWindow;proof.liveDocument=live.contentDocument;live.contentWindow.tableSentinel='viewer-state';
  const other=e.nodeForPlacementInView(proof.cellB,v.viewId);
  e.commands.replaceInlineRange(other.children[0],0,0,'Neighbour paragraph one.');
  e.commands.insert(p('neighbour-two','Neighbour paragraph two, flowing independently.'),{kind:'at',parentKey:proof.cellB,index:1});await proof.tick();
  const cells=e.node(row.key).children.map(k=>e.node(k));result.counts=cells.map(c=>c.children.length);result.cellWidths=cells.map(c=>e.mounts.get(c.key).root.getBoundingClientRect().width);
  result.verticalFlow=cells[0].children.slice(0,3).map(k=>e.mounts.get(k).root.getBoundingClientRect().top);
  result.moveBefore=typeof document.body.moveBefore==='function';
  proof.liveCheck=()=>{const next=e.mounts.get(proof.n('live-viewer').key)?.root.querySelector('iframe');const detail={dom:next===proof.live,window:next.contentWindow===proof.liveWindow,document:next.contentDocument===proof.liveDocument,sentinel:next.contentWindow.tableSentinel==='viewer-state'};proof.mediaTrace??=[];proof.mediaTrace.push(detail);return Object.values(detail).every(Boolean)};
  return result;
 })()`);
 await send('Page.captureScreenshot',{format:'png'},sessionId).then(r=>writeFile(path.join(artifacts,'independent-cell-flow.png'),Buffer.from(r.data,'base64')));
 observations.continuity=await evaluate(`(async()=>{
  const e=proof.editor,key=id=>proof.n(id).key;const results={};
  e.tables.run({kind:'swap-cell',target:key('table-source'),direction:'right'});await proof.tick();results.swap=proof.liveCheck();
  e.repository.undo();await proof.tick();results.undoSwap=proof.liveCheck();
  e.repository.redo();await proof.tick();results.redoSwap=proof.liveCheck();e.repository.undo();await proof.tick();
  e.tables.run({kind:'transfer',targets:[key('live-viewer')],destination:e.nodeForPlacementInView(proof.cellB,proof.view.viewId).key});await proof.tick();results.transfer=proof.liveCheck();
  e.repository.undo();await proof.tick();results.undoTransfer=proof.liveCheck();
  e.tables.run({kind:'dissolve',target:key('table-source')});await proof.tick();results.dissolve=proof.liveCheck();results.listPreserved=proof.n('task-item').payload.checked===true&&proof.view.parentOf(key('task-item')).payload.id==='whole-list';
  e.repository.undo();await proof.tick();results.undoDissolve=proof.liveCheck();
  e.tables.run({kind:'insert-row',target:key('table-source')});await proof.tick();
  e.tables.run({kind:'move-row',target:key('table-source'),direction:'down'});await proof.tick();results.rowMove=proof.liveCheck();
  e.repository.undo();await proof.tick();results.undoRowMove=proof.liveCheck();e.repository.undo();await proof.tick();
  const revision=e.repository.state.revision,stop=e.repository.subscribeBeforeChanges(()=>{throw Error('Injected before-publication failure')});
  try{e.tables.run({kind:'swap-cell',target:key('table-source'),direction:'right'});}catch(error){results.failureRejected=error.message==='Injected before-publication failure';}finally{stop();}
  await proof.tick();results.failureContinuity=proof.liveCheck();results.failureAtomic=e.repository.state.revision===revision;results.noParking= !document.querySelector('[data-table-media-parking]');
  results.trace=proof.mediaTrace;return results;
 })()`);
 observations.typingAfter=await typing();
 observations.structural=await evaluate(`(async()=>{
  const e=proof.editor,v=proof.view,{blockMenuItems}=await import('/src/runtime/block-menu-actions.ts');
  const bench=e.commands.insert({id:'table-benchmark',type:'standoff-editor-block',text:e.mounts.get(proof.text.key).captureText(),standoffProperties:[{id:'bench-bold',type:'style/bold',start:0,end:20}],children:[{id:'bench-group',type:'container-block',children:[{id:'bench-nested',type:'standoff-editor-block',text:'Nested content'}]}]},{kind:'before',anchorKey:proof.anchor});
  const samples={legacy:[],table:[]},preflight=[],snapshots={legacy:0,table:0};
  for(const kind of ['legacy','table'])for(let i=0;i<14;i++){
   const n=e.nodeForPlacementInView(bench,v.viewId),m=e.mounts.get(n.key);e.focus.request(n.key);m.restoreInlineSelection({anchor:100,head:100});await proof.tick();
   const snapshot=e.repository.snapshot.bind(e.repository);let count=0;e.repository.snapshot=(...a)=>{count++;return snapshot(...a)};
   const start=performance.now();let prepared;
   try{if(kind==='table'){prepared=e.tables.prepare({kind:'create',targets:[n.key],columns:2});if(i>=2)preflight.push(performance.now()-start);e.tables.execute(prepared);}else blockMenuItems(e,n.key).find(x=>x.label==='Convert to grid (1 × 2)').run();}
   finally{e.repository.snapshot=snapshot;}
   if(i>=2){samples[kind].push(performance.now()-start);snapshots[kind]+=count;}
   await proof.tick();e.repository.undo();await proof.tick();
  }
  return {samplesPerPath:12,warmupsPerPath:2,selectedCharacters:proof.text.inlineContent.length,documentCharacters:Object.values(v.state.nodes).reduce((s,n)=>s+n.inlineContent.length,0),legacy:proof.stats(samples.legacy),table:proof.stats(samples.table),preflight:proof.stats(preflight),snapshots};
 })()`);
 // Leave the real large paragraph inside a table for the inside-cell typing check.
 await evaluate(`proof.editor.tables.run({kind:'create',targets:[proof.editor.nodeForPlacementInView(proof.text.placementKey,proof.view.viewId).key],columns:2,nested:true})`);
 await evaluate('proof.tick()');observations.typingInside=await typing();
 await writeFile(path.join(artifacts,'increment1.json'),JSON.stringify({observations,errors,realFlintComponents:true,fixture:process.env.BENCHMARK_DOCUMENT_PATH??'Michelangelo letter',directCells:process.env.BENCHMARK_DIRECT_CELLS!=='false',scope:'Increment 1 API, not slash/UI or release qualification'},null,2));
 console.log(JSON.stringify(observations,null,2));
 assert.equal(observations.core.identity,true);assert.equal(observations.core.retainedRoot,true);assert.equal(observations.core.text,'Alpha  Beta');assert.deepEqual(observations.core.caret,{anchor:6,head:6});assert.deepEqual(observations.core.undo.caret,{anchor:9,head:9});assert.equal(observations.core.undo.ordinary,true);assert.deepEqual(observations.core.counts,[4,2]);
 assert.ok(observations.core.verticalFlow.every((y,i,a)=>!i||y>a[i-1]));assert.ok(Object.entries(observations.continuity).filter(([k])=>k!=='trace').every(([,v])=>v===true),'Live viewer state must survive movement and Undo');
 for(const result of [observations.typingBefore,observations.typingAfter,observations.typingInside]){assert.ok(result.restored);assert.equal(result.snapshots,0);assert.equal(result.builds,0);assert.equal(result.requests,0);}
 assert.equal(errors.length,0);await evaluate('proof.dispose();proof.session.dispose()');
}finally{await serviceLoad?.stop();socket?.close();chrome.kill();await vite.close();await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
process.exit(0);
