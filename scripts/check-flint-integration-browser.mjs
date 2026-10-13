// Focused production Flint composition check. Ephemeral in-memory Documents;
// no user Vault is read or changed. The real workspace command and views run.
import {spawn} from 'node:child_process';
import {mkdtemp, rm, mkdir, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
const artifacts='artifacts/flint-integration';await mkdir(artifacts,{recursive:true});
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
 const session=new WorkspaceSession(materializeLocalWorkspace({type:'workspace-block',children:[]}),{features:{nativeDocumentPersistence:false,flintProbe:false,flintSceneChrome:false}});
 const editor=session.editor;
 editor.commandRegistry.execute('flint.open',{targetKey:session.projection.state.rootKey,args:undefined});
 const win=Object.values(session.projection.state.nodes).find(n=>n.viewType==='window-block');
 editor.commands.setPayloadField(win.key,'metadata',{...JSON.parse(JSON.stringify(win.payload.metadata)),size:{w:1450,h:920},position:{x:25,y:25}});
 const host=document.getElementById('root');host.className='workspace-demo workspace-demo--canonical';
 const dispose=render(()=>createComponent(WorkspacePresentationView,{session}),host);editor.installGateway(document);
 window.proof={editor,session,dispose,host};
 `;},
 configureServer(server){server.middlewares.use(async(req,res,next)=>{if(req.url!=='/__flint-integration')return next();res.setHeader('Content-Type','text/html');res.end(await server.transformIndexHtml(req.url,'<html><body><div id="root"></div><script type="module" src="/__flint-proof.js"></script></body></html>'));});}
}],server:{host:'127.0.0.1',port:0,hmr:false}});await vite.listen();
const chrome=spawn(process.env.CHROME_BIN??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank']);
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
 const check=(name,value)=>{assert.ok(value,name);console.log('Passed: '+name);checks.push(name);};const checks=[];
 const shot=async name=>{const {data}=await send('Page.captureScreenshot',{format:'png'},sessionId);await writeFile(path.join(artifacts,name+'.png'),Buffer.from(data,'base64'));};
 await send('Runtime.enable',{},sessionId);await send('Emulation.setDeviceMetricsOverride',{width:1500,height:990,deviceScaleFactor:1,mobile:false},sessionId);
 await send('Page.navigate',{url:`http://127.0.0.1:${vite.httpServer.address().port}/__flint-integration`},sessionId);
 await wait("window.proof && document.querySelector('.flint-application[data-material-ready=true]')");
 await evaluate(`(async()=>{
 proof.root=proof.host.querySelector('.flint-application');
 proof.material=(await import('/src/features/flint/material/material-chrome.tsx')).materialChromePresentation(proof.root);
 const view=[...proof.editor.projections.values()].find(v=>v!==proof.session.projection);
 const doc=view.state.nodes[view.state.rootKey],text=Object.values(view.state.nodes).find(n=>n.viewType==='standoff-editor-block');proof.text=text;proof.mount=proof.editor.mounts.get(text.key);
 proof.editor.commands.setPayloadField(doc.key,'metadata',{...JSON.parse(JSON.stringify(doc.payload.metadata)),title:'The Waste Land'});
 const names=['T. S. Eliot','Modernism','London','Thames','Myth','War','Nature','Time','Suffering','Rebirth','The Hollow Men','Memory'];
 const content='April is the cruellest month, breeding\\nLilacs out of the dead land, mixing\\nMemory and desire, stirring\\nDull roots with spring rain.\\n\\n'+names.join(' · ');
 proof.editor.commands.replaceInlineRange(text.key,0,text.inlineContent.length,content);
 for(let i=0;i<names.length;i++){const start=content.lastIndexOf(names[i]);proof.editor.linkedAnnotations.createBatch([[proof.editor.textRanges.snapshot(text.key,start,start+names[i].length)]],'codex/entity-reference','entity-'+i,{entityName:names[i]},proof.editor.repository.state.revision,'Link entity');}
 proof.before=JSON.stringify(proof.editor.repository.snapshot());proof.view=view;
 })()`);
 await wait("proof.root.querySelectorAll('[aria-label=\"Document backlinks\"] tbody tr').length===12");
 await evaluate('proof.editor.focus.request(proof.text.key);proof.mount.restoreInlineSelection({anchor:0,head:0})');
 await send('Input.insertText',{text:'Reading notes — '},sessionId);
 check('real browser input edits the existing Document through the spatial shell',await evaluate("proof.mount.captureText().startsWith('Reading notes — ' )"));
 await evaluate('proof.before=JSON.stringify(proof.editor.repository.snapshot())');
 check('normal Flint has physical shell surfaces',await evaluate('proof.material.scene.metrics.surfaces > 8'));
 await shot('document');
 await evaluate("proof.root.querySelector('[aria-label=\"Toggle Document and Graph\"]').click()");
 await wait("proof.root.querySelector('.flint-material-graph[data-renderer=three] .flint-three-label')");
 await evaluate('new Promise(r=>setTimeout(r,1800))');
 check('live graph includes Document plus twelve entity reliefs',await evaluate("proof.root.querySelectorAll('.flint-three-label').length===13"));
 check('view transition preserves the editor mount and authored content',await evaluate('proof.editor.mounts.get(proof.text.key)===proof.mount && JSON.stringify(proof.editor.repository.snapshot())===proof.before'));
 await evaluate('proof.idleFrames=proof.material.scene.metrics.frames');
 await evaluate('new Promise(r=>setTimeout(r,400))');
 check('shared lighting idles between interactions',await evaluate('proof.material.scene.metrics.frames===proof.idleFrames && !proof.material.lighting.pending'));
 await shot('graph-light-left');
 await evaluate('proof.material.lighting.setLight({azimuth:145,elevation:32})');await evaluate('new Promise(r=>setTimeout(r,800))');await shot('graph-light-right');
 await evaluate("[...proof.root.querySelectorAll('.flint-three-label')].find(n=>n.textContent==='Modernism').click();[...proof.root.querySelectorAll('.flint-graph-inspection button')][0].click()");
 await wait("proof.root.dataset.view==='document' && proof.editor.focus.state.focusedKey===proof.text.key");
 check('entity selection reveals its native text occurrence',await evaluate("proof.editor.focus.state.focusedKey===proof.text.key"));
 await evaluate("proof.root.querySelector('[aria-label=\"Material effects\"]').click()");
 await wait("proof.root.dataset.materialReady==='false'");
 check('reduced-effects fallback retains document editing',await evaluate("proof.editor.mounts.get(proof.text.key)===proof.mount"));
 await shot('reduced-effects');
 check('no uncaught browser errors',errors.length===0);
 await evaluate('proof.dispose();proof.session.dispose()');
 check('application disposal releases material canvases',await evaluate("document.querySelectorAll('.flint-material-canvas,.flint-three-canvas').length===0"));
 await writeFile(path.join(artifacts,'results.json'),JSON.stringify({checks,errors},null,2));
 console.log('Evidence: '+artifacts);
}finally{socket?.close();chrome.kill();await vite.close();await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
