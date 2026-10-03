process.env.PROOF_SQLITE='1';
// P3d canonical Entity/LER browser qualification. Node 22+, CHROME_BIN supported.
// Uses an isolated temporary document store, actual server process and Vite host.
// Writes only fixture files; evidence goes to artifacts/sqlite-p3d/browser.
import { spawn } from 'node:child_process';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { tmpdir } from 'node:os';
import path from 'node:path';
const artifacts=process.env.PROOF_ARTIFACTS??'artifacts/sqlite-p3d/browser';await mkdir(artifacts,{recursive:true});
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
 proof.wait=async predicate=>{for(let i=0;i<150;i++){if(predicate())return;await new Promise(r=>setTimeout(r,30));}throw Error('UI wait timed out: '+host.textContent.slice(0,800)+' LER: '+document.querySelector('.reactive-entity-search')?.textContent)};
 })()`);
 await evaluate(`proof.one=proof.host.querySelector('.flint-application');proof.win=proof.one;
 proof.click=text=>{if(text==='Close tab'||text==='Files'){const m=proof.win.querySelector('[aria-label="Flint application menu"]');if(m.getAttribute('aria-expanded')!=='true')m.click();}const b=[...proof.win.querySelectorAll('button')].find(b=>b.textContent===text);if(!b||b.disabled)throw Error('Button unavailable '+text);b.click();};
 proof.field=(label,value)=>{const el=proof.win.querySelector('[aria-label="'+label+'"]');if(!el)throw Error('Field missing '+label);el.value=value;el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));};
 proof.id=()=>proof.win.querySelector('[data-flint-property="id"]').textContent;
 proof.ready=()=>![...proof.win.querySelectorAll('button')].find(b=>b.textContent==='Refresh')?.disabled;
 `);
 const click=label=>evaluate(`proof.click(${JSON.stringify(label)})`),field=(label,value)=>evaluate(`proof.field(${JSON.stringify(label)},${JSON.stringify(value)})`),wait=p=>evaluate(`proof.wait(()=>(${p}))`);
 const ready=()=>wait('proof.ready()');
 const shot=async name=>{const {data}=await send('Page.captureScreenshot',{format:'png'},sessionId);await writeFile(path.join(artifacts,name+'.png'),Buffer.from(data,'base64'));};
 await field('Vault directory','vault');await click('Open Vault');await wait(`!!proof.win.querySelector('[aria-label="Selected folder"]')`);await ready();
 const create=async(filename,title,text)=>{await field('New Document filename',filename);await field('New Document title',title);await click('New Document');await wait(`proof.win.textContent.includes('Saved native Document and Markdown')`);await ready();await evaluate(`proof.currentId=proof.id();proof.view=[...proof.editor.projections.values()].find(p=>p!==proof.session.projection&&(p.state.nodes[p.state.rootKey].payload.metadata??{}).documentId===proof.currentId);proof.node=Object.values(proof.view.state.nodes).find(n=>n.viewType==='standoff-editor-block');proof.editor.focus.request(proof.node.key);proof.editor.mounts.get(proof.node.key).restoreInlineSelection({anchor:0,head:0})`);await send('Input.insertText',{text},sessionId);await click('Save Document');await wait(`proof.win.textContent.includes('Saved native Document and Markdown')`);await ready();return evaluate('proof.currentId');};
 const search=async q=>{await evaluate(`proof.win.querySelector('.flint-search-launch').click()`);for(let i=0;i<30;i++){await field('Search vault',q);await click('Search vault');await wait(`proof.win.textContent.includes('results ·')`);if(process.env.P5_SAVED!=='1'||await evaluate(`!!proof.win.querySelector('.flint-search-hit')`))return;await new Promise(r=>setTimeout(r,100));}throw Error('Expected source never became available');};
 const pointer=async selector=>{const p=await evaluate(`(()=>{const el=proof.win.querySelector(${JSON.stringify(selector)});el.scrollIntoView({block:'center'});const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...p},sessionId);await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...p},sessionId);};
 await create('source.mutable.json','Source','he met Firenze. Leo writes. he');
 const ler=async expression=>evaluate(`(()=>{const p=document.querySelector('.reactive-entity-search');if(!p)throw Error('LER missing');${expression}})()`);
 const lfield=(name,value)=>ler(`const e=p.querySelector('[aria-label="${name}"]');e.value=${JSON.stringify(value)};e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));`);
 const lclick=text=>ler(`const b=[...p.querySelectorAll('button')].find(b=>b.textContent===${JSON.stringify(text)});if(!b||b.disabled)throw Error('LER button unavailable '+${JSON.stringify(text)}+' '+p.textContent);b.click();`);
 const open=async(start=0,end=2)=>{await evaluate(`proof.editor.focus.request(proof.node.key);proof.editor.mounts.get(proof.node.key).restoreInlineSelection({anchor:${start},head:${end}});proof.editor.annotationUI.get('codex/entity-reference').apply([{nodeKey:proof.node.key,start:${start},end:${end}}],proof.node.key);`);await wait(`!!document.querySelector('.reactive-entity-search')`);};
 const closed=()=>wait(`!document.querySelector('.reactive-entity-search')`);
 const resolve=async(query,stream='name',scope='vault')=>{await lfield('Search entities',query);await lfield('Entity stream',stream);await lfield('Entity scope',scope);for(let i=0;i<20;i++){await evaluate('new Promise(r=>setTimeout(r,250))');if(await ler(`return !!p.querySelector('tbody button');`))return;if(await ler("return ![...p.querySelectorAll('button')].find(b=>b.textContent==='Refresh candidates').disabled;"))await lclick('Refresh candidates');}throw Error('Candidates unavailable: '+await ler('return p.textContent;'));};
 await open();await lfield('Search entities','leonardo');await lclick('+ Create Entity');await lfield('Canonical name','Leonardo da Vinci');await shot('independent-target-query-name');await lclick('Create and link');await closed();
 check('actual LER/HTTP/worker creation links he without replacing prose',await evaluate(`(()=>{const n=proof.editor.node(proof.node.key),p=n.payload.standoffProperties[0];proof.entityId=p.value;return p.start===0&&p.end===1&&p.metadata.entityName==='Leonardo da Vinci'&&proof.editor.mounts.get(proof.node.key).focusElement.textContent.includes('he met Firenze');})()`));
 await evaluate('proof.editor.repository.undo()');check('native Undo removes annotation only',await evaluate(`!(proof.editor.node(proof.node.key).payload.standoffProperties??[]).length`));
 await open();await resolve('Leonardo');await lclick('Details / aliases');await wait(`!!document.querySelector('[aria-label="Explicit alias"]')`);await lfield('Explicit alias','Leo');await lclick('Add alias');await wait(`document.querySelector('[aria-label="Canonical Entity details"]').textContent.includes('curated')`);await shot('canonical-alias');
 await resolve('Leo','alias');check('explicit alias resolution preserves provenance',await ler(`return p.querySelector('tbody').textContent.includes('Alias match: Leo');`));await lclick('Link');await closed();
 await open(28,30);await resolve('he','mention','document');check('live unsaved mention is resolver evidence without becoming an alias',await ler(`return p.querySelector('tbody').textContent.includes('Mention match: he');`));await lclick('Link');await closed();
 await click('Save Document');await ready();const savedBeforeAlias=await readFile(path.join(storeRoot,'vault/source.mutable.json'));
 await open(16,19);await resolve('Leonardo');await lclick('Replace & Link');await closed();check('Replace and Link is one Undo unit',await evaluate(`(()=>{const before=proof.editor.node(proof.node.key).payload.standoffProperties.length;proof.editor.repository.undo();return proof.editor.node(proof.node.key).payload.standoffProperties.length===before-1;})()`));
 await open();await resolve('Leonardo');await lclick('Details / aliases');await wait(`!!document.querySelector('[aria-label="Explicit alias"]')`);await lfield('Preferred name','Leonardo, artist');await lclick('Update name');await wait(`document.querySelector('[aria-label="Canonical Entity details"] strong').textContent==='Leonardo, artist'`);await lclick('Cancel');await closed();
 check('canonical name edits never rewrite Resource bytes',Buffer.compare(savedBeforeAlias,await readFile(path.join(storeRoot,'vault/source.mutable.json'))),0);
 await click('Save Document');await ready();
 // Qualified pair relocation changes location, not native assertions or canonical Entity identity.
 await evaluate(`proof.win.querySelector('[aria-label="Open vault/source.mutable.json"]').click()`);await ready();
 await field('Move destination folder','vault/nested');await field('Move destination name','moved.mutable.json');await click('Apply rename / move');await ready();
 check('Entity references survive native pair relocation',await evaluate(`proof.nativeDocumentSession(proof.editor).location(proof.currentId).filename==='moved.mutable.json'&&proof.editor.node(proof.node.key).payload.standoffProperties.every(p=>p.value===proof.entityId)`));
 await evaluate(`proof.win.querySelector('[aria-label="Open vault/nested/moved.mutable.json"]').click()`);await ready();await field('Move destination folder','vault');await field('Move destination name','source.mutable.json');await click('Apply rename / move');await ready();
 // Exercise real process death/reopen: canonical SQLite knowledge and native assertions have independent durable authorities.
 backend.kill('SIGKILL');await new Promise(r=>backend.once('exit',r));await startBackend();await evaluate(`proof.savedId=proof.currentId;proof.dispose();proof.session.dispose();Object.assign(proof,proof.setup());proof.win=proof.host.querySelector('.flint-application')`);
 await field('Vault directory','vault');await click('Open Vault');await wait(`!!proof.win.querySelector('[aria-label="Open vault/source.mutable.json"]')`);await ready();await evaluate(`proof.win.querySelector('[aria-label="Open vault/source.mutable.json"]').click()`);await wait('proof.id()===proof.savedId');await ready();
 await evaluate(`proof.currentId=proof.id();proof.view=[...proof.editor.projections.values()].find(p=>p!==proof.session.projection&&(p.state.nodes[p.state.rootKey].payload.metadata??{}).documentId===proof.currentId);proof.node=Object.values(proof.view.state.nodes).find(n=>n.viewType==='standoff-editor-block')`);
 await open();await resolve('Leo','alias');check('restart/native reopen retains canonical GUID, current name and alias',await ler(`return p.querySelector('tbody').textContent.includes(proof.entityId)&&p.querySelector('tbody').textContent.includes('Leonardo, artist');`));await lclick('Cancel');await closed();
 check('native references retain stable canonical GUID after rename/restart',await evaluate(`proof.editor.node(proof.node.key).payload.standoffProperties.every(p=>p.value===proof.entityId)`));
 // Modal focus restores to the invoking occurrence, not a global last active Window.
 await evaluate(`proof.editor.commandRegistry.execute('flint.open',{targetKey:proof.session.projection.state.rootKey,args:undefined});proof.two=[...proof.host.querySelectorAll('.flint-application')].find(w=>w!==proof.win);proof.one=proof.win;proof.win=proof.two;`);await field('Vault directory','vault');await click('Open Vault');await ready();await evaluate(`proof.win.querySelector('[aria-label="Open vault/source.mutable.json"]').click()`);await wait('proof.id()===proof.savedId');await ready();
 await evaluate(`proof.node=[...proof.editor.projections.values()].flatMap(v=>Object.values(v.state.nodes)).find(n=>n.viewType==='standoff-editor-block'&&proof.win.contains(proof.editor.mounts.get(n.key)?.root));if(!proof.node)throw Error('Second occurrence missing');`);
 await open();await resolve('Leonardo');await lclick('Cancel');await closed();check('panel restores invoking occurrence focus',await evaluate(`proof.editor.focus.state.focusedKey===proof.node.key`));
 // Hold a real committed response while another occurrence edits the source.
 await open(7,14);await lfield('Search entities','Florence');await lclick('+ Create Entity');await lfield('Canonical name','Florence');
 await evaluate(`proof.realFetch=window.fetch.bind(window);window.fetch=async(url,options)=>{const response=await proof.realFetch(url,options);if(String(url).endsWith('/entities')&&JSON.parse(options.body).request.op==='create'){proof.committedCreate=true;return new Promise(r=>proof.releaseCreate=()=>r(response));}return response;}`);
 await lclick('Create and link');await wait('proof.committedCreate');await evaluate(`proof.editor.commands.replaceInlineRange(proof.node.key,0,0,'Z');window.fetch=proof.realFetch;proof.releaseCreate();`);await wait(`document.querySelector('.reactive-entity-search')?.textContent.includes('was created, but')`);
 await evaluate(`proof.editor.focus.request(proof.node.key);proof.editor.mounts.get(proof.node.key).restoreInlineSelection({anchor:0,head:1});`);await lclick('Bind to new selection');await closed();
 check('confirmed creation after stale target can bind a fresh native selection',await evaluate(`proof.editor.node(proof.node.key).payload.standoffProperties.some(p=>p.start===0&&p.end===0&&p.metadata?.entityName==='Florence')&&JSON.stringify(proof.editor.mounts.get(proof.node.key).captureInlineSelection())==='{"anchor":0,"head":1}'`));
 await evaluate('proof.editor.repository.undo();proof.editor.repository.undo()');
 const {default:Database}=await import('better-sqlite3');const inspection=new Database(path.join(storeRoot,'vault/.mutable/mutable.db'),{readonly:true});
 try{check('native mentions never manufacture aliases or Relationships',inspection.prepare("SELECT (SELECT count(*) FROM Entity) AS entities,(SELECT count(*) FROM EntityAlias WHERE origin='curated') AS aliases,(SELECT count(*) FROM EntityAlias WHERE origin='observed') AS observed,(SELECT count(*) FROM Relationship) AS relationships").get(),{entities:2,aliases:1,observed:0,relationships:0});}finally{inspection.close();}
 check('no uncaught browser exceptions',errors.length,0);await shot('reopened-canonical-entity');await writeFile(path.join(artifacts,'source.mutable.json'),await readFile(path.join(storeRoot,'vault/source.mutable.json')));await writeFile(path.join(artifacts,'browser-results.json'),JSON.stringify({passed:checks.length,checks,errors},null,2));console.log(JSON.stringify({passed:checks.length,checks},null,2));
 await evaluate('proof.dispose();proof.session.dispose();proof.host.remove()');
}finally{socket?.close();chrome.kill('SIGKILL');backend.kill('SIGKILL');await vite.close();await new Promise(r=>setTimeout(r,300));await rm(profile,{recursive:true,force:true});await rm(storeRoot,{recursive:true,force:true});}
process.exit(0);
