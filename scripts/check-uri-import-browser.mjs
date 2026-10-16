// Stage D: real Flint URI actions, bounded acquisition and passive provider lifecycle.
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import express from 'express';
import {EventEmitter} from 'node:events';
import {Readable} from 'node:stream';
import {createManagedAssetService} from '../server/managed-assets-router.mjs';
import {closeFilesystemWorkers} from './stage-c-gates/filesystem.mjs';
const root=await mkdtemp(path.join(tmpdir(),'interchange-proof-')),profile=await mkdtemp(path.join(tmpdir(),'interchange-chrome-'));
const acquisitions=[];
const assets=createManagedAssetService({root,cavernId:'proof',session:'proof',remoteTextDependencies:{lookup:async()=>[{address:'8.8.8.8',family:4}],request:(url,options,callback)=>{acquisitions.push(url.href);const req=new EventEmitter();req.end=()=>queueMicrotask(()=>{const stream=Readable.from([Buffer.from('<p>Remote <strong>semantic</strong> text <img src="https://interchange-probe.invalid/photo.png"></p>')]);stream.statusCode=200;stream.headers={'content-type':'text/html; charset=utf-8'};callback(stream);});req.destroy=e=>req.emit('error',e);return req;}}});await assets.recover();
const app=express();app.use(express.json({limit:'32mb'}));app.use('/api/assets',assets.router);
const vite=await createServer({plugins:[{name:'interchange-proof',resolveId(id){if(id==='/__interchange.js')return '\0interchange';},load(id){if(id==='\0interchange')return `
 import {render} from 'solid-js/web';import {createComponent} from 'solid-js';
 import {WorkspaceSession} from '/src/application/workspace-session.ts';import {WorkspacePresentationView} from '/src/application/workspace-presentation-view.tsx';import {materializeLocalWorkspace} from '/src/reactive-editor/workspace-manifest.ts';
 import {nativeDocumentSession} from '/src/persistence/native-session.ts';
 import '/src/index.css';import '/src/demo/workspace-demo.css';
 const session=new WorkspaceSession(materializeLocalWorkspace({type:'workspace-block',children:[]}),{features:{nativeDocumentPersistence:true,nativeKnowledge:false,sqliteKnowledge:false,flintProbe:false}});
 const editor=session.editor;editor.setAssetContext(()=>({cavernId:'proof',session:'proof'}));editor.commandRegistry.execute('flint.open',{targetKey:session.projection.state.rootKey,args:undefined});
 const win=Object.values(session.projection.state.nodes).find(n=>n.viewType==='window-block');editor.commands.setPayloadField(win.key,'metadata',{...JSON.parse(JSON.stringify(win.payload.metadata)),size:{w:1400,h:900},position:{x:10,y:10}});
 const host=document.getElementById('root');host.className='workspace-demo workspace-demo--canonical';const dispose=render(()=>createComponent(WorkspacePresentationView,{session}),host);editor.installGateway(document);
 const active=()=>[...editor.projections.values()].find(v=>v!==session.projection&&Object.values(v.state.nodes).some(n=>n.viewType==='document-block'));
 const text=()=>Object.values(active().state.nodes).find(n=>n.viewType==='standoff-editor-block');
 const select=(start,end=start)=>{const n=text(),m=editor.mounts.get(n.key);m.focus();m.restoreInlineSelection({anchor:start,head:end});editor.selections.setPrimary(n.key,n.contentKey,n.viewId,start,end);return n.key;};
 window.proof={editor,session,dispose,active,text,select,native:nativeDocumentSession(editor)};
 `;},configureServer(server){server.middlewares.use(app);server.middlewares.use(async(req,res,next)=>{if(req.url!=='/__interchange')return next();res.setHeader('Content-Type','text/html');res.end(await server.transformIndexHtml(req.url,'<html><body><div id="root"></div><script type="module" src="/__interchange.js"></script></body></html>'));});}}],server:{host:'127.0.0.1',port:0,hmr:false}});
