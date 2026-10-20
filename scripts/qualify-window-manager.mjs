// Finite browser interaction checks, not a benchmark or load test.
// Owns and cleans up its Vite server, Chrome process and temporary profile.
import { createServer } from 'vite';
import solidPlugin from 'vite-plugin-solid';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const profile = await mkdtemp(path.join(tmpdir(), 'mutable-a0-'));
let server, chrome, socket;
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
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/__mwm_a0` }, sessionId);
  await new Promise(resolve => setTimeout(resolve, 250));
  const result = await send('Runtime.evaluate', {
    expression: `(async()=>{const m=await import('/src/application/window-manager.browser-fixture.tsx');return m.qualifyWindowManager();})()`,
    awaitPromise: true, returnByValue: true,
  }, sessionId);
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
  await rm(profile, { recursive: true, force: true });
}
