// Isolated browser P4 adapter/panel controls. Product C2/C3 UI is qualified separately.
import {createServer} from 'vite';import {spawn} from 'node:child_process';import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
const out='artifacts/native-knowledge-p5';await mkdir(out,{recursive:true});
const root=await mkdtemp(path.join(os.tmpdir(),'native-p5-store-'));
const backend=spawn(process.execPath,['scripts/native-production-test-host.mjs'],{env:{...process.env,PROOF_ROOT:root},stdio:['ignore','pipe','inherit']});
const port=await new Promise((r,j)=>{backend.stdout.once('data',b=>r(JSON.parse(b.toString()).port));backend.once('error',j);});process.env.PORT=String(port);
const vite=await createServer({plugins:[{name:'p5-observation-only',enforce:'pre',transform(code,id){if(id.split('?')[0].endsWith('/document-application-capabilities.tsx'))return code.replace(/const vaults\s*=/,'globalThis.__p5Hosts?.push(factsHost); const vaults =');}}],server:{host:'127.0.0.1',port:0,hmr:false}});await vite.listen();
const {fixtureText}=await vite.ssrLoadModule('/src/qualification/native-knowledge/fixture.ts');

const profile=await mkdtemp(path.join(os.tmpdir(),'native-p5-browser-')),chrome=spawn(process.env.CHROME_BIN??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--no-first-run','--disable-background-timer-throttling','--disable-renderer-backgrounding','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank']);let socket;
try{
 const endpoint=await new Promise((resolve,reject)=>{let log='';chrome.stderr.on('data',b=>{log+=b;const m=log.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(m)resolve(m[1]);});chrome.once('error',reject);setTimeout(()=>reject(Error('Chrome timeout')),15000).unref();});
 socket=new WebSocket(endpoint);await new Promise(r=>socket.addEventListener('open',r,{once:true}));let id=0;const pending=new Map();socket.addEventListener('message',e=>{const v=JSON.parse(e.data),p=pending.get(v.id);if(p){pending.delete(v.id);v.error?p.reject(Error(JSON.stringify(v.error))):p.resolve(v.result);}});
 const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const n=++id,timer=setTimeout(()=>{pending.delete(n);reject(Error('CDP timeout: '+method));},240000);pending.set(n,{resolve:v=>{clearTimeout(timer);resolve(v)},reject:e=>{clearTimeout(timer);reject(e)}});socket.send(JSON.stringify({id:n,method,params,...(sessionId?{sessionId}:{})}));});
 const {targetId}=await send('Target.createTarget',{url:'about:blank'}),{sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},sessionId);if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 const profiled=async(label,expression)=>{if(!process.env.P5_PROFILE)return evaluate(expression);await send('Profiler.enable',{},sessionId);await send('Profiler.start',{},sessionId);const result=await evaluate(expression);const profile=await send('Profiler.stop',{},sessionId);await writeFile(out+'/'+label+'.cpuprofile',JSON.stringify(profile.profile));return result;};
 const heap=async()=>{await send('HeapProfiler.collectGarbage',{},sessionId);return await send('Runtime.getHeapUsage',{},sessionId);};
 await send('Page.navigate',{url:`http://127.0.0.1:${vite.httpServer.address().port}/src/qualification/native-knowledge/p3.html`},sessionId);for(let attempt=0;;attempt++){await new Promise(r=>setTimeout(r,50));if(await evaluate("document.readyState==='complete'&&location.pathname.endsWith('/p3.html')"))break;if(attempt>100)throw Error('Qualification page did not load');}await evaluate(`window.__p5Hosts=[];import('/src/qualification/native-knowledge/p5-browser.tsx').then(m=>{window.control=m})`);
 await send('Page.bringToFront',{},sessionId);
 const report={browser:await send('Browser.getVersion'),method:'Real default-on loaded Facts composition, saved coverage explicitly enabled, actual managed server routes and Flint UI. Qualification-only Vite transform exposes read-only host measurements.',resources:[]};
 for(const count of (process.env.P5_COUNTS??'100,1000').split(',').map(Number)){
  console.log('P5 count '+count);const vault='vault-'+count;await mkdir(path.join(root,vault));for(let i=0;i<count;i++)await writeFile(path.join(root,vault,i+'.mutable.json'),fixtureText(i,count));
  const base=await heap(),setup=await evaluate(`control.setup(${JSON.stringify(vault)},${count}).then(f=>{window.fixture=f;return {constructionMs:f.constructionMs}})`);
  const discovery=await profiled('discovery-'+count,'control.observeHeartbeat(()=>fixture.open())'),partial=await profiled('partial-'+count,'control.observeHeartbeat(()=>fixture.partial())'),initialComplete=await evaluate('control.observeHeartbeat(()=>fixture.complete())');
  const coldSearch=await evaluate('control.observeHeartbeat(()=>fixture.search())'),warmSearch=[];for(let i=0;i<3;i++)warmSearch.push(await evaluate('control.observeHeartbeat(()=>fixture.search())'));
  const sharing=await evaluate('fixture.sharing()'),activation=await profiled('activation-'+count,'control.observeHeartbeat(()=>fixture.activate())');
  if(process.env.P5_PROFILE){const release=await evaluate('fixture.dispose()');report.resources.push({count,discovery,partial,initialComplete,coldSearch,warmSearch,sharing,activation,release});await writeFile(out+'/browser-profile.json',JSON.stringify(report,null,2));continue;}
  const input=await evaluate('control.observeHeartbeat(()=>fixture.input())'),liveComplete=await evaluate('control.observeHeartbeat(()=>fixture.complete())'),retained=await heap();
  const refresh=await evaluate('fixture.refresh()'),during=await evaluate('control.observeHeartbeat(()=>fixture.input())'),rebuild=await evaluate('control.observeHeartbeat(()=>fixture.complete())'),queryAfter=await evaluate('fixture.search()'),cancel=await evaluate('fixture.cancel()');
  const shot=await send('Page.captureScreenshot',{format:'png'},sessionId);await writeFile(out+'/vault-'+count+'.png',Buffer.from(shot.data,'base64'));
  const release=await evaluate('fixture.dispose()');await evaluate('window.fixture=null;window.__p5Hosts=[]');const disposed=await heap();
  report.resources.push({count,base,setup,discovery,partial,initialComplete,coldSearch,warmSearch,sharing,activation,input,liveComplete,retained,refresh,during,rebuild,queryAfter,cancel,release,disposed});await writeFile(out+'/'+(process.env.P5_OUTPUT??'browser-integrated.json'),JSON.stringify(report,null,2));
 }
 console.log('P5 real UI/server controls complete');

}finally{socket?.close();chrome.kill('SIGTERM');await vite.close();backend.kill('SIGTERM');await rm(root,{recursive:true,force:true,maxRetries:4,retryDelay:250});await rm(profile,{recursive:true,force:true,maxRetries:4,retryDelay:250});}