const {createNativeDocumentStoreRouter}=await vite.ssrLoadModule('/server/native-document-store.mjs');app.use('/api/native',createNativeDocumentStoreRouter({root}));
await vite.listen();
const chrome=spawn(process.env.CHROME_BIN??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank']);let socket;
try{
 const endpoint=await new Promise((resolve,reject)=>{let out='';chrome.stderr.on('data',b=>{out+=b;const m=out.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(m)resolve(m[1]);});chrome.once('error',reject);setTimeout(()=>reject(Error('Chrome timeout')),15000).unref();});socket=new WebSocket(endpoint);await new Promise(r=>socket.addEventListener('open',r,{once:true}));
 let id=0;const pending=new Map(),errors=[],external=[];
 socket.addEventListener('message',event=>{const m=JSON.parse(event.data),p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);if(m.method==='Network.requestWillBeSent'&&!m.params.request.url.startsWith('http://127.0.0.1:')&&!/^(blob:|data:|chrome-extension:)/.test(m.params.request.url))external.push(m.params.request.url);});
 const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const n=++id,timer=setTimeout(()=>reject(Error('CDP timeout '+method)),45000);pending.set(n,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});socket.send(JSON.stringify({id:n,method,params,...(sessionId?{sessionId}:{})}));});
 const {targetId}=await send('Target.createTarget',{url:'about:blank'}),{sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true},sessionId);if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 const wait=condition=>evaluate(`(async()=>{for(let i=0;i<400;i++){if(${condition})return;await new Promise(r=>setTimeout(r,30));}throw Error('Timed out '+${JSON.stringify(condition)}+' '+window.proof?.editor.interchange.message())})()`);
 const click=text=>evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)}).click()`);
 const origin=`http://127.0.0.1:${vite.httpServer.address().port}`;
 await send('Runtime.enable',{},sessionId);await send('Network.enable',{},sessionId);await send('Page.bringToFront',{},sessionId);await send('Emulation.setDeviceMetricsOverride',{width:1500,height:990,deviceScaleFactor:1,mobile:false},sessionId);
 await send('Browser.grantPermissions',{origin,permissions:['clipboardReadWrite','clipboardSanitizedWrite']});await send('Page.navigate',{url:origin+'/__interchange'},sessionId);await wait("window.proof&&document.querySelector('.flint-application .reactive-standoff-flow')");


 const playerStatus=async()=>{const result=[];for(const target of (await send('Target.getTargets')).targetInfos.filter(t=>t.type==='iframe')){const {sessionId:child}=await send('Target.attachToTarget',{targetId:target.targetId,flatten:true});const r=await send('Runtime.evaluate',{expression:"({url:location.href,title:document.title,text:document.body?.innerText.slice(0,600),video:!!document.querySelector('video'),paused:document.querySelector('video')?.paused})",returnByValue:true},child);const point=await evaluate(`(()=>{const f=document.querySelector('.mutable-video-block iframe');f.scrollIntoView({block:'center'});const r=f.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`);await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point},sessionId);await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point},sessionId);await new Promise(r=>setTimeout(r,6000));const playback=await send('Runtime.evaluate',{expression:"(()=>{const v=document.querySelector('video');return {time:v?.currentTime,readyState:v?.readyState,paused:v?.paused,error:v?.error?.message,text:document.body?.innerText.slice(0,600)};})()",returnByValue:true},child);result.push({...r.result?.value,playback:playback.result?.value??{error:playback.exceptionDetails}});await send('Target.detachFromTarget',{sessionId:child});}return result;};
 const choice=async(label)=>{await wait('!!proof.editor.interchange.question()');await evaluate(`(()=>{const inputs=[...document.querySelectorAll('[data-document-interchange] label')];const input=inputs.find(l=>l.textContent===${JSON.stringify(label)})?.querySelector('input');if(!input)throw Error('Missing choice');input.click();})()`);await click('Continue');};
 const inspect=async(url,option)=>{await evaluate(`proof.select(0);void proof.editor.interchange.inspectLinkedResource(proof.text().key,${JSON.stringify(url)})`);await choice(option);};
 // Use the real editor input path for an ordinary URL. No operation or fetch starts.
 await evaluate(`proof.select(0);proof.beforeTyping=proof.editor.repository.state.revision;proof.snapshots=0;proof.originalSnapshot=proof.editor.repository.snapshot;proof.editor.repository.snapshot=function(...args){proof.snapshots++;return proof.originalSnapshot.apply(this,args)};`);
 await send('Input.insertText',{text:'https://vimeo.com/76979871'},sessionId);
 assert.equal(await evaluate('proof.editor.interchange.busy()'),false);assert.equal(await evaluate('proof.snapshots'),0);assert.deepEqual(external,[]);assert.deepEqual(acquisitions,[]);
 await evaluate('proof.editor.repository.snapshot=proof.originalSnapshot;proof.editor.repository.undo()');
 await inspect('https://example.org/page','Import html as native Ink at the destination');
 await wait(`proof.editor.interchange.question()?.title==='Allow linked-resource acquisition?'`);assert.deepEqual(acquisitions,[]);await click('Cancel operation');await wait('!proof.editor.interchange.busy()');assert.deepEqual(acquisitions,[]);
 await inspect('https://example.org/page','Import html as native Ink at the destination');await wait(`proof.editor.interchange.question()?.title==='Allow linked-resource acquisition?'`);await click('Continue');await wait(`proof.editor.interchange.question()?.title==='Confirm conversion losses'`);await click('Continue');await wait(`proof.editor.interchange.question()?.title==='External images'`);assert.deepEqual(acquisitions,['https://example.org/page']);assert.deepEqual(external,[]);await click('Keep placeholders');await wait('!proof.editor.interchange.busy()');assert.match(await evaluate('Object.values(proof.editor.repository.readState().contents).map(c=>c.payload.text??"").join("")'),/Remote semantic text/);
 await evaluate('proof.editor.repository.undo()');
 await inspect('https://www.youtube.com/watch?v=M7lc1UVf-VE','Insert passive VideoBlock (no network)');await wait('!proof.editor.interchange.busy()');
 await wait(`document.querySelector('.mutable-video-block')`);assert.deepEqual(external,[]);
 await evaluate(`proof.video=()=>Object.values(proof.active().state.nodes).find(n=>n.viewType==='mutable/video-block');proof.videoId=proof.video().payload.id;proof.videoRoot=()=>proof.editor.mounts.get(proof.video().key).root;proof.videoRevision=proof.editor.repository.state.revision;`);
 assert.equal(await evaluate('!!proof.videoRoot().querySelector("iframe")'),false);
 // Manual native persistence contains only the descriptor, not runtime activation.
 await evaluate(`(async()=>{proof.docId=proof.active().state.nodes[proof.active().state.rootKey].payload.id;proof.saved=await proof.native.save(proof.docId,{folder:'.',filename:'video.ink'});})()`);assert.equal(await evaluate('proof.saved.phase'),'saved');
 const reopened=await evaluate(`(async()=>{const {ReactiveEditor}=await import('/src/reactive-editor/editor.ts');const {nativeDocumentSession}=await import('/src/persistence/native-session.ts');const fresh=new ReactiveEditor({id:'fresh',type:'workspace-block',children:[{id:'bank',type:'workspace-object-bank-block',children:[]}]});try{await nativeDocumentSession(fresh).open({folder:'.',filename:'video.ink'});return Object.values(fresh.repository.readState().contents).find(c=>c.viewType==='mutable/video-block').payload;}finally{fresh.dispose();}})()`);assert.equal(reopened.video.canonicalUrl,'https://www.youtube.com/watch?v=M7lc1UVf-VE');assert.equal(reopened.active,undefined);
 await evaluate('proof.videoRoot().querySelector("button").click()');await wait('!!proof.videoRoot().querySelector("iframe")');
 const policy=await evaluate(`(()=>{const f=proof.videoRoot().querySelector('iframe');return {src:f.src,sandbox:f.getAttribute('sandbox'),allow:f.getAttribute('allow'),referrer:f.referrerPolicy}})()`);assert.equal(policy.src,'https://www.youtube-nocookie.com/embed/M7lc1UVf-VE?autoplay=0');assert.equal(policy.sandbox,'allow-scripts allow-same-origin allow-presentation');assert.equal(policy.allow,'fullscreen; picture-in-picture');assert.equal(policy.referrer,'strict-origin-when-cross-origin');assert.equal(await evaluate('proof.editor.repository.state.revision'),await evaluate('proof.videoRevision'));
 // Deliberate live smoke test. Playback availability is reported, never used to relax policy.
 await new Promise(r=>setTimeout(r,8000));const youtubeTargets=await playerStatus();
 await evaluate('proof.videoRoot().querySelector("button").click()');assert.equal(await evaluate('!!proof.videoRoot().querySelector("iframe")'),false);
 await evaluate('proof.editor.repository.undo()');assert.equal(await evaluate('!!proof.video()'),false);await evaluate('proof.editor.repository.redo()');assert.equal(await evaluate('!!proof.videoRoot().querySelector("iframe")'),false);
 await inspect('https://vimeo.com/76979871','Insert passive VideoBlock (no network)');await wait('!proof.editor.interchange.busy()');
 await evaluate(`proof.vimeo=()=>Object.values(proof.active().state.nodes).find(n=>n.viewType==='mutable/video-block'&&n.payload.video.provider==='vimeo');proof.vimeoRoot=()=>proof.editor.mounts.get(proof.vimeo().key).root;proof.vimeoRoot().querySelector('button').click()`);await wait(`!!proof.vimeoRoot().querySelector('iframe')`);await new Promise(r=>setTimeout(r,8000));const vimeoTargets=await playerStatus();
 await evaluate(`proof.editor.commands.remove(proof.vimeo().key)`);assert.equal(await evaluate('document.querySelectorAll(".mutable-video-block iframe").length'),0);
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({passed:['network-free ordinary URL input','no acquisition before consent or after cancellation','shared remote transport, worker, insertion and separate image consent','passive VideoBlock insertion','manual native save/reopen','one-step Undo/Redo remains passive','fixed provider URL, no autoplay and restricted permissions','explicit player activation/unload and deletion'],acquisitions,youtubeTargets,vimeoTargets,external,errors},null,2));
 await evaluate('proof.dispose();proof.session.dispose()');
}finally{socket?.close();chrome.kill();await assets.close();await vite.close();await closeFilesystemWorkers();await rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:200});await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
process.exit(0);
