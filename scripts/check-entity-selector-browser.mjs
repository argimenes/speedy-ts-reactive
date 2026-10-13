// Real LER + HTTP + SQLite latency check; only the temporary editor is modified.
// Usage: node scripts/check-entity-selector-browser.mjs <managed-root> <vault>
// Or: node scripts/check-entity-selector-browser.mjs --create-fixture
// Creation mode writes only a temporary Vault, removed on completion.
import express from 'express';
import {createServer} from 'vite';
import solid from 'vite-plugin-solid';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {SqliteKnowledgeHost} from '../dist/server/sqlite-knowledge-host.js';

const creation=process.argv[2]==='--create-fixture';
const temporary=creation?await mkdtemp(path.join(tmpdir(),'selector-create-')):undefined;
const [root,vault]=creation?[temporary,'.']:process.argv.slice(2);if(!root||!vault)throw Error('Supply managed-root and vault');
const host=new SqliteKnowledgeHost({root:path.resolve(root),readOnly:!creation});
if(creation){
 await host.establish(vault);
 await host.entityMutate({vault,request:{op:'create',id:crypto.randomUUID(),operationId:crypto.randomUUID(),name:'Rome'}});
 host.store.discover=async()=>{throw Error('Creation must not discover Documents');};
 host.store.readScopeFence=async()=>{throw Error('Creation must not audit Document scope');};
}
const app=express();app.use('/api/sqlite/knowledge',host.router());
const backend=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
const vite=await createServer({configFile:false,plugins:[solid(),{name:'selector-fixture',configureServer(server){server.middlewares.use('/__selector',(_req,res)=>{res.setHeader('Content-Type','text/html');res.end('<html><body></body></html>');});}}],server:{host:'127.0.0.1',port:0,hmr:false,proxy:{'/api':`http://127.0.0.1:${backend.address().port}`}}});
await vite.listen();
const profile=await mkdtemp(path.join(tmpdir(),'selector-browser-'));
const chrome=spawn(process.env.CHROME_BIN??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank']);
let socket;
try{
 const endpoint=await new Promise((resolve,reject)=>{let output='';const timer=setTimeout(()=>reject(Error('Chrome startup timed out')),15000);chrome.once('error',reject);chrome.stderr.on('data',chunk=>{output+=chunk;const match=output.match(/DevTools listening on (ws:\/\/\S+)/);if(match){clearTimeout(timer);resolve(match[1]);}});});
 socket=new WebSocket(endpoint);await new Promise(r=>socket.addEventListener('open',r,{once:true}));
 let sequence=0;const pending=new Map();
 socket.addEventListener('message',event=>{const message=JSON.parse(event.data),p=pending.get(message.id);if(p){pending.delete(message.id);message.error?p.reject(Error(JSON.stringify(message.error))):p.resolve(message.result);}});
 const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++sequence;const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method));},30000);pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});socket.send(JSON.stringify({id,method,params,sessionId}));});
 const {targetId}=await send('Target.createTarget',{url:'about:blank'}),{sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 await send('Page.navigate',{url:`http://127.0.0.1:${vite.httpServer.address().port}/__selector`},sessionId);
 await evaluate(`(async()=>{
  const {ReactiveEditor}=await import('/src/reactive-editor/editor.ts');
  const {ReactiveTreeView}=await import('/src/rendering/reactive-tree-view.tsx');
  const {entityTestApi,registerEntityTestViews}=await import('/src/features/entity-references/test-support.ts');
  const {registerEntityContext,entityService}=await import('/src/application/entity-service.ts');
  const {openEntitySearch}=await import('/src/features/entity-references/entity-search.ts');
  const source=await(await fetch('/src/rendering/reactive-tree-view.tsx')).text();
  const {render,createComponent}=await import(source.split('"').find(p=>p.includes('/solid-js_web.js')));
  const editor=new ReactiveEditor({id:'selector-document',type:'document-block',metadata:{documentId:'selector-document'},children:[{id:'target',type:'standoff-editor-block',text:'1842 '+('large unsaved document '.repeat(2500))}]});
  registerEntityTestViews(editor);const view=editor.createView('selector'),element=document.body.appendChild(document.createElement('div'));
  render(()=>createComponent(ReactiveTreeView,{editor,projection:view}),element);editor.installGateway(document);
  const node=Object.values(view.state.nodes).find(n=>n.payload.id==='target'),api=entityTestApi(editor);
  registerEntityContext(editor,{accepts:key=>key===node.key,listingVault:async()=>${JSON.stringify(vault)},prepare:async()=>{throw Error('Selector prepared document context');},vault:()=>{throw Error('Selector acquired document Vault');}});
  api.entities=()=>entityService(editor,node.key);
  // Turn accidental traversal into a hard failure, regardless of fixture size.
  editor.repository.readCanonicalResourceBoundary=()=>{throw Error('Selector audited document');};
  editor.repository.readCanonicalResourceBoundaryCooperative=async()=>{throw Error('Selector traversed document');};
  window.proof={editor,node,open:()=>{editor.mounts.get(node.key).focus();openEntitySearch(api,[{nodeKey:node.key,start:0,end:4}]);}};
  proof.search=async query=>{
   proof.open();const panel=document.querySelector('.reactive-entity-search'),input=panel.querySelector('[aria-label="Search entities"]'),stream=panel.querySelector('[aria-label="Entity stream"]');
   stream.value='name';stream.dispatchEvent(new Event('change',{bubbles:true}));
   const start=performance.now();input.value=query;input.dispatchEvent(new InputEvent('input',{bubbles:true}));
   while(!panel.querySelector('tbody tr')||panel.querySelector('[role="status"]').textContent.includes('Resolving')){
    if(performance.now()-start>5000)throw Error('Lookup did not finish: '+panel.textContent);await new Promise(r=>setTimeout(r,10));
   }
   await new Promise(requestAnimationFrame);
   return {milliseconds:performance.now()-start,status:panel.querySelector('[role="status"]').textContent};
  };
 })()`);
 for(let i=0;i<2;i++){
  const result=await evaluate(`proof.search('Rome')`);console.log(JSON.stringify({run:i+1,...result}));assert.ok(result.milliseconds<1000,'LER must display results within one second');
  if(!i)await evaluate(`document.querySelector('.reactive-entity-search header button').click()`);
 }
 await evaluate(`(async()=>{document.querySelector('.reactive-entity-search tbody button').click();for(let i=0;i<200&&document.querySelector('.reactive-entity-search');i++)await new Promise(r=>setTimeout(r,10));if(!proof.editor.node(proof.node.key).payload.standoffProperties?.length)throw Error('Selection did not bind');})()`);
 assert.equal(host.metrics.sweeps,0);console.log('Selection linked without source-file validation or indexing.');
 if(creation){
  const result=await evaluate(`(async()=>{
   proof.editor.repository.undo();proof.open();
   const panel=document.querySelector('.reactive-entity-search'),button=label=>[...panel.querySelectorAll('button')].find(b=>b.textContent===label);
   button('+ Create Entity').click();const name=panel.querySelector('[aria-label="Canonical name"]');name.value='1842';name.dispatchEvent(new InputEvent('input',{bubbles:true}));
   const start=performance.now();button('Create and link').click();
   while(document.querySelector('.reactive-entity-search')){if(performance.now()-start>5000)throw Error('Creation did not finish: '+panel.textContent);await new Promise(r=>setTimeout(r,10));}
   const milliseconds=performance.now()-start,property=proof.editor.node(proof.node.key).payload.standoffProperties[0];
   proof.editor.repository.undo();
   if(proof.editor.node(proof.node.key).payload.standoffProperties?.length)throw Error('Undo did not remove link');
   return {milliseconds,id:property.value,start:property.start,end:property.end};
  })()`);
  assert.equal(result.start,0);assert.equal(result.end,3);
  const saved=await host.entityLookup({vault,request:{op:'get',id:result.id}});assert.equal(saved.entity.name,'1842');
  assert.equal(host.metrics.sweeps,0);console.log(JSON.stringify({createdAndLinked:'1842',...result,entitySurvivedUndo:true}));
 }
}finally{
 socket?.close();const exited=new Promise(r=>chrome.once('exit',r));chrome.kill();await exited;
 await vite.close();await new Promise(r=>backend.close(r));await host.close();await rm(profile,{recursive:true,force:true});if(temporary)await rm(temporary,{recursive:true,force:true});
}
