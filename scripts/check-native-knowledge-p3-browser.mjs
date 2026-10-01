// Isolated browser P3 session controls. Product C2/C3 UI is qualified separately.
import {createServer} from 'vite';import {spawn} from 'node:child_process';import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
const out='artifacts/native-knowledge-p3';await mkdir(out,{recursive:true});
const vite=await createServer({server:{host:'127.0.0.1',port:0}});await vite.listen();
const profile=await mkdtemp(path.join(os.tmpdir(),'native-p3-browser-')),chrome=spawn(process.env.CHROME_BIN??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--no-first-run','--disable-background-timer-throttling','--disable-renderer-backgrounding','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank']);let socket;
try{
 const endpoint=await new Promise((resolve,reject)=>{let log='';chrome.stderr.on('data',b=>{log+=b;const m=log.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(m)resolve(m[1]);});chrome.once('error',reject);setTimeout(()=>reject(Error('Chrome timeout')),15000).unref();});
 socket=new WebSocket(endpoint);await new Promise(r=>socket.addEventListener('open',r,{once:true}));let id=0;const pending=new Map();socket.addEventListener('message',e=>{const v=JSON.parse(e.data),p=pending.get(v.id);if(p){pending.delete(v.id);v.error?p.reject(Error(JSON.stringify(v.error))):p.resolve(v.result);}});
 const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});socket.send(JSON.stringify({id:n,method,params,...(sessionId?{sessionId}:{})}));});
 const {targetId}=await send('Target.createTarget',{url:'about:blank'}),{sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},sessionId);if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 const heap=async()=>{await send('HeapProfiler.collectGarbage',{},sessionId);return await send('Runtime.getHeapUsage',{},sessionId);};
 await send('Page.navigate',{url:`http://127.0.0.1:${vite.httpServer.address().port}/src/qualification/native-knowledge/p3.html`},sessionId);await evaluate(`import('/src/qualification/native-knowledge/p3-browser.ts').then(m=>{window.control=m})`);
 await send('Page.bringToFront',{},sessionId);
 if(process.env.P3_FOLLOWUP){const inputs=await evaluate('control.freshInputPairs(150)'),budget=await evaluate('control.retainedBudget()');await writeFile(out+'/browser-followup.json',JSON.stringify({inputs,budget},null,2));console.log('P3 matched input and budget follow-up complete');}else {
 const report={browser:await send('Browser.getVersion'),method:'Vite browser; real canonical repository + TreeCommands. Search is prepared Facts input; backlinks actual ephemeral lookup. Actual mounted Flint Windows/panels covered in separate UI shadow gate.',resources:[],heavy:[],lifecycle:[]};
 for(const count of (process.env.P3_COUNTS??'1,10,100,150').split(',').map(Number)){
  console.log('P3 count '+count);const base=await heap();const setup=await evaluate(`control.setup(${count}).then(f=>{window.fixture=f;return {constructionMs:f.constructionMs}})`),repository=await heap();
  const cold=await evaluate('control.observeHeartbeat(()=>fixture.cold())'),retained=await heap(),inputs=[];
  for(let round=0;round<3;round++)for(const query of ['none','search','backlinks'])for(const enabled of (round%2?[true,false]:[false,true]))inputs.push({round,...await evaluate(`fixture.input(${enabled},${JSON.stringify(query)})`)});
  const sharing=await evaluate('fixture.sharing()'),churn=await evaluate('control.observeHeartbeat(()=>fixture.churn(15))');await evaluate('fixture.release()');const release=await heap();await evaluate('window.fixture=null');const disposed=await heap();
  report.resources.push({count,base,setup,repository,cold,retained,inputs,sharing,churn,release,disposed});await writeFile(out+'/browser.json',JSON.stringify(report,null,2));
 }
 for(const kind of ['cells','blocks']){
  console.log('P3 heavy '+kind);await evaluate(`control.setup(1,${JSON.stringify(kind)}).then(f=>{window.fixture=f})`);const cold=await evaluate('control.observeHeartbeat(()=>fixture.cold())'),replacement=await evaluate('control.observeHeartbeat(()=>fixture.replacement())'),baseline=await evaluate('control.observeHeartbeat(()=>fixture.heavyBaseline())'),memory=await heap();await evaluate('fixture.release().then(()=>{window.fixture=null})');report.heavy.push({kind,cold,replacement,baseline,memory,released:await heap()});await writeFile(out+'/browser.json',JSON.stringify(report,null,2));
 }
 await evaluate('control.setup(10).then(f=>{window.fixture=f})');for(let i=0;i<8;i++){const cycle=await evaluate('fixture.cycle()');report.lifecycle.push({cycle:i,...cycle,memory:await heap()});}await evaluate('fixture.release().then(()=>{window.fixture=null})');report.lifecycleReleased=await heap();
 await evaluate('control.setup(1).then(f=>{window.fixture=f})');report.handback=await evaluate('fixture.handback()');await evaluate('fixture.release().then(()=>{window.fixture=null})');
 report.budget=await evaluate('control.observeHeartbeat(()=>control.retainedBudget())');
 report.legacy=[];for(const hold of [false,true]){const baseline=await heap();await evaluate(`window.legacy=control.editorLifetime(100,${hold});void 0`);const retained=await heap(),inputRetained=await evaluate('!!legacy.weak.deref()');await evaluate('legacy.held=undefined');const dropped=await heap(),afterDrop=await evaluate('!!legacy.weak.deref()');await evaluate('legacy.dispose();window.legacy=null');report.legacy.push({hold,baseline,retained,inputRetained,dropped,afterDrop,released:await heap()});}
 await writeFile(out+'/browser.json',JSON.stringify(report,null,2));console.log('P3 browser controls complete');
 }
}finally{socket?.close();chrome.kill('SIGTERM');await vite.close();await rm(profile,{recursive:true,force:true,maxRetries:4,retryDelay:250});}
