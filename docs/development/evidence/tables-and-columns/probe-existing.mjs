// Investigation probe: existing grid commands only; no user files are saved.
// Text list keyboard qualification in real Flint, using an in-memory Document.
// Reads the fixture only; never saves it or opens a user vault.
// BENCHMARK_DOCUMENT_PATH selects a native fixture; BENCHMARK_OUTPUT selects artifacts.
import {spawn} from 'node:child_process';
import {mkdtemp, rm, mkdir, writeFile, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
const fixture=await readFile(process.env.BENCHMARK_DOCUMENT_PATH??'vaults/imported/documents/michelangelo-letters/1507-02-13-[a7a41cd3].ink');
const artifacts=process.env.BENCHMARK_OUTPUT??'/tmp/tables-columns-investigation';await mkdir(artifacts,{recursive:true});
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
 const evaluate=async expression=>{if(process.env.AUTOCOMPLETE_TRACE)console.log('EVAL '+expression.slice(0,180));const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value;};
 const wait=condition=>evaluate(`(async()=>{for(let i=0;i<300;i++){if(${condition})return;await new Promise(r=>setTimeout(r,50));}throw Error('Timed out: '+${JSON.stringify(condition)}+'; '+document.querySelector('.autocomplete-workstation')?.textContent+'; active '+document.activeElement?.outerHTML.slice(0,200)+'; query '+document.querySelector('.autocomplete-workstation input')?.value+'; source '+proof.read())})()`);
 await send('Page.bringToFront',{},sessionId);await send('Runtime.enable',{},sessionId);await send('Emulation.setDeviceMetricsOverride',{width:1500,height:990,deviceScaleFactor:1,mobile:false},sessionId);
 await send('Page.navigate',{url:`http://127.0.0.1:${vite.httpServer.address().port}/__flint-integration`},sessionId);
 await wait("window.proof && document.querySelector('.flint-compact .reactive-standoff-flow')");
 await evaluate(`proof.root=proof.host.querySelector('.flint-application');proof.view=[...proof.editor.projections.values()].find(v=>v!==proof.session.projection);proof.text=Object.values(proof.view.state.nodes).filter(n=>n.viewType==='standoff-editor-block').sort((a,b)=>b.inlineContent.length-a.inlineContent.length)[0];proof.mount=proof.editor.mounts.get(proof.text.key);proof.flow=proof.mount.root.querySelector('.reactive-standoff-flow')??proof.mount.root;proof.editor.focus.request(proof.text.key);proof.mount.restoreInlineSelection({anchor:100,head:100});`);

 const observations={};
 observations.conversion=await evaluate(`(async()=>{
  const {blockMenuItems}=await import('/src/runtime/block-menu-actions.ts');proof.menu=blockMenuItems;
  const e=proof.editor,view=proof.view;
  let anchor=proof.text;while(view.parentOf(anchor.key)&&!['document-block','page-block'].includes(view.parentOf(anchor.key).viewType))anchor=view.parentOf(anchor.key);
  proof.anchor=anchor.placementKey;
  proof.p=e.commands.insert({id:'table-probe-source',type:'standoff-editor-block',text:'Annotated original',standoffProperties:[{id:'probe-entity',type:'codex/entity-reference',value:'probe-only',start:0,end:8}],relation:{leftMargin:{id:'probe-margin',type:'left-margin-block',children:[{id:'probe-note',type:'standoff-editor-block',text:'Note'}]}}},{kind:'after',anchorKey:proof.anchor});
  proof.n=()=>e.nodeForPlacementInView(proof.p,view.viewId);proof.original=proof.n().contentKey;
  const mount=e.mounts.get(proof.n().key);mount.focus();mount.restoreInlineSelection({anchor:4,head:4});proof.beforeCaret=mount.captureInlineSelection();proof.beforeRoot=mount.root;
  const snapshot=e.repository.snapshot.bind(e.repository);let count=0;e.repository.snapshot=(...args)=>{count++;return snapshot(...args)};
  try{proof.menu(e,proof.n().key).find(i=>i.label==='Convert to grid (1 × 2)').run();}finally{e.repository.snapshot=snapshot;}
  await Promise.resolve();
  const item=proof.n(),cell=view.parentOf(item.key),row=view.parentOf(cell.key),grid=view.parentOf(row.key),newMount=e.mounts.get(item.key);
  proof.grid=grid.placementKey;
  return {sourceIdentityPreserved:item.contentKey===proof.original,placementPreserved:item.placementKey===proof.p,annotation:JSON.parse(JSON.stringify(item.payload.standoffProperties)),ownedRelations:Object.keys(item.ownedRelations),shape:[grid.viewType,row.viewType,cell.viewType],columns:row.children.length,retainedDom:newMount.root===proof.beforeRoot,caretBefore:proof.beforeCaret,caretAfter:newMount.captureInlineSelection(),snapshots:count,cellSelectable:e.blockSelection.eligible(cell.key),rowSelectable:e.blockSelection.eligible(row.key)};
 })()`);
 observations.history=await evaluate(`(()=>{const e=proof.editor,v=proof.view;e.repository.undo();const ordinary=v.parentOf(proof.n().key).viewType!=='grid-cell-block';e.repository.redo();return {oneUndoRestoresOrdinary:ordinary,redoRestoresGrid:v.parentOf(proof.n().key).viewType==='grid-cell-block',sourceIdentityPreserved:proof.n().contentKey===proof.original};})()`);
 observations.native=await evaluate(`(async()=>{const {captureNative,nativeText,admitNative}=await import('/src/persistence/native-resource.ts');const {ReactiveEditor}=await import('/src/reactive-editor/editor.ts');const bytes=new TextEncoder().encode(nativeText(captureNative(proof.editor.repository.readState(),${JSON.stringify(JSON.parse(fixture).resourceId)})));const e=new ReactiveEditor({type:'workspace-object-bank-block',children:[]});try{const s=e.repository.readState();admitNative(e.repository,bytes,s.placements[s.rootPlacementKey].contentKey);const item=Object.values(e.repository.readState().contents).find(c=>c.payload.id==='table-probe-source');return {sourceFound:!!item,annotation:JSON.parse(JSON.stringify(item.payload.standoffProperties)),ownedRelations:Object.keys(item.ownedRelations)};}finally{e.dispose();}})()`);
 observations.menu=await evaluate(`(()=>{const e=proof.editor,view=proof.view,cell=(id,text)=>({id,type:'grid-cell-block',children:[{id:id+'text',type:'standoff-editor-block',text}]}),row=(id,cells)=>({id,type:'grid-row-block',children:cells});
  proof.fixture=e.commands.insert({id:'probe-outer',type:'grid-block',children:[row('probe-row',[cell('probe-c1','Short'),cell('probe-c2','A long cell with enough ordinary prose to show automatic table sizing and the impact of unequal content lengths.'),cell('probe-c3','Third'),{id:'probe-c4',type:'grid-cell-block',children:[{id:'probe-inner',type:'grid-block',children:[row('probe-inner-row',[cell('probe-inner-cell','Nested grid')])]}]}])]},{kind:'after',anchorKey:proof.grid});
  proof.fixtureNode=()=>e.nodeForPlacementInView(proof.fixture,view.viewId);const cells=proof.fixtureNode().children.flatMap(k=>e.node(k).children).map(k=>e.node(k));proof.measure=()=>{const root=e.mounts.get(proof.fixtureNode().key).root;return {tableWidth:root.getBoundingClientRect().width,tableLayout:getComputedStyle(root).tableLayout,cells:cells.map(c=>e.mounts.get(c.key).root.getBoundingClientRect().width),rowHeights:proof.fixtureNode().children.map(k=>e.mounts.get(k).root.getBoundingClientRect().height)}};
  return {nestedGridRendered:!!view.nodeForPlacement(view.state.nodes[cells[3].children[0]].placementKey),directCells:cells.length};})()`);
 await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
 observations.wide=await evaluate('proof.measure()');
 await send('Page.captureScreenshot',{format:'png'},sessionId).then(r=>writeFile(path.join(artifacts,'existing-grid-wide.png'),Buffer.from(r.data,'base64')));
 await evaluate(`proof.editor.mounts.get(proof.fixtureNode().key).root.style.width='440px'`);
 await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
 observations.constrained=await evaluate('proof.measure()');
 observations.dissolve=await evaluate(`(()=>{const e=proof.editor,view=proof.view;proof.menu(e,proof.fixtureNode().key).find(i=>i.label==='Grids').children.find(i=>i.label==='Destructure grid').run();const nestedSurvives=Object.values(view.state.nodes).some(n=>n.payload.id==='probe-inner');e.repository.undo();return {nestedGridSurvives:nestedSurvives,undoRestoresNestedGrid:Object.values(view.state.nodes).some(n=>n.payload.id==='probe-inner')};})()`);
 await writeFile(path.join(artifacts,'observations.json'),JSON.stringify({observations,errors,realFlintComponents:true,scope:'Existing functionality only; no feature implementation'},null,2));
 console.log(JSON.stringify(observations,null,2));
 assert.equal(observations.conversion.sourceIdentityPreserved,true);assert.equal(observations.history.oneUndoRestoresOrdinary,true);assert.equal(errors.length,0);
 await evaluate('proof.dispose();proof.session.dispose()');
}finally{await serviceLoad?.stop();socket?.close();chrome.kill();await vite.close();await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
process.exit(0);
