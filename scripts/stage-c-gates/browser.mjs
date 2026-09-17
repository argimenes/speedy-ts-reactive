import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Dedicated temporary Chromium profile; never connects to the user's browser. */
export async function isolatedBrowser() {
  const diagnostics = { stderr: "", crashes: [] };
  const profile = await mkdtemp(join(tmpdir(), 'codex-stage-c-browser-')); let active;
  async function launch() {
    const child = spawn(process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
      '--headless=new', '--enable-precise-memory-info', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank',
    ], { detached: true, stdio: ['ignore', 'ignore', 'pipe'] });
    active = { child };
    const endpoint = await new Promise((resolve, reject) => {
      let output = ''; const timer = setTimeout(() => reject(new Error('Chrome startup timeout')), 15000);
      child.stderr.on('data', bytes => { diagnostics.stderr = (diagnostics.stderr + bytes).slice(-65536); output += bytes; const match = output.match(/DevTools listening on (ws:\/\/\S+)/); if (match) { clearTimeout(timer); resolve(match[1]); } });
      child.once('error', error => { clearTimeout(timer); reject(error); });
    });
    const socket = new WebSocket(endpoint); active.socket = socket;
    await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
    const pending = new Map(); let sequence = 0;
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (/crashed/i.test(message.method ?? '')) diagnostics.crashes.push(message);
      const task = pending.get(message.id); if (!task) return;
      pending.delete(message.id); clearTimeout(task.timer);
      if (message.error) task.reject(new Error(JSON.stringify(message.error))); else task.resolve(message.result);
    });
    const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
      const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 30000);
      pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
    const version = await send('Browser.getVersion'), { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const evaluate = async expression => {
      const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails)); return result.result.value;
    };
    return { version, evaluate, async navigate(url) {
      await send('Page.navigate', { url }, sessionId);
      for (let i = 0; i < 100; i++) { if (await evaluate('location.origin') === new URL(url).origin) return; await new Promise(resolve => setTimeout(resolve, 20)); }
      throw new Error('Navigation timeout');
    } };
  }
  async function kill() {
    if (!active) return; const { child, socket } = active; active = undefined; socket?.close();
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = new Promise(resolve => child.once('exit', resolve)); process.kill(-child.pid, 'SIGKILL'); await exited;
  }
  return { launch, kill, diagnostics, async close() { await kill(); await rm(profile, { recursive: true, force: true }); } };
}
