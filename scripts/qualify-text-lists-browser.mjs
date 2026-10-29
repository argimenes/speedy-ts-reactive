// Text list keyboard qualification in real Flint, using an in-memory Document.
// Reads the fixture only; never saves it or opens a user vault.
// BENCHMARK_DOCUMENT_PATH selects a native fixture; BENCHMARK_OUTPUT selects artifacts.
import {spawn} from 'node:child_process';
import {mkdtemp, rm, mkdir, writeFile, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
const fixture=await readFile(process.env.BENCHMARK_DOCUMENT_PATH??'vaults/imported/documents/michelangelo-letters/1507-02-13-[a7a41cd3].ink');
const artifacts=process.env.BENCHMARK_OUTPUT??'/tmp/text-lists-browser';await mkdir(artifacts,{recursive:true});
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
 window.proof={editor,session,dispose,host,native,render,createComponent};
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

 const key=async(key,modifiers=0)=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key,modifiers,windowsVirtualKeyCode:({Enter:13,Tab:9,z:90})[key]},sessionId);await send('Input.dispatchKeyEvent',{type:'keyUp',key,modifiers},sessionId);};
 if(!process.env.QUALIFY_TASK_ONLY) {
 await evaluate(`
  proof.placement=proof.text.placementKey;
  proof.current=()=>proof.editor.nodeForPlacementInView(proof.placement,proof.view.viewId);
  proof.currentMount=()=>proof.editor.mounts.get(proof.current().key);
  proof.parent=n=>proof.view.parentOf(n.key);
  proof.read=()=>proof.current().inlineContent.map(k=>proof.editor.node(k).payload.text).join('');
  proof.editor.commands.replaceInlineRange(proof.text.key,0,proof.text.inlineContent.length,'First item');
  proof.currentMount().focus();proof.currentMount().restoreInlineSelection({anchor:2,head:5});
 `);
 await key('Tab');await wait("proof.parent(proof.current())?.viewType==='indented-list-block'");
 check('Tab creates a list from the source TextBlock',await evaluate("proof.read()==='First item'&&proof.parent(proof.current()).children.length===1"));
 check('Conversion preserves text selection and focus',await evaluate("document.activeElement===proof.currentMount().focusElement&&JSON.stringify(proof.currentMount().captureInlineSelection())===JSON.stringify({anchor:2,head:5})"));
 check('New list displays a bullet',await evaluate("proof.currentMount().root.closest('.reactive-imported-list-item').querySelector('.reactive-imported-list-marker').textContent==='•'"));
 await evaluate('proof.version=proof.editor.repository.readState().revision');await key('Tab');
 check('Tab on the first item is a no-op',await evaluate('proof.editor.repository.readState().revision===proof.version'));
 await evaluate('proof.currentMount().restoreInlineSelection({anchor:10,head:10})');await key('Enter');await send('Input.insertText',{text:'Second item'},sessionId);
 await evaluate('proof.second=proof.editor.node(proof.editor.focus.state.focusedKey).placementKey;proof.secondNode=()=>proof.editor.nodeForPlacementInView(proof.second,proof.current().viewId)');
 check('Enter continues the list and typing edits the new item',await evaluate("proof.parent(proof.secondNode()).key===proof.parent(proof.current()).key&&proof.secondNode().inlineContent.map(k=>proof.editor.node(k).payload.text).join('')==='Second item'"));
 await key('Tab');await wait('proof.parent(proof.parent(proof.secondNode()))?.placementKey===proof.placement');
 check('Tab nests the second item under the first and retains caret focus',await evaluate('document.activeElement===proof.editor.mounts.get(proof.secondNode().key).focusElement&&proof.editor.mounts.get(proof.secondNode().key).captureInlineSelection().anchor===11'));

 const marker=()=>evaluate(`(()=>{const b=proof.currentMount().root.closest('[data-list-item]').querySelector(':scope > button');b.scrollIntoView({block:'center'});const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
 const clickMarker=async()=>{const point=await marker();if(process.env.AUTOCOMPLETE_TRACE){console.log('MARKER',point,await evaluate(`document.elementFromPoint(${point.x},${point.y})?.outerHTML.slice(0,800)`));await send('Page.captureScreenshot',{format:'png'},sessionId).then(r=>writeFile(path.join(artifacts,'before-click.png'),Buffer.from(r.data,'base64')));}await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point},sessionId);await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point},sessionId);};
 await clickMarker();
 if(process.env.AUTOCOMPLETE_TRACE)console.log(await evaluate("JSON.stringify({metadata:proof.current().payload.metadata,button:proof.currentMount().root.closest('[data-list-item]').querySelector(':scope > button').outerHTML,hidden:proof.editor.mounts.get(proof.secondNode().key).root.closest('[hidden]')?.outerHTML.slice(0,250)})"));
 check('Clicking the bullet hides the child list and marks the item collapsed',await evaluate("proof.current().payload.metadata.listCollapsed===true&&proof.editor.mounts.get(proof.secondNode().key).root.closest('.reactive-list[hidden]')!==null&&getComputedStyle(proof.editor.mounts.get(proof.parent(proof.secondNode()).key).root).display==='none'"));
 check('Collapsing a branch moves the caret to its visible parent',await evaluate('document.activeElement===proof.currentMount().focusElement'));
 await send('Page.captureScreenshot',{format:'png'},sessionId).then(r=>writeFile(path.join(artifacts,'list-collapsed.png'),Buffer.from(r.data,'base64')));
 check('Native document save/reload restores the collapsed state and renders the child list hidden',await evaluate(`(async()=>{
  const {captureNative,nativeText,admitNative}=await import('/src/persistence/native-resource.ts');
  const {ReactiveEditor}=await import('/src/reactive-editor/editor.ts');
  const {registerCoreViews}=await import('/src/rendering/register-core-views.ts');
  const {ReactiveTreeView}=await import('/src/rendering/reactive-tree-view.tsx');
  const {render,createComponent}=proof;
  const bytes=new TextEncoder().encode(nativeText(captureNative(proof.editor.repository.readState(),${JSON.stringify(JSON.parse(fixture).resourceId)})));
  const loaded=new ReactiveEditor({type:'workspace-object-bank-block',children:[]});
  const state=loaded.repository.readState();const admitted=admitNative(loaded.repository,bytes,state.placements[state.rootPlacementKey].contentKey);
  registerCoreViews(loaded);const view=loaded.createView('list-reload',admitted.placementKey),host=document.body.appendChild(document.createElement('div'));
  const dispose=render(()=>createComponent(ReactiveTreeView,{editor:loaded,projection:view}),host);
  const item=Object.values(view.state.nodes).find(n=>n.payload.id===proof.current().payload.id),child=Object.values(view.state.nodes).find(n=>n.payload.id===proof.secondNode().payload.id);
  const passed=item.payload.metadata.listCollapsed===true&&loaded.mounts.get(child.key).root.closest('.reactive-list[hidden]')!==null;
  dispose();loaded.dispose();host.remove();return passed;
 })()`));
 await clickMarker();check('Clicking again expands the same child list',await evaluate("proof.current().payload.metadata.listCollapsed===false&&!proof.editor.mounts.get(proof.secondNode().key).root.closest('[hidden]')"));
 await evaluate("proof.currentMount().root.closest('[data-list-item]').querySelector(':scope > button').focus()");await key('Enter');
 check('Bullet toggle is keyboard accessible',await evaluate('proof.current().payload.metadata.listCollapsed===true'));
 await key('Enter');await evaluate('proof.editor.focus.request(proof.secondNode().key,{caret:"end"})');
 await key('Tab',8);await wait('proof.parent(proof.secondNode()).key===proof.parent(proof.current()).key');
 check('Shift Tab outdents to the parent list',await evaluate('proof.parent(proof.current()).children.length===2&&proof.current().children.length===0'));
 await key('Tab',8);await wait("proof.parent(proof.secondNode()).viewType!=='indented-list-block'");
 check('Shift Tab at the outermost level returns to normal text',await evaluate('proof.parent(proof.secondNode()).key===proof.parent(proof.parent(proof.current())).key'));
 await key('z',4);await wait('proof.parent(proof.secondNode()).key===proof.parent(proof.current()).key');
 check('One Undo restores the list structure',true);

 await evaluate(`proof.prefixPlacement=proof.editor.commands.insert({id:crypto.randomUUID(),type:'standoff-editor-block',text:''},{kind:'after',anchorKey:proof.parent(proof.current()).key});proof.prefix=()=>proof.editor.nodeForPlacementInView(proof.prefixPlacement,proof.view.viewId);proof.prefixMount=()=>proof.editor.mounts.get(proof.prefix().key);proof.prefixText=()=>proof.prefix().inlineContent.map(k=>proof.editor.node(k).payload.text).join('');proof.prefixMount().focus();proof.prefixMount().restoreInlineSelection({anchor:0,head:0});`);
 await send('Input.insertText',{text:'-'},sessionId);await send('Input.insertText',{text:' '},sessionId);
 check('Real typed hyphen-space creates an empty list item with the caret at its start',await evaluate("proof.parent(proof.prefix()).viewType==='indented-list-block'&&proof.prefixText()===''&&document.activeElement===proof.prefixMount().focusElement&&proof.prefixMount().captureInlineSelection().anchor===0"));
 await key('z',4);
 check('One native Undo restores the ordinary TextBlock and complete literal hyphen-space',await evaluate("proof.parent(proof.prefix()).viewType!=='indented-list-block'&&proof.prefixText()==='- '"));
 await key('z',12);check('Redo restores the converted list',await evaluate("proof.parent(proof.prefix()).viewType==='indented-list-block'&&proof.prefixText()===''"));
 await evaluate('proof.prefixMount().focus();proof.prefixMount().restoreInlineSelection({anchor:0,head:0})');await send('Input.insertText',{text:'First automatic item'},sessionId);await key('Enter');
 check('Enter creates the next direct list item',await evaluate('proof.parent(proof.prefix()).children.length===2'));
 await key('Enter');check('Enter on the empty item exits the list',await evaluate("proof.parent(proof.editor.node(proof.editor.focus.state.focusedKey)).viewType!=='indented-list-block'&&proof.parent(proof.prefix()).children.length===1"));
 for(const token of ['*','1.','3.','123456789.']){
  await evaluate(`proof.extraPlacement=proof.editor.commands.insert({id:crypto.randomUUID(),type:'standoff-editor-block',text:''},{kind:'after',anchorKey:proof.parent(proof.prefix()).key});proof.extra=()=>proof.editor.nodeForPlacementInView(proof.extraPlacement,proof.view.viewId);proof.extraMount=()=>proof.editor.mounts.get(proof.extra().key);proof.extraText=()=>proof.extra().inlineContent.map(k=>proof.editor.node(k).payload.text).join('');proof.extraMount().focus();proof.extraMount().restoreInlineSelection({anchor:0,head:0});`);
  for(const text of token+' ')await send('Input.insertText',{text},sessionId);
  const ordered=token.endsWith('.'),start=ordered?Number(token.slice(0,-1)):undefined;
  check(`Typed ${token} creates the appropriate list and caret`,await evaluate(`proof.parent(proof.extra()).payload.metadata.htmlList.ordered===${ordered}&&${ordered?`proof.parent(proof.extra()).payload.metadata.htmlList.start===${start}&&`:''}proof.extraText()===''&&proof.extraMount().captureInlineSelection().anchor===0&&proof.extraMount().root.closest('[data-list-item]').querySelector('.reactive-imported-list-marker').textContent===${JSON.stringify(ordered?start+'.':'•')}`));
  await key('z',4);check(`Undo restores literal ${token}`,await evaluate(`proof.extraText()===${JSON.stringify(token+' ')}&&proof.parent(proof.extra()).viewType!=='indented-list-block'`));
  await key('z',12);check(`Redo restores ${token} list`,await evaluate("proof.extraText()===''&&proof.parent(proof.extra()).viewType==='indented-list-block'"));
  await evaluate('proof.extraMount().focus();proof.extraMount().restoreInlineSelection({anchor:0,head:0})');
  await send('Input.insertText',{text:'First'},sessionId);await key('Enter');await send('Input.insertText',{text:'Second'},sessionId);
  check(`${token} Enter continues numbering`,await evaluate(`proof.editor.mounts.get(proof.editor.focus.state.focusedKey).root.closest('[data-list-item]').querySelector('.reactive-imported-list-marker').textContent===${JSON.stringify(ordered?(start+1)+'.':'•')}`));
 }
 for(const token of ['-','*','3.']){
 await evaluate("proof.scryPlacement=proof.editor.commands.insert({id:crypto.randomUUID(),type:'standoff-editor-block',text:''},{kind:'after',anchorKey:proof.parent(proof.prefix()).key});proof.scryNode=()=>proof.editor.nodeForPlacementInView(proof.scryPlacement,proof.view.viewId);proof.editor.focus.request(proof.scryNode().key,{caret:'start'})");
 for(const text of ['(','(',...token,' '])await send('Input.insertText',{text},sessionId);
 check(`Scry owns ${token} source input without conversion`,await evaluate("proof.scryNode().inlineContent.length===0&&proof.parent(proof.scryNode()).viewType!=='indented-list-block'&&!!document.querySelector('.ler-instrument')"));
 await evaluate("{ const input=document.querySelector('[aria-label=\"Search entities\"]');input.focus();input.select(); }");await send('Input.insertText',{text:token+' '},sessionId);
 check(`Scry query ${token} remains query text`,await evaluate(`document.querySelector('[aria-label=\"Search entities\"]').value===${JSON.stringify(token+' ')}&&proof.parent(proof.scryNode()).viewType!=='indented-list-block'`));
 await evaluate('proof.editor.completionInput.cancel()');
 check(`Cancelling Scry keeps literal ${token}`,await evaluate(`proof.scryNode().inlineContent.map(k=>proof.editor.node(k).payload.text).join('')===${JSON.stringify(token+' ')}&&proof.parent(proof.scryNode()).viewType!=='indented-list-block'`));
 }
 }
 if(process.env.QUALIFY_TASK_LISTS==='1') await (await import('./task-list-browser-checks.mjs')).qualifyTasks({evaluate,send,sessionId,check,key,resourceId:JSON.parse(fixture).resourceId});
 check('No browser exceptions',errors.length===0);
 await send('Page.captureScreenshot',{format:'png'},sessionId).then(r=>writeFile(path.join(artifacts,'text-lists.png'),Buffer.from(r.data,'base64')));
 await writeFile(path.join(artifacts,'results.json'),JSON.stringify({checks,errors,realFlintComponents:true},null,2));
 await evaluate('proof.dispose();proof.session.dispose()');
}finally{await serviceLoad?.stop();socket?.close();chrome.kill();await vite.close();await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
process.exit(0);
