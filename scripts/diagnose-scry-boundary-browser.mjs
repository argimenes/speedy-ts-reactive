// Bounded real-Flint Scry boundary diagnosis. Reads one native fixture into memory.
// No saves, load generation, or canonical service writes.
import {spawn} from 'node:child_process';
import {mkdtemp, rm, mkdir, writeFile, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
const fixturePath=process.env.BENCHMARK_DOCUMENT_PATH??'vaults/imported/documents/edgar-allan-poe/masque-of-the-red-death-[1c48f303].ink';
const fixture=await readFile(fixturePath);
const artifacts=process.env.BENCHMARK_OUTPUT??'/tmp/scry-boundary-profile';await mkdir(artifacts,{recursive:true});
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
 window.proof={editor,session,dispose,host,native};
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
 const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const n=++id;const timer=setTimeout(()=>{pending.delete(n);reject(Error('CDP timeout '+method));},60000);pending.set(n,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});socket.send(JSON.stringify({id:n,method,params,...(sessionId?{sessionId}:{})}));});
 const {targetId}=await send('Target.createTarget',{url:'about:blank'}),{sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
 const evaluate=async expression=>{if(process.env.AUTOCOMPLETE_TRACE)console.log('EVAL '+expression.slice(0,180));const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value;};
 const wait=condition=>evaluate(`(async()=>{for(let i=0;i<300;i++){if(${condition})return;await new Promise(r=>setTimeout(r,50));}throw Error('Timed out: '+${JSON.stringify(condition)}+'; '+document.querySelector('.autocomplete-workstation')?.textContent+'; active '+document.activeElement?.outerHTML.slice(0,200)+'; query '+document.querySelector('.autocomplete-workstation input')?.value+'; source '+proof.read())})()`);
 await send('Page.bringToFront',{},sessionId);await send('Runtime.enable',{},sessionId);await send('Emulation.setDeviceMetricsOverride',{width:1500,height:990,deviceScaleFactor:1,mobile:false},sessionId);
 await send('Page.navigate',{url:`http://127.0.0.1:${vite.httpServer.address().port}/__flint-integration`},sessionId);
 await wait("window.proof && document.querySelector('.flint-compact .reactive-standoff-flow')");
 await evaluate(`proof.root=proof.host.querySelector('.flint-application');proof.view=[...proof.editor.projections.values()].find(v=>v!==proof.session.projection);proof.text=Object.values(proof.view.state.nodes).filter(n=>n.viewType==='standoff-editor-block'&&proof.editor.mounts.get(n.key)).sort((a,b)=>b.inlineContent.length-a.inlineContent.length)[0];proof.mount=proof.editor.mounts.get(proof.text.key);proof.flow=proof.mount.root.querySelector('.reactive-standoff-flow')??proof.mount.root;proof.editor.focus.request(proof.text.key);proof.mount.restoreInlineSelection({anchor:100,head:100});`);
 const checks=[];
 const check=(name,value)=>{assert.ok(value,name);checks.push(name);console.log('PASS '+name);};
 await evaluate(`(async()=>{
  const {registerStandaloneEntityService}=await import('/src/application/entity-service.ts');
  const entities=[{id:'11111111-1111-4111-8111-111111111111',name:'Leonardo da Vinci',revision:0,aliases:[]},{id:'22222222-2222-4222-8222-222222222222',name:'Michelangelo',revision:0,aliases:[]}];
  proof.entities=entities;proof.created=[];proof.aliasWrites=[];proof.requests=0;proof.serviceOpened=0;proof.serviceClosed=0;proof.stopEntity=registerStandaloneEntityService(proof.editor,()=>{proof.serviceOpened++;return({historyScope:async()=>'qualification',names:async()=>entities,dbMentions:async()=>[],summaries:async()=>({rows:[],complete:true,diagnostics:[]}),get:async id=>{if(proof.holdGet)await new Promise(r=>proof.releaseGet=r);return entities.find(e=>e.id===id);},create:async input=>{const entity={id:input.id,name:input.name,revision:0,aliases:[]};entities.push(entity);proof.created.push(input);return entity;},alias:async input=>{const entity=entities.find(e=>e.id===input.entityId);entity.aliases.push({id:input.id,name:input.name,revision:0,origin:'authored'});proof.aliasWrites.push(input);return entity;},search:async(q,signal)=>{proof.requests++;await new Promise(r=>setTimeout(r,q.query==='old'?400:20));return {candidates:entities.filter(e=>e.name.toLowerCase().includes(q.query.toLowerCase())).map(e=>({...e,evidence:[{kind:'name',text:e.name}]})),complete:true,diagnostics:[],current(){signal.throwIfAborted();}};},dispose(){proof.serviceClosed++;}});});
  proof.read=()=>proof.text.inlineContent.map(k=>String(proof.editor.node(k).payload.text??'')).join('');
  proof.reset=(text='')=>{proof.editor.completionInput.cancel();proof.editor.commands.replaceInlineRange(proof.text.key,0,proof.text.inlineContent.length,text);proof.editor.focus.request(proof.text.key);proof.mount.restoreInlineSelection({anchor:[...text].length,head:[...text].length});};
  proof.original=proof.read();
 })()`);
 const type=async text=>{for(const c of text)await send('Input.insertText',{text:c},sessionId);};
 const key=async(key,modifiers=0)=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key,modifiers,...(key==='a'&&modifiers===4?{commands:['selectAll']}:{}),windowsVirtualKeyCode:({Enter:13,Escape:27,ArrowDown:40,ArrowUp:38,ArrowLeft:37,ArrowRight:39,Home:36,End:35,Backspace:8,Delete:46,Tab:9})[key]??key.toUpperCase().charCodeAt(0)},sessionId);await send('Input.dispatchKeyEvent',{type:'keyUp',key,modifiers},sessionId);};


 // Bounded diagnosis: one source, four boundary keys and two ordinary text edits.
 // Preserve the real paragraph and annotations; no saves or canonical service writes.
 await evaluate(`(()=>{
  proof.records=[];proof.phase='setup';proof.restores=[];
  const wrap=(object,name,label=name)=>{const original=object[name];if(typeof original!=='function')return;object[name]=function(...args){const begin=performance.now();try{return original.apply(this,args);}finally{proof.records.push({phase:proof.phase,name:label,ms:performance.now()-begin});}};proof.restores.push(()=>object[name]=original);};
  wrap(proof.editor.repository,'snapshot');wrap(proof.editor.repository,'commit');
  for(const name of ['transaction','replaceInlineRange','pruneUnreachable','diff','publish'])wrap(proof.editor.commands,name);
  wrap(proof.editor.completionInput,'key','completion.key');
  const refs=(proof.text.payload.standoffProperties??[]).filter(p=>!p.isDeleted&&p.type==='codex/entity-reference');
  const chars=[...proof.original];let at=0;
  while(at<chars.length-80&&(!/^[A-Za-z]$/.test(chars[at])||(at>0&&!/\\s/.test(chars[at-1]))||refs.some(p=>p.start<at+80&&p.end>=at)))at++;
  if(at>=chars.length-80)throw Error('No unannotated source gap');
  proof.at=at;proof.editor.focus.request(proof.text.key);proof.mount.restoreInlineSelection({anchor:at,head:at});
  proof.stats={sourceCells:chars.length,sourceAt:at,contents:Object.keys(proof.editor.repository.readState().contents).length,placements:Object.keys(proof.editor.repository.readState().placements).length};
  proof.longTasks=[];proof.observer=new PerformanceObserver(list=>{for(const e of list.getEntries())proof.longTasks.push({start:e.startTime,ms:e.duration});});proof.observer.observe({type:'longtask'});
 })()`);
 console.log('Fixture',fixturePath,await evaluate('proof.stats'));
 if(process.argv.includes('--inline-bracket-proof')||process.argv.includes('--presentation-cell-proof')) {
  // Isolated DOM experiment: no production Scry code or document is changed.
  const presentationProof=process.argv.includes('--presentation-cell-proof');
  if(presentationProof)await evaluate(`(async()=>{proof.ProvisionalCells=(await import('/src/features/autocomplete/provisional-cells.ts')).ProvisionalCells})()`);
  const result=await evaluate(`(()=>{
   const cells=Array.from(proof.flow.children),selection=document.getSelection();
   const originalChildren=Array.from(proof.flow.childNodes),originalText=proof.flow.textContent;
   const revision=proof.editor.repository.state.revision,keys=[...proof.text.inlineContent];
   const undo=proof.editor.repository.canUndo(),redo=proof.editor.repository.canRedo();
   const markers=['((', '))'].map(text=>{const span=document.createElement('span');span.textContent=text;span.contentEditable='false';span.dataset.scryPrototype='true';span.style.color='#7d3cc8';return span;});
   const boundary=index=>index<cells.length?{node:cells[index].firstChild,offset:0}:{node:cells.at(-1).firstChild,offset:cells.at(-1).textContent.length};
   const draft=${presentationProof}?new proof.ProvisionalCells(cells.map((cell,i)=>({key:proof.text.inlineContent[i],text:cell.textContent,canonicalIndex:i})),proof.at,proof.at+5,'mention'):undefined;
   if(draft)proof.mount.presentProvisional(draft);
   const move=(start,end)=>{if(draft){draft.boundaries(start,end);proof.mount.restoreInlineSelection({anchor:end,head:end});return;}markers[0].remove();markers[1].remove();proof.flow.insertBefore(markers[0],cells[start]??null);proof.flow.insertBefore(markers[1],cells[end]??null);const at=boundary(end);selection.setPosition(at.node,at.offset);};
   proof.records=[];proof.phase='literal-bracket-proof';
   move(proof.at,proof.at+5);
   const visible=proof.flow.textContent===originalText.slice(0,proof.at)+'(('+originalText.slice(proof.at,proof.at+5)+'))'+originalText.slice(proof.at+5);
   // Demonstrate the existing mount assumption that must be fixed before release.
   const rawCaptureIncludesMarkers=proof.mount.captureText().includes('((');
   const boundaryMismatch=proof.mount.inlineBoundary(proof.at).node!==cells[proof.at].firstChild;
   for(const [start,end] of [[proof.at,proof.at+6],[proof.at,proof.at+12],[proof.at+1,proof.at+12],[proof.at,proof.at+5]])move(start,end);
   const mappedCaret=draft?proof.mount.captureInlineSelection().head===proof.at+5:selection.anchorNode===cells[proof.at+5].firstChild&&selection.anchorOffset===0;
   const records=[...proof.records];
   const unchanged=proof.editor.repository.state.revision===revision&&keys.every((k,i)=>proof.text.inlineContent[i]===k)&&proof.read()===proof.original;
   const historyUnchanged=undo===proof.editor.repository.canUndo()&&redo===proof.editor.repository.canRedo();
   proof.removePrototype=()=>{if(draft)proof.mount.presentProvisional(undefined);markers.forEach(m=>m.remove());};
   proof.prototypeRestored=()=>originalChildren.length===proof.flow.childNodes.length&&originalChildren.every((c,i)=>proof.flow.childNodes[i]===c)&&proof.flow.textContent===originalText;
   return {visible,mappedCaret,unchanged,historyUnchanged,rawCaptureIncludesMarkers,boundaryMismatch,records,sourceCells:cells.length,scope:'Literal bracket rendering and boundary movement only; draft typing, annotations, history suspension and Save gating are not implemented.'};
  })()`);
  check('literal in-flow brackets appear in the actual Flint TextBlock',result.visible);
  check('moving brackets preserves canonical content, occurrence keys and history',result.unchanged&&result.historyUnchanged);
  check('explicit endpoint mapping preserves a canonical caret',result.mappedCaret);
  check('bracket movement calls no snapshots, commits, transactions or replacement commands',result.records.length===0);
  if(presentationProof)check('mount text capture and caret endpoints exclude provisional markers',!result.rawCaptureIncludesMarkers&&!result.boundaryMismatch);
  else check('existing raw mount mapping demonstrably needs adaptation',result.rawCaptureIncludesMarkers&&result.boundaryMismatch);
  const {data}=await send('Page.captureScreenshot',{format:'png'},sessionId);
  await writeFile(path.join(artifacts,presentationProof?'presentation-cell-proof.png':'literal-bracket-proof.png'),Buffer.from(data,'base64'));
  await evaluate('proof.removePrototype()');
  check('removal restores the exact original DOM nodes',await evaluate('proof.prototypeRestored()'));
  check('no uncaught browser exceptions',errors.length===0);
  await writeFile(path.join(artifacts,presentationProof?'presentation-cell-proof.json':'literal-bracket-proof.json'),JSON.stringify({fixturePath,result,checks,errors},null,2));
 } else if(process.argv.includes('--provisional-input-proof')) {
  await evaluate(`proof.reset('');proof.records=[];proof.startRevision=proof.editor.repository.state.revision;proof.entities.push({id:'33333333-3333-4333-8333-333333333333',name:'Florence',revision:0,aliases:[]})`);
  await type('[[');await wait("document.querySelector('.autocomplete-workstation')");await type('Flo');
  check('typing remains provisional and renders actual cells',await evaluate(`proof.read()===''&&proof.flow.textContent==='[[Flo]]'&&proof.editor.repository.state.revision===proof.startRevision`));
  check('active source typing has no canonical operations',await evaluate(`proof.records.every(r=>r.name==='completion.key')`));
  await evaluate(`proof.editor.repository.undo();proof.editor.repository.redo()`);await key('z',4);
  check('shared and keyboard history are suspended',await evaluate(`!proof.editor.repository.canUndo()&&!proof.editor.repository.canRedo()&&proof.flow.textContent==='[[Flo]]'&&!!document.querySelector('.autocomplete-workstation')`));
  await key('Escape');await wait("!document.querySelector('.autocomplete-workstation')");
  check('Escape keeps Flo without markers in one native action',await evaluate(`proof.read()==='Flo'&&proof.flow.textContent==='Flo'&&proof.records.filter(r=>r.name==='commit').length===1`));
  await evaluate(`proof.editor.repository.undo()`);check('Undo restores the pre-Scry phrase',await evaluate(`proof.read()===''`));
  await evaluate(`proof.editor.repository.redo()`);check('Redo restores plain text without markers',await evaluate(`proof.read()==='Flo'&&proof.flow.textContent==='Flo'`));
  await evaluate(`proof.reset('');proof.records=[]`);await type('[[');await wait("document.querySelector('.autocomplete-workstation')");await type('Flo');
  await wait("[...document.querySelectorAll('.reactive-entity-search tr')].some(r=>r.textContent.includes('Florence')&&r.querySelector('button'))");
  await evaluate(`[...document.querySelectorAll('.reactive-entity-search tr')].find(r=>r.textContent.includes('Florence')&&r.querySelector('button')).querySelector('button').click()`);
  await wait("!document.querySelector('.autocomplete-workstation')");
  check('actual LER autocomplete commits canonical name and annotation together',await evaluate(`proof.read()==='Florence'&&proof.text.payload.standoffProperties.some(p=>p.value==='33333333-3333-4333-8333-333333333333')&&proof.records.filter(r=>r.name==='commit').length===1`));
  await evaluate(`proof.editor.repository.undo()`);check('one Undo removes both completion and annotation',await evaluate(`proof.read()===''&&!(proof.text.payload.standoffProperties??[]).length`));
  await evaluate(`proof.editor.repository.redo()`);check('one Redo restores completion and annotation',await evaluate(`proof.read()==='Florence'&&proof.text.payload.standoffProperties.length===1`));
  await evaluate(`proof.reset('');proof.records=[]`);await type('((');await wait("document.querySelector('.autocomplete-workstation')");await type('Flo');
  await wait("[...document.querySelectorAll('.reactive-entity-search tr')].some(r=>r.textContent.includes('Florence')&&r.querySelector('button'))");
  await evaluate(`[...document.querySelectorAll('.reactive-entity-search tr')].find(r=>r.textContent.includes('Florence')&&r.querySelector('button')).querySelector('button').click()`);await wait("!document.querySelector('.autocomplete-workstation')");
  check('mention confirmation keeps authored wording',await evaluate(`proof.read()==='Flo'&&proof.text.payload.standoffProperties.length===1`));
  await evaluate(`proof.reset('');proof.records=[]`);await type('((');await wait("document.querySelector('.autocomplete-workstation')");
  await send('Input.imeSetComposition',{text:'東',selectionStart:1,selectionEnd:1},sessionId);
  await send('Input.insertText',{text:'東京'},sessionId);
  check('native IME composition stays provisional',await evaluate(`proof.read()===''&&proof.flow.textContent==='((東京))'&&proof.records.every(r=>r.name==='completion.key')`));
  await key('Escape');check('IME cancellation keeps the composed phrase',await evaluate(`proof.read()==='東京'`));
  await evaluate(`proof.reset('');proof.records=[]`);await type('((');await wait("document.querySelector('.autocomplete-workstation')");
  await evaluate(`(()=>{const data=new DataTransfer();data.setData('text/plain','é😀');proof.flow.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data}));})()`);
  check('plain-text paste is provisional and Unicode-safe',await evaluate(`proof.read()===''&&proof.flow.textContent==='((é😀))'`));
  await evaluate(`(()=>{proof.mount.restoreInlineSelection({anchor:0,head:3});const data=new DataTransfer();proof.flow.dispatchEvent(new ClipboardEvent('copy',{bubbles:true,cancelable:true,clipboardData:data}));proof.copied=data.getData('text/plain')})()`);
  check('copy excludes markers and includes draft text',await evaluate(`proof.copied==='é😀'`));await key('Escape');
  await evaluate(`proof.reset('');proof.records=[]`);await type('((');await wait("document.querySelector('.autocomplete-workstation')");await type('draft');
  await evaluate(`proof.oldConfirm=window.confirm;window.confirm=()=>false;proof.saveBefore=proof.editor.repository.state.revision;try{proof.editor.persistence.captureWorkspace()}catch(e){proof.saveError=e.message}window.confirm=proof.oldConfirm`);
  check('non-keyboard Workspace Save is blocked before capture',await evaluate(`proof.saveError.includes('Scry')&&proof.read()===''&&proof.editor.repository.state.revision===proof.saveBefore`));
  await key('Escape');
  await evaluate(`proof.reset('');proof.records=[]`);await type('((');await wait("document.querySelector('.autocomplete-workstation')");await type('retained');
  await evaluate(`proof.owner=proof.editor.windowManager.ownerForNode(proof.text.key);proof.editor.windowManager.lifecycle.minimize(proof.owner)`);await wait("!document.querySelector('.autocomplete-workstation')");
  check('owner minimization keeps draft text and releases history guard',await evaluate(`proof.read()==='retained'&&proof.editor.repository.canUndo()`));
  await evaluate(`proof.editor.windowManager.lifecycle.reveal(proof.owner);proof.reset('')`);await type('((');await wait("document.querySelector('.autocomplete-workstation')");await type('draft');
  await evaluate(`proof.editor.commands.replaceInlineRange(proof.text.key,0,0,'newer');proof.oldConfirm=window.confirm;window.confirm=()=>false`);
  await key('Escape');check('stale source remains available for copying without overwriting newer text',await evaluate(`proof.read()==='newer'&&proof.flow.textContent==='((draft))'&&!!document.querySelector('.autocomplete-workstation')&&!proof.editor.repository.canUndo()`));
  await evaluate(`window.confirm=()=>true`);await key('Escape');await evaluate(`window.confirm=proof.oldConfirm`);
  check('explicit stale-draft discard reveals newer text and releases history',await evaluate(`proof.read()==='newer'&&proof.flow.textContent==='newer'&&proof.editor.repository.canUndo()`));
  await evaluate(`proof.reset('')`);await type('((');await wait("document.querySelector('.autocomplete-workstation')");await type('on close');
  await evaluate(`proof.closedContent=proof.text.contentKey;proof.root.querySelector('.flint-brand').click();[...proof.root.querySelectorAll('.flint-menu button')].find(b=>b.textContent==='Close tab').click()`);
  await wait("!document.querySelector('.autocomplete-workstation')");
  check('actual Flint tab close preserves draft text in canonical content and releases history',await evaluate(`(()=>{const r=proof.editor.repository.state,c=r.contents[proof.closedContent];return c.inlineContent.map(k=>r.contents[r.placements[k].contentKey].payload.text).join('')==='on close'&&proof.editor.repository.canUndo()})()`));
  check('no uncaught browser exceptions',errors.length===0);
  await writeFile(path.join(artifacts,'provisional-input-proof.json'),JSON.stringify({checks,errors,records:await evaluate('proof.records')},null,2));
 } else {
 await evaluate("proof.phase='open'");await type('((');await wait("document.querySelector('.reactive-entity-search')");
 await evaluate(`(()=>{const data=proof.editor.overlays.overlays.find(o=>o.viewType==='autocomplete').data;proof.scry=data.session;const api=data.api;for(const name of ['documentAnnotations','text','scope']){const old=api[name];api[name]=function(...args){const start=performance.now();try{return old.apply(this,args);}finally{proof.records.push({phase:proof.phase,name:'api.'+name,ms:performance.now()-start});}};}})()`);
 await evaluate('new Promise(r=>setTimeout(r,350))');
 const measurements=[];
 for(const [name,arrow,mods] of [['end-word-right','ArrowRight',2],['end-word-left','ArrowLeft',2],['end-character-right','ArrowRight',10],['end-character-left','ArrowLeft',10],['source-type',null,0],['source-backspace','Backspace',0]]){
  await evaluate(`proof.phase=${JSON.stringify(name)};proof.records=[];proof.longTasks=[];proof.requestsBefore=proof.requests;proof.revisionBefore=proof.editor.repository.state.revision;proof.cellsBefore=[...proof.text.inlineContent];proof.before=performance.now();proof.timerLag=undefined;setTimeout(()=>proof.timerLag=performance.now()-proof.before,0)`);
  if(name==='end-word-right'){await send('Profiler.enable',{},sessionId);await send('Profiler.start',{},sessionId);}
  if(arrow)await key(arrow,mods);else await type('x');
  const settled=await evaluate(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(performance.now()-proof.before))))`);
  if(name==='end-word-right'){const {profile:cpu}=await send('Profiler.stop',{},sessionId);await writeFile(path.join(artifacts,'boundary.cpuprofile'),JSON.stringify(cpu));}
  await evaluate('new Promise(r=>setTimeout(r,300))');
  const measurement=await evaluate(`({name:proof.phase,records:proof.records,longTasks:proof.longTasks,requests:proof.requests-proof.requestsBefore,timerLag:proof.timerLag,active:proof.scry.alive,revisionChanged:proof.editor.repository.state.revision!==proof.revisionBefore,cellsChanged:proof.cellsBefore.length!==proof.text.inlineContent.length||proof.cellsBefore.some((k,i)=>k!==proof.text.inlineContent[i]),range:{start:proof.scry.source.start,end:proof.scry.source.end},error:document.querySelector('.autocomplete-workstation [role=alert]')?.textContent})`);
  measurements.push({...measurement,twoFramesMs:settled});console.log(JSON.stringify(measurements.at(-1)));
 }
 const output={fixturePath,stats:await evaluate('proof.stats'),measurements,errors,isolatedResolver:true,realFlintComponents:true};
 await writeFile(path.join(artifacts,'boundary-results.json'),JSON.stringify(output,null,2));
 }
 await evaluate('proof.observer.disconnect();proof.restores.reverse().forEach(f=>f());proof.stopEntity();proof.dispose();proof.session.dispose()');
}finally{await serviceLoad?.stop();socket?.close();chrome.kill();await vite.close();await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
process.exit(0);
