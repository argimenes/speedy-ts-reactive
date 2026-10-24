// Real-Flint whole-word selection checks. Reads one native fixture into memory.
// No saves, load generation, or canonical service writes.
import {spawn} from 'node:child_process';
import {mkdtemp, rm, mkdir, writeFile, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
const fixturePath=process.env.BENCHMARK_DOCUMENT_PATH??'vaults/imported/documents/edgar-allan-poe/masque-of-the-red-death-[1c48f303].ink';
const fixture=await readFile(fixturePath);
const artifacts=process.env.BENCHMARK_OUTPUT??'/tmp/word-selection-proof';await mkdir(artifacts,{recursive:true});
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
let socket;
try{
 const endpoint=await new Promise((resolve,reject)=>{let out='';chrome.stderr.on('data',b=>{out+=b;const m=out.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(m)resolve(m[1]);});chrome.once('error',reject);setTimeout(()=>reject(Error('Chrome timeout')),15000).unref();});
 socket=new WebSocket(endpoint);await new Promise(r=>socket.addEventListener('open',r,{once:true}));
 let id=0;const pending=new Map(),errors=[];
 socket.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);});
 const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const n=++id;const timer=setTimeout(()=>{pending.delete(n);reject(Error('CDP timeout '+method));},60000);pending.set(n,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});socket.send(JSON.stringify({id:n,method,params,...(sessionId?{sessionId}:{})}));});
 const {targetId}=await send('Target.createTarget',{url:'about:blank'}),{sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
 const evaluate=async expression=>{if(process.env.AUTOCOMPLETE_TRACE)console.log('EVAL '+expression.slice(0,180));const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value;};
 const wait=condition=>evaluate(`(async()=>{for(let i=0;i<300;i++){if(${condition})return;await new Promise(r=>setTimeout(r,50));}throw Error('Timed out: '+${JSON.stringify(condition)})})()`);
 await send('Page.bringToFront',{},sessionId);await send('Runtime.enable',{},sessionId);await send('Emulation.setDeviceMetricsOverride',{width:1500,height:990,deviceScaleFactor:1,mobile:false},sessionId);
 await send('Page.navigate',{url:`http://127.0.0.1:${vite.httpServer.address().port}/__flint-integration`},sessionId);
 await wait("window.proof && document.querySelector('.flint-compact .reactive-standoff-flow')");
 await evaluate(`proof.root=proof.host.querySelector('.flint-application');proof.view=[...proof.editor.projections.values()].find(v=>v!==proof.session.projection);proof.text=Object.values(proof.view.state.nodes).filter(n=>n.viewType==='standoff-editor-block'&&proof.editor.mounts.get(n.key)).sort((a,b)=>b.inlineContent.length-a.inlineContent.length)[0];proof.mount=proof.editor.mounts.get(proof.text.key);proof.flow=proof.mount.root.querySelector('.reactive-standoff-flow')??proof.mount.root;proof.editor.focus.request(proof.text.key);proof.mount.restoreInlineSelection({anchor:100,head:100});`);
 const checks=[];
 const check=(name,value)=>{assert.ok(value,name);checks.push(name);console.log('PASS '+name);};

 await evaluate(`proof.original='Alpha bravo charlie delta echo café e\u0301clair 👩‍👩‍👧‍👦 東京';proof.editor.commands.replaceInlineRange(proof.text.key,0,proof.text.inlineContent.length,proof.original);proof.flow.style.maxWidth='260px';proof.flow.scrollIntoView({block:'center'});proof.counts={snapshot:0,commit:0,restore:0};for(const name of ['snapshot','commit']){const fn=proof.editor.repository[name].bind(proof.editor.repository);proof.editor.repository[name]=(...args)=>{proof.counts[name]++;return fn(...args)}}const restore=proof.mount.restoreInlineSelection.bind(proof.mount);proof.mount.restoreInlineSelection=r=>{proof.counts.restore++;return restore(r)};proof.selected=()=>proof.editor.crossText.range()?proof.editor.crossText.selectedText():getSelection().toString()`);
 const point=async index=>evaluate(`(()=>{const r=proof.flow.children[${index}].getBoundingClientRect();return {x:r.left+r.width*.75,y:r.top+r.height/2}})()`);
 const mouse=async(type,p,count=1)=>{await send('Input.dispatchMouseEvent',{type,...p,button:type==='mouseMoved'?'none':'left',buttons:type==='mouseReleased'?0:1,clickCount:count},sessionId);if(type==='mouseMoved')await evaluate('new Promise(r=>requestAnimationFrame(r))');};
 const hold=async index=>{const p=await point(index);await mouse('mouseMoved',p);await mouse('mousePressed',p);await mouse('mouseReleased',p);await mouse('mousePressed',p,2);return p;};
 for(const enabled of [false,true]){
  await evaluate(`proof.editor.crossText.enable(${enabled});proof.counts.snapshot=proof.counts.commit=0`);
  let p=await hold(8);
  check(`double-click selects bravo (cross selection ${enabled})`,await evaluate(`proof.selected()==='bravo'`));
  await evaluate('proof.beforeRestore=proof.counts.restore');
  for(let i=0;i<5;i++)await mouse('mouseMoved',await point(9));
  check('moving within the same word does not rewrite the selection',await evaluate('proof.beforeRestore===proof.counts.restore'));
  await mouse('mouseMoved',await point(20));check('held second click extends by whole words across wrapping',await evaluate(`proof.selected()==='bravo charlie delta'`));
  await mouse('mouseMoved',await point(1));check('dragging backwards includes the entire original word',await evaluate(`proof.selected()==='Alpha bravo'`));
  await mouse('mouseMoved',await point(14));check('reversing direction shrinks to whole words',await evaluate(`proof.selected()==='bravo charlie'`));
  await mouse('mouseReleased',await point(14),2);check('release preserves the selected words',await evaluate(`proof.selected()==='bravo charlie'`));
  check('word gestures perform no repository snapshots or commits',await evaluate('proof.counts.snapshot===0&&proof.counts.commit===0'));
  p=await hold([...('Alpha bravo charlie delta echo café ')].length+2);await mouse('mouseReleased',p,2);
  check('combining characters remain in their complete word',await evaluate(`proof.selected()==='éclair'`));
  p=await hold([...('Alpha bravo charlie delta echo café éclair ')].length);await mouse('mouseReleased',p,2);
  check('family emoji is selected as a complete unit',await evaluate(`proof.selected()==='👩‍👩‍👧‍👦'`));
 }
 await evaluate(`proof.nextPlacement=proof.editor.commands.insert({type:'standoff-editor-block',text:'Foxtrot golf hotel'},{kind:'after',anchorKey:proof.text.key});proof.nextNode=proof.editor.nodeForPlacementInView(proof.nextPlacement,proof.text.viewId);proof.nextFlow=proof.editor.mounts.get(proof.nextNode.key).focusElement;proof.flow.scrollIntoView({block:'center'})`);
 const nextPoint=()=>evaluate(`(()=>{const r=proof.nextFlow.children[2].getBoundingClientRect();return{x:r.left+r.width*.75,y:r.top+r.height/2}})()`);
 await hold(8);await mouse('mouseMoved',await nextPoint());
 check('word dragging extends into an adjacent Block when cross-Block selection is enabled',await evaluate(`proof.selected()===proof.original.slice(6)+'\\nFoxtrot'`));
 await mouse('mouseReleased',await nextPoint(),2);
 const a=await point(8),b=await point(14);await mouse('mousePressed',a);await mouse('mouseMoved',b);await mouse('mouseReleased',b);
 check('ordinary single-click dragging still selects by character',await evaluate(`proof.mount.captureInlineSelection().anchor===9&&proof.mount.captureInlineSelection().head===15`));
 await hold(8);await mouse('mouseMoved',await point(14));await mouse('mouseReleased',await point(14),2);
 await send('Input.insertText',{text:'replacement'},sessionId);
 check('typing replaces precisely the selected whole words',await evaluate(`proof.mount.captureText()===proof.original.replace('bravo charlie','replacement')`));
 await evaluate('proof.editor.repository.undo()');check('Undo restores the text in one action',await evaluate('proof.mount.captureText()===proof.original'));
 await hold(8);await evaluate(`window.dispatchEvent(new Event('blur'))`);await mouse('mouseMoved',await point(20));await mouse('mouseReleased',await point(20));
 check('window blur releases word dragging',await evaluate(`proof.selected()==='bravo'`));
 check('no browser exceptions',errors.length===0);
 await writeFile(path.join(artifacts,'word-selection.json'),JSON.stringify({checks,errors},null,2));
 await send('Page.captureScreenshot',{format:'png'},sessionId).then(r=>writeFile(path.join(artifacts,'word-selection.png'),Buffer.from(r.data,'base64')));
 await evaluate('proof.dispose();proof.session.dispose()');
}finally{socket?.close();chrome.kill();await vite.close();await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
process.exit(0);
