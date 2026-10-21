// Finite browser interaction checks, not a benchmark or load test.
// Owns and cleans up its Vite server, Chrome process and temporary profile.
import { createServer } from 'vite';
import solidPlugin from 'vite-plugin-solid';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const milestone=process.argv.includes('--reconstruction-proof')?'reconstruction-proof':process.argv.includes('--e13')?'e13':process.argv.includes('--e12')?'e12':process.argv.includes('--e11')?'e11':process.argv.includes('--d1-persistence')?'d1-persistence':process.argv.includes('--d1')?'d1':process.argv.includes('--c-persistence')?'c-persistence':process.argv.includes('--c')?'c':process.argv.includes('--d0')?'d0':process.argv.includes('--b')?'b':process.argv.includes('--a1')?'a1':'a0';
const profile = await mkdtemp(path.join(tmpdir(), `mutable-${milestone}-`));
let server, chrome, socket;
const interactions = new Set();
try {
  server = await createServer({ configFile: false, plugins: [solidPlugin(), {
    name: 'mwm-isolated-fixture',
    configureServer(server) { server.middlewares.use((req, res, next) => {
    if (req.url === '/__mwm_a0') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html><head><title>A0 qualification</title></head><body></body></html>'); }
    else if (req.url?.startsWith('/api/')) { res.statusCode = 503; res.end('Qualification has no backend'); }
    else next();
    }); },
  }], server: { host: '127.0.0.1', port: 0, open: false, proxy: {} } });
  await server.listen();
  const port = server.httpServer.address().port;
  chrome = spawn(process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ['--headless=new', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank']);
  const endpoint = await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(Error('Chrome startup timed out')), 15000);
    chrome.once('error', error => { clearTimeout(timer); reject(error); });
    chrome.stderr.on('data', data => { output += data; const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/); if (match) { clearTimeout(timer); resolve(match[1]); } });
  });
  socket = new WebSocket(endpoint);
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
  let id = 0;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const value = JSON.parse(event.data), entry = pending.get(value.id);
    if (entry) { pending.delete(value.id); clearTimeout(entry.timer); value.error ? entry.reject(Error(JSON.stringify(value.error))) : entry.resolve(value.result); }
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const requestId = ++id, timer = setTimeout(() => { pending.delete(requestId); reject(Error('CDP timeout: ' + method)); }, 45000);
    pending.set(requestId, { resolve, reject, timer });
    socket.send(JSON.stringify({ id: requestId, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
  await send('Runtime.enable',{},sessionId);
  socket.addEventListener('message',event=>{const m=JSON.parse(event.data);if(process.env.MWM_TRACE&&m.method==='Runtime.consoleAPICalled')console.error(m.params.args.map(a=>a.value??a.description).join(' '));});
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/__mwm_a0` }, sessionId);
  await new Promise(resolve => setTimeout(resolve, 250));
  if(milestone!=='a0') {
    await send('Runtime.addBinding',{name:'mwmInput'},sessionId);
    socket.addEventListener('message',event=>{
      const message=JSON.parse(event.data);if(message.method!=='Runtime.bindingCalled'||message.params.name!=='mwmInput')return;
      const task=(async()=>{
      const action=JSON.parse(message.params.payload);let result;
      try {
        if(action.type==='text')await send('Input.insertText',{text:action.text},sessionId);
        if(action.type==='click') {
          await send('Input.dispatchMouseEvent',{type:'mousePressed',x:action.x,y:action.y,button:'left',clickCount:1},sessionId);
          await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:action.x,y:action.y,button:'left',clickCount:1},sessionId);
        }
        if(action.type==='viewport')await send('Emulation.setDeviceMetricsOverride',{width:action.width,height:action.height,deviceScaleFactor:action.deviceScaleFactor??1,mobile:false},sessionId);
        if(action.type==='browserZoom') {
          const tab=await send('Target.createTarget',{url:'chrome://settings/appearance'});
          const attached=await send('Target.attachToTarget',{targetId:tab.targetId,flatten:true});
          await new Promise(resolve=>setTimeout(resolve,300));
          const zoom=await send('Runtime.evaluate',{expression:`new Promise((resolve,reject)=>chrome.settingsPrivate.setDefaultZoom(${action.scale},()=>chrome.runtime.lastError?reject(Error(chrome.runtime.lastError.message)):resolve(true)))`,awaitPromise:true,returnByValue:true},attached.sessionId);
          await send('Target.closeTarget',{targetId:tab.targetId});
          if(zoom.exceptionDetails)throw Error(JSON.stringify(zoom.exceptionDetails));
        }
        if(action.type==='zoom')await send('Emulation.setPageScaleFactor',{pageScaleFactor:action.scale},sessionId);
        if(action.type==='pointer')await send('Input.dispatchMouseEvent',{type:action.event,x:action.x,y:action.y,button:'left',buttons:action.event==='mouseReleased'?0:1,clickCount:1},sessionId);
        if(action.type==='blur') {
          const tab=await send('Target.createTarget',{url:'about:blank'});const attached=await send('Target.attachToTarget',{targetId:tab.targetId,flatten:true});
          await send('Page.bringToFront',{},attached.sessionId);await new Promise(resolve=>setTimeout(resolve,100));
          await send('Page.bringToFront',{},sessionId);await send('Target.closeTarget',{targetId:tab.targetId});
        }
        if(action.type==='touch')await send('Input.dispatchTouchEvent',{type:action.event,touchPoints:action.event==='touchEnd'||action.event==='touchCancel'?[]:[{x:action.x,y:action.y}]},sessionId);
        if(action.type==='key')for(const type of ['keyDown','keyUp'])await send('Input.dispatchKeyEvent',{type,key:action.key,code:action.key,...(type==='keyDown'&&action.key==='Enter'?{text:'\r'}:{}),modifiers:action.modifiers??0,windowsVirtualKeyCode:({Tab:9,Escape:27,Enter:13,ArrowLeft:37,ArrowUp:38,ArrowRight:39,ArrowDown:40})[action.key]??0},sessionId);
        if(action.type==='accessibility')result=(await send('Accessibility.getFullAXTree',{},sessionId)).nodes.filter(n=>!n.ignored).map(n=>({role:n.role?.value,name:n.name?.value,properties:n.properties}));
        await send('Runtime.evaluate',{expression:`globalThis.__mwmResume(${JSON.stringify({result})})`},sessionId);
      } catch(error) { await send('Runtime.evaluate',{expression:`globalThis.__mwmResume(${JSON.stringify({error:String(error)})})`},sessionId); }
      })();interactions.add(task);void task.then(()=>interactions.delete(task),()=>interactions.delete(task));
    });
  }
  const result = await send('Runtime.evaluate', {
    expression: `(async()=>{const m=await import('${milestone==='reconstruction-proof'?'/scripts/e1-reconstruction/browser-fixture.tsx':'/src/application/window-manager'+(milestone==='a0'?'':'-'+milestone)+'.browser-fixture.tsx'}');return m.qualifyWindowManager();})()`,
    awaitPromise: true, returnByValue: true,
  }, sessionId);
  // The last input resume can complete the fixture before its own CDP reply.
  // Drain those replies before closing Chrome so no timer/rejected task survives.
  await Promise.all([...interactions]);
  if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
  console.log(JSON.stringify(result.result.value, null, 2));
} finally {
  socket?.close();
  if (chrome && chrome.exitCode === null) {
    const exited = new Promise(resolve => chrome.once('exit', resolve));
    chrome.kill('SIGTERM');
    const force = setTimeout(() => chrome.kill('SIGKILL'), 3000);
    await exited; clearTimeout(force);
  }
  await server?.close();
  await rm(profile, { recursive: true, force: true, maxRetries:5, retryDelay:200 });
}
