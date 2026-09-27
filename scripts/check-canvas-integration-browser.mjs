// Main application integration: exercise the served app, without injected fixtures or module imports.
// Node 22+, CHROME_BIN supported. Isolated Chrome profile; ports 3000 and 3002 required.
// Works with both Vite and the production server. File handles are simulated in memory.
// Reads the existing server Document text1.json; never writes server files.
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import path from 'node:path';
const profile = await mkdtemp(path.join(tmpdir(), 'speedy-presentation-check-'));
const chrome = spawn(process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--disk-cache-size=1', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank']);
let socket;
try {
const endpoint = await new Promise((resolve, reject) => {
 let output = ''; chrome.stderr.on('data', chunk => { output += chunk; const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/); if(match) resolve(match[1]); });
 chrome.once('error', reject); setTimeout(() => reject(new Error('Chrome startup timed out')), 15000).unref();
});
socket = new WebSocket(endpoint); await new Promise(resolve => socket.addEventListener('open', resolve, {once:true}));
let id = 0; const pending = new Map();
socket.addEventListener('message', event => { const result = JSON.parse(event.data); if(result.id && pending.has(result.id)) { const p = pending.get(result.id); pending.delete(result.id); result.error ? p.reject(new Error(JSON.stringify(result.error))) : p.resolve(result.result); }});
const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const requestId = ++id; pending.set(requestId,{resolve,reject}); socket.send(JSON.stringify({id:requestId,method,params,...(sessionId ? {sessionId} : {})})); });
 const {targetId} = await send('Target.createTarget',{url:'about:blank'}); const {sessionId} = await send('Target.attachToTarget',{targetId,flatten:true});
 await send('Network.enable',{},sessionId);
 const evaluate = async expression => {
   const result = await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);
   if(result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
   return result.result.value;
 };



 const checks = [];
 const check = (name, actual, expected) => { assert.deepEqual(actual, expected, name); checks.push(name); };

 await send('Emulation.setDeviceMetricsOverride',{width:1400,height:1000,deviceScaleFactor:1,mobile:false},sessionId);
 const mouse=(type,p)=>send('Input.dispatchMouseEvent',{type,...p,button:'left',buttons:type==='mouseReleased'?0:1,clickCount:1},sessionId);
 const frame=()=>evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(r,80))))');
 const click=async selector=>{
   const p=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw new Error('Missing '+${JSON.stringify(selector)});const r=e.getBoundingClientRect(),p={x:r.left+r.width/2,y:r.top+r.height/2};if(!e.contains(document.elementFromPoint(p.x,p.y)))throw new Error('Obscured '+${JSON.stringify(selector)}+' by '+document.elementFromPoint(p.x,p.y)?.outerHTML.slice(0,400));return p})()`);
   await mouse('mousePressed',p);await mouse('mouseReleased',p);await frame();
 };
 const label=async (name,scope='document')=>{
   await evaluate(`(()=>{document.querySelector('[data-integration-action]')?.removeAttribute('data-integration-action');const e=[...${scope}.querySelectorAll('button')].find(e=>e.textContent.replace(/[✓▸]/g,'').trim()===${JSON.stringify(name)});if(!e||e.disabled)throw new Error('Unavailable '+${JSON.stringify(name)});e.setAttribute('data-integration-action','')})()`);
   await click('[data-integration-action]');
 };
 const menu=async()=>{if(!await evaluate('!!document.querySelector("[data-system-menu=workspace]")'))await click('[data-system-menu-trigger="workspace"]');};
 const choose=async name=>{await menu();await label('Presentations');await label(name,'document.querySelector(\'[aria-label="Presentations"]\')');};
 for(const port of [3000,3002]) {
   await send('Page.navigate',{url:`http://localhost:${port}/`},sessionId);
   for(let attempt=0;attempt<60;attempt++) {
     if(await evaluate('!!document.querySelector(".workspace-demo--canonical")'))break;
     await evaluate('new Promise(r=>setTimeout(r,100))');
   }
   await frame();
   check(port+' starts in an empty Desktop workspace',await evaluate('!document.querySelector(".reactive-window")&&!document.querySelector(".workspace-canvas")'),true);
   await menu();await label('New Document');
   check(port+' starts with a single Document Window',await evaluate('document.querySelectorAll(".reactive-window").length'),1);
   await click('.reactive-standoff-flow');await send('Input.insertText',{text:'Desktop entry'},sessionId);await frame();
   check(port+' Desktop native typing',await evaluate('document.querySelector(".reactive-standoff-flow").textContent'),'Desktop entry');
   await choose('Canvas');
   check(port+' Presentations menu switches directly to Canvas',await evaluate('!!document.querySelector(".workspace-canvas")'),true);
   check(port+' switch retains authored text',await evaluate('document.querySelector(".reactive-standoff-flow").textContent'),'Desktop entry');
   await send('Input.insertText',{text:' Canvas entry'},sessionId);await frame();
   check(port+' Canvas typing resumes at the restored caret',await evaluate('document.querySelector(".reactive-standoff-flow").textContent'),'Desktop entry Canvas entry');
   await evaluate(`window.integration={saved:'',writes:0};const handle={name:'Integration.json',getFile:async()=>({name:'Integration.json',text:async()=>integration.saved}),createWritable:async()=>({write:async value=>{integration.saved=typeof value==='string'?value:await value.text();integration.writes++},close:async()=>{}})};window.showSaveFilePicker=async()=>handle;window.showOpenFilePicker=async()=>[handle]`);
   await menu();await label('Save Workspace','document.querySelector(\'[aria-label="Local files"]\')');
   check(port+' Local Save captures the real workspace and Canvas',await evaluate(`integration.writes===1&&JSON.parse(integration.saved).metadata.workspacePresentation.active==='canvas'`),true);
   const saved=await evaluate('JSON.parse(integration.saved)');
   const doc=saved.children[0].children[0].children[0];
   check(port+' stable document identity in file',doc.metadata.documentId,doc.id);
   check(port+' both edits saved',doc.children[0].text,'Desktop entry Canvas entry');
   await choose('Desktop');
   check(port+' Desktop returns with the shared edit',await evaluate('!document.querySelector(".workspace-canvas")&&document.querySelector(".reactive-standoff-flow").textContent==="Desktop entry Canvas entry"'),true);
   await menu();await label('Open Workspace…','document.querySelector(\'[aria-label="Local files"]\')');
   check(port+' Local Open restores saved Canvas',await evaluate('!!document.querySelector(".workspace-canvas")'),true);
   await menu();await label('Save Workspace','document.querySelector(\'[aria-label="Local files"]\')');
   check(port+' reopening retains identity',await evaluate(`JSON.parse(integration.saved).children[0].children[0].children[0].metadata.documentId`),doc.id);
   await evaluate(`const saved=JSON.parse(integration.saved);delete saved.metadata.workspacePresentation.presentations.desktop;integration.saved=JSON.stringify(saved)`);
   await menu();await label('Open Workspace…','document.querySelector(\'[aria-label="Local files"]\')');
   await choose('Create Desktop from Canvas');
   check(port+' reverse derivation is available for Canvas-only files',await evaluate('!document.querySelector(".workspace-canvas")&&[...document.querySelectorAll("[role=status]")].some(e=>e.textContent.includes("Desktop created"))'),true);

   for(const mode of ['desktop','canvas']) {
     await send('Page.navigate',{url:`http://localhost:${port}/`},sessionId);
     for(let attempt=0;attempt<60;attempt++) {
       if(await evaluate('!!document.querySelector(".workspace-demo--canonical")'))break;
       await evaluate('new Promise(r=>setTimeout(r,100))');
     }
     await frame();if(mode==='canvas')await choose('Canvas');
     await menu();await label('Open Document from Server…');
     for(let attempt=0;attempt<60;attempt++) {
       if(await evaluate(`[...document.querySelectorAll('[role=option]')].some(e=>e.textContent.includes('text1.json'))`))break;
       await evaluate('new Promise(r=>setTimeout(r,100))');
     }
     await click('[placeholder="Filter documents…"]');await send('Input.insertText',{text:'text1.json'},sessionId);await frame();
     await evaluate(`[...document.querySelectorAll('[role=option]')].find(e=>e.textContent.includes('text1.json')).setAttribute('data-server-file','')`);
     await click('[data-server-file]');await label('Open','document.querySelector(\'[role="dialog"]\')');
     for(let attempt=0;attempt<60;attempt++) {
       if(await evaluate('!document.querySelector("[role=dialog]")&&document.querySelectorAll(".reactive-window").length===1'))break;
       await evaluate('new Promise(r=>setTimeout(r,100))');
     }
     check(port+' opens real server text1.json on empty '+mode,await evaluate('!document.querySelector("[role=dialog]")&&document.querySelectorAll(".reactive-window").length===1'),true);
     check(port+' server open preserves '+mode,await evaluate('!!document.querySelector(".workspace-canvas")'),mode==='canvas');
     check(port+' opened server Document receives focus',await evaluate('!!document.activeElement.closest(".reactive-window")'),true);
     await menu();await label('Open Image…');
     await evaluate(`const e=document.querySelector('[aria-label="Image URL"]');e.value='data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';e.dispatchEvent(new Event('input',{bubbles:true}))`);
     await label('Open','document.querySelector(\'[role="dialog"]\')');
     check(port+' image opens alongside Document on '+mode,await evaluate('document.querySelectorAll(".reactive-window").length'),2);
   }
   await menu();
   check(port+' sample demo link opens separately',await evaluate('document.querySelector(\'a[href="/?demo=1"]\')?.target'),'_blank');
   await send('Page.navigate',{url:`http://localhost:${port}/?demo=1`},sessionId);
   for(let attempt=0;attempt<60;attempt++) {
     if(await evaluate('!!document.querySelector(".workspace-demo__window")'))break;
     await evaluate('new Promise(r=>setTimeout(r,100))');
   }
   check(port+' original sample loads separately',await evaluate('!!document.querySelector(".workspace-demo__window")&&!document.querySelector(".workspace-demo--canonical")'),true);
 }
 console.log(JSON.stringify({browser:await send('Browser.getVersion'),checks},null,2));
} finally {
  // Finish the CDP close handshake before killing Chrome. Otherwise Node's
  // WebSocket can retain a closing socket after all assertions have finished.
  if (socket && socket.readyState !== WebSocket.CLOSED) {
    const closed = new Promise(resolve => socket.addEventListener('close', resolve, { once: true }));
    socket.close();
    await Promise.race([closed, new Promise(resolve => setTimeout(resolve, 1000))]);
  }
  if (chrome.pid && chrome.exitCode === null && chrome.signalCode === null) {
    const exited = new Promise(resolve => chrome.once('exit', resolve));
    chrome.kill('SIGKILL');
    await exited;
  }
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
