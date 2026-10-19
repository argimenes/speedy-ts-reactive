// Live diagnostic, not a deterministic CI gate. Uses the production X shell and unchanged sandbox.
// The control navigates a separate browser page directly to X's own generated frame URL.
import {build} from 'esbuild';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
const bundled=await build({entryPoints:['src/web-resources/embed.ts'],bundle:true,platform:'node',format:'esm',write:false});
const {socialEmbed}=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text).toString('base64'));
const sources=['https://x.com/jack/status/20','https://x.com/NASA/status/2041557036274475228'];
const server=createServer((_req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>X qualification</title><div id="host"></div>');});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const profile=await mkdtemp(path.join(tmpdir(),'mutable-x-qualification-'));
const chrome=spawn(process.env.CHROME_BIN??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank']);
let socket;
try {
 const endpoint=await new Promise((resolve,reject)=>{let out='';chrome.stderr.on('data',b=>{out+=b;const m=out.match(/DevTools listening on (ws:\/\/\S+)/);if(m)resolve(m[1]);});chrome.once('error',reject);setTimeout(()=>reject(Error('Chrome timeout')),15000).unref();});
 socket=new WebSocket(endpoint);await new Promise(r=>socket.addEventListener('open',r,{once:true}));
 let next=0,active;const pending=new Map(),sessions=new Set(),requests=new Map();
 const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++next,t=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method));},30000);pending.set(id,{resolve:v=>{clearTimeout(t);resolve(v);},reject:e=>{clearTimeout(t);reject(e);}});socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});
 const enable=async session=>{sessions.add(session);await Promise.all(['Network.enable','Runtime.enable','Log.enable'].map(method=>send(method,{},session)));await send('Target.setAutoAttach',{autoAttach:true,waitForDebuggerOnStart:false,flatten:true},session);};
 socket.addEventListener('message',event=>{const m=JSON.parse(event.data),p=pending.get(m.id),a=active;
  if(p){pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}
  if(m.method==='Target.attachedToTarget')void enable(m.params.sessionId).catch(()=>{});
  if(m.method==='Target.detachedFromTarget')sessions.delete(m.params.sessionId);
  if(!a)return;
  if(m.method==='Runtime.exceptionThrown')a.errors.push(m.params.exceptionDetails);
  if(m.method==='Log.entryAdded')a.logs.push(m.params.entry);
  if(m.method==='Network.requestWillBeSent'){const r=m.params.request;requests.set(m.sessionId+':'+m.params.requestId,{url:r.url,run:a});if(r.url.startsWith('https://platform.twitter.com/embed/Tweet.html'))a.frameUrl=r.url;if(r.url.includes('/i/jot/embeds'))a.telemetry.push(r.url);}
  if(m.method==='Network.responseReceived'){const r=m.params.response;if(/tweet-result|widgets.js|embed\/Tweet.html/.test(r.url))a.responses.push({url:r.url,status:r.status,mimeType:r.mimeType,headers:Object.fromEntries(Object.entries(r.headers).filter(([k])=>/^(content-type|access-control-allow-origin|x-response-time)$/i.test(k)))});}
  if(m.method==='Network.loadingFailed')a.failures.push({url:requests.get(m.sessionId+':'+m.params.requestId)?.url,...m.params});
  if(m.method==='Network.loadingFinished'){const r=requests.get(m.sessionId+':'+m.params.requestId);if(r?.url.includes('/tweet-result'))void send('Network.getResponseBody',{requestId:m.params.requestId},m.sessionId).then(b=>r.run.bodies.push({url:r.url,body:b.body.slice(0,3000),base64Encoded:b.base64Encoded})).catch(e=>r.run.bodies.push({url:r.url,error:String(e)}));}
 });
 const evaluate=async(s,expression)=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},s);if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 const results=[];
 for(const source of sources){
  const response=await fetch('https://publish.x.com/oembed?'+new URLSearchParams({url:source,omit_script:'true',dnt:'true',hide_thread:'true'}),{signal:AbortSignal.timeout(15000)}),metadata=await response.json();
  const postId=source.split('/').at(-1),shell=socialEmbed({source,projection:{status:'captured',embedId:postId}});
  let frameUrl;
  for(const mode of ['production-sandbox','provider-direct-control']){
   if(mode==='provider-direct-control'&&!frameUrl)continue;
   const run={source,mode,metadataStatus:response.status,author:metadata.author_name,responses:[],bodies:[],errors:[],logs:[],failures:[],telemetry:[],frames:[]};active=run;
   const {targetId}=await send('Target.createTarget',{url:'about:blank'}),{sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});await enable(sessionId);
   await send('Page.navigate',{url:mode==='production-sandbox'?`http://127.0.0.1:${server.address().port}`:frameUrl},sessionId);
   if(mode==='production-sandbox'){
    await evaluate(sessionId,`(async()=>{while(!document.getElementById('host'))await new Promise(r=>setTimeout(r,20));const f=document.createElement('iframe');f.sandbox='allow-scripts';f.referrerPolicy='no-referrer';f.width='600';f.height='440';f.srcdoc=${JSON.stringify(shell)};document.getElementById('host').append(f);})()`);
   }
   await new Promise(r=>setTimeout(r,20000));
   for(const s of sessions){try{const value=await evaluate(s,'({url:location.href,text:document.body?.innerText?.slice(0,1500),frames:[...document.querySelectorAll("iframe")].map(f=>({src:f.src,sandbox:f.getAttribute("sandbox")}))})');run.frames.push(value);}catch{}}
   frameUrl=run.frameUrl??frameUrl;results.push(run);console.error('Completed '+mode+' '+source+' '+JSON.stringify(run.bodies));
   await send('Target.closeTarget',{targetId});active=undefined;
  }
 }
 console.log(JSON.stringify({date:new Date().toISOString(),browser:await send('Browser.getVersion'),results},null,2));
}finally{socket?.close();chrome.kill();await new Promise(r=>server.close(r));await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
