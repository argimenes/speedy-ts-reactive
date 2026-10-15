// Profile typing in the real Flint shell using an in-memory copy of a native Document.
// Reads the fixture only; never saves it. BENCHMARK_DOCUMENT_PATH selects another
// native resource; BENCHMARK_VAULT_SIZE adds unopened entries to an in-memory
// vault (e.g. 1000). BENCHMARK_OUTPUT selects the artifact directory.
// BENCHMARK_CARET_MODE=normal|block-focus|sentence-focus selects session focus.
// BENCHMARK_CARET_MODES=false disables the feature for comparison.
// BENCHMARK_STANDOFF_RENDERING=false selects the previous rendering path.
// BENCHMARK_ANNOTATION_RANGE_EVENTS=false disables caret emphasis for comparison.
// Native binding/listing responses are local stubs: no user vault is opened.
// Reports handler and queued-caret costs separately; headless animation-frame
// timings are diagnostic, not an input-to-display latency guarantee.
import {spawn} from 'node:child_process';
import {mkdtemp, rm, mkdir, writeFile, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
const fixture=await readFile(process.env.BENCHMARK_DOCUMENT_PATH??'vaults/imported/documents/michelangelo-letters/1507-02-13-[a7a41cd3].ink');
const artifacts=process.env.BENCHMARK_OUTPUT??'/tmp/flint-typing';await mkdir(artifacts,{recursive:true});
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
 const session=new WorkspaceSession(materializeLocalWorkspace({type:'workspace-block',children:[]}),{features:{nativeDocumentPersistence:${!!process.env.BENCHMARK_VAULT_SIZE},nativeKnowledge:false,sqliteKnowledge:false,flintProbe:false,flintSceneChrome:true,annotationRangeEvents:${process.env.BENCHMARK_ANNOTATION_RANGE_EVENTS!=='false'},caretModes:${process.env.BENCHMARK_CARET_MODES!=='false'},standoffPropertyRendering:${process.env.BENCHMARK_STANDOFF_RENDERING!=='false'}}});
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
const chrome=spawn(process.env.CHROME_BIN??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank']);
let socket;
try{
 const endpoint=await new Promise((resolve,reject)=>{let out='';chrome.stderr.on('data',b=>{out+=b;const m=out.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(m)resolve(m[1]);});chrome.once('error',reject);setTimeout(()=>reject(Error('Chrome timeout')),15000).unref();});
 socket=new WebSocket(endpoint);await new Promise(r=>socket.addEventListener('open',r,{once:true}));
 let id=0;const pending=new Map(),errors=[];
 socket.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);});
 const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const n=++id;const timer=setTimeout(()=>{pending.delete(n);reject(Error('CDP timeout '+method));},45000);pending.set(n,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});socket.send(JSON.stringify({id:n,method,params,...(sessionId?{sessionId}:{})}));});
 const {targetId}=await send('Target.createTarget',{url:'about:blank'}),{sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
 const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value;};
 const wait=condition=>evaluate(`(async()=>{for(let i=0;i<300;i++){if(${condition})return;await new Promise(r=>setTimeout(r,50));}throw Error('Timed out: '+${JSON.stringify(condition)})})()`);
 await send('Page.bringToFront',{},sessionId);await send('Runtime.enable',{},sessionId);await send('Emulation.setDeviceMetricsOverride',{width:1500,height:990,deviceScaleFactor:1,mobile:false},sessionId);
 await send('Page.navigate',{url:`http://127.0.0.1:${vite.httpServer.address().port}/__flint-integration`},sessionId);
 await wait("window.proof && document.querySelector('.flint-compact .reactive-standoff-flow')");
 await evaluate(`proof.root=proof.host.querySelector('.flint-application');proof.view=[...proof.editor.projections.values()].find(v=>v!==proof.session.projection);proof.text=Object.values(proof.view.state.nodes).filter(n=>n.viewType==='standoff-editor-block').sort((a,b)=>b.inlineContent.length-a.inlineContent.length)[0];proof.mount=proof.editor.mounts.get(proof.text.key);proof.flow=proof.mount.root.querySelector('.reactive-standoff-flow')??proof.mount.root;proof.editor.focus.request(proof.text.key);proof.mount.restoreInlineSelection({anchor:100,head:100});`);
 if(process.env.BENCHMARK_VAULT_SIZE)await wait("proof.root.querySelectorAll('.flint-tree-document').length>0");
 await evaluate('new Promise(r=>setTimeout(r,300))');
 await evaluate(`proof.flow.focus();proof.mount.restoreInlineSelection({anchor:100,head:100});proof.editor.caretModes.select(${JSON.stringify(process.env.BENCHMARK_CARET_MODE??'normal')})`);
 await wait("proof.editor.caretModes.active()==='normal' || (proof.flow.dataset.caretFocus && proof.root.querySelector('[data-caret-scope]'))");
 const presentation=await evaluate(`({mode:proof.editor.caretModes.active(),scoped:proof.root.querySelectorAll('[data-caret-scope]').length,opacities:[...new Set([...proof.flow.children].map(cell=>getComputedStyle(cell).opacity))],focus:!!proof.flow.dataset.caretFocus,otherFlows:[...proof.root.querySelectorAll('[data-caret-scope]:not([data-caret-focus])')].map(flow=>getComputedStyle(flow).opacity)})`);
 console.log('Caret presentation:',JSON.stringify(presentation));
 if(presentation.mode!=='normal'){
   assert.ok(presentation.scoped>0,'focus styling must reach visible text in the real Flint document');
   assert.ok(presentation.focus,'the native caret Block must be focused');
   assert.ok(presentation.otherFlows.includes(presentation.mode==='block-focus'?'0.35':'0.3'),'other visible text flows must fade');
   assert.ok(presentation.opacities.includes('1'),'focused text remains fully visible');
   if(presentation.mode==='sentence-focus')assert.ok(presentation.opacities.includes('0.3'),'other sentences in the same Block must fade');
 }
 const screenshot=await send('Page.captureScreenshot',{format:'png'},sessionId);await writeFile(path.join(artifacts,'caret-mode.png'),Buffer.from(screenshot.data,'base64'));
 await send('Profiler.enable',{},sessionId);await send('Profiler.setSamplingInterval',{interval:200},sessionId);await send('Profiler.start',{},sessionId);
 const result=await evaluate(`(async()=>{
   const {editor,flow,mount}=proof;const before=mount.captureText();
   let statusReads=0;const status=proof.native.status.bind(proof.native);proof.native.status=(...args)=>{statusReads++;return status(...args)};
   let snapshots=0;const snapshot=editor.repository.snapshot.bind(editor.repository);editor.repository.snapshot=()=>{snapshots++;return snapshot()};
   const sync=[],settled=[],frames=[];
   for(let i=0;i<40;i++){
     const start=performance.now();flow.dispatchEvent(new InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType:i%2?'deleteContentBackward':'insertText',data:i%2?null:'a'}));sync.push(performance.now()-start);
     await Promise.resolve();settled.push(performance.now()-start);
     await new Promise(r=>requestAnimationFrame(r));frames.push(performance.now()-start);
   }
   const stats=xs=>{xs.sort((a,b)=>a-b);return {median:xs[Math.floor(xs.length/2)],p95:xs[Math.floor(xs.length*.95)],max:xs.at(-1)}};
   return {caretMode:editor.caretModes.active(),characters:before.length,paragraphs:proof.root.querySelectorAll('.reactive-standoff-flow').length,sync:stats(sync),settled:stats(settled),frame:stats(frames),snapshots,statusReads,vaultRows:proof.root.querySelectorAll('.flint-tree-document').length,restored:mount.captureText()===before};
 })()`);
 const {profile:cpu}=await send('Profiler.stop',{},sessionId);await writeFile(path.join(artifacts,'typing.cpuprofile'),JSON.stringify(cpu));
 const nodeById=new Map(cpu.nodes.map(n=>[n.id,n]));const totals=new Map();
 for(let i=0;i<cpu.samples.length;i++){const n=nodeById.get(cpu.samples[i]);const f=n.callFrame;const key=f.functionName+' '+f.url.replace(/^http[^/]+\/\//,'')+':'+f.lineNumber;totals.set(key,(totals.get(key)??0)+(cpu.timeDeltas[i]??0)/1000);}
 const hottest=[...totals].sort((a,b)=>b[1]-a[1]).slice(0,35);console.log(JSON.stringify({result,hottest},null,2));
 await writeFile(path.join(artifacts,'results.json'),JSON.stringify({result,hottest},null,2));
 assert.ok(result.restored);assert.equal(result.snapshots,0);
 if(process.env.BENCHMARK_VAULT_SIZE)assert.ok(result.statusReads<=80,'40 edits must not read status once per vault row');
 const before=await evaluate('proof.mount.captureText()');
 await evaluate('proof.mount.restoreInlineSelection({anchor:100,head:100})');
 const burst='Quick typing test';
 for(const character of burst)await send('Input.insertText',{text:character},sessionId);
 assert.equal(await evaluate('proof.mount.captureText()'),[...before].slice(0,100).join('')+burst+[...before].slice(100).join(''));
 await evaluate(`for(let i=0;i<${[...burst].length};i++)proof.editor.repository.undo()`);
 assert.equal(await evaluate('proof.mount.captureText()'),before);
 console.log('Real Chrome character input and undo: passed');
 await evaluate('proof.dispose();proof.session.dispose()');
}finally{socket?.close();chrome.kill();await vite.close();await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
process.exit(0);
