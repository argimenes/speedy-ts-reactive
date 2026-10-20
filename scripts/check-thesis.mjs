/** Functional browser check only: one temporary Vault, a handful of normal UI operations. No load testing. */
import {createServer} from 'vite';import express from 'express';import {spawn} from 'node:child_process';
import {mkdtemp,rm,readdir,writeFile} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import assert from 'node:assert/strict';
import {SqliteKnowledgeHost} from '../dist/server/sqlite-knowledge-host.js';
const root=await mkdtemp(path.join(os.tmpdir(),'thesis-ui-functional-')),profile=await mkdtemp(path.join(os.tmpdir(),'thesis-ui-chrome-'));
let host,server,vite,chrome,socket;
try{
 host=new SqliteKnowledgeHost({root,debounceMs:60000});await host.establish('.');const app=express();app.use('/api/sqlite/knowledge',host.router());
 // Only default Vault discovery is stubbed; all Proposition operations use the real host/worker/SQLite stack.
 app.get('/api/native/vault/default',(_q,r)=>r.json({Success:true,Data:{vault:'.'}}));
 server=await new Promise(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s));});
 vite=await createServer({server:{host:'127.0.0.1',port:0,hmr:false,proxy:{'/api':`http://127.0.0.1:${server.address().port}`}}});
 await vite.listen();
 chrome=spawn(process.env.CHROME_BIN??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank']);
 const endpoint=await new Promise((resolve,reject)=>{let log='';chrome.stderr.on('data',b=>{log+=b;const m=log.match(/DevTools listening on (ws:\/\/\S+)/);if(m)resolve(m[1]);});chrome.once('error',reject);setTimeout(()=>reject(Error('Chrome startup timeout')),15000).unref();});
 socket=new WebSocket(endpoint);await new Promise(r=>socket.addEventListener('open',r,{once:true}));let id=0;const pending=new Map(),errors=[];
 socket.addEventListener('message',e=>{const v=JSON.parse(e.data),p=pending.get(v.id);if(p){pending.delete(v.id);v.error?p.reject(Error(JSON.stringify(v.error))):p.resolve(v.result);}if(v.method==='Runtime.exceptionThrown')errors.push(v.params.exceptionDetails);});
 const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const n=++id,t=setTimeout(()=>{pending.delete(n);reject(Error('CDP timeout '+method));},20000);pending.set(n,{resolve:v=>{clearTimeout(t);resolve(v);},reject:e=>{clearTimeout(t);reject(e);}});socket.send(JSON.stringify({id:n,method,params,...(sessionId?{sessionId}:{})}));});
 const {targetId}=await send('Target.createTarget',{url:'about:blank'}),{sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});await send('Runtime.enable',{},sessionId);await send('Emulation.setDeviceMetricsOverride',{width:1360,height:900,deviceScaleFactor:1,mobile:false},sessionId);
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},sessionId);if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 const wait=async expression=>{for(let i=0;i<160;i++){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,100));}throw Error('UI condition failed: '+expression+'\n'+await evaluate('document.body.innerText')+'\nRuntime errors: '+JSON.stringify(errors));};
 await send('Page.navigate',{url:`http://127.0.0.1:${vite.httpServer.address().port}/src/features/thesis/browser-fixture.html`},sessionId);await wait('!!window.fixture');
 const entityTarget=await evaluate('fixture.target');await host.entityMutate({vault:'.',request:{op:'create',id:entityTarget,operationId:crypto.randomUUID(),name:'Known target',typename:'Person'}});
 await evaluate(`window.clickText=(text)=>{const buttons=[...document.querySelectorAll('.thesis button')].filter(b=>b.textContent===text);if(!buttons.length)throw Error('Missing button '+text);buttons.at(-1).click();};fixture.select(7,10);fixture.create();`);
 await wait("!!document.querySelector('.thesis [contenteditable=true]')");
 assert.equal(await evaluate("document.querySelector('.thesis [contenteditable=true]').textContent.replace(/\\u200b/g,'')"),'😀é');
 assert.equal((await host.propositions({vault:'.',request:{op:'list'}})).rows.length,0);
 await evaluate("var nameField=document.querySelector('[aria-label=\"Proposition name\"]');nameField.value='Unicode claim';nameField.dispatchEvent(new Event('input',{bubbles:true}));clickText('Save');");
 await wait("document.querySelector('.thesis')?.textContent.includes('Proposition saved.')");
 let saved=(await host.propositions({vault:'.',request:{op:'list',query:'Unicode'}})).rows[0];assert.ok(saved);const idSaved=saved.id;
 let p=(await host.propositions({vault:'.',request:{op:'get',id:idSaved}})).proposition;assert.equal(p.text,'😀é');assert.equal(p.annotations.length,2);assert.ok(p.annotations.some(a=>a.property.value===entityTarget));assert.ok(p.attributes.thesis.source.blockHash);assert.equal(p.attributes.thesis.source.blockText,undefined);
 const source=await evaluate('fixture.editor.node(fixture.source.key).inlineContent.map(k=>fixture.editor.node(k).payload.text).join("")');assert.equal(source,'Before 😀é after');
 await wait("[...document.querySelectorAll('.thesis button')].some(b=>b.textContent==='New'&&!b.disabled)");
 await evaluate("var draftFlow=document.querySelector('.thesis [contenteditable=true]');draftFlow.focus();var entityRange=document.createRange();entityRange.selectNodeContents(draftFlow);getSelection().removeAllRanges();getSelection().addRange(entityRange);clickText('Entity reference');");
 await wait("!!document.querySelector('[aria-label=\"Search entities\"]')");
 await evaluate("var searchField=document.querySelector('[aria-label=\"Search entities\"]');searchField.value='Known target';searchField.dispatchEvent(new Event('input',{bubbles:true}));");
 await wait("!!document.querySelector('[aria-label=\"Select Known target\"]')");await evaluate("document.querySelector('[aria-label=\"Select Known target\"]').click()");await wait("!document.querySelector('[aria-label=\"Search entities\"]')");
 await evaluate("clickText('Save')");await wait("[...document.querySelectorAll('.thesis button')].some(b=>b.textContent==='Archive'&&!b.disabled)");
 assert.equal((await host.propositions({vault:'.',request:{op:'get',id:idSaved}})).proposition.annotations.length,3);
 if(process.env.THESIS_SCREENSHOT){console.log('Layout',await evaluate("({scroll:[scrollX,scrollY],window:document.querySelector('.thesis').getBoundingClientRect().toJSON(),editor:document.querySelector('.thesis [contenteditable=true]').getBoundingClientRect().toJSON()})"));const shot=await send('Page.captureScreenshot',{format:'png'},sessionId);await writeFile(process.env.THESIS_SCREENSHOT,Buffer.from(shot.data,'base64'));}

 await evaluate("clickText('Open source')");await wait("document.querySelector('.thesis')?.textContent.includes('current Block text matches')");
 await evaluate("fixture.editor.commands.replaceInlineRange(fixture.source.key,0,0,'Moved ');clickText('Open source')");await wait("document.querySelector('.thesis')?.textContent.includes('captured range may be stale')");

 await evaluate("clickText('Archive')");await wait("[...document.querySelectorAll('.thesis button')].some(b=>b.textContent==='Restore'&&!b.disabled)");assert.equal((await host.propositions({vault:'.',request:{op:'list'}})).rows.length,0);
 await evaluate("clickText('Restore')");await wait("[...document.querySelectorAll('.thesis button')].some(b=>b.textContent==='Archive'&&!b.disabled)");assert.equal((await host.propositions({vault:'.',request:{op:'list'}})).rows[0].id,idSaved);
 // Real keyboard input into native editor; verify no network from ordinary typing.
 await evaluate("window.requests=0;window.oldFetch=window.fetch;window.fetch=(...args)=>{window.requests++;return oldFetch(...args)};const flow=document.querySelector('.thesis [contenteditable=true]');flow.focus();const range=document.createRange();range.selectNodeContents(flow);range.collapse(false);getSelection().removeAllRanges();getSelection().addRange(range);");
 await send('Input.insertText',{text:' changed'},sessionId);assert.equal(await evaluate('window.requests'),0);
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'s',code:'KeyS',modifiers:4},sessionId);await send('Input.dispatchKeyEvent',{type:'keyUp',key:'s',code:'KeyS',modifiers:4},sessionId);await wait("document.querySelector('.thesis')?.textContent.includes('Proposition saved.') && !document.querySelector('.thesis')?.textContent.includes('Unsaved changes')");
 p=(await host.propositions({vault:'.',request:{op:'get',id:idSaved}})).proposition;assert.equal(p.text,'😀é changed');assert.equal(p.id,idSaved);
 await wait("[...document.querySelectorAll('.thesis button')].some(b=>b.textContent==='New'&&!b.disabled)");
 await evaluate("clickText('Undo')");assert.equal(await evaluate("document.querySelector('.thesis [contenteditable=true]').textContent"),'😀é');await evaluate("clickText('Redo')");assert.equal(await evaluate("document.querySelector('.thesis [contenteditable=true]').textContent"),'😀é changed');
 // A competing revision must surface in the UI and leave the winning write intact.
 await host.propositions({vault:'.',request:{op:'update',operationId:crypto.randomUUID(),id:idSaved,expectedRevision:p.revision,name:'Concurrent winner',text:'Other writer',annotations:[]}});
 await evaluate("var nameField=document.querySelector('[aria-label=\"Proposition name\"]');nameField.value='Stale label';nameField.dispatchEvent(new Event('input',{bubbles:true}));clickText('Save')");
 await wait("document.querySelector('.thesis [role=alert]')?.textContent.includes('revision conflict')");
 assert.equal((await host.propositions({vault:'.',request:{op:'get',id:idSaved}})).proposition.text,'Other writer');
 await evaluate("window.confirm=()=>true;clickText('Reload')");await wait("document.querySelector('.thesis [contenteditable=true]')?.textContent==='Other writer'");
 // Commit succeeds but response is lost: Retry must replay the same receipt exactly once.
 await evaluate("window.fetch=async(...args)=>{const response=await oldFetch(...args);if(args[1]?.body&&JSON.parse(args[1].body).request?.op==='update'&&!window.lost){window.lost=true;throw Error('Simulated lost response');}return response;};var nameField=document.querySelector('[aria-label=\"Proposition name\"]');nameField.value='Recovered receipt';nameField.dispatchEvent(new Event('input',{bubbles:true}));clickText('Save')");
 await wait("document.querySelector('.thesis [role=alert]')?.textContent.includes('Simulated lost response')");const committed=(await host.propositions({vault:'.',request:{op:'get',id:idSaved}})).proposition;
 await evaluate("clickText('Save')");await wait("!document.querySelector('.thesis [role=alert]') && document.querySelector('[aria-label=\"Proposition name\"]')?.value==='Recovered receipt'");
 assert.equal((await host.propositions({vault:'.',request:{op:'get',id:idSaved}})).proposition.revision,committed.revision);

 // Keep typing while the committed Save response is delayed; its snapshot must not replace newer edits.
 await wait("[...document.querySelectorAll('.thesis button')].some(b=>b.textContent==='New'&&!b.disabled)");
 await evaluate("window.fetch=async(...args)=>{const response=await oldFetch(...args);if(args[1]?.body&&JSON.parse(args[1].body).request?.op==='update'&&!window.heldSave){window.heldSave=true;await new Promise(resolve=>window.finishSave=resolve);}return response;};clickText('Save')");
 await wait("!!window.finishSave");
 await evaluate("var liveFlow=document.querySelector('.thesis [contenteditable=true]');liveFlow.focus();var liveRange=document.createRange();liveRange.selectNodeContents(liveFlow);liveRange.collapse(false);getSelection().removeAllRanges();getSelection().addRange(liveRange);");
 await send('Input.insertText',{text:' newer'},sessionId);
 assert.equal(await evaluate("document.querySelector('.thesis [contenteditable=true]').textContent"),'Other writer newer');
 await evaluate("window.finishSave()");await wait("document.querySelector('.thesis')?.textContent.includes('newer edits remain unsaved')");
 assert.equal((await host.propositions({vault:'.',request:{op:'get',id:idSaved}})).proposition.text,'Other writer');
 await wait("[...document.querySelectorAll('.thesis button')].some(b=>b.textContent==='New'&&!b.disabled)");
 await evaluate("clickText('Save')");await wait("!document.querySelector('.thesis')?.textContent.includes('Unsaved changes')");
 assert.equal((await host.propositions({vault:'.',request:{op:'get',id:idSaved}})).proposition.text,'Other writer newer');

 await wait("[...document.querySelectorAll('.thesis button')].some(b=>b.textContent==='New'&&!b.disabled)");
 await evaluate("clickText('New')");await wait("document.querySelector('.thesis [contenteditable=true]')?.textContent.replace(/\\u200b/g,'')===''");await evaluate("clickText('Cancel / Close')");assert.equal((await host.propositions({vault:'.',request:{op:'list'}})).rows.length,1);
 assert.deepEqual((await readdir(root)).filter(n=>n!=='.mutable'),[]);assert.deepEqual(errors,[]);
 console.log(JSON.stringify({passed:true,browser:await send('Browser.getVersion'),scenarios:['selection draft without records','native Unicode annotations','save and search','archive and restore','native typing without requests','edit preserves identity','empty draft cancel','no Resource file','source fingerprint and changed-source warning','stale UI write conflict','lost-response receipt retry','existing Entity resolver and overlapping reference authoring','Command-S saves the draft','Save preserves native undo/redo','typing during Save preserves newer unsaved edits'],platform:process.platform}));
}catch(error){console.error(error);throw error;}finally{
 socket?.close();if(chrome&&!chrome.killed){chrome.kill();await new Promise(r=>chrome.once('exit',r));}await vite?.close();if(server)await new Promise(r=>server.close(r));await host?.close();await Promise.all([rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:200}),rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:200})]);
}
