process.env.PROOF_SQLITE='1';
// Manual acceptance canonical Entity/LER browser qualification. Node 22+, CHROME_BIN supported.
// Uses an isolated temporary document store, actual server process and Vite host.
// Writes only fixture files; evidence goes to artifacts/flint-manual-acceptance/browser.
import { spawn } from 'node:child_process';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { tmpdir } from 'node:os';
import path from 'node:path';
const artifacts=process.env.PROOF_ARTIFACTS??'artifacts/flint-manual-acceptance/browser';await mkdir(artifacts,{recursive:true});
const storeRoot=await mkdtemp(path.join(tmpdir(),'flint-native-store-'));
await mkdir(path.join(storeRoot,'vault/nested'),{recursive:true});
await writeFile(path.join(storeRoot,'vault/standalone.md'),'# Imported\n\n**native bold**');
await writeFile(path.join(storeRoot,'vault/nested/raven.json'),await readFile('data/raven.json'));
await writeFile(path.join(storeRoot,'vault/invalid.json'),JSON.stringify({format:'unsupported',version:99}));
await writeFile(path.join(storeRoot,'vault/info.txt'),'An ordinary physical file');
const {createServer:netServer}=await import('node:net');const reservation=netServer();await new Promise(r=>reservation.listen(0,'127.0.0.1',r));let port=reservation.address().port;await new Promise(r=>reservation.close(r));let backend;
const startBackend=async()=>{backend=spawn(process.execPath,['dist/server/index.js'],{env:{...process.env,PORT:String(port),SPEEDY_DOCUMENT_ROOT:path.join(storeRoot,'vault'),SPEEDY_WORKSPACE_ROOT:storeRoot,SPEEDY_DISABLE_DATABASE:'1'},stdio:['ignore','pipe','pipe']});
await new Promise((resolve,reject)=>{let output='';backend.stdout.on('data',b=>{output+=b.toString();if(output.includes('Server running at localhost:'))resolve();});backend.stderr.on('data',b=>process.stderr.write(b));backend.once('error',reject);backend.once('exit',code=>reject(Error('Production server exited '+code)));});};
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

 const checks=[], errors=[];const check=(name,value,expected=true)=>{assert.deepEqual(value,expected,name);checks.push(name);console.log("PASS",name);};
 socket.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails)});
 await send('Runtime.enable',{},sessionId);await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false},sessionId);
 // Ordinary application entry: no synthetic editor, direct admission, or source binding setup.
 await send('Page.navigate',{url:appUrl},sessionId);
 const wait=async expression=>{for(let i=0;i<150;i++){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,100));}throw Error('UI timeout: '+expression+'\n'+await evaluate('document.body.innerText.slice(-7000)'));};
 const click=async(label,scope='document')=>{await wait(`!![...(${scope}).querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)}&&!b.disabled)`);return evaluate(`(()=>{const root=${scope},b=[...root.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)});if(!b||b.disabled)throw Error('Button unavailable: '+${JSON.stringify(label)});b.click();})()`);};
 const win=`document.querySelector('.flint-application')`,panel=`document.querySelector('.reactive-entity-search')`;
 const field=async(label,value,scope=win)=>evaluate(`(()=>{const e=(${scope}).querySelector('[aria-label="'+${JSON.stringify(label)}+'"]');if(!e)throw Error('Field missing '+${JSON.stringify(label)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`);
 const shot=async name=>{const {data}=await send('Page.captureScreenshot',{format:'png'},sessionId);await writeFile(path.join(artifacts,name+'.png'),Buffer.from(data,'base64'));};
 const launch=async()=>{await wait(`!![...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Workspace')`);await click('Workspace');await click('Open Flint');await wait(`!!${win}`);};
 const vault=async()=>{await wait(`(${win}).textContent.includes('Vault: .')&&!([...(${win}).querySelectorAll('button')].find(b=>b.textContent==='Refresh')?.disabled)`);check('default Mutable Vault established without writable override',true);};
 const idle=()=>wait(`![...(${win}).querySelectorAll('button')].find(b=>b.textContent==='Refresh')?.disabled`);
 const openRow=async p=>{await idle();await evaluate(`(${win}).querySelector('[aria-label="Open '+${JSON.stringify(p)}+'"]').click()`);await idle();};
 const select=async()=>{await evaluate(`(()=>{const e=(${win}).querySelector('[contenteditable="true"]');if(!e)throw Error('Editable Document missing');e.focus();const r=document.createRange();r.selectNodeContents(e);const s=window.getSelection();s.removeAllRanges();s.addRange(r);})()`);};
 const ler=async()=>{await select();await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');await send('Input.dispatchKeyEvent',{type:'keyDown',key:';',code:'Semicolon',modifiers:2,windowsVirtualKeyCode:186},sessionId);await send('Input.dispatchKeyEvent',{type:'keyUp',key:';',code:'Semicolon',modifiers:2,windowsVirtualKeyCode:186},sessionId);await send('Input.dispatchKeyEvent',{type:'keyDown',key:'r',code:'KeyR',windowsVirtualKeyCode:82},sessionId);await send('Input.dispatchKeyEvent',{type:'keyUp',key:'r',code:'KeyR',windowsVirtualKeyCode:82},sessionId);await wait(`!!${panel}`);};
 const resolve=async(name)=>{await field('Search entities',name,panel);await wait(`(${panel}).querySelector('tbody')?.textContent.includes(${JSON.stringify(name)})`);};
 await launch();await vault();
 await ler();await wait(`(${panel}).textContent.includes('Save this Document')`);await click('+ Create Entity',panel);await click('Create and link',panel);await wait(`(${panel}).textContent.includes('Not created')&&!(${panel}).textContent.includes('Creation outcome unconfirmed')`);
 check('initial unbound tab explains Save prerequisite and reports no creation',true);await shot('unbound-prerequisite');await click('Cancel',panel);
 check('physical files and nested legacy JSON are visible',await evaluate(`!!(${win}).querySelector('[aria-label="Open info.txt"]')&&!!(${win}).querySelector('[aria-label="Open nested/raven.json"]')`));
 await click('nested',win);check('nested folder selectable',await evaluate(`(${win}).querySelector('[aria-label="Selected folder"]').textContent==='nested'`));
 await openRow('nested/raven.json');await wait(`!!(${win}).querySelector('[contenteditable="true"]')&&(${win}).textContent.includes('legacy-block-tree')`);check('real Raven corpus Document opens through ordinary Flint',await evaluate(`(${win}).querySelector('[contenteditable="true"]')?.textContent.length>0`));await shot('legacy-open');
 await select();await send('Input.insertText',{text:'Raven acceptance'},sessionId);await click('Save Document',win);await wait(`(${win}).textContent.includes('Saved Document in place')`);await idle();
 const ravenFirst=JSON.parse(await readFile(path.join(storeRoot,'vault/nested/raven.json'),'utf8')),originalRaven=JSON.parse(await readFile('data/raven.json','utf8'));
 check('Raven saves in its existing legacy format and identity',ravenFirst.id===originalRaven.id&&ravenFirst.type===originalRaven.type&&!ravenFirst.format);
 await ler();await wait(`!(${panel}).textContent.includes('Finding')`);await click('+ Create Entity',panel);await click('Create and link',panel);await wait(`!${panel}`);
 await click('Save Document',win);await wait(`(${win}).textContent.includes('Saved Document in place')`);await idle();
 const collectRefs=v=>!v||typeof v!=='object'?[]:[...(v.type==='codex/entity-reference'?[v]:[]),...Object.values(v).flatMap(collectRefs)];
 const ravenSaved=JSON.parse(await readFile(path.join(storeRoot,'vault/nested/raven.json'),'utf8')),ravenRefs=collectRefs(ravenSaved),ravenEntity=ravenRefs.at(-1)?.value;check('Raven EntityReference saved without conversion',typeof ravenEntity==='string');
 await ler();await resolve('Raven acceptance');await click('Details / aliases',panel);await wait(`!!(${panel}).querySelector('[aria-label="Explicit alias"]')`);await field('Explicit alias','The acceptance raven',panel);await click('Add alias',panel);await wait(`(${panel}).textContent.includes('curated')`);await field('Entity stream','alias',panel);await resolve('The acceptance raven');check('Raven canonical alias resolution works',true);await field('Entity stream','mention',panel);await field('Entity scope','document',panel);await resolve('Raven acceptance');await wait(`(${panel}).querySelector('tbody').textContent.includes('Mention match')`);check('Raven current-Document mention resolution works',true);await click('Cancel',panel);await shot('raven-linked');
 await click('.',win);check('return to vault root',await evaluate(`(${win}).querySelector('[aria-label="Selected folder"]').textContent==='.'`));await openRow('invalid.json');await wait(`(${win}).textContent.includes('Unsupported resource format/version')`);check('incompatible JSON produces content recognition error',true);
 await field('New Document filename','manual.mutable.json');await field('New Document title','Manual acceptance');await click('New Document',win);await wait(`(${win}).textContent.includes('Saved native Document and Markdown')`);await idle();
 await select();await send('Input.insertText',{text:'Mutable OS'},sessionId);await click('Save Document',win);await wait(`(${win}).textContent.includes('Saved native Document and Markdown')`);await idle();
 await ler();await wait(`(${panel}).textContent.includes('Coverage complete.')`);check('New Document / Save reaches usable Entity service without reopen',true);
 check('native selection initializes target and query',await evaluate(`(${panel}).querySelector('[data-entity-target]').textContent==='Mutable OS'&&(${panel}).querySelector('[aria-label="Search entities"]').value==='Mutable OS'`));
 await click('+ Create Entity',panel);await click('Create and link',panel);await wait(`!${panel}`);await click('Save Document',win);await wait(`(${win}).textContent.includes('Saved native Document and Markdown')`);await idle();
 const saved=JSON.parse(await readFile(path.join(storeRoot,'vault/manual.mutable.json'),'utf8'));const refs=saved.document.blocks.flatMap(b=>b.properties?.standoffProperties??[]).filter(p=>p.type==='codex/entity-reference');check('create and link persists target GUID and native range',refs.length,1);const entityId=refs[0].value;
 await ler();await resolve('Mutable OS');await click('Details / aliases',panel);await wait(`!!(${panel}).querySelector('[aria-label="Explicit alias"]')`);await field('Explicit alias','Mutable',panel);await click('Add alias',panel);await wait(`(${panel}).textContent.includes('curated')`);await field('Entity stream','alias',panel);await resolve('Mutable');check('canonical alias service available on UI-created binding',true);await click('Cancel',panel);await shot('native-linked');
 // Process restart + actual page reload: Open uses the normal vault row and builds its own binding.
 backend.kill('SIGTERM');await new Promise(r=>backend.once('exit',r));await startBackend();await send('Page.reload',{},sessionId);await launch();await vault();await openRow('manual.mutable.json');await wait(`(${win}).querySelector('[contenteditable="true"]')?.textContent==='Mutable OS'`);await ler();await resolve('Mutable OS');check('existing native Open resolves same canonical Entity after restart',await evaluate(`(${panel}).querySelector('tbody').textContent.includes(${JSON.stringify(entityId)})`));await click('Cancel',panel);
 await openRow('nested/raven.json');await wait(`(${win}).querySelector('[contenteditable="true"]')?.textContent.includes('Raven acceptance')`);await ler();await resolve('Raven acceptance');check('Raven restart preserves Document identity and canonical Entity GUID',await evaluate(`(${panel}).querySelector('tbody').textContent.includes(${JSON.stringify(ravenEntity)})`));await click('Cancel',panel);await shot('reopened-raven');
 check('Mutable infrastructure belongs to the configured Vault root',!!(await readFile(path.join(storeRoot,'vault/.mutable/mutable.db'))));
 check('Raven has no generated Markdown or converted native sibling',await import('node:fs/promises').then(fs=>fs.readdir(path.join(storeRoot,'vault/nested'))),['raven.json']);
 check('no uncaught browser exceptions',errors.length,0);await shot('reopened-native');await writeFile(path.join(artifacts,'browser-results.json'),JSON.stringify({passed:checks.length,checks,errors},null,2));console.log(JSON.stringify({passed:checks.length,checks},null,2));
}catch(e){console.error(e);throw e;}finally{socket?.close();chrome.kill('SIGKILL');backend.kill('SIGKILL');await Promise.race([vite.close(),new Promise(r=>setTimeout(r,2000))]);await new Promise(r=>setTimeout(r,300));await rm(profile,{recursive:true,force:true});await rm(storeRoot,{recursive:true,force:true});}
process.exit(0);
