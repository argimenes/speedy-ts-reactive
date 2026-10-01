// F1 shell qualification, extending the accepted C3 real UI/server sequence. Node 22+, CHROME_BIN supported.
// Uses an isolated temporary document store, actual server process and Vite host.
// Writes only fixture files; evidence goes to artifacts/flint-f1/browser.
import { spawn } from 'node:child_process';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { tmpdir } from 'node:os';
import path from 'node:path';
const artifacts=process.env.PROOF_ARTIFACTS??'artifacts/flint-f1/browser';await mkdir(artifacts,{recursive:true});
const storeRoot=await mkdtemp(path.join(tmpdir(),'flint-native-store-'));
await mkdir(path.join(storeRoot,'vault/nested'),{recursive:true});
await writeFile(path.join(storeRoot,'vault/standalone.md'),'# Imported\n\n**native bold**');
let backend,port;
const startBackend=async()=>{backend=spawn(process.execPath,['scripts/native-production-test-host.mjs'],{env:{...process.env,PROOF_ROOT:storeRoot,PROOF_PORT:String(port??0)},stdio:['ignore','pipe','inherit']});
port=await new Promise((resolve,reject)=>{backend.stdout.once('data',b=>resolve(JSON.parse(b.toString()).port));backend.once('error',reject);backend.once('exit',code=>reject(new Error('Qualification server exited before startup: '+code)));});};
await startBackend();process.env.PORT=String(port);
const vite=await createServer({server:{host:'127.0.0.1',port:0,hmr:false}});await vite.listen();
const appUrl=`http://127.0.0.1:${vite.httpServer.address().port}`;
const control=(name)=>fetch(`http://127.0.0.1:${port}/__proof/${name}`,{method:name==='status'?'GET':'POST'});
const profile = await mkdtemp(path.join(tmpdir(), 'speedy-flint-check-'));
const chrome = spawn(process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disk-cache-size=1', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank']);
let socket;
try {
const endpoint = await new Promise((resolve, reject) => {
 let output = ''; chrome.stderr.on('data', chunk => { output += chunk; const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/); if(match) resolve(match[1]); });
 chrome.once('error', reject); setTimeout(() => reject(new Error('Chrome startup timed out')), 15000).unref();
});
socket = new WebSocket(endpoint); await new Promise(resolve => socket.addEventListener('open', resolve, {once:true}));
let id = 0; const pending = new Map();
socket.addEventListener('message', event => { const result = JSON.parse(event.data); if(result.id && pending.has(result.id)) { const p = pending.get(result.id); pending.delete(result.id); result.error ? p.reject(new Error(JSON.stringify(result.error))) : p.resolve(result.result); }});
const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const requestId = ++id; const timeout=setTimeout(()=>{pending.delete(requestId);reject(new Error('CDP timeout: '+method));},20000);pending.set(requestId,{resolve:v=>{clearTimeout(timeout);resolve(v)},reject:e=>{clearTimeout(timeout);reject(e)}}); socket.send(JSON.stringify({id:requestId,method,params,...(sessionId ? {sessionId} : {})})); });
 const {targetId} = await send('Target.createTarget',{url:'about:blank'}); const {sessionId} = await send('Target.attachToTarget',{targetId,flatten:true});
 await send('Network.enable',{},sessionId);
 socket.addEventListener('message', event => { const msg=JSON.parse(event.data); if(msg.method==='Network.loadingFailed') console.error(JSON.stringify(msg.params)); });
 const evaluate = async expression => {
   const result = await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);
   if(result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
   return result.result.value;
 };

 const checks=[], errors=[];const check=(name,value,expected=true)=>{assert.deepEqual(value,expected,name);checks.push(name);};
 socket.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails)});
 await send('Runtime.enable',{},sessionId);await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false},sessionId);
 await send('Page.navigate',{url:appUrl},sessionId);await evaluate('new Promise(r=>setTimeout(r,1500))');
 await evaluate(`(async()=>{
 const {WorkspaceSession}=await import('/src/application/workspace-session.ts');
 const {materializeLocalWorkspace}=await import('/src/reactive-editor/workspace-manifest.ts');
 const {WorkspacePresentationView}=await import('/src/application/workspace-presentation-view.tsx');
 const {nativeDocumentSession}=await import('/src/persistence/native-session.ts');
 const codec=await import('/src/persistence/native-resource.ts');
 const source=await(await fetch('/src/rendering/reactive-tree-view.tsx')).text();const {render,createComponent}=await import(source.split('"').find(p=>p.includes('/solid-js_web.js')));
 const host=document.createElement('div');host.className='workspace-demo workspace-demo--canonical';host.style.cssText='position:fixed;inset:40px 0 0;z-index:9000;background:#eee;overflow:auto';document.body.append(host);
 const make=()=>new WorkspaceSession(materializeLocalWorkspace({id:crypto.randomUUID(),type:'workspace-block',children:[]}),{features:{publicHostedVersion:false,...( ${process.env.P4_FACTS==='0'} ? {nativeKnowledge:false}:{}),nativeKnowledgeSaved:${process.env.P5_SAVED==='1'}}});
 const setup=()=>{const session=make(),editor=session.editor;editor.commandRegistry.execute('flint.open',{targetKey:session.projection.state.rootKey,args:undefined});const dispose=render(()=>createComponent(WorkspacePresentationView,{session}),host);editor.installGateway(document);return {session,editor,dispose}};
 window.proof={host,setup,...setup(),nativeDocumentSession,codec};
 proof.click=text=>{const button=[...host.querySelectorAll('button')].find(b=>b.textContent===text);if(!button)throw Error('Missing '+text);button.click()};
 proof.field=(label,value)=>{const input=host.querySelector('input[aria-label="'+label+'"]');input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));};
 proof.wait=async predicate=>{for(let i=0;i<150;i++){if(predicate())return;await new Promise(r=>setTimeout(r,30));}throw Error('UI wait timed out: '+host.textContent.slice(0,1700))};
 })()`);
 await evaluate(`proof.one=proof.host.querySelector('.flint-application');proof.win=proof.one;
 proof.click=text=>{if(text==='Close tab'||text==='Files'){const m=proof.win.querySelector('[aria-label="Flint application menu"]');if(m.getAttribute('aria-expanded')!=='true')m.click();}const b=[...proof.win.querySelectorAll('button')].find(b=>b.textContent===text);if(!b||b.disabled)throw Error('Button unavailable '+text);b.click();};
 proof.field=(label,value)=>{const el=proof.win.querySelector('[aria-label="'+label+'"]');if(!el)throw Error('Field missing '+label);el.value=value;el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));};
 proof.windowNode=proof.editor.node(proof.win.closest('.reactive-window').dataset.nodeKey);
 const wn=Object.values(proof.session.projection.state.nodes).find(n=>n.viewType==='window-block');proof.windowKey=wn.key;proof.editor.commands.setPayloadField(wn.key,'metadata',{...JSON.parse(JSON.stringify(wn.payload.metadata)),size:{w:1320,h:800}});
 proof.id=()=>proof.win.querySelector('[data-flint-property="id"]').textContent;
 proof.ready=()=>![...proof.win.querySelectorAll('button')].find(b=>b.textContent==='Refresh')?.disabled;
 `);
 const click=label=>evaluate(`proof.click(${JSON.stringify(label)})`),field=(label,value)=>evaluate(`proof.field(${JSON.stringify(label)},${JSON.stringify(value)})`),wait=p=>evaluate(`proof.wait(()=>(${p}))`);
 const ready=()=>wait('proof.ready()');
 const shot=async name=>{const {data}=await send('Page.captureScreenshot',{format:'png'},sessionId);await writeFile(path.join(artifacts,name+'.png'),Buffer.from(data,'base64'));};
 await click('Close tab');await click('Close tab');await shot('welcome');
 await field('Vault directory','vault');await click('Open Vault');await wait(`!!proof.win.querySelector('[aria-label="Selected folder"]')`);await ready();
 const create=async(filename,title,text)=>{await field('New Document filename',filename);await field('New Document title',title);await click('New Document');await wait(`proof.win.textContent.includes('Saved native Document and Markdown')`);await ready();await evaluate(`proof.currentId=proof.id();proof.view=[...proof.editor.projections.values()].find(p=>p!==proof.session.projection&&(p.state.nodes[p.state.rootKey].payload.metadata??{}).documentId===proof.currentId);proof.node=Object.values(proof.view.state.nodes).find(n=>n.viewType==='standoff-editor-block');proof.editor.focus.request(proof.node.key);proof.editor.mounts.get(proof.node.key).restoreInlineSelection({anchor:0,head:0})`);await send('Input.insertText',{text},sessionId);await click('Save Document');await wait(`proof.win.textContent.includes('Saved native Document and Markdown')`);await ready();return evaluate('proof.currentId');};
 const search=async q=>{await evaluate(`proof.win.querySelector('.flint-search-launch').click()`);for(let i=0;i<30;i++){await field('Search vault',q);await click('Search vault');await wait(`proof.win.textContent.includes('results ·')`);if(!process.env.P5_SAVED||await evaluate(`!!proof.win.querySelector('.flint-search-hit')`))return;await new Promise(r=>setTimeout(r,100));}throw Error('Expected source never became available');};
 const pointer=async selector=>{const p=await evaluate(`(()=>{const el=proof.win.querySelector(${JSON.stringify(selector)});el.scrollIntoView({block:'center'});const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...p},sessionId);await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...p},sessionId);};
 // Physical hierarchy first: both native resources are created in real subdirectories.
 await field('New directory name','Research');await click('Create directory');await ready();await field('New directory name','Notes');await click('Create directory');await ready();
 await click('Research');await create('target.mutable.json','Alpine study','Snow and 🧭 mountains.');await evaluate('proof.targetId=proof.id()');
 await click('Notes');await create('source.mutable.json','Journal','See the mountain study.');await evaluate('proof.sourceId=proof.id();proof.sourceNode=proof.node');
 await click('Properties');await field('Document tags','alpine\nreading');await click('Apply properties');await shot('properties');


 // Existing authored margin content stays reachable within the central work surface.
 await evaluate(`proof.marginPlacement=proof.editor.commands.ensureMargin(proof.sourceNode.key,'left');proof.editor.commands.replaceInlineRange(proof.marginPlacement,0,0,'A margin thought');proof.marginKey=proof.editor.nodeForPlacementInView(proof.marginPlacement,proof.sourceNode.viewId).key;`);
 await wait(`!!proof.editor.mounts.get(proof.marginKey)`);await evaluate(`proof.editor.focus.request(proof.marginKey);proof.editor.mounts.get(proof.marginKey).restoreInlineSelection({anchor:0,head:0})`);
 await send('Input.insertText',{text:'Quiet: '},sessionId);
 check('authored margin remains editable in the Flint occurrence',await evaluate(`proof.editor.mounts.get(proof.marginKey).captureText()==='Quiet: A margin thought'&&proof.win.contains(proof.editor.mounts.get(proof.marginKey).root)`));
 await evaluate(`proof.editor.mounts.get(proof.marginKey).root.scrollIntoView({block:'nearest',inline:'nearest'})`);check('authored margin is visibly reachable rather than only mounted',await evaluate(`(()=>{const root=proof.editor.mounts.get(proof.marginKey).root,r=root.getBoundingClientRect();return r.width>0&&r.height>0&&root.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))})()`));await shot('authored-margin');
 await evaluate('proof.editor.repository.undo();proof.editor.repository.undo();proof.editor.repository.undo();proof.editor.focus.request(proof.sourceNode.key);proof.win.querySelector(".flint-application__editor").scrollLeft=0');
 // Shell-only operations preserve native selection, occurrence and canonical history.
 await evaluate(`proof.savedMount=proof.editor.mounts.get(proof.sourceNode.key);proof.editor.focus.request(proof.sourceNode.key);proof.savedMount.restoreInlineSelection({anchor:0,head:3});proof.shellBefore=JSON.stringify(proof.editor.repository.snapshot());proof.shellHistory=0;proof.stopShell=proof.editor.repository.subscribeHistoryChanges(()=>proof.shellHistory++,e=>{throw e});`);
 await pointer('[aria-label="Toggle Library"]');await pointer('[aria-label="Toggle Context"]');
 await pointer('[aria-label="Toggle Library"]');await pointer('[aria-label="Toggle Context"]');
 await click('References');await click('Properties');await click('Backlinks');await evaluate(`proof.win.querySelector('.flint-application__vault .flint-segments button:last-child').click()`);await click('Browse');
 check('rail and lens changes preserve the native mount, range and History',await evaluate(`proof.savedMount===proof.editor.mounts.get(proof.sourceNode.key)&&JSON.stringify(proof.savedMount.captureInlineSelection())==='{"anchor":0,"head":3}'&&proof.shellBefore===JSON.stringify(proof.editor.repository.snapshot())&&proof.shellHistory===0`));await evaluate('proof.stopShell()');
 await click('Storage details');await wait(`!!proof.win.querySelector('[aria-label="Storage and recovery"]')`);await shot('storage');
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27},sessionId);await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27},sessionId);
 check('storage Escape restores its invoker without remounting',await evaluate(`document.activeElement.textContent==='Storage details'&&!proof.win.querySelector('[aria-label="Storage and recovery"]')&&proof.savedMount===proof.editor.mounts.get(proof.sourceNode.key)`));
 // Exercise the actual standard Window resize grip.
 const resizeStart=await evaluate(`(()=>{const r=proof.win.closest('.reactive-window').querySelector('.reactive-window__resize').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
 await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...resizeStart},sessionId);
 await send('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',x:resizeStart.x-620,y:resizeStart.y},sessionId);
 await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x:resizeStart.x-620,y:resizeStart.y},sessionId);
 await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
 check('actual Window resize collapses rails and preserves occurrence',await evaluate(`proof.win.clientWidth<940&&getComputedStyle(proof.win.querySelector('.flint-context')).display==='none'&&getComputedStyle(proof.win.querySelector('.flint-application__vault')).display==='none'&&proof.savedMount===proof.editor.mounts.get(proof.sourceNode.key)`));await shot('narrow-collapsed');
 await evaluate(`proof.narrowMarginPlacement=proof.editor.commands.ensureMargin(proof.sourceNode.key,'left');proof.editor.commands.replaceInlineRange(proof.narrowMarginPlacement,0,0,'A narrow margin');proof.narrowMarginKey=proof.editor.nodeForPlacementInView(proof.narrowMarginPlacement,proof.sourceNode.viewId).key;`);await wait(`!!proof.editor.mounts.get(proof.narrowMarginKey)`);
 check('narrow occurrence keeps margin content visible in flow',await evaluate(`(()=>{const root=proof.editor.mounts.get(proof.narrowMarginKey).root;root.scrollIntoView({block:'nearest'});const r=root.getBoundingClientRect();return r.width>0&&r.height>0&&root.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))})()`));await shot('narrow-margin');await evaluate('proof.editor.repository.undo();proof.editor.repository.undo()');
 await pointer('[aria-label="Toggle Context"]');check('narrow Context sheet remains accessible',await evaluate(`getComputedStyle(proof.win.querySelector('.flint-context')).display!=='none'`));await shot('narrow-context');await pointer('[aria-label="Toggle Context"]');
 await evaluate(`proof.editor.focus.request(proof.sourceNode.key);proof.savedMount.restoreInlineSelection({anchor:0,head:0})`);await send('Input.insertText',{text:'Continued '},sessionId);
 check('ordinary typing continues after resize',await evaluate(`proof.savedMount.captureText().startsWith('Continued See')`));await evaluate('proof.editor.repository.undo()');
 await evaluate(`{const wn=proof.editor.node(proof.windowKey);proof.editor.commands.setPayloadField(wn.key,'metadata',{...JSON.parse(JSON.stringify(wn.payload.metadata)),size:{w:1320,h:800}});proof.editor.focus.request(proof.sourceNode.key);proof.savedMount.restoreInlineSelection({anchor:0,head:3});window.f1Fetch=window.fetch;window.fetch=async(input,init)=>String(input).startsWith('/api/entities')?({ok:true,json:async()=>({Success:true,Results:[],Count:0,Page:1,MaxPage:1})}):f1Fetch(input,init);}`);
 const key=async(key,code,modifiers=0)=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key,code,modifiers},sessionId);await send('Input.dispatchKeyEvent',{type:'keyUp',key,code},sessionId);};
 await key(';','Semicolon',2);await key('r','KeyR');await wait(`!!document.querySelector('.reactive-entity-search')`);
 check('Entity overlay remains outside the shell scroll surfaces',await evaluate(`!proof.win.contains(document.querySelector('.reactive-entity-search'))&&document.querySelector('.reactive-entity-search input[aria-label="Search entities"]').value==='See'`));await shot('entity-overlay');await key('Escape','Escape');
 check('Entity Escape restores native editor selection and focus',await evaluate(`document.activeElement===proof.savedMount.focusElement&&document.getSelection().toString()==='See'`));await evaluate('window.fetch=f1Fetch');
 await evaluate(`proof.editor.focus.request(proof.sourceNode.key);proof.editor.mounts.get(proof.sourceNode.key).restoreInlineSelection({anchor:0,head:3});proof.editor.selections.setPrimary(proof.sourceNode.key,proof.sourceNode.contentKey,proof.sourceNode.viewId,0,3);[...proof.win.querySelectorAll('button')].find(b=>b.textContent==='Link selected text').setAttribute('data-picker-launch','')`);
 await click('References');await pointer('[data-picker-launch]');await wait(`!!proof.win.querySelector('[role="dialog"]')`);
 await key('Escape','Escape');check('reference picker Escape returns focus to its invoker',await evaluate(`!proof.win.querySelector('[aria-label="Choose reference Document"]')&&document.activeElement===proof.win.querySelector('[data-picker-launch]')`));
 await evaluate(`proof.editor.focus.request(proof.sourceNode.key);proof.editor.mounts.get(proof.sourceNode.key).restoreInlineSelection({anchor:0,head:3});proof.editor.selections.setPrimary(proof.sourceNode.key,proof.sourceNode.contentKey,proof.sourceNode.viewId,0,3)`);
 await pointer('[data-picker-launch]');await wait(`!!proof.win.querySelector('[role="dialog"]')`);await pointer('[aria-label="Reference Alpine study"]');await wait(`proof.win.textContent.includes('reference created')`);
 await click('Save Document');await wait(`proof.win.textContent.includes('Saved native Document and Markdown')`);await ready();
 await click('References');await click('References in this Document');await wait(`!!proof.win.querySelector('.flint-reference')`);await click('Follow reference');await wait('proof.id()===proof.targetId');
 await click('Backlinks');await wait(`proof.win.querySelectorAll('.flint-backlink').length===1&&!proof.win.querySelector('.flint-backlink').disabled`);
 await shot('wide-backlinks');check('native reference in a different real directory produces one backlink',await evaluate(`proof.win.querySelector('.flint-backlink').textContent.includes('vault/Notes/source.mutable.json')`));
 await click('Journal');await field('Document title','Reading journal');await click('Apply properties');await click('Save Document');await wait(`proof.win.textContent.includes('Saved native Document and Markdown')`);await ready();
 await evaluate(`proof.win.querySelector('[aria-label="Open vault/Notes/source.mutable.json"]').click()`);await ready();await field('Move destination name','renamed.mutable.json');await click('Apply rename / move');await ready();
 await click('Notes');await field('Move destination folder','vault');await field('Move destination name','Archive');await click('Apply rename / move');await ready();await click('Alpine study');
 await wait(`proof.win.querySelector('.flint-backlink')?.textContent.includes('vault/Archive/renamed.mutable.json')&&!proof.win.querySelector('.flint-backlink').disabled`);
 check('pair/folder relocation and title changes refresh labels while preserving reference identity',await evaluate(`proof.win.querySelector('.flint-backlink').textContent.includes('Reading journal')&&proof.nativeDocumentSession(proof.editor).location(proof.sourceId).folder==='vault/Archive'`));
 await click('Reading journal');await click('Close tab');await click('Alpine study');await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
 await evaluate(`proof.sourceViews=()=>[...proof.editor.projections.values()].filter(p=>(p.state.nodes[p.state.rootKey].payload.metadata??{}).documentId===proof.sourceId)`);check('source remains loaded without a mounted occurrence',await evaluate('proof.sourceViews().length'),0);
 await search('mountain study');await shot('search');check('canonical search finds the unmounted source without mounting it',await evaluate(`proof.win.querySelectorAll('.flint-search-hit').length===1&&proof.sourceViews().length===0`));await pointer('.flint-search-hit');await wait('proof.id()===proof.sourceId');await wait(`JSON.stringify(proof.editor.mounts.get(proof.editor.focus.state.focusedKey)?.captureInlineSelection?.())==='{"anchor":8,"head":22}'`);
 await click('Alpine study');await wait(`!!proof.win.querySelector('.flint-backlink')&&!proof.win.querySelector('.flint-backlink').disabled`);
 await evaluate(`proof.editor.commandRegistry.execute('flint.open',{targetKey:proof.session.projection.state.rootKey,args:undefined});proof.two=[...proof.host.querySelectorAll('.flint-application')].find(w=>w!==proof.one);proof.win=proof.two`);await field('Vault directory','vault');await click('Open Vault');await wait(`!!proof.win.querySelector('[aria-label="Open vault/Research/target.mutable.json"]')`);await ready();await evaluate(`proof.win.querySelector('[aria-label="Open vault/Research/target.mutable.json"]').click()`);await wait('proof.id()===proof.targetId');await ready();await click('Backlinks');await wait(`proof.win.querySelectorAll('.flint-backlink').length===1&&!proof.win.querySelector('.flint-backlink').disabled`);
 await evaluate(`proof.two.closest('.reactive-window').style.transform='translate(440px,170px)';proof.two.closest('.reactive-window').style.width='900px';proof.two.querySelector('[aria-label="Toggle Context"]').click()`);await shot('two-windows-same-document');
 if(process.env.P3_SHADOW){const initial=await evaluate(`(async()=>{const m=await import('/src/qualification/native-knowledge/p3-ui-shadow.ts');proof.p3=await m.start(proof.editor);return proof.p3.initial})()`);check('P3 two Window leases share two canonical live contributions',initial.facts,2);await writeFile(path.join(artifacts,'p3-initial.json'),JSON.stringify(initial,null,2));}
 await evaluate(`proof.before=JSON.stringify(proof.editor.repository.snapshot());proof.history=0;proof.stopHistory=proof.editor.repository.subscribeHistoryChanges(()=>proof.history++,e=>{throw e})`);
 await click('Backlinks');await evaluate(`if(proof.win.clientWidth<940&&proof.win.dataset.narrowPanel!=='context')proof.win.querySelector('[aria-label="Toggle Context"]').click()`);await pointer('.flint-backlink');await wait('proof.id()===proof.sourceId');await wait(`proof.two.contains(proof.editor.mounts.get(proof.editor.focus.state.focusedKey)?.root)&&JSON.stringify(proof.editor.mounts.get(proof.editor.focus.state.focusedKey)?.captureInlineSelection?.())==='{"anchor":0,"head":3}'`);
 check('backlink follows source mention in invoking Window without moving the other Window',await evaluate(`proof.one.querySelector('[data-flint-property="id"]').textContent===proof.targetId`));
 check('backlink query/navigation creates no canonical mutation or History event',await evaluate('proof.before===JSON.stringify(proof.editor.repository.snapshot())&&proof.history===0'));await evaluate('proof.stopHistory()');
 await click('References');await click('References in this Document');await wait(`!!proof.win.querySelector('.flint-reference')&&!proof.win.querySelector('.flint-reference button:last-child').disabled`);await click('Remove reference');await wait(`proof.one.querySelectorAll('.flint-backlink').length===0`);await evaluate('proof.editor.repository.undo()');await wait(`proof.one.querySelectorAll('.flint-backlink').length===1`);await evaluate('proof.editor.repository.redo()');await wait(`proof.one.querySelectorAll('.flint-backlink').length===0`);await evaluate('proof.editor.repository.undo()');await wait(`proof.one.querySelectorAll('.flint-backlink').length===1`);
 if(process.env.P4_FACTS!=='0'){
  await evaluate(`proof.focused=proof.editor.node(proof.editor.focus.state.focusedKey);proof.focusSource=()=>{const n=proof.focused;proof.editor.focus.request(n.key);proof.editor.mounts.get(n.key).restoreInlineSelection({anchor:0,head:3});return proof.editor.mounts.get(n.key)};proof.focusSource()`);
  await evaluate(`(()=>{const m=proof.focusSource();m.focusElement.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,ctrlKey:true,button:0,pointerId:11}));m.focusElement.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,ctrlKey:true,pointerId:11,clientX:20}));m.restoreInlineSelection({anchor:0,head:3});m.focusElement.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,ctrlKey:true,button:0,pointerId:11}));})()`);
  await evaluate('new Promise(r=>setTimeout(r,50))');
  check('Grouping retains invoking occurrence scope with Facts panels active',await evaluate('proof.editor.currentTextOperation.annotationOperation()?.annotationTargets()?.[0].nodeKey===proof.focused.key'));
  await evaluate('proof.editor.currentTextOperation.active()?.cancel();proof.editor.focus.request(proof.focused.key);proof.editor.mounts.get(proof.focused.key).restoreInlineSelection({anchor:0,head:0})');
  await send('Input.imeSetComposition',{text:'日本',selectionStart:2,selectionEnd:2},sessionId);
  await send('Input.insertText',{text:'日本'},sessionId);
  check('IME commits native text while Facts panels observe',await evaluate(`proof.editor.repository.state.contents[proof.focused.contentKey].inlineContent.slice(0,2).map(k=>proof.editor.repository.state.contents[proof.editor.repository.state.placements[k].contentKey].payload.text).join('')==='日本'`));
  await wait(`proof.one.querySelectorAll('.flint-backlink').length===1&&!proof.one.querySelector('.flint-backlink').disabled`);
  await evaluate('proof.editor.repository.undo()');
  await wait(`proof.one.querySelectorAll('.flint-backlink').length===1&&!proof.one.querySelector('.flint-backlink').disabled`);
 }
 check('reference removal and Undo/Redo update the other Window backlinks',true);await click('Save Document');await wait(`proof.win.textContent.includes('Saved native Document and Markdown')`);await ready();
 await mkdir(path.join(storeRoot,'vault/External'));await click('Refresh');await ready();check('Refresh reconstructs external directory changes without a hierarchy catalog',await evaluate(`proof.one.textContent.includes('External')&&proof.two.textContent.includes('External')`));
 await click('Properties');check('closing one panel leaves the other consumer active',await evaluate(`!proof.two.querySelector('[aria-label="Document backlinks"]')&&!!proof.one.querySelector('[aria-label="Document backlinks"]')`));
 await evaluate(`proof.one.querySelector('.flint-backlink')?.scrollIntoView({block:'center'})`);await shot('two-window-backlinks');
 if(process.env.P3_SHADOW){const checkResult=await evaluate('proof.p3.check(proof.targetId)');check('P3 shadow native backlink agrees in both consumers',checkResult.one,1);check('P3 second query lease agrees',checkResult.two,1);const closeOne=await evaluate('proof.p3.closeOne()');check('P3 independent query close retains both canonical resources',closeOne.facts,2);const typing=await evaluate('proof.p3.typing(proof.sourceId)');const released=await evaluate('proof.p3.dispose()');check('P3 shadow cleanup releases every contribution',released,0);await writeFile(path.join(artifacts,'p3-shadow.json'),JSON.stringify({checkResult,closeOne,typing,released},null,2));}
 // Restart server and editor; explicitly open target then source to demonstrate coverage.
 backend.kill('SIGKILL');await new Promise(r=>backend.once('exit',r));await startBackend();await evaluate(`proof.dispose();proof.session.dispose();Object.assign(proof,proof.setup());proof.win=proof.host.querySelector('.flint-application')`);
 await field('Vault directory','vault');await click('Open Vault');await wait(`!!proof.win.querySelector('[aria-label="Open vault/Research/target.mutable.json"]')`);await ready();await evaluate(`proof.win.querySelector('[aria-label="Open vault/Research/target.mutable.json"]').click()`);await wait('proof.id()===proof.targetId');await ready();await click('Backlinks');if(process.env.P5_SAVED==='1'){
 await wait(`!!proof.win.querySelector('.flint-backlink')&&!proof.win.querySelector('.flint-backlink').disabled`);
 check('fresh reopen derives the saved source backlink without background Open',await evaluate(`!proof.nativeDocumentSession(proof.editor).location(proof.sourceId)&&proof.win.querySelectorAll('.flint-backlink').length===1`));
 await evaluate(`proof.win.querySelector('.flint-backlink').focus()`);await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r',unmodifiedText:'\r'},sessionId);await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13},sessionId);
 await wait('proof.id()===proof.sourceId');await wait(`JSON.stringify(proof.editor.mounts.get(proof.editor.focus.state.focusedKey)?.captureInlineSelection?.())==='{"anchor":0,"head":3}'`);
 check('saved backlink keyboard activation admits only its source and restores native selection',true);
 }else{ await wait(`proof.win.querySelector('[aria-label="Document backlinks"]').textContent.includes('Incomplete coverage')`);check('fresh reopen reports unopened sources rather than claiming complete absence',await evaluate(`proof.win.querySelectorAll('.flint-backlink').length===0&&proof.win.querySelector('[aria-label="Document backlinks"]').textContent.includes('unopened')`)); }
 await shot('incomplete-coverage');await evaluate(`proof.win.querySelector('[aria-label="Open vault/Archive/renamed.mutable.json"]').click()`);await wait('proof.id()===proof.sourceId');await ready();check('reopened source retains native title/tags and the new physical binding',await evaluate(`proof.win.querySelector('[aria-label="Document title"]').value==='Reading journal'&&proof.win.querySelector('[aria-label="Document tags"]').value==='alpine\\nreading'`));await click('Alpine study');await wait(`proof.win.querySelectorAll('.flint-backlink').length===1&&!proof.win.querySelector('.flint-backlink').disabled`);await evaluate(`proof.win.querySelector('.flint-backlink').focus()`);assert.equal(await evaluate(`document.activeElement===proof.win.querySelector('.flint-backlink')`),true,'backlink receives keyboard focus');await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r',unmodifiedText:'\r'},sessionId);await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13},sessionId);await wait('proof.id()===proof.sourceId');await wait(`JSON.stringify(proof.editor.mounts.get(proof.editor.focus.state.focusedKey)?.captureInlineSelection?.())==='{"anchor":0,"head":3}'`);check('native files rebuild the same backlink after restart with keyboard activation and source focus',true);
 await click('Alpine study');await wait(`!!proof.win.querySelector('.flint-backlink')&&!proof.win.querySelector('.flint-backlink').disabled`);await evaluate(`proof.win.querySelector('.flint-backlink').scrollIntoView({block:'center'})`);await shot('reopened-backlinks');
 await writeFile(path.join(artifacts,'source.mutable.json'),await readFile(path.join(storeRoot,'vault/Archive/renamed.mutable.json')));await writeFile(path.join(artifacts,'target.mutable.json'),await readFile(path.join(storeRoot,'vault/Research/target.mutable.json')));

 backend.kill('SIGKILL');await new Promise(r=>backend.once('exit',r));process.env.PROOF_READONLY='1';await startBackend();await click('Refresh');await ready();
 check('read-only storage remains visible with both rails closed',await evaluate(`proof.win.querySelector('[aria-label="Toggle Library"]').click();proof.win.querySelector('[aria-label="Toggle Context"]').click();proof.win.querySelector('.flint-attention').textContent.includes('Read-only storage')&&[...proof.win.querySelectorAll('button')].find(b=>b.textContent==='Save Document').disabled`));await shot('read-only-attention');
 check('no uncaught browser exceptions',errors.length,0);await writeFile(path.join(artifacts,'browser-results.json'),JSON.stringify({passed:checks.length,checks,errors},null,2));console.log(JSON.stringify({passed:checks.length,checks},null,2));await evaluate('proof.dispose();proof.session.dispose();proof.host.remove()');
}finally{socket?.close();chrome.kill('SIGKILL');backend.kill('SIGKILL');await vite.close();await new Promise(r=>setTimeout(r,300));await rm(profile,{recursive:true,force:true});await rm(storeRoot,{recursive:true,force:true});}
process.exit(0);
