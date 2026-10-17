// Stage A real Flint workflow in a disposable Cavern, with no user preference changes.
import {mkdtemp,rm,readFile,writeFile,readdir} from 'node:fs/promises';
import path from 'node:path';import os from 'node:os';import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';import {unzipSync} from 'fflate';import express from 'express';import {createServer} from 'vite';
import {createCavernLifecycle} from '../dist/server/cavern-lifecycle.js';
import {closeFilesystemWorkers} from './stage-c-gates/filesystem.mjs';
const root=await mkdtemp(path.join(os.tmpdir(),'publication-browser-')),profile=await mkdtemp(path.join(os.tmpdir(),'publication-chrome-'));
const fixture=await readFile('vaults/imported/documents/michelangelo-letters/1507-02-13-[a7a41cd3].ink');
const lifecycle=createCavernLifecycle({stateFile:path.join(root,'preferences.json')}),app=express();app.use(express.json());app.use('/api/cavern',lifecycle.router);app.use('/api',lifecycle.middleware);
const proof=`
 import {render} from 'solid-js/web';import {createComponent} from 'solid-js';
 import {WorkspaceSession} from '/src/application/workspace-session.ts';import {WorkspacePresentationView} from '/src/application/workspace-presentation-view.tsx';import {materializeLocalWorkspace} from '/src/reactive-editor/workspace-manifest.ts';
 import {admitNative} from '/src/persistence/native-resource.ts';import {nativeDocumentSession} from '/src/persistence/native-session.ts';import '/src/index.css';import '/src/demo/workspace-demo.css';
 export async function boot(scope){
 const session=new WorkspaceSession(materializeLocalWorkspace({type:'workspace-block',children:[]}),{features:{nativeDocumentPersistence:true,nativeKnowledge:false,sqliteKnowledge:false,flintProbe:false,flintSceneChrome:true,webPublishing:true,applicationServices:true}}),editor=session.editor;
 editor.setAssetContext(()=>scope);
 const bank=editor.commands.insert({type:'workspace-object-bank-block',children:[]},{kind:'at',parentKey:session.projection.state.rootKey,index:0});
 const bytes=new Uint8Array(await(await fetch('/__letter')).arrayBuffer());admitNative(editor.repository,bytes,editor.repository.readState().placements[bank].contentKey);
 const native=nativeDocumentSession(editor);native.bind(${JSON.stringify(JSON.parse(fixture).resourceId)},{folder:'.',filename:'letter.ink'},{nativeHash:null,markdownHash:null,generation:null});
 editor.commandRegistry.execute('flint.open',{targetKey:session.projection.state.rootKey,args:undefined});
 const win=Object.values(session.projection.state.nodes).find(n=>n.viewType==='window-block');editor.commands.setPayloadField(win.key,'metadata',{...JSON.parse(JSON.stringify(win.payload.metadata)),size:{w:1400,h:900},position:{x:20,y:20}});
 const host=document.getElementById('root');host.className='workspace-demo workspace-demo--canonical';render(()=>createComponent(WorkspacePresentationView,{session}),host);editor.installGateway(document);window.proof={session,editor,native};
 }
`;
const vite=await createServer({server:{host:'127.0.0.1',port:0,hmr:false},plugins:[{name:'publication-browser-proof',resolveId(id){if(id==='/__publication-proof.js')return '\0publication-proof';},load(id){if(id==='\0publication-proof')return proof;},configureServer(server){server.middlewares.use('/api',(req,res,next)=>{req.url='/api'+req.url;app(req,res,next);});server.middlewares.use('/__letter',(_req,res)=>res.end(fixture));server.middlewares.use('/__publication',async(req,res)=>{res.setHeader('Content-Type','text/html');res.end(await server.transformIndexHtml('/__publication','<!doctype html><title>Stage A</title><div id="root"></div>'));});}}]});
await vite.listen();const url=vite.resolvedUrls.local[0];
const opened=await fetch(url+'api/cavern/establish',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path:path.join(root,'cavern'),intent:'create'})}).then(r=>r.json());assert.equal(opened.Success,true,opened.Error);const scope={cavernId:opened.Data.current.cavernGuid,session:opened.Data.current.session};
await writeFile(path.join(root,'cavern','letter.ink'),fixture);
const chrome=spawn(process.env.CHROME_BIN??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank']);let socket;
try{
 const endpoint=await new Promise((resolve,reject)=>{let out='';chrome.stderr.on('data',b=>{out+=b;const m=out.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(m)resolve(m[1]);});chrome.once('error',reject);setTimeout(()=>reject(Error('Chrome startup timeout')),15000).unref();});
 socket=new WebSocket(endpoint);await new Promise(r=>socket.addEventListener('open',r,{once:true}));let id=0;const pending=new Map();
 socket.addEventListener('message',e=>{const m=JSON.parse(e.data),p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}});
 const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const key=++id,timer=setTimeout(()=>reject(Error('CDP timeout '+method)),30000);pending.set(key,{resolve,reject,timer});socket.send(JSON.stringify({id:key,method,params,sessionId}));});
 const {targetId}=await send('Target.createTarget',{url:'about:blank'}),{sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},sessionId);if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 const wait=async expression=>{for(let i=0;i<200;i++){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,100));}throw Error('Browser wait: '+expression+'\n'+await evaluate('document.body.innerText'));};
 const click=async text=>{const selector=`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)}&&!b.matches(':disabled'))`;await wait(selector);await evaluate(`${selector}.click()`);};
 await send('Page.navigate',{url:url+'__publication'},sessionId);await new Promise(r=>setTimeout(r,500));
 await evaluate(`(async()=>{window.scope=${JSON.stringify(scope)};await(await import('/__publication-proof.js')).boot(scope)})()`);
 await wait("document.querySelector('.flint-application .reactive-standoff-flow')");
 await evaluate("window.beforePublicationRevision=proof.editor.repository.state.revision;window.publicationSnapshots=0;const snapshot=proof.editor.repository.snapshot.bind(proof.editor.repository);proof.editor.repository.snapshot=(...a)=>{publicationSnapshots++;return snapshot(...a)}");
 // Use the actual Flint menu, not a separately mounted dialog.
 await evaluate("document.querySelector('.flint-application__menu-button')?.click()");
 if(!await evaluate("[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Publish to Web…')")){
  const buttons=await evaluate("[...document.querySelectorAll('.flint-application button')].map(b=>({text:b.textContent,title:b.title,aria:b.getAttribute('aria-label')}))");
  const menu=buttons.find(b=>/menu/i.test(b.aria??b.title??b.text));if(menu)await evaluate(`[...document.querySelectorAll('.flint-application button')].find(b=>b.getAttribute('aria-label')===${JSON.stringify(menu.aria)}&&b.title===${JSON.stringify(menu.title)}).click()`);
 }
 await click('Publish to Web…');await wait("document.querySelector('.publication-dialog')");
 await click('Review site settings');await click('Confirm and save site settings');
 await wait("document.querySelector('.publication-dialog select').value");
 await evaluate("[...document.querySelectorAll('.publication-dialog label')].find(l=>l.textContent.includes('Use the saved native')).querySelector('input').click()");
 await click('Review publication');await wait("document.querySelector('.publication-dialog').textContent.includes('awaiting-approval')");
 assert.ok(await evaluate("document.querySelector('.publication-dialog').textContent.includes('Public reading text')||document.querySelector('.publication-dialog').textContent.includes('Review public reading text')"));
 await click('Approve reviewed content and build');await wait("document.querySelector('.publication-dialog').textContent.includes('completed — Complete')");
 await click('Prepare isolated preview');await wait("document.querySelector('.publication-dialog a[target=_blank]')");
 const preview=await evaluate("document.querySelector('.publication-dialog a[target=_blank]').href");assert.notEqual(new URL(preview).origin,new URL(url).origin);
 const {targetId:previewId}=await send('Target.createTarget',{url:preview}),{sessionId:previewSession}=await send('Target.attachToTarget',{targetId:previewId,flatten:true});await new Promise(r=>setTimeout(r,700));
 const page=await send('Runtime.evaluate',{expression:"({text:document.body.innerText,main:!!document.querySelector('main'),scripts:document.scripts.length,opener:!!window.opener})",returnByValue:true},previewSession);assert.ok(page.result.value.main);assert.equal(page.result.value.scripts,0);assert.equal(page.result.value.opener,false);assert.ok(page.result.value.text.includes('Published document'));
 await send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:path.join(root,'downloads')});await click('Export site ZIP');await wait("!document.querySelector('.publication-dialog fieldset').disabled");
 let downloaded;for(let i=0;i<100&&!downloaded;i++){downloaded=(await readdir(path.join(root,'downloads')).catch(()=>[])).find(n=>n.endsWith('.zip'));if(!downloaded)await new Promise(r=>setTimeout(r,100));}
 assert.ok(downloaded,'Browser must complete the ZIP download');const exported=unzipSync(await readFile(path.join(root,'downloads',downloaded)));assert.ok(exported['index.html']);assert.ok(exported['reader.css']);
 const apiConnect=`window.client=new(await import('/src/runtime/application-services.ts')).HttpApplicationServices(()=>scope);`;
 const result=await evaluate(`(async()=>{${apiConnect}const s=(await client.call('publication.sites.list',{})).sites[0];return {site:s,jobs:(await client.call('publication.jobs.list',{siteId:s.id})).jobs}})()`);assert.equal(result.jobs[0].state,'completed');
 await click('Close');await wait("!document.querySelector('.publication-dialog')");assert.equal((await fetch(preview)).status,404);
 assert.deepEqual(await readFile(path.join(root,'cavern','letter.ink')),fixture);
 assert.equal(await evaluate('proof.editor.repository.state.revision'),await evaluate('beforePublicationRevision'));assert.equal(await evaluate('publicationSnapshots'),0);
 console.log(JSON.stringify({browser:await evaluate('navigator.userAgent'),flintMenu:true,savedOnly:true,siteId:result.site.id,workflow:result.jobs[0].state,isolatedPreview:page.result.value,originalNativeUnchanged:true,editorRevisionUnchanged:true,editorSnapshots:0,downloadedZipVerified:true},null,2));
}finally{socket?.close();chrome.kill();await vite.close();await lifecycle.close();await closeFilesystemWorkers();await rm(root,{recursive:true,force:true});await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
