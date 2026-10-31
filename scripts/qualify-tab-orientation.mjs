// Finite browser interaction checks and instrumented orientation timings.
// Owns and cleans up its Vite server, Chrome process and temporary profile.
import { createServer } from 'vite';
import solidPlugin from 'vite-plugin-solid';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const commandQualification = process.env.QUALIFY_TAB_COMMANDS === '1';
const milestone = commandQualification ? 'tab-commands' : 'vertical-tabs';
const artifactDirectory = path.resolve('artifacts/'+milestone);
await mkdir(artifactDirectory, { recursive: true });
const profile = await mkdtemp(path.join(tmpdir(), `mutable-${milestone}-`));
let server, chrome, socket;
const interactions = new Set();
try {
  server = await createServer({ configFile: false, cacheDir: 'node_modules/.vite-tab-orientation', plugins: [solidPlugin(), {
    name: 'tab-orientation-isolated-fixture',
    configureServer(server) { server.middlewares.use((req, res, next) => {
    if (req.url === '/__tab_orientation') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html><head><title>Tab orientation qualification</title></head><body></body></html>'); }
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
    const requestId = ++id, timer = setTimeout(() => { pending.delete(requestId); reject(Error('CDP timeout: ' + method)); }, 120000);
    pending.set(requestId, { resolve, reject, timer });
    socket.send(JSON.stringify({ id: requestId, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
  await send('Runtime.enable',{},sessionId);
  socket.addEventListener('message',event=>{const m=JSON.parse(event.data);if(process.env.TAB_ORIENTATION_TRACE&&m.method==='Runtime.consoleAPICalled')console.error(m.params.args.map(a=>a.value??a.description).join(' '));});
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/__tab_orientation` }, sessionId);
  await new Promise(resolve => setTimeout(resolve, 250));
  if(milestone!=='a0') {
    await send('Runtime.addBinding',{name:'tabsInput'},sessionId);
    socket.addEventListener('message',event=>{
      const message=JSON.parse(event.data);if(message.method!=='Runtime.bindingCalled'||message.params.name!=='tabsInput')return;
      const task=(async()=>{
      const action=JSON.parse(message.params.payload);let result;
      try {
        if(action.type==='composition')await send('Input.imeSetComposition',{text:action.text,selectionStart:action.text.length,selectionEnd:action.text.length},sessionId);
        if(action.type==='text')await send('Input.insertText',{text:action.text},sessionId);
        if(action.type==='screenshot') {
          const shot=await send('Page.captureScreenshot',{format:'png'},sessionId);
          await writeFile(path.join(artifactDirectory,action.name+'.png'),Buffer.from(shot.data,'base64'));
        }
        if(action.type==='fixture')await writeFile(path.join(artifactDirectory,'typing-fixture.mutable.json'),action.text);
        if(action.type==='click') {
          if(action.double) {
            await send('Input.dispatchMouseEvent',{type:'mousePressed',x:action.x,y:action.y,button:action.button??'left',clickCount:1},sessionId);
            await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:action.x,y:action.y,button:action.button??'left',clickCount:1},sessionId);
          }
          await send('Input.dispatchMouseEvent',{type:'mousePressed',x:action.x,y:action.y,button:action.button??'left',clickCount:action.double?2:1},sessionId);
          await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:action.x,y:action.y,button:action.button??'left',clickCount:action.double?2:1},sessionId);
        }
        if(action.type==='drag') {
          await send('Input.dispatchMouseEvent',{type:'mousePressed',...action.from,button:action.button??'left',clickCount:1},sessionId);
          await send('Input.dispatchMouseEvent',{type:'mouseMoved',...action.to,button:'left',buttons:1},sessionId);
          await send('Input.dispatchMouseEvent',{type:'mouseReleased',...action.to,button:action.button??'left',clickCount:1},sessionId);
        }
        if(action.type==='viewport')await send('Emulation.setDeviceMetricsOverride',{width:action.width,height:action.height,deviceScaleFactor:action.deviceScaleFactor??1,mobile:false},sessionId);
        if(action.type==='key')for(const type of ['keyDown','keyUp'])await send('Input.dispatchKeyEvent',{type,key:action.key,code:action.key,...(type==='keyDown'&&action.key==='Enter'?{text:'\r'}:{}),modifiers:action.modifiers??0,windowsVirtualKeyCode:({Tab:9,Escape:27,Enter:13,ArrowLeft:37,ArrowUp:38,ArrowRight:39,ArrowDown:40})[action.key]??0},sessionId);
        if(action.type==='accessibility')result=(await send('Accessibility.getFullAXTree',{},sessionId)).nodes.filter(n=>!n.ignored).map(n=>({role:n.role?.value,name:n.name?.value,properties:n.properties}));
        await send('Runtime.evaluate',{expression:`globalThis.__tabsResume(${JSON.stringify({result})})`},sessionId);
      } catch(error) { await send('Runtime.evaluate',{expression:`globalThis.__tabsResume(${JSON.stringify({error:String(error)})})`},sessionId); }
      })();interactions.add(task);void task.then(()=>interactions.delete(task),()=>interactions.delete(task));
    });
  }
  const result = await send('Runtime.evaluate', {
    expression: commandQualification ? `(async()=>{const m=await import('/src/application/tab-commands.browser-fixture.tsx');return m.qualifyTabCommands();})()` : `(async()=>{const m=await import('/src/application/tab-orientation.browser-fixture.tsx');return m.qualifyTabOrientation();})()`,
    awaitPromise: true, returnByValue: true,
  }, sessionId);
  // The last input resume can complete the fixture before its own CDP reply.
  // Drain those replies before closing Chrome so no timer/rejected task survives.
  await Promise.all([...interactions]);
  if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
  await writeFile(path.join(artifactDirectory,'qualification.json'),JSON.stringify(result.result.value,null,2)+'\n');
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
