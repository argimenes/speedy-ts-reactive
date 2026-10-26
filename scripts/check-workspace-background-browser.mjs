// Real browser coverage of desktop background sizing with retained and legacy outlets.
// Isolated in-memory Workspace; no user files or services are written.
import {spawn} from 'node:child_process';
import {mkdtemp, rm, mkdir, writeFile, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
const artifacts=process.env.BENCHMARK_OUTPUT??'/tmp/workspace-background-proof';await mkdir(artifacts,{recursive:true});
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
 import '/src/assets/reset.css';
 import '/src/index.css';
 import '/src/demo/workspace-demo.css';

 import {ReactiveEditor} from '/src/reactive-editor/editor.ts';
 import {registerCoreViews} from '/src/rendering/register-core-views.ts';
 import {ReactiveTreeView} from '/src/rendering/reactive-tree-view.tsx';
 import {backgroundImages} from '/src/rendering/backgrounds.ts';
 const q=new URLSearchParams(location.search),standalone=q.has('standalone');
 const background={id:'desktop-bg',type:'image-background-block',metadata:{url:backgroundImages[1].url},children:[]};
 const features={reversibleBlocks:!q.has('legacy'),mutableWindowManager:!q.has('noManager')};
 const session=standalone?undefined:new WorkspaceSession(materializeLocalWorkspace({id:'workspace',type:'workspace-block',children:[background]}),{features});
 const editor=session?.editor??new ReactiveEditor(background,{features});
 if(standalone)registerCoreViews(editor);
 const projection=session?.projection??editor.createView('background');
 const host=document.getElementById('root');host.className=standalone?'workspace-stage__background':'workspace-demo workspace-demo--canonical workspace-demo--system-bar';host.setAttribute('data-window-work-area','');
 const dispose=render(()=>standalone?createComponent(ReactiveTreeView,{editor,projection}):createComponent(WorkspacePresentationView,{session}),host);
 window.proof={editor,session,dispose,host,backgroundImages,projection};

 `;},
 configureServer(server){server.middlewares.use(async(req,res,next)=>{if(!req.url.startsWith('/__flint-integration'))return next();res.setHeader('Content-Type','text/html');res.end(await server.transformIndexHtml(req.url,'<html><body><div id="root"></div><script type="module" src="/__flint-proof.js"></script></body></html>'));});}
}],server:{host:'127.0.0.1',port:0,hmr:false}});await vite.listen();
const chrome=spawn(process.env.CHROME_BIN??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--window-size=1500,990','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows',...(process.env.BENCHMARK_NATIVE_GPU==='1'?[]:['--use-angle=swiftshader','--enable-unsafe-swiftshader']),'--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank']);
let socket;
try{
 const endpoint=await new Promise((resolve,reject)=>{let out='';chrome.stderr.on('data',b=>{out+=b;const m=out.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(m)resolve(m[1]);});chrome.once('error',reject);setTimeout(()=>reject(Error('Chrome timeout')),15000).unref();});
 socket=new WebSocket(endpoint);await new Promise(r=>socket.addEventListener('open',r,{once:true}));
 let id=0;const pending=new Map(),errors=[];
 socket.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);});
 const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const n=++id;const timer=setTimeout(()=>{pending.delete(n);reject(Error('CDP timeout '+method));},60000);pending.set(n,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});socket.send(JSON.stringify({id:n,method,params,...(sessionId?{sessionId}:{})}));});
 const {targetId}=await send('Target.createTarget',{url:'about:blank'}),{sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
 const evaluate=async expression=>{if(process.env.AUTOCOMPLETE_TRACE)console.log('EVAL '+expression.slice(0,180));const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value;};
 const wait=condition=>evaluate(`(async()=>{for(let i=0;i<900;i++){if(${condition})return;await new Promise(r=>setTimeout(r,50));}throw Error('Timed out: '+${JSON.stringify(condition)})})()`);
 await send('Page.bringToFront',{},sessionId);await send('Runtime.enable',{},sessionId);await send('Emulation.setDeviceMetricsOverride',{width:1500,height:990,deviceScaleFactor:1,mobile:false},sessionId);

 const measurements=[];
 for(const query of ['', '?legacy', '?noManager', '?standalone', '?standalone&legacy']) {
  await send('Page.navigate',{url:`http://127.0.0.1:${vite.httpServer.address().port}/__flint-integration${query}`},sessionId);
  await wait("window.proof && document.querySelector('.reactive-background img')?.naturalWidth>0");
  for(const [width,height] of [[1440,900],[900,1440],[720,540],[480,800]]) {
   await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false},sessionId);
   await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
   const bounds=await evaluate(`(()=>{const image=document.querySelector('.reactive-background img'),r=image.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,fit:getComputedStyle(image).objectFit}})()`);
   measurements.push({query,width,height,...bounds});console.log(JSON.stringify(measurements.at(-1)));
   if(!process.env.BACKGROUND_BASELINE) {assert.equal(bounds.left,0);assert.equal(bounds.right,width);assert.equal(bounds.top,query.includes('standalone')?0:36);assert.equal(bounds.bottom,height);assert.equal(bounds.fit,'cover');}
  }
  await send('Page.captureScreenshot',{format:'png'},sessionId).then(r=>writeFile(path.join(artifacts,query.includes('standalone')?'standalone.png':'desktop.png'),Buffer.from(r.data,'base64')));
  await evaluate('proof.dispose();proof.session?proof.session.dispose():proof.editor.dispose()');
  if(process.env.BACKGROUND_BASELINE)break;
 }
 assert.equal(errors.length,0);await writeFile(path.join(artifacts,'measurements.json'),JSON.stringify(measurements,null,2));
}finally{socket?.close();chrome.kill();await vite.close();await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
process.exit(0);
