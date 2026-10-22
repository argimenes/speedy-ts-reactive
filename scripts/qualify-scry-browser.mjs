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
const artifacts=process.env.BENCHMARK_OUTPUT??'/tmp/scry-browser';await mkdir(artifacts,{recursive:true});
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
  proof.display=()=>{const s=proof.editor.overlays.overlays.find(o=>o.viewType==='autocomplete')?.data.session?.source,chars=[...proof.read()];if(!s?.brackets)return chars.join('');return chars.slice(0,s.start).join('')+(s.brackets==='mention'?'((':'[[')+chars.slice(s.start,s.end).join('')+(s.brackets==='mention'?'))':']]')+chars.slice(s.end).join('');};
  proof.reset=(text='')=>{proof.editor.completionInput.cancel();proof.editor.commands.replaceInlineRange(proof.text.key,0,proof.text.inlineContent.length,text);proof.editor.focus.request(proof.text.key);proof.mount.restoreInlineSelection({anchor:[...text].length,head:[...text].length});};
  const document=proof.editor.blockQueries.ancestorPath(proof.text.key).find(n=>n.viewType==='document-block');
  for(const type of ['mutable/citation-block','mutable/web-article-block'])proof.editor.commands.insert({type,blockProperties:[{id:'scry-proxy-regression',type:'codex/entity-reference',value:'33333333-3333-4333-8333-333333333333',metadata:{entityName:'Regression reference'}}]},{kind:'at',parentKey:document.key,index:document.children.length});
  proof.reset();
 })()`);
 const type=async text=>{for(const c of text)await send('Input.insertText',{text:c},sessionId);};
 const key=async(key,modifiers=0)=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key,modifiers,...(key==='a'&&modifiers===4?{commands:['selectAll']}:{}),windowsVirtualKeyCode:({Enter:13,Escape:27,ArrowDown:40,ArrowUp:38,ArrowLeft:37,ArrowRight:39,Home:36,End:35,Backspace:8,Delete:46,Tab:9})[key]??key.toUpperCase().charCodeAt(0)},sessionId);await send('Input.dispatchKeyEvent',{type:'keyUp',key,modifiers},sessionId);};

 const phrase='The Florentine master',guid='11111111-1111-4111-8111-111111111111';
 const reset=async(text='',at=[...text].length,end=at)=>{await evaluate(`proof.reset(${JSON.stringify(text)});proof.mount.restoreInlineSelection({anchor:${at},head:${end}})`);};
 const source=()=>evaluate('proof.display()');
 const query=async(value)=>{await evaluate(`document.querySelector('.autocomplete-workstation input')?.focus()`);await wait("document.querySelector('.autocomplete-workstation input')===document.activeElement");await key('a',4);await type(value);};
 const confirm=async()=>{await wait("document.querySelector('.reactive-entity-search [aria-label^=\"Select \"]')");await key('Enter');await wait("!document.querySelector('.autocomplete-workstation')");};
 await reset('Leo',0);await type('((');
 check('Round trigger opens Scry in a Document containing citation and web-article Entity references',await evaluate("proof.read()==='Leo'&&!!document.querySelector('.reactive-entity-search')&&[...CSS.highlights.get('mutable-scry-source')][0].toString()==='Leo'"));
 await key('Escape');
 check('Reference metadata remains readable after cancelling Scry',await evaluate("Object.values(proof.view.state.nodes).filter(n=>['mutable/citation-block','mutable/web-article-block'].includes(n.viewType)).every(n=>!Object.isFrozen(n.payload.blockProperties)&&n.payload.blockProperties[0].metadata.entityName==='Regression reference')"));
 await reset('prose');await type('[[');
 check('Square trigger works immediately after prose without a space',await source()==='prose[[]]');
 check('Bracket entry opens one shared Link Entity Reference interface',await evaluate("document.querySelectorAll('.reactive-entity-search').length===1&&document.querySelectorAll('.autocomplete-workstation').length===1&&!document.querySelector('.autocomplete-results')"));
 check('Scry uses a purple range highlight without brackets or authored text changes',await evaluate("proof.read()==='prose'&&CSS.highlights.get('mutable-scry-source').size===1&&!proof.mount.root.querySelector('[data-scry-opening],[data-scry-closing]')&&getComputedStyle(proof.flow,'::highlight(mutable-scry-source)').backgroundColor==='rgb(229, 210, 245)'"));
 check('Both bracket edges expose character and word shortcuts',await evaluate("[...document.querySelectorAll('.entity-boundaries kbd')].map(e=>e.textContent).sort().join('|')===['Ctrl+Alt+Shift+←/→','Ctrl+Alt+←/→','Ctrl+Shift+←/→','Ctrl+←/→'].sort().join('|')"));
 await key('Escape');await reset('Leo',0);
 const clickPoint=await evaluate("(()=>{const b=proof.mount.inlineBoundary(0),r=document.createRange();r.setStart(b.node,b.offset);r.collapse(true);const a=[...r.getClientRects()].find(r=>r.height);return{x:a.left+1,y:a.top+a.height/2}})()");
 await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...clickPoint},sessionId);
 await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...clickPoint},sessionId);
 await type('[[');check('Real pointer caret followed by square trigger opens LER',await evaluate("!!document.querySelector('.reactive-entity-search')&&proof.display().includes('[[')&&proof.display().includes(']]')"));
 check('The native highlight covers the actual source phrase',await evaluate("[...CSS.highlights.get('mutable-scry-source')][0].toString()==='Leo'"));
 await key('Escape');
 check('Cancelling Scry releases its highlight',await evaluate("!CSS.highlights.has('mutable-scry-source')"));
 await reset('Leo',0);await evaluate('proof.servicesBefore=proof.serviceOpened');await type('[[');
 check('One Entity-service lease per merged interaction',await evaluate('proof.serviceOpened===proof.servicesBefore+1'));
 await evaluate("proof.lerElement=document.querySelector('.reactive-entity-search');proof.editor.commandRegistry.execute('entity.open',{targetKey:proof.text.key,args:undefined})");
 check('Regular Link Entity command focuses the existing merged LER',await evaluate("document.querySelectorAll('.reactive-entity-search').length===1&&document.querySelector('.reactive-entity-search')===proof.lerElement"));
 await query('Leonardo');await wait("document.querySelector('[aria-label=\"Select Leonardo da Vinci\"]')");
 await evaluate("proof.holdGet=true;document.querySelector('[aria-label=\"Select Leonardo da Vinci\"]').click()");await wait('proof.releaseGet');
 await evaluate("document.querySelector('[aria-label=\"Close Autocomplete\"]').click()");
 check('Header close respects LER pending-operation guard',await evaluate("!!document.querySelector('.reactive-entity-search')&&proof.read()==='Leo'"));
 await evaluate('proof.holdGet=false;proof.releaseGet();proof.releaseGet=undefined');await wait("!document.querySelector('.reactive-entity-search')");
 check('Pending canonical read commits once to its original source',await source()==='Leonardo da Vinci');
 check('Merged Entity-service lease disposed exactly once',await evaluate('proof.serviceClosed===proof.serviceOpened'));
 await reset(phrase,0,phrase.length);await type('((');
 check('Selected full phrase wrapped without loss',await source()==='(('+phrase+'))');
 await query('Leonardo');check('Independent query leaves authored source unchanged',await source()==='(('+phrase+'))');
 await wait("document.querySelector('[aria-label=\"Select Leonardo da Vinci\"]')");
 await writeFile(path.join(artifacts,'ler-merged.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'},sessionId)).data,'base64'));
 await confirm();check('Round confirmation preserves phrase and canonical GUID',await evaluate(`proof.read()===${JSON.stringify(phrase)}&&proof.text.payload.standoffProperties.some(p=>p.type==='codex/entity-reference'&&p.value==='${guid}')`));
 await key('z',4);check('One Undo restores authored phrase without interaction chrome',await source()===phrase);
 await reset('Florentine master',0);await type('((');check('Next word only captured',await source()==='((Florentine)) master');
 await key('ArrowRight',2);check('Ctrl Right extends closing boundary by word',await source()==='((Florentine master))');
 await query('Leonardo');await confirm();check('Extended mention preserves phrase',await source()==='Florentine master');
 await reset('Leo',0);await type('[[');check('Square invocation encloses next word',await source()==='[[Leo]]');await confirm();check('Square confirmation uses canonical name',await source()==='Leonardo da Vinci');
 await reset(' tail',0);await type('((');check('Whitespace creates empty pair',await source()==='(()) tail');await type('Florence and spaces');check('Free typing and spaces stay inside visible delimiters',await source()==='((Florence and spaces)) tail');
 await key('Home');await key('Backspace');check('Backspace at opening boundary cannot delete delimiter',await source()==='((Florence and spaces)) tail');
 await key('End');await key('Delete');check('Delete at closing boundary cannot delete delimiter',await source()==='((Florence and spaces)) tail');
 await key('ArrowRight');await type('!');check('Caret movement cannot escape bracket interior',await source()==='((Florence and spaces!)) tail');
 await key('Escape');check('Escape removes transient markers and preserves edits',await source()==='Florence and spaces! tail');
 check('Scoped binding leases released',await evaluate("!proof.editor.bindings.get('autocomplete.end.word.1')"));
 await reset();await type('((');await type('master');await query('Leonardo');
 await key('c',2);check('Ctrl C does not cancel query context',await evaluate("!!document.querySelector('.autocomplete-workstation')"));
 await evaluate("proof.editor.focus.request(proof.text.key);proof.mount.restoreInlineSelection({anchor:6,head:6})");await type('!');
 check('Independent query survives source edit',await evaluate("document.querySelector('.autocomplete-workstation input').value==='Leonardo'&&proof.read()==='master!'"));
 await evaluate("[...document.querySelectorAll('.autocomplete-workstation button')].find(b=>b.textContent==='Resume following source').click()");
 check('Resume following source is explicit',await evaluate("document.querySelector('.autocomplete-workstation input').value==='master!'"));
 await evaluate("[...document.querySelectorAll('.autocomplete-workstation button')].find(b=>b.textContent==='Keep literal brackets').click()");check('Keep literal brackets preserves owned syntax intentionally',await source()==='((master!))');
 await reset('old (',5);await type('(');check('Pre-existing opener is never silently adopted',await evaluate("!document.querySelector('.autocomplete-workstation')&&proof.read()==='old (('") );
 await reset('old ',4);await type('((');await type('edited');await evaluate("document.querySelector('[aria-label=\"Close Autocomplete\"]').click()");check('Popup X retains edits and removes only owned delimiters',await source()==='old edited');
 await reset('Florentine master',0);await type('((');await query('Leonardo');await wait("document.querySelector('.reactive-entity-search [aria-label^=\"Select \"]')");
 await wait("document.querySelector('.reactive-entity-search')");check('One LER uses the live source bookmark without deleting brackets',await source()==='((Florentine)) master');
 await evaluate("document.querySelector('.reactive-entity-search input').focus()");await key('Escape');await wait("!document.querySelector('.reactive-entity-search')");check('Entity tool cancellation consumes owned delimiters only',await source()==='Florentine master');

 const gestureCases=[
  ['closing word back', 'one two three',0,7,'ArrowLeft',2,'((one ))two three'],
  ['closing word forward','one two three',0,3,'ArrowRight',2,'((one two)) three'],
  ['closing character back','one two',0,3,'ArrowLeft',10,'((on))e two'],
  ['closing character forward','one two',0,3,'ArrowRight',10,'((one ))two'],
  ['opening word back','one two three',4,7,'ArrowLeft',3,'((one two)) three'],
  ['opening word forward','one two three',0,7,'ArrowRight',3,'one(( two)) three'],
  ['opening character back','one two three',4,7,'ArrowLeft',11,'one(( two)) three'],
  ['opening character forward','one two three',4,7,'ArrowRight',11,'one t((wo)) three']
 ];
 for(const [name,value,start,end,arrow,mods,expected] of gestureCases){await reset(value,start,end);await type('((');await evaluate('proof.boundaryRevision=proof.editor.repository.state.revision');await key(arrow,mods);check(name+' leaves Document content and revision unchanged',await evaluate(`proof.read()===${JSON.stringify(value)}&&proof.editor.repository.state.revision===proof.boundaryRevision`));check(name,await source()===expected);await key('Escape');check(name+' preserves outside text',await source()===value);}
 await reset('e\u0301👩‍👩‍👧‍👧界',0,2);await type('((');await key('ArrowRight',10);check('Character boundary crosses whole emoji family grapheme',await source()==='((e\u0301👩‍👩‍👧‍👧))界');await key('ArrowLeft',10);check('Character boundary returns across whole emoji grapheme',await source()==='((e\u0301))👩‍👩‍👧‍👧界');await key('Escape');
 await reset();await type('((');await query('Leonardo');await wait("document.querySelector('.reactive-entity-search [aria-label^=\"Select \"]')");await key('Enter');await wait("document.querySelector('.autocomplete-workstation [role=alert]')");check('Empty round mention is rejected without destroying the interaction',await source()==='(())');await key('Escape');
 await reset('before after',7);await type('((');await type('edited');
 const outsidePoint=await evaluate("(()=>{const b=proof.mount.inlineBoundary(1),r=document.createRange();r.setStart(b.node,b.offset);r.setEnd(b.node,Math.min(b.offset+1,b.node.textContent.length));const a=r.getBoundingClientRect();return {x:a.left+1,y:a.top+a.height/2}})()");
 await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...outsidePoint},sessionId);await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...outsidePoint},sessionId);
 await wait("!document.querySelector('.autocomplete-workstation')");check('Pointer outside source range cancels and preserves edited text',await source()==='before afteredited');
 await reset('he he he',0,2);await type('((');await query('Leonardo');await wait("document.querySelector('.reactive-entity-search [aria-label^=\"Select \"]')");await key('a',2);await wait("document.querySelector('.reactive-entity-search')");await evaluate("document.querySelector('[aria-label=\"Select Leonardo da Vinci\"]').click()");await wait("document.querySelectorAll('[data-candidate-row]').length===3");
 check('Reviewed Ctrl A uses existing Entity candidate workflow',true);
 await evaluate("document.querySelector('.entity-candidates__bind').click()");await wait("!document.querySelector('.reactive-entity-search')");
 check('Batch links reviewed occurrences without authored delimiters',await evaluate("proof.read()==='he he he'&&proof.text.payload.standoffProperties.filter(p=>p.type==='codex/entity-reference').length===3"));
 await key('z',4);check('Single Undo preserves authored source and removes entire batch',await evaluate("proof.read()==='he he he'&&!proof.text.payload.standoffProperties.some(p=>p.type==='codex/entity-reference')"));
 await reset('Leo',0);await type('((');await query('Leonardo');await wait("document.querySelector('.reactive-entity-search [aria-label^=\"Select \"]')");await wait("document.querySelector('[aria-label=\"Select Leonardo da Vinci\"]')");
 await evaluate("document.querySelector('[aria-label=\"Select Leonardo da Vinci\"]').click()");await wait("!document.querySelector('.reactive-entity-search')");check('Unified Entity tool commits to original occurrence with round preservation policy',await source()==='Leo');
 await reset();await type('((');await type('old');await key('Escape');await evaluate('new Promise(r=>setTimeout(r,450))');check('Late resolver results cannot resurrect cancelled Scry',await evaluate("!document.querySelector('.autocomplete-workstation')&&proof.read()==='old'"));
 await reset();await type('((');await type('IME');await evaluate("proof.flow.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true,data:''}))");check('IME exits optional mode without rewriting composition DOM',await evaluate("!document.querySelector('.autocomplete-workstation')&&proof.read()==='IME'"));await evaluate("proof.flow.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:''}))");

 await reset(phrase,0);for(let i=0;i<phrase.length;i++)await key('ArrowRight',8);await type('((');check('Real keyboard-created selection is wrapped through cross-Block input routing',await source()==='(('+phrase+'))');await key('Escape');
 await reset('the master',0,10);await type('((');await query('New Person');await wait("document.querySelector('.reactive-entity-search')");
 await evaluate("[...document.querySelectorAll('.reactive-entity-search button')].find(b=>b.textContent==='+ Create Entity').click()");await evaluate("[...document.querySelectorAll('.reactive-entity-search button')].find(b=>b.textContent==='Create and link').click()");await wait("!document.querySelector('.reactive-entity-search')");
 check('Existing creation UI creates once and links original round mention by returned GUID',await evaluate("proof.created.length===1&&proof.read()==='the master'&&proof.text.payload.standoffProperties.some(p=>p.value===proof.created[0].id)"));
 await reset('the master',0,10);await type('((');await query('Leonardo');await wait("document.querySelector('.reactive-entity-search [aria-label^=\"Select \"]')");await evaluate("[...document.querySelectorAll('.reactive-entity-search button')].find(b=>b.textContent==='Details / aliases').click()");await wait("document.querySelector('[aria-label=\"Explicit alias\"]')");
 check('Mention preservation does not automatically write an alias',await evaluate('proof.aliasWrites.length===0'));
 await evaluate("[...document.querySelectorAll('.reactive-entity-search button')].find(b=>b.textContent==='Add alias').click()");await wait('proof.aliasWrites.length===1');await wait("document.querySelector('[aria-label=\"Select Leonardo da Vinci\"]')?.disabled===false");await evaluate("document.querySelector('[aria-label=\"Select Leonardo da Vinci\"]').click()");await wait("!document.querySelector('.reactive-entity-search')");
 check('Explicit alias workflow retains original source identity and wording',await evaluate("proof.aliasWrites[0].entityId==='11111111-1111-4111-8111-111111111111'&&proof.read()==='the master'"));
 await reset('Leo',0);await type('((');await query('Leonardo');
 await key('ArrowLeft',10);check('Query word-selection keys do not move source boundaries',await source()==='((Leo))');
 await evaluate("document.querySelector('.autocomplete-workstation input').select()");await type('Michelangelo');check('Query selection and replacement leave source untouched',await source()==='((Leo))');
 await key('Escape');

 await reset('outside words',8);await type('((');await key('Home',2);await type('!');check('Ctrl Home remains confined to source interior',await source()==='outside ((!words))');
 await key('ArrowUp',8);check('Shift Up cannot create an outside cross-Block selection',await evaluate("!proof.editor.crossText.range()&&!!document.querySelector('.autocomplete-workstation')"));
 await key('a',4);await key('Backspace');check('Document Select All is confined to bracket interior',await source()==='outside (())');
 await evaluate("(()=>{const data=new DataTransfer();data.setData('text/plain','pasted words');proof.flow.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data}))})()");check('Source paste passes through constrained native transaction',await source()==='outside ((pasted words))');
 await key('a',4);await evaluate("(()=>{const data=new DataTransfer();proof.flow.dispatchEvent(new ClipboardEvent('copy',{bubbles:true,cancelable:true,clipboardData:data}));proof.copied=data.getData('text/plain')})()");check('Source Copy carries selected text without cancelling',await evaluate("proof.copied==='pasted words'&&!!document.querySelector('.autocomplete-workstation')"));await key('Escape');
 await reset('Leo',0);await type('((');await wait("document.querySelector('.autocomplete-workstation')");
 await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');await evaluate("proof.anchorLeft=document.querySelector('.autocomplete-workstation').getBoundingClientRect().left");await type(' more words');await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');check('Typing does not move anchor along with caret',await evaluate("Math.abs(proof.anchorLeft-document.querySelector('.autocomplete-workstation').getBoundingClientRect().left)<1"));

 check('Scry opens in landscape format',await evaluate("(()=>{const r=document.querySelector('.autocomplete-workstation').getBoundingClientRect();return r.width>r.height*1.5&&r.height<=300})()"));
 check('Scry aligns with opening brackets and sits 20 pixels below the source',await evaluate("(()=>{const b=proof.mount.inlineBoundary(0),range=document.createRange();range.setStart(b.node,b.offset);range.collapse(true);const a=[...range.getClientRects()].find(r=>r.height>0),r=document.querySelector('.autocomplete-workstation').getBoundingClientRect();return Math.abs(r.left-a.left)<1&&Math.abs(r.top-a.bottom-20)<1})()"));
 const moveWindow=async(selector,dx,dy)=>{const p=await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`);await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...p},sessionId);await send('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,x:p.x+dx,y:p.y+dy},sessionId);await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x:p.x+dx,y:p.y+dy},sessionId);await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');};
 await evaluate("proof.scryBefore=document.querySelector('.autocomplete-workstation').getBoundingClientRect().toJSON()");
 await moveWindow('.autocomplete-workstation header',-80,-35);
 check('Scry header drags without closing the source interaction',await evaluate("(()=>{const r=document.querySelector('.autocomplete-workstation').getBoundingClientRect();return Math.abs(r.left-proof.scryBefore.left+80)<2&&Math.abs(r.top-proof.scryBefore.top+35)<2})()"));
 await evaluate("proof.scryMoved=document.querySelector('.autocomplete-workstation').getBoundingClientRect().toJSON()");await type('!');await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
 check('Typing preserves the manually chosen position',await evaluate("(()=>{const r=document.querySelector('.autocomplete-workstation').getBoundingClientRect();return Math.abs(r.left-proof.scryMoved.left)<1&&Math.abs(r.top-proof.scryMoved.top)<1})()"));
 await moveWindow('[aria-label="Resize Scry window"]',-90,-40);
 check('Scry corner resizes without changing source wording',await evaluate("(()=>{const r=document.querySelector('.autocomplete-workstation').getBoundingClientRect();return r.width<proof.scryMoved.width-80&&r.height<proof.scryMoved.height&&proof.read()==='Leo more words!'})()"));
 await evaluate("document.querySelector('.autocomplete-workstation header').focus();proof.scryMoved=document.querySelector('.autocomplete-workstation').getBoundingClientRect().toJSON()");await key('ArrowRight');await key('Enter');
 check('Keyboard movement uses the window controls without linking an Entity',await evaluate("(()=>{const r=document.querySelector('.autocomplete-workstation').getBoundingClientRect();return Math.abs(r.left-proof.scryMoved.left-10)<1&&proof.read()==='Leo more words!'})()"));
 await send('Emulation.setDeviceMetricsOverride',{width:850,height:650,deviceScaleFactor:1,mobile:false},sessionId);await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');check('Popup clamps after viewport resize',await evaluate("(()=>{const r=document.querySelector('.autocomplete-workstation').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight})()"));
 await send('Emulation.setPageScaleFactor',{pageScaleFactor:1.25},sessionId);await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');check('Popup remains visible at browser page scale 1.25',await evaluate("(()=>{const r=document.querySelector('.autocomplete-workstation').getBoundingClientRect(),v=visualViewport;return r.left>=v.offsetLeft&&r.top>=v.offsetTop&&r.right<=v.offsetLeft+v.width+1&&r.bottom<=v.offsetTop+v.height+1})()"));
 await send('Page.captureScreenshot',{format:'png'},sessionId).then(r=>writeFile(path.join(artifacts,'scry-active.png'),Buffer.from(r.data,'base64')));
 await key('Escape');await send('Emulation.setPageScaleFactor',{pageScaleFactor:1},sessionId);await send('Emulation.setDeviceMetricsOverride',{width:1500,height:990,deviceScaleFactor:1,mobile:false},sessionId);

 await evaluate("(()=>{const nodes=Object.values(proof.session.projection.state.nodes),bank=nodes.find(n=>n.viewType==='workspace-object-bank-block'),tabs=nodes.find(n=>n.viewType==='tab-row-block'),id=crypto.randomUUID();proof.editor.commands.insert({id,type:'document-block',metadata:{name:'Scry other'},children:[{id:crypto.randomUUID(),type:'standoff-editor-block',text:'Other editing session'}]},{kind:'at',parentKey:bank.key,index:0});proof.editor.commands.insert({id:crypto.randomUUID(),type:'tab-block',metadata:{name:'Scry other',documentTarget:{version:1,documentId:id}}},{kind:'at',parentKey:tabs.key,index:1});proof.firstTab=proof.root.querySelector('[role=tab]')})()");
 await reset('Leo',0);await type('((');await wait("document.querySelector('.autocomplete-workstation')");await evaluate("[...proof.root.querySelectorAll('[role=tab]')].find(t=>t.textContent.includes('Scry other')).click()");await wait("!document.querySelector('.autocomplete-workstation')");check('Actual Flint tab switch cancels source context without disposing source DOM',await evaluate("proof.read()==='Leo'&&proof.mount.root.isConnected"));await evaluate('proof.firstTab.click()');
 await reset('Leo',0);await type('[[');await wait("document.querySelector('.reactive-entity-search [aria-label^=\"Select \"]')");
 await evaluate("proof.owner=proof.editor.windowManager.ownerForNode(proof.text.key);proof.editor.windowManager.lifecycle.minimize(proof.owner)");await wait("!document.querySelector('.autocomplete-workstation')");check('Owner minimization cancels context and retains authored phrase',await source()==='Leo');
 await evaluate('proof.editor.windowManager.lifecycle.reveal(proof.owner)');await reset('Leo',0);await type('((');await wait("document.querySelector('.reactive-entity-search [aria-label^=\"Select \"]')");
 await evaluate("proof.editor.commandRegistry.execute('flint.open',{targetKey:proof.session.projection.state.rootKey,args:undefined})");await wait("!document.querySelector('.autocomplete-workstation')");check('Second Flint window cancels original occurrence without losing text',await source()==='Leo');
 check('No browser exceptions' ,errors.length===0);
 await writeFile(path.join(artifacts,'results.json'),JSON.stringify({checks,errors,isolatedEntityResolver:true,realFlintComponents:true},null,2));
 console.log(JSON.stringify({checks,errors},null,2));
 await evaluate('proof.stopEntity();proof.dispose();proof.session.dispose()');

}finally{await serviceLoad?.stop();socket?.close();chrome.kill();await vite.close();await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
process.exit(0);
