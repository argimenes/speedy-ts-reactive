// LER qualification in real Flint, using an in-memory Document and isolated Entity resolver.
// Reads the fixture only; never saves it or opens a user vault.
// BENCHMARK_DOCUMENT_PATH selects a native fixture; BENCHMARK_OUTPUT selects artifacts.
import {spawn} from 'node:child_process';
import {mkdtemp, rm, mkdir, writeFile, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
const fixture=await readFile(process.env.BENCHMARK_DOCUMENT_PATH??'vaults/imported/documents/michelangelo-letters/1507-02-13-[a7a41cd3].ink');
const artifacts=process.env.BENCHMARK_OUTPUT??'/tmp/ler-browser';await mkdir(artifacts,{recursive:true});
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
 const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const n=++id;const timer=setTimeout(()=>{pending.delete(n);reject(Error('CDP timeout '+method));},45000);pending.set(n,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});socket.send(JSON.stringify({id:n,method,params,...(sessionId?{sessionId}:{})}));});
 const {targetId}=await send('Target.createTarget',{url:'about:blank'}),{sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
 const evaluate=async expression=>{if(process.env.AUTOCOMPLETE_TRACE)console.log('EVAL '+expression.slice(0,180));const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value;};
 const wait=condition=>evaluate(`(async()=>{for(let i=0;i<300;i++){if(${condition})return;await new Promise(r=>setTimeout(r,50));}throw Error('Timed out: '+${JSON.stringify(condition)}+'; '+document.querySelector('.autocomplete-workstation')?.textContent+'; active '+document.activeElement?.outerHTML.slice(0,200)+'; query '+document.querySelector('.autocomplete-workstation input')?.value+'; source '+proof.read())})()`);
 await send('Page.bringToFront',{},sessionId);await send('Runtime.enable',{},sessionId);await send('Emulation.setDeviceMetricsOverride',{width:1500,height:990,deviceScaleFactor:1,mobile:false},sessionId);
 await send('Page.navigate',{url:`http://127.0.0.1:${vite.httpServer.address().port}/__flint-integration`},sessionId);
 await wait("window.proof && document.querySelector('.flint-compact .reactive-standoff-flow')");
 await evaluate(`proof.root=proof.host.querySelector('.flint-application');proof.view=[...proof.editor.projections.values()].find(v=>v!==proof.session.projection);proof.text=Object.values(proof.view.state.nodes).filter(n=>n.viewType==='standoff-editor-block').sort((a,b)=>b.inlineContent.length-a.inlineContent.length)[0];proof.mount=proof.editor.mounts.get(proof.text.key);proof.flow=proof.mount.root.querySelector('.reactive-standoff-flow')??proof.mount.root;proof.editor.focus.request(proof.text.key);proof.mount.restoreInlineSelection({anchor:100,head:100});`);
 const checks=[];
 const check=(name,value)=>{if(!value)console.error(JSON.stringify(errors,null,2));assert.ok(value,name);checks.push(name);console.log('PASS '+name);};
 await evaluate(`(async()=>{
  const {registerStandaloneEntityService}=await import('/src/application/entity-service.ts');
  const entities=[{id:'11111111-1111-4111-8111-111111111111',name:'Leonardo da Vinci',revision:0,aliases:[]},{id:'22222222-2222-4222-8222-222222222222',name:'Michelangelo',revision:0,aliases:[]}];
  proof.entities=entities;proof.created=[];proof.aliasWrites=[];proof.requests=0;proof.serviceOpened=0;proof.serviceClosed=0;proof.stopEntity=registerStandaloneEntityService(proof.editor,()=>{proof.serviceOpened++;return({historyScope:async()=>'qualification',names:async()=>entities,dbMentions:async()=>[],summaries:async()=>({rows:[],complete:true,diagnostics:[]}),get:async id=>{if(proof.holdGet)await new Promise(r=>proof.releaseGet=r);return entities.find(e=>e.id===id);},create:async input=>{const entity={id:input.id,name:input.name,revision:0,aliases:[]};entities.push(entity);proof.created.push(input);return entity;},alias:async input=>{const entity=entities.find(e=>e.id===input.entityId);entity.aliases.push({id:input.id,name:input.name,revision:0,origin:'authored'});proof.aliasWrites.push(input);return entity;},search:async(q,signal)=>{proof.requests++;await new Promise(r=>setTimeout(r,q.query==='old'?400:20));return {candidates:entities.filter(e=>e.name.toLowerCase().includes(q.query.toLowerCase())).map(e=>({...e,evidence:[{kind:'name',text:e.name}]})),complete:true,diagnostics:[],current(){signal.throwIfAborted();}};},dispose(){proof.serviceClosed++;}});});
  proof.read=()=>proof.text.inlineContent.map(k=>String(proof.editor.node(k).payload.text??'')).join('');
  proof.display=()=>proof.flow.textContent;
  proof.reset=(text='')=>{proof.editor.completionInput.cancel();proof.editor.commands.replaceInlineRange(proof.text.key,0,proof.text.inlineContent.length,text);proof.editor.focus.request(proof.text.key);proof.mount.restoreInlineSelection({anchor:[...text].length,head:[...text].length});};
  const document=proof.editor.blockQueries.ancestorPath(proof.text.key).find(n=>n.viewType==='document-block');
  for(const type of ['mutable/citation-block','mutable/web-article-block'])proof.editor.commands.insert({type,blockProperties:[{id:'scry-proxy-regression',type:'codex/entity-reference',value:'33333333-3333-4333-8333-333333333333',metadata:{entityName:'Regression reference'}}]},{kind:'at',parentKey:document.key,index:document.children.length});
  proof.reset();
 })()`);
 const type=async text=>{for(const c of text)await send('Input.insertText',{text:c},sessionId);};
 const key=async(key,modifiers=0)=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key,modifiers,...(key==='a'&&modifiers===4?{commands:['selectAll']}:{}),windowsVirtualKeyCode:({Enter:13,Escape:27,ArrowDown:40,ArrowUp:38,ArrowLeft:37,ArrowRight:39,Home:36,End:35,Backspace:8,Delete:46,Tab:9})[key]??key.toUpperCase().charCodeAt(0)},sessionId);await send('Input.dispatchKeyEvent',{type:'keyUp',key,modifiers},sessionId);};


 const reset=async(text='Leo met Leo')=>{await evaluate(`proof.reset(${JSON.stringify(text)});proof.mount.restoreInlineSelection({anchor:0,head:3})`);};
 const open=async()=>{await evaluate("proof.editor.commandRegistry.execute('entity.open',{targetKey:proof.text.key,args:undefined})");await wait("document.querySelector('.ler-instrument [role=option]')");};
 const query=async(text)=>{await evaluate(`(()=>{const e=document.querySelector('[aria-label="Search entities"]');e.focus();e.select();})()`);await send('Input.insertText',{text},sessionId);await evaluate('new Promise(r=>setTimeout(r,250))');};
 const command=async()=>evaluate("document.querySelector('.ler-instrument [role=listbox]').focus()");
 const click=async(label)=>evaluate(`(()=>{const panel=document.querySelector('.ler-instrument'),b=[...panel.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)});if(!b)throw Error('Missing '+${JSON.stringify(label)});b.click();})()`);
 await reset();await open();
 check('Explicit LER opens with Command focus',await evaluate("document.activeElement.getAttribute('role')==='listbox'"));
 const character=async c=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key:c,text:c,unmodifiedText:c,windowsVirtualKeyCode:c.toUpperCase().charCodeAt(0)},sessionId);await send('Input.dispatchKeyEvent',{type:'keyUp',key:c,windowsVirtualKeyCode:c.toUpperCase().charCodeAt(0)},sessionId);};
 await character('M');check('First unassigned character enters query and is inserted once',await evaluate("document.activeElement.getAttribute('aria-label')==='Search entities'&&document.activeElement.value==='M'"));
 await character('0');check('Digits remain literal while editing',await evaluate("document.activeElement.value==='M0'"));
 await query('Leonardo');await evaluate('document.activeElement.setSelectionRange(1,4)');await key('.',4);
 check('Command period switches Query to Command without changing the query',await evaluate("document.activeElement.getAttribute('role')==='listbox'&&document.querySelector('[aria-label=\"Search entities\"]').value==='Leonardo'"));
 await key('.',2);check('Control period returns to Query with the caret selection intact',await evaluate("document.activeElement.getAttribute('aria-label')==='Search entities'&&document.activeElement.selectionStart===1&&document.activeElement.selectionEnd===4"));
 await key('.',4);await key('*',8);check('Star toggles immediately',await evaluate("document.querySelector('[aria-label=\"Entity match\"]').value==='exact'"));
 await key('@',8);check('At cycles fields immediately',await evaluate("document.querySelector('[aria-label=\"Entity stream\"]').value==='name'"));
 await evaluate('new Promise(r=>setTimeout(r,250))');await key('Enter',8);await wait("document.querySelector('.ler-prepared')");
 check('Preparation preserves source without annotations',await evaluate("proof.read()==='Leo met Leo'&&!proof.text.payload.standoffProperties?.length"));
 await key('a',2);await wait("document.querySelectorAll('[data-candidate-row]').length===2");
 check('Expansion uses original A despite independent B',await evaluate("document.querySelector('[aria-label=\"Mention text\"]').value==='Leo'&&document.querySelector('[aria-label=\"Search entities\"]').value==='Leonardo'&&document.querySelector('.ler-context').textContent.includes('2 accepted')"));
 await send('Page.captureScreenshot',{format:'png'},sessionId).then(r=>writeFile(path.join(artifacts,'ler-review.png'),Buffer.from(r.data,'base64')));
 await click('← Results');await command();await key('Enter');await wait("!document.querySelector('.ler-instrument')");
 check('Enter commits entire accepted collection immediately',await evaluate("proof.text.payload.standoffProperties.length===2&&proof.read()==='Leo met Leo'"));
 await evaluate('proof.editor.repository.undo()');check('One Undo removes the complete batch',await evaluate("!proof.text.payload.standoffProperties?.length"));
 await evaluate('proof.editor.repository.redo()');await open();await command();await key('~',8);await wait("document.querySelector('[aria-label=\"Entity scope\"]').value==='live'");
 check('Document Entities ignores graph query and includes current unsaved links',await evaluate("document.querySelector('[aria-label=\"Search entities\"]').value===''&&document.querySelector('.ler-status').textContent.includes('linked occurrences')&&[...document.querySelectorAll('.ler-result')].some(r=>r.textContent.includes('Leonardo'))"));
 await send('Page.captureScreenshot',{format:'png'},sessionId).then(r=>writeFile(path.join(artifacts,'ler-document-entities.png'),Buffer.from(r.data,'base64')));
 await evaluate(`proof.lerBody=document.querySelector('.ler-body');proof.lerAncestors=[];for(let e=proof.lerBody.parentElement;e;e=e.parentElement)proof.lerAncestors.push([e,e.scrollTop,e.scrollLeft]);proof.resultVisible=()=>{const row=document.querySelector('.ler-result[aria-selected=true]').getBoundingClientRect(),body=proof.lerBody.getBoundingClientRect();return row.top>=body.top-1&&row.bottom<=body.bottom+1;}`);
 await command();await key('Home');for(let i=0;i<9;i++)await key('ArrowDown');await evaluate('new Promise(r=>requestAnimationFrame(r))');
 check('Arrow Down scrolls the selected result into the list viewport',await evaluate("proof.lerBody.scrollTop>0&&proof.resultVisible()&&document.activeElement.getAttribute('role')==='listbox'"));
 await evaluate("document.querySelector('[aria-label=\"Search entities\"]').focus()");for(let i=0;i<9;i++)await key('ArrowUp');await evaluate('new Promise(r=>requestAnimationFrame(r))');
 check('Arrow Up reveals earlier results without taking query focus',await evaluate("proof.resultVisible()&&proof.lerBody.scrollTop===0&&document.activeElement.getAttribute('aria-label')==='Search entities'"));
 await command();await key('ArrowUp');await evaluate('new Promise(r=>requestAnimationFrame(r))');
 check('Wrapping to the last result scrolls down',await evaluate('proof.lerBody.scrollTop>0&&proof.resultVisible()'));
 await key('ArrowDown');await evaluate('new Promise(r=>requestAnimationFrame(r))');
 check('Wrapping to the first result scrolls up without moving the Document',await evaluate('proof.resultVisible()&&proof.lerBody.scrollTop===0&&proof.lerAncestors.every(([e,top,left])=>e.scrollTop===top&&e.scrollLeft===left)'));
 await key('Escape');await reset('Leo');await type('((');await wait("document.querySelector('.ler-instrument')");
 await key('.',2);
 check('Control period enters Command mode directly from the Scry source',await evaluate("document.activeElement.getAttribute('role')==='listbox'&&proof.read()==='Leo'&&proof.display()==='((Leo))'"));
 await key('*',8);check('Scry command operators work after the mode toggle',await evaluate("document.querySelector('[aria-label=\"Entity match\"]').value==='exact'"));await key('*',8);
 await key('.',4);check('Command period returns Scry to Query mode without changing source',await evaluate("document.activeElement.getAttribute('aria-label')==='Search entities'&&proof.display()==='((Leo))'"));
 await query('Leonardo');await key('a',4);check('Command A in Scry query retains native field selection',await evaluate("document.activeElement.selectionStart===0&&document.activeElement.selectionEnd===document.activeElement.value.length&&!document.querySelector('[data-candidate-row]')"));
 await key('Enter');await wait("!document.querySelector('.ler-instrument')");check('Scry mention commits through existing source adapter',await evaluate("proof.read()==='Leo'&&proof.text.payload.standoffProperties.length===1"));
 await reset('Leo met Leo');await type('((');await query('Leonardo');await command();await key('Enter',8);await wait("document.querySelector('.ler-prepared')");await key('a',2);await wait("document.querySelector('[data-candidate-row]')");
 await click('← Results');await command();await key('Enter');await wait("!document.querySelector('.ler-instrument')");check('Scry draft plus reviewed matches is one atomic operation',await evaluate("proof.read()==='Leo met Leo'&&proof.text.payload.standoffProperties.length===2"));
 await evaluate('proof.editor.repository.undo()');check('Scry batch Undo restores source without links',await evaluate("proof.read()==='Leo met Leo'&&!proof.text.payload.standoffProperties?.length"));
 await reset('Leo');await type('((');await wait("document.querySelector('.ler-instrument')");await query('New canonical name');await key('Enter',4);await wait("!document.querySelector('.ler-instrument')");
 check('Command Enter in Scry query creates the query name and links its GUID to the original source',await evaluate("proof.created.length===1&&proof.created[0].name==='New canonical name'&&proof.read()==='Leo'&&proof.text.payload.standoffProperties.length===1&&proof.text.payload.standoffProperties[0].value===proof.created[0].id"));
 await evaluate('proof.editor.repository.undo()');check('Undo removes the created Entity link while retaining the Entity',await evaluate("proof.read()==='Leo'&&!proof.text.payload.standoffProperties?.length&&proof.entities.some(e=>e.id===proof.created[0].id)"));
 await reset('Leo');await type('((');await wait("document.querySelector('.ler-instrument')");await query('Another canonical name');await evaluate('proof.editor.focus.request(proof.text.key);proof.mount.restoreInlineSelection({anchor:3,head:3})');await key('Enter',2);await wait("!document.querySelector('.ler-instrument')");
 check('Control Enter from the Scry source creates from the independent query and links the source',await evaluate("proof.created.length===2&&proof.created[1].name==='Another canonical name'&&proof.read()==='Leo'&&proof.text.payload.standoffProperties.length===1&&proof.text.payload.standoffProperties[0].value===proof.created[1].id"));
 check('No browser exceptions',errors.length===0);
 await writeFile(path.join(artifacts,'results.json'),JSON.stringify({checks,errors,isolatedEntityResolver:true,realFlintComponents:true},null,2));
 await evaluate('proof.stopEntity();proof.dispose();proof.session.dispose()');
}finally{await serviceLoad?.stop();socket?.close();chrome.kill();await vite.close();await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
process.exit(0);
