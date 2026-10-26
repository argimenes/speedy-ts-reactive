// Real annotated Document + real read-only SQLite worker + Chrome download.
// Isolated browser and Vite server. Does not write to the source Vault.
import {spawn} from 'node:child_process';
import {mkdtemp,rm,mkdir,writeFile,readFile,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {openSqliteFoundation} from '../src/knowledge-sqlite/client.mjs';
const source=process.env.SEMANTIC_DOCUMENT??'vaults/imported/documents/misc/buzzetti_email_2019-07-16.ink';
const vault=path.resolve(process.env.SEMANTIC_VAULT??'vaults/imported');
const artifacts=process.env.BENCHMARK_OUTPUT??'/tmp/semantic-document-export-proof';await mkdir(artifacts,{recursive:true});
const download=await mkdtemp(path.join(tmpdir(),'semantic-download-')),profile=await mkdtemp(path.join(tmpdir(),'semantic-chrome-'));
const original=await readFile(source),reader=await openSqliteFoundation({vault,readOnly:true,entityReader:true});
let requests=0;
const vite=await createServer({plugins:[{name:'semantic-export-proof',resolveId(id){if(id==='/__semantic.js')return '\0semantic';},load(id){if(id==='\0semantic')return `
 import {render} from 'solid-js/web';import {createComponent} from 'solid-js';
 import {ReactiveEditor} from '/src/reactive-editor/editor.ts';import {registerCoreViews} from '/src/rendering/register-core-views.ts';import {ReactiveTreeView} from '/src/rendering/reactive-tree-view.tsx';
 import {decodeNative,captureNative,nativeText} from '/src/persistence/native-resource.ts';import {resourceToRepository} from '/src/history/durable-core.ts';import {exportDocument} from '/src/runtime/export-document.ts';
 import '/src/index.css';
 const snapshot=decodeNative(new Uint8Array(await (await fetch('/__document')).arrayBuffer()));
 const editor=new ReactiveEditor({state:resourceToRepository(snapshot),references:[],issues:[],legacy:false},{features:{nativeKnowledge:false,sqliteKnowledge:false}});registerCoreViews(editor);
 editor.setAssetContext(()=>({cavernId:'readonly-proof',session:'readonly-proof'}));
 const projection=editor.createView('semantic-proof'),host=document.getElementById('root');render(()=>createComponent(ReactiveTreeView,{editor,projection}),host);editor.installGateway(document);
 let commits=0;const commit=editor.repository.commit.bind(editor.repository);editor.repository.commit=(...args)=>{commits++;return commit(...args);};
 const before=nativeText(captureNative(editor.repository.readState(),snapshot.resourceId));
 window.proof={editor,projection,snapshot,before,exportDocument,unchanged:()=>before===nativeText(captureNative(editor.repository.readState(),snapshot.resourceId)),commits:()=>commits};
 `;},configureServer(server){server.middlewares.use(async(req,res,next)=>{
 if(req.url==='/__document'){res.end(original);return;}
 if(req.url==='/api/sqlite/knowledge/package-data'){
  requests++;try{let body='';for await(const part of req)body+=part;const data=await reader.packageData(JSON.parse(body).request);res.setHeader('Content-Type','application/json');res.end(JSON.stringify({Success:true,Data:data}));}catch(error){res.statusCode=500;res.end(JSON.stringify({Success:false,Error:String(error)}));}return;
 }
 if(req.url!=='/__semantic')return next();res.setHeader('Content-Type','text/html');res.end(await server.transformIndexHtml(req.url,'<html><body><div id="root"></div><script type="module" src="/__semantic.js"></script></body></html>'));
 });}}],server:{host:'127.0.0.1',port:0,hmr:false}});await vite.listen();
const chrome=spawn(process.env.CHROME_BIN??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--no-first-run','--window-size=1500,990','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank']);let socket;
try{
 const endpoint=await new Promise((resolve,reject)=>{let out='';chrome.stderr.on('data',b=>{out+=b;const m=out.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(m)resolve(m[1]);});chrome.once('error',reject);setTimeout(()=>reject(Error('Chrome timeout')),15000).unref();});
 socket=new WebSocket(endpoint);await new Promise(r=>socket.addEventListener('open',r,{once:true}));let id=0;const pending=new Map(),errors=[];
 socket.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);});
 const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const n=++id,t=setTimeout(()=>reject(Error('CDP timeout '+method)),60000);pending.set(n,{resolve:v=>{clearTimeout(t);resolve(v);},reject:e=>{clearTimeout(t);reject(e);}});socket.send(JSON.stringify({id:n,method,params,...sessionId?{sessionId}:{}}));});
 const {targetId}=await send('Target.createTarget',{url:'about:blank'}),{sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},sessionId);if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 const wait=condition=>evaluate(`(async()=>{for(let i=0;i<600;i++){if(${condition})return;await new Promise(r=>setTimeout(r,50));}throw Error('Timeout: '+${JSON.stringify(condition)})})()`);
 await send('Runtime.enable',{},sessionId);await send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:download});
 await send('Page.navigate',{url:`http://127.0.0.1:${vite.httpServer.address().port}/__semantic`},sessionId);await wait('window.proof && document.querySelector("[data-block-type=standoff-editor-block]")');
 await evaluate(`document.querySelector('[data-block-type=standoff-editor-block]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,button:2,clientX:200,clientY:150}))`);
 await wait(`[...document.querySelectorAll('.reactive-block-menu button')].some(b=>b.textContent.trim()==='Export Document')`);
 await evaluate(`[...document.querySelectorAll('.reactive-block-menu button')].find(b=>b.textContent.trim()==='Export Document').click()`);
 await wait(`!proof.editor.interchange.busy() && proof.editor.interchange.message().startsWith('Document exported')`);
 let files=[];for(let i=0;i<100;i++){files=(await readdir(download)).filter(f=>f.endsWith('.mutable.json'));if(files.length)break;await new Promise(r=>setTimeout(r,50));}assert.equal(files.length,1);
 const exported=await readFile(path.join(download,files[0])),json=JSON.parse(exported);
 const originalJson=JSON.parse(original),contextBlock=json.document.blocks.find(b=>b.type==='mutable/package-data-block');assert.ok(contextBlock);
 // Independently inspect portable authored Block graph; no production graph reader.
 const originalIds=new Set(originalJson.document.blocks.map(b=>b.id));
 assert.deepEqual(json.document.blocks.filter(b=>originalIds.has(b.id)),originalJson.document.blocks);
 assert.deepEqual({...json.document,blocks:undefined},{...originalJson.document,blocks:undefined});
 const context=contextBlock.properties.packageContext,data=context.data;
 const tables=Object.fromEntries(data.tables.map(t=>[t.name,t.rows.map(row=>Object.fromEntries(t.columns.map((c,i)=>[c,row[i][0]==='null'?null:row[i][1]])))]));
 const refs=new Set(originalJson.document.blocks.flatMap(b=>(b.properties?.standoffProperties??[]).filter(p=>!p.isDeleted&&p.type==='codex/entity-reference').map(p=>p.value)));
 const entities=new Set(tables.Entity.map(e=>e.guid));const missing=[...refs].filter(guid=>!entities.has(guid));for(const guid of missing)assert.ok(data.unresolved.some(u=>u.table==='Entity'&&u.value===guid));
 for(const r of tables.Relationship){assert.ok(refs.has(r.sourceEntityGuid)&&refs.has(r.targetEntityGuid));assert.ok(r.typename);}
 const state=await evaluate(`({unchanged:proof.unchanged(),commits:proof.commits(),message:proof.editor.interchange.message()})`);assert.equal(state.unchanged,true);assert.equal(state.commits,0);assert.equal(requests,1);assert.deepEqual(errors,[]);
 const screenshot=await send('Page.captureScreenshot',{format:'png'},sessionId);await writeFile(path.join(artifacts,'export-complete.png'),Buffer.from(screenshot.data,'base64'));await writeFile(path.join(artifacts,files[0]),exported);
 const report={source,resourceId:json.resourceId,format:json.format,version:json.version,authoredBlocks:originalIds.size,referencedEntities:refs.size,resolvedEntities:[...refs].filter(id=>entities.has(id)).length,missingEntities:missing,rows:Object.fromEntries(Object.entries(tables).filter(([,r])=>r.length).map(([k,r])=>[k,r.length])),unresolved:data.unresolved,metrics:data.metrics,bytes:exported.length,...state,requests,errors};
 await writeFile(path.join(artifacts,'qualification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{socket?.close();chrome.kill();await vite.close();await reader.close();await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100});await rm(download,{recursive:true,force:true});}
