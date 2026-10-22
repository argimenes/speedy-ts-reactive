// Profile typing in the real Flint shell using an in-memory copy of a native Document.
// Reads the fixture only; never saves it. BENCHMARK_DOCUMENT_PATH selects another
// native resource; BENCHMARK_VAULT_SIZE adds unopened entries to an in-memory
// vault (e.g. 1000). BENCHMARK_OUTPUT selects the artifact directory.
// BENCHMARK_CARET_MODE=normal|block-focus|sentence-focus|reading-spotlight selects session focus.
// BENCHMARK_CARET_MODES=false disables the feature for comparison.
// BENCHMARK_POINTER_SPOTLIGHT=1 enables and verifies the mouse-controlled lighting.
// BENCHMARK_NATIVE_GPU=1 uses Chrome's default GPU instead of software SwiftShader.
// BENCHMARK_STANDOFF_RENDERING=false selects the previous rendering path.
// BENCHMARK_ANNOTATION_RANGE_EVENTS=false disables caret emphasis for comparison.
// BENCHMARK_DETERMINISTIC_ACADEMIC=false disables the new academic handlers.
// BENCHMARK_WEB_RESOURCES=false disables G; BENCHMARK_WEB_SOURCE=1 mounts a captured web preview.
// BENCHMARK_ACADEMIC_SOURCE=1 mounts an OCR source beside the measured native paragraph.
// BENCHMARK_MUTABLE_CLIPBOARD=false selects legacy clipboard routing for comparison.
// BENCHMARK_FLINT_RECENTS=false disables recent-document navigation history for comparison.
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
const artifacts=process.env.BENCHMARK_OUTPUT??'/tmp/autocomplete-browser';await mkdir(artifacts,{recursive:true});
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
 const session=new WorkspaceSession(materializeLocalWorkspace({type:'workspace-block',children:[]}),{features:{everydayWebResources:${process.env.BENCHMARK_EVERYDAY_WEB!=='false'},webResourceViewers:${process.env.BENCHMARK_WEB_RESOURCES!=='false'},deterministicAcademicResources:${process.env.BENCHMARK_DETERMINISTIC_ACADEMIC!=='false'},flintRecentDocuments:${process.env.BENCHMARK_FLINT_RECENTS!=='false'},webPublishing:${process.env.BENCHMARK_WEB_PUBLISHING!=='false'},applicationServices:${process.env.BENCHMARK_APPLICATION_SERVICES!=='false'},documentInterchange:${process.env.BENCHMARK_DOCUMENT_INTERCHANGE!=='false'},mutableClipboard:${process.env.BENCHMARK_MUTABLE_CLIPBOARD!=='false'},nativeDocumentPersistence:${!!process.env.BENCHMARK_VAULT_SIZE},nativeKnowledge:false,sqliteKnowledge:false,flintProbe:false,flintSceneChrome:true,annotationRangeEvents:${process.env.BENCHMARK_ANNOTATION_RANGE_EVENTS!=='false'},caretModes:${process.env.BENCHMARK_CARET_MODES!=='false'},standoffPropertyRendering:${process.env.BENCHMARK_STANDOFF_RENDERING!=='false'}}});
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
 const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const n=++id;const timer=setTimeout(()=>{pending.delete(n);reject(Error('CDP timeout '+method));},45000);pending.set(n,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});socket.send(JSON.stringify({id:n,method,params,...(sessionId?{sessionId}:{})}));});
 const {targetId}=await send('Target.createTarget',{url:'about:blank'}),{sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
 const evaluate=async expression=>{if(process.env.AUTOCOMPLETE_TRACE)console.log('EVAL '+expression.slice(0,180));const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value;};
 const wait=condition=>evaluate(`(async()=>{for(let i=0;i<300;i++){if(${condition})return;await new Promise(r=>setTimeout(r,50));}throw Error('Timed out: '+${JSON.stringify(condition)}+'; '+document.querySelector('.autocomplete-workstation')?.textContent+'; active '+document.activeElement?.outerHTML.slice(0,200)+'; source '+proof.read())})()`);
 await send('Page.bringToFront',{},sessionId);await send('Runtime.enable',{},sessionId);await send('Emulation.setDeviceMetricsOverride',{width:1500,height:990,deviceScaleFactor:1,mobile:false},sessionId);
 await send('Page.navigate',{url:`http://127.0.0.1:${vite.httpServer.address().port}/__flint-integration`},sessionId);
 await wait("window.proof && document.querySelector('.flint-compact .reactive-standoff-flow')");
 await evaluate(`proof.root=proof.host.querySelector('.flint-application');proof.view=[...proof.editor.projections.values()].find(v=>v!==proof.session.projection);proof.text=Object.values(proof.view.state.nodes).filter(n=>n.viewType==='standoff-editor-block').sort((a,b)=>b.inlineContent.length-a.inlineContent.length)[0];proof.mount=proof.editor.mounts.get(proof.text.key);proof.flow=proof.mount.root.querySelector('.reactive-standoff-flow')??proof.mount.root;proof.editor.focus.request(proof.text.key);proof.mount.restoreInlineSelection({anchor:100,head:100});`);
 const checks=[];
 const check=(name,value)=>{assert.ok(value,name);checks.push(name);console.log('PASS '+name);};
 await evaluate(`(async()=>{
  const {registerStandaloneEntityService}=await import('/src/application/entity-service.ts');
  const entities=[{id:'11111111-1111-4111-8111-111111111111',name:'Leonardo da Vinci',revision:0,aliases:[]},{id:'22222222-2222-4222-8222-222222222222',name:'Michelangelo',revision:0,aliases:[]}];
  proof.requests=0;proof.stopEntity=registerStandaloneEntityService(proof.editor,()=>({historyScope:async()=>'qualification',names:async()=>entities,dbMentions:async()=>[],summaries:async()=>({rows:[],complete:true,diagnostics:[]}),get:async id=>entities.find(e=>e.id===id),search:async(q,signal)=>{proof.requests++;await new Promise(r=>setTimeout(r,q.query==='old'?400:20));return {candidates:entities.filter(e=>e.name.toLowerCase().includes(q.query.toLowerCase())).map(e=>({...e,evidence:[{kind:'name',text:e.name}]})),complete:true,diagnostics:[],current(){signal.throwIfAborted();}};},dispose(){}}));
  proof.read=()=>proof.text.inlineContent.map(k=>String(proof.editor.node(k).payload.text??'')).join('');
  proof.reset=(text='')=>{proof.editor.completionInput.cancel();proof.editor.commands.replaceInlineRange(proof.text.key,0,proof.text.inlineContent.length,text);proof.editor.focus.request(proof.text.key);proof.mount.restoreInlineSelection({anchor:[...text].length,head:[...text].length});};
  proof.reset();
 })()`);
 const type=async text=>{for(const c of text)await send('Input.insertText',{text:c},sessionId);};
 const key=async(key,modifiers=0)=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key,modifiers,windowsVirtualKeyCode:({Enter:13,Escape:27,ArrowDown:40,Tab:9})[key]??key.toUpperCase().charCodeAt(0)},sessionId);await send('Input.dispatchKeyEvent',{type:'keyUp',key,modifiers},sessionId);};
 await type('@Leo');
 await wait("document.querySelector('.autocomplete-results [role=option]')");
 check('Inline completion keeps real Flint editing focus',await evaluate('document.activeElement===proof.mount.focusElement'));
 await key('Enter');await evaluate('new Promise(r=>setTimeout(r,300))');await wait("!document.querySelector('.autocomplete-workstation')");
 check('Entity commit preserves authored label and canonical GUID',await evaluate(`proof.read()==='Leo'&&proof.text.payload.standoffProperties.some(p=>p.type==='codex/entity-reference'&&p.value==='11111111-1111-4111-8111-111111111111')`));
 await key('z',4);await wait("proof.read()==='@Leo'");check('One native Undo restores literal invocation',true);
 await evaluate('proof.reset()');await type('@Leo');await key('Escape');check('Escape preserves typed literal',await evaluate("proof.read()==='@Leo'&&!document.querySelector('.autocomplete-workstation')"));
 await evaluate(`proof.reset('the Florentine master')`);await evaluate('proof.mount.restoreInlineSelection({anchor:0,head:21})');await type(':');
 await wait("document.querySelector('.autocomplete-workstation input')");
 check('Colon over selection preserves source text',await evaluate("proof.read()==='the Florentine master'"));
 await type('Leonardo');await wait("document.querySelector('.autocomplete-results [role=option]')");await key('Enter');await wait("!document.querySelector('.autocomplete-workstation')");
 check('Independent query commits original selected wording',await evaluate("proof.read()==='the Florentine master'"));
 await evaluate(`proof.reset('he he he');proof.editor.commands.replaceAndAnnotate(proof.text.key,3,5,'he','codex/entity-reference','22222222-2222-4222-8222-222222222222',{entityId:'22222222-2222-4222-8222-222222222222',entityName:'Michelangelo'});proof.mount.restoreInlineSelection({anchor:0,head:2})`);
 await type(':');await wait("document.querySelector('.autocomplete-workstation input')");await type('Leonardo');await wait("document.querySelector('.autocomplete-results [role=option]')");
 await key('a',2);await wait("document.querySelector('.entity-candidates__bind:not([disabled])')");
 check('Scoped Ctrl+A previews three matches with conflicting reference excluded',await evaluate("document.querySelectorAll('[data-candidate-row]').length===3&&document.querySelectorAll('[data-candidate-row] input:disabled').length===1"));
 await evaluate(`document.querySelector('.entity-candidates__bind').scrollIntoView({block:'nearest'});new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`);
 const bindPoint=await evaluate(`(()=>{const r=document.querySelector('.entity-candidates__bind').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`);
 await send('Input.dispatchMouseEvent',{type:'mousePressed',...bindPoint,button:'left',clickCount:1},sessionId);await send('Input.dispatchMouseEvent',{type:'mouseReleased',...bindPoint,button:'left',clickCount:1},sessionId);
 await wait("!document.querySelector('.reactive-entity-search')");
 check('Reviewed batch binds eligible occurrences and preserves conflict',await evaluate("proof.text.payload.standoffProperties.filter(p=>p.type==='codex/entity-reference').length===3"));
 await key('z',4);check('Batch Undo restores precisely the prior conflicting reference',await evaluate("proof.text.payload.standoffProperties.filter(p=>p.type==='codex/entity-reference').length===1"));

 await evaluate('proof.reset()');await type('/date');await wait("document.querySelector('.autocomplete-results [role=option]')");await key('Enter');await wait("!document.querySelector('.autocomplete-workstation')");check('Slash date uses real text transaction',await evaluate("/^\\d{4}-\\d{2}-\\d{2}$/.test(proof.read())"));
 await evaluate('proof.reset()');await type('@Leo');await wait("document.querySelector('.autocomplete-workstation')");
 await evaluate(`proof.flow.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true,data:'あ'}))`);
 check('IME cancels optional completion without deleting text',await evaluate("!document.querySelector('.autocomplete-workstation')&&proof.read()==='@Leo'"));
 await evaluate(`proof.flow.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:''}));proof.reset('literal ')`);
 await type('\\@Leo');check('Backslash escape remains literal',await evaluate("!document.querySelector('.autocomplete-workstation')"));
 await evaluate('proof.reset()');await type('@old');await key('Escape');await evaluate('new Promise(r=>setTimeout(r,450))');check('Late resolver cannot reopen cancelled popup',await evaluate("!document.querySelector('.autocomplete-workstation')"));
 await evaluate('proof.reset()');await type('@Leo');await wait("document.querySelector('.autocomplete-results [role=option]')");
 await send('Emulation.setDeviceMetricsOverride',{width:620,height:450,deviceScaleFactor:1,mobile:false},sessionId);await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
 check('Popup stays within resized viewport',await evaluate(`(()=>{const r=document.querySelector('.autocomplete-workstation').getBoundingClientRect();return r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight})()`));
 await writeFile(path.join(artifacts,'popup.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'},sessionId)).data,'base64'));
 await evaluate(`document.querySelector('.autocomplete-query').click()`);await wait("document.querySelector('.autocomplete-workstation input')===document.activeElement");await key('Tab');check('Tab traverses workstation controls without dismissing or changing source',await evaluate("!!document.querySelector('.autocomplete-workstation')&&document.activeElement?.tagName==='SELECT'&&proof.read()==='@Leo'"));
 await key('Escape');
 await send('Emulation.setDeviceMetricsOverride',{width:1500,height:990,deviceScaleFactor:1,mobile:false},sessionId);
 await evaluate('proof.reset()');await type('@Leo');await wait("document.querySelector('.autocomplete-results [role=option]')");
 await evaluate(`proof.owner=proof.editor.windowManager.ownerForNode(proof.text.key);proof.editor.windowManager.lifecycle.minimize(proof.owner)`);await wait("!document.querySelector('.autocomplete-workstation')");
 check('Owner minimization dismisses completion and preserves unsaved literal',await evaluate("proof.read()==='@Leo'"));
 await evaluate('proof.editor.windowManager.lifecycle.reveal(proof.owner);proof.reset()');await type('@Leo');await wait("document.querySelector('.autocomplete-results [role=option]')");
 await evaluate("proof.editor.commandRegistry.execute('flint.open',{targetKey:proof.session.projection.state.rootKey,args:undefined})");await wait("!document.querySelector('.autocomplete-workstation')");
 check('Another actual Flint window cancels the source completion without mutation',await evaluate("proof.read()==='@Leo'&&document.querySelectorAll('.flint-application').length===2"));
 check('No browser exceptions' ,errors.length===0);
 await writeFile(path.join(artifacts,'results.json'),JSON.stringify({checks,errors,isolatedEntityResolver:true,realFlintComponents:true},null,2));
 console.log(JSON.stringify({checks,errors},null,2));
 await evaluate('proof.stopEntity();proof.dispose();proof.session.dispose()');

}finally{await serviceLoad?.stop();socket?.close();chrome.kill();await vite.close();await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
process.exit(0);
