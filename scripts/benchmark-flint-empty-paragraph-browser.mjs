// Compare character and empty-paragraph Backspace in the real Flint shell.
// Assert bounded repository work using an in-memory copy of a native Document.
// Reads the fixture only; never saves it. BENCHMARK_DOCUMENT_PATH selects another
// native resource; BENCHMARK_VAULT_SIZE adds unopened entries to an in-memory
// vault (e.g. 1000). BENCHMARK_OUTPUT selects the artifact directory.
// Native binding/listing responses are local stubs: no user vault is opened.
// Reports handler and queued-caret costs separately; headless animation-frame
// timings are diagnostic, not an input-to-display latency guarantee.
import {spawn} from 'node:child_process';
import {mkdtemp, rm, mkdir, writeFile, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
process.env.BENCHMARK_VAULT_SIZE ??= '1000';
const fixture=await readFile(process.env.BENCHMARK_DOCUMENT_PATH??'vaults/imported/documents/michelangelo-letters/1507-02-13-[a7a41cd3].ink');
const artifacts=process.env.BENCHMARK_OUTPUT??'/tmp/flint-empty-paragraph';await mkdir(artifacts,{recursive:true});
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
 const session=new WorkspaceSession(materializeLocalWorkspace({type:'workspace-block',children:[]}),{features:{nativeDocumentPersistence:${!!process.env.BENCHMARK_VAULT_SIZE},nativeKnowledge:false,sqliteKnowledge:false,flintProbe:false,flintSceneChrome:true}});
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
 await evaluate('new Promise(r=>setTimeout(r,300))');
 if(process.env.BENCHMARK_VAULT_SIZE)await wait("proof.root.querySelectorAll('.flint-tree-document').length>0");
 await send('Profiler.enable',{},sessionId);await send('Profiler.setSamplingInterval',{interval:200},sessionId);await send('Profiler.start',{},sessionId);
 const result=await evaluate(`(async()=>{
   const {editor,mount,text,view}=proof;
   const empty=editor.commands.insertEmptyStandoffSibling(text.key,'after');
   await new Promise(r=>requestAnimationFrame(r));
   const metrics={};let active;
   for(const [object,key] of [[editor.repository,'snapshot'],[editor.commands,'pruneUnreachable'],[editor.commands,'diff']]){
     const original=object[key].bind(object);object[key]=(...args)=>{const t=performance.now();try{return original(...args)}finally{if(active){const m=metrics[active][key]??={calls:0,ms:0};m.calls++;m.ms+=performance.now()-t;}}};
   }
   const changes=[];const stop=editor.repository.subscribeChanges(c=>{if(active)changes.push({kind:active,inline:!!c.inlineOwner,children:!!c.childrenOwner,records:c.previousContents.size})});
   const stats=xs=>{xs.sort((a,b)=>a-b);return {median:xs[Math.floor(xs.length/2)],max:xs.at(-1)}};
   for(const kind of ['character','empty-paragraph']){
     metrics[kind]={};const sync=[],settled=[];
     for(let i=0;i<8;i++){
       const target=kind==='character'?text:view.nodeForPlacement(empty);
       const handle=editor.mounts.get(target.key);
       editor.focus.request(target.key);handle.restoreInlineSelection({anchor:kind==='character'?100:0,head:kind==='character'?100:0});
       await new Promise(r=>requestAnimationFrame(r));
       active=kind;const t=performance.now();
       handle.focusElement.dispatchEvent(new InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType:'deleteContentBackward'}));sync.push(performance.now()-t);
       await Promise.resolve();await Promise.resolve();settled.push(performance.now()-t);active=undefined;
       editor.repository.undo();await new Promise(r=>requestAnimationFrame(r));
     }
     metrics[kind].sync=stats(sync);metrics[kind].settled=stats(settled);
   }
   stop();return {metrics,changes,characters:mount.captureText().length};
 })()`);
 const {profile:cpu}=await send('Profiler.stop',{},sessionId);await writeFile(path.join(artifacts,'typing.cpuprofile'),JSON.stringify(cpu));
 const nodeById=new Map(cpu.nodes.map(n=>[n.id,n]));const totals=new Map();
 for(let i=0;i<cpu.samples.length;i++){const n=nodeById.get(cpu.samples[i]);const f=n.callFrame;const key=f.functionName+' '+f.url.replace(/^http[^/]+\/\//,'')+':'+f.lineNumber;totals.set(key,(totals.get(key)??0)+(cpu.timeDeltas[i]??0)/1000);}
 const hottest=[...totals].sort((a,b)=>b[1]-a[1]).slice(0,35);console.log(JSON.stringify({result,hottest},null,2));
 await writeFile(path.join(artifacts,'results.json'),JSON.stringify({result,hottest},null,2));
 for(const kind of ['character','empty-paragraph'])for(const operation of ['snapshot','pruneUnreachable','diff'])
   assert.equal(result.metrics[kind][operation]?.calls??0,0,kind+' must not call '+operation);
 assert.equal(result.changes.filter(c=>c.kind==='empty-paragraph'&&c.children).length,8);
 assert.deepEqual(errors,[]);
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
