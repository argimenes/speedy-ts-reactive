// Read-only native Document load profiler. Uses an isolated Chrome profile and Vite server.
// Usage: node scripts/profile-document-load.mjs <native-file> [output-prefix]
import {createServer} from 'vite';
import solid from 'vite-plugin-solid';
import {spawn,execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
const file=process.argv[2], output=process.argv[3]??'/tmp/speedy-load-profile/load';
if(!file)throw Error('Supply a native Document file');
const bytes=await readFile(file);
await mkdir(path.dirname(output),{recursive:true});
// Function/part timings are inclusive and overlap; only the stage timings add up.
// Module loading and HTTP file transfer are deliberately outside the CPU profile.
// This measures the native admission and rendering core, not all Flint panels.
// Optional comparison against the same native decoder at a Git revision.
const revision=process.env.PROFILE_NATIVE_REVISION;
const prior=revision?execFileSync('git',['show',revision+':src/persistence/native-resource.ts'],{encoding:'utf8'}):undefined;
const instrument={
 '/src/persistence/native-resource.ts':['parseNativeEnvelope','decodeNative','captureNative','nativeText'],
 '/src/history/stage-c-gates/portable.ts':['decodeGateDocument','encodeGateDocument'],
 '/src/history/stage-c-gates/resource.ts':['validateResource','projectOwned'],
 '/src/history/durable-core.ts':['resourceToRepository'],
 '/src/block-tree/repository.ts':['validateRepository','planChangedRecords'],
};
const detailPlugin={name:'load-timings',enforce:'pre',transform(code,id){
 if(prior&&id.endsWith('/src/persistence/native-resource.ts'))code=prior;
 const entry=Object.entries(instrument).find(([file])=>id.endsWith(file));if(!entry)return;
 for(const name of entry[1]){
  const exported=code.includes('export function '+name+'(');
  const declaration=(exported?'export ':'')+'function '+name+'(';
  if(!code.includes(declaration))throw Error('Missing instrumented function '+name);
  code=code.replace(declaration,'function __profile_'+name+'(');
  code+='\n'+(exported?'export ':'')+'function '+name+'(...args:any[]){const start=performance.now();try{return __profile_'+name+'(...args);}finally{const table=(globalThis as any).__loadTimings??={};const row=table["'+name+'"]??={calls:0,ms:0};row.calls++;row.ms+=performance.now()-start;}}';
 }
 return {code,map:null};
}};
const vite=await createServer({configFile:false,plugins:[detailPlugin,solid(),{name:'load-fixture',configureServer(server){
 server.middlewares.use('/__document',(_req,res)=>{res.setHeader('Content-Type','application/json');res.end(bytes);});
 server.middlewares.use('/__profile',(_req,res)=>{res.setHeader('Content-Type','text/html');res.end('<html><head><style>.reactive-standoff-flow{white-space:pre-wrap}</style></head><body></body></html>');});
}}],server:{host:'127.0.0.1',port:0,hmr:false}});await vite.listen();
const profile=await mkdtemp(path.join(tmpdir(),'document-profile-'));
const chrome=spawn(process.env.CHROME_BIN??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank']);
let socket;
try{
 const endpoint=await new Promise((resolve,reject)=>{let output='';const timer=setTimeout(()=>reject(Error('Chrome startup timed out')),15000);chrome.once('error',reject);chrome.stderr.on('data',chunk=>{output+=chunk;const match=output.match(/DevTools listening on (ws:\/\/\S+)/);if(match){clearTimeout(timer);resolve(match[1]);}});});
 socket=new WebSocket(endpoint);await new Promise(r=>socket.addEventListener('open',r,{once:true}));
 let sequence=0;const pending=new Map();
 socket.addEventListener('message',event=>{const message=JSON.parse(event.data),p=pending.get(message.id);if(p){pending.delete(message.id);message.error?p.reject(Error(JSON.stringify(message.error))):p.resolve(message.result);}});
 const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++sequence;const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method));},120000);pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});socket.send(JSON.stringify({id,method,params,sessionId}));});
 const {targetId}=await send('Target.createTarget',{url:'about:blank'}),{sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false},sessionId);
 await send('Page.navigate',{url:`http://127.0.0.1:${vite.httpServer.address().port}/__profile`},sessionId);
 await evaluate(`(async()=>{
  const {ReactiveEditor}=await import('/src/reactive-editor/editor.ts');
  const {registerApplicationViews}=await import('/src/application/features.ts');
  const {ReactiveTreeView}=await import('/src/rendering/reactive-tree-view.tsx');
  const native=await import('/src/persistence/native-resource.ts');
  const source=await(await fetch('/src/rendering/reactive-tree-view.tsx')).text();
  const {render,createComponent}=await import(source.split('"').find(p=>p.includes('/solid-js_web.js')));
  window.loadBench={ReactiveEditor,registerApplicationViews,ReactiveTreeView,native,render,createComponent,bytes:new Uint8Array(await(await fetch('/__document')).arrayBuffer())};
 })()`);
 await send('Profiler.enable',{},sessionId);await send('Profiler.setSamplingInterval',{interval:1000},sessionId);await send('Profiler.start',{},sessionId);
 const result=await evaluate(`(async()=>{
  const {ReactiveEditor,registerApplicationViews,ReactiveTreeView,native,render,createComponent,bytes}=loadBench;
  globalThis.__loadTimings={};const timings={};let start=performance.now();const mark=name=>{const now=performance.now();timings[name]=now-start;start=now;};
  const editor=new ReactiveEditor({id:'profile-workspace',type:'workspace-block',children:[{id:'profile-bank',type:'workspace-object-bank-block',children:[]}]});
  registerApplicationViews(editor);const workspace=editor.createView('workspace');mark('emptyEditorMs');
  const bank=Object.values(editor.repository.readState().contents).find(c=>c.viewType==='workspace-object-bank-block');
  const parts={};const wrap=(object,key,label)=>{const original=object[key];object[key]=function(...args){const t=performance.now();try{return original.apply(this,args);}finally{const row=parts[label]??={calls:0,ms:0};row.calls++;row.ms+=performance.now()-t;}};};
  for(const key of ['rebuildReferences','prepareCapture'])wrap(editor.repository,key,key);
  wrap(editor.repository.historyStorage,'store','undoStorage');
  const projectionPrototype=Object.getPrototypeOf(workspace),originalBuild=projectionPrototype.build;
  projectionPrototype.build=function(...args){const t=performance.now();try{return originalBuild.apply(this,args);}finally{const row=parts['projection:'+this.viewId]??={calls:0,ms:0};row.calls++;row.ms+=performance.now()-t;}};
  const originalCommit=editor.repository.commit.bind(editor.repository);let commitMs=0;
  editor.repository.commit=(...args)=>{const t=performance.now();const result=originalCommit(...args);commitMs+=performance.now()-t;return result;};
  const admitted=native.admitNativeWithResource(editor.repository,bytes,bank.key);mark('admitTotalMs');
  native.nativeText(admitted.resource);mark('baselineSerializeMs');
  const projection=editor.createView('document',admitted.placementKey);mark('documentProjectionMs');
  const host=document.body.appendChild(document.createElement('div'));host.style.cssText='width:840px;height:620px;overflow:auto';
  const dispose=render(()=>createComponent(ReactiveTreeView,{editor,projection}),host);mark('renderSyncMs');
  await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));mark('firstFramesMs');
  const content=Object.values(admitted.resource.contents),types={};for(const c of content)types[c.viewType]=(types[c.viewType]??0)+1;
  const summary={parts,functions:globalThis.__loadTimings,fileBytes:bytes.length,timings,commitMs,types,annotations:content.reduce((n,c)=>n+(c.payload.standoffProperties?.length??0),0),domElements:host.querySelectorAll('*').length,projectedNodes:Object.keys(projection.state.nodes).length};
  Object.assign(window.loadBench,{editor,host,resource:admitted.resource,dispose:()=>{dispose();editor.dispose();}});return summary;
 })()`);
 const {profile:cpu}=await send('Profiler.stop',{},sessionId);
 if(process.env.PROFILE_VERIFY==='1'){
  await evaluate(`(()=>{const {editor,host}=loadBench;editor.installGateway(document);
   const flow=[...host.querySelectorAll('[contenteditable=true]')].sort((a,b)=>b.textContent.length-a.textContent.length)[0];
   const before=flow.textContent;flow.focus();const range=document.createRange();range.setStart(flow,0);range.collapse(true);
   const selection=document.getSelection();selection.removeAllRanges();selection.addRange(range);
   Object.assign(loadBench,{flow,before});})()`);
  await send('Input.insertText',{text:'Z'},sessionId);
  assert.equal(await evaluate('loadBench.flow.textContent=== "Z"+loadBench.before'),true);
  assert.equal(await evaluate('loadBench.editor.repository.undo();loadBench.flow.textContent===loadBench.before'),true);
  assert.equal(await evaluate('loadBench.editor.repository.redo();loadBench.flow.textContent==="Z"+loadBench.before'),true);
  await evaluate('loadBench.editor.repository.undo()');
  assert.equal(await evaluate('loadBench.native.nativeText(loadBench.native.captureNative(loadBench.editor.repository.readState(),loadBench.resource.resourceId))===loadBench.native.nativeText(loadBench.resource)'),true);
  // Exercise Chrome's native composition DOM, including an annotation update
  // while the browser still owns uncommitted text inside a source Cell.
  await evaluate(`(()=>{const {editor,flow}=loadBench;flow.focus();
   const text=flow.firstChild.firstChild;document.getSelection().setBaseAndExtent(text,1,text,1);
   const owner=editor.node(flow.closest('[data-runtime-key]').dataset.runtimeKey);
   loadBench.owner=owner;loadBench.imeExpected=loadBench.before.slice(0,1)+'中文'+loadBench.before.slice(1);
  })()`);
  await send('Input.imeSetComposition',{text:'中文',selectionStart:2,selectionEnd:2},sessionId);
  assert.equal(await evaluate('loadBench.flow.textContent'),await evaluate('loadBench.imeExpected'));
  await evaluate(`(()=>{const {editor,owner}=loadBench;editor.commands.setPayloadField(owner.key,'standoffProperties',
   [...JSON.parse(JSON.stringify(owner.payload.standoffProperties??[])),{id:'profile-ime-style',type:'style/bold',start:0,end:0}]);})()`);
  assert.equal(await evaluate('loadBench.flow.textContent===loadBench.imeExpected'),true);
  await send('Input.insertText',{text:'中文'},sessionId);
  assert.equal(await evaluate('loadBench.flow.textContent===loadBench.imeExpected'),true);
  assert.equal(await evaluate('loadBench.owner.inlineContent.map(key=>loadBench.editor.node(key).payload.text).join("")===loadBench.imeExpected'),true);
  await evaluate('loadBench.editor.repository.undo();loadBench.editor.repository.undo()');
  assert.equal(await evaluate('loadBench.flow.textContent===loadBench.before'),true);
  assert.equal(await evaluate('loadBench.native.nativeText(loadBench.native.captureNative(loadBench.editor.repository.readState(),loadBench.resource.resourceId))===loadBench.native.nativeText(loadBench.resource)'),true);
  result.verified='Chrome input, Undo/Redo, native IME with concurrent annotation styling, and canonical save content';
 }
 result.revision=revision??'working tree';
 await writeFile(output+'.cpuprofile' ,JSON.stringify(cpu));await writeFile(output+'.json',JSON.stringify(result,null,2));
 console.log(JSON.stringify(result,null,2));
}finally{
 socket?.close();const exited=new Promise(r=>chrome.once('exit',r));chrome.kill();await exited;
 await vite.close();await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
process.exit(0);
